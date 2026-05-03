(function() {
  let shadowRoot = null;
  let notificationTimeout = null;
  let toolbar = null;
  let fab = null;
  let activeSelection = null;
  
  // Explicit defaults for content script initialization
  let settings = {
    enableFAB: true,
    enableToolbar: true,
    defaultLocation: 'new',
    quickSaveSelection: false,
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

  // --- Core Initialization ---

  function init() {
    // Pass the full settings object as a template to ensure all defaults are returned if missing in storage
    chrome.storage.sync.get(settings, (data) => {
      Object.assign(settings, data);
      if (isUrlExcluded()) return;
      updateUI();
      addListeners();
    });
  }

  function isUrlExcluded() {
    const currentUrl = window.location.href;
    const excludedPatterns = settings.excludedUrls;
    if (!excludedPatterns || excludedPatterns.trim() === '') return false;
    const patterns = excludedPatterns.split('\n').map(p => p.trim()).filter(p => p.length > 0);
    return patterns.some(pattern => {
      let p = pattern;
      if (!p.includes('://')) p = '*://' + p;
      const protocolSplit = p.split('://');
      if (protocolSplit.length > 1 && !protocolSplit[1].includes('/')) p = p + '/*';
      const regexStr = '^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
      try { return new RegExp(regexStr, 'i').test(currentUrl); } catch (e) { return false; }
    });
  }

  init();

  chrome.storage.onChanged.addListener((changes) => {
    for (let [key, { newValue }] of Object.entries(changes)) { 
      if (newValue !== undefined) settings[key] = newValue; 
    }
    updateUI();
  });

  function updateUI() {
    if (isUrlExcluded()) { if (fab) { fab.remove(); fab = null; } if (toolbar) { toolbar.style.display = 'none'; } return; }
    if (settings.enableFAB) createFAB();
    else if (fab) { fab.remove(); fab = null; }
  }

  function createShadowRoot() {
    if (shadowRoot) return shadowRoot;
    const container = document.createElement('div');
    container.id = 'readwise-companion-root';
    container.style.position = 'fixed'; container.style.top = '0'; container.style.left = '0';
    container.style.width = '0'; container.style.height = '0'; container.style.zIndex = '2147483647';
    document.body.appendChild(container);
    shadowRoot = container.attachShadow({ mode: 'open' });
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = chrome.runtime.getURL('css/content.css');
    shadowRoot.appendChild(link);
    return shadowRoot;
  }

  function showNotification(text, type = 'info') {
    const root = createShadowRoot();
    let notification = root.querySelector('.rw-notification');
    if (!notification) { notification = document.createElement('div'); notification.className = 'rw-notification'; root.appendChild(notification); }
    notification.textContent = text; notification.setAttribute('data-type', type);
    notification.classList.remove('visible'); void notification.offsetWidth; notification.classList.add('visible');
    if (notificationTimeout) clearTimeout(notificationTimeout);
    if (type !== 'loading') notificationTimeout = setTimeout(() => { notification.classList.remove('visible'); }, 3000);
  }

  function playSound(name) {
    const url = chrome.runtime.getURL(`audio/${name}.m4a`);
    const audio = new Audio(url); audio.play().catch(e => console.warn('Audio play failed:', e));
  }

  // --- FAB ---

  function createFAB() {
    if (fab) return fab;
    const root = createShadowRoot();
    fab = document.createElement('div');
    fab.className = 'rw-fab'; fab.title = 'Save page to Readwise';
    const img = document.createElement('img'); img.src = chrome.runtime.getURL('icon/toolbar-icon.png');
    fab.appendChild(img);
    let isDragging = false; let startX, startY, initialX, initialY;
    const onPointerMove = (e) => {
      const dx = e.clientX - startX; const dy = e.clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) { isDragging = true; fab.style.left = `${initialX + dx}px`; fab.style.top = `${initialY + dy}px`; fab.style.right = 'auto'; fab.style.bottom = 'auto'; }
    };
    const onPointerUp = (e) => {
      fab.releasePointerCapture(e.pointerId); fab.removeEventListener('pointermove', onPointerMove);
      fab.removeEventListener('pointerup', onPointerUp); fab.removeEventListener('pointercancel', onPointerUp);
      if (!isDragging) { if (fab.classList.contains('loading')) return; handleSavePage(); }
    };
    fab.addEventListener('pointerdown', (e) => {
      e.preventDefault(); fab.setPointerCapture(e.pointerId); isDragging = false;
      startX = e.clientX; startY = e.clientY; const rect = fab.getBoundingClientRect(); initialX = rect.left; initialY = rect.top;
      fab.addEventListener('pointermove', onPointerMove); fab.addEventListener('pointerup', onPointerUp); fab.addEventListener('pointercancel', onPointerUp);
    });
    root.appendChild(fab); return fab;
  }

  async function handleSavePage() {
    if (fab) fab.classList.add('loading');
    showNotification('Saving to Reader...', 'loading');
    chrome.runtime.sendMessage({ action: 'save-page-request' }, (response) => {
      if (fab) fab.classList.remove('loading');
      if (response && response.success) { showNotification('Saved to Reader!', 'success'); playSound('saved'); }
      else { showNotification(`Error: ${response ? response.error : 'Request failed'}`, 'error'); playSound('error'); }
    });
  }

  // --- Selection Toolbar ---

  function createToolbar() {
    if (toolbar) return toolbar;
    const root = createShadowRoot();
    toolbar = document.createElement('div');
    toolbar.className = 'rw-toolbar';
    toolbar.style.display = 'none';
    
    // Dynamic styles from settings
    const allStyles = settings.annotationStyles && settings.annotationStyles.length > 0 
      ? settings.annotationStyles 
      : [{ id: 'default', label: 'Highlight', icon: '✨', css: 'background-color: #ffd845;' }];

    // Only show the first 'n' styles based on settings
    const n = Math.max(1, settings.maxStylesToDisplay || 4);
    const displayStyles = allStyles.slice(0, n);

    displayStyles.forEach(style => {
      const btn = document.createElement('button');
      btn.className = 'rw-btn';
      btn.innerHTML = style.icon;
      btn.title = style.label;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        handleHighlightAction('highlight', style);
      });
      toolbar.appendChild(btn);
    });

    const divider = document.createElement('div');
    divider.className = 'rw-divider';
    toolbar.appendChild(divider);

    const noteBtn = document.createElement('button');
    noteBtn.className = 'rw-btn';
    noteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    noteBtn.title = 'Add Note';
    noteBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      handleHighlightAction('note', allStyles[0]);
    });
    toolbar.appendChild(noteBtn);

    const readerBtn = document.createElement('button');
    readerBtn.className = 'rw-btn';
    readerBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
    readerBtn.title = 'Save Selection to Reader';
    readerBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      handleHighlightAction('reader');
    });
    toolbar.appendChild(readerBtn);
    
    root.appendChild(toolbar);
    return toolbar;
  }

  function handleHighlightAction(mode, styleObj) {
    if (!activeSelection) return;
    const { text, range, rect, html } = activeSelection;
    hideToolbar();

    if (mode === 'reader' && settings.quickSaveSelection) {
      executeSaveToReaderHtml(html, text, range, [], '', settings.defaultLocation, false);
      return;
    }

    if (mode === 'note' || mode === 'reader') {
      showNoteUI(rect, { mode, existingNote: '', existingTags: [], existingLocation: settings.defaultLocation }, (data) => {
        if (mode === 'note') {
          executeSaveHighlight(text, range, styleObj, data.note);
        } else {
          executeSaveToReaderHtml(html, text, range, data.tags, data.note, data.location, true);
        }
      });
    } else {
      executeSaveHighlight(text, range, styleObj);
    }
  }

  function showNoteUI(rect, options, onSave) {
    const root = createShadowRoot();
    const noteContainer = document.createElement('div');
    noteContainer.className = 'rw-note-container';
    let tagInput = null; let locationSelect = null;
    if (options.mode === 'reader') {
      const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '8px'; row.style.marginBottom = '8px';
      tagInput = document.createElement('input'); tagInput.type = 'text'; tagInput.placeholder = 'Tags...'; tagInput.className = 'rw-tag-input'; tagInput.style.flex = '1'; tagInput.value = (options.existingTags || []).join(', ');
      locationSelect = document.createElement('select'); locationSelect.className = 'rw-tag-input'; locationSelect.style.width = 'auto';
      ['new', 'later', 'archive', 'feed'].forEach(loc => {
        const opt = document.createElement('option'); opt.value = loc; opt.textContent = loc.charAt(0).toUpperCase() + loc.slice(1);
        if (loc === (options.existingLocation || settings.defaultLocation)) opt.selected = true;
        locationSelect.appendChild(opt);
      });
      row.appendChild(tagInput); row.appendChild(locationSelect); noteContainer.appendChild(row);
    }
    const textarea = document.createElement('textarea'); textarea.placeholder = options.mode === 'reader' ? 'Add a note...' : 'Add highlight note...';
    textarea.className = 'rw-note-input'; textarea.value = options.existingNote || '';
    noteContainer.appendChild(textarea);
    const saveBtn = document.createElement('button'); saveBtn.className = 'rw-btn rw-btn-primary'; saveBtn.textContent = options.mode === 'reader' ? 'Save to Reader' : 'Save Note';
    saveBtn.onclick = () => {
      const note = textarea.value.trim();
      const tags = tagInput ? tagInput.value.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];
      const location = locationSelect ? locationSelect.value : settings.defaultLocation;
      onSave({ note, tags, location });
      noteContainer.remove();
    };
    noteContainer.appendChild(saveBtn);
    const scrollX = window.scrollX || window.pageXOffset; const scrollY = window.scrollY || window.pageYOffset; const offset = settings.toolbarHorizontalOffset || 0;
    noteContainer.style.left = `${Math.max(10, rect.left + scrollX + offset)}px`; noteContainer.style.top = `${rect.bottom + scrollY + 10}px`;
    root.appendChild(noteContainer); setTimeout(() => (tagInput || textarea).focus(), 50);
    const dismisser = (e) => { const path = e.composedPath(); if (noteContainer && !path.includes(noteContainer)) { noteContainer.remove(); document.removeEventListener('mousedown', dismisser); } };
    document.addEventListener('mousedown', dismisser);
  }

  function executeSaveHighlight(text, range, styleObj, note = '', existingMark = null) {
    showNotification(note ? 'Saving with note...' : 'Saving highlight...', 'loading');
    playSound('select');
    chrome.runtime.sendMessage({
      action: 'save-highlight',
      data: { text, note, title: document.title, url: window.location.href }
    }, (response) => {
      if (response && response.success) {
        showNotification('Highlight saved!', 'success'); playSound('saved');
        if (existingMark) updateExistingHighlight(existingMark, note);
        else applyVisualHighlight(range, styleObj, response.id, note);
        activeSelection = null;
      } else { showNotification(`Error: ${response ? response.error : 'API Request Failed'}`, 'error'); playSound('error'); }
    });
  }

  function executeSaveToReaderHtml(html, text, range, tags, notes, location, shouldMark = true, existingMark = null) {
    showNotification('Saving selection to Reader...', 'loading');
    playSound('select');
    chrome.runtime.sendMessage({
      action: 'save-reader-html',
      data: { url: window.location.href, html, title: document.title, tags, notes, location }
    }, (response) => {
      if (response && response.success) {
        showNotification('Selection saved to Reader!', 'success'); playSound('saved');
        if (existingMark) updateExistingReaderSave(existingMark, tags, notes);
        else if (shouldMark) applyReaderSaveHighlight(range, response.id, tags, notes);
        activeSelection = null;
      } else { showNotification(`Error: ${response ? response.error : 'API Request Failed'}`, 'error'); playSound('error'); }
    });
  }

  function applyVisualHighlight(range, styleObj, id, note) {
    try {
      const mark = document.createElement('mark');
      mark.className = 'rw-highlight';
      mark.setAttribute('style', styleObj.css);
      if (id) mark.setAttribute('data-rw-id', id);
      if (note) { mark.setAttribute('data-has-note', 'true'); mark.setAttribute('data-note-text', note); }
      const contents = range.extractContents(); mark.appendChild(contents); range.insertNode(mark);
      window.getSelection().removeAllRanges();
    } catch (e) { console.error('Highlight failed:', e); }
  }

  function applyReaderSaveHighlight(range, id, tags, notes) {
    try {
      const mark = document.createElement('mark');
      mark.className = 'rw-reader-save';
      if (id) mark.setAttribute('data-reader-id', id);
      if (tags) mark.setAttribute('data-tags', JSON.stringify(tags));
      if (notes) mark.setAttribute('data-notes', notes);
      const contents = range.extractContents(); mark.appendChild(contents); range.insertNode(mark);
      window.getSelection().removeAllRanges();
    } catch (e) { console.error('Reader save failed:', e); }
  }

  function updateExistingHighlight(mark, note) {
    if (note) { mark.setAttribute('data-has-note', 'true'); mark.setAttribute('data-note-text', note); }
    else { mark.removeAttribute('data-has-note'); mark.removeAttribute('data-note-text'); }
  }

  function updateExistingReaderSave(mark, tags, notes) {
    if (tags) mark.setAttribute('data-tags', JSON.stringify(tags));
    if (notes) mark.setAttribute('data-notes', notes);
  }

  // --- Context Menu Logic ---

  function showHighlightActions(mark, rect) {
    const root = createShadowRoot();
    const actionMenu = document.createElement('div');
    actionMenu.className = 'rw-toolbar'; 
    const noteBtn = document.createElement('button');
    noteBtn.className = 'rw-btn';
    noteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    noteBtn.onclick = () => {
      actionMenu.remove();
      const existingNote = mark.getAttribute('data-note-text') || '';
      const defaultStyle = settings.annotationStyles[0] || { css: '' };
      showNoteUI(rect, { mode: 'note', existingNote }, (data) => { executeSaveHighlight(mark.textContent, null, defaultStyle, data.note, mark); });
    };
    const removeBtn = document.createElement('button');
    removeBtn.className = 'rw-btn';
    removeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    removeBtn.onclick = () => {
      const id = mark.getAttribute('data-rw-id');
      if (id) chrome.runtime.sendMessage({ action: 'delete-highlight', id });
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      mark.remove(); actionMenu.remove(); showNotification('Highlight removed', 'info');
    };
    actionMenu.appendChild(noteBtn);
    const divider = document.createElement('div'); divider.className = 'rw-divider'; actionMenu.appendChild(divider);
    actionMenu.appendChild(removeBtn);
    positionToolbar(actionMenu, rect);
    root.appendChild(actionMenu);
    const dismisser = (e) => { const path = e.composedPath(); if (!path.includes(actionMenu)) { actionMenu.remove(); document.removeEventListener('mousedown', dismisser); } };
    setTimeout(() => document.addEventListener('mousedown', dismisser), 10);
  }

  function showReaderSaveActions(mark, rect) {
    const root = createShadowRoot();
    const actionMenu = document.createElement('div');
    actionMenu.className = 'rw-toolbar'; 
    const editBtn = document.createElement('button');
    editBtn.className = 'rw-btn';
    editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    editBtn.onclick = () => {
      actionMenu.remove();
      const existingNote = mark.getAttribute('data-notes') || '';
      const existingTags = JSON.parse(mark.getAttribute('data-tags') || '[]');
      showNoteUI(rect, { mode: 'reader', existingNote, existingTags }, (data) => {
        const id = mark.getAttribute('data-reader-id');
        chrome.runtime.sendMessage({ action: 'update-reader-document', id, data: { notes: data.note, tags: data.tags, location: data.location } }, (response) => {
          if (response && response.success) { updateExistingReaderSave(mark, data.tags, data.note); showNotification('Reader document updated!', 'success'); }
          else showNotification('Update failed: ' + (response ? response.error : 'Unknown'), 'error');
        });
      });
    };
    const removeBtn = document.createElement('button');
    removeBtn.className = 'rw-btn';
    removeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    removeBtn.onclick = () => {
      const id = mark.getAttribute('data-reader-id');
      if (id) chrome.runtime.sendMessage({ action: 'delete-reader-document', id });
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      mark.remove(); actionMenu.remove(); showNotification('Clip removed from Reader', 'info');
    };
    actionMenu.appendChild(editBtn);
    const divider = document.createElement('div'); divider.className = 'rw-divider'; actionMenu.appendChild(divider);
    actionMenu.appendChild(removeBtn);
    positionToolbar(actionMenu, rect);
    root.appendChild(actionMenu);
    const dismisser = (e) => { const path = e.composedPath(); if (!path.includes(actionMenu)) { actionMenu.remove(); document.removeEventListener('mousedown', dismisser); } };
    setTimeout(() => document.addEventListener('mousedown', dismisser), 10);
  }

  function positionToolbar(el, rect) {
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const offset = settings.toolbarHorizontalOffset || 0;
    el.style.left = `${rect.left + scrollX + (rect.width / 2) - 40 + offset}px`;
    if (settings.toolbarVerticalPosition === 'below') el.style.top = `${rect.bottom + scrollY + 10}px`;
    else el.style.top = `${rect.top + scrollY - 45}px`;
    el.style.display = 'flex';
  }

  function showToolbar(rect) {
    if (!settings.enableToolbar || isUrlExcluded()) return;
    if (toolbar) { toolbar.remove(); toolbar = null; } 
    const tb = createToolbar();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const offset = settings.toolbarHorizontalOffset || 0;
    const count = Math.max(1, settings.maxStylesToDisplay || 4);
    const tbWidth = (count * 32) + 80; 
    
    tb.style.left = `${rect.left + scrollX + (rect.width / 2) - (tbWidth / 2) + offset}px`;
    if (settings.toolbarVerticalPosition === 'below') tb.style.top = `${rect.bottom + scrollY + 10}px`;
    else tb.style.top = `${rect.top + scrollY - 50}px`;
    tb.style.display = 'flex';
  }

  function hideToolbar() { if (toolbar) { toolbar.style.display = 'none'; } }
  function getRangeHtml(range) { const div = document.createElement('div'); div.appendChild(range.cloneContents()); return div.innerHTML; }

  // --- Event Listeners ---

  function addListeners() {
    document.addEventListener('mouseup', (e) => {
      const path = e.composedPath();
      if (shadowRoot && path.includes(shadowRoot.host)) return;
      if (isUrlExcluded()) return;
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (text && text.length > 0) {
          const range = selection.getRangeAt(0).cloneRange();
          const rect = range.getBoundingClientRect();
          const html = getRangeHtml(range);
          activeSelection = { text, range, rect, html };
          showToolbar(rect);
        } else hideToolbar();
      }, 10);
    });

    document.addEventListener('click', (e) => {
      const path = e.composedPath();
      if (selectionExists() || isUrlExcluded()) return;
      const highlight = path.find(el => el.classList && el.classList.contains('rw-highlight'));
      if (highlight) { showHighlightActions(highlight, highlight.getBoundingClientRect()); return; }
      const readerSave = path.find(el => el.classList && el.classList.contains('rw-reader-save'));
      if (readerSave) { showReaderSaveActions(readerSave, readerSave.getBoundingClientRect()); return; }
    });
  }

  function selectionExists() {
    const selection = window.getSelection();
    return selection && selection.toString().trim().length > 0;
  }

  chrome.runtime.onMessage.addListener((request) => {
    switch (request.action) {
      case 'saving-started': showNotification('Saving to Reader...', 'loading'); if (fab) fab.classList.add('loading'); break;
      case 'saving-success': showNotification('Saved to Reader!', 'success'); playSound('saved'); if (fab) fab.classList.remove('loading'); break;
      case 'deletion-success': showNotification('Document deleted from Reader', 'deletion'); playSound('select'); if (fab) fab.classList.remove('loading'); break;
      case 'saving-error': showNotification(`Error: ${request.error}`, 'error'); playSound('error'); if (fab) fab.classList.remove('loading'); break;
    }
  });

})();
