import express from 'express';
import crypto from 'crypto';
import { getProductBySku } from '../../catalog/index.js';

const router = express.Router();

/**
 * GET /ap2/preview/:sku
 * Mock preview of Google/FIDO Agent Payments Protocol (AP2 v0.2.0) Verifiable Mandates Chain
 */
router.get('/ap2/preview/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const merchantId = req.query.merchant_id || 'merchant_001';

    const product = await getProductBySku(sku, merchantId);
    if (!product) {
      return res.status(404).json({ error: `Product SKU '${sku}' not found` });
    }

    const intentHash = 'sha256:' + crypto.createHash('sha256').update(`${product.sku}-${product.price_inr}-ap2`).digest('hex');

    res.json({
      protocol: 'AP2 (Agent Payments Protocol v0.2.0)',
      preview: true,
      note: "Preview — shows what this merchant's catalog looks like under AP2 W3C Verifiable Mandates without a live integration",
      sku: product.sku,
      title: product.title,
      price_inr: product.price_inr,
      intent_mandate: {
        type: 'IntentMandate',
        scope: `purchase ${product.sku} qty<=2, total<=₹${Math.ceil(product.price_inr * 2)}`,
        issuer: 'buyer_agent_ap2_mock',
        signature: 'MOCK_VERIFIABLE_CREDENTIAL_SIGNATURE_DO_NOT_TRUST'
      },
      cart_mandate: {
        type: 'CartMandate',
        sku: product.sku,
        qty: 1,
        total_inr: product.price_inr,
        matched_intent: true
      },
      payment_mandate: {
        type: 'PaymentMandate',
        authorized_amount_inr: product.price_inr,
        funding_instrument_ref: 'MOCK_AP2_DELEGATED_TOKEN',
        intent_cart_hash: intentHash
      }
    });
  } catch (err) {
    console.error('Error generating AP2 preview:', err);
    res.status(500).json({ error: 'Failed to generate AP2 preview' });
  }
});

/**
 * GET /x402/preview/:sku
 * Mock preview of Coinbase + Cloudflare x402 HTTP 402 "Payment Required" headers
 */
router.get('/x402/preview/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const merchantId = req.query.merchant_id || 'merchant_001';

    const product = await getProductBySku(sku, merchantId);
    if (!product) {
      return res.status(404).json({ error: `Product SKU '${sku}' not found` });
    }

    // Convert INR to USDC equivalent (e.g. 1 USD ~ 83.3 INR)
    const amountUsdc = (product.price_inr / 83.3).toFixed(2);
    const payToWallet = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';

    const paymentRequirementObject = {
      scheme: 'exact',
      network: 'base',
      asset: 'USDC',
      amount: amountUsdc,
      payTo: payToWallet,
      resource: `/x402/purchase/${product.sku}`
    };

    res.json({
      protocol: 'x402 (Coinbase/Cloudflare HTTP 402)',
      preview: true,
      note: "Preview — shows what this merchant's catalog looks like under x402 HTTP 402 response headers without a live integration",
      sku: product.sku,
      title: product.title,
      price_inr: product.price_inr,
      status_code: 402,
      status_text: 'Payment Required',
      headers: {
        'HTTP/1.1': '402 Payment Required',
        'PAYMENT-REQUIRED': JSON.stringify(paymentRequirementObject)
      },
      parsed_payment_requirements: {
        ...paymentRequirementObject,
        amount_inr: product.price_inr
      }
    });
  } catch (err) {
    console.error('Error generating x402 preview:', err);
    res.status(500).json({ error: 'Failed to generate x402 preview' });
  }
});

export default router;
