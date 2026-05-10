// Default settings constants
const DEFAULT_SETTINGS = {
  readwiseToken: '',
  theme: 'auto',
  enableAutoEnrichment: false,
  enableFAB: true,
  enableToolbar: true,
  checkPageStatus: true,
  beforeSaveAction: 'save',
  afterSaveAction: 'open_saved',
  quickSaveSelection: false,
  defaultLocation: 'new',
  maxStylesToDisplay: 4,
  toolbarVerticalPosition: 'above',
  toolbarHorizontalOffset: 0,
  excludedUrls: '',
  annotationStyles: [
    { id: 'h1', label: 'Yellow', icon: '✨', css: 'background-color: #ffd845;' },
    { id: 'h2', label: 'Blue Dot', icon: '🔹', css: 'border-bottom: 2px dotted #a3c8ff; background: transparent;' },
    { id: 'h3', label: 'Red Wavy', icon: '〰️', css: 'text-decoration: underline wavy red; background: transparent;' },
    { id: 'h4', label: 'Bold Italic', icon: 'B/I', css: 'font-weight: bold; font-style: italic; background: transparent;' }
  ]
};

// --- Utility Functions ---

function cleanUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);
    const tracking = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref'];
    tracking.forEach(p => params.delete(p));
    parsed.search = params.toString();
    parsed.hash = '';
    return parsed.toString().replace(/\?$/, '');
  } catch (e) { return url; }
}

// Helper to get token
async function getToken() {
  const data = await chrome.storage.sync.get('readwiseToken');
  return data.readwiseToken;
}

// Helper to check settings
async function getSettings() {
  return await chrome.storage.sync.get(DEFAULT_SETTINGS);
}

// State cache to reduce flicker and API calls
// URL -> { isSaved: Boolean, readerUrl: String, docId: String }
const urlStatusCache = new Map(); 

// --- Core API Functions ---

async function saveToReader(url, title, tabId, html = null) {
  const settings = await getSettings();
  if (!settings.readwiseToken) return { success: false, error: 'Token missing in settings' };

  const cleanedUrl = cleanUrl(url);

  async function postSave(targetUrl, targetHtml) {
    const payload = { 
      url: targetUrl, 
      title, 
      location: settings.defaultLocation,
      saved_using: 'Readwise Companion Extension' 
    };
    if (targetHtml) {
      payload.html = targetHtml;
      payload.should_clean_html = true;
    }

    return await fetch('https://readwise.io/api/v3/save/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${settings.readwiseToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  }

  try {
    let response = await postSave(cleanedUrl, html);

    // Phase 3: Robust Replacement (Delete-then-Create)
    if (response.status === 200 && html) {
      const data = await response.json();
      console.log(`[YARH] Document exists (${data.id}), upgrading to full content...`);
      const delRes = await deleteReaderDocument(data.id);
      if (delRes.success) {
        await new Promise(r => setTimeout(r, 1500));
        response = await postSave(cleanedUrl, html);
      }
    }

    if (response.ok) {
      const data = await response.json();
      urlStatusCache.set(cleanedUrl, { isSaved: true, readerUrl: data.url, docId: data.id });
      updatePageIndicator(tabId, true);
      return { success: true, readerUrl: data.url, id: data.id };
    } else {
      const errData = await response.json().catch(() => ({}));
      return { success: false, error: errData.detail || response.statusText };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function checkPageInReader(url) {
  const cleanedUrl = cleanUrl(url);
  if (urlStatusCache.has(cleanedUrl)) return urlStatusCache.get(cleanedUrl).isSaved;

  const settings = await getSettings();
  if (!settings.readwiseToken || !settings.checkPageStatus) return false;
  if (!cleanedUrl || cleanedUrl.startsWith('chrome://') || cleanedUrl.startsWith('about:')) return false;

  try {
    const response = await fetch(`https://readwise.io/api/v3/list/?url=${encodeURIComponent(cleanedUrl)}`, {
      method: 'GET',
      headers: { 'Authorization': `Token ${settings.readwiseToken}` }
    });
    if (response.ok) {
      const data = await response.json();
      const savedDoc = data.results && data.results.find(doc => cleanUrl(doc.source_url) === cleanedUrl || cleanUrl(doc.url) === cleanedUrl);
      const isSaved = !!savedDoc;
      urlStatusCache.set(cleanedUrl, { isSaved, readerUrl: savedDoc ? savedDoc.url : null, docId: savedDoc ? savedDoc.id : null });
      return isSaved;
    }
  } catch (e) { console.error('Status check failed:', e); }
  return false;
}

async function saveReaderHtml(data) {
  const settings = await getSettings();
  if (!settings.readwiseToken) return { success: false, error: 'Token missing' };

  const cleanedUrl = cleanUrl(data.url);

  async function postSelection(targetUrl) {
    const payload = {
      url: targetUrl,
      html: data.html,
      title: data.title,
      location: data.location || settings.defaultLocation,
      saved_using: 'Readwise Companion Extension (Selection)',
      should_clean_html: true
    };
    if (data.tags?.length > 0) payload.tags = data.tags;
    if (data.notes?.trim().length > 0) payload.notes = data.notes.trim();

    return await fetch('https://readwise.io/api/v3/save/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${settings.readwiseToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  }

  try {
    let response = await postSelection(cleanedUrl);
    if (response.status === 200) {
      const result = await response.json();
      console.log(`[YARH] Selection exists (${result.id}), performing robust replacement...`);
      const delRes = await deleteReaderDocument(result.id);
      if (delRes.success) {
        await new Promise(r => setTimeout(r, 1500));
        response = await postSelection(cleanedUrl);
      }
    }

    if (response.ok) {
      const result = await response.json();
      return { success: true, id: result.id };
    } else {
      const errData = await response.json().catch(() => ({}));
      return { success: false, error: errData.detail || response.statusText };
    }
  } catch (e) { return { success: false, error: e.message }; }
}

async function updateReaderDocument(id, data) {
  const token = await getToken();
  if (!token) return { success: false, error: 'Token missing' };

  try {
    const response = await fetch(`https://readwise.io/api/v3/update/${id}/`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    return { success: response.ok };
  } catch (e) { return { success: false, error: e.message }; }
}

async function deleteReaderDocument(id) {
  const token = await getToken();
  if (!token) return { success: false, error: 'Token missing' };

  try {
    const response = await fetch(`https://readwise.io/api/v3/delete/${id}/`, {
      method: 'DELETE',
      headers: { 'Authorization': `Token ${token}` }
    });
    return { success: response.status === 204 || response.status === 404 };
  } catch (e) { return { success: false, error: e.message }; }
}

async function saveHighlight(data) {
  const token = await getToken();
  if (!token) return { success: false, error: 'Token missing' };

  try {
    const highlightObj = {
      text: data.text,
      title: data.title,
      source_url: cleanUrl(data.url),
      category: 'articles'
    };
    if (data.note?.trim().length > 0) highlightObj.note = data.note.trim();

    const response = await fetch('https://readwise.io/api/v2/highlights/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ highlights: [highlightObj] })
    });

    if (response.ok) {
      const result = await response.json();
      return { success: true, id: result[0]?.modified_highlights?.[0] };
    } else {
      const errData = await response.json().catch(() => ({}));
      return { success: false, error: errData.detail || response.statusText };
    }
  } catch (e) { return { success: false, error: e.message }; }
}

function updatePageIndicator(tabId, isSaved) {
  if (isSaved) {
    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4caf50', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

function sendMessageToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

// --- Background Enrichment Module (Phase 4) ---

async function runAutoEnrichment() {
  const settings = await getSettings();
  if (!settings.enableAutoEnrichment || !settings.readwiseToken) return;

  console.log('[YARH] Running auto-enrichment poll...');
  try {
    const lookback = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const response = await fetch(`https://readwise.io/api/v3/list/?updatedAfter=${lookback}&location=new&withHtmlContent=true`, {
      headers: { 'Authorization': `Token ${settings.readwiseToken}` }
    });

    if (!response.ok) return;
    const data = await response.json();
    const docs = data.results || [];

    for (const doc of docs) {
      const cleanedSource = cleanUrl(doc.source_url);
      if (!cleanedSource) continue;

      // Logic: word count < 300 or paywall markers
      const isThin = doc.word_count < 300 || /subscribe to continue|start your free trial|create a free account/i.test(doc.html_content || '');
      
      if (isThin) {
        console.log(`[YARH] Enrichment candidate: ${doc.title} (${doc.word_count} words)`);
        // We attempt a repair by fetching the URL invisibly
        try {
          const fetchRes = await fetch(cleanedSource, { credentials: 'omit' });
          if (fetchRes.ok) {
            const html = await fetchRes.text();
            if (html.length > 20000) { // Only update if we got a substantial page
              console.log(`[YARH] Repairing thin document: ${doc.id}`);
              await saveToReader(cleanedSource, doc.title, null, html);
            }
          }
        } catch (e) { console.warn(`[YARH] Fetch failed for ${cleanedSource}`, e); }
      }
    }
  } catch (e) { console.error('[YARH] Auto-enrichment error:', e); }
}

// --- Event Listeners ---

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'open-settings', title: 'Settings', contexts: ['action'] });
  chrome.contextMenus.create({ id: 'save-page-to-reader', title: 'Save Page to Reader', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'highlight-selection', title: 'Highlight Selection', contexts: ['selection'] });

  chrome.storage.sync.get(null, (items) => {
    const newSettings = {};
    for (let key in DEFAULT_SETTINGS) {
      if (items[key] === undefined) newSettings[key] = DEFAULT_SETTINGS[key];
    }
    if (Object.keys(newSettings).length > 0) chrome.storage.sync.set(newSettings);
  });

  chrome.alarms.create('enrichment-poll', { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'enrichment-poll') runAutoEnrichment();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-settings') chrome.runtime.openOptionsPage();
  else if (info.menuItemId === 'save-page-to-reader') sendMessageToTab(tab.id, { action: 'context-menu-save-page' });
  else if (info.menuItemId === 'highlight-selection') sendMessageToTab(tab.id, { action: 'context-menu-highlight' });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return;
  const settings = await getSettings();
  const cleanedUrl = cleanUrl(tab.url);
  const cachedStatus = urlStatusCache.get(cleanedUrl) || { isSaved: false };

  if (cachedStatus.isSaved) {
    if (settings.afterSaveAction === 'open_saved' && cachedStatus.readerUrl) chrome.tabs.create({ url: cachedStatus.readerUrl });
    else if (settings.afterSaveAction === 'delete' && cachedStatus.docId) {
      const result = await deleteReaderDocument(cachedStatus.docId);
      if (result.success) {
        urlStatusCache.set(cleanedUrl, { isSaved: false });
        updatePageIndicator(tab.id, false);
        sendMessageToTab(tab.id, { action: 'deletion-success' });
      }
    }
  } else {
    if (settings.beforeSaveAction === 'save') {
      sendMessageToTab(tab.id, { action: 'saving-started' });
      // We don't have the HTML here, the content script handles that in save-page-request
      // This path is for the browser action click when beforeSaveAction is 'save'
      // But content script usually sends 'save-page-request'.
      // If we call saveToReader from here without HTML, it relies on Readwise scraper.
      const result = await saveToReader(cleanedUrl, tab.title, tab.id);
      if (result.success) sendMessageToTab(tab.id, { action: 'saving-success' });
      else sendMessageToTab(tab.id, { action: 'saving-error', error: result.error });
    } else if (settings.beforeSaveAction === 'open_reader') chrome.tabs.create({ url: 'https://read.readwise.io/' });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) updatePageIndicator(tabId, false);
  if (changeInfo.status === 'complete' && tab.url) checkPageInReader(tab.url).then(isSaved => updatePageIndicator(tabId, isSaved));
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, async (tab) => {
    if (tab?.url) {
      const cleaned = cleanUrl(tab.url);
      const cached = await getCachedStatus(cleaned);
      if (cached.isSaved) updatePageIndicator(activeInfo.tabId, true);
      else {
        updatePageIndicator(activeInfo.tabId, false);
        checkPageInReader(tab.url).then(isSaved => updatePageIndicator(activeInfo.tabId, isSaved));
      }
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'save-page-request') {
    saveToReader(request.data.url, request.data.title, sender.tab.id, request.data.html).then(sendResponse);
    return true; 
  }
  if (request.action === 'save-highlight') { saveHighlight(request.data).then(sendResponse); return true; }
  if (request.action === 'delete-highlight') { deleteHighlight(request.id).then(sendResponse); return true; }
  if (request.action === 'save-reader-html') { saveReaderHtml(request.data).then(sendResponse); return true; }
  if (request.action === 'update-reader-document') { updateReaderDocument(request.id, request.data).then(sendResponse); return true; }
  if (request.action === 'delete-reader-document') { deleteReaderDocument(request.id).then(sendResponse); return true; }
});
t.action === 'update-reader-document') { updateReaderDocument(request.id, request.data).then(sendResponse); return true; }
  if (request.action === 'delete-reader-document') { deleteReaderDocument(request.id).then(sendResponse); return true; }
});
);

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab?.url) {
      const cleaned = cleanUrl(tab.url);
      if (urlStatusCache.has(cleaned)) updatePageIndicator(activeInfo.tabId, urlStatusCache.get(cleaned).isSaved);
      else {
        updatePageIndicator(activeInfo.tabId, false);
        checkPageInReader(tab.url).then(isSaved => updatePageIndicator(activeInfo.tabId, isSaved));
      }
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'save-page-request') {
    saveToReader(request.data.url, request.data.title, sender.tab.id, request.data.html).then(sendResponse);
    return true; 
  }
  if (request.action === 'save-highlight') { saveHighlight(request.data).then(sendResponse); return true; }
  if (request.action === 'delete-highlight') { deleteHighlight(request.id).then(sendResponse); return true; }
  if (request.action === 'save-reader-html') { saveReaderHtml(request.data).then(sendResponse); return true; }
  if (request.action === 'update-reader-document') { updateReaderDocument(request.id, request.data).then(sendResponse); return true; }
  if (request.action === 'delete-reader-document') { deleteReaderDocument(request.id).then(sendResponse); return true; }
});
