// K Car (Корея, kcar.com): внутренний API сайта.
// Список: POST https://api.kcar.com/bc/search/list/drct, тело {enc: AES-128-CBC(JSON)} —
// ключ и вектор зашиты в бандле сайта (setEncDef), без шифрования API отвечает пустым списком.
// Карточка: GET https://api.kcar.com/bc/car-info-detail-of-ng?i_sCarCd=EC… (все фото и текст продавца).
// Цены в 만원 (10 000 вон), переводим в воны.
import crypto from 'node:crypto';
import { fetch, EnvHttpProxyAgent } from 'undici';
import { get, sleep, timeUp, UA, DETAIL_TOP } from '../http.js';

const API = 'https://api.kcar.com';
const CARD_URL = (id) => `https://www.kcar.com/bc/detail/carInfoDtl?i_sCarCd=${id}`;
const MAX_PHOTOS = 60;
const KEY = Buffer.from('SKFJ2424DasfaJRI');
const IV = Buffer.from('sfq241sf3dscs321');

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.kcar.com',
  Referer: 'https://www.kcar.com/',
};

// 'Brand|Model' -> [код производителя, код группы моделей] (api.kcar.com/bc/search/group/mnuftr и /modelGrp).
export const MODELS = {
  'Hyundai|Staria': ['001', '063'],
  'Hyundai|Grand Starex': ['001', '015'], // 스타렉스 — сюда входят Grand Starex
  'Hyundai|Palisade': ['001', '058'],
  'Hyundai|Santa Fe': ['001', '017'],
  'Hyundai|Tucson': ['001', '032'],
  'Hyundai|Sonata': ['001', '018'],
  'Hyundai|Grandeur': ['001', '004'],
  'Hyundai|Avante': ['001', '019'],
  'Hyundai|Kona': ['001', '055'],
  'Kia|Carnival': ['002', '036'],
  'Kia|Sorento': ['002', '027'],
  'Kia|Sportage': ['002', '025'],
  'Kia|K5': ['002', '001'],
  'Kia|K8': ['002', '066'],
  'Kia|Mohave': ['002', '015'],
  'Kia|Seltos': ['002', '065'],
  'Kia|Ray': ['002', '058'],
  'Genesis|GV80': ['007', '005'],
  'Genesis|GV70': ['007', '006'],
  'Genesis|G80': ['007', '002'],
  'Toyota|Alphard': ['031', '050'],
  'Toyota|Camry': ['031', '001'],
  'Toyota|RAV4': ['031', '008'],
  'Lexus|RX': ['035', '005'],
  'Lexus|ES': ['035', '001'],
  'Honda|Odyssey': ['027', '007'],
  'Honda|CR-V': ['027', '001'],
  'BYD|Dolphin': ['093', '005'],
  'Mercedes-Benz|E-Class': ['013', '004'],
  'Mercedes-Benz|S-Class': ['013', '005'],
  'BMW|5 Series': ['012', '003'],
  'BMW|X5': ['012', '008'],
  // Добавлено 2026-11-26 по /bc/search/group/mnuftr и /modelGrp.
  'Hyundai|Casper': ['001', '067'],
  'Hyundai|Venue': ['001', '059'],
  'Hyundai|Maxcruz': ['001', '050'],
  'Hyundai|i30': ['001', '001'],
  'Hyundai|Nexo': ['001', '056'],
  'Kia|K9': ['002', '059'],
  'Kia|K3': ['002', '060'],
  'Kia|Morning': ['002', '013'],
  'Kia|Niro': ['002', '061'],
  'Kia|EV6': ['002', '067'],
  'Kia|EV9': ['002', '068'],
  'Kia|Stinger': ['002', '062'],
  'Genesis|GV60': ['007', '007'],
  'Genesis|G90': ['007', '004'],
  'Genesis|G70': ['007', '003'],
  'Toyota|Land Cruiser': ['031', '006'],
  'Toyota|Highlander': ['031', '035'],
  'Toyota|Crown': ['031', '020'],
  'Toyota|Corolla': ['031', '005'],
  'Toyota|Prius': ['031', '022'],
  'Toyota|Sienna': ['031', '029'],
  'Lexus|LX': ['035', '008'],
  'Lexus|NX': ['035', '013'],
  'Lexus|LS': ['035', '004'],
  'Lexus|UX': ['035', '016'],
  'Lexus|IS': ['035', '003'],
  'Lexus|LM': ['035', '018'],
  'Nissan|X-Trail': ['033', '047'],
  'Nissan|Qashqai': ['033', '043'],
  'Nissan|Murano': ['033', '024'],
  'Nissan|Pathfinder': ['033', '007'],
  'Nissan|Juke': ['033', '040'],
  'Nissan|Leaf': ['033', '046'],
  'Nissan|Altima': ['033', '005'],
  'Mitsubishi|Outlander': ['030', '011'],
  'Mitsubishi|Pajero': ['030', '006'],
  'Suzuki|Jimny': ['037', '012'],
  'Suzuki|Swift': ['037', '005'],
  'Suzuki|Hustler': ['037', '009'],
  'Subaru|Forester': ['052', '003'],
  'Subaru|Outback': ['052', '004'],
  'Subaru|Legacy': ['052', '005'],
  'Subaru|Impreza': ['052', '002'],
  'Honda|HR-V': ['027', '028'],
  'Honda|Accord': ['027', '003'],
  'Honda|Civic': ['027', '004'],
  'Honda|Pilot': ['027', '019'],
  'Honda|Fit': ['027', '013'],
  'Mazda|CX-5': ['029', '019'],
  'Mazda|CX-9': ['029', '015'],
  'Mazda|3': ['029', '018'],
  'Mazda|6': ['029', '013'],
  'Mercedes-Benz|A-Class': ['013', '029'],
  'Mercedes-Benz|C-Class': ['013', '001'],
  'Mercedes-Benz|CLA': ['013', '031'],
  'Mercedes-Benz|CLS': ['013', '003'],
  'Mercedes-Benz|G-Class': ['013', '013'],
  'Mercedes-Benz|GLA': ['013', '032'],
  'Mercedes-Benz|GLB': ['013', '038'],
  'Mercedes-Benz|GLC': ['013', '034'],
  'Mercedes-Benz|GLE': ['013', '035'],
  'Mercedes-Benz|GLS': ['013', '037'],
  'Mercedes-Benz|ML': ['013', '008'],
  'Mercedes-Benz|V-Class': ['013', '016'],
  'Mercedes-Benz|EQE': ['013', '044'],
  'Mercedes-Benz|EQS': ['013', '041'],
  'Mercedes-Benz|AMG GT': ['013', '033'],
  'Mercedes-Benz|Sprinter': ['013', '030'],
  'BMW|3 Series': ['012', '002'],
  'BMW|7 Series': ['012', '005'],
  'BMW|X1': ['012', '014'],
  'BMW|X3': ['012', '007'],
  'BMW|X4': ['012', '020'],
  'BMW|X6': ['012', '011'],
  'BMW|X7': ['012', '032'],
  'BMW|iX': ['012', '037'],
  'Audi|A3': ['011', '001'],
  'Audi|A4': ['011', '002'],
  'Audi|A5': ['011', '021'],
  'Audi|A6': ['011', '004'],
  'Audi|A7': ['011', '025'],
  'Audi|A8': ['011', '003'],
  'Audi|Q3': ['011', '026'],
  'Audi|Q5': ['011', '020'],
  'Audi|Q7': ['011', '013'],
  'Audi|Q8': ['011', '034'],
  'Audi|e-tron': ['011', '036'],
  'Volkswagen|Golf': ['014', '007'],
  'Volkswagen|Jetta': ['014', '004'],
  'Volkswagen|Passat': ['014', '006'],
  'Volkswagen|Polo': ['014', '015'],
  'Volkswagen|Tiguan': ['014', '002'],
  'Volkswagen|Touareg': ['014', '005'],
  'Volkswagen|Teramont': ['014', '021'],
  'Volkswagen|T-Roc': ['014', '020'],
  'Volkswagen|Arteon': ['014', '019'],
  'Porsche|911': ['015', '001'],
  'Porsche|Cayenne': ['015', '002'],
  'Porsche|Macan': ['015', '013'],
  'Porsche|Panamera': ['015', '004'],
  'Porsche|Taycan': ['015', '016'],
  'Land Rover|Range Rover': ['020', '003'],
  'Land Rover|Range Rover Sport': ['020', '006'],
  'Land Rover|Range Rover Velar': ['020', '011'],
  'Land Rover|Range Rover Evoque': ['020', '008'],
  'Land Rover|Defender': ['020', '005'],
  'Land Rover|Discovery': ['020', '001'],
  'Land Rover|Discovery Sport': ['020', '010'],
  'Volvo|XC40': ['017', '023'],
  'Volvo|XC60': ['017', '016'],
  'Volvo|XC90': ['017', '010'],
  'Volvo|S90': ['017', '015'],
  'Tesla|Model 3': ['087', '003'],
  'Tesla|Model S': ['087', '001'],
  'Tesla|Model X': ['087', '002'],
  'Tesla|Model Y': ['087', '004'],
  'Jeep|Wrangler': ['083', '001'],
  'Jeep|Compass': ['083', '005'],
  'Ford|Explorer': ['024', '007'],
  'Ford|Kuga': ['024', '028'],
  'Ford|Ranger': ['024', '023'],
  'Ford|Transit': ['024', '029'],
  'BYD|Seal': ['093', '003'],
  'BYD|Atto 3': ['093', '001'],
  'SsangYong|Rexton': ['004', '003'],
  'SsangYong|Korando': ['004', '011'],
  'SsangYong|Torres': ['004', '013'],
  'SsangYong|Tivoli': ['004', '012'],
};

const FUEL = {
  '가솔린': 'petrol', '디젤': 'diesel', 'LPG': 'lpg', 'LPG(일반인 구입)': 'lpg', '전기': 'ev',
  '가솔린+전기': 'hybrid', '디젤+전기': 'hybrid', 'LPG+전기': 'hybrid', '하이브리드': 'hybrid',
};
const TRANSMISSION = { '오토': 'АКПП', '수동': 'МКПП', CVT: 'вариатор', '세미오토': 'робот' };
// drvgYn в списке: 1 — передний, 4 — полный; в карточке drvgYnNm словами.
const DRIVE_CODE = { 1: 'передний', 2: 'задний', 4: 'полный' };
const DRIVE_NAME = { '전륜': 'передний', '후륜': 'задний', '4륜': 'полный', AWD: 'полный', '4WD': 'полный' };
const REGION = {
  '서울': 'Сеул', '경기/인천': 'Кёнгидо', '경기': 'Кёнгидо', '인천': 'Инчхон', '부산': 'Пусан', '대구': 'Тэгу',
  '대전': 'Тэджон', '광주': 'Кванджу', '울산': 'Ульсан', '세종': 'Сечжон', '강원': 'Канвондо',
  '충북': 'Чхунчхон-Пукто', '충남': 'Чхунчхон-Намдо', '전북': 'Чолла-Пукто', '전남': 'Чолла-Намдо',
  '경북': 'Кёнсан-Пукто', '경남': 'Кёнсан-Намдо', '제주': 'Чеджу',
};

export function encParam(obj) {
  const c = crypto.createCipheriv('aes-128-cbc', KEY, IV);
  return Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]).toString('base64');
}

const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };
const where = (rgn) => (rgn && REGION[rgn] ? `${REGION[rgn]}, Корея` : 'Корея');

function engineLine(cc, hp) {
  const parts = [];
  if (cc) parts.push(`${(cc / 1000).toFixed(1)} л`);
  if (hp) parts.push(`${hp} л.с.`);
  return parts.length ? parts.join(', ') : null;
}

// Сайт хранит тексты с HTML-сущностями и <br>.
export function plain(s) {
  return String(s || '')
    .replace(/<\/?br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&rarr;/g, '→').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function mapRow(r, brand, model) {
  const id = String(r.carCd || '').trim();
  if (!id) return null;
  const mfg = String(r.mfgDt || '');
  const year = num(r.prdcnYr) || (mfg.length >= 4 ? Number(mfg.slice(0, 4)) : null);
  const month = mfg.length === 6 ? Number(mfg.slice(4)) || null : null;
  const man = num(r.prc);
  const price = man ? man * 10_000 : null;
  const photo = r.lsizeImgPath || r.msizeImgPath || r.ssizeImgPath;
  return {
    uid: `kcar:${id}`,
    source: 'kcar',
    source_label: 'K Car',
    region: 'KR',
    url: CARD_URL(id),
    brand, model,
    trim: [r.grdNm, r.grdDtlNm].map((s) => String(s || '').trim()).filter(Boolean).join(' ') || null,
    year, month,
    mileage_km: num(r.milg),
    fuel: FUEL[r.fuelNm] || null,
    transmission: TRANSMISSION[r.trnsmsnNm] || null,
    drive: DRIVE_CODE[r.drvgYn] || null,
    engine: engineLine(num(r.engdispmnt), null),
    seats: num(r.pasngrCnt),
    price,
    currency: price ? 'KRW' : null,
    price_note: 'цена в Корее',
    location: where(r.cntrRgnNm),
    photos: photo ? [photo] : [],
    desc_orig: r.simcDesc ? plain(r.simcDesc) : null,
  };
}

// json — ответ /bc/search/list/drct.
export function parseList(json, brand, model) {
  const rows = (json && json.data && json.data.rows) || [];
  return rows.map((r) => mapRow(r, brand, model)).filter(Boolean);
}

// json — ответ /bc/car-info-detail-of-ng.
export function parseDetail(json) {
  const d = (json && json.data) || {};
  const rvo = d.rvo || {};
  const list = (d.photoList && d.photoList.length ? d.photoList
    : [...(d.outerPhotoList || []), ...(d.innerPhotoList || []), ...(d.optionPhotoList || [])]);
  const photos = [...new Set(list
    // В список вставлены рекламные баннеры (/ucms/*.png без carCd) — отбрасываем.
    .filter((p) => p && p.elanPath && p.carCd && !/\/ucms\//.test(p.elanPath))
    .sort((a, b) => Number(a.sortOrdr) - Number(b.sortOrdr))
    .map((p) => String(p.elanPath).replace(/^http:/, 'https:')))].slice(0, MAX_PHOTOS);
  const out = { photos };
  const desc = plain(rvo.carDtlDesc || rvo.keyPntCnts || rvo.simcDesc);
  if (desc) out.desc_orig = desc.slice(0, 4000);
  if (FUEL[rvo.fuelTypecdNm]) out.fuel = FUEL[rvo.fuelTypecdNm];
  if (TRANSMISSION[rvo.trnsmsncdNm]) out.transmission = TRANSMISSION[rvo.trnsmsncdNm];
  if (DRIVE_NAME[rvo.drvgYnNm]) out.drive = DRIVE_NAME[rvo.drvgYnNm];
  const eng = engineLine(num(rvo.engdispmnt), num(rvo.hrspow));
  if (eng) out.engine = eng;
  if (num(rvo.pasngrCnt)) out.seats = num(rvo.pasngrCnt);
  const trim = [rvo.grdNm, rvo.grdDtlNm].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
  if (trim) out.trim = trim;
  if (rvo.centerRegionnm && REGION[rvo.centerRegionnm]) out.location = where(rvo.centerRegionnm);
  return out;
}

let dispatcher;
function proxyDispatcher() {
  if (!(process.env.HTTPS_PROXY || process.env.https_proxy)) return undefined;
  return (dispatcher ||= new EnvHttpProxyAgent());
}

// http.js умеет только GET, а список K Car отдаёт только на POST.
async function postJson(url, body, { retries = 2, timeout = 30_000 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8', 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify(body),
        dispatcher: proxyDispatcher(),
        signal: AbortSignal.timeout(timeout),
      });
      if (r.status === 429 || r.status >= 500) { last = new Error(`HTTP ${r.status}`); await sleep(3000 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
      if (/HTTP 4\d\d/.test(e.message) && !/429/.test(e.message)) throw e;
      await sleep(1500 * (i + 1));
    }
  }
  throw last;
}

export function listBody(codes, limit = 30) {
  const [mnuftr, modelGrp] = codes;
  // car_cd растёт с поступлением машины, так что car_cd:desc — новые сверху.
  return { enc: encParam({ pageno: 1, limit, wr_eq_mnuftr_cd: mnuftr, wr_eq_model_grp_cd: modelGrp, orderFlag: true, orderBy: 'car_cd:desc' }) };
}

// Список берём длинным (API отдаёт до 300 за раз): все из него отмечаются «ещё продаются»,
// а карточки грузятся только у DETAIL_TOP самых новых.
export const LIST_LIMIT = 300;

export async function search(brand, model, { isKnown, onList, deadline } = {}) {
  const codes = MODELS[`${brand}|${model}`];
  if (!codes) return [];
  const json = await postJson(`${API}/bc/search/list/drct`, listBody(codes, LIST_LIMIT));
  const list = parseList(json, brand, model);
  if (onList) onList(list);
  const out = [];
  for (const l of list.slice(0, DETAIL_TOP)) {
    if (timeUp(deadline)) break;
    if (isKnown && isKnown(l)) continue;
    try {
      const id = l.uid.split(':')[1];
      const d = await get(`${API}/bc/car-info-detail-of-ng?i_sCarCd=${id}&i_sPassYn=N&bltbdKnd=CM050`, { headers: HEADERS, as: 'json' });
      const det = parseDetail(d);
      if (!det.photos.length) delete det.photos;
      Object.assign(l, det);
    } catch (e) {
      console.warn(`[kcar] карточка ${l.uid}: ${e.message}`);
      l._partial = true;
    }
    out.push(l);
    await sleep(700);
  }
  return out;
}
