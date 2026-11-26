// Сборщик: обходит площадки, закрытые для серверов бота, и Telegram-каналы, переводит, шлёт пакеты в бот.
// В конце просит бот обновить подписки по площадкам, которые бот опрашивает сам («#refresh»).
//   npm start        — работать постоянно, проход раз в interval_minutes
//   npm run once     — один проход и выход (для cron)
import 'dotenv/config';
import fs from 'node:fs';
import YAML from 'yaml';
import { State } from './state.js';
import { Rates } from './rates.js';
import { LLM } from './llm.js';
import { toBot, fingerprint } from './listing.js';
import { makeClient, BotSender } from './tg.js';
import { decryptSession } from './session.js';
import { CustomFile } from 'telegram/client/uploads.js';
import { UA } from './http.js';
import { ensureJoined, readNewPosts, looksLikeListing, postToListing, sleep } from './sources/channels.js';

const cfg = YAML.parse(fs.readFileSync(new URL('../config.yaml', import.meta.url), 'utf8'));
const BATCH = 80;

// Простой пул: не больше n задач одновременно.
async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  });
  await Promise.all(workers);
  return out;
}

// Площадки из config.yaml → sites. Каждая: src/sources/<name>.js с MODELS и search().
// Площадки идут параллельно, модели внутри площадки по очереди. Найденное по каждой модели
// сразу переводится и уходит в бот (emit), чтобы долгий первый проход не терял работу.
// После deadline новые модели не начинаются: остаток доберёт следующий запуск.
async function collectSites(state, rates, llm, emit, deadline) {
  const names = cfg.sites || [];
  let total = 0;
  await Promise.all(names.map(async (name) => {
    let mod;
    try { mod = await import(`./sources/${name}.js`); } catch (e) { console.warn(`[${name}] модуль не загружен: ${e.message}`); return; }
    // Каждый запуск начинаем с другой модели, чтобы при нехватке времени модели обходились по кругу.
    const keys = Object.keys(mod.MODELS || {});
    const start = (state.data.siteCursor?.[name] || 0) % Math.max(keys.length, 1);
    const order = keys.slice(start).concat(keys.slice(0, start));
    let done = 0;
    for (const key of order) {
      if (Date.now() > deadline) { console.log(`[${name}] время вышло, продолжу со следующего запуска`); break; }
      const [brand, model] = key.split('|');
      // Уже отправленное и не изменившееся (цена, пробег) не перекачиваем.
      const isKnown = (l) => state.data.sent[l.uid]?.listFp === listFingerprint(l);
      try {
        const list = await mod.search(brand, model, { rates, isKnown });
        for (const l of list) {
          l.price_rub = rates.toRub(l.price, l.currency);
          if (mod.PHOTO_HEADERS) l._photoHeaders = mod.PHOTO_HEADERS;
          l._listFp = listFingerprint(l);
        }
        const fresh = list.filter((l) => !state.isUnchanged(l.uid, fingerprint(l)));
        await translateAll(fresh, state, llm);
        // Отправка идёт своей очередью, площадка не ждёт её и берёт следующую модель.
        if (fresh.length) emit(fresh);
        total += fresh.length;
        console.log(`[${name}] ${brand} ${model}: найдено ${list.length}, отправлено ${fresh.length}`);
      } catch (e) {
        console.warn(`[${name}] ${brand} ${model}: ${e.message}`);
      }
      done++;
      await sleep(1000);
    }
    state.data.siteCursor = { ...(state.data.siteCursor || {}), [name]: start + done };
  }));
  return total;
}

async function translateAll(list, state, llm) {
  await pool(list, 3, async (l) => {
    if (!l.desc_orig || l.desc_ru) return;
    const cached = state.cachedTranslation(l.uid, l.desc_orig);
    if (cached && cached.desc_ru) { Object.assign(l, cached); return; }
    const specs = [l.year, l.mileage_km != null ? `${l.mileage_km} км` : null, l.engine, l.transmission].filter(Boolean).join(', ');
    const t = await llm.translate(`${l.brand} ${l.model} ${l.trim || ''}`.trim(), l.desc_orig, specs);
    if (t) { l.title_ru = t.title_ru; l.desc_ru = t.desc_ru; }
  });
}

// Фото площадок, которые не отдают картинки без своего Referer: качаем сами и шлём боту файлами.
async function uploadProtectedPhotos(sender, list) {
  for (const l of list) {
    if (!l._photoHeaders || !l.photos?.length) continue;
    const files = [];
    for (const [i, u] of l.photos.slice(0, 20).entries()) {
      try {
        const r = await fetch(u, { headers: { 'User-Agent': UA, ...l._photoHeaders }, signal: AbortSignal.timeout(20_000) });
        if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); files.push(new CustomFile(`${i}.jpg`, b.length, '', b)); }
      } catch { /* пропуск */ }
    }
    if (files.length) { await sender.sendPhotos(l.uid, files); l.photos = []; }
  }
}

const listFingerprint = (l) => `${l.price}|${l.mileage_km}`;

async function collectChannels(client, sender, state, rates, llm) {
  const out = [];
  // Без Claude API посты не разобрать: каналы не трогаем, чтобы не сдвигать отметку «прочитано».
  if (!llm.enabled) { console.log('[tg] каналы пропущены: нет ANTHROPIC_API_KEY'); return out; }
  // Первый запуск с ключом: перечитать каналы заново (раньше их могли пролистать без разбора).
  if (!state.data.channelsWithLlm) { state.data.channels = {}; state.data.channelsWithLlm = true; }
  for (const ch of cfg.channels || []) {
    try {
      const last = state.channelLastId(ch);
      if (last == null) await ensureJoined(client, ch);
      const { posts, maxId } = await readNewPosts(client, ch, last, cfg.channel_backfill || 30);
      let found = 0;
      for (const p of posts) {
        if (!looksLikeListing(p)) continue;
        const l = await postToListing(llm, rates, ch, p);
        if (!l) continue;
        // Фото — раньше JSON: так у уведомления подписчикам уже будет альбом.
        await sender.sendPhotos(l.uid, l._media);
        delete l._media;
        out.push(l);
        found++;
      }
      state.setChannelLastId(ch, maxId);
      state.save();
      console.log(`[tg] @${ch}: постов ${posts.length}, объявлений ${found}`);
    } catch (e) {
      console.warn(`[tg] @${ch}: ${e.message}`);
    }
    await sleep(2000);
  }
  return out;
}

async function sendAll(sender, state, listings, firstRun) {
  for (let i = 0; i < listings.length; i += BATCH) {
    const chunk = listings.slice(i, i + BATCH);
    // Первый запуск наполняет базу: не засыпаем подписчиков уведомлениями.
    await sender.sendBatch(chunk.map(toBot), { notify: !firstRun });
    for (const l of chunk) {
      state.markSent(l, fingerprint(l));
      if (l._listFp) state.data.sent[l.uid].listFp = l._listFp;
    }
    state.save();
  }
}

async function runOnce(client, sender, state, rates, llm) {
  const t0 = Date.now();
  const firstRun = Object.keys(state.data.sent).length === 0;
  await rates.refresh();
  // Каналы и подписки первыми: они быстрые и важнее всего.
  const fromTg = await collectChannels(client, sender, state, rates, llm);
  if (fromTg.length) await sendAll(sender, state, fromTg, firstRun);
  try { await sender.refresh(); } catch (e) { console.warn('[refresh]', e.message); }
  // Отправка в бот по одному пакету за раз: площадки шлют найденное по мере готовности.
  let chain = Promise.resolve();
  const emit = (list) => (chain = chain.then(async () => {
    await uploadProtectedPhotos(sender, list);
    await sendAll(sender, state, list, firstRun);
  }).catch((e) => console.warn('[send]', e.message)));
  const deadline = t0 + (cfg.run_minutes || 38) * 60_000;
  const fromSites = await collectSites(state, rates, llm, emit, deadline);
  await chain;
  state.save();
  console.log(`[run] отправлено ${fromSites + fromTg.length} (площадки ${fromSites}, каналы ${fromTg.length}) за ${Math.round((Date.now() - t0) / 1000)} с`);
}

async function main() {
  const bot = process.env.BOT_USERNAME;
  if (!bot) throw new Error('Заполните BOT_USERNAME в .env');
  // В Actions сессия лежит зашифрованной в ветке state (её создаёт workflow «login»).
  if (!process.env.TG_SESSION && fs.existsSync('session.enc') && process.env.TG_API_HASH) {
    process.env.TG_SESSION = decryptSession(fs.readFileSync('session.enc', 'utf8'), process.env.TG_API_HASH);
  }
  if (!process.env.TG_SESSION) throw new Error('Нет TG_SESSION: сначала выполните вход (workflow «login» или npm run login)');
  const client = makeClient();
  await client.connect();
  if (!(await client.checkAuthorization())) throw new Error('Сессия недействительна: выполните npm run login заново');
  const me = await client.getMe();
  console.log(`[tg] вошёл как ${me.firstName || ''} (id ${me.id}). Этот id укажите боту как ingest_user_ids.`);

  const sender = new BotSender(client, bot);
  await sender.clearChat();
  const state = new State(new URL('../state.json', import.meta.url).pathname);
  const rates = new Rates();
  const llm = new LLM();

  const once = process.argv.includes('--once');
  do {
    try { await runOnce(client, sender, state, rates, llm); } catch (e) { console.error('[run]', e); }
    if (once) break;
    await sleep((cfg.interval_minutes || 30) * 60_000);
  } while (true);
  await client.disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
