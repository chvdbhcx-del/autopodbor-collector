// Сборщик: обходит Encar и Telegram-каналы, переводит, шлёт пакеты в бот.
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
import * as encar from './sources/encar.js';
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

async function collectEncar(state, rates, llm) {
  const fresh = [];
  for (const w of cfg.encar || []) {
    const list = await encar.fetchWatch(w, cfg.encar_per_model || 40);
    for (const l of list) {
      l.price_rub = rates.toRub(l.price, l.currency);
      // Быстрая проверка по данным списка: если ничего не поменялось, карточку не грузим.
      const listFp = fingerprint(l);
      if (state.data.sent[l.uid]?.listFp === listFp) continue;
      l._listFp = listFp;
      fresh.push(l);
    }
    await sleep(1500);
  }
  await pool(fresh, 3, async (l) => {
    await encar.fetchDetail(l);
    const cached = state.cachedTranslation(l.uid, l.desc_orig);
    if (cached && cached.desc_ru) Object.assign(l, cached);
    else {
      const t = await llm.translate(`${l.brand} ${l.model} ${l.trim || ''}`.trim(), l.desc_orig, encar.specsLine(l));
      if (t) { l.title_ru = t.title_ru; l.desc_ru = t.desc_ru; }
    }
    await sleep(800);
  });
  return fresh;
}

async function collectChannels(client, sender, state, rates, llm) {
  const out = [];
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
  const fromEncar = await collectEncar(state, rates, llm);
  const fromTg = await collectChannels(client, sender, state, rates, llm);
  const all = [...fromEncar, ...fromTg];
  if (all.length) await sendAll(sender, state, all, firstRun);
  console.log(`[run] отправлено ${all.length} (Encar ${fromEncar.length}, каналы ${fromTg.length}) за ${Math.round((Date.now() - t0) / 1000)} с`);
}

async function main() {
  const bot = process.env.BOT_USERNAME;
  if (!bot) throw new Error('Заполните BOT_USERNAME в .env');
  if (!process.env.TG_SESSION) throw new Error('Нет TG_SESSION: сначала выполните npm run login');
  const client = makeClient();
  await client.connect();
  if (!(await client.checkAuthorization())) throw new Error('Сессия недействительна: выполните npm run login заново');
  const me = await client.getMe();
  console.log(`[tg] вошёл как ${me.firstName || ''} (id ${me.id}). Этот id укажите боту как ingest_user_ids.`);

  const sender = new BotSender(client, bot);
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
