// This function is triggered at 6am UTC daily by Netlify cron
// It simply calls the stories endpoint to pre-generate today's stories
const handler = async () => {
  const siteUrl = process.env.URL || 'https://johnplusnews.com';
  console.log('[daily-cron] Triggering story generation...');
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/stories?action=today`);
    const data = await res.json();
    console.log(`[daily-cron] Result: ${res.status}`, data.date || data.status || data.error);
    return { statusCode: 200, body: 'Done' };
  } catch(e) {
    console.error('[daily-cron] Failed:', e.message);
    return { statusCode: 500, body: e.message };
  }
};

module.exports = { handler };
