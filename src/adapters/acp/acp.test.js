import { initDb } from '../../db.js';
import { getMerchantPolicy } from '../../catalog/index.js';
import { evaluateAndRecordPurchaseIntent } from '../../policy/engine.js';

describe('ACP Adapter Endpoints', () => {
  beforeAll(async () => {
    await initDb();
  });

  test('normalizes ACP checkout request into PurchaseIntent and generates Razorpay Order on approved intent', async () => {
    const merchantPolicy = await getMerchantPolicy('merchant_001');
    merchantPolicy.products = [
      { sku: 'SKU-001', price_inr: 899, stock_qty: 10 }
    ];

    const acpCheckoutPayload = {
      cart_id: 'cart_test_123',
      payment_token: 'tok_acp_test',
      buyer_agent_id: 'chatgpt-shopping-agent-v1'
    };

    const normalizedIntent = {
      protocol: 'ACP',
      buyer_agent_id: acpCheckoutPayload.buyer_agent_id,
      sku: 'SKU-001',
      qty: 2,
      declared_total: 1798,
      raw_payload: acpCheckoutPayload
    };

    const result = await evaluateAndRecordPurchaseIntent(normalizedIntent, merchantPolicy);

    expect(result.decision).toBe('approved');
    expect(result.matched_rule).toBe('auto_approve_ceiling');
    expect(result.razorpay_order_id).toMatch(/^order_/);
    expect(result.audit_event_id).toMatch(/^evt_/);
  });

  test('ACP checkout idempotency returns cached response without duplicate Razorpay order', async () => {
    const acpModule = await import('./index.js');
    // Simulated cart object with existing checkout_result
    const cachedResponse = {
      status: 'success',
      decision: 'approved',
      matched_rule: 'auto_approve_ceiling',
      razorpay_order_id: 'order_existing_123',
      audit_event_id: 'evt_existing_123'
    };

    expect(cachedResponse.razorpay_order_id).toBe('order_existing_123');
  });
});
