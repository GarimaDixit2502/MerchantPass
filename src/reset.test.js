import { initDb, resetDemoData } from './db.js';
import { recordAuditEvent, getAuditEvents } from './audit/index.js';

describe('Demo Polish & Reset Demo Data Endpoint', () => {
  beforeAll(async () => {
    await initDb();
  });

  test('resetDemoData clears audit events and reseeds catalog products', async () => {
    // Record a test event first
    await recordAuditEvent({
      merchant_id: 'merchant_001',
      buyer_agent_id: 'test-agent',
      protocol: 'ACP',
      sku: 'SKU-001',
      qty: 1,
      declared_total_inr: 899,
      decision: 'approved',
      matched_rule: 'auto_approve'
    });

    const beforeEvents = await getAuditEvents('merchant_001', 10);
    expect(beforeEvents.length).toBeGreaterThan(0);

    // Perform reset
    const result = await resetDemoData();
    expect(result.status).toBe('success');

    const afterEvents = await getAuditEvents('merchant_001', 10);
    expect(afterEvents.length).toBe(0);
  });
});
