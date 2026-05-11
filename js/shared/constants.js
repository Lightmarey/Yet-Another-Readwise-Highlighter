/**
 * YARH Shared Constants
 */

(function(root) {
  root.YARH = root.YARH || {};
  root.YARH.Constants = {
    DEFAULT_SETTINGS: {
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
    }
  };
})(typeof self !== 'undefined' ? self : this);
