// Carsensor (carsensor.net): внутренний рынок Японии, продают дилеры, текст на японском.
// Список: /usedcar/b<марка>/s<модель>/index.html?SORT=19 («新着順», новые сверху), ≈1 МБ, 30 машин.
// Цены на сайте в 万円 (10 000 иен) — переводим в иены. Пробег в списке округлён до 0.1 万km,
// в карточке так же. Карточка: все фото (обычно 30–60), таблица характеристик, комментарий продавца.
import { get, sleep } from '../http.js';

const BASE = 'https://www.carsensor.net';
const MAX_PHOTOS = 60;

// 'Brand|Model' -> коды CARC («TO_S009»). Из /usedcar/shashu/b<марка>/index.html (ноябрь 2026).
// Несколько кодов — родственные модели (гибрид, седан/универсал), их списки сливаются.
export const MODELS = {
  'Toyota|Alphard': ['TO_S009', 'TO_S010'],
  'Toyota|Land Cruiser Prado': ['TO_S152'],
  'Toyota|Camry': ['TO_S032', 'TO_S221'],
  'Toyota|RAV4': ['TO_S147'],
  'Lexus|RX': ['LE_S008'],
  'Lexus|ES': ['LE_S020'],
  'Mazda|6': ['MA_S098', 'MA_S099', 'MA_S008', 'MA_S090'],
  'Mazda|CX-5': ['MA_S087'],
  'Honda|Odyssey': ['HO_S002'],
  'Honda|CR-V': ['HO_S018'],
  'BYD|Dolphin': ['BY_S002'],
  'Hyundai|Kona': ['HD_S016'],
  'Mercedes-Benz|E-Class': ['ME_S014', 'ME_S015'],
  'Mercedes-Benz|S-Class': ['ME_S019'],
  'BMW|5 Series': ['BM_S017', 'BM_S018'],
  'BMW|X5': ['BM_S026'],
};

export const listUrl = (carc) => {
  const [b, s] = carc.split('_');
  return `${BASE}/usedcar/b${b}/${s.toLowerCase()}/index.html?SORT=19`;
};

const PREF = {
  北海道: 'Хоккайдо', 青森: 'Аомори', 岩手: 'Иватэ', 宮城: 'Мияги', 秋田: 'Акита', 山形: 'Ямагата', 福島: 'Фукусима',
  茨城: 'Ибараки', 栃木: 'Тотиги', 群馬: 'Гумма', 埼玉: 'Сайтама', 千葉: 'Тиба', 東京: 'Токио', 神奈川: 'Канагава',
  新潟: 'Ниигата', 富山: 'Тояма', 石川: 'Исикава', 福井: 'Фукуи', 山梨: 'Яманаси', 長野: 'Нагано', 岐阜: 'Гифу',
  静岡: 'Сидзуока', 愛知: 'Айти', 三重: 'Миэ', 滋賀: 'Сига', 京都: 'Киото', 大阪: 'Осака', 兵庫: 'Хёго', 奈良: 'Нара',
  和歌山: 'Вакаяма', 鳥取: 'Тоттори', 島根: 'Симанэ', 岡山: 'Окаяма', 広島: 'Хиросима', 山口: 'Ямагути', 徳島: 'Токусима',
  香川: 'Кагава', 愛媛: 'Эхимэ', 高知: 'Коти', 福岡: 'Фукуока', 佐賀: 'Сага', 長崎: 'Нагасаки', 熊本: 'Кумамото',
  大分: 'Оита', 宮崎: 'Миядзаки', 鹿児島: 'Кагосима', 沖縄: 'Окинава',
};
const FUEL = { ガソリン: 'petrol', レギュラー: 'petrol', ハイオク: 'petrol', 軽油: 'diesel', ディーゼル: 'diesel', ハイブリッド: 'hybrid', 電気: 'ev', EV: 'ev', LPG: 'lpg' };

const decode = (s) => String(s || '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (s) => decode(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t　]+/g, ' ').replace(/ *\n */g, '\n').trim();
const abs = (u) => (u.startsWith('//') ? 'https:' + u : u.startsWith('/') ? BASE + u : u);

// «397.1» 万円 -> 3 971 000 иен.
export const manYen = (s) => {
  const n = parseFloat(String(s || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10_000) : null;
};

// «5.0万km», «12.8万km», «50km».
export function mileage(s) {
  const t = text(s).replace(/,/g, '');
  const m = t.match(/([\d.]+)\s*(万)?\s*km/i);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * (m[2] ? 10_000 : 1));
}

export function gear(v) {
  const u = String(v || '').toUpperCase();
  if (!u || u === '-' || u === '－') return null;
  if (/CVT/.test(u)) return 'вариатор';
  if (/DCT|AMT|セミ|SAT|DSG/.test(u)) return 'робот';
  if (/MT/.test(u) && !/AT/.test(u)) return 'МКПП';
  if (/AT|オートマ/.test(u)) return 'АКПП';
  return null;
}

function driveRu(v) {
  const s = String(v || '');
  if (/4WD|AWD|全輪|四輪|フルタイム|パートタイム/.test(s)) return 'полный';
  if (/前輪|FF/.test(s)) return 'передний';
  if (/後輪|FR|RR|MR/.test(s)) return 'задний';
  return null;
}

function fuelOf(v) {
  const s = String(v || '');
  if (/ハイブリッド/.test(s)) return 'hybrid';
  for (const [k, f] of Object.entries(FUEL)) if (s.includes(k)) return f;
  return null;
}

function where(pref, city) {
  const key = String(pref || '').replace(/[都道府県]$/, '');
  const p = PREF[key] || PREF[pref] || pref || null;
  return p ? `${p}, Япония` : 'Япония';
}

export function parseList(html, brand, model) {
  const out = [];
  const c = String(html).replace(/\s+/g, ' ');
  const parts = c.split(/<div class="cassette js_listTableCassette" id="/).slice(1);
  for (const p of parts) {
    const id = (p.match(/^(\w+)_cas"/) || [])[1];
    if (!id) continue;
    const title = text((p.match(/<h3 class="cassetteMain__title">\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    const spec = {};
    for (const m of p.matchAll(/<dt class="specList__title[^"]*">([^<]+)<\/dt>\s*<dd class="specList__data[^"]*">([\s\S]*?)<\/dd>/g)) spec[text(m[1])] = m[2];
    const year = Number((spec['年式'] || '').match(/(\d{4})/)?.[1]) || null;
    const cc = Number(String(text(spec['排気量'] || '')).replace(/[^\d]/g, '')) || null;
    const base = (p.match(/<span class="basePrice__mainPriceNum">([^<]*)<\/span>(?:<span class="basePrice__subPriceNum">([^<]*)<\/span>)?/) || []);
    const total = (p.match(/<span class="totalPrice__mainPriceNum">([^<]*)<\/span>(?:<span class="totalPrice__subPriceNum">([^<]*)<\/span>)?/) || []);
    const price = manYen((base[1] || '') + (base[2] || ''));
    const totalYen = manYen((total[1] || '') + (total[2] || ''));
    const area = [...((p.match(/<div class="cassetteSub__area">([\s\S]*?)<\/div>/) || [])[1] || '').matchAll(/<p>([^<]*)<\/p>/g)].map((m) => text(m[1]));
    const img = (p.match(/data-original="([^"]+_001L\.JPG)"/i) || p.match(/<noscript>\s*<img src="([^"]+)"/) || [])[1];
    const sub = text((p.match(/<p class="cassetteMain__subText">([\s\S]*?)<\/p>/) || [])[1]);
    // «アルファード 2.5 S Cパッケージ ナビ&TV …»: первое слово — модель, дальше комплектация и опции.
    const trim = title.replace(/^\S+\s*/, '').trim() || null;
    out.push({
      uid: `carsensor:${id}`,
      source: 'carsensor',
      source_label: 'Carsensor',
      region: 'JP',
      url: `${BASE}/usedcar/detail/${id}/index.html`,
      brand, model,
      trim: trim && trim.length > 80 ? trim.slice(0, 80).replace(/\s+\S*$/, '') : trim,
      year,
      month: null,
      mileage_km: mileage(spec['走行距離']),
      fuel: fuelOf(title) === 'hybrid' ? 'hybrid' : null,
      transmission: gear(text(spec['ミッション'])),
      drive: /4WD/.test(title) ? 'полный' : null,
      engine: cc ? `${(cc / 1000).toFixed(1)} л` : null,
      price: price || totalYen,
      currency: price || totalYen ? 'JPY' : null,
      price_note: price && totalYen
        ? `цена в Японии; с оформлением в Японии ${Math.round(totalYen / 1000) * 1000} иен`
        : 'цена в Японии',
      location: where(area[0], area[1]),
      photos: img ? [abs(decode(img))] : [],
      desc_orig: [title, sub].filter(Boolean).join('\n') || null,
      _sort: id,
    });
  }
  return out;
}

export function parseDetail(html) {
  const c = String(html).replace(/\s+/g, ' ');
  const photos = [];
  for (const m of c.matchAll(/data-photo='([^']+)'(?:\s+data-photohq='([^']+)')?/g)) {
    const u = abs(decode(m[2] || m[1]));
    if (/\/CSphoto\//.test(u) && !photos.includes(u)) photos.push(u); // без заглушек видео/360°
  }
  const spec = {};
  for (const m of c.matchAll(/<th class="defaultTable__head">([\s\S]*?)<\/th>\s*<td class="defaultTable__description">([\s\S]*?)<\/td>/g)) {
    const k = text(m[1]);
    if (!(k in spec)) spec[k] = text(m[2]);
    else if (k === '駆動方式') spec['駆動方式(新車)'] = text(m[2]); // второй раз — из каталога: «前輪駆動(FF)»
  }
  const out = { photos: photos.slice(0, MAX_PHOTOS) };
  const plan = text((c.match(/<p class="planInfo__description">([\s\S]*?)<\/p>/) || [])[1]);
  const shop = text((c.match(/<p class="shopComment">([\s\S]*?)<\/p>/) || [])[1]);
  const title = text((c.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]);
  const desc = [title, plan, shop].filter(Boolean).join('\n');
  if (desc) out.desc_orig = desc.slice(0, 4000);
  const f = fuelOf(spec['エンジン種別'] || spec['使用燃料']); if (f) out.fuel = f;
  const t = gear(spec['ミッション']); if (t) out.transmission = t;
  const d = /4WD/.test(spec['駆動方式'] || '') ? 'полный' : driveRu(spec['駆動方式(新車)']) || driveRu(spec['駆動方式']);
  if (d) out.drive = d;
  const seats = Number(String(spec['乗車定員'] || '').replace(/[^\d]/g, '')); if (seats) out.seats = seats;
  const cc = Number(String(spec['排気量'] || '').replace(/[^\d]/g, '')); if (cc) out.engine = `${(cc / 1000).toFixed(1)} л`;
  const km = mileage(spec['走行距離']); if (km != null) out.mileage_km = km;
  const ym = String(spec['年式(初度登録年)'] || spec['年式'] || '').match(/(\d{4}).*?(\d{1,2})月/);
  if (ym) { out.year = Number(ym[1]); out.month = Number(ym[2]); }
  return out;
}

export async function search(brand, model, { rates, isKnown } = {}) { // eslint-disable-line no-unused-vars
  const codes = MODELS[`${brand}|${model}`];
  if (!codes) return [];
  let list = [];
  for (const carc of codes) {
    try {
      list.push(...parseList(await get(listUrl(carc), { timeout: 45_000, headers: { 'Accept-Language': 'ja,en;q=0.8' } }), brand, model));
    } catch (e) {
      console.warn(`[carsensor] ${brand} ${model} (${carc}): ${e.message}`);
    }
    await sleep(800);
  }
  // id вида AU7549112949 растёт со временем — сортируем по нему, если списков несколько.
  const seen = new Set();
  list = list.filter((l) => !seen.has(l.uid) && seen.add(l.uid));
  if (codes.length > 1) list.sort((a, b) => (a._sort < b._sort ? 1 : -1));
  list = list.slice(0, 30);
  const out = [];
  for (const l of list) {
    delete l._sort;
    if (isKnown && isKnown(l)) continue;
    try {
      const d = parseDetail(await get(l.url, { timeout: 45_000, headers: { 'Accept-Language': 'ja,en;q=0.8' } }));
      for (const [k, v] of Object.entries(d)) {
        if (v == null || (Array.isArray(v) && !v.length)) continue;
        if (k === 'mileage_km' && l.mileage_km != null) continue; // пробег из списка: по нему сверяется isKnown
        l[k] = v;
      }
    } catch (e) {
      console.warn(`[carsensor] карточка ${l.uid}: ${e.message}`);
    }
    out.push(l);
    await sleep(800);
  }
  return out;
}
