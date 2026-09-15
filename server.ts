import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { EMPTY_LEDGER_STATE } from './src/data/initialData';
import { LedgerState, Transaction, SavingsGoal, BudgetAlert, CategoryId, SpenderId, DeviceInfo } from './src/types';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Tight JSON payload limit to prevent memory exhaustion DoS
app.use(express.json({ limit: '500kb' }));

// In-memory sliding-window rate limiter for sensitive operations
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxPerWindow = 60, windowMs = 60 * 1000) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'client';
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= maxPerWindow) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
        retryAfterMs: Math.max(0, record.resetAt - now),
      });
    }

    record.count += 1;
    next();
  };
}

// Financial PII and Account Masking
function maskSensitiveFinancialData(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    // Mask 10-16 digit account or card numbers preserving last 4 digits
    .replace(/\b(\d{6,12})(\d{4})\b/g, (_, p1, p2) => '*'.repeat(p1.length) + p2)
    // Mask explicit account references: e.g. "a/c 501002345678" -> "a/c ****5678"
    .replace(/(?:a\/c|acct|account|card)\s*(?:no\.?)?\s*[:#-]?\s*([a-zA-Z0-9*]{4,})/gi, (match, acc) => {
      if (acc.length > 4) {
        return `a/c ****${acc.slice(-4)}`;
      }
      return match;
    })
    // Mask balance disclosures to prevent shoulder-surfing financial leaks
    .replace(/(?:bal|balance|avl bal|avail bal|available balance)\s*(?:is|:)?\s*(?:rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?/gi, 'Bal: [Protected]')
    // Strip HTML tags
    .replace(/<[^>]*>?/gm, '')
    .trim();
}

function sanitizeString(str: unknown, maxLen = 150): string {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>?/gm, '').trim().slice(0, maxLen);
}

// Persistent state. When DATABASE_URL is set (production), the ledger lives in a
// single-row Postgres table and survives redeploys, not just restarts. Without it
// (local dev), falls back to a JSON file on disk — convenient locally, but does not
// survive a redeploy on ephemeral hosting.
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'ledger.json');
const LEDGER_ROW_ID = 'default';

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;

async function ensureLedgerTable() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

function loadLedgerStateFromFile(): LedgerState {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as LedgerState;
  } catch {
    return JSON.parse(JSON.stringify(EMPTY_LEDGER_STATE));
  }
}

async function initLedgerState(): Promise<LedgerState> {
  if (!pool) return loadLedgerStateFromFile();

  await ensureLedgerTable();
  const result = await pool.query('SELECT data FROM ledger_state WHERE id = $1', [LEDGER_ROW_ID]);
  if (result.rows.length > 0) {
    return result.rows[0].data as LedgerState;
  }

  const initial = JSON.parse(JSON.stringify(EMPTY_LEDGER_STATE));
  await pool.query('INSERT INTO ledger_state (id, data) VALUES ($1, $2)', [LEDGER_ROW_ID, initial]);
  return initial;
}

async function persistLedgerState() {
  try {
    if (pool) {
      await pool.query(
        'INSERT INTO ledger_state (id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()',
        [LEDGER_ROW_ID, currentLedgerState]
      );
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(currentLedgerState, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Failed to persist ledger state:', err);
  }
}

// Populated by initLedgerState() before the server starts listening (see startServer()).
let currentLedgerState: LedgerState = JSON.parse(JSON.stringify(EMPTY_LEDGER_STATE));

// Lazy-initialized Gemini client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

// Heuristic fallback SMS parser
function parseSmsHeuristic(
  sms: string,
  defaultSpender: 'husband' | 'wife' = 'husband',
  husbandName = 'your partner',
  wifeName = 'your partner'
): Partial<Transaction> {
  const cleanSms = sms.trim();
  
  // Extract amount: e.g. Rs. 2,500.00, INR 1,420, Rs 3850
  let amount = 0;
  const amountMatch = cleanSms.match(/(?:Rs\.?|INR|Rs)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
                      cleanSms.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:debited|spent|withdrawn|charged)/i);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, '')) || 0;
  }

  // Type: debit vs credit
  const isCredit = /credited|received|refund|deposited/i.test(cleanSms);
  const type: 'debit' | 'credit' = isCredit ? 'credit' : 'debit';

  // Detect payment mode
  let paymentMode: 'UPI' | 'Card' | 'NetBanking' | 'Cash' = 'UPI';
  if (/ATM|withdrawn|cash/i.test(cleanSms)) {
    paymentMode = 'Cash';
  } else if (/Card|ending|POS|spent at/i.test(cleanSms)) {
    paymentMode = 'Card';
  } else if (/NetBanking|NEFT|RTGS|NACH|mandate/i.test(cleanSms)) {
    paymentMode = 'NetBanking';
  }

  // Detect bank
  let bankName = 'UPI Bank';
  if (/HDFC/i.test(cleanSms)) bankName = 'HDFC Bank';
  else if (/ICICI/i.test(cleanSms)) bankName = 'ICICI Bank';
  else if (/SBI|State Bank/i.test(cleanSms)) bankName = 'SBI';
  else if (/Axis/i.test(cleanSms)) bankName = 'Axis Bank';
  else if (/Kotak/i.test(cleanSms)) bankName = 'Kotak Bank';

  // UPI Ref
  let upiRef = '';
  const refMatch = cleanSms.match(/(?:Ref|Txn|ID|txn)[:\s]+([A-Za-z0-9]+)/i);
  if (refMatch) upiRef = refMatch[1];

  // Detect Merchant / Payee
  let title = 'Recent Transaction';
  let category: CategoryId = 'bills';
  let isGreyArea = false;
  let greyAreaReason = '';
  let contextQuestion = '';

  const lower = cleanSms.toLowerCase();

  if (paymentMode === 'Cash' || /atm/i.test(lower)) {
    title = 'ATM Cash Withdrawal';
    category = 'grey_area';
    isGreyArea = true;
    greyAreaReason = 'Cash withdrawal intent (groceries, maid salary, or personal cash)';
    contextQuestion = `Hey ${defaultSpender === 'husband' ? husbandName : wifeName}, was this cash withdrawal for household expenses (cook/maid salary) or personal pocket cash?`;
  } else if (/swiggy|zomato|starbucks|mcdonald|restaurant|cafe|bistro|dining|eatclub|pizza/i.test(lower)) {
    const m = cleanSms.match(/to\s+([A-Z0-9\s]+?)(?:ref|via|on|\.|$)/i);
    title = m ? m[1].trim() : 'Food & Dining Order';
    category = 'dining';
  } else if (/blinkit|zepto|instamart|bigbasket|grofers|dmart|supermarket|kirana|nature'?s basket/i.test(lower)) {
    const m = cleanSms.match(/to\s+([A-Z0-9\s]+?)(?:ref|via|on|\.|$)/i);
    title = m ? m[1].trim() : 'Groceries & Household';
    category = 'groceries';
  } else if (/bescom|electricity|bill|rent|wifi|fibernet|act|airtel|jio|maintenance|water/i.test(lower)) {
    const m = cleanSms.match(/to\s+([A-Z0-9\s]+?)(?:ref|via|on|\.|$)/i);
    title = m ? m[1].trim() : 'Utility & Bill Payment';
    category = 'bills';
  } else if (/zara|myntra|amazon|flipkart|h&m|ajio|shopping|apparel/i.test(lower)) {
    const m = cleanSms.match(/at\s+([A-Z0-9\s]+?)(?:on|ref|\.|$)/i);
    title = m ? m[1].trim() : 'Retail & Shopping';
    category = 'shopping';
  } else if (/uber|ola|rapido|shell|fuel|petrol|hpcl|iocl|toll|fastag/i.test(lower)) {
    const m = cleanSms.match(/to\s+([A-Z0-9\s]+?)(?:ref|via|on|\.|$)/i);
    title = m ? m[1].trim() : 'Travel & Fuel';
    category = 'transport';
  } else if (/cult|pharmacy|apollo|1mg|doctor|clinic|hospital|wellness/i.test(lower)) {
    title = 'Health & Pharmacy';
    category = 'health';
  } else if (/netflix|spotify|apple\.com|prime|hotstar|cinema|pvr|inox/i.test(lower)) {
    title = 'Entertainment & Subscription';
    category = 'entertainment';
  } else if (/groww|zerodha|sip|mutual fund|uti|hdfc mf|etf/i.test(lower)) {
    title = 'Investment SIP';
    category = 'investments';
  } else {
    // Ambiguous UPI to person / number
    const personMatch = cleanSms.match(/to\s+([A-Za-z\s]+?)(?:\s*\([^\)]*\)|\s*ref|\s*on|\s*via|\.|$)/i);
    if (personMatch && personMatch[1].trim().length > 2) {
      title = `UPI to ${personMatch[1].trim()}`;
    } else {
      title = 'UPI Peer Transfer';
    }
    category = 'grey_area';
    isGreyArea = true;
    greyAreaReason = 'Direct peer transfer to an individual without merchant invoice';
    contextQuestion = `Hey ${defaultSpender === 'husband' ? husbandName : wifeName}, was this ${amount ? '₹' + amount.toLocaleString('en-IN') : 'UPI'} transfer to ${title} for a household expense or personal loan/split?`;
  }

  return {
    title,
    amount: amount || 500,
    type,
    category,
    paymentMode,
    bankName,
    upiRef: upiRef || `UPI-${Date.now().toString().slice(-6)}`,
    status: isGreyArea ? 'grey_area' : 'verified',
    greyAreaReason,
    contextQuestion,
    spender: defaultSpender,
    date: new Date().toISOString(),
  };
}

// ------------------- API ROUTES -------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get current state
app.get('/api/ledger', (req, res) => {
  res.json(currentLedgerState);
});

// Full state sync from client
app.post('/api/ledger/sync', (req, res) => {
  try {
    const incoming = req.body as Partial<LedgerState>;
    if (incoming.transactions) {
      currentLedgerState.transactions = incoming.transactions;
    }
    if (incoming.goals) {
      currentLedgerState.goals = incoming.goals;
    }
    if (incoming.alerts) {
      currentLedgerState.alerts = incoming.alerts;
    }
    if (incoming.categories) {
      currentLedgerState.categories = incoming.categories;
    }
    currentLedgerState.lastSyncTime = new Date().toISOString();
    persistLedgerState();
    res.json({ success: true, ledger: currentLedgerState });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

// Add new transaction
app.post('/api/ledger/transaction', rateLimit(60, 60000), (req, res) => {
  try {
    const rawTx = req.body as Partial<Transaction>;
    if (!rawTx || typeof rawTx !== 'object') {
      return res.status(400).json({ error: 'Invalid transaction payload' });
    }

    const cleanTitle = sanitizeString(rawTx.title, 90);
    if (!cleanTitle) {
      return res.status(400).json({ error: 'Transaction title is required' });
    }

    const amountNum = Number(rawTx.amount);
    if (!isFinite(amountNum) || amountNum <= 0 || amountNum > 50000000) {
      return res.status(400).json({ error: 'Amount must be a positive number under ₹5,00,00,000' });
    }

    const validCategories: CategoryId[] = [
      'dining', 'groceries', 'bills', 'shopping', 'transport', 'entertainment', 'health', 'investments', 'grey_area'
    ];
    const category: CategoryId = validCategories.includes(rawTx.category as CategoryId)
      ? (rawTx.category as CategoryId)
      : 'bills';

    const spender: SpenderId = rawTx.spender === 'wife' ? 'wife' : 'husband';
    const type: 'debit' | 'credit' = rawTx.type === 'credit' ? 'credit' : 'debit';
    const paymentMode: 'UPI' | 'Card' | 'NetBanking' | 'Cash' =
      ['UPI', 'Card', 'NetBanking', 'Cash'].includes(rawTx.paymentMode as any)
        ? (rawTx.paymentMode as any)
        : 'UPI';

    const tx: Transaction = {
      id: rawTx.id && typeof rawTx.id === 'string' ? sanitizeString(rawTx.id, 50) : `tx-${Date.now()}`,
      title: cleanTitle,
      amount: amountNum,
      type,
      date: rawTx.date && !isNaN(Date.parse(rawTx.date)) ? rawTx.date : new Date().toISOString(),
      spender,
      category,
      paymentMode,
      upiRef: sanitizeString(rawTx.upiRef, 60) || undefined,
      bankName: sanitizeString(rawTx.bankName, 50) || undefined,
      rawSms: rawTx.rawSms ? maskSensitiveFinancialData(rawTx.rawSms) : undefined,
      status: rawTx.status === 'grey_area' ? 'grey_area' : rawTx.status === 'resolved' ? 'resolved' : 'verified',
      greyAreaReason: sanitizeString(rawTx.greyAreaReason, 150) || undefined,
      contextQuestion: sanitizeString(rawTx.contextQuestion, 200) || undefined,
      notes: sanitizeString(rawTx.notes, 250) || undefined,
    };

    currentLedgerState.transactions.unshift(tx);
    currentLedgerState.lastSyncTime = new Date().toISOString();
    persistLedgerState();

    // Check if budget exceeded for this category
    const cat = currentLedgerState.categories.find((c) => c.id === tx.category);
    if (cat && cat.budgetMonthly > 0) {
      const totalSpent = currentLedgerState.transactions
        .filter((t) => t.category === cat.id && t.type === 'debit')
        .reduce((sum, t) => sum + t.amount, 0);

      const pct = (totalSpent / cat.budgetMonthly) * 100;
      if (pct >= 100) {
        currentLedgerState.alerts.unshift({
          id: `alert-budget-${Date.now()}`,
          type: 'critical',
          title: `Budget Exceeded: ${cat.name}`,
          message: `Monthly spend of ₹${totalSpent.toLocaleString('en-IN')} has exceeded the ₹${cat.budgetMonthly.toLocaleString('en-IN')} budget (${Math.round(pct)}%).`,
          timestamp: 'Just now',
          read: false,
          actionType: 'view_budget',
          targetId: cat.id,
        });
      } else if (pct >= 85) {
        currentLedgerState.alerts.unshift({
          id: `alert-budget-${Date.now()}`,
          type: 'warning',
          title: `Budget Alert: ${cat.name} at ${Math.round(pct)}%`,
          message: `You've spent ₹${totalSpent.toLocaleString('en-IN')} of your ₹${cat.budgetMonthly.toLocaleString('en-IN')} limit.`,
          timestamp: 'Just now',
          read: false,
          actionType: 'view_budget',
          targetId: cat.id,
        });
      }
    }

    // If grey area, trigger an alert
    if (tx.status === 'grey_area') {
      currentLedgerState.alerts.unshift({
        id: `alert-grey-${Date.now()}`,
        type: 'grey_area',
        title: `Context Needed: ${tx.title}`,
        message: tx.greyAreaReason || `Please clarify if ₹${tx.amount.toLocaleString('en-IN')} is a shared or personal expense.`,
        timestamp: 'Just now',
        read: false,
        actionType: 'resolve_grey',
        targetId: tx.id,
      });
    }

    res.json({ success: true, transaction: tx, ledger: currentLedgerState });
  } catch {
    res.status(500).json({ error: 'An error occurred while adding the transaction.' });
  }
});

// Resolve grey area context
app.post('/api/ledger/resolve-grey', rateLimit(60, 60000), (req, res) => {
  try {
    const { transactionId, category, note } = req.body;
    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({ error: 'Valid transactionId is required' });
    }

    const tx = currentLedgerState.transactions.find((t) => t.id === transactionId);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const validCategories: CategoryId[] = [
      'dining', 'groceries', 'bills', 'shopping', 'transport', 'entertainment', 'health', 'investments', 'grey_area'
    ];
    if (category && validCategories.includes(category)) {
      tx.category = category;
    }

    tx.status = 'resolved';

    const cleanNote = sanitizeString(note, 200);
    tx.contextResolution = {
      note: cleanNote,
      resolvedAt: new Date().toISOString(),
    };
    if (cleanNote) {
      tx.notes = tx.notes ? `${tx.notes} • ${cleanNote}` : cleanNote;
    }

    // Dismiss associated grey area alert
    currentLedgerState.alerts = currentLedgerState.alerts.filter(
      (a) => !(a.actionType === 'resolve_grey' && a.targetId === transactionId)
    );

    currentLedgerState.lastSyncTime = new Date().toISOString();
    persistLedgerState();
    res.json({ success: true, transaction: tx, ledger: currentLedgerState });
  } catch {
    res.status(500).json({ error: 'An error occurred while resolving the transaction.' });
  }
});

// Update an existing transaction with strict ownership check
app.post('/api/ledger/transaction/update', rateLimit(60, 60000), (req, res) => {
  try {
    const { authenticatedSpender } = req.body;
    const transactionId = req.body.transactionId || req.body.transaction?.id;
    const updates = req.body.updates || req.body.transaction;

    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({ error: 'Valid transactionId is required' });
    }

    const tx = currentLedgerState.transactions.find((t) => t.id === transactionId);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Strict Ownership Enforcement: Users cannot edit other spouse's expenses
    if (authenticatedSpender && tx.spender !== authenticatedSpender) {
      const ownerName = tx.spender === 'husband' ? currentLedgerState.husbandName : currentLedgerState.wifeName;
      return res.status(403).json({
        error: `Permission Denied: You cannot edit another person's expense. Only ${ownerName} can edit this entry.`,
      });
    }

    if (updates && typeof updates === 'object') {
      if (updates.title) {
        tx.title = sanitizeString(updates.title, 90);
      }
      if (updates.amount && Number(updates.amount) > 0) {
        tx.amount = Number(updates.amount);
      }
      if (updates.category) {
        const validCategories: CategoryId[] = [
          'dining', 'groceries', 'bills', 'shopping', 'transport', 'entertainment', 'health', 'investments', 'grey_area'
        ];
        if (validCategories.includes(updates.category)) {
          tx.category = updates.category;
        }
      }
      if (updates.paymentMode) {
        if (['UPI', 'Card', 'NetBanking', 'Cash'].includes(updates.paymentMode)) {
          tx.paymentMode = updates.paymentMode;
        }
      }
      if (updates.notes !== undefined) {
        tx.notes = sanitizeString(updates.notes, 250) || undefined;
      }
    }

    currentLedgerState.lastSyncTime = new Date().toISOString();
    persistLedgerState();
    res.json({ success: true, transaction: tx, ledger: currentLedgerState });
  } catch {
    res.status(500).json({ error: 'An error occurred while updating the transaction.' });
  }
});

// Delete a transaction with strict ownership check
app.post('/api/ledger/transaction/delete', rateLimit(60, 60000), (req, res) => {
  try {
    const { transactionId, authenticatedSpender } = req.body;
    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({ error: 'Valid transactionId is required' });
    }

    const txIndex = currentLedgerState.transactions.findIndex((t) => t.id === transactionId);
    if (txIndex === -1) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const tx = currentLedgerState.transactions[txIndex];

    // Strict Ownership Enforcement: Users cannot delete other spouse's expenses
    if (authenticatedSpender && tx.spender !== authenticatedSpender) {
      const ownerName = tx.spender === 'husband' ? currentLedgerState.husbandName : currentLedgerState.wifeName;
      return res.status(403).json({
        error: `Permission Denied: You cannot delete another person's expense. Only ${ownerName} can delete this entry.`,
      });
    }

    currentLedgerState.transactions.splice(txIndex, 1);
    currentLedgerState.lastSyncTime = new Date().toISOString();
    persistLedgerState();
    res.json({ success: true, ledger: currentLedgerState });
  } catch {
    res.status(500).json({ error: 'An error occurred while deleting the transaction.' });
  }
});

// Contribute to savings goal
app.post('/api/ledger/goal-contribution', rateLimit(60, 60000), (req, res) => {
  try {
    const { goalId, contributor, amount } = req.body;
    const amountNum = Number(amount);
    if (!isFinite(amountNum) || amountNum <= 0 || amountNum > 10000000) {
      return res.status(400).json({ error: 'Contribution amount must be a positive number under ₹1,00,00,000' });
    }

    const goal = currentLedgerState.goals.find((g) => g.id === goalId);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const cleanContributor: SpenderId = contributor === 'wife' ? 'wife' : 'husband';
    goal.currentAmount += amountNum;
    goal.contributions.push({
      id: `c-${Date.now()}`,
      contributor: cleanContributor,
      amount: amountNum,
      date: new Date().toISOString(),
    });

    if (goal.currentAmount >= goal.targetAmount) {
      currentLedgerState.alerts.unshift({
        id: `alert-goal-done-${Date.now()}`,
        type: 'goal',
        title: `Goal Achieved! 🎉`,
        message: `${goal.title} has reached 100% of its target ₹${goal.targetAmount.toLocaleString('en-IN')}!`,
        timestamp: 'Just now',
        read: false,
        actionType: 'view_goal',
        targetId: goal.id,
      });
    }

    currentLedgerState.lastSyncTime = new Date().toISOString();
    persistLedgerState();
    res.json({ success: true, goal, ledger: currentLedgerState });
  } catch {
    res.status(500).json({ error: 'An error occurred while contributing to the savings goal.' });
  }
});

// Wipe all household data (transactions/goals/alerts) but keep the household's
// identity (names, currency, setup, paired devices) intact.
app.post('/api/ledger/reset', (req, res) => {
  currentLedgerState.transactions = [];
  currentLedgerState.goals = [];
  currentLedgerState.alerts = [];
  currentLedgerState.lastSyncTime = new Date().toISOString();
  persistLedgerState();
  res.json({ success: true, ledger: currentLedgerState });
});

// One-time household setup: real family/partner names, currency
app.post('/api/household/setup', (req, res) => {
  try {
    const { familyName, husbandName, wifeName, currency, myRole } = req.body;

    const cleanFamilyName = sanitizeString(familyName, 60);
    const cleanHusbandName = sanitizeString(husbandName, 40);
    const cleanWifeName = sanitizeString(wifeName, 40);
    const cleanCurrency = typeof currency === 'string' && currency.trim() ? currency.trim().slice(0, 3) : '₹';

    if (!cleanFamilyName || !cleanHusbandName || !cleanWifeName) {
      return res.status(400).json({ error: 'Household name and both partner names are required' });
    }
    if (myRole !== 'husband' && myRole !== 'wife') {
      return res.status(400).json({ error: 'myRole must be "husband" or "wife"' });
    }

    currentLedgerState.familyName = cleanFamilyName;
    currentLedgerState.husbandName = cleanHusbandName;
    currentLedgerState.wifeName = cleanWifeName;
    currentLedgerState.currency = cleanCurrency;
    currentLedgerState.setupComplete = true;
    currentLedgerState.lastSyncTime = new Date().toISOString();
    persistLedgerState();

    res.json({ success: true, ledger: currentLedgerState });
  } catch {
    res.status(500).json({ error: 'An error occurred while setting up the household.' });
  }
});

// Register a device's real per-device identity (which role picked this phone)
app.post('/api/ledger/register-device', (req, res) => {
  try {
    const { role } = req.body;
    if (role !== 'husband' && role !== 'wife') {
      return res.status(400).json({ error: 'role must be "husband" or "wife"' });
    }

    const name = role === 'husband' ? currentLedgerState.husbandName : currentLedgerState.wifeName;
    const existing = currentLedgerState.connectedDevices.find((d) => d.owner === role);

    const device: DeviceInfo = {
      id: existing?.id || `dev-${role}-${Date.now()}`,
      name: `${name}'s device`,
      owner: role,
      deviceModel: 'Web / PWA',
      lastActive: 'Just now',
      isOnline: true,
    };

    if (existing) {
      currentLedgerState.connectedDevices = currentLedgerState.connectedDevices.map((d) =>
        d.owner === role ? device : d
      );
    } else {
      currentLedgerState.connectedDevices.push(device);
    }

    currentLedgerState.lastSyncTime = new Date().toISOString();
    persistLedgerState();
    res.json({ success: true, ledger: currentLedgerState });
  } catch {
    res.status(500).json({ error: 'An error occurred while registering this device.' });
  }
});

// AI & Heuristic SMS / UPI Parser Endpoint
app.post('/api/parse-sms', rateLimit(30, 60000), async (req, res) => {
  const { smsText, defaultSpender = 'husband', husbandName, wifeName } = req.body;
  if (!smsText || typeof smsText !== 'string' || smsText.trim().length < 3) {
    return res.status(400).json({ error: 'Valid smsText of at least 3 characters is required' });
  }

  if (smsText.length > 2000) {
    return res.status(400).json({ error: 'smsText exceeds maximum allowed length of 2,000 characters' });
  }

  const safeSpender: SpenderId = defaultSpender === 'wife' ? 'wife' : 'husband';
  const safeHusbandName = sanitizeString(husbandName, 40) || currentLedgerState.husbandName || 'your partner';
  const safeWifeName = sanitizeString(wifeName, 40) || currentLedgerState.wifeName || 'your partner';
  const cleanSms = sanitizeString(smsText, 2000);
  const maskedSms = maskSensitiveFinancialData(cleanSms);
  const ai = getGenAI();

  // If Gemini API is configured, use Gemini 3.8-Flash with structured schema
  if (ai) {
    try {
      const prompt = `You are an expert Indian UPI and banking SMS parsing intelligence for a family finance app called Family Ledger.
Analyze the following bank SMS or UPI notification:
"${maskedSms}"

Categories must be strictly one of:
- dining (restaurants, Zomato, Swiggy, cafes)
- groceries (Blinkit, Zepto, DMart, Instamart, BigBasket, vegetables, daily needs)
- bills (electricity, BESCOM, rent, wifi, broadband, mobile recharge, maintenance)
- shopping (clothing, Zara, Myntra, Amazon, Flipkart, electronics)
- transport (Uber, Ola, Shell petrol, fuel, toll, parking)
- entertainment (movies, Netflix, Apple subscriptions, games)
- health (pharmacy, Apollo, doctors, Cult.fit, hospital)
- investments (mutual funds, Groww, Zerodha, SIP, gold)
- grey_area (ambiguous peer UPI transfer to an individual name or phone number with no clear merchant context, ATM cash withdrawal, generic "UPI/..." transfers, or splits where it is unclear if it is personal vs household)

Determine:
1. title: Clean merchant or payee name
2. amount: Clean positive number (INR)
3. type: "debit" or "credit"
4. category: one of the above
5. paymentMode: "UPI" | "Card" | "NetBanking" | "Cash"
6. bankName: detected bank (e.g. HDFC Bank, ICICI Bank, SBI, etc.)
7. upiRef: UPI reference or transaction ID if present
8. isGreyArea: boolean (true if payee is an individual or ATM or ambiguous transfer)
9. greyAreaReason: why context is needed
10. contextQuestion: A polite, natural question addressing ${safeSpender === 'husband' ? safeHusbandName : safeWifeName} asking for the exact nature of the spend (e.g. household repair vs personal loan).`;

      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              type: { type: Type.STRING },
              category: { type: Type.STRING },
              paymentMode: { type: Type.STRING },
              bankName: { type: Type.STRING },
              upiRef: { type: Type.STRING },
              isGreyArea: { type: Type.BOOLEAN },
              greyAreaReason: { type: Type.STRING },
              contextQuestion: { type: Type.STRING },
            },
            required: ['title', 'amount', 'type', 'category', 'isGreyArea'],
          },
        },
      });

      const parsedJson = JSON.parse(geminiResponse.text || '{}');

      let validCat: CategoryId = 'bills';
      const validCategories: CategoryId[] = [
        'dining', 'groceries', 'bills', 'shopping', 'transport', 'entertainment', 'health', 'investments', 'grey_area'
      ];
      if (validCategories.includes(parsedJson.category as CategoryId)) {
        validCat = parsedJson.category as CategoryId;
      }
      if (parsedJson.isGreyArea) {
        validCat = 'grey_area';
      }

      const rawAmt = Number(parsedJson.amount);
      const safeAmount = isFinite(rawAmt) && rawAmt > 0 && rawAmt <= 50000000 ? Math.round(rawAmt * 100) / 100 : 500;

      const tx: Partial<Transaction> = {
        title: sanitizeString(parsedJson.title, 80) || 'UPI Transaction',
        amount: safeAmount,
        type: parsedJson.type === 'credit' ? 'credit' : 'debit',
        category: validCat,
        paymentMode: ['UPI', 'Card', 'NetBanking', 'Cash'].includes(parsedJson.paymentMode)
          ? parsedJson.paymentMode
          : 'UPI',
        bankName: sanitizeString(parsedJson.bankName, 50) || 'UPI Bank',
        upiRef: sanitizeString(parsedJson.upiRef, 60) || `UPI-${Date.now().toString().slice(-6)}`,
        rawSms: maskedSms,
        status: parsedJson.isGreyArea ? 'grey_area' : 'verified',
        greyAreaReason: sanitizeString(parsedJson.greyAreaReason, 150) || '',
        contextQuestion: sanitizeString(parsedJson.contextQuestion, 200) || '',
        spender: safeSpender,
        date: new Date().toISOString(),
      };

      return res.json({
        success: true,
        source: 'gemini',
        transaction: tx,
      });
    } catch (err: any) {
      console.warn('Gemini parser fallback to heuristic:', err?.message);
    }
  }

  // Fallback heuristic parser
  const heuristicResult = parseSmsHeuristic(maskedSms, safeSpender, safeHusbandName, safeWifeName);
  return res.json({
    success: true,
    source: 'heuristic',
    transaction: {
      ...heuristicResult,
      rawSms: maskedSms,
    },
  });
});

// Start server with Vite middleware in dev or static files in production
async function startServer() {
  currentLedgerState = await initLedgerState();
  console.log(`Ledger storage: ${pool ? 'Postgres (persistent across deploys)' : 'local file (data/ledger.json)'}`);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Family Ledger Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
