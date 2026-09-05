import { initDb } from '../db.js';
import evaluatePurchaseIntent from './engine.js';

describe('Policy Guardrails & Decision Trace Generation', () => {
  beforeAll(async () => {
    await initDb();
  });

  test('generates step-by-step decision trace array for purchase evaluation', () => {
    const intent = {
      sku: 'SKU-001',
      qty: 1,
      buyer_agent_id: 'chatgpt-shopping-agent-v1',
      declared_total: 899
    };

    const merchantPolicy = {
      auto_approve_ceiling_inr: 3000,
      human_approval_ceiling_inr: 5000,
      velocity_limit: 5,
      blocked_skus: [],
      allowed_buyer_agent_ids: ['*'],
      products: [{ sku: 'SKU-001', price_inr: 899, stock_qty: 10 }]
    };

    const result = evaluatePurchaseIntent(intent, merchantPolicy);
    expect(result.decision).toBe('approved');
    expect(Array.isArray(result.trace)).toBe(true);
    expect(result.trace.length).toBeGreaterThan(0);
    expect(result.trace[0].check).toBe('SKU Validity');
    expect(result.trace[0].status).toBe('pass');
  });
});
