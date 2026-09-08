import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, resetDemoData } from './db.js';
import catalogRouter from './catalog/index.js';
import auditRouter from './audit/index.js';
import policyRouter from './policy/index.js';
import acpRouter from './adapters/acp/index.js';
import upiRouter from './adapters/upi/index.js';
import mocksRouter from './adapters/mocks/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files for merchant dashboard
app.use(express.static(path.resolve(__dirname, '../public')));

// Initialize SQLite Database and seed tables
let dbInitialized = false;
export async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

app.use(async (req, res, next) => {
  try {
    await ensureDbInitialized();
    next();
  } catch (err) {
    console.error('Error initializing DB in middleware:', err);
    next(err);
  }
});

// Mount Specific API Endpoints
app.use('/catalog', catalogRouter);
app.use('/audit', auditRouter);
app.use('/policy', policyRouter);
app.use('/acp', acpRouter);
app.use('/upi', upiRouter);

// POST /approval/:event_id/reject route mapping for Human Approval Queue
app.post('/approval/:event_id/reject', async (req, res, next) => {
  try {
    const { event_id } = req.params;
    const { reason = 'Rejected by merchant administrator' } = req.body;
    const { dbGet, dbRun } = await import('./db.js');
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
    next(err);
  }
});

// POST /reset-demo -> Reseed catalog & clear audit logs/consents for clean live demos
app.post('/reset-demo', async (req, res, next) => {
  try {
    const result = await resetDemoData();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Mount Protocol Manifest Previews
app.use('/', mocksRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Agent Passport API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Global 404 Route Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});

// Global Error Handler (Prevents server crash on bad request mid-demo)
app.use((err, req, res, next) => {
  console.error('⚠️ Unhandled Server Error:', err.stack || err.message || err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  });
});

// Process-level uncaught exception safety
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception caught by process handler:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Agent Passport Express Server running on port ${PORT}`);
    console.log(`👉 Merchant Dashboard: http://localhost:${PORT}`);
    console.log(`👉 Health check:        http://localhost:${PORT}/health`);
    console.log(`👉 Catalog Feed:        http://localhost:${PORT}/catalog`);
    console.log(`👉 ACP Feed:            http://localhost:${PORT}/acp/feed`);
    console.log(`👉 UPI Consents:        http://localhost:${PORT}/upi/consents`);
    console.log(`👉 AP2 Preview:         http://localhost:${PORT}/ap2/preview/SKU-001`);
    console.log(`👉 x402 Preview:        http://localhost:${PORT}/x402/preview/SKU-001`);
    console.log(`👉 Audit Trail:         http://localhost:${PORT}/audit`);
  });
}

export default app;
