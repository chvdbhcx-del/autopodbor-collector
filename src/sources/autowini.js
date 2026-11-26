// Autowini (Корея, экспортная площадка): JSON-API https://v2api.autowini.com.
// Список: GET /items/cars?make=<код>&subModel=<код>&sorting=recentDate (новые сверху, 30 шт.).
// Страница машины на www.autowini.com требует входа (редирект на Keycloak), а
// /items/<id>/photos отвечает «unauthorized access», поэтому берём только список:
// в нём 5 фото 720px (photoCount — сколько всего у продавца) и заголовок продавца.
// Цены в USD, FOB. Картинки imagebox.autowini.com за Akamai: без Referer сайта отдают 403.
import { get, sleep } from '../http.js';

const API = 'https://v2api.autowini.com';
const SITE = 'https://www.autowini.com';
export const PHOTO_HEADERS = { Referer: SITE + '/', Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' };
const HEADERS = { Accept: 'application/json, text/plain, */*', Origin: SITE, Referer: SITE + '/' };

// 'Brand|Model' -> { make, sub, re? } — коды из /items/cars/filters?make=…; re — уточнение по modelName.
export const MODELS = {
  'Hyundai|Staria': { make: 'C0680', sub: 'C0016' },
  'Hyundai|Grand Starex': { make: 'C0680', sub: 'C0050' }, // Starex: Grand Starex и старый Starex
  'Hyundai|Palisade': { make: 'C0680', sub: 'C5165' },
  'Hyundai|Santa Fe': { make: 'C0680', sub: 'C0040' },
  'Hyundai|Tucson': { make: 'C0680', sub: 'C0330' },
  'Hyundai|Sonata': { make: 'C0680', sub: 'C0020' },
  'Hyundai|Grandeur': { make: 'C0680', sub: 'C0010' },
  'Hyundai|Avante': { make: 'C0680', sub: 'C0030' },
  'Hyundai|Kona': { make: 'C0680', sub: 'C5015' },
  'Kia|Carnival': { make: 'C0810', sub: 'C1150' },
  'Kia|Sorento': { make: 'C0810', sub: 'C1080' },
  'Kia|Sportage': { make: 'C0810', sub: 'C1060' },
  'Kia|K5': { make: 'C0810', sub: 'C0890' },
  'Kia|K8': { make: 'C0810', sub: 'C0007' },
  'Kia|Mohave': { make: 'C0810', sub: 'C1010' },
  'Kia|Seltos': { make: 'C0810', sub: 'C5025' },
  'Kia|Ray': { make: 'C0810', sub: 'C0940' },
  'Genesis|GV80': { make: 'C1710', sub: 'C0048' },
  'Genesis|GV70': { make: 'C1710', sub: 'C0047' },
  'Genesis|G80': { make: 'C1710', sub: 'C0380' },
  'Toyota|Alphard': { make: 'C1610', sub: 'C3490' },
  'Toyota|Land Cruiser Prado': { make: 'C1610', sub: 'C3310', re: /prado/i },
  'Toyota|Camry': { make: 'C1610', sub: 'C3580' },
  'Toyota|RAV4': { make: 'C1610', sub: 'C3240' },
  'Lexus|RX': { make: 'C0900', sub: 'C2410' },
  'Lexus|ES': { make: 'C0900', sub: 'C2340' },
  'Mazda|6': { make: 'C1020', sub: 'C3355' }, // Atenza = Mazda6
  'Mazda|CX-5': { make: 'C1020', sub: 'C5250', re: /CX[\s-]?5(?!\d)/i }, // общая группа CX
  'Honda|Odyssey': { make: 'C0660', sub: 'C4350' },
  'Honda|CR-V': { make: 'C0660', sub: 'C4150' },
  'Mercedes-Benz|E-Class': { make: 'C1040', sub: 'C1580' },
  'Mercedes-Benz|S-Class': { make: 'C1040', sub: 'C1680' },
  'BMW|5 Series': { make: 'C0120', sub: 'C1280' },
  'BMW|X5': { make: 'C0120', sub: 'C1420' },
};

const FUEL = {
  gasoline: 'petrol', petrol: 'petrol', diesel: 'diesel', lpg: 'lpg', electric: 'ev', ev: 'ev',
  'gasoline+electric': 'hybrid', 'diesel+electric': 'hybrid', 'lpg+electric': 'hybrid', hybrid: 'hybrid',
};
const GEAR = { AT: 'АКПП', MT: 'МКПП', CVT: 'вариатор', AMT: 'робот', DCT: 'робот' };
const COUNTRY = { 'S.Korea': ['KR', 'Корея'], Korea: ['KR', 'Корея'], Japan: ['JP', 'Япония'], Singapore: ['SG', 'Сингапур'] };

const num = (v) => { const d = String(v ?? '').replace(/[^\d.]/g, ''); return d ? Number(d) : null; };

function drive(s) {
  const t = String(s || '');
  if (/4\s*wheel|4wd|awd/i.test(t)) return 'полный';
  if (/front/i.test(t)) return 'передний';
  if (/rear/i.test(t)) return 'задний';
  return null;
}

function engine(cc) { return cc ? `${(cc / 1000).toFixed(1)} л` : null; }

export function mapItem(it, brand, model) {
  const id = it.listingId;
  if (!id) return null;
  // content: "IC5722310 · Gasoline · 3,778cc · AT · 7seats · LHD · 62,079km (Actual)"
  const parts = String(it.content || '').split('·').map((s) => s.trim());
  const gear = it.transmissionType || it.transmission || parts.find((p) => GEAR[p]);
  const [region, country] = COUNTRY[it.locationName] || ['KR', it.locationName || 'Корея'];
  const price = num(it.discountPrice) || num(it.price);
  const photos = [...new Set([...(it.thumbnails || []), it.mainThumbnailPath].filter(Boolean))];
  const hot = (it.hotmarks || []).map((h) => h.name).filter(Boolean);
  const steer = it.steeringType || it.steering;
  return {
    uid: `autowini:${id}`,
    source: 'autowini',
    source_label: 'Autowini',
    region,
    url: SITE + (it.detailUrl || `/items/${id}`),
    brand, model,
    trim: it.modelClass ? String(it.modelClass).replace(/\s+/g, ' ').trim() : null,
    year: num(it.modelYear),
    month: null,
    mileage_km: num(it.mileageKm ?? it.mileage),
    fuel: FUEL[String(it.fuelType || '').toLowerCase()] || null,
    transmission: GEAR[gear] || null,
    drive: drive(it.drivetrainType),
    engine: engine(num(it.engineVolume)),
    seats: num(it.passengerCapacity ?? it.numberOfPassenger),
    price,
    currency: price ? 'USD' : null,
    price_note: `FOB ${country}`,
    location: country,
    photos,
    desc_orig: [it.itemName && String(it.itemName).replace(/\s+/g, ' ').trim(),
      hot.length ? hot.join(', ') : null, steer ? `Steering: ${steer}` : null].filter(Boolean).join('\n') || null,
  };
}

// json — ответ /items/cars.
export function parseList(json, brand, model) {
  const items = (json && json.data && json.data.items) || [];
  const m = MODELS[`${brand}|${model}`];
  return items
    .filter((it) => !it.status || it.status === 'FOR_SALE')
    .filter((it) => !m || !m.re || m.re.test(`${it.modelName || ''} ${it.itemName || ''}`))
    .map((it) => mapItem(it, brand, model)).filter(Boolean);
}

export const listUrl = (m, page = 1) =>
  `${API}/items/cars?make=${m.make}&subModel=${m.sub}&sorting=recentDate${page > 1 ? `&pageOffset=${page}` : ''}`;

// Карточки без входа нет, поэтому search() обходится одним запросом на модель.
export async function search(brand, model, { isKnown } = {}) {
  const m = MODELS[`${brand}|${model}`];
  if (!m) return [];
  const json = await get(listUrl(m), { headers: HEADERS, as: 'json' });
  if (json && json.result && json.result !== 'SUCCESS') throw new Error(json.errorMessage || json.result);
  let list = parseList(json, brand, model);
  // Для моделей с уточнением (Prado, CX-5) на первой странице может остаться мало — берём вторую.
  if (m.re && list.length < 10) {
    await sleep(800);
    try { list = list.concat(parseList(await get(listUrl(m, 2), { headers: HEADERS, as: 'json' }), brand, model)); } catch { /* хватит и первой */ }
  }
  const seen = new Set();
  return list.filter((l) => !seen.has(l.uid) && seen.add(l.uid) && !(isKnown && isKnown(l)));
}
