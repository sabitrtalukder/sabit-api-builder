// Background service worker for Sabit's API Builder

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOKEN_FOUND') {
    console.log('[Background] 🔑 Receiving token for user:', message.userId);
    
    // Save to Chrome's local storage
    chrome.storage.local.set({
      token: message.token,
      userId: message.userId
    }, () => {
      // This callback runs AFTER save is complete
      console.log('[Background] ✅ Token saved successfully!');
      
      // Send a response back to the content script to confirm
      sendResponse({ success: true, message: 'Token saved' });
    });

    // ⚠️ CRITICAL: Return true to tell Chrome to keep the message channel open
    // for the asynchronous sendResponse above.
    return true;
  }
  
  // If we don't handle the message, return nothing
});

console.log('[Background] 🚀 Extension background service worker started.');