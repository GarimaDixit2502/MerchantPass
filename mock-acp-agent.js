#!/usr/bin/env node
/**
 * Standalone CLI Mock ACP Buyer Agent (ChatGPT Shopping Agent)
 * Usage:
 *   node mock-acp-agent.js --sku=SKU-003 --qty=2
 *   node mock-acp-agent.js --scenario=escalation
 *   node mock-acp-agent.js --scenario=reject-blocked-sku
 *   node mock-acp-agent.js --scenario=reject-tampered-price
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

async function runMockAcpAgent() {
  const args = parseArgs();
  const scenario = args.scenario;

  console.log('\n🤖 =================================================================');
  console.log('🤖 MOCK ACP BUYER AGENT SIMULATOR (ChatGPT Shopping Agent)');
  console.log('🤖 =================================================================\n');

  try {
    // Step 1: Query ACP Product Feed
    console.log('📡 [Step 1/3] Fetching ACP Product Feed (GET /acp/feed)...');
    const feedRes = await fetch(`${BASE_URL}/acp/feed`);
    const feed = await feedRes.json();

    if (!Array.isArray(feed) || feed.length === 0) {
      console.log('❌ Error: ACP Product feed is empty.');
      return;
    }

    let targetSku = args.sku || 'SKU-001';
    let targetQty = args.qty ? Number(args.qty) : 1;
    let declaredTotalOverride = null;

    if (scenario === 'escalation') {
      console.log('💡 Scenario Active: High-Value Order Escalation (> ₹3,000)');
      targetSku = 'SKU-001'; // Basmati Rice ₹899
      targetQty = 5; // ₹4,495 > ₹3,000 ceiling
    } else if (scenario === 'reject-blocked-sku') {
      console.log('💡 Scenario Active: Blocked SKU Intent');
      targetSku = 'SKU-008'; // Default blocked SKU in demo catalog
      targetQty = 1;
    } else if (scenario === 'reject-tampered-price') {
      console.log('💡 Scenario Active: Lowball Client Price Tampering Attack');
      targetSku = 'SKU-001'; // Catalog price is ₹899
      targetQty = 1;
      declaredTotalOverride = 10; // Forged price claim!
    }

    const selectedItem = feed.find((f) => f.id === targetSku) || feed[0];
    targetSku = selectedItem.id;

    console.log(`✅ Selected Catalog SKU: [${targetSku}] "${selectedItem.title}" @ ₹${selectedItem.price.amount} each`);
    console.log(`   Order Quantity:     ${targetQty}`);

    // Step 2: Build ACP Cart
    console.log('\n🛒 [Step 2/3] Building Delegated Cart (POST /acp/cart)...');
    const cartRes = await fetch(`${BASE_URL}/acp/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ sku: targetSku, qty: targetQty }]
      })
    });

    const cart = await cartRes.json();
    console.log(`✅ Cart ID Created:    ${cart.cart_id}`);
    console.log(`   Catalog Total:     ₹${cart.total_inr} ${cart.currency}`);

    // Step 3: Execute Delegated Checkout
    console.log('\n💳 [Step 3/3] Submitting ACP Delegated Checkout (POST /acp/checkout)...');
    const checkoutPayload = {
      cart_id: cart.cart_id,
      payment_token: 'tok_acp_delegated_agent_token_99',
      buyer_agent_id: 'chatgpt-shopping-agent-v1'
    };

    if (declaredTotalOverride !== null) {
      checkoutPayload.declared_total = declaredTotalOverride;
      console.log(`⚠️ Injecting Tampered Price Payload: declared_total = ₹${declaredTotalOverride}`);
    }

    const checkoutRes = await fetch(`${BASE_URL}/acp/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutPayload)
    });

    const result = await checkoutRes.json();

    console.log('\n=================================================================');
    console.log('📋 DECISION SUMMARY RECEIVED FROM AGENT PASSPORT');
    console.log('=================================================================');
    console.log(` STATUS:            ${result.status ? result.status.toUpperCase() : 'N/A'}`);
    console.log(` POLICY DECISION:   ${result.decision ? result.decision.toUpperCase() : 'REJECTED'}`);
    console.log(` MATCHED RULE:      ${result.matched_rule || 'N/A'}`);
    console.log(` AUDIT EVENT ID:    ${result.audit_event_id || 'N/A'}`);
    console.log(` REASON:            ${result.reason || 'N/A'}`);
    
    if (result.razorpay_order_id) {
      console.log(` RAZORPAY ORDER ID: ${result.razorpay_order_id}`);
    }
    if (result.human_approval_link) {
      console.log(` APPROVAL LINK:     ${result.human_approval_link}`);
    }
    console.log('=================================================================\n');

  } catch (err) {
    console.error('❌ Terminal Agent Error:', err.message);
  }
}

runMockAcpAgent();
