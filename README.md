<div align="center">

# 🛂 MerchantPass

### One merchant integration. Any AI buyer-agent. Every decision explainable.

*Built for the Razorpay AI Buildathon 2026*

</div>

---

## 📸 See it in action

*A picture is worth a thousand policy checks. Here's the merchant's journey — from a blank spreadsheet to a live, agent-ready store — in nine frames.*

### 🚪 Onboarding — from zero to agent-ready in four steps

<table>
<tr>
<td width="50%">

**1. Welcome**
*Every merchant's first click.*
![Onboarding welcome screenshot](docs/screenshots/onboarding-01-welcome.png)

</td>
<td width="50%">

**2. Catalog Setup**
*Drag, drop, done — or type it by hand.*
![Catalog setup screenshot](docs/screenshots/onboarding-02-catalog-setup.png)

</td>
</tr>
<tr>
<td width="50%">

**3. Import Review**
*Nothing goes live until the merchant says so — bad rows flagged in red before a single SKU is committed.*
![Import review screenshot](docs/screenshots/onboarding-03-import-review.png)

</td>
<td width="50%">

**4. You're Live**
*Ceilings set, catalog loaded — discoverable to AI buyer-agents from this click onward.*
![You're live screenshot](docs/screenshots/onboarding-04-youre-live.png)

</td>
</tr>
</table>

### 🖥️ Merchant Console — running the store once it's live

<table>
<tr>
<td width="50%">

**5. Live Orders**
*Every AI-agent purchase, reasoned and logged the moment it happens.*
![Live orders screenshot](docs/screenshots/dashboard-01-live-orders.png)

</td>
<td width="50%">

**6. Decision Trace**
*Not a black box — click any order and watch the policy engine's reasoning, check by check.*
![Decision trace screenshot](docs/screenshots/dashboard-02-decision-trace.png)

</td>
</tr>
<tr>
<td width="50%">

**7. Approval Queue**
*The graceful-degradation moment — nothing over the merchant's comfort zone gets silently rejected, it lands here for a human call.*
![Approval queue screenshot](docs/screenshots/dashboard-03-approval-queue.png)

</td>
<td width="50%">

**8. Catalog & Policy Settings**
*The merchant's rules, in the merchant's hands — ceilings, blocklists, and allowed agents, editable anytime.*
![Catalog and policy screenshot](docs/screenshots/dashboard-04-catalog-policy.png)

</td>
</tr>
<tr>
<td width="50%" colspan="2">

**9. Agent Channel Readiness**
*The honest scoreboard — which AI shopping channels are live today, and which are catalog-ready and waiting on the rest of the world to catch up.*
![Channel readiness screenshot](docs/screenshots/dashboard-05-channel-readiness.png)

</td>
</tr>
</table>

*(Drop your captures into `docs/screenshots/` using the filenames above, or swap in your own paths — GitHub renders these inline automatically once the images exist in the repo.)*

---

## The Problem

Agentic commerce is fragmenting into competing protocols before it's even matured. OpenAI and Stripe have **ACP**. Google has **AP2**. Coinbase and Cloudflare have **x402**. India's NPCI is building a **Unified Agent Protocol** for UPI. Each one defines its own way for an AI shopping agent to discover a product, negotiate a cart, and authorize a payment.

A merchant who wants to be "AI-agent ready" today faces a bad choice: **bet on one protocol and risk building the wrong integration, or do nothing and become invisible to AI buyers entirely.**

## The Insight

The protocol war is a **distribution problem**, not a business-logic problem. Every one of these protocols is ultimately asking the same three questions — *what can I buy, is this purchase allowed, and how does money move* — just phrased differently. If a merchant's catalog, policy rules, and payment plumbing live in one canonical place, protocol support becomes a **thin translation layer**, not a rebuild.

## The Solution

**MerchantPass** is a canonical catalog + policy engine + audit trail, sitting on top of Razorpay's Orders API, with adapters that translate to and from whichever protocol a buyer-agent speaks. Bounded purchases execute automatically. Anything outside the merchant's stated comfort zone **gracefully degrades to a one-click human approval** instead of failing outright.

Register your catalog once. Set your risk limits once. Every AI agent — regardless of which protocol it speaks — gets a protocol-correct, policy-safe way to buy from you.

### Why Razorpay

This turns "protocol uncertainty" from a merchant liability into a platform feature. Merchants get agent-readiness without betting on a winner, and Razorpay becomes the neutral infrastructure layer underneath all of them — the same role it already plays across payment methods.

### This is grounded, not speculative

The UPI-native adapter isn't hypothetical — it mirrors the consent-plus-spending-cap pattern **Razorpay and NPCI already shipped live on Claude in February 2026**, with Zomato, Swiggy, and Zepto as launch partners. We're generalizing a pattern Razorpay has already proven, not proposing something unproven.

---

## What's actually live vs. preview (we're upfront about this)

| Protocol | Status | What that means |
|---|---|---|
| **ACP** (OpenAI + Stripe) | 🟢 **Live** | Real feed / cart / checkout endpoints, spec-shaped per the 2026-04-17 ACP release |
| **UPI-native** (Razorpay + NPCI pattern) | 🟢 **Live** | Real consent registration + spending-cap enforcement, modeled on the live Razorpay/NPCI/Claude pilot |
| **AP2** (Google) | 🟡 **Preview** | Correctly-shaped mandate payloads generated from the live catalog — no live signing/facilitator integration yet |
| **x402** (Coinbase + Cloudflare) | 🟡 **Preview** | Correctly-shaped HTTP 402 payment-required payloads — no live on-chain settlement yet |

We didn't fake the two we couldn't fully build. NPCI's own Unified Agent Protocol hasn't launched publicly yet (still pre-RBI-approval as of this writing), and live AP2/x402 integration requires real signing keys and facilitator infrastructure outside a hackathon's scope. What's real is the **abstraction** — one canonical catalog, one policy engine, protocol-correct output — which is what would let live AP2/x402 support be added in days once that infrastructure exists, not months.

---

## Architecture

```
                    ┌───────────────────────────┐
                    │   Merchant Catalog Setup    │
                    │  (Excel/CSV import or       │
                    │   manual entry, once)       │
                    └─────────────┬───────────────┘
                                  ▼
                    ┌───────────────────────────┐
                    │   Canonical Catalog Store    │
                    │  (SKUs, price, stock,        │
                    │   policy defaults)           │
                    └─────────────┬───────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
 ┌────────────────┐     ┌────────────────┐      ┌──────────────────┐
 │  ACP Adapter    │     │ UPI-Native      │      │  Manifest Preview  │
 │  feed/cart/     │     │ Adapter         │      │  Generator         │
 │  checkout       │     │ consent+limit   │      │  (AP2 + x402)      │
 └────────┬────────┘     └────────┬────────┘      └─────────┬─────────┘
          │                       │                          │
          └───────────────┬───────┴──────────────────────────┘
                          ▼
               ┌───────────────────────┐
               │     Policy Engine       │
               │  SKU validity → stock   │
               │  → blocklist → agent    │
               │  identity → velocity →  │
               │  value / consent-cap    │
               └───────────┬─────────────┘
                           │
                ┌──────────┴──────────┐
                ▼                     ▼
       ┌─────────────────┐   ┌─────────────────────┐
       │  Razorpay Orders  │   │  Human-Approval Link  │
       │  + Payment Capture │   │  (over-cap escalation)│
       └────────┬─────────┘   └───────────┬───────────┘
                ▼                          ▼
                └────────────┬─────────────┘
                             ▼
                ┌───────────────────────────┐
                │   Immutable Audit Trail     │
                │  every decision + reason    │
                └────────────┬───────────────┘
                             ▼
                ┌───────────────────────────┐
                │     Merchant Console         │
                │  Live Orders · Approval      │
                │  Queue · Catalog · Policy     │
                │  Settings · Channel Readiness │
                └───────────────────────────┘
```

Every adapter normalizes a protocol-specific request into one internal `PurchaseIntent` shape before it ever touches the policy engine — that single abstraction is what makes "protocol-agnostic" true in code, not just in the pitch.

---

## Features

- **📊 Merchant Console** — a real onboarding flow (catalog setup → policy setup → live), not a flat dashboard
- **📥 Excel/CSV catalog import** — drag-and-drop upload with row-level validation before commit
- **🧠 Policy engine** — sequential, explainable checks: SKU validity, stock, blocklist, buyer-agent identity, velocity, order-value ceiling, UPI consent-cap enforcement
- **🤝 Graceful degradation, not hard failure** — orders over the merchant's comfort zone escalate to a one-click human approval instead of getting rejected outright
- **🛡️ Server-side price integrity** — every order total is recomputed from the authoritative catalog price, never trusted from the buyer-agent's claim, closing a spoofing vector
- **📒 Immutable, reason-coded audit trail** — every decision, approved or not, is logged with the exact rule that fired
- **💳 Real Razorpay test-mode integration** — genuine Order creation and payment capture against Razorpay's API
- **🔍 Decision Trace** — expand any order to see exactly which policy checks ran and why it landed where it did
- **🌐 Agent Channel Readiness** — an honest, at-a-glance view of which agent protocols are live vs. preview

---

## Tech stack

- **Backend:** Node.js + Express
- **Database:** SQLite (persisted to disk)
- **Frontend:** React + Tailwind CSS
- **Payments:** Razorpay Node SDK (test mode)
- **Catalog import:** SheetJS (`xlsx`)

---

## Getting started

```bash
# 1. Clone the repo
git clone https://github.com/GarimaDixit2502/MerchantPass.git
cd MerchantPass

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# then fill in your Razorpay test-mode keys:
# RAZORPAY_KEY_ID=rzp_test_...
# RAZORPAY_KEY_SECRET=...

# 4. Start the server
npm start

# 5. Open the console
# http://localhost:3000
```

On first run, you'll be walked through onboarding: upload or manually enter your catalog, set your policy limits, and you're live.

---

## Demoing the protocol adapters

The Merchant Console is deliberately merchant-only — no "simulate" buttons cluttering a real business tool. To exercise the live ACP and UPI-native adapters the way a real buyer-agent would, use the included terminal scripts:

```bash
# Simulate a straightforward ACP purchase
node mock-acp-agent.js --sku=SKU-003 --qty=2

# Force an escalation (over the auto-approve ceiling)
node mock-acp-agent.js --scenario=escalation

# Demonstrate the price-tampering guard
node mock-acp-agent.js --scenario=reject-tampered-price

# Demonstrate a blocked-SKU rejection
node mock-acp-agent.js --scenario=reject-blocked-sku

# Simulate a UPI-native purchase against a registered consent
node mock-upi-agent.js --sku=SKU-001 --qty=1

# Exceed the UPI consent's spending cap
node mock-upi-agent.js --scenario=consent-cap-exceeded

```

Each script hits the live server over real HTTP, the same endpoints a genuine ACP or UPI-native client would call — the only thing simulated is the caller itself, since real inbound traffic from ChatGPT or Claude requires a formal merchant partnership with OpenAI/NPCI that isn't accessible during a hackathon build. Everything downstream of that — the policy evaluation, the Razorpay API calls, the audit trail — is real.

---

## Key API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/acp/feed` | ACP-compatible product feed |
| `POST` | `/acp/cart` | Build a cart from SKUs + quantities |
| `POST` | `/acp/checkout` | Evaluate + execute an ACP purchase |
| `POST` | `/upi/consent` | Register a buyer-agent's spending-cap consent |
| `POST` | `/upi/purchase` | Evaluate + execute a UPI-native purchase |
| `GET` | `/ap2/preview/:sku` | Preview an AP2-shaped mandate chain for a SKU |
| `GET` | `/x402/preview/:sku` | Preview an x402-shaped payment-required response for a SKU |
| `GET` | `/audit` | Full, reason-coded decision log |
| `POST` | `/approval/:event_id/approve` | Approve an escalated order |
| `POST` | `/approval/:event_id/reject` | Reject an escalated order |
| `POST` | `/catalog/import` | Bulk import catalog from Excel/CSV |

---

## What a sharp reviewer will ask (and the honest answer)

**"Is the payment real?"** The buyer-agent's authorization token is simulated, because a real one requires registered merchant status with OpenAI or NPCI — a business relationship, not something a hackathon team can obtain. The moment that token gets charged, though, is real: it hits Razorpay's actual test-mode Orders and Payments API, producing a genuine object visible in the Razorpay dashboard.

**"Why only 2 of 4 protocols live?"** NPCI's Unified Agent Protocol hasn't launched publicly (pre-RBI-approval as of writing). AP2 and x402 need real signing/facilitator infrastructure outside hackathon scope. What's real is the shared abstraction that makes adding them fast once that infrastructure exists.

**"Can a buyer-agent lie about the price?"** No — every order total is recomputed server-side from the catalog's authoritative price before any policy check runs. A mismatched claim is logged and rejected as a price-tampering attempt.

---

## Roadmap

- [ ] Live AP2 mandate signing via a real facilitator
- [ ] Live x402 settlement on a testnet
- [ ] Multi-merchant support with per-merchant auth
- [ ] Webhook-based order status push (instead of polling) to buyer-agents
- [ ] Velocity-based fraud scoring beyond simple rate limits

---

<div align="center">

**Built with a simple bet: the winning move in a protocol war isn't picking a side — it's making the choice irrelevant.**

</div>
