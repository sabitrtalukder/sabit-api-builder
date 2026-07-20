// Only run on our app's domain
if (window.location.hostname === 'localhost' && window.location.port === '5173') {
  // Wait for the page to load fully
  setTimeout(() => {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    if (token && userId) {
      chrome.runtime.sendMessage({
        type: 'TOKEN_FOUND',
        token: token,
        userId: userId
      }, (response) => {
        console.log('Token sent to background:', response);
      });
    } else {
      console.log('No token found in localStorage.');
    }
  }, 1000);
}