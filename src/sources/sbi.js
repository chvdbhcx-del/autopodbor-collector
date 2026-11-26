// SBI Motor Japan (sbimotor.com): экспортёр из Японии, сайт на Next.js, но HTML отдаётся готовым.
// Список: /en/cars/<МАРКА>/<МОДЕЛЬ>?q[s]=id desc (новые сверху), ≈1 МБ, 50 машин.
// Карточка /en/cars/<МАРКА>/<МОДЕЛЬ>/<ref> — все фото (обычно ~20), таблица, комментарий.
// Цена — FOB в долларах. Корейских, китайских марок и Genesis на сайте нет.
import { get, sleep } from '../http.js';

const BASE = 'https://sbimotor.com';
const MAX_PHOTOS = 60;
const MAX_ITEMS = 30;

// 'Brand|Model' -> [марка на сайте, [модели]]. Из меню моделей на /en/cars/... (ноябрь 2026).
export const MODELS = {
  'Toyota|Alphard': ['TOYOTA', ['ALPHARD']],
  'Toyota|Land Cruiser Prado': ['TOYOTA', ['LAND CRUISER PRADO']],
  'Toyota|Camry': ['TOYOTA', ['CAMRY']],
  'Toyota|RAV4': ['TOYOTA', ['RAV4']],
  'Lexus|RX': ['LEXUS', ['RX']],
  'Lexus|ES': ['LEXUS', ['ES']],
  'Mazda|6': ['MAZDA', ['ATENZA WAGON', 'ATENZA SPORT']],
  'Mazda|CX-5': ['MAZDA', ['CX-5']],
  'Honda|Odyssey': ['HONDA', ['ODYSSEY']],
  'Honda|CR-V': ['HONDA', ['CR-V', 'CR-V HYBRID']],
  'Mercedes-Benz|E-Class': ['MERCEDES-BENZ', ['E-CLASS']],
  'Mercedes-Benz|S-Class': ['MERCEDES-BENZ', ['S-CLASS']],
  'BMW|5 Series': ['BMW', ['5 SERIES']],
  'BMW|X5': ['BMW', ['X5']],
};

export const listUrl = (maker, model) => `${BASE}/en/cars/${encodeURIComponent(maker)}/${encodeURIComponent(model)}?q%5Bs%5D=id+desc`;

const FUEL = { gasoline: 'petrol', petrol: 'petrol', diesel: 'diesel', hybrid: 'hybrid', electric: 'ev', lpg: 'lpg' };
const CITY = { NAGOYA: 'Нагоя', YOKOHAMA: 'Иокогама', OSAKA: 'Осака', KOBE: 'Кобе', TOKYO: 'Токио', KAWASAKI: 'Кавасаки', HAKATA: 'Хаката', FUKUOKA: 'Фукуока', KISARAZU: 'Кисарадзу', CHIBA: 'Тиба', MOJI: 'Модзи', HITACHINAKA: 'Хитатинака', TOMAKOMAI: 'Томакомай', SENDAI: 'Сендай' };
const RWD_BRANDS = new Set(['BMW', 'Mercedes-Benz']);

const num = (s) => { const d = String(s ?? '').replace(/[^\d]/g, ''); return d ? Number(d) : null; };
const decode = (s) => String(s || '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (s) => decode(String(s || '').replace(/<!-- -->/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const empty = (v) => !v || v === '--' || v === '-';

function gear(v) {
  const u = String(v || '').toUpperCase();
  if (/CVT/.test(u)) return 'вариатор';
  if (/MANUAL|^MT/.test(u)) return 'МКПП';
  if (/AUTO|^AT/.test(u)) return 'АКПП';
  return null;
}
function drive(v, brand) {
  const u = String(v || '').toUpperCase();
  if (/4WD|AWD/.test(u)) return 'полный';
  if (/2WD/.test(u)) return RWD_BRANDS.has(brand) ? 'задний' : 'передний';
  return null;
}
function where(store) {
  if (empty(store)) return 'Япония';
  const u = String(store).trim().toUpperCase();
  return `${CITY[u] || u.charAt(0) + u.slice(1).toLowerCase()}, Япония`;
}

export function parseList(html, brand, model) {
  const out = [];
  const c = String(html).replace(/\s+/g, ' ');
  for (const p of c.split(/<div class="car-item css-[^"]*">/).slice(1)) {
    const link = p.match(/href="(\/en\/cars\/[^"/]+\/[^"/]+\/(\d+))"/);
    if (!link) continue;
    const [, path, ref] = link;
    const dl = {};
    for (const m of p.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) dl[text(m[1]).replace(/:$/, '').trim()] = text(m[2]);
    const tb = {};
    for (const m of p.matchAll(/<th>([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>/g)) tb[text(m[1])] = text(m[2]);
    const title = [...((p.match(/<h2[^>]*item-title[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || '').matchAll(/<span>([^<]*)<\/span>/g)].map((m) => decode(m[1]));
    const grade = text((p.match(/<h3[^>]*grade[^>]*>([\s\S]*?)<\/h3>/) || [])[1]);
    const [y, mo] = String(dl['Registration'] || '').split('/').map((x) => num(x));
    const cc = num(dl['Displacement']);
    const priceTxt = dl['FOB Price'] || '';
    const price = /\d/.test(priceTxt) ? num(priceTxt) : null;
    const img = (p.match(/<img alt="[^"]*" src="(https:\/\/sbimotor\.com\/uploads\/car\/images\/(\d+)\/[^"]+)"/) || []);
    const notes = [
      !empty(tb['Model Code']) && `Model code: ${tb['Model Code']}`,
      !empty(tb['Exterior Color']) && `Color: ${tb['Exterior Color']}`,
      !empty(tb['Steering']) && `Steering: ${tb['Steering']}`,
    ].filter(Boolean);
    out.push({
      uid: `sbi:${ref}`,
      source: 'sbi',
      source_label: 'SBI Motor',
      region: 'JP',
      url: BASE + encodeURI(decode(path)),
      brand, model,
      trim: grade || null,
      year: y || num(title[0]) || null,
      month: mo || null,
      mileage_km: num(dl['Odometer']),
      fuel: null,
      transmission: gear(dl['Transmission']),
      drive: drive(tb['Drive Type'], brand),
      engine: cc ? `${(cc / 1000).toFixed(1)} л` : null,
      seats: num(tb['Passengers']) || null,
      price,
      currency: price ? 'USD' : null,
      price_note: 'FOB Япония',
      location: where(dl['Storehouse']),
      photos: img[1] ? [decode(img[1])] : [],
      desc_orig: notes.length ? notes.join('; ') : null,
      _sort: img[2] ? Number(img[2]) : 0, // папка фото = внутренний id машины, растёт со временем
    });
  }
  return out;
}

export function parseDetail(html, brand) {
  const c = String(html).replace(/\s+/g, ' ');
  // Все фото машины лежат в одной папке /uploads/car/images/<id>/; остальное — похожие машины.
  const first = (c.match(/<link rel="preload" as="image" href="https:\/\/sbimotor\.com\/uploads\/car\/images\/(\d+)\//) || [])[1];
  const photos = first
    ? [...new Set([...c.matchAll(new RegExp(`https://sbimotor\\.com/uploads/car/images/${first}/[^"'\\\\ ]+`, 'g'))].map((m) => decode(m[0])))].slice(0, MAX_PHOTOS)
    : [];
  const spec = {};
  const table = (c.match(/<div class="specifications[^"]*">([\s\S]*?)<\/table>/) || [])[1] || '';
  for (const m of table.matchAll(/<th>([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>/g)) spec[text(m[1])] = text(m[2].replace(/<span>[\s\S]*?<\/span>/g, ''));
  const options = [...((c.match(/<ul role="list" class="options[^"]*">([\s\S]*?)<\/ul>/) || [])[1] || '')
    .matchAll(/<li class="show[^"]*">([^<]+)<\/li>/g)].map((m) => text(m[1]));
  const comment = text((c.match(/<div class="comment[^"]*">\s*<h2[^>]*>Comment<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/) || [])[1]);
  const desc = [
    !empty(comment) && comment,
    !empty(spec['Grade']) && `Grade: ${spec['Grade']}`,
    !empty(spec['Model Code']) && `Model code: ${spec['Model Code']}`,
    !empty(spec['Exterior Color']) && `Color: ${spec['Exterior Color']}`,
    options.length && `Options: ${options.join(', ')}`,
  ].filter(Boolean).join('\n');
  const out = { photos };
  if (desc) out.desc_orig = desc;
  if (!empty(spec['Grade'])) out.trim = spec['Grade'];
  const f = FUEL[String(spec['Fuel Type'] || '').toLowerCase()] ?? (/hybrid/i.test(spec['Fuel Type'] || '') ? 'hybrid' : null);
  if (f) out.fuel = f;
  const d = drive(spec['Drive Type'], brand); if (d) out.drive = d;
  const s = num(spec['Passengers']); if (s) out.seats = s;
  if (!empty(spec['Location'])) out.location = where(spec['Location']);
  return out;
}

export async function search(brand, model, { rates, isKnown } = {}) { // eslint-disable-line no-unused-vars
  const m = MODELS[`${brand}|${model}`];
  if (!m) return [];
  const [maker, models] = m;
  let list = [];
  for (const md of models) {
    try {
      list.push(...parseList(await get(listUrl(maker, md), { timeout: 45_000 }), brand, model));
    } catch (e) {
      console.warn(`[sbi] ${brand} ${model} (${md}): ${e.message}`);
    }
    await sleep(800);
  }
  const seen = new Set();
  list = list.filter((l) => !seen.has(l.uid) && seen.add(l.uid)).sort((a, b) => b._sort - a._sort).slice(0, MAX_ITEMS);
  const out = [];
  for (const l of list) {
    delete l._sort;
    if (isKnown && isKnown(l)) continue;
    try {
      const d = parseDetail(await get(l.url, { timeout: 45_000 }), brand);
      for (const [k, v] of Object.entries(d)) if (v != null && !(Array.isArray(v) && !v.length)) l[k] = v;
    } catch (e) {
      console.warn(`[sbi] карточка ${l.uid}: ${e.message}`);
    }
    out.push(l);
    await sleep(800);
  }
  return out;
}
