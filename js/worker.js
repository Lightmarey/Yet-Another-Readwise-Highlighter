/**
 * YARH Service Worker (Namespace Entry Point)
 */

importScripts(
  'shared/constants.js',
  'shared/utils.js',
  'background/api.js',
  'background/enrichment.js'
);

const { DEFAULT_SETTINGS } = self.YARH.Constants;
const { api, cleanUrl } = self.YARH.Utils;
const { ReadwiseClient } = self.YARH;
const { runAutoEnrichment } = self.YARH.Enrichment;

// --- State Management ---

async function getSettings() {
  return await api.storage.sync.get(DEFAULT_SETTINGS);
}

async function getCachedStatus(url) {
  const cleaned = cleanUrl(url);
  const { urlStatusCache } = await api.storage.local.get('urlStatusCache');
  return (urlStatusCache || {})[cleaned] || { isSaved: false };
}

async function setCachedStatus(url, data) {
  const cleaned = cleanUrl(url);
  const { urlStatusCache } = await api.storage.local.get('urlStatusCache');
  const cache = urlStatusCache || {};
  cache[cleaned] = { ...data, timestamp: Date.now() };
  
  // Cap cache size
  const keys = Object.keys(cache);
  if (keys.length > 500) {
    const oldestKey = keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp)[0];
    delete cache[oldestKey];
  }
  await api.storage.local.set({ urlStatusCache: cache });
}

function updatePageIndicator(tabId, isSaved) {
  if (isSaved) {
    api.action.setBadgeText({ text: '✓', tabId });
    api.action.setBadgeBackgroundColor({ color: '#4caf50', tabId });
  } else {
    api.action.setBadgeText({ text: '', tabId });
  }
}

// --- Logic Orchestration ---

async function handleSaveSequence(url, title, tabId, html = null) {
  const settings = await getSettings();
  const client = new ReadwiseClient(settings.readwiseToken);
  const cleaned = cleanUrl(url);

  try {
    let result = await client.saveDocument({
      url: cleaned,
      title: title,
      html: html,
      location: settings.defaultLocation,
      saved_using: 'YARH Companion Extension',
      should_clean_html: !!html
    });

    // Robust Replacement Logic (Delete-then-Create)
    if (result.status === 200 && html) {
      await client.deleteDocument(result.id);
      await new Promise(r => setTimeout(r, 1500));
      result = await client.saveDocument({
        url: cleaned,
        title: title,
        html: html,
        location: settings.defaultLocation,
        saved_using: 'YARH Companion Extension (Update)',
        should_clean_html: true
      });
    }

    if (result.success) {
      await setCachedStatus(cleaned, { isSaved: true, readerUrl: result.url, docId: result.id });
      if (tabId) updatePageIndicator(tabId, true);
      return { success: true, readerUrl: result.url, id: result.id };
    }
    return { success: false, error: result.data?.detail || 'Save failed' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function checkPageInReader(url) {
  const cleaned = cleanUrl(url);
  const cached = await getCachedStatus(cleaned);
  if (cached.isSaved) return true;

  const settings = await getSettings();
  if (!settings.readwiseToken || !settings.checkPageStatus) return false;
  if (!cleaned || cleaned.startsWith('chrome://') || cleaned.startsWith('about:')) return false;

  try {
    const client = new ReadwiseClient(settings.readwiseToken);
    const data = await client.listDocuments({ url: cleaned });
    const savedDoc = data.results && data.results.find(doc => cleanUrl(doc.source_url) === cleaned || cleanUrl(doc.url) === cleaned);
    const isSaved = !!savedDoc;
    if (isSaved) {
      await setCachedStatus(cleaned, { isSaved, readerUrl: savedDoc.url, docId: savedDoc.id });
    }
    return isSaved;
  } catch (e) { return false; }
}

// --- Event Listeners ---

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({ id: 'open-settings', title: 'Settings', contexts: ['action'] });
  api.contextMenus.create({ id: 'save-page-to-reader', title: api.i18n.getMessage('saveToReader'), contexts: ['page'] });
  api.contextMenus.create({ id: 'highlight-selection', title: api.i18n.getMessage('btnHighlightSelection'), contexts: ['selection'] });

  api.storage.sync.get(null, (items) => {
    const newSettings = {};
    for (let key in DEFAULT_SETTINGS) {
      if (items[key] === undefined) newSettings[key] = DEFAULT_SETTINGS[key];
    }
    if (Object.keys(newSettings).length > 0) api.storage.sync.set(newSettings);
  });

  api.alarms.create('enrichment-poll', { periodInMinutes: 5 });
});

api.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'enrichment-poll') {
    const settings = await getSettings();
    const client = new ReadwiseClient(settings.readwiseToken);
    runAutoEnrichment(client, settings);
  }
});

api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-settings') api.runtime.openOptionsPage();
  else api.tabs.sendMessage(tab.id, { action: `context-menu-${info.menuItemId.split('-').slice(1).join('-')}` });
});

api.action.onClicked.addListener(async (tab) => {
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return;
  const settings = await getSettings();
  const cleanedUrl = cleanUrl(tab.url);
  const cached = await getCachedStatus(cleanedUrl);

  if (cached.isSaved) {
    if (settings.afterSaveAction === 'open_saved' && cached.readerUrl) api.tabs.create({ url: cached.readerUrl });
    else if (settings.afterSaveAction === 'delete') {
      const client = new ReadwiseClient(settings.readwiseToken);
      if (await client.deleteDocument(cached.docId)) {
        await setCachedStatus(tab.url, { isSaved: false });
        updatePageIndicator(tab.id, false);
        api.tabs.sendMessage(tab.id, { action: 'deletion-success' });
      }
    }
  } else {
    if (settings.beforeSaveAction === 'save') {
      api.tabs.sendMessage(tab.id, { action: 'saving-started' });
      const res = await handleSaveSequence(tab.url, tab.title, tab.id);
      if (res.success) api.tabs.sendMessage(tab.id, { action: 'saving-success' });
      else api.tabs.sendMessage(tab.id, { action: 'saving-error', error: res.error });
    } else if (settings.beforeSaveAction === 'open_reader') api.tabs.create({ url: 'https://read.readwise.io/' });
  }
});

api.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'save-page-request' || request.action === 'save-reader-html') {
    handleSaveSequence(request.data.url, request.data.title, sender.tab.id, request.data.html).then(sendResponse);
    return true;
  }
  if (request.action === 'save-highlight') {
    getSettings().then(s => {
      const client = new ReadwiseClient(s.readwiseToken);
      client.saveHighlight(request.data).then(res => sendResponse(res));
    });
    return true;
  }
  if (request.action === 'delete-highlight') {
    getSettings().then(s => {
      const client = new ReadwiseClient(s.readwiseToken);
      client.deleteHighlight(request.id).then(ok => sendResponse({ success: ok }));
    });
    return true;
  }
  if (request.action === 'update-reader-document') {
    getSettings().then(s => {
      const client = new ReadwiseClient(s.readwiseToken);
      client.updateDocument(request.id, request.data).then(res => sendResponse(res));
    });
    return true;
  }
  if (request.action === 'delete-reader-document') {
    getSettings().then(s => {
      const client = new ReadwiseClient(s.readwiseToken);
      client.deleteDocument(request.id).then(ok => sendResponse({ success: ok }));
    });
    return true;
  }
  return false;
});

api.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) updatePageIndicator(tabId, false);
  if (changeInfo.status === 'complete' && tab.url) {
    const isSaved = await checkPageInReader(tab.url);
    updatePageIndicator(tabId, isSaved);
  }
});

api.tabs.onActivated.addListener((activeInfo) => {
  api.tabs.get(activeInfo.tabId, async (tab) => {
    if (tab?.url) {
      const isSaved = await checkPageInReader(tab.url);
      updatePageIndicator(activeInfo.tabId, isSaved);
    }
  });
});
