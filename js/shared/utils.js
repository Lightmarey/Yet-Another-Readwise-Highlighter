/**
 * YARH Shared Utilities & Cross-Browser Shim
 */

(function(root) {
  root.YARH = root.YARH || {};
  
  const api = typeof browser !== 'undefined' ? browser : chrome;

  function cleanUrl(url) {
    if (!url) return url;
    try {
      const parsed = new URL(url);
      const params = new URLSearchParams(parsed.search);
      const tracking = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 
        'utm_id', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref'
      ];
      tracking.forEach(p => params.delete(p));
      parsed.search = params.toString();
      parsed.hash = '';
      return parsed.toString().replace(/\?$/, '');
    } catch (e) { 
      return url; 
    }
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  root.YARH.Utils = {
    api,
    cleanUrl,
    debounce
  };
})(typeof self !== 'undefined' ? self : this);
