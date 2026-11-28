// BE FORWARD (beforward.jp): экспортёр из Японии, есть склады в Корее, Сингапуре, Таиланде и т.д.
// Список: /stocklist/make=<id>/model=<id>/sortkey=e/ (sortkey=e — «Ref New to Old», то есть
// самые новые объявления; ≈0.75 МБ, 25 машин). Карточка /<марка>/<модель>/<ref>/id/<id>/ —
// все фото (large, обычно 20–95 шт.), таблица характеристик и Remarks продавца.
import { get, sleep, timeUp, DETAIL_TOP } from '../http.js';

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
  // Добавлено 2026-11-26: коды из <select name="model"> /stocklist/make=<id>/.
  'Hyundai|Ioniq 5': { make: 44, models: [17357] },
  'Hyundai|Ioniq 6': { make: 44, models: [17359] },
  'Hyundai|Casper': { make: 44, models: [16576] },
  'Hyundai|Venue': { make: 44, models: [16329] },
  'Hyundai|Maxcruz': { make: 44, models: [13884] },
  'Hyundai|i30': { make: 44, models: [13271] },
  'Kia|K9': { make: 313, models: [14128] },
  'Kia|K3': { make: 313, models: [13595] },
  'Kia|Morning': { make: 313, models: [16583] },
  'Kia|Niro': { make: 313, models: [14177] },
  'Kia|EV6': { make: 313, models: [17166] },
  'Kia|Stinger': { make: 313, models: [14336] },
  'Genesis|G90': { make: 775, models: [17024] },
  'Genesis|G70': { make: 775, models: [16832] },
  'SsangYong|Rexton': { make: 244, models: [2085] },
  'SsangYong|Korando': { make: 244, models: [2082] },
  'SsangYong|Torres': { make: 244, models: [17094] },
  'SsangYong|Tivoli': { make: 244, models: [13779] },
  'Toyota|Vellfire': { make: 1, models: [271] },
  'Toyota|Land Cruiser': { make: 1, models: [198] },
  'Toyota|Highlander': { make: 1, models: [1223] },
  'Toyota|Harrier': { make: 1, models: [181] },
  'Toyota|Crown': { make: 1, models: [151] },
  'Toyota|Corolla': { make: 1, models: [13848] },
  'Toyota|Prius': { make: 1, models: [225] },
  'Toyota|Sienna': { make: 1, models: [1238] },
  'Toyota|Hiace': { make: 1, models: [184, 185, 186] },
  'Toyota|Voxy': { make: 1, models: [277] },
  'Toyota|Noah': { make: 1, models: [219] },
  'Toyota|C-HR': { make: 1, models: [13850] },
  'Toyota|Hilux': { make: 1, models: [187] },
  'Toyota|Yaris Cross': { make: 1, models: [16449] },
  'Lexus|LX': { make: 68, models: [2600] },
  'Lexus|NX': { make: 68, models: [13545] },
  'Lexus|GX': { make: 68, models: [17301] },
  'Lexus|LS': { make: 68, models: [2599] },
  'Lexus|UX': { make: 68, models: [16500] },
  'Lexus|IS': { make: 68, models: [2116] },
  'Lexus|LM': { make: 68, models: [17229] },
  'Nissan|X-Trail': { make: 3, models: [473] },
  'Nissan|Qashqai': { make: 3, models: [14074] },
  'Nissan|Murano': { make: 3, models: [422] },
  'Nissan|Pathfinder': { make: 3, models: [1276] },
  'Nissan|Patrol': { make: 3, models: [15959] },
  'Nissan|Serena': { make: 3, models: [450] },
  'Nissan|Elgrand': { make: 3, models: [390] },
  'Nissan|Note': { make: 3, models: [425] },
  'Nissan|Juke': { make: 3, models: [13240] },
  'Nissan|Leaf': { make: 3, models: [13366] },
  'Nissan|Altima': { make: 3, models: [1253] },
  'Nissan|Navara': { make: 3, models: [1274] },
  'Nissan|Ariya': { make: 3, models: [17353] },
  'Mitsubishi|Outlander': { make: 5, models: [599] },
  'Mitsubishi|Pajero': { make: 5, models: [600] },
  'Mitsubishi|Eclipse Cross': { make: 5, models: [15727] },
  'Mitsubishi|Delica': { make: 5, models: [1312] },
  'Mitsubishi|ASX': { make: 5, models: [16087] },
  'Mitsubishi|L200': { make: 5, models: [1325] },
  'Suzuki|Jimny': { make: 7, models: [634] },
  'Suzuki|Vitara': { make: 7, models: [1405] },
  'Suzuki|Swift': { make: 7, models: [645] },
  'Suzuki|SX4 S-Cross': { make: 7, models: [15728] },
  'Suzuki|Hustler': { make: 7, models: [14395] },
  'Suzuki|Spacia': { make: 7, models: [13831] },
  'Suzuki|Solio': { make: 7, models: [13388] },
  'Subaru|Forester': { make: 94, models: [1056] },
  'Subaru|Outback': { make: 94, models: [1068] },
  'Subaru|XV': { make: 94, models: [16055] },
  'Subaru|Crosstrek': { make: 94, models: [17113] },
  'Subaru|Legacy': { make: 94, models: [1062] },
  'Subaru|Levorg': { make: 94, models: [14264] },
  'Subaru|Impreza': { make: 94, models: [1057] },
  'Honda|HR-V': { make: 2, models: [315] },
  'Honda|Accord': { make: 2, models: [284] },
  'Honda|Civic': { make: 2, models: [295] },
  'Honda|Pilot': { make: 2, models: [1302] },
  'Honda|Stepwgn': { make: 2, models: [340] },
  'Honda|Freed': { make: 2, models: [312, 17194] },
  'Honda|Fit': { make: 2, models: [310] },
  'Mazda|CX-30': { make: 4, models: [16411] },
  'Mazda|CX-60': { make: 4, models: [16865] },
  'Mazda|CX-8': { make: 4, models: [16123] },
  'Mazda|CX-9': { make: 4, models: [1364] },
  'Mercedes-Benz|A-Class': { make: 106, models: [1101] },
  'Mercedes-Benz|C-Class': { make: 106, models: [1103] },
  'Mercedes-Benz|CLA': { make: 106, models: [13587] },
  'Mercedes-Benz|CLS': { make: 106, models: [1106] },
  'Mercedes-Benz|G-Class': { make: 106, models: [1108] },
  'Mercedes-Benz|GLA': { make: 106, models: [15621] },
  'Mercedes-Benz|GLB': { make: 106, models: [16414] },
  'Mercedes-Benz|GLC': { make: 106, models: [16058] },
  'Mercedes-Benz|GLE': { make: 106, models: [15668] },
  'Mercedes-Benz|GLS': { make: 106, models: [16412] },
  'Mercedes-Benz|ML': { make: 106, models: [1696] },
  'Mercedes-Benz|V-Class': { make: 106, models: [1120] },
  'Mercedes-Benz|EQE': { make: 106, models: [16943] },
  'Mercedes-Benz|EQS': { make: 106, models: [16944] },
  'Mercedes-Benz|AMG GT': { make: 106, models: [16467] },
  'Mercedes-Benz|Sprinter': { make: 106, models: [1698] },
  'BMW|3 Series': { make: 83, models: [1033] },
  'BMW|7 Series': { make: 83, models: [1037] },
  'BMW|X1': { make: 83, models: [13288] },
  'BMW|X3': { make: 83, models: [1044] },
  'BMW|X4': { make: 83, models: [15699] },
  'BMW|X6': { make: 83, models: [1622] },
  'BMW|X7': { make: 83, models: [16397] },
  'BMW|iX': { make: 83, models: [17136] },
  'Audi|A3': { make: 47, models: [748] },
  'Audi|A4': { make: 47, models: [749] },
  'Audi|A5': { make: 47, models: [1639] },
  'Audi|A6': { make: 47, models: [750] },
  'Audi|A7': { make: 47, models: [15700] },
  'Audi|A8': { make: 47, models: [752] },
  'Audi|Q3': { make: 47, models: [13400] },
  'Audi|Q5': { make: 47, models: [13314] },
  'Audi|Q7': { make: 47, models: [757] },
  'Audi|Q8': { make: 47, models: [16390] },
  'Audi|e-tron': { make: 47, models: [16389] },
  'Volkswagen|Golf': { make: 48, models: [773] },
  'Volkswagen|Jetta': { make: 48, models: [778] },
  'Volkswagen|Passat': { make: 48, models: [781] },
  'Volkswagen|Polo': { make: 48, models: [783] },
  'Volkswagen|Tiguan': { make: 48, models: [1688] },
  'Volkswagen|Touareg': { make: 48, models: [787] },
  'Volkswagen|Teramont': { make: 48, models: [16960] },
  'Volkswagen|T-Roc': { make: 48, models: [16434] },
  'Volkswagen|ID.4': { make: 48, models: [16526] },
  'Volkswagen|Arteon': { make: 48, models: [16674] },
  'Skoda|Octavia': { make: 249, models: [2362] },
  'Skoda|Superb': { make: 249, models: [2366] },
  'Skoda|Kodiaq': { make: 249, models: [16426] },
  'Skoda|Karoq': { make: 249, models: [16425] },
  'Skoda|Kamiq': { make: 249, models: [16424] },
  'Skoda|Fabia': { make: 249, models: [2359] },
  'Porsche|911': { make: 54, models: [860] },
  'Porsche|Cayenne': { make: 54, models: [865] },
  'Porsche|Macan': { make: 54, models: [16417] },
  'Porsche|Panamera': { make: 54, models: [16444] },
  'Porsche|Taycan': { make: 54, models: [17204] },
  'Land Rover|Range Rover': { make: 52, models: [847] },
  'Land Rover|Range Rover Sport': { make: 52, models: [848] },
  'Land Rover|Range Rover Velar': { make: 52, models: [16085] },
  'Land Rover|Range Rover Evoque': { make: 52, models: [13996] },
  'Land Rover|Defender': { make: 52, models: [842] },
  'Land Rover|Discovery': { make: 52, models: [843] },
  'Land Rover|Discovery Sport': { make: 52, models: [16084] },
  'Volvo|XC40': { make: 57, models: [16436] },
  'Volvo|XC60': { make: 57, models: [13311] },
  'Volvo|XC90': { make: 57, models: [885] },
  'Volvo|S90': { make: 57, models: [879] },
  'Tesla|Model 3': { make: 745, models: [16507] },
  'Tesla|Model Y': { make: 745, models: [16506] },
  'Tesla|Model S': { make: 745, models: [16074] },
  'Tesla|Model X': { make: 745, models: [16523] },
  'Jeep|Grand Cherokee': { make: 205, models: [1165] },
  'Jeep|Wrangler': { make: 205, models: [1173] },
  'Jeep|Compass': { make: 205, models: [1164] },
  'Ford|Explorer': { make: 50, models: [806] },
  'Ford|Kuga': { make: 50, models: [13485] },
  'Ford|Ranger': { make: 50, models: [1559] },
  'Ford|Transit': { make: 50, models: [1566] },
  'BYD|Seal': { make: 383, models: [17129] },
  'BYD|Atto 3': { make: 383, models: [17210] },
  'BYD|Tang': { make: 383, models: [16938] },
  'Geely|Coolray': { make: 350, models: [16973] },
  'Geely|Tugella': { make: 350, models: [16971] },
  'Changan|UNI-K': { make: 796, models: [16980] },
  'Changan|UNI-V': { make: 796, models: [16981] },
  'Changan|UNI-T': { make: 796, models: [16982] },
  'Haval|H6': { make: 797, models: [16984] },
  'Haval|M6': { make: 797, models: [17862] },
  'Li Auto|L7': { make: 792, models: [16964] },
  'Li Auto|L8': { make: 792, models: [16965] },
  'Li Auto|L9': { make: 792, models: [16966] },
};

export const LIST_URL = (make, model, page = 1) => `${BASE}/stocklist/make=${make}/model=${model}/${page > 1 ? `page=${page}/` : ''}sortkey=e/`;

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

// Списки всех подмоделей; если не открылся ни один — ошибка, а не «найдено 0».
async function fetchLists(m, brand, model, page = 1) {
  const list = [];
  let fails = 0, last;
  for (const id of m.models) {
    try {
      list.push(...parseList(await get(LIST_URL(m.make, id, page), { timeout: 45_000 }), brand, model));
    } catch (e) {
      fails++; last = e;
      console.warn(`[beforward] ${brand} ${model} (${id}): ${e.message}`);
    }
    await sleep(800);
  }
  if (fails && fails === m.models.length) throw last;
  const seen = new Set();
  return list.filter((l) => !seen.has(l.uid) && seen.add(l.uid)).sort((a, b) => b._sort - a._sort);
}

export async function listPage(brand, model, page) {
  const m = MODELS[`${brand}|${model}`];
  return m ? fetchLists(m, brand, model, page) : [];
}

export async function search(brand, model, { rates, isKnown, onList, deadline } = {}) { // eslint-disable-line no-unused-vars
  const m = MODELS[`${brand}|${model}`];
  if (!m) return [];
  const all = await fetchLists(m, brand, model);
  if (onList) onList(all);
  const list = all.slice(0, DETAIL_TOP);
  const out = [];
  for (const l of list) {
    delete l._sort;
    if (timeUp(deadline)) break;
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
      l._partial = true;
    }
    out.push(l);
    await sleep(800);
  }
  return out;
}
