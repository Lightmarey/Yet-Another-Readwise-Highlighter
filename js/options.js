const DEFAULT_SETTINGS = {
  readwiseToken: '',
  theme: 'auto',
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
    { id: 'h1', label: 'Yellow', icon: 'H', css: 'background-color: #ffd845;' },
    { id: 'h2', label: 'Blue Dot', icon: 'B', css: 'border-bottom: 2px dotted #a3c8ff; background: transparent;' },
    { id: 'h3', label: 'Red Wavy', icon: 'R', css: 'text-decoration: underline wavy red; background: transparent;' },
    { id: 'h4', label: 'Bold Italic', icon: 'B/I', css: 'font-weight: bold; font-style: italic; background: transparent;' }
  ]
};

const TRASH_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
const EDIT_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

document.addEventListener('DOMContentLoaded', () => {
  const inputs = {
    readwiseToken: document.getElementById('accessToken'),
    enableFAB: document.getElementById('enableFAB'),
    enableToolbar: document.getElementById('enableToolbar'),
    checkPageStatus: document.getElementById('checkPageStatus'),
    quickSaveSelection: document.getElementById('quickSaveSelection'),
    beforeSaveAction: document.getElementById('beforeSaveAction'),
    afterSaveAction: document.getElementById('afterSaveAction'),
    maxStylesToDisplay: document.getElementById('maxStylesToDisplay'),
    defaultLocation: document.getElementById('defaultLocation'),
    toolbarVerticalPosition: document.getElementById('toolbarVerticalPosition'),
    toolbarHorizontalOffset: document.getElementById('toolbarHorizontalOffset'),
    excludedUrls: document.getElementById('excludedUrls')
  };

  const stylesList = document.getElementById('stylesList');
  const toggleAddStyleBtn = document.getElementById('toggleAddStyle');
  const addStyleContainer = document.getElementById('addStyleContainer');
  const newStyleLabel = document.getElementById('newStyleLabel');
  const newStyleIcon = document.getElementById('newStyleIcon');
  const newStyleCSS = document.getElementById('newStyleCSS');
  const addStyleBtn = document.getElementById('addStyle');
  const cancelAddStyleBtn = document.getElementById('cancelAddStyle');
  const status = document.getElementById('status');
  const versionSpan = document.getElementById('version');
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');

  let currentStyles = [];
  let dragSrcEl = null;
  let autoSaveTimeout = null;
  let currentTheme = 'auto';

  function updateThemeIcon(theme) {
    themeIcon.className = 'fa-solid';
    if (theme === 'auto') themeIcon.classList.add('fa-circle-half-stroke');
    else if (theme === 'light') themeIcon.classList.add('fa-sun');
    else if (theme === 'dark') themeIcon.classList.add('fa-moon');
  }

  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.classList.remove('theme-light', 'theme-dark');
    if (theme === 'light') document.documentElement.classList.add('theme-light');
    else if (theme === 'dark') document.documentElement.classList.add('theme-dark');
    updateThemeIcon(theme);
  }

  themeToggle.onclick = () => {
    const themes = ['auto', 'light', 'dark'];
    const nextTheme = themes[(themes.indexOf(currentTheme) + 1) % themes.length];
    applyTheme(nextTheme);
    debounceSave();
  };

  // Set version from manifest
  try {
    const manifest = chrome.runtime.getManifest();
    if (versionSpan) versionSpan.textContent = `v${manifest.version}`;
  } catch (e) {}

  // Load settings
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    Object.keys(inputs).forEach(key => {
      const el = inputs[key];
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!settings[key];
      } else {
        el.value = settings[key] ?? DEFAULT_SETTINGS[key];
      }
      
      // Attach auto-save listeners
      const eventType = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(eventType, () => {
        debounceSave();
      });
    });
    
    applyTheme(settings.theme || 'auto');
    currentStyles = settings.annotationStyles || DEFAULT_SETTINGS.annotationStyles;
    renderStyles();
  });

  function renderStyles() {
    stylesList.innerHTML = '';
    currentStyles.forEach((style, index) => {
      const card = document.createElement('div');
      card.className = 'style-card';
      card.draggable = true;
      card.dataset.index = index;
      const isDefault = index === 0;
      
      card.innerHTML = `
        <div class="style-card-header">
          <div class="style-card-title">
            <span class="drag-handle">☰</span>
            <span style="color: #2c46f1; font-weight: 800; margin-right: 8px;">#${index + 1}</span>
            <span class="style-label-text">${style.icon} ${style.label}</span>
            ${isDefault ? '<span style="font-size: 10px; background: #eef0f2; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">DEFAULT</span>' : ''}
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="icon-btn edit-style-btn" data-index="${index}" title="Edit Style">${EDIT_ICON}</button>
            <button class="icon-btn delete-style-btn" data-index="${index}" title="Delete Style">${TRASH_ICON}</button>
          </div>
        </div>
        <div class="style-preview" style="${style.css}">Preview Text</div>
      `;

      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragover', handleDragOver);
      card.addEventListener('drop', handleDrop);
      card.addEventListener('dragend', handleDragEnd);

      stylesList.appendChild(card);
    });

    document.querySelectorAll('.delete-style-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const index = parseInt(btn.getAttribute('data-index'), 10);
        currentStyles.splice(index, 1);
        renderStyles();
        debounceSave();
      };
    });

    document.querySelectorAll('.edit-style-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const index = parseInt(btn.getAttribute('data-index'), 10);
        showEditModal(index);
      };
    });
  }

  function showEditModal(index) {
    const style = currentStyles[index];
    const card = document.querySelector(`.style-card[data-index="${index}"]`);
    card.draggable = false;
    card.classList.add('editing');
    card.innerHTML = `
      <div class="edit-form">
        <div class="field-row">
          <input type="text" id="editLabel" class="select-input" value="${style.label}" placeholder="Label">
          <input type="text" id="editIcon" class="select-input" value="${style.icon}" style="width: 60px;" placeholder="Icon">
        </div>
        <textarea id="editCSS" class="select-input" rows="3" placeholder="CSS Code">${style.css}</textarea>
        <div class="field-row" style="margin-top: 8px;">
          <button id="saveEdit" class="primary-btn" style="padding: 6px 12px; font-size: 12px;">Update</button>
          <button id="cancelEdit" class="secondary-btn" style="padding: 6px 12px; font-size: 12px; margin-top: 0;">Cancel</button>
        </div>
      </div>
    `;

    card.querySelector('#saveEdit').onclick = () => {
      style.label = card.querySelector('#editLabel').value.trim();
      style.icon = card.querySelector('#editIcon').value.trim();
      style.css = card.querySelector('#editCSS').value.trim();
      card.classList.remove('editing');
      renderStyles();
      debounceSave();
    };

    card.querySelector('#cancelEdit').onclick = () => {
      card.classList.remove('editing');
      renderStyles();
    };
  }

  function debounceSave() {
    status.textContent = 'Syncing...';
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => saveAllSettings(), 500);
  }

  function saveAllSettings() {
    const settings = {
      readwiseToken: inputs.readwiseToken.value.trim(),
      theme: currentTheme,
      enableFAB: inputs.enableFAB.checked,
      enableToolbar: inputs.enableToolbar.checked,
      checkPageStatus: inputs.checkPageStatus.checked,
      quickSaveSelection: inputs.quickSaveSelection.checked,
      beforeSaveAction: inputs.beforeSaveAction.value,
      afterSaveAction: inputs.afterSaveAction.value,
      maxStylesToDisplay: parseInt(inputs.maxStylesToDisplay.value, 10) || 4,
      defaultLocation: inputs.defaultLocation.value,
      toolbarVerticalPosition: inputs.toolbarVerticalPosition.value,
      toolbarHorizontalOffset: parseInt(inputs.toolbarHorizontalOffset.value, 10) || 0,
      excludedUrls: inputs.excludedUrls.value.trim(),
      annotationStyles: currentStyles
    };

    chrome.storage.sync.set(settings, () => {
      status.textContent = 'Changes Saved';
      setTimeout(() => { if (status.textContent === 'Changes Saved') status.textContent = ''; }, 2000);
    });
  }

  // --- Drag and Drop Logic ---

  function handleDragStart(e) {
    if (this.classList.contains('editing')) { e.preventDefault(); return; }
    this.classList.add('dragging');
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.index);
  }

  function handleDragOver(e) { if (e.preventDefault) e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return false; }

  function handleDrop(e) {
    e.stopPropagation(); e.preventDefault();
    if (dragSrcEl !== this) {
      const fromIndex = parseInt(dragSrcEl.dataset.index, 10);
      const toIndex = parseInt(this.dataset.index, 10);
      const item = currentStyles.splice(fromIndex, 1)[0];
      currentStyles.splice(toIndex, 0, item);
      renderStyles();
      debounceSave();
    }
    return false;
  }

  function handleDragEnd() { this.classList.remove('dragging'); }

  // --- Form Logic ---

  toggleAddStyleBtn.onclick = () => { addStyleContainer.style.display = 'block'; newStyleLabel.focus(); };
  cancelAddStyleBtn.onclick = () => { addStyleContainer.style.display = 'none'; };

  addStyleBtn.onclick = () => {
    const label = newStyleLabel.value.trim();
    const icon = newStyleIcon.value.trim() || '🖍️';
    const css = newStyleCSS.value.trim();
    if (!label || !css) { alert('Label and CSS are required'); return; }
    currentStyles.push({ id: 's' + Date.now(), label, icon, css });
    newStyleLabel.value = ''; newStyleIcon.value = ''; newStyleCSS.value = '';
    addStyleContainer.style.display = 'none';
    renderStyles();
    debounceSave();
  };
});
);
