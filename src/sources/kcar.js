// K Car (Корея, kcar.com): внутренний API сайта.
// Список: POST https://api.kcar.com/bc/search/list/drct, тело {enc: AES-128-CBC(JSON)} —
// ключ и вектор зашиты в бандле сайта (setEncDef), без шифрования API отвечает пустым списком.
// Карточка: GET https://api.kcar.com/bc/car-info-detail-of-ng?i_sCarCd=EC… (все фото и текст продавца).
// Цены в 만원 (10 000 вон), переводим в воны.
import crypto from 'node:crypto';
import { fetch, EnvHttpProxyAgent } from 'undici';
import { get, sleep, UA } from '../http.js';

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

export async function search(brand, model, { isKnown } = {}) {
  const codes = MODELS[`${brand}|${model}`];
  if (!codes) return [];
  const json = await postJson(`${API}/bc/search/list/drct`, listBody(codes));
  const list = parseList(json, brand, model);
  const out = [];
  for (const l of list) {
    if (isKnown && isKnown(l)) continue;
    try {
      const id = l.uid.split(':')[1];
      const d = await get(`${API}/bc/car-info-detail-of-ng?i_sCarCd=${id}&i_sPassYn=N&bltbdKnd=CM050`, { headers: HEADERS, as: 'json' });
      const det = parseDetail(d);
      if (!det.photos.length) delete det.photos;
      Object.assign(l, det);
    } catch (e) {
      console.warn(`[kcar] карточка ${l.uid}: ${e.message}`);
    }
    out.push(l);
    await sleep(700);
  }
  return out;
}
