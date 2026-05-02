// Helper to get token
async function getToken() {
  const data = await chrome.storage.sync.get('readwiseToken');
  return data.readwiseToken;
}

// Helper to check settings
async function getSettings() {
  return await chrome.storage.sync.get({
    checkPageStatus: true,
    readwiseToken: '',
    defaultLocation: 'new'
  });
}

// State cache to reduce flicker and API calls
const urlStatusCache = new Map(); // URL -> Boolean (isSaved)

// Unified Save Page Function
async function saveToReader(url, title, tabId) {
  const settings = await getSettings();
  if (!settings.readwiseToken) return { success: false, error: 'Token missing in settings' };

  try {
    const response = await fetch('https://readwise.io/api/v3/save/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${settings.readwiseToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        url, 
        title, 
        location: settings.defaultLocation,
        saved_using: 'Readwise Companion Extension' 
      })
    });

    if (response.ok) {
      urlStatusCache.set(url, true);
      updatePageIndicator(tabId, true);
      return { success: true };
    } else {
      let errorDetail = 'API Error';
      try {
        const errData = await response.json();
        errorDetail = errData.detail || JSON.stringify(errData);
      } catch (e) {
        errorDetail = response.statusText;
      }
      return { success: false, error: errorDetail };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Check if page is already in Reader
async function checkPageInReader(url) {
  if (urlStatusCache.has(url)) return urlStatusCache.get(url);

  const settings = await getSettings();
  if (!settings.readwiseToken || !settings.checkPageStatus) return false;
  if (!url || url.startsWith('chrome://') || url.startsWith('about:')) return false;

  try {
    const response = await fetch(`https://readwise.io/api/v3/list/?url=${encodeURIComponent(url)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${settings.readwiseToken}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      const isSaved = data.results && data.results.length > 0 && data.results.some(doc => 
        doc.source_url === url || doc.url === url
      );
      urlStatusCache.set(url, isSaved);
      return isSaved;
    }
  } catch (e) {
    console.error('Status check failed:', e);
  }
  return false;
}

function updatePageIndicator(tabId, isSaved) {
  if (isSaved) {
    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4caf50', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

// --- Event Listeners ---

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return;

  sendMessageToTab(tab.id, { action: 'saving-started' });

  const result = await saveToReader(tab.url, tab.title, tab.id);
  
  if (result.success) {
    sendMessageToTab(tab.id, { action: 'saving-success' });
  } else {
    sendMessageToTab(tab.id, { action: 'saving-error', error: result.error });
  }
});

// Optimized tab update listener to reduce flicker
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only clear the badge if the URL itself is changing
  if (changeInfo.url) {
    updatePageIndicator(tabId, false);
  }
  
  // Perform check when loading is complete
  if (changeInfo.status === 'complete' && tab.url) {
    checkPageInReader(tab.url).then(isSaved => {
      if (isSaved) {
        updatePageIndicator(tabId, true);
      } else {
        updatePageIndicator(tabId, false);
      }
    });
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url) {
      // Use cache for instant feedback on activation
      if (urlStatusCache.has(tab.url)) {
        updatePageIndicator(activeInfo.tabId, urlStatusCache.get(tab.url));
      } else {
        // Only clear if not in cache to avoid flicker
        updatePageIndicator(activeInfo.tabId, false);
        checkPageInReader(tab.url).then(isSaved => {
          updatePageIndicator(activeInfo.tabId, isSaved);
        });
      }
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'save-page-request') {
    saveToReader(sender.tab.url, sender.tab.title, sender.tab.id).then(sendResponse);
    return true; 
  }
  
  if (request.action === 'save-highlight') {
    saveHighlight(request.data).then(sendResponse);
    return true;
  }

  if (request.action === 'delete-highlight') {
    deleteHighlight(request.id).then(sendResponse);
    return true;
  }
});

async function deleteHighlight(id) {
  const token = await getToken();
  if (!token) return { success: false, error: 'Token missing' };

  try {
    const response = await fetch(`https://readwise.io/api/v2/highlights/${id}/`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Token ${token}`
      }
    });

    return { success: response.status === 204 };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function saveHighlight(data) {
  const token = await getToken();
  if (!token) return { success: false, error: 'Token missing in settings' };

  try {
    const highlightObj = {
      text: data.text,
      title: data.title,
      source_url: data.url,
      category: 'articles'
    };

    if (data.note && data.note.trim().length > 0) {
      highlightObj.note = data.note.trim();
    }

    const payload = {
      highlights: [highlightObj]
    };

    const response = await fetch('https://readwise.io/api/v2/highlights/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const result = await response.json();
      const highlightId = result[0]?.modified_highlights?.[0];
      return { success: true, id: highlightId };
    } else {
      let errorDetail = 'API Error';
      try {
        const errData = await response.json();
        if (errData.highlights && Array.isArray(errData.highlights)) {
          errorDetail = JSON.stringify(errData.highlights[0]);
        } else {
          errorDetail = errData.detail || JSON.stringify(errData);
        }
      } catch (e) {
        errorDetail = response.statusText;
      }
      return { success: false, error: errorDetail };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function sendMessageToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}
