const DEFAULT_SETTINGS = {
  readwiseToken: '',
  enableFAB: true,
  enableToolbar: true,
  checkPageStatus: true,
  beforeSaveAction: 'save',
  afterSaveAction: 'open_saved',
  quickSaveSelection: false,
  defaultColor: 'yellow',
  defaultLocation: 'new'
};

document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('accessToken');
  const enableFABCheckbox = document.getElementById('enableFAB');
  const enableToolbarCheckbox = document.getElementById('enableToolbar');
  const checkStatusCheckbox = document.getElementById('checkPageStatus');
  const quickSaveCheckbox = document.getElementById('quickSaveSelection');
  const beforeSaveSelect = document.getElementById('beforeSaveAction');
  const afterSaveSelect = document.getElementById('afterSaveAction');
  const defaultColorSelect = document.getElementById('defaultColor');
  const defaultLocationSelect = document.getElementById('defaultLocation');
  const saveButton = document.getElementById('save');
  const status = document.getElementById('status');
  const versionSpan = document.getElementById('version');

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
    if (defaultColorSelect) defaultColorSelect.value = settings.defaultColor || 'yellow';
    if (defaultLocationSelect) defaultLocationSelect.value = settings.defaultLocation || 'new';
  });

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
      defaultColor: defaultColorSelect.value,
      defaultLocation: defaultLocationSelect.value
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
