// BE FORWARD (beforward.jp): экспортёр из Японии, есть склады в Корее, Сингапуре, Таиланде и т.д.
// Список: /stocklist/make=<id>/model=<id>/sortkey=e/ (sortkey=e — «Ref New to Old», то есть
// самые новые объявления; ≈0.75 МБ, 25 машин). Карточка /<марка>/<модель>/<ref>/id/<id>/ —
// все фото (large, обычно 20–95 шт.), таблица характеристик и Remarks продавца.
import { get, sleep } from '../http.js';

const BASE = 'https://www.beforward.jp';
const MAX_PHOTOS = 60;

// 'Brand|Model' -> { make, models: [id модели] }. Коды из <select name="model"> страницы
// /stocklist/make=<id>/ (ноябрь 2026). Несколько id — родственные модели (гибрид, кузов универсал).
export const MODELS = {
  'Hyundai|Staria': { make: 44, models: [16503] },
  'Hyundai|Grand Starex': { make: 44, models: [13267] },
  'Hyundai|Palisade': { make: 44, models: [16067, 17249] },
  'Hyundai|Santa Fe': { make: 44, models: [736, 17100] },
  'Hyundai|Tucson': { make: 44, models: [738, 16551] },
  'Hyundai|Sonata': { make: 44, models: [737, 16564] },
  'Hyundai|Grandeur': { make: 44, models: [1937, 16567] },
  'Hyundai|Avante': { make: 44, models: [1924, 17590] },
  'Hyundai|Kona': { make: 44, models: [15626] },
  'Kia|Carnival': { make: 313, models: [1836] },
  'Kia|Sorento': { make: 313, models: [1868, 16534] },
  'Kia|Sportage': { make: 313, models: [1870, 16537] },
  'Kia|K5': { make: 313, models: [13472] },
  'Kia|K8': { make: 313, models: [16527] },
  'Kia|Mohave': { make: 313, models: [1851] },
  'Kia|Seltos': { make: 313, models: [16330] },
  'Kia|Ray': { make: 313, models: [13310] },
  'Genesis|GV80': { make: 775, models: [16469] },
  'Genesis|GV70': { make: 775, models: [16468] },
  'Genesis|G80': { make: 775, models: [16485] },
  'Toyota|Alphard': { make: 1, models: [102, 103] },
  'Toyota|Land Cruiser Prado': { make: 1, models: [200] },
  'Toyota|Camry': { make: 1, models: [118, 13390] },
  'Toyota|RAV4': { make: 1, models: [235] },
  'Lexus|RX': { make: 68, models: [2601] },
  'Lexus|ES': { make: 68, models: [2598] },
  'Mazda|6': { make: 4, models: [1378, 475, 13865] },
  'Mazda|CX-5': { make: 4, models: [13365] },
  'Honda|Odyssey': { make: 2, models: [331] },
  'Honda|CR-V': { make: 2, models: [303] },
  'BYD|Dolphin': { make: 383, models: [17128] },
  'BYD|Song Plus': { make: 383, models: [17069, 17070] },
  'BYD|Han': { make: 383, models: [16939] },
  'Mercedes-Benz|E-Class': { make: 106, models: [1107] },
  'Mercedes-Benz|S-Class': { make: 106, models: [1114] },
  'BMW|5 Series': { make: 83, models: [1035] },
  'BMW|X5': { make: 83, models: [1045] },
};

const LIST_URL = (make, model) => `${BASE}/stocklist/make=${make}/model=${model}/sortkey=e/`;

const FUEL = { petrol: 'petrol', gasoline: 'petrol', diesel: 'diesel', hybrid: 'hybrid', 'hybrid(petrol)': 'hybrid', 'hybrid(diesel)': 'hybrid', electric: 'ev', lpg: 'lpg' };
const PLACE = {
  yokohama: ['JP', 'Иокогама, Япония'], nagoya: ['JP', 'Нагоя, Япония'], osaka: ['JP', 'Осака, Япония'], kobe: ['JP', 'Кобе, Япония'],
  kyushu: ['JP', 'Кюсю, Япония'], toyama: ['JP', 'Тояма, Япония'], hokkaido: ['JP', 'Хоккайдо, Япония'], tokyo: ['JP', 'Токио, Япония'],
  kawasaki: ['JP', 'Кавасаки, Япония'], japan: ['JP', 'Япония'],
  korea: ['KR', 'Корея'], 'south korea': ['KR', 'Корея'], incheon: ['KR', 'Инчхон, Корея'], busan: ['KR', 'Пусан, Корея'],
  china: ['CN', 'Китай'], singapore: ['JP', 'Сингапур'], thailand: ['JP', 'Таиланд'], uk: ['EU', 'Великобритания'],
  'united kingdom': ['EU', 'Великобритания'], germany: ['EU', 'Германия'], uae: ['JP', 'ОАЭ'], dubai: ['JP', 'Дубай, ОАЭ'],
};
const RWD_BRANDS = new Set(['BMW', 'Mercedes-Benz', 'Genesis']);

const num = (s) => { const d = String(s ?? '').replace(/[^\d]/g, ''); return d ? Number(d) : null; };
const decode = (s) => String(s || '').replace(/&nbsp;/g, ' ').replace(/&times;/g, '×').replace(/&quot;/g, '"')
  .replace(/&#0?39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (s) => decode(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const abs = (u) => (u.startsWith('//') ? 'https:' + u : u.startsWith('/') ? BASE + u : u);

function where(loc) {
  const k = String(loc || '').trim().toLowerCase();
  const p = PLACE[k];
  if (p) return { region: p[0], location: p[1] };
  return { region: 'JP', location: loc ? `${loc}, Япония` : 'Япония' };
}

function gear(v) {
  const u = String(v || '').toUpperCase();
  if (!u || u === '-') return null;
  if (/CVT/.test(u)) return 'вариатор';
  if (/SEMI|DCT|AMT|DUAL/.test(u)) return 'робот';
  if (/MANUAL|^\d?MT|^MT/.test(u)) return 'МКПП';
  if (/AUTO|AT/.test(u)) return 'АКПП';
  return null;
}

function drive(v, brand) {
  const u = String(v || '').toUpperCase();
  if (/4WD|AWD|4WHEEL|FOUR|FULL/.test(u)) return 'полный';
  if (/2WD|2WHEEL/.test(u)) return RWD_BRANDS.has(brand) ? 'задний' : 'передний';
  return null;
}

function fuel(v) {
  const k = String(v || '').trim().toLowerCase();
  return FUEL[k] ?? (/hybrid/.test(k) ? 'hybrid' : /electric/.test(k) ? 'ev' : null);
}

export function parseList(html, brand, model) {
  const out = [];
  const c = String(html).replace(/\s+/g, ' ');
  for (const row of c.split('<tr class="stocklist-row">').slice(1)) {
    const link = row.match(/href="(\/[a-z0-9_-]+\/[a-z0-9_-]+\/([a-z0-9]+)\/id\/(\d+)\/)"/);
    if (!link) continue;
    const [, path, , id] = link;
    if (/class="[^"]*sold-out|>SOLD</i.test(row)) continue;
    const title = text((row.match(/<p class="make-model">\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    const val = (cls) => text((row.match(new RegExp(`class="basic-spec-col[^"]*\\b${cls}\\b[^"]*">[\\s\\S]*?<p class="val[^"]*">([\\s\\S]*?)<\\/p>`)) || [])[1]);
    const spec = {};
    for (const m of row.matchAll(/<td class="th [^"]*">([^<]*)<\/td>\s*(?:<!--[\s\S]*?-->\s*)?<td class="td-[^"]*"[^>]*>([\s\S]*?)<\/td>/g)) spec[text(m[1])] = text(m[2]);
    const [y, mo] = val('year').split('/').map((x) => num(x));
    const cc = num(val('engine'));
    const loc = text((row.match(/class="val stock-area">[\s\S]*?<span>([^<]*)<\/span>/) || [])[1]);
    const { region, location } = where(loc);
    const priceTxt = text((row.match(/<p class="vehicle-price">([\s\S]*?)<\/p>/) || [])[1]);
    const price = /\d/.test(priceTxt) ? num(priceTxt) : null;
    const img = (row.match(/<img src="([^"]+image-cdn\.beforward\.jp[^"]+)"/) || [])[1];
    const trim = title.replace(/^\d{4}\s+/, '').split(' ').slice(brandWords(brand) + modelWords(path)).join(' ') || null;
    out.push({
      uid: `beforward:${id}`,
      source: 'beforward',
      source_label: 'BE FORWARD',
      region,
      url: BASE + path,
      brand, model,
      trim,
      year: y || num(title.slice(0, 4)),
      month: mo || null,
      mileage_km: num(val('mileage')),
      fuel: fuel(spec['Fuel']),
      transmission: gear(val('trans')),
      drive: drive(spec['Drive'], brand),
      engine: cc ? `${(cc / 1000).toFixed(1)} л` : null,
      seats: num(spec['Seats']) || null,
      price,
      currency: price ? (/€/.test(priceTxt) ? 'EUR' : /¥/.test(priceTxt) ? 'JPY' : 'USD') : null,
      price_note: `FOB ${region === 'KR' ? 'Корея' : region === 'CN' ? 'Китай' : region === 'EU' ? 'Европа' : 'Япония'}`,
      location,
      photos: img ? [bigPhoto(abs(img))] : [],
      _sort: Number(id),
    });
  }
  return out;
}

// В адресе /toyota/land-cruiser-prado/… марка и модель через дефис — по ним считаем слова в заголовке.
const brandWords = (brand) => String(brand).split(/[\s-]+/).length;
const modelWords = (path) => path.split('/')[2].split('-').length;

const bigPhoto = (u) => String(u).replace(/\/(medium|small|thumb)\//, '/large/').replace(/\?w=\d+$/, '');

export function parseDetail(html, brand) {
  const c = String(html).replace(/\s+/g, ' ');
  const photos = [...new Set([...c.matchAll(/class="fn-images-pc"[^>]*data-path="([^"]+)"/g)].map((m) => abs(decode(m[1]))))].slice(0, MAX_PHOTOS);
  const spec = {};
  const table = (c.match(/<table[^>]*class="specification"[^>]*>([\s\S]*?)<\/table>/) || [])[1] || '';
  for (const m of table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*(?:<!--[\s\S]*?-->\s*)?<td[^>]*>([\s\S]*?)<\/td>/g)) {
    spec[text(m[1]).replace(/\s+/g, ' ')] = text(m[2]);
  }
  const remarks = text((c.match(/<p class="list-title">Remarks<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/) || [])[1]);
  const selling = [...((c.match(/<p class="list-title">SELLING POINTS<\/p>([\s\S]*?)<\/div>/) || [])[1] || '')
    .matchAll(/<li class="attached_on"\s*>([^<]+)<\/li>/g)].map((m) => text(m[1]));
  const desc = [remarks && remarks !== '-' ? remarks : null, selling.length ? `Selling points: ${selling.join(', ')}` : null].filter(Boolean).join('\n');
  const cc = num(spec['Engine Size']);
  const out = { photos, desc_orig: desc || null };
  if (spec['Version/Class'] && spec['Version/Class'] !== '-') out.trim = spec['Version/Class'];
  const t = gear(spec['Transmission']); if (t) out.transmission = t;
  const d = drive(spec['Drive'], brand); if (d) out.drive = d;
  const f = fuel(spec['Fuel']); if (f) out.fuel = f;
  const s = num(String(spec['Seats'] || '').split('(')[0]); if (s) out.seats = s;
  if (cc) out.engine = `${(cc / 1000).toFixed(1)} л`;
  if (spec['Location']) Object.assign(out, where(spec['Location']));
  return out;
}

export async function search(brand, model, { rates, isKnown } = {}) { // eslint-disable-line no-unused-vars
  const m = MODELS[`${brand}|${model}`];
  if (!m) return [];
  let list = [];
  for (const id of m.models) {
    try {
      list.push(...parseList(await get(LIST_URL(m.make, id), { timeout: 45_000 }), brand, model));
    } catch (e) {
      console.warn(`[beforward] ${brand} ${model} (${id}): ${e.message}`);
    }
    await sleep(800);
  }
  const seen = new Set();
  list = list.filter((l) => !seen.has(l.uid) && seen.add(l.uid)).sort((a, b) => b._sort - a._sort).slice(0, 30);
  const out = [];
  for (const l of list) {
    delete l._sort;
    if (isKnown && isKnown(l)) continue;
    try {
      const d = parseDetail(await get(l.url, { timeout: 45_000 }), brand);
      // Фото, текст, комплектация и склад — из карточки; остальное только если в списке не было
      // (в списке «CVT», а в карточке просто «Automatic»).
      for (const [k, v] of Object.entries(d)) {
        if (v == null || (Array.isArray(v) && !v.length)) continue;
        if (['photos', 'desc_orig', 'trim', 'location', 'region'].includes(k) || l[k] == null) l[k] = v;
      }
    } catch (e) {
      console.warn(`[beforward] карточка ${l.uid}: ${e.message}`);
    }
    out.push(l);
    await sleep(800);
  }
  return out;
}
