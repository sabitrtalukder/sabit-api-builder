console.log('[Sabit-Extension] Content script loaded on:', window.location.href);

// Only run on the main app's exact URL
if (window.location.hostname === 'localhost' && window.location.port === '5173') {
  console.log('[Sabit-Extension] ✅ Running on localhost:5173');

  // Wait a moment for the page to fully load and localStorage to populate
  setTimeout(() => {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    
    console.log('[Sabit-Extension] Token found?', token ? '✅ YES' : '❌ NO');
    console.log('[Sabit-Extension] UserId found?', userId ? '✅ YES' : '❌ NO');

    if (token && userId) {
      // Send message to background script
      chrome.runtime.sendMessage(
        {
          type: 'TOKEN_FOUND',
          token: token,
          userId: userId
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[Sabit-Extension] ❌ Error sending message:', chrome.runtime.lastError.message);
          } else {
            console.log('[Sabit-Extension] ✅ Message sent, background responded:', response);
          }
        }
      );
    } else {
      console.warn('[Sabit-Extension] ⚠️ No token or userId found in localStorage. Are you logged in?');
    }
  }, 1500); // Increased delay to ensure localStorage is ready
} else {
  console.log('[Sabit-Extension] ⏭️ Not running on localhost:5173 (current: ' + window.location.href + ')');
}