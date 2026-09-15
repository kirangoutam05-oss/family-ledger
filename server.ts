import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { EMPTY_LEDGER_STATE } from './src/data/initialData';
import { LedgerState, Transaction, SavingsGoal, BudgetAlert, Category, CategoryId, SpenderId, DeviceInfo, CATEGORY_ICON_OPTIONS } from './src/types';

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

// Category ids are dynamic (users can add/rename/delete categories), so validity is
// always checked against the household's current category list, not a fixed enum.
function getValidCategoryIds(): string[] {
  return currentLedgerState.categories.map((c) => c.id);
}

// Persistent state. When DATABASE_URL is set (production), the ledger lives in a
// single-row Postgres table and survives redeploys, not just restarts. Without it
// (local dev), falls back to a JSON file on disk — convenient locally, but does not
// survive a redeploy on ephemeral hosting.
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'ledger.json');
const LEDGER_ROW_ID = 'default';

// `pool` is mutable: if Postgres is unreachable or misconfigured at startup, we
// fall back to file storage rather than crashing the whole server — a bad
// DATABASE_URL should degrade the app, not take it down entirely.
let pool = process.env.DATABASE_URL
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

  try {
    await ensureLedgerTable();
    const result = await pool.query('SELECT data FROM ledger_state WHERE id = $1', [LEDGER_ROW_ID]);
    if (result.rows.length > 0) {
      return result.rows[0].data as LedgerState;
    }

    const initial = JSON.parse(JSON.stringify(EMPTY_LEDGER_STATE));
    await pool.query('INSERT INTO ledger_state (id, data) VALUES ($1, $2)', [LEDGER_ROW_ID, initial]);
    return initial;
  } catch (err) {
    console.error(
      'Could not connect to Postgres (check DATABASE_URL). Falling back to local file storage for this run:',
      err
    );
    pool = null;
    return loadLedgerStateFromFile();
  }
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

// Bank/UPI SMS usually carry the actual transaction date & time in the text
// itself (e.g. "on 15-09-26", "15-Sep-2026 19:06:23", "at 07:06 PM") rather
// than arriving the moment the spend happened — so a naive "date: now" loses
// that. Pull it out of the raw text with regex instead of trusting an LLM to
// do date arithmetic; falls back to null (caller uses "now") if nothing matches.
const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function extractDateTimeFromSms(sms: string): string | null {
  const dateMatch = sms.match(/\b(\d{1,2})[-\/]([A-Za-z]{3,}|\d{1,2})[-\/](\d{2,4})\b/);
  if (!dateMatch) return null;

  const day = parseInt(dateMatch[1], 10);
  const monthPart = dateMatch[2];
  const month = /^\d+$/.test(monthPart)
    ? parseInt(monthPart, 10) - 1
    : MONTH_ABBR[monthPart.slice(0, 3).toLowerCase()];
  let year = parseInt(dateMatch[3], 10);
  if (year < 100) year += 2000;

  if (month === undefined || month < 0 || month > 11 || day < 1 || day > 31) return null;

  let hours = 12;
  let minutes = 0;
  let seconds = 0;
  const timeMatch = sms.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
    seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    const meridiem = timeMatch[4]?.toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  }

  const parsed = new Date(year, month, day, hours, minutes, seconds);
  if (isNaN(parsed.getTime())) return null;

  // Guard against false-positive matches (e.g. a card number fragment) that
  // resolve to a date implausibly far in the future or past.
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const fiveYearsMs = 5 * 365 * oneDayMs;
  if (parsed.getTime() > now + oneDayMs || parsed.getTime() < now - fiveYearsMs) return null;

  return parsed.toISOString();
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

  // Type: debit vs credit. Bank SMS for a UPI transfer often mention BOTH
  // sides in one message — e.g. "Acct debited for Rs 40; Minhajul Karim
  // credited" — where "credited" describes the payee, not the user's own
  // account. Checking for "credited" alone misreads that as an incoming
  // payment, so "debited" (money leaving the user's account) wins whenever
  // both keywords are present.
  const hasDebitKeyword = /debited|spent|withdrawn|charged|paid/i.test(cleanSms);
  const hasCreditKeyword = /credited|received|refund|deposited/i.test(cleanSms);
  const type: 'debit' | 'credit' = hasDebitKeyword ? 'debit' : hasCreditKeyword ? 'credit' : 'debit';

  // Detect payment mode
  let paymentMode: 'UPI' | 'Card' | 'NetBanking' | 'Cash' | 'AmazonPayLater' = 'UPI';
  if (/ATM|withdrawn|cash/i.test(cleanSms)) {
    paymentMode = 'Cash';
  } else if (/amazon\s*pay\s*later/i.test(cleanSms)) {
    paymentMode = 'AmazonPayLater';
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
    // Ambiguous UPI to person / number — the payee is named either as
    // "...to NAME" or, in ICICI-style two-sided messages, as "NAME credited".
    const personMatch =
      cleanSms.match(/to\s+([A-Za-z\s]+?)(?:\s*\([^\)]*\)|\s*ref|\s*on|\s*via|\.|$)/i) ||
      cleanSms.match(/;\s*([A-Za-z][A-Za-z\s]{2,40}?)\s+credited/i);
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
    date: extractDateTimeFromSms(cleanSms) || new Date().toISOString(),
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

    const category: CategoryId = getValidCategoryIds().includes(rawTx.category as string)
      ? (rawTx.category as CategoryId)
      : 'bills';

    const spender: SpenderId = rawTx.spender === 'wife' ? 'wife' : 'husband';
    const type: 'debit' | 'credit' = rawTx.type === 'credit' ? 'credit' : 'debit';
    const paymentMode: 'UPI' | 'Card' | 'NetBanking' | 'Cash' | 'AmazonPayLater' =
      ['UPI', 'Card', 'NetBanking', 'Cash', 'AmazonPayLater'].includes(rawTx.paymentMode as any)
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

    if (category && getValidCategoryIds().includes(category)) {
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
        if (getValidCategoryIds().includes(updates.category)) {
          tx.category = updates.category;
        }
      }
      if (updates.paymentMode) {
        if (['UPI', 'Card', 'NetBanking', 'Cash', 'AmazonPayLater'].includes(updates.paymentMode)) {
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

// Update household/partner names or currency after initial setup — same
// validation as /api/household/setup, but doesn't touch setupComplete and
// doesn't require myRole (this isn't a "which phone is this" flow).
app.post('/api/household/update', (req, res) => {
  try {
    const { familyName, husbandName, wifeName, currency } = req.body;

    const cleanFamilyName = sanitizeString(familyName, 60);
    const cleanHusbandName = sanitizeString(husbandName, 40);
    const cleanWifeName = sanitizeString(wifeName, 40);
    const cleanCurrency = typeof currency === 'string' && currency.trim() ? currency.trim().slice(0, 3) : currentLedgerState.currency;

    if (!cleanFamilyName || !cleanHusbandName || !cleanWifeName) {
      return res.status(400).json({ error: 'Household name and both partner names are required' });
    }

    currentLedgerState.familyName = cleanFamilyName;
    currentLedgerState.husbandName = cleanHusbandName;
    currentLedgerState.wifeName = cleanWifeName;
    currentLedgerState.currency = cleanCurrency;
    currentLedgerState.lastSyncTime = new Date().toISOString();
    persistLedgerState();

    res.json({ success: true, ledger: currentLedgerState });
  } catch {
    res.status(500).json({ error: 'An error occurred while updating the household.' });
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

const DEFAULT_CATEGORY_COLOR = '#8E8E93';

function slugifyToCategoryId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || 'category';
  return `${base}-${Date.now().toString(36)}`;
}

// Add a new custom category
app.post('/api/ledger/categories', rateLimit(30, 60000), (req, res) => {
  try {
    const cleanName = sanitizeString(req.body?.name, 40);
    if (!cleanName) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const icon = CATEGORY_ICON_OPTIONS.includes(req.body?.icon) ? req.body.icon : 'HelpCircle';
    const color = typeof req.body?.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(req.body.color)
      ? req.body.color
      : DEFAULT_CATEGORY_COLOR;
    const budgetMonthly = Math.max(0, Math.min(10000000, Number(req.body?.budgetMonthly) || 0));

    const newCategory: Category = {
      id: slugifyToCategoryId(cleanName),
      name: cleanName,
      color,
      badgeBg: '',
      badgeText: '',
      badgeBorder: 'border-black/[0.08] dark:border-white/[0.1]',
      icon,
      budgetMonthly,
    };

    currentLedgerState.categories.push(newCategory);
    currentLedgerState.lastSyncTime = new Date().toISOString();
    persistLedgerState();
    res.json({ success: true, category: newCategory, ledger: currentLedgerState });
  } catch {
    res.status(500).json({ error: 'An error occurred while adding the category.' });
  }
});

// Update an existing category's name, icon, color, or budget
app.post('/api/ledger/categories/update', rateLimit(30, 60000), (req, res) => {
  try {
    const { categoryId } = req.body;
    if (!categoryId || typeof categoryId !== 'string') {
      return res.status(400).json({ error: 'Valid categoryId is required' });
    }

    const category = currentLedgerState.categories.find((c) => c.id === categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (req.body.name !== undefined) {
      const cleanName = sanitizeString(req.body.name, 40);
      if (cleanName) category.name = cleanName;
    }
    if (CATEGORY_ICON_OPTIONS.includes(req.body.icon)) {
      category.icon = req.body.icon;
    }
    if (typeof req.body.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(req.body.color)) {
      category.color = req.body.color;
    }
    if (req.body.budgetMonthly !== undefined) {
      category.budgetMonthly = Math.max(0, Math.min(10000000, Number(req.body.budgetMonthly) || 0));
    }

    currentLedgerState.lastSyncTime = new Date().toISOString();
    persistLedgerState();
    res.json({ success: true, category, ledger: currentLedgerState });
  } catch {
    res.status(500).json({ error: 'An error occurred while updating the category.' });
  }
});

// Delete a category. Existing transactions in it are reassigned to "bills" so
// nothing is left pointing at a category that no longer exists.
app.post('/api/ledger/categories/delete', rateLimit(30, 60000), (req, res) => {
  try {
    const { categoryId } = req.body;
    if (!categoryId || typeof categoryId !== 'string') {
      return res.status(400).json({ error: 'Valid categoryId is required' });
    }
    if (categoryId === 'grey_area') {
      return res.status(403).json({ error: 'The Grey Area category is used by the app and cannot be deleted.' });
    }

    const exists = currentLedgerState.categories.some((c) => c.id === categoryId);
    if (!exists) {
      return res.status(404).json({ error: 'Category not found' });
    }

    currentLedgerState.categories = currentLedgerState.categories.filter((c) => c.id !== categoryId);
    const fallbackCategoryId = currentLedgerState.categories.some((c) => c.id === 'bills')
      ? 'bills'
      : currentLedgerState.categories[0]?.id || 'grey_area';
    currentLedgerState.transactions.forEach((tx) => {
      if (tx.category === categoryId) tx.category = fallbackCategoryId;
    });

    currentLedgerState.lastSyncTime = new Date().toISOString();
    persistLedgerState();
    res.json({ success: true, ledger: currentLedgerState });
  } catch {
    res.status(500).json({ error: 'An error occurred while deleting the category.' });
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
3. type: "debit" or "credit" — many bank SMS describe BOTH sides of a UPI
   transfer in one message (e.g. "Acct debited for Rs 40; Rahul Sharma
   credited"), where "credited" refers to the payee's account, not the
   user's own. If the message says the user's account/card was debited,
   the type is "debit" even if a payee's name also appears next to the
   word "credited".
4. category: one of the above
5. paymentMode: "UPI" | "Card" | "NetBanking" | "Cash" | "AmazonPayLater"
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
      if (getValidCategoryIds().includes(parsedJson.category)) {
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
        paymentMode: ['UPI', 'Card', 'NetBanking', 'Cash', 'AmazonPayLater'].includes(parsedJson.paymentMode)
          ? parsedJson.paymentMode
          : 'UPI',
        bankName: sanitizeString(parsedJson.bankName, 50) || 'UPI Bank',
        upiRef: sanitizeString(parsedJson.upiRef, 60) || `UPI-${Date.now().toString().slice(-6)}`,
        rawSms: maskedSms,
        status: parsedJson.isGreyArea ? 'grey_area' : 'verified',
        greyAreaReason: sanitizeString(parsedJson.greyAreaReason, 150) || '',
        contextQuestion: sanitizeString(parsedJson.contextQuestion, 200) || '',
        spender: safeSpender,
        date: extractDateTimeFromSms(cleanSms) || new Date().toISOString(),
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
