// OLX.pl (Польша): публичный JSON-API выдачи www.olx.pl/api/v1/offers/ по категории марки
// и фильтру модели. В выдаче уже есть всё: параметры, текст продавца и фото.
// OLX хранит не больше 8 фото на объявление; большинство машин с OLX — перепост с Otomoto
// (external_url), там до 40+ фото, поэтому для них открываем страницу Otomoto и берём фото оттуда.
// CloudFront OLX через раз отвечает 403 на запросы подряд: ждём и повторяем, затем читаем HTML-выдачу.
import { get, sleep } from '../http.js';

const BASE = 'https://www.olx.pl';
const API = `${BASE}/api/v1/offers/`;
const MAX_PHOTOS = 60;

// Категории марок внутри «Samochody osobowe» (84).
const CAT = {
  Hyundai: [191, 'hyundai'], Kia: [192, 'kia'], Genesis: [4894, 'genesis'], Toyota: [206, 'toyota'],
  Lexus: [1351, 'lexus'], Mazda: [194, 'mazda'], Honda: [190, 'honda'], BYD: [4870, 'byd'],
  'Mercedes-Benz': [195, 'mercedes-benz'], BMW: [183, 'bmw'],
};

// 'Brand|Model' -> { cat, path, models: [значения filter_enum_model], title?: RegExp }.
// Значения сверены с metadata.filters (filter_enum_model) API.
const M = (brand, models, extra = {}) => ({ cat: CAT[brand][0], path: CAT[brand][1], models, ...extra });
export const MODELS = {
  'Hyundai|Staria': M('Hyundai', ['staria']),
  'Hyundai|Grand Starex': M('Hyundai', ['h-1-starex', 'h-1']), // в Европе Grand Starex продавался как H-1
  'Hyundai|Palisade': M('Hyundai', ['palisade']),
  'Hyundai|Santa Fe': M('Hyundai', ['santa-fe']),
  'Hyundai|Tucson': M('Hyundai', ['tucson']),
  'Hyundai|Sonata': M('Hyundai', ['sonata']),
  'Hyundai|Grandeur': M('Hyundai', ['grandeur']),
  'Hyundai|Avante': M('Hyundai', ['avante', 'elantra']), // Avante = Elantra
  'Hyundai|Kona': M('Hyundai', ['kona']),
  'Kia|Carnival': M('Kia', ['carnival']),
  'Kia|Sorento': M('Kia', ['sorento']),
  'Kia|Sportage': M('Kia', ['sportage']),
  'Kia|K5': M('Kia', ['k5']),
  'Kia|Seltos': M('Kia', ['seltos']),
  'Genesis|GV80': M('Genesis', ['gv80']),
  'Genesis|GV70': M('Genesis', ['gv70', 'electrified-gv70']),
  'Genesis|G80': M('Genesis', ['g80']),
  // Prado в Европе — «Land Cruiser»; в модели OLX вперемешку с 200/300, отбираем по заголовку.
  'Toyota|Land Cruiser Prado': M('Toyota', ['land-cruiser'], { title: /prado|\b(?:lc|j)?\s?(?:12|15|25)0\b/i }),
  'Toyota|Camry': M('Toyota', ['camry']),
  'Toyota|RAV4': M('Toyota', ['rav-4']),
  'Lexus|RX': M('Lexus', ['rx', 'rx300', 'rx350', 'rx400']),
  'Lexus|ES': M('Lexus', ['es', 'es300']),
  'Mazda|6': M('Mazda', ['6']),
  'Mazda|CX-5': M('Mazda', ['cx-5']),
  'Honda|Odyssey': M('Honda', ['odyssey']),
  'Honda|CR-V': M('Honda', ['cr-v']),
  'BYD|Dolphin': M('BYD', ['dolphin']),
  'BYD|Song Plus': M('BYD', ['seal-u-byd', 'song']), // Song Plus в Европе — Seal U
  'BYD|Han': M('BYD', ['han']),
  'Mercedes-Benz|E-Class': M('Mercedes-Benz', ['e-class']),
  'Mercedes-Benz|S-Class': M('Mercedes-Benz', ['s-class']),
  'BMW|5 Series': M('BMW', ['5-os-sorozat']),
  'BMW|X5': M('BMW', ['x5']),
  // Добавлено 2026-11-26: категории марок и значения filter_enum_model
  'Audi|A3': { cat: 182, path: 'audi', models: ['a3'] },
  'Audi|A5': { cat: 182, path: 'audi', models: ['a5'] },
  'Audi|A6': { cat: 182, path: 'audi', models: ['a6'] },
  'Audi|A7': { cat: 182, path: 'audi', models: ['a7'] },
  'Audi|A8': { cat: 182, path: 'audi', models: ['a8'] },
  'Audi|Q3': { cat: 182, path: 'audi', models: ['q3'] },
  'Audi|Q5': { cat: 182, path: 'audi', models: ['q5'] },
  'Audi|Q7': { cat: 182, path: 'audi', models: ['q7'] },
  'Audi|Q8': { cat: 182, path: 'audi', models: ['q8'] },
  'Audi|e-tron': { cat: 182, path: 'audi', models: ['e-tron'] },
  'Nissan|X-Trail': { cat: 197, path: 'nissan', models: ['x-trail'] },
  'Nissan|Qashqai': { cat: 197, path: 'nissan', models: ['qashqai'] },
  'Nissan|Murano': { cat: 197, path: 'nissan', models: ['murano'] },
  'Nissan|Pathfinder': { cat: 197, path: 'nissan', models: ['pathfinder'] },
  'Nissan|Patrol': { cat: 197, path: 'nissan', models: ['patrol'] },
  'Nissan|Serena': { cat: 197, path: 'nissan', models: ['serena'] },
  'Nissan|Note': { cat: 197, path: 'nissan', models: ['note'] },
  'Nissan|Juke': { cat: 197, path: 'nissan', models: ['juke'] },
  'Nissan|Leaf': { cat: 197, path: 'nissan', models: ['leaf'] },
  'Nissan|Altima': { cat: 197, path: 'nissan', models: ['altima'] },
  'Nissan|Navara': { cat: 197, path: 'nissan', models: ['navara'] },
  'Nissan|Ariya': { cat: 197, path: 'nissan', models: ['ariya'] },
  'Skoda|Octavia': { cat: 203, path: 'skoda', models: ['octavia'] },
  'Skoda|Superb': { cat: 203, path: 'skoda', models: ['superb'] },
  'Skoda|Kodiaq': { cat: 203, path: 'skoda', models: ['kodiaq'] },
  'Skoda|Karoq': { cat: 203, path: 'skoda', models: ['karoq'] },
  'Skoda|Kamiq': { cat: 203, path: 'skoda', models: ['kamiq'] },
  'Skoda|Fabia': { cat: 203, path: 'skoda', models: ['fabia'] },
  'Skoda|Rapid': { cat: 203, path: 'skoda', models: ['rapid'] },
  'Suzuki|Jimny': { cat: 205, path: 'suzuki', models: ['jimny'] },
  'Suzuki|Vitara': { cat: 205, path: 'suzuki', models: ['vitara'] },
  'Suzuki|Swift': { cat: 205, path: 'suzuki', models: ['swift'] },
  'Suzuki|SX4 S-Cross': { cat: 205, path: 'suzuki', models: ['sx4-s-cross'] },
  'Volkswagen|Golf': { cat: 207, path: 'volkswagen', models: ['golf'] },
  'Volkswagen|Jetta': { cat: 207, path: 'volkswagen', models: ['jetta'] },
  'Volkswagen|Passat': { cat: 207, path: 'volkswagen', models: ['passat'] },
  'Volkswagen|Polo': { cat: 207, path: 'volkswagen', models: ['polo'] },
  'Volkswagen|Tiguan': { cat: 207, path: 'volkswagen', models: ['tiguan'] },
  'Volkswagen|Touareg': { cat: 207, path: 'volkswagen', models: ['touareg'] },
  'Volkswagen|Teramont': { cat: 207, path: 'volkswagen', models: ['teramont'] },
  'Volkswagen|T-Roc': { cat: 207, path: 'volkswagen', models: ['t-roc'] },
  'Volkswagen|Multivan': { cat: 207, path: 'volkswagen', models: ['multivan'] },
  'Volkswagen|ID.4': { cat: 207, path: 'volkswagen', models: ['id4'] },
  'Volkswagen|Arteon': { cat: 207, path: 'volkswagen', models: ['arteon'] },
  'Mitsubishi|Outlander': { cat: 196, path: 'mitsubishi', models: ['outlander'] },
  'Mitsubishi|Pajero': { cat: 196, path: 'mitsubishi', models: ['pajero'] },
  'Mitsubishi|Pajero Sport': { cat: 196, path: 'mitsubishi', models: ['pajero-sport'] },
  'Mitsubishi|Eclipse Cross': { cat: 196, path: 'mitsubishi', models: ['eclipse-cross'] },
  'Mitsubishi|ASX': { cat: 196, path: 'mitsubishi', models: ['asx'] },
  'Mitsubishi|L200': { cat: 196, path: 'mitsubishi', models: ['l200'] },
  'Mitsubishi|Space Star': { cat: 196, path: 'mitsubishi', models: ['space-star'] },
  'Subaru|Forester': { cat: 204, path: 'subaru', models: ['forester'] },
  'Subaru|Outback': { cat: 204, path: 'subaru', models: ['outback'] },
  'Subaru|XV': { cat: 204, path: 'subaru', models: ['xv'] },
  'Subaru|Crosstrek': { cat: 204, path: 'subaru', models: ['crosstrek'] },
  'Subaru|Legacy': { cat: 204, path: 'subaru', models: ['legacy'] },
  'Subaru|Levorg': { cat: 204, path: 'subaru', models: ['levorg'] },
  'Subaru|Impreza': { cat: 204, path: 'subaru', models: ['impreza'] },
  'Ford|Explorer': { cat: 189, path: 'ford', models: ['explorer'] },
  'Ford|Kuga': { cat: 189, path: 'ford', models: ['kuga'] },
  'Ford|Ranger': { cat: 189, path: 'ford', models: ['ranger'] },
  'Ford|Transit': { cat: 189, path: 'ford', models: ['transit'] },
  'Toyota|Land Cruiser': { cat: 206, path: 'toyota', models: ['land-cruiser'] },
  'Toyota|Camry': { cat: 206, path: 'toyota', models: ['camry'] },
  'Toyota|Highlander': { cat: 206, path: 'toyota', models: ['highlander'] },
  'Toyota|Corolla': { cat: 206, path: 'toyota', models: ['corolla'] },
  'Toyota|Prius': { cat: 206, path: 'toyota', models: ['prius'] },
  'Toyota|Sienna': { cat: 206, path: 'toyota', models: ['sienna'] },
  'Toyota|C-HR': { cat: 206, path: 'toyota', models: ['c-hr'] },
  'Toyota|Hilux': { cat: 206, path: 'toyota', models: ['hilux'] },
  'Toyota|Yaris Cross': { cat: 206, path: 'toyota', models: ['yaris-cross'] },
  'Lexus|LX': { cat: 1351, path: 'lexus', models: ['lx'] },
  'Lexus|NX': { cat: 1351, path: 'lexus', models: ['nx'] },
  'Lexus|GX': { cat: 1351, path: 'lexus', models: ['gx'] },
  'Lexus|LS': { cat: 1351, path: 'lexus', models: ['ls'] },
  'Lexus|UX': { cat: 1351, path: 'lexus', models: ['ux'] },
  'Lexus|IS': { cat: 1351, path: 'lexus', models: ['is'] },
  'Lexus|LM': { cat: 1351, path: 'lexus', models: ['lm'] },
  'Mercedes-Benz|A-Class': { cat: 195, path: 'mercedes-benz', models: ['a-class'] },
  'Mercedes-Benz|C-Class': { cat: 195, path: 'mercedes-benz', models: ['c-class'] },
  'Mercedes-Benz|CLA': { cat: 195, path: 'mercedes-benz', models: ['cla'] },
  'Mercedes-Benz|CLS': { cat: 195, path: 'mercedes-benz', models: ['cls-class'] },
  'Mercedes-Benz|G-Class': { cat: 195, path: 'mercedes-benz', models: ['g-class'] },
  'Mercedes-Benz|GLA': { cat: 195, path: 'mercedes-benz', models: ['gla'] },
  'Mercedes-Benz|GLB': { cat: 195, path: 'mercedes-benz', models: ['glb'] },
  'Mercedes-Benz|GLC': { cat: 195, path: 'mercedes-benz', models: ['glc'] },
  'Mercedes-Benz|GLE': { cat: 195, path: 'mercedes-benz', models: ['gle'] },
  'Mercedes-Benz|GLS': { cat: 195, path: 'mercedes-benz', models: ['gls'] },
  'Mercedes-Benz|ML': { cat: 195, path: 'mercedes-benz', models: ['ml-class'] },
  'Mercedes-Benz|V-Class': { cat: 195, path: 'mercedes-benz', models: ['v-klasa'] },
  'Mercedes-Benz|EQE': { cat: 195, path: 'mercedes-benz', models: ['eqe'] },
  'Mercedes-Benz|EQS': { cat: 195, path: 'mercedes-benz', models: ['eqs'] },
  'Mercedes-Benz|AMG GT': { cat: 195, path: 'mercedes-benz', models: ['amg-gt'] },
  'Mercedes-Benz|Sprinter': { cat: 195, path: 'mercedes-benz', models: ['sprinter'] },
  'BMW|X1': { cat: 183, path: 'bmw', models: ['x1'] },
  'BMW|X3': { cat: 183, path: 'bmw', models: ['x3'] },
  'BMW|X4': { cat: 183, path: 'bmw', models: ['x4'] },
  'BMW|X6': { cat: 183, path: 'bmw', models: ['x6'] },
  'BMW|X7': { cat: 183, path: 'bmw', models: ['x7'] },
  'BMW|iX': { cat: 183, path: 'bmw', models: ['ix'] },
  'Hyundai|Ioniq 5': { cat: 191, path: 'hyundai', models: ['ioniq-5'] },
  'Hyundai|Ioniq 6': { cat: 191, path: 'hyundai', models: ['ioniq-6'] },
  'Hyundai|i30': { cat: 191, path: 'hyundai', models: ['i30'] },
  'Hyundai|Nexo': { cat: 191, path: 'hyundai', models: ['nexo'] },
  'Kia|Niro': { cat: 192, path: 'kia', models: ['niro'] },
  'Kia|EV6': { cat: 192, path: 'kia', models: ['ev6'] },
  'Kia|EV9': { cat: 192, path: 'kia', models: ['ev9'] },
  'Kia|Stinger': { cat: 192, path: 'kia', models: ['stinger'] },
  'Mazda|3': { cat: 194, path: 'mazda', models: ['3'] },
  'Mazda|CX-30': { cat: 194, path: 'mazda', models: ['cx-30'] },
  'Mazda|CX-60': { cat: 194, path: 'mazda', models: ['cx-60'] },
  'Mazda|CX-9': { cat: 194, path: 'mazda', models: ['cx-9'] },
  'Honda|HR-V': { cat: 190, path: 'honda', models: ['hr-v'] },
  'Honda|Accord': { cat: 190, path: 'honda', models: ['accord'] },
  'Honda|Civic': { cat: 190, path: 'honda', models: ['civic'] },
  'Honda|Pilot': { cat: 190, path: 'honda', models: ['pilot'] },
};

const FUEL = { petrol: 'petrol', diesel: 'diesel', lpg: 'lpg', cng: 'hybrid', hybrid: 'hybrid', 'plugin-hybrid': 'hybrid', electric: 'ev' };
const GEAR = { automatic: 'АКПП', manual: 'МКПП' };
const DRIVE = { 'front-wheel': 'передний', 'rear-wheel': 'задний', 'all-wheel-auto': 'полный', 'all-wheel-permanent': 'полный', 'all-wheel-lock': 'полный' };

const num = (s) => { const d = String(s ?? '').replace(/[^\d]/g, ''); return d ? Number(d) : null; };
const ts = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? Math.trunc(t / 1000) : null; };

export const unhtml = (s) => String(s || '')
  .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, '\n').replace(/<li>/gi, '\n• ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#0?34;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// Приводит объявление из API (snake_case, value — объект) и из HTML-состояния
// (camelCase, value — строка + normalizedValue) к одному виду.
function normalize(a) {
  const params = {};
  for (const p of a.params || []) {
    const v = p.value;
    if (v && typeof v === 'object') params[p.key] = { key: v.key ?? null, label: v.label ?? null, raw: v };
    else params[p.key] = { key: p.normalizedValue ?? null, label: v ?? null, raw: p };
  }
  let price = null; let currency = null;
  if (params.price && params.price.raw && params.price.raw.value != null) {
    price = Number(params.price.raw.value); currency = params.price.raw.currency || 'PLN';
  } else if (a.price && a.price.regularPrice) {
    price = Number(a.price.regularPrice.value); currency = a.price.regularPrice.currencyCode || 'PLN';
  }
  const photos = (a.photos || []).map((p) => {
    if (typeof p === 'string') return p;
    if (!p || !p.link) return null;
    return p.link.replace('{width}', p.width || 1280).replace('{height}', p.height || 960);
  }).filter(Boolean).map((u) => u.replace(':443/', '/'));
  const loc = a.location || {};
  return {
    id: a.id,
    url: a.url,
    title: a.title,
    description: a.description,
    created: a.created_time || a.createdTime,
    external: a.external_url || a.externalUrl || null,
    city: (loc.city && loc.city.name) || loc.cityName || null,
    region: (loc.region && loc.region.name) || loc.regionName || null,
    params, price, currency, photos,
  };
}

export function mapItem(raw, brand, model) {
  const a = normalize(raw);
  if (!a.id) return null;
  const p = a.params;
  const key = (k) => (p[k] && p[k].key) || null;
  const cc = num(key('enginesize'));
  const hp = num(key('enginepower'));
  const engine = [cc ? `${(cc / 1000).toFixed(1)} л` : null, hp ? `${hp} л.с.` : null].filter(Boolean).join(', ');
  const desc = unhtml(a.description).slice(0, 4000);
  return {
    uid: `olx:${a.id}`, source: 'olx', source_label: 'OLX.pl', region: 'EU',
    url: a.url,
    brand, model,
    trim: a.title ? String(a.title).replace(/\s+/g, ' ').trim().slice(0, 120) : null,
    year: num(key('year')), month: null,
    mileage_km: num(key('milage')),
    fuel: FUEL[key('petrol')] ?? null,
    transmission: GEAR[key('transmission')] || null,
    drive: DRIVE[key('drive')] || null,
    engine: engine || null,
    price: a.price, currency: a.price != null ? a.currency : null,
    price_note: 'цена в Польше',
    location: [a.city, 'Польша'].filter(Boolean).join(', '),
    photos: a.photos.slice(0, MAX_PHOTOS),
    desc_orig: desc || null,
    posted_at: ts(a.created),
    external_url: a.external,
  };
}

function stateFromHtml(html) {
  const m = html.match(/window\.__PRERENDERED_STATE__\s*=\s*("(?:[^"\\]|\\.)*")/);
  if (!m) throw new Error('нет __PRERENDERED_STATE__');
  return JSON.parse(JSON.parse(m[1]));
}

// Принимает ответ API (объект или строку JSON) или HTML-страницу выдачи.
export function parseList(input, brand, model) {
  let ads;
  if (typeof input === 'string' && /^\s*</.test(input)) ads = stateFromHtml(input).listing.listing.ads || [];
  else ads = (typeof input === 'string' ? JSON.parse(input) : input).data || [];
  const w = MODELS[`${brand}|${model}`];
  const seen = new Set();
  const out = [];
  for (const raw of ads) {
    // Платные объявления в выдаче повторяются.
    if (!raw || !raw.id || seen.has(raw.id)) continue;
    seen.add(raw.id);
    if (w && w.title && !w.title.test(raw.title || '')) continue;
    const l = mapItem(raw, brand, model);
    if (l) out.push(l);
  }
  return out.sort((a, b) => (b.posted_at || 0) - (a.posted_at || 0));
}

// Страница Otomoto (__NEXT_DATA__): все фото и полный текст продавца.
export function parseDetail(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('нет __NEXT_DATA__');
  const ad = JSON.parse(m[1]).props.pageProps.advert || {};
  const photos = ((ad.images && ad.images.photos) || [])
    .map((x) => x && (x.url || x.id)).filter(Boolean)
    .map((u) => u.replace(/;s=\d+x\d+$/, '') + ';s=1280x0')
    .slice(0, MAX_PHOTOS);
  const desc = unhtml(ad.description).slice(0, 4000);
  return { photos, desc_orig: desc || null };
}

export function buildApiUrl(w, limit = 40) {
  const q = [['offset', 0], ['limit', limit], ['category_id', w.cat], ['sort_by', 'created_at:desc']];
  w.models.forEach((v, i) => q.push([`filter_enum_model[${i}]`, v]));
  return API + '?' + q.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export function buildHtmlUrl(w, model = w.models[0]) {
  return `${BASE}/motoryzacja/samochody/${w.path}/${model}/?search%5Border%5D=created_at:desc`;
}

const HEADERS = { Accept: 'application/json, text/plain, */*', 'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8', Referer: `${BASE}/motoryzacja/samochody/` };

async function getRetry(url, as) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      return await get(url, { headers: as === 'json' ? HEADERS : { ...HEADERS, Accept: 'text/html,*/*' }, as, retries: 1 });
    } catch (e) {
      last = e;
      if (!/HTTP 403/.test(e.message)) throw e;
      await sleep(4000 * (i + 1));
    }
  }
  throw last;
}

async function fetchList(w, brand, model) {
  try {
    return parseList(await getRetry(buildApiUrl(w), 'json'), brand, model);
  } catch (e) {
    console.warn(`[olx] API ${brand} ${model}: ${e.message}, читаю HTML`);
  }
  const out = [];
  for (const slug of w.models) {
    await sleep(3000);
    out.push(...parseList(await getRetry(buildHtmlUrl(w, slug), 'text'), brand, model));
  }
  const seen = new Set();
  return out.filter((l) => !seen.has(l.uid) && seen.add(l.uid)).sort((a, b) => (b.posted_at || 0) - (a.posted_at || 0));
}

export async function search(brand, model, { rates, isKnown } = {}) {
  const w = MODELS[`${brand}|${model}`];
  if (!w) return [];
  let list;
  try {
    list = await fetchList(w, brand, model);
  } catch (e) {
    console.warn(`[olx] ${brand} ${model}: ${e.message}`);
    return [];
  }
  console.log(`[olx] ${brand} ${model} -> ${list.length}`);
  const out = [];
  for (const l of list) {
    if (isKnown && isKnown(l)) continue;
    // Перепост с Otomoto: там все фото (OLX хранит максимум 8).
    if (l.external_url && /^https:\/\/www\.otomoto\.pl\//.test(l.external_url)) {
      try {
        await sleep(1500);
        const d = parseDetail(await get(l.external_url, { headers: { 'Accept-Language': 'pl-PL,pl;q=0.9' }, retries: 1 }));
        if (d.photos.length > l.photos.length) l.photos = d.photos;
        if (d.desc_orig && (!l.desc_orig || d.desc_orig.length > l.desc_orig.length)) l.desc_orig = d.desc_orig;
      } catch (e) {
        console.warn(`[olx] otomoto ${l.uid}: ${e.message}`);
      }
    }
    delete l.external_url;
    out.push(l);
  }
  return out;
}
