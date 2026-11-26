// Encar (Корея): внутренний JSON-API поиска и карточки.
// Формат API не документирован. Разбор терпим к отсутствующим полям: при первом запуске
// смотрите в лог строки «[encar] <марка> <модель> -> N».
import { get } from '../http.js';

const LIST_URL = 'https://api.encar.com/search/car/list/general';
const DETAIL_URL = (id) => `https://api.encar.com/v1/readside/vehicle/${id}`;
const PHOTO_BASE = 'https://ci.encar.com/carpicture';
const CARD_URL = (id) => `https://fem.encar.com/cars/detail/${id}`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Referer: 'https://www.encar.com/',
  Accept: 'application/json, text/plain, */*',
};

const FUEL = {
  '디젤': 'diesel', '가솔린': 'petrol', '휘발유': 'petrol', 'LPG(일반인 구입)': 'lpg', LPG: 'lpg',
  '전기': 'ev', '가솔린+전기': 'hybrid', '디젤+전기': 'hybrid', '하이브리드': 'hybrid', 'LPG+전기': 'hybrid',
};
const TRANSMISSION = { '오토': 'АКПП', '수동': 'МКПП', CVT: 'вариатор', '세미오토': 'робот' };
const CITY = {
  '서울': 'Сеул', '경기': 'Кёнгидо', '인천': 'Инчхон', '부산': 'Пусан', '대구': 'Тэгу', '대전': 'Тэджон',
  '광주': 'Кванджу', '울산': 'Ульсан', '세종': 'Сечжон', '강원': 'Канвондо', '충북': 'Чхунчхон-Пукто',
  '충남': 'Чхунчхон-Намдо', '전북': 'Чолла-Пукто', '전남': 'Чолла-Намдо', '경북': 'Кёнсан-Пукто',
  '경남': 'Кёнсан-Намдо', '제주': 'Чеджу',
};


export function buildQuery(w) {
  const t = w.car_type || 'Y';
  return `(And.Hidden.N._.(C.CarType.${t}._.(C.Manufacturer.${w.ko_brand}._.ModelGroup.${w.ko_model}.)))`;
}

export const photoUrl = (p) => (p.startsWith('http') ? p : PHOTO_BASE + (p.startsWith('/') ? p : '/' + p));

// Encar отдаёт год как 202203.0 (год + месяц) или как 2022.
export function yearMonth(v) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n <= 0) return [null, null];
  if (n > 100000) return [Math.trunc(n / 100), n % 100 || null];
  return [n, null];
}

function ts(v) {
  if (!v) return null;
  const t = Date.parse(String(v).replace(' ', 'T'));
  return Number.isFinite(t) ? Math.trunc(t / 1000) : null;
}

export function mapListItem(it, w) {
  const id = String(it.Id ?? '').trim();
  if (!id) return null;
  // FormYear — модельный год (так его указывают продавцы), Year — дата регистрации 202409.
  let [year, month] = yearMonth(it.Year);
  if (it.FormYear) year = Number(it.FormYear);
  const price = it.Price ? Number(it.Price) * 10_000 : null; // Price в 만원 (10 000 вон)
  let photos = (it.Photos || []).map((p) => p && p.location).filter(Boolean).map(photoUrl);
  if (!photos.length && it.Photo) photos = [photoUrl(it.Photo + '001.jpg')];
  return {
    uid: `encar:${id}`,
    source: 'encar',
    source_label: 'Encar',
    region: 'KR',
    url: CARD_URL(id),
    brand: w.brand,
    model: w.model,
    trim: [it.Badge, it.BadgeDetail].filter(Boolean).join(' ') || null,
    year, month,
    mileage_km: it.Mileage != null ? Math.round(Number(it.Mileage)) : null,
    fuel: FUEL[it.FuelType] || null,
    transmission: TRANSMISSION[it.Transmission] || null,
    price,
    currency: price ? 'KRW' : null,
    location: CITY[it.OfficeCityState] || it.OfficeCityState || null,
    photos: photos.slice(0, 10),
    posted_at: ts(it.ModifiedDate),
  };
}

// Дополняет объявление данными карточки: все фото, описание, места, объём.
export function enrichFromDetail(l, d) {
  // Сначала кузов снаружи, потом салон и опции; внутри группы по номеру кадра.
  const rank = { OUTER: 0, INNER: 1, OPTION: 2 };
  const photos = (d.photos || []).filter((p) => p && p.path)
    .sort((a, b) => (rank[a.type] ?? 3) - (rank[b.type] ?? 3) || String(a.code).localeCompare(String(b.code)))
    .map((p) => photoUrl(p.path));
  if (photos.length) l.photos = photos.slice(0, 10);
  const text = d.contents && d.contents.text;
  if (text) l.desc_orig = String(text).trim().slice(0, 4000);
  const spec = d.spec || {};
  if (spec.transmissionName && !l.transmission) l.transmission = TRANSMISSION[spec.transmissionName] || null;
  if (spec.fuelName && !l.fuel) l.fuel = FUEL[spec.fuelName] || null;
  if (spec.seatCount) l.seats = Number(spec.seatCount);
  if (spec.displacement) l.engine = `${(Number(spec.displacement) / 1000).toFixed(1)} л`;
  if (spec.mileage && !l.mileage_km) l.mileage_km = Number(spec.mileage);
  const cat = d.category || {};
  const en = [cat.gradeEnglishName, cat.gradeDetailEnglishName].filter(Boolean).join(' ');
  if (en) l.trim = en; // английская комплектация понятнее корейской
  const adv = d.advertisement || {};
  if (adv.price && !l.price) { l.price = Number(adv.price) * 10_000; l.currency = 'KRW'; }
}

const getJson = (url) => get(url, { headers: HEADERS, proxy: process.env.ENCAR_PROXY || undefined, as: 'json' });

export async function fetchWatch(w, limit = 40) {
  const q = encodeURIComponent(buildQuery(w));
  const sr = encodeURIComponent(`|ModifiedDate|0|${limit}`);
  try {
    const data = await getJson(`${LIST_URL}?count=true&q=${q}&sr=${sr}`);
    const items = (data.SearchResults || []).filter((it) => it.SellType !== '리스' && it.SellType !== '렌트');
    console.log(`[encar] ${w.brand} ${w.model} -> ${items.length} (на сайте всего ${data.Count ?? '?'})`);
    return items.map((it) => mapListItem(it, w)).filter(Boolean);
  } catch (e) {
    console.warn(`[encar] ${w.brand} ${w.model}: ${e.message}`);
    return [];
  }
}

export async function fetchDetail(l) {
  if (!l) return;
  try {
    enrichFromDetail(l, await getJson(DETAIL_URL(l.uid.split(':')[1])));
  } catch (e) {
    console.warn(`[encar] карточка ${l.uid}: ${e.message}`);
  }
}

export function specsLine(l) {
  return [l.year, l.mileage_km != null && `${l.mileage_km} км`, l.fuel, l.transmission, l.engine, l.trim].filter(Boolean).join(', ');
}
