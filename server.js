const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const vm = require('vm');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

// ============================================================
// 🔥 DYNAMIC PORT - CRITICAL FOR RENDER DEPLOYMENT
// ============================================================
const PORT = process.env.PORT || 5000;

console.log('🔑 API Key loaded:', process.env.OPENROUTER_API_KEY ? '✅ YES' : '❌ NO');

// ============================================================
// 🔥 CORS - CRITICAL FOR RENDER DEPLOYMENT
// ============================================================
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

// ============================================================
// DATABASE SETUP
// ============================================================
const db = new sqlite3.Database('database.sqlite');

db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  // APIs table
  db.run(`
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

  // Payments table
  db.run(`
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
  `, (err) => { if (!err) console.log('✅ Payments table ready'); });

  // ============================================================
  // 🔥 DAILY FREE TRIAL RESET - COLUMN
  // ============================================================
  db.run(`ALTER TABLE users ADD COLUMN lastResetDate TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding lastResetDate:', err.message);
    } else {
      console.log('✅ lastResetDate column ready');
    }
  });

  // Add missing columns
  db.run(`ALTER TABLE apis ADD COLUMN code TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding code column:', err.message);
    } else {
      console.log('✅ Code column ready');
    }
  });

  db.run(`ALTER TABLE apis ADD COLUMN isPublic INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding isPublic column:', err.message);
    } else {
      console.log('✅ isPublic column ready');
    }
  });

  db.run(`ALTER TABLE apis ADD COLUMN price INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding price column:', err.message);
    } else {
      console.log('✅ price column ready');
    }
  });

  db.run(`ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 5`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding credits column:', err.message);
    } else {
      console.log('✅ credits column ready');
    }
  });

  // Set default credits for all users
  db.run(`UPDATE users SET credits = 5 WHERE credits IS NULL OR credits = 0`, function(err) {
    if (err) {
      console.error('Error updating credits:', err.message);
    } else {
      console.log(`✅ All users now have 5 credits (${this.changes} rows updated)`);
    }
  });

  // ============================================================
  // 🔥 DAILY FREE TRIAL RESET - INITIALIZE lastResetDate
  // ============================================================
  const today = new Date().toISOString().split('T')[0];
  db.run(`UPDATE users SET lastResetDate = ? WHERE lastResetDate IS NULL`, [today], function(err) {
    if (err) {
      console.error('Error setting lastResetDate:', err.message);
    } else {
      console.log(`✅ Initialized lastResetDate for ${this.changes} users`);
    }
  });
});

// ============================================================
// DATABASE HELPERS
// ============================================================
function getUserByUsername(username, callback) {
  db.get('SELECT * FROM users WHERE username = ?', [username], callback);
}

function getUserById(id, callback) {
  db.get('SELECT * FROM users WHERE id = ?', [id], callback);
}

function createUser(username, password, callback) {
  const today = new Date().toISOString().split('T')[0];
  db.run(
    'INSERT INTO users (username, password, credits, lastResetDate) VALUES (?, ?, 5, ?)',
    [username, password, today],
    function(err) {
      callback(err, { id: this.lastID, username });
    }
  );
}

function insertApi(name, description, code, userId, isPublic, price, callback) {
  db.run(
    'INSERT INTO apis (name, description, code, userId, isPublic, price) VALUES (?, ?, ?, ?, ?, ?)',
    [name, description, code, userId, isPublic || 0, price || 0],
    function(err) {
      callback(err, { id: this.lastID, name, description, code, userId, isPublic: isPublic || 0, price: price || 0 });
    }
  );
}

function getApisByUser(userId, callback) {
  db.all(
    'SELECT * FROM apis WHERE userId = ? ORDER BY createdAt DESC',
    [userId],
    callback
  );
}

// ============================================================
// AUTH ROUTES
// ============================================================
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    getUserByUsername(username, async (err, existing) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (existing) return res.status(400).json({ message: 'Username already taken!' });
      const hashed = await bcrypt.hash(password, 10);
      createUser(username, hashed, (err, user) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.status(201).json({ message: 'User registered successfully!', user });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    getUserByUsername(username, async (err, user) => {
      if (err) return res.status(500).json({ message: 'Database error' });
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
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// API CRUD
// ============================================================
app.post('/api/create', (req, res) => {
  const { name, description, code, userId, isPublic, price } = req.body;
  if (!name || !description) {
    return res.status(400).json({ message: 'Name and description are required!' });
  }
  const finalCode = code || `return { message: "Hello from your API!" };`;
  const publicStatus = isPublic ? 1 : 0;
  const apiPrice = price || 0;
  getUserById(userId, (err, user) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!user) return res.status(400).json({ message: 'Invalid user ID' });
    insertApi(name, description, finalCode, userId, publicStatus, apiPrice, (err, newApi) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.status(201).json({ message: 'API saved successfully!', api: newApi });
    });
  });
});

app.get('/api/apis', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });
  getApisByUser(userId, (err, apis) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json(apis);
  });
});

app.put('/api/update/:id', (req, res) => {
  const { userId, name, description, code, isPublic, price } = req.body;
  const apiId = req.params.id;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });
  if (!name || !description) return res.status(400).json({ message: 'Name and description are required!' });
  db.get('SELECT * FROM apis WHERE id = ?', [apiId], (err, api) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!api) return res.status(404).json({ message: 'API not found' });
    if (api.userId !== parseInt(userId)) return res.status(403).json({ message: 'You do not own this API' });
    const finalCode = code || `return { message: "No code defined for this API." };`;
    const publicStatus = isPublic ? 1 : 0;
    const apiPrice = price || 0;
    db.run(
      'UPDATE apis SET name = ?, description = ?, code = ?, isPublic = ?, price = ? WHERE id = ?',
      [name, description, finalCode, publicStatus, apiPrice, apiId],
      function(err) {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json({
          message: '✅ API updated successfully!',
          api: { id: parseInt(apiId), name, description, code: finalCode, userId: parseInt(userId), isPublic: publicStatus, price: apiPrice }
        });
      }
    );
  });
});

app.delete('/api/delete/:id', (req, res) => {
  const { userId } = req.body;
  const apiId = req.params.id;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });
  db.get('SELECT * FROM apis WHERE id = ?', [apiId], (err, api) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!api) return res.status(404).json({ message: 'API not found' });
    if (api.userId !== parseInt(userId)) return res.status(403).json({ message: 'You do not own this API' });
    db.run('DELETE FROM apis WHERE id = ?', [apiId], function(err) {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: '🗑️ API deleted successfully!' });
    });
  });
});

// ============================================================
// MARKETPLACE
// ============================================================
app.get('/api/marketplace', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ message: 'User ID is required.' });
  db.all(
    `SELECT apis.*, users.username as creatorName 
     FROM apis 
     JOIN users ON apis.userId = users.id 
     WHERE apis.isPublic = 1 AND apis.userId != ? 
     ORDER BY apis.createdAt DESC`,
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json(rows);
    }
  );
});

// ============================================================
// 🔥 DAILY FREE TRIAL RESET - CREDITS ROUTE
// ============================================================
app.get('/api/credits', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'User ID required' });

  db.get('SELECT credits, lastResetDate FROM users WHERE id = ?', [userId], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    let credits = row.credits || 0;

    // 🔥 Check if reset is needed (lastResetDate is NULL or not today)
    if (row.lastResetDate !== today) {
      // Reset to 5 free credits
      credits = 5;
      db.run(
        'UPDATE users SET credits = ?, lastResetDate = ? WHERE id = ?',
        [credits, today, userId],
        function(err) {
          if (err) {
            console.error('Reset failed:', err.message);
            return res.status(500).json({ error: 'Failed to reset credits' });
          }
          console.log(`✅ User ${userId} credits reset to 5 (${this.changes} rows updated)`);
          res.json({ credits: credits });
        }
      );
    } else {
      // No reset needed
      res.json({ credits: credits });
    }
  });
});

// ============================================================
// EXECUTION with Credit Transfer
// ============================================================
app.post('/api/execute', (req, res) => {
  const { apiId, userId, params } = req.body;
  if (!apiId || !userId) return res.status(400).json({ error: 'Missing apiId or userId' });

  db.get('SELECT * FROM apis WHERE id = ?', [apiId], (err, api) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!api) return res.status(404).json({ error: 'API not found' });

    const isOwner = api.userId === parseInt(userId);
    const isPublic = api.isPublic === 1;

    if (!isOwner && !isPublic) {
      return res.status(403).json({ error: 'You do not own this API and it is not public.' });
    }

    db.get('SELECT credits FROM users WHERE id = ?', [userId], (err, userRow) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!userRow) return res.status(404).json({ error: 'User not found' });

      const price = api.price || 0;

      if (!isOwner && price > 0) {
        if (userRow.credits < price) {
          return res.status(403).json({ 
            error: `Insufficient credits. This API costs ${price} credits. You have ${userRow.credits}.` 
          });
        }
      }

      db.run('BEGIN TRANSACTION');

      if (!isOwner && price > 0) {
        db.run('UPDATE users SET credits = credits - ? WHERE id = ?', [price, userId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Failed to deduct credits' });
          }
          db.run('UPDATE users SET credits = credits + ? WHERE id = ?', [price, api.userId], (err) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Failed to transfer credits' });
            }
            executeApiCode(api, params, res, db);
          });
        });
      } else if (!isOwner && price === 0) {
        if (userRow.credits <= 0) {
          return res.status(403).json({ error: 'Insufficient credits. Please purchase more.' });
        }
        db.run('UPDATE users SET credits = credits - 1 WHERE id = ?', [userId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Failed to deduct credit' });
          }
          executeApiCode(api, params, res, db);
        });
      } else {
        executeApiCode(api, params, res, db);
      }
    });
  });
});

function executeApiCode(api, params, res, db) {
  let code = api.code || `return { message: "No code defined for this API." };`;
  const sandbox = {
    params: params || {},
    console: { log: (...args) => { console.log('[API LOG]', ...args); } },
  };

  try {
    const context = vm.createContext(sandbox);
    const script = new vm.Script(`(function(params) { ${code} })`);
    const userFunction = script.runInContext(context);
    const result = userFunction(params);

    db.run('COMMIT');
    res.json({ success: true, output: result, message: '✅ Execution successful!' });
  } catch (execError) {
    db.run('ROLLBACK');
    console.error('Execution Error:', execError.message);
    res.status(500).json({
      success: false,
      error: execError.message,
      message: '❌ Your code crashed. Check the syntax!'
    });
  }
}

// ============================================================
// PAYMENT ROUTE (Mock – instantly adds credits)
// ============================================================
app.post('/api/payment/create', async (req, res) => {
  console.log('\n📥 Payment creation request received');
  console.log('  Body:', req.body);

  const { amount, credits } = req.body;
  const tokenHeader = req.headers.authorization;

  if (!tokenHeader) {
    return res.status(401).json({ error: 'Unauthorized – missing token' });
  }

  const token = tokenHeader.split(' ')[1];

  let userId;
  try {
    const decoded = jwt.verify(token, 'your_super_secret_key');
    userId = decoded.id;
    console.log('  User ID from token:', userId);
  } catch (err) {
    console.error('❌ Invalid token:', err.message);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (!amount || !credits) {
    console.error('❌ Missing amount or credits');
    return res.status(400).json({ error: 'Amount and credits are required' });
  }

  db.run(
    `UPDATE users SET credits = credits + ? WHERE id = ?`,
    [credits, userId],
    function(err) {
      if (err) {
        console.error('Error adding credits:', err);
        return res.status(500).json({ error: 'Failed to add credits' });
      }
      console.log(`✅ Added ${credits} credits to user ${userId}`);

      const fakePaymentID = `PAY-${Date.now()}-${userId}`;
      db.run(
        `INSERT INTO payments (userId, paymentID, amount, credits, status) VALUES (?, ?, ?, ?, 'completed')`,
        [userId, fakePaymentID, amount, credits],
        (err) => {
          if (err) console.error('❌ Payment record error:', err);
          else console.log('✅ Payment record saved (mock)');
        }
      );

      res.json({
        success: true,
        message: `✅ ${credits} credits added successfully! (Mock payment)`,
        creditsAdded: credits
      });
    }
  );
});

// ============================================================
// AI ROUTE
// ============================================================
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

// ============================================================
// 🔥 START SERVER - DYNAMIC PORT
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ Backend brain running at http://localhost:${PORT}`);
  console.log(`✅ Server is ready for deployment on Render`);
});