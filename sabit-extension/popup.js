let currentToken = null;
let currentUserId = null;

// Load token from storage
async function loadToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token', 'userId'], (result) => {
      currentToken = result.token;
      currentUserId = result.userId;
      resolve();
    });
  });
}

// Fetch credits and APIs
async function loadData() {
  if (!currentToken) {
    document.getElementById('credits').textContent = '⚠️ Not logged in';
    document.getElementById('apis').innerHTML = '<li>Please log in on the main site first.</li>';
    return;
  }

  try {
    // Fetch credits
    const creditsRes = await fetch(`http://localhost:5000/api/credits?userId=${currentUserId}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const creditsData = await creditsRes.json();
    document.getElementById('credits').textContent = `⚡ ${creditsData.credits || 0} credits`;

    // Fetch APIs
    const apisRes = await fetch(`http://localhost:5000/api/apis?userId=${currentUserId}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const apis = await apisRes.json();
    
    const apiList = document.getElementById('apis');
    if (!apis || apis.length === 0) {
      apiList.innerHTML = '<li>No APIs saved yet.</li>';
    } else {
      apiList.innerHTML = apis.map(api => `
        <li class="api-item">
          <div class="api-name">${api.name}</div>
          <div class="api-desc">${api.description}</div>
          <button onclick="runApi(${api.id})">▶️ Run</button>
        </li>
      `).join('');
    }
  } catch (err) {
    document.getElementById('credits').textContent = '❌ Error loading data';
    console.error(err);
  }
}

// Run API (simplified)
async function runApi(apiId) {
  const params = prompt('Enter JSON parameters:', '{"test":"value"}');
  if (!params) return;
  
  try {
    const paramsObj = JSON.parse(params);
    const res = await fetch('http://localhost:5000/api/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ apiId, userId: currentUserId, params: paramsObj })
    });
    const data = await res.json();
    alert(data.output ? `✅ Output: ${JSON.stringify(data.output)}` : `❌ Error: ${data.error}`);
    await loadData(); // refresh
  } catch (err) {
    alert('Invalid JSON or network error');
  }
}

// Make functions accessible from HTML
window.runApi = runApi;

// Initialise
(async function init() {
  await loadToken();
  await loadData();
  
  document.getElementById('refresh-btn').addEventListener('click', loadData);
})();