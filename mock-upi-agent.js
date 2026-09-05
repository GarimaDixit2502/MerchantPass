#!/usr/bin/env node
/**
 * Standalone CLI Mock UPI-Native Buyer Agent (Claude Shopping Agent)
 * Usage:
 *   node mock-upi-agent.js --sku=SKU-001 --qty=1
 *   node mock-upi-agent.js --scenario=consent-cap-exceeded
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    const [key, val] = arg.replace(/^--/, '').split('=');
    if (key) args[key] = val || true;
  });
  return args;
}

async function runMockUpiAgent() {
  const args = parseArgs();
  const scenario = args.scenario;

  console.log('\n⚡ =================================================================');
  console.log('⚡ MOCK UPI-NATIVE BUYER AGENT SIMULATOR (Claude UPI Agent)');
  console.log('⚡ =================================================================\n');

  try {
    const capInr = args.cap ? Number(args.cap) : 2500;

    // Step 1: Register One-Time Consent
    console.log(`📝 [Step 1/2] Registering One-Time Consent (POST /upi/consent)...`);
    console.log(`   Buyer Agent ID:   claude-shopping-agent-v1`);
    console.log(`   Merchant Cap:     ₹${capInr}`);

    const consentRes = await fetch(`${BASE_URL}/upi/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyer_agent_id: 'claude-shopping-agent-v1',
        merchant_id: 'merchant_001',
        spending_cap_inr: capInr
      })
    });

    const consent = await consentRes.json();
    console.log(`✅ Consent Registered! Consent ID: ${consent.consent_id}`);

    let targetSku = args.sku || 'SKU-001';
    let targetQty = args.qty ? Number(args.qty) : 1;

    if (scenario === 'consent-cap-exceeded') {
      console.log('\n💡 Scenario Active: Exceeding Delegate Consent Spending Cap');
      targetSku = 'SKU-001'; // Basmati Rice ₹899
      targetQty = 4; // ₹3,596 > ₹2,500 consent cap!
    }

    console.log(`\n🛒 [Step 2/2] Executing Instant Purchase Under Consent (POST /upi/purchase)...`);
    console.log(`   SKU:              ${targetSku}`);
    console.log(`   Quantity:         ${targetQty}`);

    const purchaseRes = await fetch(`${BASE_URL}/upi/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consent_id: consent.consent_id,
        sku: targetSku,
        qty: targetQty
      })
    });

    const result = await purchaseRes.json();

    console.log('\n=================================================================');
    console.log('📋 DECISION SUMMARY RECEIVED FROM AGENT PASSPORT');
    console.log('=================================================================');
    console.log(` STATUS:            ${result.status ? result.status.toUpperCase() : 'N/A'}`);
    console.log(` POLICY DECISION:   ${result.decision ? result.decision.toUpperCase() : 'REJECTED'}`);
    console.log(` MATCHED RULE:      ${result.matched_rule || 'N/A'}`);
    console.log(` REASON:            ${result.reason || 'N/A'}`);
    console.log(` AUDIT EVENT ID:    ${result.audit_event_id || 'N/A'}`);

    if (result.razorpay_order_id) {
      console.log(` RAZORPAY ORDER ID: ${result.razorpay_order_id}`);
    }
    console.log('=================================================================\n');

  } catch (err) {
    console.error('❌ Terminal Agent Error:', err.message);
  }
}

runMockUpiAgent();
