const DEFAULT_SETTINGS = {
  readwiseToken: '',
  enableFAB: true,
  enableToolbar: true,
  checkPageStatus: true,
  openSavedInReader: true,
  quickSaveSelection: false,
  defaultColor: 'yellow',
  defaultLocation: 'new'
};

document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('accessToken');
  const enableFABCheckbox = document.getElementById('enableFAB');
  const enableToolbarCheckbox = document.getElementById('enableToolbar');
  const checkStatusCheckbox = document.getElementById('checkPageStatus');
  const openSavedCheckbox = document.getElementById('openSavedInReader');
  const quickSaveCheckbox = document.getElementById('quickSaveSelection');
  const defaultColorSelect = document.getElementById('defaultColor');
  const defaultLocationSelect = document.getElementById('defaultLocation');
  const saveButton = document.getElementById('save');
  const status = document.getElementById('status');

  // Load settings
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    tokenInput.value = settings.readwiseToken;
    enableFABCheckbox.checked = settings.enableFAB;
    enableToolbarCheckbox.checked = settings.enableToolbar;
    checkStatusCheckbox.checked = settings.checkPageStatus;
    openSavedCheckbox.checked = settings.openSavedInReader;
    quickSaveCheckbox.checked = settings.quickSaveSelection;
    defaultColorSelect.value = settings.defaultColor;
    defaultLocationSelect.value = settings.defaultLocation;
  });

  // Save settings
  saveButton.addEventListener('click', () => {
    const settings = {
      readwiseToken: tokenInput.value.trim(),
      enableFAB: enableFABCheckbox.checked,
      enableToolbar: enableToolbarCheckbox.checked,
      checkPageStatus: checkStatusCheckbox.checked,
      openSavedInReader: openSavedCheckbox.checked,
      quickSaveSelection: quickSaveCheckbox.checked,
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
