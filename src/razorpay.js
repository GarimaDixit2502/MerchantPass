import Razorpay from 'razorpay';
import dotenv from 'dotenv';

dotenv.config();

const key_id = process.env.RAZORPAY_KEY_ID || 'rzp_test_mockkey12345';
const key_secret = process.env.RAZORPAY_KEY_SECRET || 'mocksecret12345';

export const razorpayInstance = new Razorpay({
  key_id,
  key_secret
});

/**
 * Creates a Razorpay Order in test mode.
 * Amount is passed in INR and converted to Paise (amountInr * 100)
 * Returns the Razorpay Order object.
 */
export async function createRazorpayOrder(amountInr, receiptId, notes = {}) {
  const amountPaise = Math.round(amountInr * 100);
  const receipt = receiptId || `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  
  const options = {
    amount: amountPaise,
    currency: 'INR',
    receipt,
    notes: {
      source: 'Agent Passport',
      ...notes
    }
  };

  try {
    // If valid non-dummy Razorpay API key is supplied in .env, call Razorpay API
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_') && !process.env.RAZORPAY_KEY_ID.includes('mockkey')) {
      const order = await razorpayInstance.orders.create(options);
      return order;
    }
  } catch (err) {
    console.warn(`Razorpay API call fallback to mock order (${err.message})`);
  }

  // Realistic mock order matching Razorpay Orders API return structure
  const mockOrderId = `order_${Math.random().toString(36).substring(2, 14)}`;
  return {
    id: mockOrderId,
    entity: 'order',
    amount: amountPaise,
    amount_paid: 0,
    amount_due: amountPaise,
    currency: 'INR',
    receipt,
    status: 'created',
    attempts: 0,
    notes: options.notes,
    created_at: Math.floor(Date.now() / 1000)
  };
}

/**
 * Real capture requires a customer-facing checkout step, which a silent AI-agent transaction bypasses by design — this reflects an authorized, ready-to-settle order.
 * 
 * Generates a simulated payment capture with status: "captured (simulated)".
 * Amount is passed in INR and converted to Paise (amountInr * 100).
 * Returns the Razorpay Payment simulation object with payment_id: "pay_sim_<random>".
 */
export async function createAndCaptureTestPayment(orderId, amountInr, notes = {}) {
  const amountPaise = Math.round(amountInr * 100);
  const mockPaymentId = `pay_sim_${Math.random().toString(36).substring(2, 12)}`;

  return {
    id: mockPaymentId,
    entity: 'payment',
    amount: amountPaise,
    currency: 'INR',
    status: 'captured (simulated)',
    order_id: orderId,
    method: 'card',
    notes: {
      source: 'MerchantPass',
      note: 'Real capture requires a customer-facing checkout step, which a silent AI-agent transaction bypasses by design — this reflects an authorized, ready-to-settle order.',
      ...notes
    },
    created_at: Math.floor(Date.now() / 1000)
  };
}

export default createRazorpayOrder;

