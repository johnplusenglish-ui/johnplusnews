// Triggered at 6am UTC daily by Netlify cron
const handler = async () => {
  const siteUrl = process.env.URL || 'https://johnplusnews.com';
  console.log('[daily-cron] Triggering background story generation...');
  try {
    await fetch(`${siteUrl}/.netlify/functions/generate-background`, { method: 'POST' });
    console.log('[daily-cron] Background generation triggered');
    return { statusCode: 200, body: 'Triggered' };
  } catch(e) {
    console.error('[daily-cron] Failed:', e.message);
    return { statusCode: 500, body: e.message };
  }
};

module.exports = { handler };
