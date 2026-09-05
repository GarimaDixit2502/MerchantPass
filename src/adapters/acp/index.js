import express from 'express';
import crypto from 'crypto';
import { getProducts, getMerchantPolicy } from '../../catalog/index.js';
import { evaluateAndRecordPurchaseIntent } from '../../policy/engine.js';

const router = express.Router();

// In-memory cart store (cart_id -> cartObject)
const cartStore = new Map();

/**
 * GET /acp/feed
 * ACP-compliant product feed representation of merchant catalog
 */
router.get('/feed', async (req, res) => {
  try {
    const merchantId = req.query.merchant_id || 'merchant_001';
    const products = await getProducts(merchantId);

    const acpFeed = products.map((p) => ({
      id: p.sku,
      title: p.title,
      description: p.description,
      price: {
        amount: p.price_inr,
        currency: p.currency || 'INR'
      },
      availability: p.stock_qty > 0 ? 'in_stock' : 'out_of_stock',
      stock_quantity: p.stock_qty,
      category: p.category,
      image_url: p.image_url,
      link: `http://localhost:3000/catalog/${p.sku}`
    }));

    res.json(acpFeed);
  } catch (err) {
    console.error('Error fetching ACP product feed:', err);
    res.status(500).json({ error: 'Failed to generate ACP feed' });
  }
});

/**
 * POST /acp/cart
 * Create ACP cart from items [{ sku, qty }]
 */
router.post('/cart', async (req, res) => {
  try {
    const { items = [], merchant_id = 'merchant_001' } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart must contain at least one item array [{ sku, qty }]' });
    }

    const allProducts = await getProducts(merchant_id);
    const cartItems = [];
    let subtotal_inr = 0;

    for (const item of items) {
      const product = allProducts.find((p) => p.sku === item.sku);
      if (!product) {
        return res.status(404).json({ error: `Product SKU '${item.sku}' not found` });
      }

      const qty = Number(item.qty || 1);
      const item_total = product.price_inr * qty;
      subtotal_inr += item_total;

      cartItems.push({
        sku: product.sku,
        title: product.title,
        price_inr: product.price_inr,
        qty,
        item_total_inr: item_total
      });
    }

    const cart_id = `cart_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const cartObject = {
      cart_id,
      merchant_id,
      items: cartItems,
      subtotal_inr,
      tax_inr: 0,
      total_inr: subtotal_inr,
      currency: 'INR',
      created_at: new Date().toISOString()
    };

    cartStore.set(cart_id, cartObject);

    res.status(201).json(cartObject);
  } catch (err) {
    console.error('Error creating ACP cart:', err);
    res.status(500).json({ error: 'Failed to create cart' });
  }
});

/**
 * POST /acp/checkout
 * ACP checkout execution with protocol normalization into PurchaseIntent & Policy Engine evaluation
 */
router.post('/checkout', async (req, res) => {
  try {
    const { cart_id, payment_token, buyer_agent_id = 'chatgpt-shopping-agent-v1' } = req.body;

    if (!cart_id) {
      return res.status(400).json({ error: 'cart_id is required' });
    }

    const cart = cartStore.get(cart_id);
    if (!cart) {
      return res.status(404).json({ error: `Cart '${cart_id}' not found` });
    }

    // Idempotency Protection: If cart has already been checked out, return existing result
    if (cart.checkout_result) {
      return res.json({
        ...cart.checkout_result,
        idempotent_replay: true,
        message: 'Order already processed for this cart_id (Idempotent response).'
      });
    }

    const merchantPolicy = await getMerchantPolicy(cart.merchant_id);
    const products = await getProducts(cart.merchant_id);
    merchantPolicy.products = products;

    // Normalize ACP request into unified PurchaseIntent shape
    const primaryItem = cart.items[0]; // Primary target SKU for policy rule evaluation
    const purchaseIntent = {
      protocol: 'ACP',
      buyer_agent_id,
      sku: primaryItem.sku,
      qty: primaryItem.qty,
      declared_total: req.body.declared_total !== undefined ? Number(req.body.declared_total) : cart.total_inr,
      raw_payload: {
        cart_id,
        payment_token,
        buyer_agent_id,
        items: cart.items
      }
    };

    // Evaluate intent through Policy Engine & record audit log + Razorpay Order
    const policyResult = await evaluateAndRecordPurchaseIntent(purchaseIntent, merchantPolicy);

    let checkoutResponse;
    if (policyResult.decision === 'approved') {
      checkoutResponse = {
        status: 'success',
        decision: 'approved',
        matched_rule: policyResult.matched_rule,
        reason: policyResult.reason,
        razorpay_order_id: policyResult.razorpay_order_id,
        audit_event_id: policyResult.audit_event_id,
        order: policyResult.razorpay_order,
        message: 'Order approved and created via Razorpay Orders API'
      };
    } else if (policyResult.decision === 'escalated') {
      checkoutResponse = {
        status: 'pending_approval',
        decision: 'escalated',
        matched_rule: policyResult.matched_rule,
        reason: policyResult.reason,
        human_approval_link: policyResult.human_approval_link,
        audit_event_id: policyResult.audit_event_id,
        message: 'Order total exceeds auto-approve ceiling. Escalated for human merchant approval.'
      };
    } else {
      checkoutResponse = {
        status: 'rejected',
        decision: 'rejected',
        matched_rule: policyResult.matched_rule,
        reason: policyResult.reason,
        audit_event_id: policyResult.audit_event_id
      };
    }

    // Save result for idempotency
    cart.checkout_result = checkoutResponse;
    cartStore.set(cart_id, cart);

    if (policyResult.decision === 'rejected') {
      return res.status(422).json(checkoutResponse);
    }
    return res.json(checkoutResponse);
  } catch (err) {
    console.error('Error executing ACP checkout:', err);
    res.status(500).json({ error: 'Failed to process ACP checkout' });
  }
});

/**
 * GET /acp/orders/:id
 * Retrieve order status for ACP client post-checkout tracking
 */
router.get('/orders/:id', async (req, res) => {
  try {
    const { getAuditEvents } = await import('../../audit/index.js');
    const events = await getAuditEvents('merchant_001', 100);
    const matched = events.find((e) => e.razorpay_order_id === req.params.id || e.event_id === req.params.id);

    if (!matched) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      order_id: matched.razorpay_order_id || matched.event_id,
      status: matched.decision === 'approved' ? 'paid' : matched.decision,
      protocol: matched.protocol,
      total_inr: matched.declared_total_inr,
      matched_rule: matched.matched_rule,
      timestamp: matched.timestamp
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order status' });
  }
});

export default router;
