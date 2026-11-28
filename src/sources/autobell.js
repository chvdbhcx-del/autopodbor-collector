// Autobell (Hyundai Glovis, Корея): JSON-API сайта autobell.co.kr (без www — www отдаёт /main на любой адрес).
// Выдача: POST /api/buycar/selectGeneralList.do с объектом условий поиска (как в Redux сайта).
// Карточка: GET selectProductDetailCarPhoto / CarContent / CarOption ?dlrPrdId=...
import { fetch, EnvHttpProxyAgent } from 'undici';
import { get, sleep, timeUp, UA } from '../http.js';

const BASE = 'https://autobell.co.kr';
const API = `${BASE}/api/buycar`;
const CDN = 'https://cdn.autobell.co.kr';
const CARD_URL = (id) => `${BASE}/buycar/buyCarDetailType?dlrPrdId=${id}`;
const MAX_PHOTOS = 60;

// crMnfcCd / crMdlCd / crDtlMdlCd (поколения) — из selectCarFilterList.do.
const B = { Hyundai: '5', Kia: '2', Genesis: '146', Toyota: '77', Lexus: '78', Honda: '125', BYD: '287', 'Mercedes-Benz': '68', BMW: '67' };
const M = (brand, mdl, dtl = []) => ({ mnfc: B[brand], mdl, dtl });
export const MODELS = {
  'Hyundai|Staria': M('Hyundai', '1421'),
  'Hyundai|Grand Starex': M('Hyundai', '108', ['2631', '14']), // «스타렉스»: только поколения Grand Starex
  'Hyundai|Palisade': M('Hyundai', '1207'),
  'Hyundai|Santa Fe': M('Hyundai', '110'),
  'Hyundai|Tucson': M('Hyundai', '124'),
  'Hyundai|Sonata': M('Hyundai', '111'),
  'Hyundai|Grandeur': M('Hyundai', '96'),
  'Hyundai|Avante': M('Hyundai', '112'),
  'Hyundai|Kona': M('Hyundai', '1167'),
  'Kia|Carnival': M('Kia', '64'),
  'Kia|Sorento': M('Kia', '56'),
  'Kia|Sportage': M('Kia', '54'),
  'Kia|K5': M('Kia', '38'),
  'Kia|K8': M('Kia', '1420'),
  'Kia|Mohave': M('Kia', '47'),
  'Kia|Seltos': M('Kia', '1244'),
  'Kia|Ray': M('Kia', '42'),
  'Genesis|GV80': M('Genesis', '1272'),
  'Genesis|GV70': M('Genesis', '1389'),
  'Genesis|G80': M('Genesis', '1171'),
  'Toyota|Alphard': M('Toyota', '326'),
  'Toyota|Camry': M('Toyota', '330'),
  'Toyota|RAV4': M('Toyota', '308'),
  'Lexus|RX': M('Lexus', '351'),
  'Lexus|ES': M('Lexus', '343'),
  'Honda|Odyssey': M('Honda', '713'),
  'Honda|CR-V': M('Honda', '702'),
  'BYD|Dolphin': M('BYD', '1863'),
  'Mercedes-Benz|E-Class': M('Mercedes-Benz', '153'),
  'Mercedes-Benz|S-Class': M('Mercedes-Benz', '169'),
  'BMW|5 Series': M('BMW', '135'),
  'BMW|X5': M('BMW', '141', ['3817', '2708', '318', '1349', '1348']), // «X시리즈»: поколения X5 (G65, G05, F15, E70, E53)
  // Добавлено 2026-11-26 по selectCarFilterList.do
  'Kia|K9': { mnfc: '2', mdl: '40', dtl: [] },
  'Kia|K3': { mnfc: '2', mdl: '37', dtl: [] },
  'Kia|Morning': { mnfc: '2', mdl: '46', dtl: [] },
  'Kia|Niro': { mnfc: '2', mdl: '41', dtl: [] },
  'Kia|EV6': { mnfc: '2', mdl: '1455', dtl: [] },
  'Kia|EV9': { mnfc: '2', mdl: '1701', dtl: [] },
  'Kia|Stinger': { mnfc: '2', mdl: '1160', dtl: [] },
  'Hyundai|Ioniq 5': { mnfc: '5', mdl: '1594', dtl: [] },
  'Hyundai|Ioniq 6': { mnfc: '5', mdl: '1595', dtl: [] },
  'Hyundai|Casper': { mnfc: '5', mdl: '1467', dtl: [] },
  'Hyundai|Venue': { mnfc: '5', mdl: '1243', dtl: [] },
  'Hyundai|Maxcruz': { mnfc: '5', mdl: '102', dtl: [] },
  'Hyundai|i30': { mnfc: '5', mdl: '93', dtl: [] },
  'Hyundai|Nexo': { mnfc: '5', mdl: '1185', dtl: [] },
  'Genesis|GV60': { mnfc: '146', mdl: '1469', dtl: [] },
  'Genesis|G90': { mnfc: '146', mdl: '1205', dtl: [] },
  'Genesis|G70': { mnfc: '146', mdl: '1172', dtl: [] },
  'SsangYong|Rexton': { mnfc: '4', mdl: '83', dtl: [] },
  'SsangYong|Korando': { mnfc: '4', mdl: '90', dtl: [] },
  'SsangYong|Torres': { mnfc: '4', mdl: '1573', dtl: [] },
  'SsangYong|Tivoli': { mnfc: '4', mdl: '91', dtl: [] },
  'BMW|3 Series': { mnfc: '67', mdl: '133', dtl: [] },
  'BMW|7 Series': { mnfc: '67', mdl: '137', dtl: [] },
  'Audi|A3': { mnfc: '70', mdl: '177', dtl: [] },
  'Audi|A4': { mnfc: '70', mdl: '178', dtl: [] },
  'Audi|A5': { mnfc: '70', mdl: '179', dtl: [] },
  'Audi|A6': { mnfc: '70', mdl: '180', dtl: [] },
  'Audi|A7': { mnfc: '70', mdl: '181', dtl: [] },
  'Audi|A8': { mnfc: '70', mdl: '182', dtl: [] },
  'Audi|Q3': { mnfc: '70', mdl: '183', dtl: [] },
  'Audi|Q5': { mnfc: '70', mdl: '184', dtl: [] },
  'Audi|Q7': { mnfc: '70', mdl: '185', dtl: [] },
  'Audi|Q8': { mnfc: '70', mdl: '1281', dtl: [] },
  'Audi|e-tron': { mnfc: '70', mdl: '1354', dtl: [] },
  'Land Rover|Range Rover': { mnfc: '82', mdl: '385', dtl: [] },
  'Land Rover|Range Rover Sport': { mnfc: '82', mdl: '386', dtl: [] },
  'Land Rover|Range Rover Velar': { mnfc: '82', mdl: '1158', dtl: [] },
  'Land Rover|Range Rover Evoque': { mnfc: '82', mdl: '387', dtl: [] },
  'Land Rover|Defender': { mnfc: '82', mdl: '384', dtl: [] },
  'Land Rover|Discovery': { mnfc: '82', mdl: '382', dtl: [] },
  'Land Rover|Discovery Sport': { mnfc: '82', mdl: '383', dtl: [] },
  'Volkswagen|Golf': { mnfc: '71', mdl: '204', dtl: [] },
  'Volkswagen|Jetta': { mnfc: '71', mdl: '209', dtl: [] },
  'Volkswagen|Passat': { mnfc: '71', mdl: '212', dtl: [] },
  'Volkswagen|Tiguan': { mnfc: '71', mdl: '211', dtl: [] },
  'Volkswagen|Touareg': { mnfc: '71', mdl: '210', dtl: [] },
  'Volkswagen|T-Roc': { mnfc: '71', mdl: '1404', dtl: [] },
  'Volkswagen|ID.4': { mnfc: '71', mdl: '1615', dtl: [] },
  'Volkswagen|Arteon': { mnfc: '71', mdl: '1173', dtl: [] },
  'Volvo|XC40': { mnfc: '74', mdl: '1198', dtl: [] },
  'Volvo|XC60': { mnfc: '74', mdl: '256', dtl: [] },
  'Volvo|XC90': { mnfc: '74', mdl: '258', dtl: [] },
  'Volvo|S90': { mnfc: '74', mdl: '251', dtl: [] },
  'Toyota|Crown': { mnfc: '77', mdl: '332', dtl: [] },
  'Toyota|Prius': { mnfc: '77', mdl: '338', dtl: [] },
  'Toyota|Sienna': { mnfc: '77', mdl: '323', dtl: [] },
  'Porsche|911': { mnfc: '120', mdl: '670', dtl: [] },
  'Porsche|Cayenne': { mnfc: '120', mdl: '678', dtl: [] },
  'Porsche|Macan': { mnfc: '120', mdl: '674', dtl: [] },
  'Porsche|Panamera': { mnfc: '120', mdl: '679', dtl: [] },
  'Porsche|Taycan': { mnfc: '120', mdl: '1388', dtl: [] },
  'Honda|HR-V': { mnfc: '125', mdl: '1130', dtl: [] },
  'Honda|Pilot': { mnfc: '125', mdl: '719', dtl: [] },
  'Lexus|NX': { mnfc: '78', mdl: '349', dtl: [] },
  'Lexus|UX': { mnfc: '78', mdl: '1224', dtl: [] },
  'Nissan|Murano': { mnfc: '76', mdl: '279', dtl: [] },
  'Nissan|Leaf': { mnfc: '76', mdl: '275', dtl: [] },
  'Nissan|Altima': { mnfc: '76', mdl: '289', dtl: [] },
  'Mercedes-Benz|A-Class': { mnfc: '68', mdl: '146', dtl: [] },
  'Mercedes-Benz|C-Class': { mnfc: '68', mdl: '152', dtl: [] },
  'Mercedes-Benz|CLA': { mnfc: '68', mdl: '148', dtl: [] },
  'Mercedes-Benz|CLS': { mnfc: '68', mdl: '150', dtl: [] },
  'Mercedes-Benz|G-Class': { mnfc: '68', mdl: '160', dtl: [] },
  'Mercedes-Benz|GLA': { mnfc: '68', mdl: '154', dtl: [] },
  'Mercedes-Benz|GLB': { mnfc: '68', mdl: '1365', dtl: [] },
  'Mercedes-Benz|GLC': { mnfc: '68', mdl: '155', dtl: [] },
  'Mercedes-Benz|GLE': { mnfc: '68', mdl: '156', dtl: [] },
  'Mercedes-Benz|GLS': { mnfc: '68', mdl: '158', dtl: [] },
  'Mercedes-Benz|EQS': { mnfc: '68', mdl: '1479', dtl: [] },
  'Mercedes-Benz|AMG GT': { mnfc: '68', mdl: '145', dtl: [] },
};

const CITY = {
  '서울': 'Сеул', '경기': 'Кёнгидо', '인천': 'Инчхон', '부산': 'Пусан', '대구': 'Тэгу', '대전': 'Тэджон',
  '광주': 'Кванджу', '울산': 'Ульсан', '세종': 'Сечжон', '강원': 'Канвондо', '충북': 'Чхунчхон-Пукто',
  '충남': 'Чхунчхон-Намдо', '전북': 'Чолла-Пукто', '전남': 'Чолла-Намдо', '경북': 'Кёнсан-Пукто',
  '경남': 'Кёнсан-Намдо', '제주': 'Чеджу',
};

export function fuelOf(s) {
  s = String(s || '');
  if (!s) return null;
  if (/하이브리드|\+전기|HEV/i.test(s)) return 'hybrid';
  if (/전기|EV/i.test(s)) return 'ev';
  if (/LPG|LPi/i.test(s)) return 'lpg';
  if (/디젤|경유/.test(s)) return 'diesel';
  if (/가솔린|휘발유/.test(s)) return 'petrol';
  return null;
}
export function gearOf(s) {
  s = String(s || '');
  if (/CVT|무단/i.test(s)) return 'вариатор';
  if (/세미|DCT|듀얼/i.test(s)) return 'робот';
  if (/자동|오토/.test(s)) return 'АКПП';
  if (/수동/.test(s)) return 'МКПП';
  return null;
}

// Адрес фото, как его строит сайт: фото партнёрских площадок лежат у них, свои — на cdn.autobell.co.kr.
export function photoUrl(p) {
  if (!p) return null;
  if (/^https?:\/\//.test(p)) return p;
  if (p.includes('MPARK_BATCH_INSERT')) return 'https://image.m-park.co.kr/mpark/AttEdit/CarPhoto/Large' + p.replace(/.*MPARK_BATCH_INSERT/, '');
  if (p.includes('AH_BATCH_INSERT')) return 'https://www.autoinside.co.kr/shCardImg' + p.replace(/.*AH_BATCH_INSERT/, '');
  if (p.includes('SK_BATCH_INSERT')) return 'https://www.carmodoo.com/data/__carPhoto' + p.replace(/.*SK_BATCH_INSERT/, '');
  return CDN + (p.startsWith('/') ? p : '/' + p);
}

// Фото autoinside.co.kr (AH_BATCH_INSERT) снаружи Кореи отвечают 403 даже с Referer — Telegram их не скачает
// и весь альбом упадёт. Такие адреса отбрасываем.
const UNREACHABLE = /autoinside\.co\.kr/;
export const usablePhoto = (u) => Boolean(u) && !UNREACHABLE.test(u);

// Условие поиска — копия начального состояния фильтра сайта (viewType 0, тип normal).
export function buildCondition(w, pageSize = 30, page = 1) {
  return {
    isMobile: 'N', cho: ['1', '2'], carType: [],
    crMnfcCd: w.mnfc, crMnfcNm: '', crMdlCd: w.mdl, crMdlNm: '',
    crDtlMdlCd: w.dtl || [], crDtlMdlNm: [], crClsCd: [], crClsNm: [], crDtlClsCd: [], crDtlClsNm: [], selectedModels: [],
    yearRange: { min: 1990, max: new Date().getFullYear() + 1 },
    distanceRange: { min: 0, max: null }, priceRange: { min: 0, max: 9999999 },
    loc: [], carOption: [], color: [], fuel: [], mss: [], svc: [], brndGrpTp: '', brndGrpId: '', brndCmpnId: '', mrktCmplxSeqNo: '',
    acdt: [], searchTerm: '', currentPage: page, countPerPage: pageSize, countPerMore: pageSize,
    type: 'normal', viewType: '0', tab: '0', subTab: '', detailTab: '', listType: 'card', homeSvc: 'N', ewInsuSvc: 'N',
    order: 'upd_dt', selected: [], selectedList: [], advConditionStack: [], smpConditionStack: [], filterTab: '0',
  };
}

const ts = (s) => {
  const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  return m ? Math.trunc(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +m[6]) / 1000) : null; // KST
};

export function mapItem(it, brand, model) {
  const id = it && it.dlrPrdId;
  if (!id) return null; // баннеры в выдаче
  const reg = String(it.frstRegDt || '');
  const price = it.slAmt ? Number(it.slAmt) * 10_000 : null; // slAmt в 만원
  const ph = photoUrl(it.phtUrl || it.delePhtUrl);
  return {
    uid: `autobell:${id}`, source: 'autobell', source_label: 'Autobell', region: 'KR',
    url: CARD_URL(id),
    brand, model,
    trim: [it.clsNm, it.dtlClsNm].filter(Boolean).join(' ') || null,
    year: it.frmYyyy ? Number(it.frmYyyy) : (reg.length >= 4 ? Number(reg.slice(0, 4)) : null),
    month: reg.length >= 6 ? Number(reg.slice(4, 6)) || null : null,
    mileage_km: it.drvDist != null ? Number(it.drvDist) : null,
    fuel: fuelOf(it.fuelNm),
    transmission: gearOf(it.mss),
    price, currency: price ? 'KRW' : null,
    price_note: 'цена в Корее',
    location: it.locNm ? `${CITY[it.locNm] || it.locNm}, Корея` : 'Корея',
    photos: usablePhoto(ph) ? [ph] : [],
    posted_at: ts(it.updDt),
    desc_orig: it.oneLineDesc || null,
  };
}

export function parseList(json, brand, model) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  const items = (d && d.data && d.data.prdLst) || [];
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const l = mapItem(it, brand, model);
    if (!l || seen.has(l.uid)) continue;
    seen.add(l.uid);
    out.push(l);
  }
  return out;
}

const unhtml = (s) => String(s || '')
  .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&#0?34;|&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// photo: ответ selectProductDetailCarPhoto, content: selectProductDetailCarContent, option: selectProductDetailCarOption.
export function parseDetail({ photo, content, option } = {}) {
  const out = {};
  const ph = ((photo && photo.data) || []).slice()
    .sort((a, b) => (a.sortNo ?? 0) - (b.sortNo ?? 0))
    .map((p) => photoUrl(p.bImg || p.phtUrl)).filter(usablePhoto);
  out.photos = [...new Set(ph)].slice(0, MAX_PHOTOS);
  const c = (content && content.data) || {};
  // Блоки текста продавца: ключевые пункты, история, мнение, прочее.
  const parts = [c.oneLineDesc, c.kpntCntn, c.hstCntn, c.opnCntn, c.scrcCntn, c.etcCntn].map(unhtml).filter(Boolean);
  const text = [...new Set(parts)].join('\n\n').slice(0, 4000);
  if (text) out.desc_orig = text;
  const base = (option && option.data && option.data.carBaseInfo) || {};
  if (base.dspl) out.engine = `${(Number(base.dspl) / 1000).toFixed(1)} л`;
  if (base.crTkcarPsncpa) out.seats = Number(base.crTkcarPsncpa);
  if (base.fuelNm) out.fuel = fuelOf(base.fuelNm);
  if (base.mssNm) out.transmission = gearOf(base.mssNm);
  return out;
}

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  Referer: `${BASE}/buycar/searchList`,
  Origin: BASE,
};

let agent;
async function postJson(url, body) {
  const proxied = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxied && !agent) agent = new EnvHttpProxyAgent();
  for (let i = 0; ; i++) {
    let r;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify(body),
        dispatcher: proxied ? agent : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      // Обрыв соединения или таймаут: повторяем так же, как 429/5xx.
      if (i < 2) { await sleep(1500 * (i + 1)); continue; }
      throw e;
    }
    if ((r.status === 429 || r.status >= 500) && i < 2) { await sleep(3000 * (i + 1)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
}
const getJson = (url) => get(url, { headers: HEADERS, as: 'json' });

export async function fetchDetail(id) {
  const q = `.do?dlrPrdId=${encodeURIComponent(id)}`;
  const photo = await getJson(`${API}/selectProductDetailCarPhoto${q}`);
  await sleep(300);
  const content = await getJson(`${API}/selectProductDetailCarContent${q}`).catch(() => null);
  await sleep(300);
  const option = await getJson(`${API}/selectProductDetailCarOption${q}`).catch(() => null);
  return parseDetail({ photo, content, option });
}

async function fetchList(w, brand, model, page = 1) {
  const data = await postJson(`${API}/selectGeneralList.do`, buildCondition(w, 30, page));
  if (data && data.statusinfo && data.statusinfo.returncd !== '000') throw new Error(`returncd ${data.statusinfo.returncd}`);
  return { list: parseList(data, brand, model), total: data?.data?.totalCount };
}

// Следующие страницы списка: только чтобы отметить известные машины «ещё продаются».
export async function listPage(brand, model, page) {
  const w = MODELS[`${brand}|${model}`];
  return w ? (await fetchList(w, brand, model, page)).list : [];
}

export async function search(brand, model, { rates, isKnown, onList, deadline } = {}) { // eslint-disable-line no-unused-vars
  const w = MODELS[`${brand}|${model}`];
  if (!w) return [];
  // Ошибка списка уходит наверх: иначе блок сайта выглядит как «найдено 0» и запуск зелёный.
  const { list, total } = await fetchList(w, brand, model);
  console.log(`[autobell] ${brand} ${model} -> ${list.length} (всего ${total ?? '?'})`);
  if (onList) onList(list);
  const out = [];
  for (const l of list) {
    if (timeUp(deadline)) break;
    if (isKnown && isKnown(l)) continue;
    try {
      await sleep(700);
      const d = await fetchDetail(l.uid.slice('autobell:'.length));
      for (const [k, v] of Object.entries(d)) {
        if (v == null || (Array.isArray(v) && !v.length)) continue;
        if ((k === 'fuel' || k === 'transmission') && l[k]) continue;
        l[k] = v;
      }
    } catch (e) {
      console.warn(`[autobell] карточка ${l.uid}: ${e.message}`);
      l._partial = true;
    }
    out.push(l);
  }
  return out;
}
