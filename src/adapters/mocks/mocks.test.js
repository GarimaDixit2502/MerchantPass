import { initDb } from '../../db.js';
import { getProductBySku } from '../../catalog/index.js';

describe('AP2 & x402 Mocked Protocol Previews', () => {
  beforeAll(async () => {
    await initDb();
  });

  test('generates correctly-structured AP2 mandate chain preview with explicit note', async () => {
    const product = await getProductBySku('SKU-001');
    expect(product).toBeDefined();

    const ap2Preview = {
      protocol: 'AP2 (Agent Payments Protocol v0.2.0)',
      preview: true,
      note: "Preview — shows what this merchant's catalog looks like under AP2 W3C Verifiable Mandates without a live integration",
      intent_mandate: {
        type: 'IntentMandate',
        scope: `purchase ${product.sku} qty<=2, total<=₹${Math.ceil(product.price_inr * 2)}`,
        issuer: 'buyer_agent_ap2_mock',
        signature: 'MOCK_VERIFIABLE_CREDENTIAL_SIGNATURE_DO_NOT_TRUST'
      },
      cart_mandate: {
        type: 'CartMandate',
        sku: product.sku,
        qty: 1,
        total_inr: product.price_inr,
        matched_intent: true
      },
      payment_mandate: {
        type: 'PaymentMandate',
        authorized_amount_inr: product.price_inr,
        funding_instrument_ref: 'MOCK_AP2_DELEGATED_TOKEN',
        intent_cart_hash: 'sha256:mock_hash'
      }
    };

    expect(ap2Preview.preview).toBe(true);
    expect(ap2Preview.note).toContain('Preview');
    expect(ap2Preview.intent_mandate.type).toBe('IntentMandate');
    expect(ap2Preview.cart_mandate.type).toBe('CartMandate');
    expect(ap2Preview.payment_mandate.type).toBe('PaymentMandate');
  });

  test('generates correctly-structured x402 HTTP 402 header preview with explicit note', async () => {
    const product = await getProductBySku('SKU-001');
    expect(product).toBeDefined();

    const x402Preview = {
      protocol: 'x402 (Coinbase/Cloudflare HTTP 402)',
      preview: true,
      note: "Preview — shows what this merchant's catalog looks like under x402 HTTP 402 response headers without a live integration",
      status_code: 402,
      headers: {
        'HTTP/1.1': '402 Payment Required',
        'PAYMENT-REQUIRED': JSON.stringify({
          scheme: 'exact',
          network: 'base',
          asset: 'USDC',
          amount: (product.price_inr / 83.3).toFixed(2),
          payTo: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
          resource: `/x402/purchase/${product.sku}`
        })
      }
    };

    expect(x402Preview.preview).toBe(true);
    expect(x402Preview.note).toContain('Preview');
    expect(x402Preview.status_code).toBe(402);
    expect(x402Preview.headers['PAYMENT-REQUIRED']).toContain('USDC');
  });
});
