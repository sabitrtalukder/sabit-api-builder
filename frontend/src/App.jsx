import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// ============================================================
// 🔥 CRITICAL: Set this to your Render backend URL
// ============================================================
const API_BASE = 'https://sabit-api-builder.onrender.com';

function App() {
  // ----- AUTH STATE -----
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [userNameDisplay, setUserNameDisplay] = useState('');
  const [userId, setUserId] = useState(localStorage.getItem('userId'));

  // ----- TAB STATE -----
  const [activeTab, setActiveTab] = useState('my-apis');

  // ----- API CREATION / EDITING STATE -----
  const [showModal, setShowModal] = useState(false);
  const [apiName, setApiName] = useState('');
  const [apiDescription, setApiDescription] = useState('');
  const [apiCode, setApiCode] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [apiPrice, setApiPrice] = useState(0);
  const [editingApi, setEditingApi] = useState(null);

  // ----- SPEECH-TO-TEXT STATE -----
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);

  // ----- API LIST STATE -----
  const [apiList, setApiList] = useState([]);
  const [marketplaceApis, setMarketplaceApis] = useState([]);
  const [executingId, setExecutingId] = useState(null);
  const [executionResults, setExecutionResults] = useState({});

  // ----- CREDIT STATE -----
  const [credits, setCredits] = useState(0);

  // ----- BUY CREDITS MODAL STATE -----
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buying, setBuying] = useState(false);

  // Credit packages
  const packages = [
    { credits: 10, amount: 1.00 },
    { credits: 30, amount: 2.50 },
    { credits: 50, amount: 4.00 },
    { credits: 100, amount: 7.00 },
  ];

  // ============================================================
  // 🎤 SPEECH-TO-TEXT SETUP
  // ============================================================
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = 'en-US';
      recognitionInstance.maxAlternatives = 1;

      recognitionInstance.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('🎤 Voice detected:', transcript);
        setApiDescription(transcript);
        setIsListening(false);
        
        setTimeout(() => {
          if (transcript.length > 0) {
            handleClarifyApi();
          }
        }, 500);
      };

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          alert('❌ Please allow microphone access to use voice commands.');
        } else if (event.error === 'no-speech') {
          alert('❌ No speech detected. Please try again.');
        } else {
          alert('❌ Speech recognition error: ' + event.error);
        }
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognitionInstance);
    } else {
      console.warn('Speech recognition not supported in this browser.');
    }
  }, []);

  // ----- START VOICE RECORDING -----
  const startVoiceRecording = () => {
    if (!recognition) {
      alert('❌ Speech recognition is not supported. Please use Chrome or Edge.');
      return;
    }

    if (!showModal) {
      setEditingApi(null);
      setApiName('');
      setApiDescription('');
      setApiCode('');
      setIsPublic(false);
      setApiPrice(0);
      setShowModal(true);
    }

    try {
      recognition.start();
      setIsListening(true);
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      setIsListening(false);
    }
  };

  // ----- FETCH CREDITS -----
  const fetchCredits = async () => {
    if (!userId || !token) return;
    try {
      const res = await axios.get(`${API_BASE}/api/credits?userId=${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('📊 Credits received:', res.data.credits);
      setCredits(res.data.credits);
    } catch (err) {
      console.error('Failed to fetch credits:', err);
      if (err.response?.status === 401) {
        handleLogout('Session expired. Please log in again.');
      }
    }
  };

  // ----- FETCH MY APIS -----
  useEffect(() => {
    if (token && userId && activeTab === 'my-apis') fetchApis();
  }, [token, userId, activeTab]);

  // ----- FETCH MARKETPLACE -----
  useEffect(() => {
    if (token && userId && activeTab === 'marketplace') fetchMarketplace();
  }, [token, userId, activeTab]);

  // ----- FETCH CREDITS AFTER LOGIN -----
  useEffect(() => {
    if (userId && token) fetchCredits();
  }, [userId, token]);

  const fetchApis = async () => {
    try {
      if (!userId) return;
      const response = await axios.get(`${API_BASE}/api/apis?userId=${userId}`);
      setApiList(response.data);
    } catch (error) {
      console.error('Error fetching APIs:', error);
      if (error.response?.status === 401) {
        handleLogout('Session expired. Please log in again.');
      }
    }
  };

  const fetchMarketplace = async () => {
    try {
      if (!userId) return;
      const response = await axios.get(`${API_BASE}/api/marketplace?userId=${userId}`);
      setMarketplaceApis(response.data);
    } catch (error) {
      console.error('Error fetching marketplace:', error);
      if (error.response?.status === 401) {
        handleLogout('Session expired. Please log in again.');
      }
    }
  };

  // ----- AUTH HANDLERS -----
  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = isLogin ? `${API_BASE}/login` : `${API_BASE}/register`;
    try {
      const response = await axios.post(url, { username, password });
      if (isLogin) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('userId', response.data.userId);
        setToken(response.data.token);
        setUserId(response.data.userId);
        setUserNameDisplay(response.data.username);
        await fetchCredits();
        await fetchApis();
      } else {
        alert('✅ Signup successful! Please login now.');
        setIsLogin(true);
      }
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.message || 'Something went wrong.'));
    }
  };

  const handleLogout = (message = 'Logged out.') => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    setToken(null);
    setUserId(null);
    setUserNameDisplay('');
    setApiList([]);
    setMarketplaceApis([]);
    setActiveTab('my-apis');
    setCredits(0);
    if (message) alert(message);
  };

  // ============================================================
  // 🎤 AI CLARIFICATION WITH AUTO-CODE GENERATION
  // ============================================================
  const handleClarifyApi = async () => {
    if (!apiDescription) {
      alert('Please describe what you want the API to do first!');
      return;
    }
    alert('🤖 Thinking... Let me clarify that for you.');
    try {
      const response = await axios.post(`${API_BASE}/api/gemini-clarify`, {
        description: apiDescription
      });
      setApiName(response.data.name);
      setApiDescription(response.data.description);
      // 🔥 AUTO-FILL CODE FROM AI
      if (response.data.code) {
        setApiCode(response.data.code);
      } else {
        setApiCode('return { message: "Your API logic goes here" };');
      }
      alert('✅ AI has generated the API design and code! Review and save.');
    } catch (error) {
      console.error('Error calling AI:', error);
      alert('❌ Error: ' + (error.response?.data?.error || 'Could not reach the AI service.'));
    }
  };

  // ----- DELETE API -----
  const handleDeleteApi = async (apiId) => {
    if (!window.confirm('Are you sure you want to delete this API?')) return;
    try {
      await axios.delete(`${API_BASE}/api/delete/${apiId}`, {
        data: { userId: parseInt(userId) }
      });
      alert('🗑️ API deleted successfully!');
      fetchApis();
      setExecutionResults(prev => {
        const newState = { ...prev };
        delete newState[apiId];
        return newState;
      });
    } catch (error) {
      alert('❌ Error deleting API: ' + (error.response?.data?.message || 'Unknown error'));
      if (error.response?.status === 401) {
        handleLogout('Session expired. Please log in again.');
      }
    }
  };

  // ----- EDIT API -----
  const handleEditApi = (api) => {
    setEditingApi(api);
    setApiName(api.name);
    setApiDescription(api.description);
    setApiCode(api.code || '');
    setIsPublic(api.isPublic === 1);
    setApiPrice(api.price || 0);
    setShowModal(true);
  };

  // ----- SAVE / UPDATE API -----
  const handleSaveApi = async () => {
    if (!apiName || !apiDescription) {
      alert('Please fill in both fields!');
      return;
    }
    if (!userId) {
      alert('You must be logged in to save an API.');
      return;
    }
    try {
      if (editingApi) {
        await axios.put(`${API_BASE}/api/update/${editingApi.id}`, {
          userId: parseInt(userId),
          name: apiName,
          description: apiDescription,
          code: apiCode,
          isPublic: isPublic ? 1 : 0,
          price: apiPrice || 0
        });
        alert('✅ API updated successfully!');
      } else {
        await axios.post(`${API_BASE}/api/create`, {
          name: apiName,
          description: apiDescription,
          code: apiCode,
          userId: parseInt(userId),
          isPublic: isPublic ? 1 : 0,
          price: apiPrice || 0
        });
        alert('✅ API saved successfully!');
      }
      setApiName('');
      setApiDescription('');
      setApiCode('');
      setIsPublic(false);
      setApiPrice(0);
      setEditingApi(null);
      setShowModal(false);
      fetchApis();
      if (activeTab === 'marketplace') fetchMarketplace();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.message || 'Unknown error'));
      if (error.response?.status === 401) {
        handleLogout('Session expired. Please log in again.');
      }
    }
  };

  // ----- EXECUTE API -----
  const handleExecuteApi = async (apiId, paramsInput) => {
    let params = {};
    try {
      params = JSON.parse(paramsInput || '{}');
    } catch (e) {
      alert('Invalid JSON! Use format: {"key": "value"}');
      return;
    }
    setExecutingId(apiId);
    try {
      const response = await axios.post(`${API_BASE}/api/execute`, {
        apiId: apiId,
        userId: userId,
        params: params
      });
      setExecutionResults(prev => ({
        ...prev,
        [apiId]: { success: true, output: response.data.output }
      }));
      await fetchCredits();
    } catch (error) {
      if (error.response?.data?.error?.includes('Insufficient credits')) {
        alert('⚠️ You have no credits left. Please purchase more credits to continue.');
        setCredits(0);
      } else {
        alert('❌ Execution failed: ' + (error.response?.data?.error || 'Unknown error'));
      }
      setExecutionResults(prev => ({
        ...prev,
        [apiId]: { success: false, output: error.response?.data?.error || 'Execution failed' }
      }));
      if (error.response?.status === 401) {
        handleLogout('Session expired. Please log in again.');
      }
    } finally {
      setExecutingId(null);
    }
  };

  // ----- BUY CREDITS HANDLER -----
  const handleBuyCredits = async (credits, amount) => {
    console.log('🛒 Buying credits:', { credits, amount });
    setBuying(true);
    try {
      const res = await axios.post(
        `${API_BASE}/api/payment/create`,
        { credits, amount },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('✅ Payment response:', res.data);
      alert('✅ Credits added successfully!');
      await fetchCredits();
      setShowBuyModal(false);
    } catch (error) {
      console.error('❌ Payment initiation error:', error.response?.data || error.message);
      if (error.response?.status === 401) {
        handleLogout('Your session has expired. Please log in again.');
      } else {
        alert('❌ Payment failed: ' + (error.response?.data?.error || error.message));
      }
      setBuying(false);
    }
  };

  // ========================================================================
  // RENDER: LOGGED IN VIEW
  // ========================================================================
  if (token) {
    return (
      <div className="dashboard">
        <header>
          <h1>🚀 {userNameDisplay}'s API Hub</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ background: '#edf2f7', padding: '4px 14px', borderRadius: '20px', fontWeight: 'bold', color: '#2d3748' }}>
              ⚡ {credits} credits
            </span>
            <button
              onClick={() => setShowBuyModal(true)}
              style={{
                background: '#ecc94b',
                padding: '6px 18px',
                borderRadius: '20px',
                border: 'none',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: '#2d3748'
              }}
            >
              💰 Buy Credits
            </button>
            <button onClick={() => handleLogout()} className="logout-btn">Logout</button>
          </div>
        </header>

        {/* TABS */}
        <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e2e8f0', padding: '0 40px' }}>
          <button onClick={() => setActiveTab('my-apis')} style={{ padding: '12px 24px', background: activeTab === 'my-apis' ? '#667eea' : 'transparent', color: activeTab === 'my-apis' ? 'white' : '#4a5568', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', marginRight: '4px' }}>📦 My APIs</button>
          <button onClick={() => setActiveTab('marketplace')} style={{ padding: '12px 24px', background: activeTab === 'marketplace' ? '#667eea' : 'transparent', color: activeTab === 'marketplace' ? 'white' : '#4a5568', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>🌍 Marketplace</button>
        </div>

        <div className="hero">
          {activeTab === 'my-apis' && (
            <>
              <h2>Build your custom API</h2>
              <p>Click the big red button to create a new API endpoint.</p>
              <button className="record-btn" onClick={() => { setEditingApi(null); setApiName(''); setApiDescription(''); setApiCode(''); setIsPublic(false); setApiPrice(0); setShowModal(true); }}>RECORD</button>
            </>
          )}
          {activeTab === 'marketplace' && <h2 style={{ marginBottom: '20px' }}>🌍 Discover & Earn from Public APIs</h2>}

          {activeTab === 'my-apis' && (
            <div className="api-list">
              <h3>Your Saved APIs:</h3>
              {apiList.length === 0 ? <p style={{ color: '#718096' }}>No APIs created yet. Press the red button!</p> : (
                <ul>
                  {apiList.map((api) => (
                    <li key={api.id} className="api-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>📌 {api.name}</strong>
                          {api.isPublic === 1 && <span style={{ background: '#48bb78', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', marginLeft: '8px' }}>🌍 Public</span>}
                          {api.price > 0 && <span style={{ background: '#ecc94b', color: '#2d3748', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', marginLeft: '8px' }}>💰 {api.price} credits</span>}
                        </div>
                        <div>
                          <button onClick={() => handleEditApi(api)} style={{ background: '#4299e1', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 12px', marginRight: '8px', cursor: 'pointer', fontSize: '13px' }}>✏️ Edit</button>
                          <button onClick={() => handleDeleteApi(api.id)} style={{ background: '#fc8181', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontSize: '13px' }}>🗑️ Delete</button>
                        </div>
                      </div>
                      <p>{api.description}</p>
                      <details style={{ marginTop: '8px', fontSize: '14px' }}>
                        <summary style={{ cursor: 'pointer', color: '#667eea' }}>📜 Show Code</summary>
                        <pre style={{ background: '#f0f4ff', padding: '10px', borderRadius: '6px', overflowX: 'auto' }}>{api.code || 'return { message: "No code defined" };'}</pre>
                      </details>
                      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <input type="text" placeholder='e.g., {"city":"Dhaka"}' id={`params-${api.id}`} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', flex: '1', minWidth: '150px' }} />
                        <button onClick={() => { const inputField = document.getElementById(`params-${api.id}`); handleExecuteApi(api.id, inputField.value); }} disabled={executingId === api.id} style={{ padding: '6px 16px', background: executingId === api.id ? '#a0aec0' : '#48bb78', color: 'white', border: 'none', borderRadius: '20px', cursor: executingId === api.id ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>{executingId === api.id ? '⏳ Running...' : '▶️ Run (Free)'}</button>
                      </div>
                      {executionResults[api.id] && (
                        <div style={{ marginTop: '10px', padding: '10px', background: executionResults[api.id].success ? '#f0fff4' : '#fff5f5', border: `1px solid ${executionResults[api.id].success ? '#c6f6d5' : '#fed7d7'}`, borderRadius: '6px', fontSize: '14px' }}>
                          <strong>{executionResults[api.id].success ? '✅ Output:' : '❌ Error:'}</strong>
                          <pre style={{ margin: '5px 0 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(executionResults[api.id].output, null, 2)}</pre>
                        </div>
                      )}
                      <small>Created: {new Date(api.createdAt).toLocaleString()}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'marketplace' && (
            <div className="api-list">
              <h3>Public APIs from other developers:</h3>
              {marketplaceApis.length === 0 ? <p style={{ color: '#718096' }}>No public APIs found yet. Create an API and make it public!</p> : (
                <ul>
                  {marketplaceApis.map((api) => (
                    <li key={api.id} className="api-item" style={{ borderLeftColor: '#48bb78' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>📌 {api.name}</strong>
                          <span style={{ background: '#48bb78', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', marginLeft: '8px' }}>🌍 Public</span>
                          {api.price > 0 && <span style={{ background: '#ecc94b', color: '#2d3748', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', marginLeft: '8px' }}>💰 {api.price} credits</span>}
                          {api.price === 0 && <span style={{ background: '#a0aec0', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', marginLeft: '8px' }}>🎁 Free</span>}
                        </div>
                        <span style={{ fontSize: '13px', color: '#4a5568' }}>👤 {api.creatorName}</span>
                      </div>
                      <p>{api.description}</p>
                      <div style={{ marginTop: '8px', fontSize: '14px' }}>
                        {api.price > 0 ? (
                          <span style={{ color: '#667eea', fontWeight: 'bold' }}>Cost: {api.price} credits</span>
                        ) : (
                          <span style={{ color: '#48bb78', fontWeight: 'bold' }}>Free</span>
                        )}
                      </div>
                      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <input type="text" placeholder='e.g., {"city":"Dhaka"}' id={`public-params-${api.id}`} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', flex: '1', minWidth: '150px' }} />
                        <button onClick={() => { const inputField = document.getElementById(`public-params-${api.id}`); handleExecuteApi(api.id, inputField.value); }} disabled={executingId === api.id} style={{ padding: '6px 16px', background: executingId === api.id ? '#a0aec0' : '#667eea', color: 'white', border: 'none', borderRadius: '20px', cursor: executingId === api.id ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>{executingId === api.id ? '⏳ Running...' : `▶️ Run (${api.price > 0 ? `${api.price} credits` : 'Free'})`}</button>
                      </div>
                      {executionResults[api.id] && (
                        <div style={{ marginTop: '10px', padding: '10px', background: executionResults[api.id].success ? '#f0fff4' : '#fff5f5', border: `1px solid ${executionResults[api.id].success ? '#c6f6d5' : '#fed7d7'}`, borderRadius: '6px', fontSize: '14px' }}>
                          <strong>{executionResults[api.id].success ? '✅ Output:' : '❌ Error:'}</strong>
                          <pre style={{ margin: '5px 0 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(executionResults[api.id].output, null, 2)}</pre>
                        </div>
                      )}
                      <small>Created: {new Date(api.createdAt).toLocaleString()}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ==================== MODAL: CREATE/EDIT API ==================== */}
        {showModal && (
          <div className="modal-overlay" onClick={() => { setShowModal(false); setEditingApi(null); setApiName(''); setApiDescription(''); setApiCode(''); setIsPublic(false); setApiPrice(0); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>{editingApi ? '✏️ Edit API' : '🔴 Create New API'}</h2>
              <p>{editingApi ? 'Update the details below.' : 'Describe what you want, then click "Clarify with AI" or use the Voice Command button below.'}</p>
              
              {/* ============================================================
                  🎤 SPEECH-TO-TEXT BUTTON
                  ============================================================ */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={startVoiceRecording}
                  disabled={isListening}
                  style={{
                    padding: '12px 24px',
                    background: isListening ? '#fc8181' : '#48bb78',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    cursor: isListening ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.3s'
                  }}
                  onMouseEnter={(e) => { if (!isListening) e.currentTarget.style.transform = 'scale(1.05)'; }}
                  onMouseLeave={(e) => { if (!isListening) e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <span style={{ fontSize: '28px' }}>{isListening ? '🔴' : '🎤'}</span>
                  {isListening ? 'Listening... Speak now!' : 'Voice Command'}
                </button>
                {isListening && (
                  <span style={{ 
                    color: '#e53e3e', 
                    fontWeight: 'bold', 
                    animation: 'pulse 1s infinite',
                    fontSize: '16px'
                  }}>
                    🔴 Recording...
                  </span>
                )}
                <span style={{ fontSize: '14px', color: '#718096' }}>
                  Say your API description in one voice command!
                </span>
              </div>

              <input 
                type="text" 
                placeholder="API Name" 
                value={apiName} 
                onChange={(e) => setApiName(e.target.value)} 
                className="modal-input" 
              />
              <textarea 
                placeholder="Describe what this API should do" 
                value={apiDescription} 
                onChange={(e) => setApiDescription(e.target.value)} 
                className="modal-textarea" 
                rows="3" 
              />
              <p style={{ fontSize: '14px', color: '#4a5568', textAlign: 'left', marginTop: '10px', marginBottom: '4px' }}>
                ⚡ JavaScript Logic (receives <code>params</code>, must <code>return</code> a value):
              </p>
              <textarea 
                placeholder='e.g., return { greeting: "Hello " + (params.name || "World") };' 
                value={apiCode} 
                onChange={(e) => setApiCode(e.target.value)} 
                className="modal-textarea" 
                rows="4" 
                style={{ fontFamily: 'monospace', background: '#f7fafc' }} 
              />
              
              {/* Price input */}
              <div style={{ display: 'flex', alignItems: 'center', marginTop: '15px', padding: '10px', background: '#f7fafc', borderRadius: '8px' }}>
                <label style={{ fontWeight: 'bold', color: '#2d3748', marginRight: '10px' }}>💰 Price (credits):</label>
                <input
                  type="number"
                  min="0"
                  value={apiPrice}
                  onChange={(e) => setApiPrice(parseInt(e.target.value) || 0)}
                  style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', width: '80px' }}
                />
                <span style={{ marginLeft: '10px', fontSize: '13px', color: '#718096' }}>(0 = free)</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', marginTop: '10px', padding: '10px', background: '#f7fafc', borderRadius: '8px' }}>
                <input
                  type="checkbox"
                  id="publicToggle"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  style={{ width: '18px', height: '18px', marginRight: '10px', cursor: 'pointer' }}
                />
                <label htmlFor="publicToggle" style={{ fontWeight: 'bold', color: '#2d3748', cursor: 'pointer' }}>
                  🌍 Make this API Public (visible to everyone in Marketplace)
                </label>
              </div>

              {!editingApi && <button onClick={handleClarifyApi} className="modal-btn clarify" style={{ marginTop: '15px' }}>🤖 Clarify with AI</button>}
              <div className="modal-buttons">
                <button onClick={() => { setShowModal(false); setEditingApi(null); setApiName(''); setApiDescription(''); setApiCode(''); setIsPublic(false); setApiPrice(0); }} className="modal-btn cancel">Cancel</button>
                <button onClick={handleSaveApi} className="modal-btn save">{editingApi ? '💾 Update API' : '✅ OK & Save'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== MODAL: BUY CREDITS ==================== */}
        {showBuyModal && (
          <div className="modal-overlay" onClick={() => setShowBuyModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <h2>💰 Buy Credits</h2>
              <p>Select a package below to add credits to your account.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                {packages.map((pkg) => (
                  <button
                    key={pkg.credits}
                    onClick={() => handleBuyCredits(pkg.credits, pkg.amount)}
                    disabled={buying}
                    style={{
                      padding: '16px 24px',
                      background: '#f7fafc',
                      border: '2px solid #e2e8f0',
                      borderRadius: '12px',
                      cursor: buying ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: '#2d3748',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { if (!buying) e.currentTarget.style.borderColor = '#667eea'; }}
                    onMouseLeave={(e) => { if (!buying) e.currentTarget.style.borderColor = '#e2e8f0'; }}
                  >
                    <span>⚡ {pkg.credits} credits</span>
                    <span style={{ color: '#667eea' }}>BDT {pkg.amount.toFixed(2)}</span>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowBuyModal(false)}
                  style={{ padding: '10px 24px', background: '#e2e8f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <footer><p>© 2025 API Marketplace</p></footer>
      </div>
    );
  }

  // ========================================================================
  // RENDER: LOGIN / SIGNUP
  // ========================================================================
  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>{isLogin ? 'Login' : 'Sign Up'}</h1>
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit">{isLogin ? 'Login' : 'Create Account'}</button>
        </form>
        <p onClick={() => setIsLogin(!isLogin)} style={{ cursor: 'pointer', color: '#007bff', marginTop: '15px' }}>
          {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Login'}
        </p>
      </div>
    </div>
  );
}

export default App;