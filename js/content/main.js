/**
 * YARH Content Main
 * Orchestrates selection events, UI initialization, and settings syncing.
 */

(function() {
  const getHighlighter = () => window.YARH.Highlighter;
  const getUI = () => window.YARH.UI;
  const getUtils = () => window.YARH.Utils;
  
  let settings = {
    theme: 'auto',
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
  let activeSelection = null;
  let fab = null;
  let toolbar = null;

  async function init() {
    // FIX: Pass the settings template to ensure defaults are hydrated correctly
    getUtils().api.storage.sync.get(settings, (data) => {
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

  getUtils().api.storage.onChanged.addListener((changes) => {
    for (let [key, { newValue }] of Object.entries(changes)) { 
      if (newValue !== undefined) settings[key] = newValue; 
    }
    updateUI();
  });

  function updateUI() {
    const UI = getUI();
    if (isUrlExcluded()) {
      if (fab) { fab.remove(); fab = null; }
      if (toolbar) { toolbar.style.display = 'none'; }
      return;
    }
    
    // Theme syncing for Shadow Host
    const root = UI.getShadowRoot();
    const host = root.host;
    host.classList.remove('theme-light', 'theme-dark');
    if (settings.theme === 'light') host.classList.add('theme-light');
    else if (settings.theme === 'dark') host.classList.add('theme-dark');

    if (settings.enableFAB) createFAB();
    else if (fab) { fab.remove(); fab = null; }
  }

  // --- UI Components ---

  function createFAB() {
    if (fab) return fab;
    const UI = getUI();
    const root = UI.getShadowRoot();
    fab = document.createElement('div');
    fab.className = 'rw-fab';
    fab.title = getUtils().api.i18n.getMessage('saveToReader');
    
    const img = document.createElement('img');
    img.src = getUtils().api.runtime.getURL('icon/toolbar-icon.png');
    fab.appendChild(img);

    let isDragging = false; let startX, startY, initialX, initialY;
    const onPointerMove = (e) => {
      const dx = e.clientX - startX; const dy = e.clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDragging = true;
        fab.style.left = `${initialX + dx}px`;
        fab.style.top = `${initialY + dy}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
      }
    };
    const onPointerUp = (e) => {
      fab.releasePointerCapture(e.pointerId);
      fab.removeEventListener('pointermove', onPointerMove);
      fab.removeEventListener('pointerup', onPointerUp);
      fab.removeEventListener('pointercancel', onPointerUp); // Robust cleanup
      if (!isDragging) {
        if (fab.classList.contains('loading')) return;
        handleSavePage();
      }
    };
    fab.addEventListener('pointerdown', (e) => {
      e.preventDefault(); fab.setPointerCapture(e.pointerId); isDragging = false;
      startX = e.clientX; startY = e.clientY; const rect = fab.getBoundingClientRect(); initialX = rect.left; initialY = rect.top;
      fab.addEventListener('pointermove', onPointerMove);
      fab.addEventListener('pointerup', onPointerUp);
      fab.addEventListener('pointercancel', onPointerUp);
    });
    
    root.appendChild(fab);
    return fab;
  }

  function createToolbar() {
    if (toolbar) return toolbar;
    const UI = getUI();
    const root = UI.getShadowRoot();
    toolbar = document.createElement('div');
    toolbar.className = 'rw-toolbar';
    toolbar.style.display = 'none';
    
    const allStyles = (settings.annotationStyles && settings.annotationStyles.length > 0) 
      ? settings.annotationStyles 
      : [{ id: 'default', label: 'Highlight', icon: '✨', css: 'background-color: #ffd845;' }];

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

    const noteBtn = createToolbarBtn('M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z', getUtils().api.i18n.getMessage('btnAddNote'));
    noteBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      handleHighlightAction('note', allStyles[0]);
    });
    toolbar.appendChild(noteBtn);

    const readerBtn = createToolbarBtn('M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z', getUtils().api.i18n.getMessage('btnSaveSelection'));
    readerBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      handleHighlightAction('reader');
    });
    toolbar.appendChild(readerBtn);
    
    root.appendChild(toolbar);
    return toolbar;
  }

  function createToolbarBtn(path, title) {
    const btn = document.createElement('button');
    btn.className = 'rw-btn';
    btn.title = title;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"></path></svg>`;
    return btn;
  }

  // --- Logic ---

  async function handleSavePage() {
    const UI = getUI();
    const Utils = getUtils();
    if (fab) fab.classList.add('loading');
    UI.showNotification(getUtils().api.i18n.getMessage('statusSaving'), 'loading');
    
    const html = getFullCleanedHTML();
    getUtils().api.runtime.sendMessage({ 
      action: 'save-page-request',
      data: { url: Utils.cleanUrl(window.location.href), html, title: document.title }
    }, (response) => {
      if (fab) fab.classList.remove('loading');
      if (response && response.success) { UI.showNotification(getUtils().api.i18n.getMessage('statusSaved'), 'success'); UI.playSound('saved'); }
      else { UI.showNotification(`${getUtils().api.i18n.getMessage('statusError')}: ${response ? response.error : ''}`, 'error'); UI.playSound('error'); }
    });
  }

  function handleHighlightAction(mode, styleObj) {
    if (!activeSelection) return;
    const { text, range, rect, html } = activeSelection;
    if (toolbar) toolbar.style.display = 'none';

    if (mode === 'reader' && settings.quickSaveSelection) {
      executeSaveToReaderHtml(html, text, range, [], '', settings.defaultLocation, false);
      return;
    }

    if (mode === 'note' || mode === 'reader') {
      showNoteUI(rect, { mode, existingNote: '', existingTags: [], existingLocation: settings.defaultLocation }, (data) => {
        if (mode === 'note') executeSaveHighlight(text, range, styleObj, data.note);
        else executeSaveToReaderHtml(html, text, range, data.tags, data.note, data.location, true);
      });
    } else {
      executeSaveHighlight(text, range, styleObj);
    }
  }

  function showNoteUI(rect, options, onSave) {
    const UI = getUI();
    const root = UI.getShadowRoot();
    const noteContainer = document.createElement('div');
    noteContainer.className = 'rw-note-container';
    
    let tagInput = null; let locationSelect = null;
    if (options.mode === 'reader') {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:8px; margin-bottom:8px;';
      tagInput = document.createElement('input');
      tagInput.placeholder = 'Tags...';
      tagInput.className = 'rw-tag-input';
      tagInput.style.flex = '1';
      tagInput.value = (options.existingTags || []).join(', ');
      
      locationSelect = document.createElement('select');
      locationSelect.className = 'rw-tag-input';
      ['new', 'later', 'archive', 'feed'].forEach(loc => {
        const opt = document.createElement('option'); opt.value = loc; opt.textContent = loc.charAt(0).toUpperCase() + loc.slice(1);
        if (loc === (options.existingLocation || settings.defaultLocation)) opt.selected = true;
        locationSelect.appendChild(opt);
      });
      row.appendChild(tagInput); row.appendChild(locationSelect); noteContainer.appendChild(row);
    }

    const textarea = document.createElement('textarea');
    textarea.className = 'rw-note-input';
    textarea.placeholder = options.mode === 'reader' ? 'Add a note...' : 'Add highlight note...';
    textarea.value = options.existingNote || '';
    noteContainer.appendChild(textarea);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'rw-btn rw-btn-primary';
    saveBtn.textContent = options.mode === 'reader' ? 'Save to Reader' : 'Save Note';
    saveBtn.onclick = () => {
      onSave({ 
        note: textarea.value.trim(), 
        tags: tagInput ? tagInput.value.split(',').map(t => t.trim()).filter(t => t.length > 0) : [],
        location: locationSelect ? locationSelect.value : settings.defaultLocation
      });
      noteContainer.remove();
    };
    noteContainer.appendChild(saveBtn);

    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    noteContainer.style.left = `${Math.max(10, rect.left + scrollX + (settings.toolbarHorizontalOffset || 0))}px`;
    noteContainer.style.top = `${rect.bottom + scrollY + 10}px`;
    
    root.appendChild(noteContainer);
    setTimeout(() => (tagInput || textarea).focus(), 50);

    const dismisser = (e) => { 
      if (!e.composedPath().includes(noteContainer)) { 
        noteContainer.remove(); 
        document.removeEventListener('mousedown', dismisser); 
      } 
    };
    document.addEventListener('mousedown', dismisser);
  }

  function executeSaveHighlight(text, range, styleObj, note = '', existingMark = null) {
    const UI = getUI();
    const Utils = getUtils();
    const Highlighter = getHighlighter();
    UI.showNotification(getUtils().api.i18n.getMessage('statusSaving'), 'loading');
    UI.playSound('select');
    getUtils().api.runtime.sendMessage({
      action: 'save-highlight',
      data: { text, note, title: document.title, url: Utils.cleanUrl(window.location.href) }
    }, (response) => {
      if (response && response.success) {
        UI.showNotification(getUtils().api.i18n.getMessage('statusHighlightSaved'), 'success'); UI.playSound('saved');
        if (!existingMark) {
          const attrs = { 'data-rw-id': response.id };
          if (note) { attrs['data-has-note'] = 'true'; attrs['data-note-text'] = note; }
          Highlighter.wrapRangeWithMark(range, 'rw-highlight', attrs, styleObj.css);
        }
        else {
          if (note) {
            existingMark.setAttribute('data-has-note', 'true');
            existingMark.setAttribute('data-note-text', note);
          } else {
            existingMark.removeAttribute('data-has-note');
            existingMark.removeAttribute('data-note-text');
          }
        }
        activeSelection = null;
      } else { UI.showNotification(getUtils().api.i18n.getMessage('statusError'), 'error'); UI.playSound('error'); }
    });
  }

  function executeSaveToReaderHtml(html, text, range, tags, notes, location, shouldMark = true) {
    const UI = getUI();
    const Utils = getUtils();
    const Highlighter = getHighlighter();
    UI.showNotification(getUtils().api.i18n.getMessage('statusSaving'), 'loading');
    UI.playSound('select');
    getUtils().api.runtime.sendMessage({
      action: 'save-reader-html',
      data: { url: Utils.cleanUrl(window.location.href), html, title: document.title, tags, notes, location }
    }, (response) => {
      if (response && response.success) {
        UI.showNotification(getUtils().api.i18n.getMessage('statusSaved'), 'success'); UI.playSound('saved');
        if (shouldMark) Highlighter.wrapRangeWithMark(range, 'rw-reader-save', { 'data-reader-id': response.id, 'data-tags': JSON.stringify(tags), 'data-notes': notes });
        activeSelection = null;
      } else { UI.showNotification(getUtils().api.i18n.getMessage('statusError'), 'error'); UI.playSound('error'); }
    });
  }

  function getFullCleanedHTML() {
    const clone = document.documentElement.cloneNode(true);
    const stripSelectors = ['script', 'style', 'noscript', 'iframe', 'canvas', 'video', 'audio', 'ins.adsbygoogle', '.ad-unit', '.social-share', 'link[rel="stylesheet"]'];
    stripSelectors.forEach(selector => clone.querySelectorAll(selector).forEach(el => el.remove()));
    const all = clone.getElementsByTagName("*");
    for (let i = 0, max = all.length; i < max; i++) {
      const el = all[i]; const attrs = el.attributes;
      for (let j = attrs.length - 1; j >= 0; j--) {
        const attr = attrs[j].name;
        if (attr.startsWith('on') || attr.startsWith('data-v-')) el.removeAttribute(attr);
      }
    }
    return '<!DOCTYPE html>\n' + clone.outerHTML;
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

  function addListeners() {
    const UI = getUI();
    document.addEventListener('mouseup', (e) => {
      const UI = getUI();
      const root = UI.getShadowRoot();
      if (e.composedPath().includes(root.host)) return;
      if (isUrlExcluded()) return;

      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (text) {
          const range = selection.getRangeAt(0).cloneRange();
          const rect = range.getBoundingClientRect();
          activeSelection = { text, range, rect, html: getRangeHtml(range) };
          showToolbar(rect);
        } else if (toolbar) toolbar.style.display = 'none';
      }, 10);
    });

    document.addEventListener('click', (e) => {
      const path = e.composedPath();
      if (selectionExists()) return;
      const highlight = path.find(el => el.classList?.contains('rw-highlight'));
      if (highlight) { showHighlightContext(highlight, highlight.getBoundingClientRect()); return; }
      const readerSave = path.find(el => el.classList?.contains('rw-reader-save'));
      if (readerSave) { showReaderContext(readerSave, readerSave.getBoundingClientRect()); return; }
    });

    getUtils().api.runtime.onMessage.addListener((request) => {
      if (request.action === 'context-menu-highlight') {
        if (activeSelection) handleHighlightAction('highlight', settings.annotationStyles[0]);
        else UI.showNotification(getUtils().api.i18n.getMessage('statusSelectText'), 'info');
      }
      if (request.action === 'context-menu-save-page') handleSavePage();
      
      const statusMap = { 'saving-started': 'statusSaving', 'saving-success': 'statusSaved', 'deletion-success': 'statusDeleted', 'saving-error': 'statusError' };
      if (statusMap[request.action]) {
        UI.showNotification(getUtils().api.i18n.getMessage(statusMap[request.action]), request.action.includes('success') ? 'success' : 'info');
        if (request.action === 'saving-started' && fab) fab.classList.add('loading');
        if (request.action === 'saving-success' && fab) fab.classList.remove('loading');
        if (request.action === 'saving-success') UI.playSound('saved');
        if (request.action === 'deletion-success') UI.playSound('select');
        if (request.action === 'saving-error') UI.playSound('error');
      }
    });
  }

  function selectionExists() {
    const selection = window.getSelection();
    return selection && selection.toString().trim().length > 0;
  }

  function showToolbar(rect) {
    if (!settings.enableToolbar) return;
    const tb = createToolbar();
    positionToolbar(tb, rect);
  }

  function getRangeHtml(range) {
    const div = document.createElement('div');
    div.appendChild(range.cloneContents());
    return div.innerHTML;
  }

  function showHighlightContext(mark, rect) {
    const UI = getUI(); const root = UI.getShadowRoot();
    const menu = document.createElement('div'); menu.className = 'rw-toolbar';
    const noteBtn = createToolbarBtn('M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z', getUtils().api.i18n.getMessage('btnEditNote'));
    noteBtn.onclick = () => {
      menu.remove(); const existingNote = mark.getAttribute('data-note-text') || '';
      showNoteUI(rect, { mode: 'note', existingNote }, (data) => executeSaveHighlight(mark.textContent, null, {}, data.note, mark));
    };
    const deleteBtn = createToolbarBtn('M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', getUtils().api.i18n.getMessage('btnDeleteHighlight'));
    deleteBtn.onclick = () => {
      const id = mark.getAttribute('data-rw-id');
      if (id) getUtils().api.runtime.sendMessage({ action: 'delete-highlight', id });
      const parent = mark.parentNode; while (mark.firstChild) parent.insertBefore(mark.firstChild, mark); mark.remove(); menu.remove();
      UI.showNotification(getUtils().api.i18n.getMessage('statusRemoved'), 'info');
    };
    menu.appendChild(noteBtn); menu.appendChild(deleteBtn); positionToolbar(menu, rect); root.appendChild(menu);
    const dismisser = (e) => { if (!e.composedPath().includes(menu)) { menu.remove(); document.removeEventListener('mousedown', dismisser); } };
    setTimeout(() => document.addEventListener('mousedown', dismisser), 10);
  }

  function showReaderContext(mark, rect) {
    const UI = getUI(); const root = UI.getShadowRoot();
    const menu = document.createElement('div'); menu.className = 'rw-toolbar';
    const editBtn = createToolbarBtn('M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z', getUtils().api.i18n.getMessage('btnEditClip'));
    editBtn.onclick = () => {
      menu.remove(); const notes = mark.getAttribute('data-notes') || ''; const tags = JSON.parse(mark.getAttribute('data-tags') || '[]');
      showNoteUI(rect, { mode: 'reader', existingNote: notes, existingTags: tags }, (data) => {
        const id = mark.getAttribute('data-reader-id');
        getUtils().api.runtime.sendMessage({ action: 'update-reader-document', id, data: { notes: data.note, tags: data.tags, location: data.location } }, (res) => {
          if (res.success) { 
            if (data.note) mark.setAttribute('data-notes', data.note); else mark.removeAttribute('data-notes');
            if (data.tags && data.tags.length > 0) mark.setAttribute('data-tags', JSON.stringify(data.tags)); else mark.removeAttribute('data-tags');
            UI.showNotification(getUtils().api.i18n.getMessage('statusClipUpdated'), 'success'); 
          }
        });
      });
    };
    const deleteBtn = createToolbarBtn('M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', getUtils().api.i18n.getMessage('btnDeleteClip'));
    deleteBtn.onclick = () => {
      const id = mark.getAttribute('data-reader-id');
      if (id) getUtils().api.runtime.sendMessage({ action: 'delete-reader-document', id });
      const parent = mark.parentNode; while (mark.firstChild) parent.insertBefore(mark.firstChild, mark); mark.remove(); menu.remove();
      UI.showNotification(getUtils().api.i18n.getMessage('statusDeleted'), 'deletion');
    };
    menu.appendChild(editBtn); menu.appendChild(deleteBtn); positionToolbar(menu, rect); root.appendChild(menu);
    const dismisser = (e) => { if (!e.composedPath().includes(menu)) { menu.remove(); document.removeEventListener('mousedown', dismisser); } };
    setTimeout(() => document.addEventListener('mousedown', dismisser), 10);
  }

  init();
})();
