let currentToken = null;
let currentUserId = null;
let credits = 0;
let apis = [];

const creditsEl = document.getElementById('credits');
const apisUl = document.getElementById('apis');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save-api-btn');
const apiName = document.getElementById('api-name');
const apiDesc = document.getElementById('api-desc');
const apiCode = document.getElementById('api-code');
const apiPrice = document.getElementById('api-price');
const apiPublic = document.getElementById('api-public');

// Load token from Chrome storage
async function loadToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token', 'userId'], (result) => {
      currentToken = result.token;
      currentUserId = result.userId;
      resolve();
    });
  });
}

// Fetch user credits
async function fetchCredits() {
  if (!currentToken) return;
  try {
    const res = await fetch(`http://localhost:5000/api/credits?userId=${currentUserId}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    credits = data.credits || 0;
    creditsEl.textContent = `⚡ ${credits} credits`;
  } catch (err) {
    console.error('Failed to fetch credits:', err);
    creditsEl.textContent = 'Error loading credits';
  }
}

// Fetch user's APIs
async function fetchApis() {
  if (!currentToken) return;
  try {
    const res = await fetch(`http://localhost:5000/api/apis?userId=${currentUserId}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    apis = data;
    renderApis();
  } catch (err) {
    console.error('Failed to fetch APIs:', err);
    apisUl.innerHTML = '<li id="no-apis">Error loading APIs</li>';
  }
}

// Render API list with "Run" buttons
function renderApis() {
  if (!apis || apis.length === 0) {
    apisUl.innerHTML = '<li id="no-apis">No APIs saved yet.</li>';
    return;
  }
  apisUl.innerHTML = apis.map(api => `
    <li>
      <div class="api-name">${api.name}</div>
      <div class="api-desc">${api.description}</div>
      <div class="api-run">
        <input type="text" placeholder='{"key":"value"}' id="params-${api.id}" />
        <button data-id="${api.id}" class="run-btn">▶️ Run</button>
      </div>
    </li>
  `).join('');

  document.querySelectorAll('.run-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = btn.dataset.id;
      const paramsInput = document.getElementById(`params-${id}`);
      const params = paramsInput.value || '{}';
      await runApi(id, params);
    });
  });
}

// Run an API
async function runApi(apiId, paramsJson) {
  const btn = document.querySelector(`.run-btn[data-id="${apiId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Running...';
  }

  try {
    let params = {};
    try {
      params = JSON.parse(paramsJson);
    } catch (e) {
      statusEl.textContent = '❌ Invalid JSON parameters';
      if (btn) { btn.disabled = false; btn.textContent = '▶️ Run'; }
      return;
    }

    const res = await fetch('http://localhost:5000/api/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ apiId, userId: currentUserId, params })
    });
    const data = await res.json();

    if (res.ok) {
      statusEl.textContent = `✅ Output: ${JSON.stringify(data.output)}`;
      await fetchCredits(); // refresh credits after run
    } else {
      statusEl.textContent = `❌ Error: ${data.error || 'Unknown error'}`;
    }
  } catch (err) {
    statusEl.textContent = `❌ Network error: ${err.message}`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '▶️ Run';
    }
  }
}

// Save a new API
async function saveApi() {
  const name = apiName.value.trim();
  const description = apiDesc.value.trim();
  const code = apiCode.value.trim() || 'return { message: "Hello from extension!" };';
  const price = parseInt(apiPrice.value) || 0;
  const isPublic = apiPublic.checked ? 1 : 0;

  if (!name || !description) {
    statusEl.textContent = '❌ Name and description are required.';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const res = await fetch('http://localhost:5000/api/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        name,
        description,
        code,
        userId: currentUserId,
        isPublic,
        price
      })
    });
    const data = await res.json();

    if (res.ok) {
      statusEl.textContent = '✅ API saved successfully!';
      // Clear form
      apiName.value = '';
      apiDesc.value = '';
      apiCode.value = '';
      apiPrice.value = '0';
      apiPublic.checked = false;
      // Refresh list
      await fetchApis();
    } else {
      statusEl.textContent = `❌ Error: ${data.message || 'Unknown error'}`;
    }
  } catch (err) {
    statusEl.textContent = `❌ Network error: ${err.message}`;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save API';
  }
}

// Initialise
(async function init() {
  await loadToken();
  if (currentToken) {
    await fetchCredits();
    await fetchApis();
  } else {
    creditsEl.textContent = '⚠️ Not logged in';
    apisUl.innerHTML = '<li id="no-apis">Please log in on the main site first.</li>';
  }

  saveBtn.addEventListener('click', saveApi);
})();