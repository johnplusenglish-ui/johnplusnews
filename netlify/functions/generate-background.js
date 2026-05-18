const { getStore } = require('@netlify/blobs');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GUARDIAN_KEY = process.env.GUARDIAN_API_KEY;

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

async function fetchStories() {
  const results = [], used = new Set();
  for (const { q, section } of QUERIES) {
    if (results.length >= 5) break;
    try {
      let url = 'https://content.guardianapis.com/search?q=' + encodeURIComponent(q) + '&show-fields=bodyText,headline&page-size=8&order-by=newest&api-key=' + GUARDIAN_KEY;
      if (section) url += '&section=' + section;
      const res = await fetch(url);
      const data = await res.json();
      for (const item of ((data.response && data.response.results) || [])) {
        if (results.length >= 5) break;
        if (used.has(item.id)) continue;
        const body = (item.fields && item.fields.bodyText) || '';
        const title = (item.fields && item.fields.headline) || item.webTitle;
        if (body.length < 200 || !isPositive(title, body)) continue;
        used.add(item.id);
        results.push({ id: item.id, title, region: getRegion(title + ' ' + body), rawText: body.slice(0, 3000) });
      }
    } catch(e) {}
  }
  return results;
}

async function apiCall(prompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error('Claude API error ' + res.status + ': ' + errText.slice(0, 200));
  }
  const data = await res.json();
  const raw = data.content[0].text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in Claude response');
  return JSON.parse(raw.slice(start, end + 1));
}

async function generateStory(rawText) {
  const phrases = await apiCall('You are a Cambridge English examiner selecting target language for graded reading materials.\n\nRead this article and select language items for three levels.\n\nLEVEL BENCHMARKS:\n- B2: Items a B2 student would not know. NOT "find a way", "lead to". Target "harness", "pose a challenge", "give rise to"\n- C1: Idiomatic. E.g. "fall short of", "pave the way for", "mounting pressure"\n- C2: Sophisticated. E.g. "underpin", "contentious", "in the wake of"\n\nRULES: Max 3 words per item. Transferable. No proper nouns. 6 items per level.\n\nArticle: ' + rawText + '\n\nRespond ONLY with valid JSON:\n{"phrases_b2":[{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."}],"phrases_c1":[{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."}],"phrases_c2":[{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."},{"term":"...","def":"..."}]}', 1200);

  const b2terms = phrases.phrases_b2.map(p => p.term).join(', ');
  const c1terms = phrases.phrases_c1.map(p => p.term).join(', ');
  const c2terms = phrases.phrases_c2.map(p => p.term).join(', ');

  const texts = await apiCall('You are an expert English teacher writing graded reading materials.\n\nWrite three versions of a news story. Each MUST naturally incorporate all 6 target phrases verbatim.\n\nB2 (200-230 words, 2-3 paragraphs): ' + b2terms + '\nC1 (250-280 words, 2-3 paragraphs): ' + c1terms + '\nC2 (300-330 words, 3 paragraphs): ' + c2terms + '\n\nPositive and uplifting. Separate paragraphs with \\n\\n.\n\nArticle: ' + rawText + '\n\nRespond ONLY with valid JSON:\n{"b2":"...","c1":"...","c2":"..."}', 2500);

  const allTerms = [...phrases.phrases_b2, ...phrases.phrases_c1, ...phrases.phrases_c2].map(p => p.term);
  const exData = await apiCall('For each phrase write one short natural example sentence (under 15 words) NOT about the news story.\nPhrases: ' + JSON.stringify(allTerms) + '\nRespond ONLY with valid JSON: {"examples":["...","...","...","...","...","...","...","...","...","...","...","...","...","...","...","...","...","..."]}', 800);

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

exports.handler = async (event) => {
  const store = getStore_();
  const date = todayKey();
  console.log('[generate-bg] Starting generation for ' + date);
  await store.setJSON('_status_' + date, { status: 'generating', startedAt: new Date().toISOString() });
  try {
    const rawStories = await fetchStories();
    if (!rawStories.length) {
      await store.setJSON('_status_' + date, { status: 'error', message: 'No stories from Guardian' });
      return { statusCode: 500 };
    }
    const stories = [];
    for (let i = 0; i < rawStories.length; i++) {
      try {
        if (i > 0) await new Promise(r => setTimeout(r, 800));
        console.log('[generate-bg] Generating story ' + (i + 1) + '/' + rawStories.length);
        const result = await generateStory(rawStories[i].rawText);
        stories.push({ ...rawStories[i], ...result, rawText: undefined });
        await store.setJSON(date, { date, stories, savedAt: new Date().toISOString(), partial: i < rawStories.length - 1 });
      } catch(e) {
        console.error('[generate-bg] Story ' + i + ' failed:', e.message);
        stories.push({ ...rawStories[i], rawText: undefined, error: e.message });
      }
    }
    const payload = { date, stories, savedAt: new Date().toISOString() };
    await store.setJSON(date, payload);
    let index = [];
    try { index = await store.get('_index', { type: 'json' }) || []; } catch(e) {}
    if (!index.includes(date)) {
      index.unshift(date);
      index = index.slice(0, 60);
      await store.setJSON('_index', index);
    }
    await store.setJSON('_status_' + date, { status: 'done', finishedAt: new Date().toISOString() });
    console.log('[generate-bg] Done - saved ' + stories.length + ' stories');
    return { statusCode: 200 };
  } catch(e) {
    console.error('[generate-bg] Fatal:', e.message);
    await store.setJSON('_status_' + date, { status: 'error', message: e.message });
    return { statusCode: 500 };
  }
};
