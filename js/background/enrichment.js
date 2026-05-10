/**
 * YARH Background Enrichment Service
 */

(function(root) {
  root.YARH = root.YARH || {};

  async function runAutoEnrichment(client, settings) {
    if (!settings.enableAutoEnrichment || !client.token) return;

    try {
      const lookback = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const data = await client.listDocuments({
        updatedAfter: lookback,
        location: 'new',
        withHtmlContent: 'true'
      });

      const docs = data.results || [];
      const PAYWALL_REGEX = /subscribe to continue|start your free trial|create a free account|already a subscriber|regwall|premium content|subscriber exclusive/i;

      const { enrichmentCooldown } = await chrome.storage.local.get('enrichmentCooldown');
      const cooldowns = enrichmentCooldown || {};

      for (const doc of docs) {
        const cleanedSource = root.YARH.Utils.cleanUrl(doc.source_url);
        if (!cleanedSource || (cooldowns[cleanedSource] && Date.now() - cooldowns[cleanedSource] < 86400000)) continue;

        const isThin = doc.word_count < 300 || PAYWALL_REGEX.test(doc.html_content || '');
        if (isThin) {
          try {
            const fetchRes = await fetch(cleanedSource, { credentials: 'include', headers: { 'Accept': 'text/html' } });
            if (fetchRes.ok) {
              const html = await fetchRes.text();
              if (html.length > 30000 && !PAYWALL_REGEX.test(html)) { 
                await client.deleteDocument(doc.id);
                await new Promise(r => setTimeout(r, 1500));
                await client.saveDocument({
                  url: cleanedSource,
                  title: doc.title,
                  html: html,
                  should_clean_html: true,
                  saved_using: 'YARH Background Enrichment'
                });
              }
            }
          } catch (e) {}
        }
        cooldowns[cleanedSource] = Date.now();
      }
      await chrome.storage.local.set({ enrichmentCooldown: cooldowns });
    } catch (e) {
      console.error('[YARH] Enrichment Error:', e);
    }
  }

  root.YARH.Enrichment = { runAutoEnrichment };
})(typeof self !== 'undefined' ? self : this);
