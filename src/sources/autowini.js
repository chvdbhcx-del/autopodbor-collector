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
  // Добавлено 2026-11-26 по /items/cars/filters?make=…
  'Kia|K9': { make: 'C0810', sub: 'C0910' },
  'Kia|K3': { make: 'C0810', sub: 'C0880' },
  'Kia|Morning': { make: 'C0810', sub: 'C1000' },
  'Kia|Niro': { make: 'C0810', sub: 'C0930' },
  'Kia|EV6': { make: 'C0810', sub: 'C0049' },
  'Kia|EV9': { make: 'C0810', sub: 'C0277' },
  'Kia|Stinger': { make: 'C0810', sub: 'C4995' },
  'Hyundai|Ioniq 5': { make: 'C0680', sub: 'C0281' },
  'Hyundai|Ioniq 6': { make: 'C0680', sub: 'C0282' },
  'Hyundai|Casper': { make: 'C0680', sub: 'C0024' },
  'Hyundai|Venue': { make: 'C0680', sub: 'C5125' },
  'Hyundai|Maxcruz': { make: 'C0680', sub: 'C0150' },
  'Hyundai|i30': { make: 'C0680', sub: 'C0070' },
  'Hyundai|Nexo': { make: 'C0680', sub: 'C0003' },
  'Genesis|GV60': { make: 'C1710', sub: 'C0046' },
  'Genesis|G90': { make: 'C1710', sub: 'C0044' },
  'Genesis|G70': { make: 'C1710', sub: 'C5115' },
  'SsangYong|Rexton': { make: 'C1500', sub: 'C0410' },
  'SsangYong|Korando': { make: 'C1500', sub: 'C0490' },
  'SsangYong|Torres': { make: 'C1500', sub: 'C0139' },
  'SsangYong|Tivoli': { make: 'C1500', sub: 'C0500' },
  'BMW|3 Series': { make: 'C0120', sub: 'C1260' },
  'BMW|7 Series': { make: 'C0120', sub: 'C1300' },
  'BMW|X1': { make: 'C0120', sub: 'C1390' },
  'BMW|X3': { make: 'C0120', sub: 'C1400' },
  'BMW|X4': { make: 'C0120', sub: 'C1410' },
  'BMW|X6': { make: 'C0120', sub: 'C1430' },
  'BMW|X7': { make: 'C0120', sub: 'C0118' },
  'BMW|iX': { make: 'C0120', sub: 'C0114' },
  'Audi|A3': { make: 'C0040', sub: 'C1800' },
  'Audi|A4': { make: 'C0040', sub: 'C1810' },
  'Audi|A5': { make: 'C0040', sub: 'C1820' },
  'Audi|A6': { make: 'C0040', sub: 'C1830' },
  'Audi|A7': { make: 'C0040', sub: 'C1840' },
  'Audi|A8': { make: 'C0040', sub: 'C1850' },
  'Audi|Q3': { make: 'C0040', sub: 'C1990' },
  'Audi|Q5': { make: 'C0040', sub: 'C2000' },
  'Audi|Q7': { make: 'C0040', sub: 'C2010' },
  'Audi|Q8': { make: 'C0040', sub: 'C0122' },
  'Audi|e-tron': { make: 'C0040', sub: 'C0121' },
  'Land Rover|Range Rover': { make: 'C0880', sub: 'C3770' },
  'Land Rover|Range Rover Sport': { make: 'C0880', sub: 'C3780' },
  'Land Rover|Range Rover Evoque': { make: 'C0880', sub: 'C3790' },
  'Land Rover|Defender': { make: 'C0880', sub: 'C3760' },
  'Land Rover|Discovery': { make: 'C0880', sub: 'C3740' },
  'Land Rover|Discovery Sport': { make: 'C0880', sub: 'C3750' },
  'Toyota|Vellfire': { make: 'C1610', sub: 'C5590' },
  'Toyota|Land Cruiser': { make: 'C1610', sub: 'C3310' },
  'Toyota|Highlander': { make: 'C1610', sub: 'C3710' },
  'Toyota|Harrier': { make: 'C1610', sub: 'C3730' },
  'Toyota|Crown': { make: 'C1610', sub: 'C3620' },
  'Toyota|Corolla': { make: 'C1610', sub: 'C3600' },
  'Toyota|Prius': { make: 'C1610', sub: 'C3690' },
  'Toyota|Sienna': { make: 'C1610', sub: 'C3440' },
  'Toyota|Hiace': { make: 'C1610', sub: 'C5560' },
  'Toyota|Voxy': { make: 'C1610', sub: 'C5580' },
  'Toyota|Noah': { make: 'C1610', sub: 'C3290' },
  'Toyota|C-HR': { make: 'C1610', sub: 'C0146' },
  'Toyota|Hilux': { make: 'C1610', sub: 'C0225' },
  'Volkswagen|Golf': { make: 'C1690', sub: 'C2110' },
  'Volkswagen|Jetta': { make: 'C1690', sub: 'C2180' },
  'Volkswagen|Passat': { make: 'C1690', sub: 'C2190' },
  'Volkswagen|Polo': { make: 'C1690', sub: 'C2210' },
  'Volkswagen|Tiguan': { make: 'C1690', sub: 'C2230' },
  'Volkswagen|Touareg': { make: 'C1690', sub: 'C2220' },
  'Volkswagen|T-Roc': { make: 'C1690', sub: 'C0264' },
  'Volkswagen|ID.4': { make: 'C1690', sub: 'C2112' },
  'Volkswagen|Arteon': { make: 'C1690', sub: 'C5045' },
  'Porsche|911': { make: 'C1260', sub: 'C4710' },
  'Porsche|Cayenne': { make: 'C1260', sub: 'C4750' },
  'Porsche|Macan': { make: 'C1260', sub: 'C4720' },
  'Porsche|Panamera': { make: 'C1260', sub: 'C4760' },
  'Porsche|Taycan': { make: 'C1260', sub: 'C0249' },
  'Jeep|Wrangler': { make: 'C0750', sub: 'C4610' },
  'Jeep|Compass': { make: 'C0750', sub: 'C4630' },
  'Volvo|XC40': { make: 'C1700', sub: 'C0172' },
  'Volvo|XC60': { make: 'C1700', sub: 'C3950' },
  'Volvo|XC90': { make: 'C1700', sub: 'C3970' },
  'Volvo|S90': { make: 'C1700', sub: 'C6370' },
  'Tesla|Model 3': { make: 'C1650', sub: 'C0009' },
  'Tesla|Model Y': { make: 'C1650', sub: 'C0014' },
  'Tesla|Model S': { make: 'C1650', sub: 'C0011' },
  'Tesla|Model X': { make: 'C1650', sub: 'C0012' },
  'Ford|Explorer': { make: 'C0480', sub: 'C2580' },
  'Ford|Kuga': { make: 'C0480', sub: 'C1785' },
  'Ford|Ranger': { make: 'C0480', sub: 'C2490' },
  'Ford|Transit': { make: 'C0480', sub: 'C2630' },
  'Lexus|LX': { make: 'C0900', sub: 'C2380' },
  'Lexus|NX': { make: 'C0900', sub: 'C2390' },
  'Lexus|LS': { make: 'C0900', sub: 'C2370' },
  'Lexus|UX': { make: 'C0900', sub: 'C0263' },
  'Lexus|IS': { make: 'C0900', sub: 'C2330' },
  'Lexus|LM': { make: 'C0900', sub: 'C0278' },
  'Honda|HR-V': { make: 'C0660', sub: 'C4190' },
  'Honda|Accord': { make: 'C0660', sub: 'C4330' },
  'Honda|Civic': { make: 'C0660', sub: 'C4300' },
  'Honda|Pilot': { make: 'C0660', sub: 'C7490' },
  'Honda|Freed': { make: 'C0660', sub: 'C5130' },
  'Honda|Fit': { make: 'C0660', sub: 'C4170' },
  'Nissan|X-Trail': { make: 'C1170', sub: 'C5450' },
  'Nissan|Qashqai': { make: 'C1170', sub: 'C3030' },
  'Nissan|Murano': { make: 'C1170', sub: 'C2900' },
  'Nissan|Pathfinder': { make: 'C1170', sub: 'C3090' },
  'Nissan|Serena': { make: 'C1170', sub: 'C5440' },
  'Nissan|Elgrand': { make: 'C1170', sub: 'C5390' },
  'Nissan|Note': { make: 'C1170', sub: 'C5360' },
  'Nissan|Juke': { make: 'C1170', sub: 'C3020' },
  'Nissan|Leaf': { make: 'C1170', sub: 'C2860' },
  'Nissan|Altima': { make: 'C1170', sub: 'C3010' },
  'Suzuki|Jimny': { make: 'C1530', sub: 'C5700' },
  'Suzuki|Swift': { make: 'C1530', sub: 'C5660' },
  'Suzuki|Hustler': { make: 'C1530', sub: 'C7060' },
  'Suzuki|Spacia': { make: 'C1530', sub: 'C7160' },
  'Subaru|Forester': { make: 'C1510', sub: 'C5750' },
  'Subaru|Outback': { make: 'C1510', sub: 'C5780' },
  'Subaru|XV': { make: 'C1510', sub: 'C0021' },
  'Subaru|Legacy': { make: 'C1510', sub: 'C5800' },
  'Subaru|Levorg': { make: 'C1510', sub: 'C8670' },
  'Subaru|Impreza': { make: 'C1510', sub: 'C5790' },
  'Mitsubishi|Outlander': { make: 'C1100', sub: 'C4560' },
  'Mitsubishi|Pajero': { make: 'C1100', sub: 'C4590' },
  'Mitsubishi|Delica': { make: 'C1100', sub: 'C5330' },
  'Mercedes-Benz|A-Class': { make: 'C1040', sub: 'C1510' },
  'Mercedes-Benz|C-Class': { make: 'C1040', sub: 'C1530' },
  'Mercedes-Benz|CLA': { make: 'C1040', sub: 'C1550' },
  'Mercedes-Benz|CLS': { make: 'C1040', sub: 'C1570' },
  'Mercedes-Benz|G-Class': { make: 'C1040', sub: 'C1590' },
  'Mercedes-Benz|GLA': { make: 'C1040', sub: 'C1610' },
  'Mercedes-Benz|GLB': { make: 'C1040', sub: 'C0096' },
  'Mercedes-Benz|GLC': { make: 'C1040', sub: 'C1620' },
  'Mercedes-Benz|GLE': { make: 'C1040', sub: 'C1630' },
  'Mercedes-Benz|GLS': { make: 'C1040', sub: 'C1650' },
  'Mercedes-Benz|V-Class': { make: 'C1040', sub: 'C1760' },
  'Mercedes-Benz|EQE': { make: 'C1040', sub: 'C0017' },
  'Mercedes-Benz|EQS': { make: 'C1040', sub: 'C0099' },
  'Mercedes-Benz|AMG GT': { make: 'C1040', sub: 'C1740' },
  'Mercedes-Benz|Sprinter': { make: 'C1040', sub: 'C1770' },
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
export async function listPage(brand, model, page) {
  const m = MODELS[`${brand}|${model}`];
  if (!m) return [];
  const json = await get(listUrl(m, page), { headers: HEADERS, as: 'json' });
  if (json && json.result && json.result !== 'SUCCESS') throw new Error(json.errorMessage || json.result);
  return parseList(json, brand, model);
}

export async function search(brand, model, { isKnown, onList } = {}) {
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
  list = list.filter((l) => !seen.has(l.uid) && seen.add(l.uid));
  if (onList) onList(list);
  return list.filter((l) => !(isKnown && isKnown(l)));
}
