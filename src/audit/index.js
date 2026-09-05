import express from 'express';
import crypto from 'crypto';
import { dbQuery, dbRun } from '../db.js';

const router = express.Router();

/**
 * Record a single audit event into SQLite audit_events table
 */
export async function recordAuditEvent(data) {
  const event_id = data.event_id || `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const timestamp = data.timestamp || new Date().toISOString();
  const merchant_id = data.merchant_id || 'merchant_001';
  const buyer_agent_id = data.buyer_agent_id || 'unknown_agent';
  const protocol = data.protocol || 'UNKNOWN';
  const sku = data.sku || 'N/A';
  const qty = Number(data.qty || 1);
  const declared_total_inr = Number(data.declared_total_inr || 0);
  const decision = data.decision || 'rejected';
  const matched_rule = data.matched_rule || 'default';
  const reason = data.reason || '';
  const trace = typeof data.trace === 'string' ? data.trace : JSON.stringify(data.trace || []);
  const razorpay_order_id = data.razorpay_order_id || null;
  const razorpay_payment_id = data.razorpay_payment_id || null;
  const human_approval_link = data.human_approval_link || null;

  await dbRun(
    `INSERT INTO audit_events 
     (event_id, timestamp, merchant_id, buyer_agent_id, protocol, sku, qty, declared_total_inr, decision, matched_rule, reason, trace, razorpay_order_id, razorpay_payment_id, human_approval_link)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event_id,
      timestamp,
      merchant_id,
      buyer_agent_id,
      protocol,
      sku,
      qty,
      declared_total_inr,
      decision,
      matched_rule,
      reason,
      trace,
      razorpay_order_id,
      razorpay_payment_id,
      human_approval_link
    ]
  );

  return {
    event_id,
    timestamp,
    merchant_id,
    buyer_agent_id,
    protocol,
    sku,
    qty,
    declared_total_inr,
    decision,
    matched_rule,
    reason,
    trace: JSON.parse(trace),
    razorpay_order_id,
    razorpay_payment_id,
    human_approval_link
  };
}

/**
 * Retrieve audit events for a merchant sorted by timestamp descending
 */
export async function getAuditEvents(merchantId = 'merchant_001', limit = 100) {
  const rows = await dbQuery(
    `SELECT * FROM audit_events WHERE merchant_id = ? ORDER BY timestamp DESC LIMIT ?`,
    [merchantId, limit]
  );

  return rows.map((r) => {
    let parsedTrace = [];
    try {
      parsedTrace = JSON.parse(r.trace || '[]');
    } catch (e) {
      parsedTrace = [];
    }

    return {
      event_id: r.event_id,
      timestamp: r.timestamp,
      merchant_id: r.merchant_id,
      buyer_agent_id: r.buyer_agent_id,
      protocol: r.protocol,
      sku: r.sku,
      qty: r.qty,
      declared_total_inr: r.declared_total_inr,
      decision: r.decision,
      matched_rule: r.matched_rule,
      reason: r.reason,
      trace: parsedTrace,
      razorpay_order_id: r.razorpay_order_id,
      razorpay_payment_id: r.razorpay_payment_id,
      human_approval_link: r.human_approval_link
    };
  });
}

/**
 * Count approved orders for a specific buyer agent within the last N minutes (default 60 mins)
 */
export async function countRecentOrdersForAgent(buyerAgentId, timeWindowMinutes = 60) {
  const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();
  const rows = await dbQuery(
    `SELECT COUNT(*) as count FROM audit_events 
     WHERE buyer_agent_id = ? AND decision = 'approved' AND timestamp >= ?`,
    [buyerAgentId, cutoffTime]
  );

  return rows[0] ? rows[0].count : 0;
}

// GET /audit?merchant_id=... -> List audit events sorted by timestamp descending
router.get('/', async (req, res) => {
  try {
    const merchantId = req.query.merchant_id || 'merchant_001';
    const limit = parseInt(req.query.limit, 10) || 100;
    const events = await getAuditEvents(merchantId, limit);
    res.json(events);
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

/**
 * POST /audit/approve
 * Human Approval Queue action: transition an escalated decision to approved & generate Razorpay Order
 */
router.post('/approve', async (req, res) => {
  try {
    const { event_id } = req.body;
    if (!event_id) {
      return res.status(400).json({ error: 'event_id is required' });
    }

    const { dbGet, dbRun } = await import('../db.js');
    const event = await dbGet(`SELECT * FROM audit_events WHERE event_id = ?`, [event_id]);

    if (!event) {
      return res.status(404).json({ error: `Audit event '${event_id}' not found` });
    }

    if (event.decision !== 'escalated' && event.decision !== 'pending_approval') {
      return res.status(400).json({ error: `Event '${event_id}' is in decision state '${event.decision}' and cannot be approved` });
    }

    const { createRazorpayOrder } = await import('../razorpay.js');
    const receiptId = `rcpt_appr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const rzpOrder = await createRazorpayOrder(event.declared_total_inr, receiptId, {
      buyer_agent_id: event.buyer_agent_id,
      sku: event.sku,
      protocol: event.protocol,
      approved_by: 'merchant_admin'
    });

    // Decrement inventory stock quantity
    const { decrementProductStock } = await import('../catalog/index.js');
    await decrementProductStock(event.sku, event.qty, event.merchant_id || 'merchant_001');

    // Update DB record with order ID and approved decision status
    await dbRun(
      `UPDATE audit_events 
       SET decision = 'approved', matched_rule = 'human_approved', reason = 'Manually approved by merchant in Approval Queue', razorpay_order_id = ?
       WHERE event_id = ?`,
      [rzpOrder.id, event_id]
    );

    const updatedEvent = await dbGet(`SELECT * FROM audit_events WHERE event_id = ?`, [event_id]);

    res.json({
      status: 'success',
      message: 'Escalated order approved by merchant! Razorpay Order created.',
      event: updatedEvent,
      razorpay_order: rzpOrder
    });
  } catch (err) {
    console.error('Error approving audit event:', err);
    res.status(500).json({ error: 'Failed to approve event' });
  }
});

/**
 * POST /audit/reject OR POST /approval/:event_id/reject
 * Reject an escalated order in the Human Approval Queue
 */
router.post('/reject', async (req, res) => {
  try {
    const event_id = req.body.event_id || req.params.event_id;
    const reason = req.body.reason || 'Rejected by merchant administrator in Approval Queue';

    if (!event_id) {
      return res.status(400).json({ error: 'event_id is required' });
    }

    const { dbGet, dbRun } = await import('../db.js');
    const event = await dbGet(`SELECT * FROM audit_events WHERE event_id = ?`, [event_id]);

    if (!event) {
      return res.status(404).json({ error: `Audit event '${event_id}' not found` });
    }

    if (event.decision !== 'escalated' && event.decision !== 'pending_approval') {
      return res.status(400).json({ error: `Event '${event_id}' is in decision state '${event.decision}' and cannot be rejected` });
    }

    await dbRun(
      `UPDATE audit_events 
       SET decision = 'rejected', matched_rule = 'human_rejected', reason = ?
       WHERE event_id = ?`,
      [reason, event_id]
    );

    const updatedEvent = await dbGet(`SELECT * FROM audit_events WHERE event_id = ?`, [event_id]);

    res.json({
      status: 'success',
      message: 'Escalated order rejected by merchant administrator.',
      event: updatedEvent
    });
  } catch (err) {
    console.error('Error rejecting audit event:', err);
    res.status(500).json({ error: 'Failed to reject event' });
  }
});

/**
 * POST /audit/capture-payment
 * Triggered after successful Razorpay Checkout.js payment capture
 * Stores razorpay_payment_id and updates event decision/status to 'paid'
 */
router.post('/capture-payment', async (req, res) => {
  try {
    const { event_id, razorpay_payment_id, razorpay_order_id } = req.body;

    if (!event_id || !razorpay_payment_id) {
      return res.status(400).json({ error: 'event_id and razorpay_payment_id are required' });
    }

    const { dbGet, dbRun } = await import('../db.js');
    const event = await dbGet(`SELECT * FROM audit_events WHERE event_id = ?`, [event_id]);

    if (!event) {
      return res.status(404).json({ error: `Audit event '${event_id}' not found` });
    }

    await dbRun(
      `UPDATE audit_events 
       SET razorpay_payment_id = ?, decision = 'paid', reason = 'Payment captured via Razorpay Checkout.js'
       WHERE event_id = ?`,
      [razorpay_payment_id, event_id]
    );

    const updatedEvent = await dbGet(`SELECT * FROM audit_events WHERE event_id = ?`, [event_id]);

    res.json({
      status: 'success',
      message: 'Payment captured successfully via Razorpay Checkout.js!',
      event: updatedEvent
    });
  } catch (err) {
    console.error('Error capturing payment:', err);
    res.status(500).json({ error: 'Failed to record payment capture' });
  }
});

export default router;
