/**
 * YARH Readwise API Client
 */

(function(root) {
  root.YARH = root.YARH || {};
  
  class ReadwiseClient {
    constructor(token) {
      this.token = token;
      this.baseUrl = 'https://readwise.io/api';
    }

    async saveDocument(payload) {
      if (!this.token) throw new Error('Token missing');
      payload.url = root.YARH.Utils.cleanUrl(payload.url);

      const response = await fetch(`${this.baseUrl}/v3/save/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      return { 
        status: response.status, 
        ok: response.ok, 
        success: response.ok,
        id: data.id,
        url: data.url,
        data 
      };
    }

    async updateDocument(id, data) {
      if (!this.token) throw new Error('Token missing');
      const response = await fetch(`${this.baseUrl}/v3/update/${id}/`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      const resData = await response.json().catch(() => ({}));
      return { success: response.ok, data: resData };
    }

    async deleteDocument(id) {
      if (!this.token) throw new Error('Token missing');
      const response = await fetch(`${this.baseUrl}/v3/delete/${id}/`, {
        method: 'DELETE',
        headers: { 'Authorization': `Token ${this.token}` }
      });
      return response.status === 204 || response.status === 404;
    }

    async listDocuments(params = {}) {
      if (!this.token) throw new Error('Token missing');
      const query = new URLSearchParams(params).toString();
      const response = await fetch(`${this.baseUrl}/v3/list/?${query}`, {
        headers: { 'Authorization': `Token ${this.token}` }
      });
      return await response.json();
    }

    async saveHighlight(highlight) {
      if (!this.token) throw new Error('Token missing');
      highlight.source_url = root.YARH.Utils.cleanUrl(highlight.source_url);
      const response = await fetch(`${this.baseUrl}/v2/highlights/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ highlights: [highlight] })
      });
      const data = await response.json().catch(() => ({}));
      return { success: response.ok, id: data[0]?.modified_highlights?.[0], data };
    }

    async deleteHighlight(id) {
      if (!this.token) throw new Error('Token missing');
      const response = await fetch(`${this.baseUrl}/v2/highlights/${id}/`, {
        method: 'DELETE',
        headers: { 'Authorization': `Token ${this.token}` }
      });
      return response.status === 204;
    }
  }

  root.YARH.ReadwiseClient = ReadwiseClient;
})(typeof self !== 'undefined' ? self : this);
