import { initDb } from '../db.js';
import { recordAuditEvent, getAuditEvents } from './index.js';

describe('Audit Trail System', () => {
  beforeAll(async () => {
    await initDb();
  });

  test('records an audit event and retrieves sorted by timestamp DESC', async () => {
    const event1 = await recordAuditEvent({
      merchant_id: 'merchant_001',
      buyer_agent_id: 'chatgpt-shopping-agent-v1',
      protocol: 'ACP',
      sku: 'SKU-001',
      qty: 2,
      declared_total_inr: 1798,
      decision: 'approved',
      matched_rule: 'auto_approve_ceiling',
      reason: 'Within limit',
      razorpay_order_id: 'order_test_123',
      human_approval_link: null
    });

    expect(event1.event_id).toMatch(/^evt_/);
    expect(event1.decision).toBe('approved');

    const events = await getAuditEvents('merchant_001', 10);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].merchant_id).toBe('merchant_001');
    expect(new Date(events[0].timestamp).getTime()).toBeGreaterThanOrEqual(
      new Date(events[events.length - 1].timestamp).getTime()
    );
  });
});
