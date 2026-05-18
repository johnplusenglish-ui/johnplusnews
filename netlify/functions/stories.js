const { getStore } = require('@netlify/blobs');

const ANTHROPIC_KEY = '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';
const GUARDIAN_KEY = 'ea0656dd-f35e-4431-882f-069b23b50a08';

const QUERIES = [
  { q: 'scientists discover breakthrough', section: 'science' },
  { q: 'wildlife conservation recovery success', section: 'environment' },
  { q: 'community volunteers inspiration', section: '' },
  { q: 'renewable energy record clean power', section: 'environment' },
  { q: 'medical treatment breakthrough patients', section: 'science' },
  { q: 'children education school success', section: '' },
  { q: 'ocean reef restoration success', section: 'environment' },
  { q: 'technology innovation helping lives', section: 'technology' }
];

const BLOCK = ['murder','kill','attack','war','crisis','terror','bomb','shooting','death','fatal','died','conflict','abuse','assault','scandal','fraud','corrupt','disaster','crash','drown','suicide','overdose','prison','arrest','charged','guilty','verdict','riot','rape','missing','hostage','obituary','obituaries','letter:','opinion:','in memoriam','passes away','passed away','gunman','stabbing','explosion','flood','earthquake','hurricane','layoffs','redundan'];

const REGIONS = [
  ['europe',   ['stockholm','sweden','copenhagen','denmark','helsinki','finland','oslo','norway','amsterdam','netherlands','brussels','belgium','vienna','austria','zurich','switzerland','europe','france','germany','spain','italy','poland','portugal','greece','czech','hungary','romania','ukraine','paris','berlin','madrid','rome','london','dublin','uk','britain','ireland']],
  ['africa',   ['africa','kenya','nigeria','ghana','ethiopia','tanzania','rwanda','morocco','south africa','cairo','nairobi','lagos','accra','kampala','dakar']],
  ['asia',     ['china','japan','india','korea','thailand','vietnam','indonesia','pakistan','bangladesh','singapore','asia','beijing','tokyo','delhi','mumbai','shanghai','hong kong','taipei','seoul','bangkok','manila']],
  ['americas', ['brazil','mexico','colombia','argentina','chile','peru','costa rica','latin america','canada','california','new york','united states','usa','american','toronto','chicago','vancouver','seattle','boston','texas','florida']],
  ['oceania',  ['australia','new zealand','pacific','oceania','sydney','melbourne','auckland','brisbane']],
];

function getRegion(t) {
  const s = t.toLowerCase();
  for (const [r, kw] of REGIONS) if (kw.some(k => s.includes(k))) return r;
  return 'world';
}

function isPositive(title, body) {
  const t = (title + ' ' + body).toLowerCase();
  return !BLOCK.some(w => t.includes(w));
}

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

// ── GUARDIAN ──
async function fetchStories() {
  const results = [], used = new Set();
  for (const { q, section } of QUERIES) {
    if (results.length >= 5) break;
    try {
      let url = `https://content.guardianapis.com/search?q=${encodeURIComponent(q)}&show-fields=bodyText,headline&page-size=8&order-by=newest&api-key=${GUARDIAN_KEY}`;
      if (section) url += `&section=${section}`;
      const res = await fetch(url);
      const data = await res.json();
      for (const item of (data.response?.results || [])) {
        if (results.length >= 5) break;
        if (used.has(item.id)) continue;
        const body = item.fields?.bodyText || '';
        const title = item.fields?.headline || item.webTitle;
        if (body.length < 200 || !isPositive(title, body)) continue;
        used.add(item.id);
        results.push({ id: item.id, title, region: getRegion(title + ' ' + body), rawText: body.slice(0, 3000) });
      }
    } catch(e) {}
  }
  return results;
}

// ── CLAUDE API ──
async function apiCall(prompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}`);
  const data = await res.json();
  const raw = data.content[0].text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in Claude response');
  return JSON.parse(raw.slice(start, end + 1));
}

async function generateStory(rawText) {
  // Call 1: Select target language
  const phrases = await apiCall(`You are a Cambridge English examiner selecting target language for graded reading materials.

Read this article and select language items for three levels. These will be woven into graded texts.

LEVEL BENCHMARKS:
- B2: Items a B2 student wouldn't know. NOT "find a way", "lead to", "stay alive" — target "harness", "pose a challenge", "draw on", "give rise to"
- C1: Idiomatic, less predictable. E.g. "fall short of", "pave the way for", "mounting pressure", "in stark contrast"
- C2: Sophisticated journalism-level. E.g. "underpin", "contentious", "in the wake of", "cast doubt on"

RULES: Max 3 words per item. Single words allowed if genuinely C1/C2. Must be transferable. No proper nouns. 6 items per level.

Article: ${rawText}

Respond ONLY with valid JSON:
{"phrases_b2":[{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."}],"phrases_c1":[{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."}],"phrases_c2":[{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."}]}`, 1200);

  const b2terms = phrases.phrases_b2.map(p => p.term).join(', ');
  const c1terms = phrases.phrases_c1.map(p => p.term).join(', ');
  const c2terms = phrases.phrases_c2.map(p => p.term).join(', ');

  // Call 2: Write texts around those phrases
  const texts = await apiCall(`You are an expert English language teacher writing graded reading materials.

Write three versions of a news story based on this article. Each version MUST naturally incorporate all 6 target phrases verbatim.

B2 version (200–230 words, 2–3 paragraphs): use these phrases naturally: ${b2terms}
C1 version (250–280 words, 2–3 paragraphs): use these phrases naturally: ${c1terms}
C2 version (300–330 words, 3 paragraphs): use these phrases naturally: ${c2terms}

Keep all versions positive and uplifting. Separate paragraphs with \\n\\n.

Article: ${rawText}

Respond ONLY with valid JSON:
{"b2":"...","c1":"...","c2":"..."}`, 2500);

  // Call 3: Add example sentences
  const allTerms = [...phrases.phrases_b2, ...phrases.phrases_c1, ...phrases.phrases_c2].map(p => p.term);
  const exData = await apiCall(`For each phrase, write one short natural example sentence (under 15 words) NOT about the news story.
Phrases: ${JSON.stringify(allTerms)}
Respond ONLY with valid JSON: {"examples":["...","...","...","...","...","...","...","...","...","...","...","...","...","...","...","...","...","..."]}`, 800);

  const examples = exData.examples || [];
  let idx = 0;
  const withEx = arr => arr.map(p => ({ ...p, example: examples[idx++] || '' }));

  return {
    b2: texts.b2, c1: texts.c1, c2: texts.c2,
    phrases_b2: withEx(phrases.phrases_b2),
    phrases_c1: withEx(phrases.phrases_c1),
    phrases_c2: withEx(phrases.phrases_c2),
  };
}

// ── MAIN HANDLER ──
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
    // GET /stories/today — main endpoint
    if (action === 'today') {
      const date = todayKey();

      // Check cache first
      try {
        const cached = await store.get(date, { type: 'json' });
        if (cached && cached.stories && cached.stories.length >= 5 && cached.stories[0].b2) {
          console.log(`[stories] Serving cached stories for ${date}`);
          return { statusCode: 200, headers, body: JSON.stringify(cached) };
        }
      } catch(e) { /* not cached yet */ }

      // Check if another request is already generating (simple lock)
      const lockKey = `_lock_${date}`;
      try {
        const lock = await store.get(lockKey, { type: 'json' });
        if (lock && (Date.now() - lock.ts < 120000)) {
          // Generation in progress, wait and retry cache
          await new Promise(r => setTimeout(r, 5000));
          try {
            const cached = await store.get(date, { type: 'json' });
            if (cached && cached.stories && cached.stories.length >= 5 && cached.stories[0].b2) {
              return { statusCode: 200, headers, body: JSON.stringify(cached) };
            }
          } catch(e) {}
          return { statusCode: 202, headers, body: JSON.stringify({ status: 'generating', message: 'Stories are being generated. Refresh in 30 seconds.' }) };
        }
      } catch(e) {}

      // Set lock
      await store.setJSON(lockKey, { ts: Date.now() });

      console.log(`[stories] Generating new stories for ${date}`);

      // Fetch from Guardian
      const rawStories = await fetchStories();
      if (!rawStories.length) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'No stories found from Guardian' }) };
      }

      // Generate all 5 stories with stagger
      const stories = [];
      for (let i = 0; i < rawStories.length; i++) {
        try {
          if (i > 0) await new Promise(r => setTimeout(r, 500));
          const result = await generateStory(rawStories[i].rawText);
          stories.push({ ...rawStories[i], ...result, rawText: undefined });
        } catch(e) {
          console.error(`[stories] Failed story ${i}:`, e.message);
          stories.push({ ...rawStories[i], rawText: undefined, error: e.message });
        }
      }

      // Save to archive
      const payload = { date, stories, savedAt: new Date().toISOString() };
      await store.setJSON(date, payload);

      // Update index
      let index = [];
      try { index = await store.get('_index', { type: 'json' }) || []; } catch(e) {}
      if (!index.includes(date)) {
        index.unshift(date);
        index = index.slice(0, 60);
        await store.setJSON('_index', index);
      }

      // Clear lock
      try { await store.delete(lockKey); } catch(e) {}

      console.log(`[stories] Saved ${stories.length} stories for ${date}`);
      return { statusCode: 200, headers, body: JSON.stringify(payload) };
    }

    // GET /stories/archive?date=2026-05-18
    if (action === 'archive') {
      const date = params.date;
      if (!date) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing date' }) };
      const data = await store.get(date, { type: 'json' });
      if (!data) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // GET /stories/dates
    if (action === 'dates') {
      let index = [];
      try { index = await store.get('_index', { type: 'json' }) || []; } catch(e) {}
      return { statusCode: 200, headers, body: JSON.stringify({ dates: index }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Unknown endpoint' }) };
  } catch(e) {
    console.error('[stories] Error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
