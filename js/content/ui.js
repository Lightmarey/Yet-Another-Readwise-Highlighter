/**
 * YARH UI Component Module
 * Manages the Shadow DOM, Notifications, and Audio.
 */

window.YARH = window.YARH || {};

window.YARH.UI = {
  shadowRoot: null,
  notificationTimeout: null,

  getShadowRoot: function() {
    if (this.shadowRoot) return this.shadowRoot;
    const container = document.createElement('div');
    container.id = 'readwise-companion-root';
    container.style.cssText = 'position:fixed; top:0; left:0; width:0; height:0; z-index:2147483647; isolation:isolate;';
    document.body.appendChild(container);
    this.shadowRoot = container.attachShadow({ mode: 'open' });
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('css/content.css');
    this.shadowRoot.appendChild(link);
    return this.shadowRoot;
  },

  showNotification: function(text, type = 'info') {
    const root = this.getShadowRoot();
    let notification = root.querySelector('.rw-notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.className = 'rw-notification';
      root.appendChild(notification);
    }
    notification.textContent = text;
    notification.setAttribute('data-type', type);
    notification.classList.remove('visible');
    void notification.offsetWidth; // Trigger reflow
    notification.classList.add('visible');
    
    if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
    if (type !== 'loading') {
      this.notificationTimeout = setTimeout(() => notification.classList.remove('visible'), 3000);
    }
  },

  playSound: function(name) {
    const audio = new Audio(chrome.runtime.getURL(`audio/${name}.m4a`));
    audio.play().catch(() => {});
  }
};
