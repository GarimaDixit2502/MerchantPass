/**
 * Policy Engine - Evaluates protocol-normalized purchase intent against merchant policy
 * Pure function: evaluatePurchaseIntent(intent, merchantPolicy, context) -> { decision, reason, matched_rule, trace }
 * 
 * Decisions: "approved" | "escalated" | "rejected"
 */

export function evaluatePurchaseIntent(intent, merchantPolicy, context = {}) {
  const {
    sku,
    qty,
    buyer_agent_id,
    declared_total,
    signature_valid = true
  } = intent;

  const {
    auto_approve_ceiling_inr = 3000,
    human_approval_ceiling_inr = 5000,
    velocity_limit = 5,
    blocked_skus = [],
    allowed_buyer_agent_ids = ['*'],
    products = []
  } = merchantPolicy;

  const {
    product = products.find((p) => p.sku === sku),
    recent_orders_count_1h = 0,
    max_velocity_1h = velocity_limit
  } = context;

  const trace = [];

  // Check 1: SKU validity check
  if (!product) {
    trace.push({ check: 'SKU Validity', status: 'fail', details: `SKU '${sku}' not found in catalog` });
    return {
      decision: 'rejected',
      reason: `SKU '${sku}' not found in merchant catalog`,
      matched_rule: 'sku_validity',
      trace
    };
  }
  trace.push({ check: 'SKU Validity', status: 'pass', details: `SKU '${sku}' found in catalog` });

  // Edge input validation: negative or zero quantity
  if (qty <= 0 || !Number.isInteger(Number(qty))) {
    trace.push({ check: 'Stock Check', status: 'fail', details: `Invalid purchase quantity '${qty}'` });
    return {
      decision: 'rejected',
      reason: `Invalid purchase quantity '${qty}'. Quantity must be a positive integer.`,
      matched_rule: 'invalid_quantity',
      trace
    };
  }

  // Check 2: Stock Check
  if (product.stock_qty < qty) {
    trace.push({ check: 'Stock Check', status: 'fail', details: `Requested ${qty}, Available ${product.stock_qty}` });
    return {
      decision: 'rejected',
      reason: `Insufficient stock for SKU '${sku}'. Requested: ${qty}, Available: ${product.stock_qty}`,
      matched_rule: 'sku_stock',
      trace
    };
  }
  trace.push({ check: 'Stock Check', status: 'pass', details: `Requested ${qty}, Available ${product.stock_qty}` });

  // Check 3: Price Integrity Enforcement (Server-computed price)
  const computed_total_inr = product.price_inr * Number(qty);
  const claimed_total_inr = declared_total !== undefined ? Number(declared_total) : computed_total_inr;
  const price_tampered = Math.abs(claimed_total_inr - computed_total_inr) > 0.01;

  if (price_tampered && claimed_total_inr < computed_total_inr) {
    trace.push({ check: 'Price Integrity', status: 'fail', details: `Claimed ₹${claimed_total_inr} vs Computed ₹${computed_total_inr}` });
    return {
      decision: 'rejected',
      reason: `Security Violation: Client-declared total (₹${claimed_total_inr}) does not match server-computed total (₹${computed_total_inr}). Price tampering attempt blocked.`,
      matched_rule: 'price_tampering_detected',
      computed_total_inr,
      claimed_total_inr,
      trace
    };
  }
  trace.push({ check: 'Price Integrity', status: 'pass', details: `Claimed ₹${claimed_total_inr} matches computed ₹${computed_total_inr}` });

  // Check 4: Blocklist Check
  if (blocked_skus.includes(sku)) {
    trace.push({ check: 'Blocklist Check', status: 'fail', details: `SKU '${sku}' is explicitly blocked for AI agents` });
    return {
      decision: 'rejected',
      reason: `SKU '${sku}' is explicitly blocked from agentic purchase by merchant policy`,
      matched_rule: 'sku_block_list',
      trace
    };
  }
  trace.push({ check: 'Blocklist Check', status: 'pass', details: `SKU '${sku}' is not blocked` });

  // Check 5: Buyer Agent Identity Check
  const isAgentAllowed =
    allowed_buyer_agent_ids.includes('*') ||
    allowed_buyer_agent_ids.includes(buyer_agent_id);

  if (!isAgentAllowed) {
    trace.push({ check: 'Agent Identity', status: 'fail', details: `Agent '${buyer_agent_id}' not in allowed agents list` });
    return {
      decision: 'rejected',
      reason: `Buyer agent ID '${buyer_agent_id}' is not in merchant's allowed agents list`,
      matched_rule: 'agent_identity_allowed_list',
      trace
    };
  }

  if (signature_valid === false) {
    trace.push({ check: 'Agent Identity', status: 'fail', details: `Agent signature invalid` });
    return {
      decision: 'rejected',
      reason: `Buyer agent signature is invalid or unverified`,
      matched_rule: 'agent_identity_signature',
      trace
    };
  }
  trace.push({ check: 'Agent Identity', status: 'pass', details: `Agent '${buyer_agent_id}' authorized` });

  // Check 6: Velocity Check
  const effectiveMaxVelocity = merchantPolicy.velocity_limit || max_velocity_1h;
  if (recent_orders_count_1h >= effectiveMaxVelocity) {
    trace.push({ check: 'Velocity Limit', status: 'fail', details: `${recent_orders_count_1h} purchases in last hour (limit: ${effectiveMaxVelocity})` });
    return {
      decision: 'rejected',
      reason: `Velocity limit exceeded: Agent '${buyer_agent_id}' has made ${recent_orders_count_1h} purchases in the last hour (limit: ${effectiveMaxVelocity})`,
      matched_rule: 'velocity_limit',
      trace
    };
  }
  trace.push({ check: 'Velocity Limit', status: 'pass', details: `${recent_orders_count_1h} purchases in last hour (limit: ${effectiveMaxVelocity})` });

  // Check 7: Order Value Cap Check
  const effective_total_inr = computed_total_inr;
  if (effective_total_inr > auto_approve_ceiling_inr) {
    trace.push({ check: 'Auto-Approve Ceiling', status: 'escalate', details: `Total ₹${effective_total_inr} > ₹${auto_approve_ceiling_inr} auto ceiling` });
    return {
      decision: 'escalated',
      reason: `Declared total (₹${effective_total_inr}) exceeds auto-approve ceiling (₹${auto_approve_ceiling_inr}). Escalated for human merchant approval.`,
      matched_rule: 'human_approval_escalation',
      computed_total_inr: effective_total_inr,
      trace
    };
  }

  trace.push({ check: 'Auto-Approve Ceiling', status: 'pass', details: `Total ₹${effective_total_inr} <= ₹${auto_approve_ceiling_inr} auto ceiling` });
  return {
    decision: 'approved',
    reason: `Declared total (₹${effective_total_inr}) is within auto-approve ceiling (₹${auto_approve_ceiling_inr})`,
    matched_rule: 'auto_approve_ceiling',
    computed_total_inr: effective_total_inr,
    trace
  };
}

/**
 * Wrapper that evaluates purchase intent AND automatically logs an immutable audit event with decision trace.
 */
export async function evaluateAndRecordPurchaseIntent(intent, merchantPolicy, context = {}) {
  const result = evaluatePurchaseIntent(intent, merchantPolicy, context);

  let razorpay_order_id = context.razorpay_order_id || null;
  let human_approval_link = context.human_approval_link || null;
  let razorpayOrderDetails = null;

  // Lazy import modules to avoid circular dependencies
  const { recordAuditEvent } = await import('../audit/index.js');
  const { createRazorpayOrder } = await import('../razorpay.js');

  if (result.decision === 'approved') {
    try {
      const receiptId = `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const rzpOrder = await createRazorpayOrder(result.computed_total_inr || intent.declared_total, receiptId, {
        buyer_agent_id: intent.buyer_agent_id,
        sku: intent.sku,
        protocol: intent.protocol || 'UNKNOWN'
      });
      razorpay_order_id = rzpOrder.id;
      razorpayOrderDetails = rzpOrder;

      // Decrement inventory stock for the ordered SKU
      const { decrementProductStock } = await import('../catalog/index.js');
      await decrementProductStock(intent.sku, intent.qty, merchantPolicy.merchant_id || 'merchant_001');
    } catch (err) {
      console.error('Failed to create Razorpay Order or decrement stock on approved intent:', err);
    }
  } else if (result.decision === 'escalated') {
    const tempEventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    human_approval_link = `http://localhost:3000/approve/${tempEventId}`;
  }

  const auditLog = await recordAuditEvent({
    merchant_id: merchantPolicy.merchant_id || 'merchant_001',
    buyer_agent_id: intent.buyer_agent_id,
    protocol: intent.protocol || 'UNKNOWN',
    sku: intent.sku,
    qty: intent.qty,
    declared_total_inr: result.computed_total_inr || intent.declared_total,
    decision: result.decision,
    matched_rule: result.matched_rule,
    reason: result.reason,
    trace: JSON.stringify(result.trace || []),
    razorpay_order_id,
    human_approval_link
  });

  return {
    ...result,
    audit_event_id: auditLog.event_id,
    timestamp: auditLog.timestamp,
    razorpay_order_id,
    human_approval_link,
    razorpay_order: razorpayOrderDetails
  };
}

export default evaluatePurchaseIntent;
