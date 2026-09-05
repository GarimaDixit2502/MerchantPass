import express from 'express';
import crypto from 'crypto';
import { dbGet, dbRun, dbQuery } from '../../db.js';
import { getProductBySku, getMerchantPolicy, getProducts } from '../../catalog/index.js';
import { evaluateAndRecordPurchaseIntent } from '../../policy/engine.js';
import { recordAuditEvent } from '../../audit/index.js';

const router = express.Router();

/**
 * POST /upi/consent
 * One-time consent registration (NPCI + Razorpay UPI Circle agent payment pattern)
 * Accepts: { buyer_agent_id, merchant_id, spending_cap_inr }
 */
router.post('/consent', async (req, res) => {
  try {
    const {
      buyer_agent_id = 'claude-shopping-agent-v1',
      merchant_id = 'merchant_001',
      spending_cap_inr = 4000
    } = req.body;

    if (!buyer_agent_id || !spending_cap_inr) {
      return res.status(400).json({ error: 'buyer_agent_id and spending_cap_inr are required' });
    }

    const consent_id = `upi_cst_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const created_at = new Date().toISOString();

    await dbRun(
      `INSERT INTO upi_consents (consent_id, buyer_agent_id, merchant_id, spending_cap_inr, status, created_at)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [consent_id, buyer_agent_id, merchant_id, Number(spending_cap_inr), created_at]
    );

    res.status(201).json({
      consent_id,
      buyer_agent_id,
      merchant_id,
      spending_cap_inr: Number(spending_cap_inr),
      status: 'active',
      created_at,
      message: 'UPI-Native one-time consent registered successfully'
    });
  } catch (err) {
    console.error('Error registering UPI consent:', err);
    res.status(500).json({ error: 'Failed to register UPI consent' });
  }
});

// In-memory idempotency store for UPI purchases (key -> result)
const upiIdempotencyStore = new Map();

/**
 * POST /upi/purchase
 * Executes purchase under delegated consent without per-tx PIN/OTP
 * Accepts: { consent_id, sku, qty, idempotency_key }
 */
router.post('/purchase', async (req, res) => {
  try {
    const { consent_id, sku, qty = 1, idempotency_key } = req.body;

    if (!consent_id || !sku) {
      return res.status(400).json({ error: 'consent_id and sku are required' });
    }

    // Idempotency Check: If idempotency_key provided and already processed, return existing result
    const idKey = idempotency_key || `upi_${consent_id}_${sku}_${qty}`;
    if (idempotency_key && upiIdempotencyStore.has(idKey)) {
      const cached = upiIdempotencyStore.get(idKey);
      return res.json({
        ...cached,
        idempotent_replay: true,
        message: 'UPI purchase already processed for this idempotency_key (Idempotent response).'
      });
    }

    // Look up consent from SQLite
    const consent = await dbGet(`SELECT * FROM upi_consents WHERE consent_id = ?`, [consent_id]);
    if (!consent) {
      return res.status(404).json({ error: `UPI consent '${consent_id}' not found` });
    }

    if (consent.status !== 'active') {
      return res.status(400).json({ error: `UPI consent '${consent_id}' is inactive` });
    }

    // Fetch product details
    const product = await getProductBySku(sku, consent.merchant_id);
    if (!product) {
      return res.status(404).json({ error: `Product SKU '${sku}' not found` });
    }

    const purchaseQty = Number(qty);
    const declared_total_inr = product.price_inr * purchaseQty;

    // Check against registered UPI consent spending cap
    if (declared_total_inr > consent.spending_cap_inr) {
      const reason = `Purchase amount (₹${declared_total_inr}) exceeds registered UPI consent spending cap (₹${consent.spending_cap_inr})`;

      const auditLog = await recordAuditEvent({
        merchant_id: consent.merchant_id,
        buyer_agent_id: consent.buyer_agent_id,
        protocol: 'UPI_NATIVE',
        sku: product.sku,
        qty: purchaseQty,
        declared_total_inr,
        decision: 'rejected',
        matched_rule: 'upi_consent_spending_cap_exceeded',
        reason,
        trace: [
          { check: 'UPI Spending Cap', status: 'fail', details: `Declared ₹${declared_total_inr} exceeds consent cap ₹${consent.spending_cap_inr}` }
        ]
      });

      const upiResponse = {
        status: 'rejected',
        decision: 'rejected',
        matched_rule: 'upi_consent_spending_cap_exceeded',
        reason,
        consent_id,
        spending_cap_inr: consent.spending_cap_inr,
        audit_event_id: auditLog.event_id
      };

      if (idempotency_key) {
        upiIdempotencyStore.set(idempotency_key, upiResponse);
      }

      return res.status(422).json(upiResponse);
    }

    const merchantPolicy = await getMerchantPolicy(consent.merchant_id);
    const products = await getProducts(consent.merchant_id);
    merchantPolicy.products = products;

    // Normalize request into protocol-agnostic PurchaseIntent
    const purchaseIntent = {
      protocol: 'UPI_NATIVE',
      buyer_agent_id: consent.buyer_agent_id,
      sku: product.sku,
      qty: purchaseQty,
      declared_total: declared_total_inr,
      raw_payload: {
        consent_id,
        sku,
        qty: purchaseQty,
        consent_cap: consent.spending_cap_inr
      }
    };

    // Evaluate intent through Policy Engine & record audit log + Razorpay Order
    const policyResult = await evaluateAndRecordPurchaseIntent(purchaseIntent, merchantPolicy);

    let upiResponse;
    if (policyResult.decision === 'approved') {
      upiResponse = {
        status: 'success',
        decision: 'approved',
        matched_rule: policyResult.matched_rule,
        reason: policyResult.reason,
        consent_id,
        spending_cap_inr: consent.spending_cap_inr,
        razorpay_order_id: policyResult.razorpay_order_id,
        audit_event_id: policyResult.audit_event_id,
        order: policyResult.razorpay_order,
        message: 'UPI-Native consent purchase authorized without PIN/OTP'
      };
    } else if (policyResult.decision === 'escalated') {
      upiResponse = {
        status: 'pending_approval',
        decision: 'escalated',
        matched_rule: policyResult.matched_rule,
        reason: policyResult.reason,
        human_approval_link: policyResult.human_approval_link,
        audit_event_id: policyResult.audit_event_id,
        consent_id,
        message: 'Order exceeds merchant auto-approve threshold. Escalated for human merchant review.'
      };
    } else {
      upiResponse = {
        status: 'rejected',
        decision: 'rejected',
        matched_rule: policyResult.matched_rule,
        reason: policyResult.reason,
        audit_event_id: policyResult.audit_event_id
      };
    }

    if (idempotency_key) {
      upiIdempotencyStore.set(idempotency_key, upiResponse);
    }

    if (policyResult.decision === 'rejected') {
      return res.status(422).json(upiResponse);
    }
    return res.json(upiResponse);
  } catch (err) {
    console.error('Error executing UPI purchase:', err);
    res.status(500).json({ error: 'Failed to process UPI purchase' });
  }
});

/**
 * GET /upi/consents
 * List active consents for merchant dashboard
 */
router.get('/consents', async (req, res) => {
  try {
    const merchantId = req.query.merchant_id || 'merchant_001';
    const rows = await dbQuery(`SELECT * FROM upi_consents WHERE merchant_id = ? ORDER BY created_at DESC`, [merchantId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch UPI consents' });
  }
});

export default router;
