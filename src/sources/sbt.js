// SBT Japan (sbtjapan.com): экспортёр из Японии, у него же склады в Корее, Китае и др.
// Список модели — HTML /used-cars/<марка>/<модель>?show_numbers=20 (≈3.8 МБ на 20 машин:
// в каждой карточке форма запроса со списком стран). В списке уже есть все характеристики,
// поэтому страницу машины не качаем: все фото берём из JSON /api/stockImages/<id> (≈8 КБ).
// Описания продавца у SBT нет.
import { get, sleep } from '../http.js';

const BASE = 'https://www.sbtjapan.com';
const LIST_URL = (slug) => `${BASE}/used-cars/${slug}?show_numbers=20`;
const IMAGES_URL = (id) => `${BASE}/api/stockImages/${encodeURIComponent(id)}`;
const MAX_PHOTOS = 60;

// 'Brand|Model' -> путь /used-cars/<...>. Проверено по /used-cars/maker/<марка> (ноябрь 2026).
export const MODELS = {
  'Hyundai|Staria': 'hyundai/staria',
  'Hyundai|Grand Starex': 'hyundai/grand-starex',
  'Hyundai|Palisade': 'hyundai/palisade',
  'Hyundai|Santa Fe': 'hyundai/santa-fe',
  'Hyundai|Tucson': 'hyundai/tucson',
  'Hyundai|Sonata': 'hyundai/sonata',
  'Hyundai|Grandeur': 'hyundai/grandeur',
  'Hyundai|Avante': 'hyundai/avante',
  'Hyundai|Kona': 'hyundai/kona',
  'Kia|Carnival': 'kia/carnival',
  'Kia|Sorento': 'kia/sorento',
  'Kia|Sportage': 'kia/sportage',
  'Kia|K5': 'kia/k5',
  'Kia|K8': 'kia/k8',
  'Kia|Mohave': 'kia/mohave',
  'Kia|Seltos': 'kia/seltos',
  'Kia|Ray': 'kia/ray',
  'Genesis|G80': 'genesis/g80',
  'Toyota|Alphard': 'toyota/alphard',
  'Toyota|Land Cruiser Prado': 'toyota/land-cruiser-prado',
  'Toyota|Camry': 'toyota/camry',
  'Toyota|RAV4': 'toyota/rav4',
  'Lexus|RX': 'lexus/rx',
  'Lexus|ES': 'lexus/es',
  'Mazda|6': 'mazda/mazda6',
  'Mazda|CX-5': 'mazda/cx5',
  'Honda|Odyssey': 'honda/odyssey',
  'Honda|CR-V': 'honda/crv',
  'BYD|Dolphin': 'byd/dolphin',
  'BYD|Song Plus': 'byd/song-plus',
  'Mercedes-Benz|E-Class': 'mercedes/e-class',
  'Mercedes-Benz|S-Class': 'mercedes/s-class',
  'BMW|5 Series': 'bmw/5-series',
  'BMW|X5': 'bmw/x5',
  // Добавлено 2026-11-26 по /used-cars/maker/<марка>.
  'Hyundai|Casper': 'hyundai/casper',
  'Hyundai|Venue': 'hyundai/venue',
  'Hyundai|Maxcruz': 'hyundai/maxcruz',
  'Hyundai|i30': 'hyundai/i30',
  'Kia|K9': 'kia/k9',
  'Kia|K3': 'kia/k3',
  'Kia|Morning': 'kia/morning',
  'Kia|Niro': 'kia/niro',
  'Kia|Stinger': 'kia/stinger',
  'Genesis|G70': 'genesis/g70',
  'SsangYong|Rexton': 'ssangyong/rexton',
  'SsangYong|Korando': 'ssangyong/korando',
  'SsangYong|Torres': 'ssangyong/torres',
  'SsangYong|Tivoli': 'ssangyong/tivoli',
  'Toyota|Vellfire': 'toyota/vellfire',
  'Toyota|Land Cruiser': 'toyota/land-cruiser',
  'Toyota|Highlander': 'toyota/highlander',
  'Toyota|Harrier': 'toyota/harrier',
  'Toyota|Crown': 'toyota/crown',
  'Toyota|Corolla': 'toyota/corolla',
  'Toyota|Prius': 'toyota/prius',
  'Toyota|Sienna': 'toyota/sienna',
  'Toyota|Hiace': 'toyota/hiace',
  'Toyota|Voxy': 'toyota/voxy',
  'Toyota|Noah': 'toyota/noah',
  'Toyota|C-HR': 'toyota/c-hr',
  'Toyota|Hilux': 'toyota/hilux',
  'Toyota|Yaris Cross': 'toyota/yaris-cross',
  'Lexus|LX': 'lexus/lx',
  'Lexus|NX': 'lexus/nx',
  'Lexus|GX': 'lexus/gx',
  'Lexus|LS': 'lexus/ls',
  'Lexus|UX': 'lexus/ux',
  'Lexus|IS': 'lexus/is',
  'Lexus|LM': 'lexus/lm',
  'Nissan|X-Trail': 'nissan/xtrail',
  'Nissan|Qashqai': 'nissan/qashqai',
  'Nissan|Murano': 'nissan/murano',
  'Nissan|Pathfinder': 'nissan/pathfinder',
  'Nissan|Patrol': 'nissan/patrol',
  'Nissan|Serena': 'nissan/serena',
  'Nissan|Elgrand': 'nissan/elgrand',
  'Nissan|Note': 'nissan/note',
  'Nissan|Juke': 'nissan/juke',
  'Nissan|Leaf': 'nissan/leaf',
  'Nissan|Altima': 'nissan/altima',
  'Nissan|Navara': 'nissan/navara',
  'Nissan|Ariya': 'nissan/ariya',
  'Mitsubishi|Outlander': 'mitsubishi/outlander',
  'Mitsubishi|Pajero': 'mitsubishi/pajero',
  'Mitsubishi|Pajero Sport': 'mitsubishi/pajero-sport',
  'Mitsubishi|Eclipse Cross': 'mitsubishi/eclipse-cross',
  'Mitsubishi|ASX': 'mitsubishi/asx',
  'Mitsubishi|L200': 'mitsubishi/l200',
  'Suzuki|Jimny': 'suzuki/jimny',
  'Suzuki|Vitara': 'suzuki/vitara',
  'Suzuki|Swift': 'suzuki/swift',
  'Suzuki|SX4 S-Cross': 'suzuki/sx4-s-cross',
  'Suzuki|Hustler': 'suzuki/hustler',
  'Suzuki|Spacia': 'suzuki/spacia',
  'Suzuki|Solio': 'suzuki/solio',
  'Subaru|Forester': 'subaru/forester',
  'Subaru|Outback': 'subaru/outback',
  'Subaru|XV': 'subaru/xv',
  'Subaru|Crosstrek': 'subaru/crosstrek',
  'Subaru|Legacy': 'subaru/legacy',
  'Subaru|Levorg': 'subaru/levorg',
  'Subaru|Impreza': 'subaru/impreza',
  'Honda|HR-V': 'honda/hr-v',
  'Honda|Accord': 'honda/accord',
  'Honda|Civic': 'honda/civic',
  'Honda|Pilot': 'honda/pilot',
  'Honda|Freed': 'honda/freed',
  'Honda|Fit': 'honda/fit',
  'Mazda|3': 'mazda/mazda3',
  'Mazda|CX-30': 'mazda/cx-30',
  'Mazda|CX-60': 'mazda/cx-60',
  'Mazda|CX-8': 'mazda/cx8',
  'Mazda|CX-9': 'mazda/cx-9',
  'Mercedes-Benz|A-Class': 'mercedes/a-class',
  'Mercedes-Benz|C-Class': 'mercedes/c-class',
  'Mercedes-Benz|CLA': 'mercedes/cla-class',
  'Mercedes-Benz|CLS': 'mercedes/cls-class',
  'Mercedes-Benz|G-Class': 'mercedes/g-class',
  'Mercedes-Benz|GLA': 'mercedes/gla-class',
  'Mercedes-Benz|GLB': 'mercedes/glb-class',
  'Mercedes-Benz|GLC': 'mercedes/glc-class',
  'Mercedes-Benz|GLE': 'mercedes/gle',
  'Mercedes-Benz|GLS': 'mercedes/gls-class',
  'Mercedes-Benz|V-Class': 'mercedes/v-class',
  'Mercedes-Benz|EQE': 'mercedes/eqe-class',
  'Mercedes-Benz|EQS': 'mercedes/eqs-class',
  'Mercedes-Benz|Sprinter': 'mercedes/sprinter',
  'BMW|3 Series': 'bmw/3-series',
  'BMW|7 Series': 'bmw/7-series',
  'BMW|X1': 'bmw/x1',
  'BMW|X3': 'bmw/x3',
  'BMW|X4': 'bmw/x4',
  'BMW|X6': 'bmw/x6',
  'BMW|X7': 'bmw/x7',
  'BMW|iX': 'bmw/ix',
  'Audi|A3': 'audi/a3',
  'Audi|A4': 'audi/a4',
  'Audi|A5': 'audi/a5',
  'Audi|A6': 'audi/a6',
  'Audi|A7': 'audi/a7',
  'Audi|A8': 'audi/a8',
  'Audi|Q3': 'audi/q3',
  'Audi|Q5': 'audi/q5',
  'Audi|Q7': 'audi/q7',
  'Audi|Q8': 'audi/q8',
  'Volkswagen|Golf': 'volkswagen/golf',
  'Volkswagen|Jetta': 'volkswagen/jetta',
  'Volkswagen|Passat': 'volkswagen/passat',
  'Volkswagen|Polo': 'volkswagen/polo',
  'Volkswagen|Tiguan': 'volkswagen/tiguan',
  'Volkswagen|Touareg': 'volkswagen/touareg',
  'Volkswagen|T-Roc': 'volkswagen/t-roc',
  'Volkswagen|Arteon': 'volkswagen/arteon',
  'Skoda|Kodiaq': 'skoda/kodiaq',
  'Skoda|Rapid': 'skoda/rapid',
  'Porsche|911': 'porsche/911',
  'Porsche|Cayenne': 'porsche/cayenne',
  'Porsche|Macan': 'porsche/macan',
  'Porsche|Panamera': 'porsche/panamera',
  'Porsche|Taycan': 'porsche/taycan',
  'Land Rover|Range Rover': 'land-rover/range-rover',
  'Land Rover|Range Rover Sport': 'land-rover/range-rover-sport',
  'Land Rover|Range Rover Velar': 'land-rover/range-rover-velar',
  'Land Rover|Range Rover Evoque': 'land-rover/range-rover-evoque',
  'Land Rover|Defender': 'land-rover/defender',
  'Land Rover|Discovery': 'land-rover/discovery',
  'Land Rover|Discovery Sport': 'land-rover/discovery-sport',
  'Volvo|XC40': 'volvo/xc40',
  'Volvo|XC60': 'volvo/xc60',
  'Volvo|XC90': 'volvo/xc90',
  'Volvo|S90': 'volvo/s90',
  'Jeep|Grand Cherokee': 'jeep/grand-cherokee',
  'Jeep|Wrangler': 'jeep/wrangler',
  'Jeep|Compass': 'jeep/compass',
  'Ford|Explorer': 'ford/explorer',
  'Ford|Kuga': 'ford/kuga',
  'Ford|Ranger': 'ford/ranger',
  'Ford|Transit': 'ford/transit',
  'BYD|Tang': 'byd/tang',
  'Geely|Coolray': 'geely/coolray',
  'Geely|Tugella': 'geely/tugella',
  'Geely|Emgrand': 'geely/emgrand',
  'Changan|CS35 Plus': 'changan/cs35-plus',
  'Changan|CS55 Plus': 'changan/cs55-plus',
  'Changan|CS75 Plus': 'changan/cs75-plus',
  'Changan|UNI-V': 'changan/uni-v',
  'Changan|UNI-T': 'changan/uni-t',
  'Chery|Tiggo 7': 'chery/tiggo-7',
  'Chery|Tiggo 8': 'chery/tiggo-8',
  'Chery|Arrizo 8': 'chery/arrizo-8',
};

const FUEL = { PETROL: 'petrol', GASOLINE: 'petrol', DIESEL: 'diesel', HYBRID: 'hybrid', 'PLUG-IN HYBRID': 'hybrid', ELECTRIC: 'ev', EV: 'ev', LPG: 'lpg', CNG: null };
const COUNTRY = {
  JAPAN: ['JP', 'Япония'], 'SOUTH KOREA': ['KR', 'Корея'], KOREA: ['KR', 'Корея'], CHINA: ['CN', 'Китай'],
  THAILAND: ['JP', 'Таиланд'], SINGAPORE: ['JP', 'Сингапур'], UAE: ['JP', 'ОАЭ'], UK: ['EU', 'Великобритания'],
};
const CITY = { NAGOYA: 'Нагоя', YOKOHAMA: 'Иокогама', OSAKA: 'Осака', KOBE: 'Кобе', TOKYO: 'Токио', FUKUOKA: 'Фукуока', KAWASAKI: 'Кавасаки', HAKATA: 'Хаката', INCHEON: 'Инчхон', BUSAN: 'Пусан', SEOUL: 'Сеул' };
// «2WD» у SBT без уточнения оси: у этих марок это задний привод, у остальных передний.
const RWD_BRANDS = new Set(['BMW', 'Mercedes-Benz', 'Genesis']);

const num = (s) => { const d = String(s ?? '').replace(/[^\d]/g, ''); return d ? Number(d) : null; };
const decode = (s) => String(s || '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (s) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function where(loc) {
  const [cityRaw, countryRaw] = String(loc || '').split(',').map((s) => s.trim());
  const c = COUNTRY[String(countryRaw || cityRaw || '').toUpperCase()];
  if (!c) return { region: 'JP', location: loc || null };
  const city = countryRaw ? (CITY[cityRaw.toUpperCase()] || cityRaw.charAt(0) + cityRaw.slice(1).toLowerCase()) : null;
  return { region: c[0], location: [city, c[1]].filter(Boolean).join(', ') };
}

function drive(v, brand) {
  const u = String(v || '').toUpperCase();
  if (/4WD|AWD|4-4|FULL/.test(u)) return 'полный';
  if (/2WD|4-2/.test(u)) return RWD_BRANDS.has(brand) ? 'задний' : 'передний';
  return null;
}

function gear(v) {
  const u = String(v || '').toUpperCase();
  if (!u || u === '-') return null;
  if (/CVT/.test(u)) return 'вариатор';
  if (/SEMI|DCT|AMT|SMOOTHER|INOMAT|DUONIC|ESCOT|PROSHIFT/.test(u)) return 'робот';
  if (/MT/.test(u)) return 'МКПП';
  if (/AT/.test(u)) return 'АКПП';
  return null;
}

// Удаляет из HTML всё тяжёлое (формы, svg, скрипты) — так проще разбирать и меньше памяти.
export function slimList(html) {
  return String(html).replace(/<form[\s\S]*?<\/form>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/\s+/g, ' ');
}

export function parseList(html, brand, model) {
  const out = [];
  const parts = slimList(html).split('<li class="search-result__items vehicle-box-area-main"').slice(1);
  for (const p of parts) {
    const id = (p.match(/data-stock-id="([^"]+)"/) || [])[1];
    const path = (p.match(/data-detail-url="([^"]+)"/) || [])[1];
    if (!id || !path) continue;
    if (/data-is-sold="1"/.test(p)) continue;
    const attrs = {};
    for (const m of p.matchAll(/<span class="dark-grey-primary">([\s\S]*?)<\/span>\s*<span class="light-grey-primary">([\s\S]*?)<\/span>/g)) attrs[text(m[2])] = text(m[1]);
    for (const m of p.matchAll(/<h5[^>]*>([\s\S]*?):?<\/h5>\s*<h6>([\s\S]*?)<\/h6>/g)) attrs[text(m[1]).replace(/:$/, '')] = text(m[2]);
    const title = text((p.match(/<h2[^>]*vehicle-title[^>]*>([\s\S]*?)<\/h2>/) || [])[1]);
    const ym = (title.match(/^(\d{4})(?:\/(\d{1,2}))?/) || []);
    const reg = String(attrs['Registration'] || '').match(/(\d{4})\s*\/\s*(\d{1,2})/);
    // «2012/8 TOYOTA ALPHARD 240X»: после года идут марка и модель (столько слов, сколько в адресе).
    const [, maker = 'x', modelSlug = 'x'] = decode(path).split('?')[0].split('/').filter(Boolean); // used-cars/<марка>/<модель>/<id>
    const skip = maker.split(/[-\s]|%20/).length + modelSlug.split('-').length;
    const trim = title.replace(/^\d{4}(\/\d{1,2})?\s+/, '').split(/\s+/).slice(skip).join(' ') || null;
    const price = num((p.match(/class="card-product__price(?:\s[^"]*)?">\s*([\d,]+)\s*</) || [])[1]);
    const currency = text((p.match(/class="card-product__price-currency">([^<]*)</) || [])[1]) || 'USD';
    const cc = num(attrs['Engine']);
    const seats = num(attrs['Seating']);
    const { region, location } = where(attrs['Inventory location']);
    const img = (p.match(/data-main-image="([^"]+)"/) || [])[1];
    const fuelKey = String(attrs['Fuel Type'] || '').toUpperCase();
    const notes = [
      attrs['Model Code'] && attrs['Model Code'] !== '-' && `Model code: ${attrs['Model Code']}`,
      attrs['Body color'] && `Color: ${attrs['Body color']}`,
      attrs['Steering'] && attrs['Steering'] !== '-' && `Steering: ${attrs['Steering']}`,
    ].filter(Boolean);
    out.push({
      uid: `sbt:${id}`,
      source: 'sbt',
      source_label: 'SBT Japan',
      region,
      url: BASE + decode(path).split('?')[0],
      brand, model,
      trim,
      year: reg ? Number(reg[1]) : (ym[1] ? Number(ym[1]) : null),
      month: reg ? Number(reg[2]) : (ym[2] ? Number(ym[2]) : null),
      mileage_km: num(attrs['Mileage']),
      fuel: FUEL[fuelKey] ?? (/HYBRID/.test(fuelKey) ? 'hybrid' : null),
      transmission: gear(attrs['Transmission']),
      drive: drive(attrs['Drive'], brand),
      engine: cc ? `${(cc / 1000).toFixed(1)} л` : null,
      seats: seats || null,
      price,
      currency: price ? currency : null,
      price_note: `FOB ${region === 'KR' ? 'Корея' : region === 'CN' ? 'Китай' : 'Япония'}`,
      location,
      photos: img ? [bigPhoto(decode(img))] : [],
      desc_orig: notes.length ? notes.join('; ') : null,
    });
  }
  return out;
}

// Убираем imwidth — без него CDN отдаёт исходный размер.
const bigPhoto = (u) => String(u).replace(/([?&])imwidth=\d+&?/, '$1').replace(/[?&]$/, '');

// JSON /api/stockImages/<id>: группы normal (машина), cs/sbtcs (листы осмотра), repair.
export function parseImages(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || data.result !== 1 || !Array.isArray(data.data)) return [];
  const normal = data.data.find((g) => g.imageType === 'normal');
  const list = (normal && normal.ImageDataList) || [];
  return [...new Set(list.filter((x) => x && x.imageUrl)
    .sort((a, b) => Number(a.sortKey) - Number(b.sortKey))
    .map((x) => bigPhoto(x.imageUrl)))].slice(0, MAX_PHOTOS);
}

// Страница машины не нужна: всё есть в списке. Для единообразия — фото из JSON.
export function parseDetail(json) {
  return { photos: parseImages(json) };
}

export async function search(brand, model, { rates, isKnown } = {}) { // eslint-disable-line no-unused-vars
  const slug = MODELS[`${brand}|${model}`];
  if (!slug) return [];
  const html = await get(LIST_URL(slug), { timeout: 60_000 });
  const list = parseList(html, brand, model);
  const out = [];
  for (const l of list) {
    if (isKnown && isKnown(l)) continue;
    try {
      const d = parseDetail(await get(IMAGES_URL(l.uid.slice(4)), { as: 'json', headers: { Accept: 'application/json', Referer: l.url } }));
      if (d.photos.length) l.photos = d.photos;
    } catch (e) {
      console.warn(`[sbt] фото ${l.uid}: ${e.message}`);
    }
    out.push(l);
    await sleep(700);
  }
  return out;
}
