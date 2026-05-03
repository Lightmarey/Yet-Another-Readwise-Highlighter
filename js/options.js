const DEFAULT_SETTINGS = {
  readwiseToken: '',
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

document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('accessToken');
  const enableFABCheckbox = document.getElementById('enableFAB');
  const enableToolbarCheckbox = document.getElementById('enableToolbar');
  const checkStatusCheckbox = document.getElementById('checkPageStatus');
  const quickSaveCheckbox = document.getElementById('quickSaveSelection');
  const beforeSaveSelect = document.getElementById('beforeSaveAction');
  const afterSaveSelect = document.getElementById('afterSaveAction');
  const maxStylesInput = document.getElementById('maxStylesToDisplay');
  const defaultLocationSelect = document.getElementById('defaultLocation');
  const verticalPosSelect = document.getElementById('toolbarVerticalPosition');
  const horizontalOffsetInput = document.getElementById('toolbarHorizontalOffset');
  const excludedUrlsTextarea = document.getElementById('excludedUrls');
  const stylesList = document.getElementById('stylesList');
  const newStyleLabel = document.getElementById('newStyleLabel');
  const newStyleIcon = document.getElementById('newStyleIcon');
  const newStyleCSS = document.getElementById('newStyleCSS');
  const addStyleBtn = document.getElementById('addStyle');
  const saveButton = document.getElementById('save');
  const status = document.getElementById('status');
  const versionSpan = document.getElementById('version');

  let currentStyles = [];
  let dragSrcEl = null;

  // Set version from manifest
  try {
    const manifest = chrome.runtime.getManifest();
    if (versionSpan) versionSpan.textContent = `v${manifest.version}`;
  } catch (e) {
    console.warn('Could not load version from manifest');
  }

  // Load settings
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    if (tokenInput) tokenInput.value = settings.readwiseToken || '';
    if (enableFABCheckbox) enableFABCheckbox.checked = !!settings.enableFAB;
    if (enableToolbarCheckbox) enableToolbarCheckbox.checked = !!settings.enableToolbar;
    if (checkStatusCheckbox) checkStatusCheckbox.checked = !!settings.checkPageStatus;
    if (quickSaveCheckbox) quickSaveCheckbox.checked = !!settings.quickSaveSelection;
    if (beforeSaveSelect) beforeSaveSelect.value = settings.beforeSaveAction || 'save';
    if (afterSaveSelect) afterSaveSelect.value = settings.afterSaveAction || 'open_saved';
    if (maxStylesInput) maxStylesInput.value = settings.maxStylesToDisplay || 4;
    if (defaultLocationSelect) defaultLocationSelect.value = settings.defaultLocation || 'new';
    if (verticalPosSelect) verticalPosSelect.value = settings.toolbarVerticalPosition || 'above';
    if (horizontalOffsetInput) horizontalOffsetInput.value = settings.toolbarHorizontalOffset ?? 0;
    if (excludedUrlsTextarea) excludedUrlsTextarea.value = settings.excludedUrls || '';
    
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
          <span class="style-card-title">
            <span class="drag-handle">☰</span>
            <span style="color: #2c46f1; font-weight: 800; margin-right: 8px;">#${index + 1}</span>
            ${style.icon} ${style.label} ${isDefault ? '<span style="font-size: 10px; background: #eef0f2; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">DEFAULT</span>' : ''}
          </span>
          <button class="delete-style-btn" data-index="${index}">Delete</button>
        </div>
        <div class="style-preview" style="${style.css}">Preview Text</div>
      `;

      // Drag and Drop Events
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragover', handleDragOver);
      card.addEventListener('drop', handleDrop);
      card.addEventListener('dragend', handleDragEnd);

      stylesList.appendChild(card);
    });

    document.querySelectorAll('.delete-style-btn').forEach(btn => {
      btn.onclick = (e) => {
        const index = parseInt(e.target.getAttribute('data-index'), 10);
        currentStyles.splice(index, 1);
        renderStyles();
      };
    });
  }

  // --- Drag and Drop Logic ---

  function handleDragStart(e) {
    this.classList.add('dragging');
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.index);
  }

  function handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
  }

  function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();

    if (dragSrcEl !== this) {
      const fromIndex = parseInt(dragSrcEl.dataset.index, 10);
      const toIndex = parseInt(this.dataset.index, 10);
      
      // Reorder array
      const item = currentStyles.splice(fromIndex, 1)[0];
      currentStyles.splice(toIndex, 0, item);
      
      renderStyles();
    }
    return false;
  }

  function handleDragEnd() {
    this.classList.remove('dragging');
  }

  // --- Form Logic ---

  addStyleBtn.onclick = () => {
    const label = newStyleLabel.value.trim();
    const icon = newStyleIcon.value.trim() || '🖍️';
    const css = newStyleCSS.value.trim();

    if (!label || !css) {
      alert('Label and CSS are required');
      return;
    }

    currentStyles.push({
      id: 's' + Date.now(),
      label,
      icon,
      css
    });

    newStyleLabel.value = '';
    newStyleIcon.value = '';
    newStyleCSS.value = '';
    renderStyles();
  };

  // Save settings
  saveButton.addEventListener('click', () => {
    const settings = {
      readwiseToken: tokenInput.value.trim(),
      enableFAB: enableFABCheckbox.checked,
      enableToolbar: enableToolbarCheckbox.checked,
      checkPageStatus: checkStatusCheckbox.checked,
      quickSaveSelection: quickSaveCheckbox.checked,
      beforeSaveAction: beforeSaveSelect.value,
      afterSaveAction: afterSaveSelect.value,
      maxStylesToDisplay: parseInt(maxStylesInput.value, 10) || 4,
      defaultLocation: defaultLocationSelect.value,
      toolbarVerticalPosition: verticalPosSelect.value,
      toolbarHorizontalOffset: parseInt(horizontalOffsetInput.value, 10) || 0,
      excludedUrls: excludedUrlsTextarea.value.trim(),
      annotationStyles: currentStyles
    };

    if (!settings.readwiseToken) {
      status.textContent = 'Token is required.';
      status.style.color = '#ea4f3d';
      return;
    }

    status.textContent = 'Saving...';
    status.style.color = '#6a6a6b';

    chrome.storage.sync.set(settings, () => {
      status.textContent = 'Settings saved!';
      status.style.color = '#4caf50';
      setTimeout(() => {
        status.textContent = '';
      }, 2000);
    });
  });
});
