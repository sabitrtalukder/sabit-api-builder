// Listen for token messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOKEN_FOUND') {
    chrome.storage.local.set({
      token: message.token,
      userId: message.userId
    }, () => {
      console.log('Token saved from main site.');
    });
    sendResponse({ success: true });
  }
});

// Log extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed. Please open the main app to sync token.');
});