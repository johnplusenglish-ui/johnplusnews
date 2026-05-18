const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  const store = getStore({
    name: 'news-archive',
    siteID: process.env.NETLIFY_SITE_ID || 'd12c7a6b-b0e0-480c-b9d1-f75fbebd371e',
    token: process.env.NETLIFY_TOKEN || 'nfp_SAfvmn8GDnUX2NGS9hy9XsHUkn4YoVcA9111',
  });
  const date = new Date().toISOString().slice(0, 10);
  const deleted = [];
  for (const key of [date, '_status_' + date, date + '-v2', date + '-v3', '_index']) {
    try { await store.delete(key); deleted.push(key); } catch(e) {}
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cleared: deleted })
  };
};
