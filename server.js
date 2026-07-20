const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Use better-sqlite3 (synchronous, works on Render)
const Database = require('better-sqlite3');
const db = new Database('database.sqlite');
db.pragma('foreign_keys = ON');

const app = express();
const PORT = process.env.PORT || 5000;

console.log('🔑 API Key loaded:', process.env.OPENROUTER_API_KEY ? '✅ YES' : '❌ NO');

// CORS
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://sabit-api-builder-frontend.onrender.com',
    'https://*.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ======================== DATABASE SETUP ========================

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    credits INTEGER DEFAULT 5,
    lastResetDate TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS apis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    code TEXT,
    isPublic INTEGER DEFAULT 0,
    price INTEGER DEFAULT 0,
    userId INTEGER NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    paymentID TEXT UNIQUE,
    amount DECIMAL(10,2),
    credits INTEGER,
    status TEXT DEFAULT 'pending',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Initialize credits and lastResetDate for existing users
const today = new Date().toISOString().split('T')[0];
const initStmt = db.prepare(`
  UPDATE users 
  SET credits = COALESCE(credits, 5), 
      lastResetDate = COALESCE(lastResetDate, ?) 
  WHERE credits IS NULL OR lastResetDate IS NULL
`);
const info = initStmt.run(today);
console.log(`✅ Database initialized (${info.changes} users updated)`);
console.log('✅ Database connected (better-sqlite3)');

// ======================== HELPER FUNCTIONS ========================

function getUserByUsername(username) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username);
}

function getUserById(id) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id);
}

function createUser(username, password) {
  const stmt = db.prepare(`
    INSERT INTO users (username, password, credits, lastResetDate) 
    VALUES (?, ?, 5, ?)
  `);
  const result = stmt.run(username, password, today);
  return { id: result.lastInsertRowid, username };
}

function insertApi(name, description, code, userId, isPublic, price) {
  const stmt = db.prepare(`
    INSERT INTO apis (name, description, code, userId, isPublic, price) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, description, code, userId, isPublic || 0, price || 0);
  return { 
    id: result.lastInsertRowid, 
    name, description, code, userId, 
    isPublic: isPublic || 0, 
    price: price || 0 
  };
}

function getApisByUser(userId) {
  const stmt = db.prepare(`
    SELECT * FROM apis WHERE userId = ? ORDER BY createdAt DESC
  `);
  return stmt.all(userId);
}

// ======================== AUTH ROUTES ========================

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const existing = getUserByUsername(username);
    if (existing) return res.status(400).json({ message: 'Username already taken!' });
    const hashed = await bcrypt.hash(password, 10);
    const user = createUser(username, hashed);
    res.status(201).json({ message: 'User registered successfully!', user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = getUserByUsername(username);
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user.id, username: user.username },
      'your_super_secret_key',
      { expiresIn: '7d' }
    );
    res.json({
      message: 'Login successful!',
      token,
      username: user.username,
      userId: user.id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ======================== API CRUD ========================

app.post('/api/create', (req, res) => {
  const { name, description, code, userId, isPublic, price } = req.body;
  if (!name || !description) {
    return res.status(400).json({ message: 'Name and description are required!' });
  }
  const user = getUserById(userId);
  if (!user) return res.status(400).json({ message: 'Invalid user ID' });
  const finalCode = code || `return { message: "Hello from your API!" };`;
  const newApi = insertApi(name, description, finalCode, userId, isPublic, price);
  res.status(201).json({ message: 'API saved successfully!', api: newApi });
});

app.get('/api/apis', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });
  const apis = getApisByUser(userId);
  res.json(apis);
});

app.put('/api/update/:id', (req, res) => {
  const { userId, name, description, code, isPublic, price } = req.body;
  const apiId = req.params.id;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });
  if (!name || !description) return res.status(400).json({ message: 'Name and description are required!' });

  const stmt = db.prepare('SELECT * FROM apis WHERE id = ?');
  const api = stmt.get(apiId);
  if (!api) return res.status(404).json({ message: 'API not found' });
  if (api.userId !== parseInt(userId)) return res.status(403).json({ message: 'You do not own this API' });

  const finalCode = code || `return { message: "No code defined for this API." };`;
  const publicStatus = isPublic ? 1 : 0;
  const apiPrice = price || 0;

  const updateStmt = db.prepare(`
    UPDATE apis SET name = ?, description = ?, code = ?, isPublic = ?, price = ? WHERE id = ?
  `);
  updateStmt.run(name, description, finalCode, publicStatus, apiPrice, apiId);

  res.json({
    message: '✅ API updated successfully!',
    api: { id: parseInt(apiId), name, description, code: finalCode, userId: parseInt(userId), isPublic: publicStatus, price: apiPrice }
  });
});

app.delete('/api/delete/:id', (req, res) => {
  const { userId } = req.body;
  const apiId = req.params.id;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });

  const stmt = db.prepare('SELECT * FROM apis WHERE id = ?');
  const api = stmt.get(apiId);
  if (!api) return res.status(404).json({ message: 'API not found' });
  if (api.userId !== parseInt(userId)) return res.status(403).json({ message: 'You do not own this API' });

  const deleteStmt = db.prepare('DELETE FROM apis WHERE id = ?');
  deleteStmt.run(apiId);
  res.json({ message: '🗑️ API deleted successfully!' });
});

// ======================== MARKETPLACE ========================

app.get('/api/marketplace', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });
  const stmt = db.prepare(`
    SELECT apis.*, users.username as creatorName 
    FROM apis 
    JOIN users ON apis.userId = users.id 
    WHERE apis.isPublic = 1 AND apis.userId != ? 
    ORDER BY apis.createdAt DESC
  `);
  const rows = stmt.all(userId);
  res.json(rows);
});

// ======================== CREDITS (with daily reset) ========================

app.get('/api/credits', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'User ID required' });

  const stmt = db.prepare('SELECT credits, lastResetDate FROM users WHERE id = ?');
  const row = stmt.get(userId);
  if (!row) return res.status(404).json({ error: 'User not found' });

  const today = new Date().toISOString().split('T')[0];
  let credits = row.credits || 0;

  if (row.lastResetDate !== today) {
    credits = 5;
    const updateStmt = db.prepare('UPDATE users SET credits = ?, lastResetDate = ? WHERE id = ?');
    updateStmt.run(credits, today, userId);
    console.log(`✅ User ${userId} credits reset to 5`);
  }
  res.json({ credits });
});

// ======================== EXECUTION (with credit transfer) ========================

app.post('/api/execute', (req, res) => {
  const { apiId, userId, params } = req.body;
  if (!apiId || !userId) return res.status(400).json({ error: 'Missing apiId or userId' });

  const apiStmt = db.prepare('SELECT * FROM apis WHERE id = ?');
  const api = apiStmt.get(apiId);
  if (!api) return res.status(404).json({ error: 'API not found' });

  const isOwner = api.userId === parseInt(userId);
  const isPublic = api.isPublic === 1;
  if (!isOwner && !isPublic) {
    return res.status(403).json({ error: 'You do not own this API and it is not public.' });
  }

  const userStmt = db.prepare('SELECT credits FROM users WHERE id = ?');
  const userRow = userStmt.get(userId);
  if (!userRow) return res.status(404).json({ error: 'User not found' });

  const price = api.price || 0;
  if (!isOwner && price > 0) {
    if (userRow.credits < price) {
      return res.status(403).json({ 
        error: `Insufficient credits. This API costs ${price} credits. You have ${userRow.credits}.` 
      });
    }
  }

  // We'll wrap the credit updates in a transaction using better-sqlite3's transaction
  const transaction = db.transaction(() => {
    if (!isOwner && price > 0) {
      // Deduct from runner
      const deductStmt = db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?');
      deductStmt.run(price, userId);
      // Add to creator
      const addStmt = db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?');
      addStmt.run(price, api.userId);
    } else if (!isOwner && price === 0) {
      if (userRow.credits <= 0) {
        throw new Error('Insufficient credits. Please purchase more.');
      }
      const deductStmt = db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ?');
      deductStmt.run(userId);
    }
    // Owner runs for free – no credit change
  });

  try {
    transaction();
    // Execute the API code
    let code = api.code || `return { message: "No code defined for this API." };`;
    const sandbox = {
      params: params || {},
      console: { log: (...args) => { console.log('[API LOG]', ...args); } },
    };
    const context = vm.createContext(sandbox);
    const script = new vm.Script(`(function(params) { ${code} })`);
    const userFunction = script.runInContext(context);
    const result = userFunction(params);
    res.json({ success: true, output: result, message: '✅ Execution successful!' });
  } catch (execError) {
    console.error('Execution Error:', execError.message);
    res.status(500).json({
      success: false,
      error: execError.message,
      message: '❌ Your code crashed. Check the syntax!'
    });
  }
});

// ======================== PAYMENT (Mock) ========================

app.post('/api/payment/create', async (req, res) => {
  console.log('\n📥 Payment creation request received');
  const { amount, credits } = req.body;
  const tokenHeader = req.headers.authorization;
  if (!tokenHeader) return res.status(401).json({ error: 'Unauthorized – missing token' });

  const token = tokenHeader.split(' ')[1];
  let userId;
  try {
    const decoded = jwt.verify(token, 'your_super_secret_key');
    userId = decoded.id;
  } catch (err) {
    console.error('❌ Invalid token:', err.message);
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (!amount || !credits) {
    return res.status(400).json({ error: 'Amount and credits are required' });
  }

  const updateStmt = db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?');
  const info = updateStmt.run(credits, userId);
  console.log(`✅ Added ${credits} credits to user ${userId}`);

  const fakePaymentID = `PAY-${Date.now()}-${userId}`;
  const insertStmt = db.prepare(`
    INSERT INTO payments (userId, paymentID, amount, credits, status) VALUES (?, ?, ?, ?, 'completed')
  `);
  insertStmt.run(userId, fakePaymentID, amount, credits);

  res.json({
    success: true,
    message: `✅ ${credits} credits added successfully! (Mock payment)`,
    creditsAdded: credits
  });
});

// ======================== AI ROUTE ========================

async function getFreeModels(apiKey) {
  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const allModels = response.data.data || [];
    return allModels.filter(m => m.id.endsWith(':free')).map(m => m.id);
  } catch (error) {
    console.error('Failed to fetch models:', error.message);
    return [];
  }
}

async function callModel(model, description, apiKey) {
  const prompt = `
You are an expert API designer.
Based on the user's description below, generate a JSON object with a suitable API name and a detailed description.

User Description: "${description}"

Respond ONLY with a valid JSON object in this exact format:
{
    "name": "A short, descriptive name for the API",
    "description": "A detailed, technical description of what this API should do, including potential input parameters and output."
}
`;
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: model,
      messages: [
        { role: 'system', content: 'You are a helpful API design assistant. Always respond with valid JSON only. Do not wrap the JSON in markdown or add any extra text outside the JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'API Builder Project'
      },
      timeout: 15000
    }
  );
  const raw = response.data.choices[0].message.content;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');
  return JSON.parse(jsonMatch[0]);
}

app.post('/api/gemini-clarify', async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: 'Please provide a description.' });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key missing.' });
  let freeModels = await getFreeModels(apiKey);
  console.log(`📋 Found ${freeModels.length} free models`);
  let lastError = null;
  for (const model of freeModels) {
    try {
      console.log(`🔄 Trying free model: ${model}`);
      const result = await callModel(model, description, apiKey);
      console.log(`✅ Success with model: ${model}`);
      return res.json(result);
    } catch (error) {
      console.warn(`❌ Model ${model} failed:`, error.message);
      lastError = error;
    }
  }
  const PAID_MODELS = ['openai/gpt-4o-mini', 'anthropic/claude-3-haiku'];
  for (const model of PAID_MODELS) {
    try {
      console.log(`🔄 Trying paid model: ${model}`);
      const result = await callModel(model, description, apiKey);
      console.log(`✅ Success with paid model: ${model}`);
      return res.json(result);
    } catch (error) {
      console.warn(`❌ Paid model ${model} failed:`, error.message);
      lastError = error;
    }
  }
  console.error('All models failed.');
  let errorMsg = 'AI service unavailable. ';
  if (lastError && lastError.response && lastError.response.data && lastError.response.data.error) {
    const err = lastError.response.data.error;
    errorMsg += `OpenRouter says: ${err.message || JSON.stringify(err)}`;
  } else {
    errorMsg += 'Please check your internet connection and OpenRouter credits.';
  }
  res.status(500).json({ error: errorMsg });
});

// ======================== START SERVER ========================

app.listen(PORT, () => {
  console.log(`✅ Backend brain running at http://localhost:${PORT}`);
  console.log(`✅ Server ready for Render deployment`);
});