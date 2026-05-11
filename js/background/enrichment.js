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

      const { enrichmentCooldown } = await root.YARH.Utils.api.storage.local.get('enrichmentCooldown');
      const cooldowns = enrichmentCooldown || {};
      const now = Date.now();

      // Cleanup stale cooldowns (older than 48 hours)
      for (const [key, ts] of Object.entries(cooldowns)) {
        if (now - ts > 48 * 60 * 60 * 1000) delete cooldowns[key];
      }

      for (const doc of docs) {
        const cleanedSource = root.YARH.Utils.cleanUrl(doc.source_url);
        if (!cleanedSource || (cooldowns[cleanedSource] && now - cooldowns[cleanedSource] < 86400000)) continue;

        const isThin = doc.word_count < 300 || PAYWALL_REGEX.test(doc.html_content || '');
        if (isThin) {
          try {
            const fetchRes = await fetch(cleanedSource, { credentials: 'include', headers: { 'Accept': 'text/html' } });
            if (fetchRes.ok) {
              const html = await fetchRes.text();
              if (html.length > 30000 && !PAYWALL_REGEX.test(html)) { 
                const delRes = await client.deleteDocument(doc.id);
                if (delRes) {
                  await new Promise(r => setTimeout(r, 1500));
                  
                  const payload = {
                    url: cleanedSource,
                    title: doc.title,
                    html: html,
                    should_clean_html: true,
                    location: doc.location || 'new',
                    saved_using: 'YARH Background Enrichment'
                  };
                  if (doc.notes) payload.notes = doc.notes;
                  if (doc.tags && Object.keys(doc.tags).length > 0) {
                    payload.tags = Object.keys(doc.tags);
                  }
                  
                  await client.saveDocument(payload);
                }
              }
            }
          } catch (e) {}
        }
        cooldowns[cleanedSource] = now;
      }
      await root.YARH.Utils.api.storage.local.set({ enrichmentCooldown: cooldowns });
    } catch (e) {
      console.error('[YARH] Enrichment Error:', e);
    }
  }

  root.YARH.Enrichment = { runAutoEnrichment };
})(typeof self !== 'undefined' ? self : this);
