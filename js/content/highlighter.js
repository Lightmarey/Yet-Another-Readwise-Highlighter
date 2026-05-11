/**
 * YARH Highlighter Engine
 * Responsible for non-destructive DOM manipulation.
 */

window.YARH = window.YARH || {};

window.YARH.Highlighter = {
  wrapRangeWithMark: function(range, className, attributes = {}, style = '') {
    const commonAncestor = range.commonAncestorContainer;
    const root = commonAncestor.nodeType === Node.TEXT_NODE ? commonAncestor.parentNode : commonAncestor;
    
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (range.intersectsNode(node)) {
        textNodes.push(node);
      }
    }

    const marks = [];
    textNodes.forEach(node => {
      let start = 0;
      let end = node.length;

      // Restore ELEMENT_NODE boundary offset calculation
      if (node === range.startContainer) {
        start = range.startOffset;
      } else if (range.startContainer.nodeType === Node.ELEMENT_NODE && node.parentNode === range.startContainer) {
        const index = Array.from(range.startContainer.childNodes).indexOf(node);
        if (index < range.startOffset) return;
        if (index === range.startOffset) start = 0;
      }

      if (node === range.endContainer) {
        end = range.endOffset;
      } else if (range.endContainer.nodeType === Node.ELEMENT_NODE && node.parentNode === range.endContainer) {
        const index = Array.from(range.endContainer.childNodes).indexOf(node);
        if (index > range.endOffset) return;
        if (index === range.endOffset) return;
      }

      if (start >= end || start < 0) return;

      try {
        const part = node.splitText(start);
        part.splitText(end - start);
        
        const mark = document.createElement('mark');
        mark.className = className;
        mark.setAttribute('style', (style || '') + ' display: inline !important; visibility: visible !important; opacity: 1 !important;');
        for (const [key, val] of Object.entries(attributes)) {
          mark.setAttribute(key, val);
        }
        
        if (part.parentNode) {
          part.parentNode.replaceChild(mark, part);
          mark.appendChild(part);
          marks.push(mark);
        }
      } catch (e) {
        console.warn('[YARH] Highlight Split Error:', e);
      }
    });
    
    return marks;
  }
};
