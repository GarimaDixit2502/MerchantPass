import express from 'express';
import { dbGet, dbRun } from '../db.js';

const router = express.Router();

/**
 * GET /policy/:merchant_id
 * Retrieve merchant policy guardrails configuration
 */
router.get('/:merchant_id', async (req, res) => {
  try {
    const merchantId = req.params.merchant_id || 'merchant_001';
    const merchant = await dbGet(`SELECT * FROM merchants WHERE merchant_id = ?`, [merchantId]);

    if (!merchant) {
      return res.status(404).json({ error: `Merchant '${merchantId}' not found` });
    }

    res.json({
      merchant_id: merchant.merchant_id,
      merchant_name: merchant.merchant_name,
      auto_approve_ceiling_inr: merchant.auto_approve_ceiling_inr,
      human_approval_ceiling_inr: merchant.human_approval_ceiling_inr,
      velocity_limit: merchant.velocity_limit || 5,
      blocked_skus: JSON.parse(merchant.blocked_skus || '[]'),
      allowed_buyer_agent_ids: JSON.parse(merchant.allowed_buyer_agent_ids || '["*"]')
    });
  } catch (err) {
    console.error('Error fetching merchant policy:', err);
    res.status(500).json({ error: 'Failed to fetch policy configuration' });
  }
});

/**
 * PUT /policy/:merchant_id
 * Update merchant policy guardrails configuration (takes effect immediately)
 */
router.put('/:merchant_id', async (req, res) => {
  try {
    const merchantId = req.params.merchant_id || 'merchant_001';
    const {
      auto_approve_ceiling_inr,
      human_approval_ceiling_inr,
      velocity_limit,
      blocked_skus,
      allowed_buyer_agent_ids
    } = req.body;

    const existing = await dbGet(`SELECT * FROM merchants WHERE merchant_id = ?`, [merchantId]);
    if (!existing) {
      return res.status(404).json({ error: `Merchant '${merchantId}' not found` });
    }

    const updatedAutoApprove = auto_approve_ceiling_inr !== undefined ? Number(auto_approve_ceiling_inr) : existing.auto_approve_ceiling_inr;
    const updatedHumanApproval = human_approval_ceiling_inr !== undefined ? Number(human_approval_ceiling_inr) : existing.human_approval_ceiling_inr;
    const updatedVelocity = velocity_limit !== undefined ? Number(velocity_limit) : (existing.velocity_limit || 5);
    const updatedBlocked = blocked_skus !== undefined ? JSON.stringify(blocked_skus) : existing.blocked_skus;
    const updatedAllowedAgents = allowed_buyer_agent_ids !== undefined ? JSON.stringify(allowed_buyer_agent_ids) : existing.allowed_buyer_agent_ids;

    await dbRun(
      `UPDATE merchants 
       SET auto_approve_ceiling_inr = ?, human_approval_ceiling_inr = ?, velocity_limit = ?, blocked_skus = ?, allowed_buyer_agent_ids = ?
       WHERE merchant_id = ?`,
      [updatedAutoApprove, updatedHumanApproval, updatedVelocity, updatedBlocked, updatedAllowedAgents, merchantId]
    );

    const updatedMerchant = await dbGet(`SELECT * FROM merchants WHERE merchant_id = ?`, [merchantId]);

    res.json({
      status: 'success',
      message: 'Policy guardrails updated successfully! Takes effect immediately.',
      policy: {
        merchant_id: updatedMerchant.merchant_id,
        merchant_name: updatedMerchant.merchant_name,
        auto_approve_ceiling_inr: updatedMerchant.auto_approve_ceiling_inr,
        human_approval_ceiling_inr: updatedMerchant.human_approval_ceiling_inr,
        velocity_limit: updatedMerchant.velocity_limit,
        blocked_skus: JSON.parse(updatedMerchant.blocked_skus || '[]'),
        allowed_buyer_agent_ids: JSON.parse(updatedMerchant.allowed_buyer_agent_ids || '["*"]')
      }
    });
  } catch (err) {
    console.error('Error updating merchant policy:', err);
    res.status(500).json({ error: 'Failed to update policy configuration' });
  }
});

export default router;
