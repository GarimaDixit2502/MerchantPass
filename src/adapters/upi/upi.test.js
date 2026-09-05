import { initDb } from '../../db.js';
import { getMerchantPolicy } from '../../catalog/index.js';
import { evaluateAndRecordPurchaseIntent } from '../../policy/engine.js';

describe('UPI-Native Adapter', () => {
  beforeAll(async () => {
    await initDb();
  });

  test('normalizes UPI purchase intent and executes PIN-free payment on approved consent', async () => {
    const merchantPolicy = await getMerchantPolicy('merchant_001');
    merchantPolicy.products = [
      { sku: 'SKU-001', price_inr: 899, stock_qty: 10 }
    ];

    const upiIntent = {
      protocol: 'UPI_NATIVE',
      buyer_agent_id: 'claude-shopping-agent-v1',
      sku: 'SKU-001',
      qty: 2,
      declared_total: 1798,
      raw_payload: { consent_id: 'upi_cst_test_123', consent_cap: 4000 }
    };

    const result = await evaluateAndRecordPurchaseIntent(upiIntent, merchantPolicy);

    expect(result.decision).toBe('approved');
    expect(result.matched_rule).toBe('auto_approve_ceiling');
    expect(result.razorpay_order_id).toMatch(/^order_/);
  });
});
