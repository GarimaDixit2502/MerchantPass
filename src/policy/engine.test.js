import { evaluatePurchaseIntent } from './engine.js';

describe('Policy Engine - evaluatePurchaseIntent', () => {
  const samplePolicy = {
    auto_approve_ceiling_inr: 3000,
    human_approval_ceiling_inr: 5000,
    blocked_skus: ['SKU-BLOCKED-001'],
    allowed_buyer_agent_ids: ['chatgpt-shopping-v1', 'claude-shopping-v1'],
    products: [
      {
        sku: 'SKU-001',
        title: 'Organic Basmati Rice 5kg',
        price_inr: 899,
        stock_qty: 42
      },
      {
        sku: 'SKU-LOW-STOCK',
        title: 'Limited Stock Item',
        price_inr: 500,
        stock_qty: 1
      }
    ]
  };

  test('1. Auto-Approve when order total is below auto-approve ceiling', () => {
    const intent = {
      sku: 'SKU-001',
      qty: 2,
      buyer_agent_id: 'chatgpt-shopping-v1',
      protocol: 'ACP',
      declared_total: 1798
    };

    const result = evaluatePurchaseIntent(intent, samplePolicy);
    expect(result.decision).toBe('approved');
    expect(result.matched_rule).toBe('auto_approve_ceiling');
    expect(result.reason).toContain('within auto-approve ceiling');
  });

  test('2. Escalate to human approval when order total exceeds auto-approve ceiling (e.g. ₹10,000)', () => {
    const intent = {
      sku: 'SKU-001',
      qty: 12,
      buyer_agent_id: 'claude-shopping-v1',
      protocol: 'UPI_NATIVE',
      declared_total: 10788
    };

    const result = evaluatePurchaseIntent(intent, samplePolicy);
    expect(result.decision).toBe('escalated');
    expect(result.matched_rule).toBe('human_approval_escalation');
    expect(result.reason).toContain('exceeds auto-approve ceiling');
  });

  test('3. Reject when SKU is in merchant blocked list', () => {
    const intent = {
      sku: 'SKU-BLOCKED-001',
      qty: 1,
      buyer_agent_id: 'chatgpt-shopping-v1',
      protocol: 'ACP',
      declared_total: 1000
    };

    const context = {
      product: { sku: 'SKU-BLOCKED-001', stock_qty: 10, price_inr: 1000 }
    };

    const result = evaluatePurchaseIntent(intent, samplePolicy, context);
    expect(result.decision).toBe('rejected');
    expect(result.matched_rule).toBe('sku_block_list');
    expect(result.reason).toContain('explicitly blocked');
  });

  test('4. Reject when buyer agent is unknown / not on allowed list', () => {
    const intent = {
      sku: 'SKU-001',
      qty: 1,
      buyer_agent_id: 'unauthorized-rogue-agent',
      protocol: 'ACP',
      declared_total: 899
    };

    const result = evaluatePurchaseIntent(intent, samplePolicy);
    expect(result.decision).toBe('rejected');
    expect(result.matched_rule).toBe('agent_identity_allowed_list');
    expect(result.reason).toContain('not in merchant\'s allowed agents list');
  });

  test('5. Reject when requested quantity exceeds available stock', () => {
    const intent = {
      sku: 'SKU-LOW-STOCK',
      qty: 5,
      buyer_agent_id: 'chatgpt-shopping-v1',
      protocol: 'ACP',
      declared_total: 2500
    };

    const result = evaluatePurchaseIntent(intent, samplePolicy);
    expect(result.decision).toBe('rejected');
    expect(result.matched_rule).toBe('sku_stock');
    expect(result.reason).toContain('Insufficient stock');
  });

  test('6. Reject on velocity check edge case (max purchases in 1 hour reached)', () => {
    const intent = {
      sku: 'SKU-001',
      qty: 1,
      buyer_agent_id: 'chatgpt-shopping-v1',
      protocol: 'ACP',
      declared_total: 899
    };

    const context = {
      recent_orders_count_1h: 5,
      max_velocity_1h: 5
    };

    const result = evaluatePurchaseIntent(intent, samplePolicy, context);
    expect(result.decision).toBe('rejected');
    expect(result.matched_rule).toBe('velocity_limit');
    expect(result.reason).toContain('Velocity limit exceeded');
  });

  test('7. Security Violation: Reject lowball client price tampering attempt', () => {
    const intent = {
      sku: 'SKU-001', // Catalog price is ₹899
      qty: 1,
      buyer_agent_id: 'chatgpt-shopping-v1',
      protocol: 'ACP',
      declared_total: 10 // Forged lowball claim!
    };

    const result = evaluatePurchaseIntent(intent, samplePolicy);
    expect(result.decision).toBe('rejected');
    expect(result.matched_rule).toBe('price_tampering_detected');
    expect(result.reason).toContain('Price tampering attempt blocked');
    expect(result.computed_total_inr).toBe(899);
  });

  test('8. Price Integrity: Client overstates price (claimed > computed) -> server evaluates server-computed price (₹899) and auto-approves', () => {
    const intent = {
      sku: 'SKU-001', // Catalog price is ₹899
      qty: 1,
      buyer_agent_id: 'chatgpt-shopping-v1',
      protocol: 'ACP',
      declared_total: 99999 // Client overstates claim
    };

    const result = evaluatePurchaseIntent(intent, samplePolicy);
    expect(result.decision).toBe('approved');
    expect(result.matched_rule).toBe('auto_approve_ceiling');
    expect(result.computed_total_inr).toBe(899);
  });
});
