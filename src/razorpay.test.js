import { initDb } from './db.js';
import { createRazorpayOrder } from './razorpay.js';
import { evaluateAndRecordPurchaseIntent } from './policy/engine.js';
import { getAuditEvents } from './audit/index.js';

describe('Razorpay Orders Integration', () => {
  beforeAll(async () => {
    await initDb();
  });

  test('createRazorpayOrder creates a valid order object with amount in paise', async () => {
    const order = await createRazorpayOrder(899, 'rcpt_test_001', { note: 'test' });
    expect(order).toBeDefined();
    expect(order.id).toMatch(/^order_/);
    expect(order.amount).toBe(89900); // ₹899 in paise
    expect(order.currency).toBe('INR');
    expect(order.status).toBe('created');
  });

  test('createAndCaptureTestPayment captures a test payment with status captured (simulated)', async () => {
    const { createAndCaptureTestPayment } = await import('./razorpay.js');
    const payment = await createAndCaptureTestPayment('order_test_123', 899, { note: 'test payment' });
    expect(payment).toBeDefined();
    expect(payment.id).toMatch(/^pay_sim_/);
    expect(payment.order_id).toBe('order_test_123');
    expect(payment.status).toBe('captured (simulated)');
    expect(payment.amount).toBe(89900);
  });

  test('evaluateAndRecordPurchaseIntent creates Razorpay Order in audit event on approved intent', async () => {
    const merchantPolicy = {
      merchant_id: 'merchant_001',
      auto_approve_ceiling_inr: 3000,
      human_approval_ceiling_inr: 5000,
      blocked_skus: [],
      allowed_buyer_agent_ids: ['*'],
      products: [{ sku: 'SKU-001', price_inr: 899, stock_qty: 10 }]
    };

    const intent = {
      sku: 'SKU-001',
      qty: 1,
      buyer_agent_id: 'test-buyer-agent',
      protocol: 'ACP',
      declared_total: 899
    };

    const response = await evaluateAndRecordPurchaseIntent(intent, merchantPolicy);

    expect(response.decision).toBe('approved');
    expect(response.razorpay_order_id).toBeDefined();
    expect(response.razorpay_order_id).toMatch(/^order_/);

    const auditEvents = await getAuditEvents('merchant_001', 5);
    const matchedEvent = auditEvents.find((e) => e.event_id === response.audit_event_id);
    expect(matchedEvent).toBeDefined();
    expect(matchedEvent.razorpay_order_id).toBe(response.razorpay_order_id);
    expect(matchedEvent.decision).toBe('approved');
  });
});

