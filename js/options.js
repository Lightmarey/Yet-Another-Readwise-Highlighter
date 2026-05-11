/**
 * YARH Options Page
 * modular, localized, and secure.
 */

(function() {
  const { DEFAULT_SETTINGS } = window.YARH.Constants;
  const { api, debounce } = window.YARH.Utils;

  const TRASH_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
  const EDIT_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

  document.addEventListener('DOMContentLoaded', () => {
    const inputs = {
      readwiseToken: document.getElementById('accessToken'),
      enableFAB: document.getElementById('enableFAB'),
      enableToolbar: document.getElementById('enableToolbar'),
      checkPageStatus: document.getElementById('checkPageStatus'),
      enableAutoEnrichment: document.getElementById('enableAutoEnrichment'),
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
    let currentTheme = 'auto';
    let dragSrcEl = null;

    // --- Localization ---

    function localizePage() {
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const message = api.i18n.getMessage(key);
        if (message) {
          if (key === 'accessTokenHelp') {
            const link = el.querySelector('a');
            if (link) {
              const parts = message.split('$LINK$');
              el.innerHTML = '';
              if (parts[0]) el.appendChild(document.createTextNode(parts[0]));
              el.appendChild(link);
              if (parts[1]) el.appendChild(document.createTextNode(parts[1]));
            } else el.textContent = message;
          } else el.textContent = message;
        }
      });

      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const message = api.i18n.getMessage(key);
        if (message) el.placeholder = message;
      });

      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const message = api.i18n.getMessage(key);
        if (message) el.title = message;
      });
    }

    // --- Theme ---

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
      const next = themes[(themes.indexOf(currentTheme) + 1) % themes.length];
      applyTheme(next);
      saveAllSettings();
    };

    // --- State ---

    const debouncedSave = debounce(() => saveAllSettings(), 500);

    function saveAllSettings() {
      status.textContent = api.i18n.getMessage('statusSyncing') || 'Syncing...';
      const settings = {
        theme: currentTheme,
        annotationStyles: currentStyles
      };
      Object.keys(inputs).forEach(key => {
        const el = inputs[key];
        if (!el) return;
        if (el.type === 'checkbox') {
          settings[key] = el.checked;
        } else if (el.type === 'text' || el.type === 'password' || el.tagName === 'TEXTAREA') {
          settings[key] = el.value.trim();
        } else {
          settings[key] = el.value;
        }
      });

      api.storage.sync.set(settings, () => {
        status.textContent = api.i18n.getMessage('statusChangesSaved') || 'Changes Saved';
        setTimeout(() => { if (status.textContent.includes('Saved')) status.textContent = ''; }, 2000);
      });
    }

    // --- Drag & Drop ---

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
        saveAllSettings();
      }
      return false;
    }
    function handleDragEnd() { this.classList.remove('dragging'); }

    // --- Initialization ---

    localizePage();
    
    try {
      const manifest = api.runtime.getManifest();
      versionSpan.textContent = `v${manifest.version}`;
    } catch (e) {}

    api.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      Object.keys(inputs).forEach(key => {
        const el = inputs[key];
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!settings[key];
        else el.value = settings[key] ?? DEFAULT_SETTINGS[key];
        
        const eventType = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
        el.addEventListener(eventType, debouncedSave);
      });
      
      applyTheme(settings.theme || 'auto');
      currentStyles = settings.annotationStyles || DEFAULT_SETTINGS.annotationStyles;
      renderStyles();
    });

    // --- Style Management ---

    function renderStyles() {
      stylesList.innerHTML = '';
      currentStyles.forEach((style, index) => {
        const card = document.createElement('div');
        card.className = 'style-card';
        card.draggable = true;
        card.dataset.index = index;
        const isDefault = index === 0;
        
        const header = document.createElement('div');
        header.className = 'style-card-header';
        
        const title = document.createElement('div');
        title.className = 'style-card-title';
        
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.textContent = '☰';
        title.appendChild(dragHandle);

        const rank = document.createElement('span');
        rank.style.cssText = 'color:var(--accent-color);font-weight:800;margin-right:8px;';
        rank.textContent = ` #${index+1}`;
        title.appendChild(rank);

        const labelSpan = document.createElement('span');
        labelSpan.textContent = ` ${style.icon} ${style.label}`;
        title.appendChild(labelSpan);
        
        if (isDefault) {
          const defaultTag = document.createElement('span');
          defaultTag.style.cssText = 'font-size:10px;background:var(--border-surface);padding:2px 6px;border-radius:4px;margin-left:8px;';
          defaultTag.textContent = 'DEFAULT';
          title.appendChild(defaultTag);
        }
        
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; gap:8px;';

        const editBtn = document.createElement('button');
        editBtn.className = 'icon-btn';
        editBtn.innerHTML = EDIT_ICON;
        editBtn.onclick = () => showEditModal(index);
        
        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn';
        delBtn.innerHTML = TRASH_ICON;
        delBtn.onclick = () => {
          currentStyles.splice(index, 1);
          renderStyles();
          saveAllSettings();
        };
        
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        header.appendChild(title);
        header.appendChild(actions);
        
        const preview = document.createElement('div');
        preview.className = 'style-preview';
        preview.setAttribute('style', style.css);
        preview.textContent = 'Preview Text';
        
        card.appendChild(header);
        card.appendChild(preview);

        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('drop', handleDrop);
        card.addEventListener('dragend', handleDragEnd);

        stylesList.appendChild(card);
      });
    }

    function showEditModal(index) {
      const style = currentStyles[index];
      const card = document.querySelector(`.style-card[data-index="${index}"]`);
      card.innerHTML = '';
      card.classList.add('editing');
      card.draggable = false;

      const form = document.createElement('div');
      form.className = 'edit-form';

      const row1 = document.createElement('div');
      row1.className = 'field-row';
      const labelInp = document.createElement('input');
      labelInp.type = 'text'; labelInp.className = 'select-input'; labelInp.value = style.label;
      const iconInp = document.createElement('input');
      iconInp.type = 'text'; iconInp.className = 'select-input'; iconInp.value = style.icon; iconInp.style.width = '60px';
      row1.appendChild(labelInp); row1.appendChild(iconInp);

      const cssInp = document.createElement('textarea');
      cssInp.className = 'select-input'; cssInp.rows = 3; cssInp.value = style.css;

      const row2 = document.createElement('div');
      row2.className = 'field-row'; row2.style.marginTop = '8px';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'primary-btn'; saveBtn.textContent = 'Update'; saveBtn.style.cssText = 'padding: 6px 12px; font-size: 12px;';
      saveBtn.onclick = () => {
        style.label = labelInp.value.trim();
        style.icon = iconInp.value.trim();
        style.css = cssInp.value.trim();
        card.classList.remove('editing');
        renderStyles();
        saveAllSettings();
      };
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'secondary-btn'; cancelBtn.textContent = 'Cancel'; cancelBtn.style.cssText = 'padding: 6px 12px; font-size: 12px; margin-top: 0;';
      cancelBtn.onclick = () => { card.classList.remove('editing'); renderStyles(); };
      
      row2.appendChild(saveBtn); row2.appendChild(cancelBtn);
      form.appendChild(row1); form.appendChild(cssInp); form.appendChild(row2);
      card.appendChild(form);
    }

    toggleAddStyleBtn.onclick = () => { addStyleContainer.style.display = 'block'; newStyleLabel.focus(); };
    cancelAddStyleBtn.onclick = () => { addStyleContainer.style.display = 'none'; };

    addStyleBtn.onclick = () => {
      const label = newStyleLabel.value.trim();
      const icon = newStyleIcon.value.trim() || '✨';
      const css = newStyleCSS.value.trim();
      if (!label || !css) return;
      currentStyles.push({ id: 's' + Date.now(), label, icon, css });
      renderStyles();
      saveAllSettings();
      addStyleContainer.style.display = 'none';
      newStyleLabel.value = ''; newStyleIcon.value = ''; newStyleCSS.value = '';
    };
  });
})();
