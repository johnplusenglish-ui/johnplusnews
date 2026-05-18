const { getStore } = require('@netlify/blobs');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getStore_() {
  return getStore({
    name: 'news-archive',
    siteID: process.env.NETLIFY_SITE_ID || 'd12c7a6b-b0e0-480c-b9d1-f75fbebd371e',
    token: process.env.NETLIFY_TOKEN || 'nfp_SAfvmn8GDnUX2NGS9hy9XsHUkn4YoVcA9111',
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const action = (event.queryStringParameters || {}).action || 'today';
  const params = event.queryStringParameters || {};
  const store = getStore_();

  try {
    if (action === 'today') {
      const date = todayKey();

      let cached = null;
      try { cached = await store.get(date, { type: 'json' }); } catch(e) {}

      if (cached && cached.stories && cached.stories.length && !cached.partial) {
        return { statusCode: 200, headers, body: JSON.stringify(cached) };
      }

      let status = null;
      try { status = await store.get(`_status_${date}`, { type: 'json' }); } catch(e) {}

      if (cached && cached.stories && cached.stories.length) {
        return { statusCode: 200, headers, body: JSON.stringify({ ...cached, generating: status?.status === 'generating' }) };
      }

      const isGenerating = status && status.status === 'generating' &&
        (Date.now() - new Date(status.startedAt).getTime() < 600000);

      if (!isGenerating) {
        const siteUrl = process.env.URL || 'https://johnplusnews.com';
        fetch(`${siteUrl}/.netlify/functions/generate-background`, { method: 'POST' }).catch(() => {});
        await store.setJSON(`_status_${date}`, { status: 'generating', startedAt: new Date().toISOString() });
      }

      return {
        statusCode: 202,
        headers,
        body: JSON.stringify({ status: 'generating', message: 'Today\'s stories are being prepared. This page will update automatically.' })
      };
    }

    if (action === 'archive') {
      const date = params.date;
      if (!date) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing date' }) };
      const data = await store.get(date, { type: 'json' });
      if (!data) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (action === 'dates') {
      let index = [];
      try { index = await store.get('_index', { type: 'json' }) || []; } catch(e) {}
      return { statusCode: 200, headers, body: JSON.stringify({ dates: index }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Unknown endpoint' }) };
  } catch(e) {
    console.error('[stories] Error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
