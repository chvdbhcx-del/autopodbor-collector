// Проход сборщика без сети и Telegram: state.json, «ещё продаются», каналы, FloodWait, курсы, Groq.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { State, descHash } from '../src/state.js';
import { Run, SEEN_CHUNK } from '../src/collect.js';
import { fingerprint } from '../src/listing.js';
import { Rates } from '../src/rates.js';
import { BotSender, FloodError } from '../src/tg.js';
import { readNewPosts, READ_LIMIT } from '../src/sources/channels.js';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'col-')), 'state.json');
const DAY = 86_400_000;

function fakeSender({ failBatch } = {}) {
  return {
    batches: [], photos: [], floodUntil: 0, maxFloodWaitMs: 120_000,
    flooded() { return Date.now() < this.floodUntil; },
    async sendBatch(listings, opts = {}) {
      if (failBatch && failBatch(listings, opts)) throw new Error('обрыв');
      this.batches.push({ listings, ...opts });
    },
    async sendPhotos(uid, media) { this.photos.push(uid); return this.photosOk ? this.photosOk(uid, media) : true; },
    async refresh() {},
  };
}

const rates = () => { const r = new Rates(); r.rub = { RUB: 1, KRW: 0.07, JPY: 0.6 }; r.at = Date.now(); return r; };
const car = (id, extra = {}) => ({ uid: `kcar:${id}`, source: 'kcar', brand: 'Hyundai', model: 'Palisade', price: 30_000_000, currency: 'KRW', mileage_km: 1000 + id, photos: [`p${id}`], ...extra });

function makeRun(state, mods, opts = {}) {
  return new Run({
    cfg: { sites: Object.keys(mods), channels: opts.channels || [] },
    state, rates: opts.rates || rates(), llm: opts.llm || { enabled: false, provider: null, apiErrors: 0 },
    sender: opts.sender || fakeSender(), client: opts.client || {},
    importSource: async (n) => mods[n], sleep: async () => {},
  });
}

test('state: старый формат ужимается, отпечатки совместимы, перевод берётся из кеша по хешу', () => {
  const p = tmp();
  const l = car(1, { desc_orig: 'длинное описание '.repeat(200) });
  const fp = fingerprint({ ...l, price_rub: 2_100_000 });
  fs.writeFileSync(p, JSON.stringify({ sent: { 'kcar:1': { fp, title_ru: 'T', desc_ru: 'D', descOrig: l.desc_orig, at: Date.now(), listFp: '1|2' }, 'kcar:2': { fp, title_ru: null, desc_ru: null, descOrig: null, at: 1 }, 'kcar:3': null }, channels: {} }));
  const s = new State(p);
  const v = s.data.sent['kcar:1'];
  assert.equal(v.descOrig, undefined);
  assert.equal(v.dh, descHash(l.desc_orig));
  assert.equal(v.fp.length, 16);
  assert.ok(s.isUnchanged('kcar:1', fp), 'полный sha1 сравнивается с коротким');
  assert.deepEqual(s.cachedTranslation('kcar:1', l.desc_orig), { title_ru: 'T', desc_ru: 'D' });
  assert.equal(s.cachedTranslation('kcar:1', 'другое'), null);
  assert.ok(!('title_ru' in s.data.sent['kcar:2']));
  assert.ok(!('kcar:3' in s.data.sent));
  s.save();
  assert.ok(fs.statSync(p).size < 400);
});

test('state: давно не встречавшиеся записи удаляются, встреченные остаются', () => {
  const s = new State(tmp());
  const now = Date.now();
  s.data.sent = { 'a:1': { fp: 'x', at: now - 60 * DAY }, 'a:2': { fp: 'x', at: now - 60 * DAY, seen: now - DAY }, 'a:3': { fp: 'x', at: now }, 'tg:c:1': { fp: 'x', at: now - 60 * DAY } };
  assert.equal(s.prune(45, now), 1);
  assert.deepEqual(Object.keys(s.data.sent).sort(), ['a:2', 'a:3', 'tg:c:1']);
});

test('state: битый файл — ошибка, а не «первый запуск»; нет файла — первый запуск', () => {
  const p = tmp();
  fs.writeFileSync(p, '{"sent": {"a":');
  assert.throws(() => new State(p), /не читается/);
  assert.deepEqual(new State(tmp()).data.sent, {});
});

test('сайты: неизменившиеся и вся длина списка — «ещё продаются»; listFp восстанавливается; частичные не помечаются', async () => {
  const s = new State(tmp());
  const r = rates();
  const c1 = car(1), c2 = car(2), c3 = car(3), c4 = car(4);
  // c1 отправлен, listFp стёрт миграцией; c3 известен, но только в хвосте списка; c4 — новый, карточка не загрузилась.
  for (const c of [c1, c3]) s.markSent({ ...c }, fingerprint({ ...c, price_rub: r.toRub(c.price, c.currency) }));
  const mod = {
    MODELS: { 'Hyundai|Palisade': 1 },
    async search(b, m, { isKnown, onList }) {
      onList([c1, c2, c4, c3]);
      return [{ ...c1 }, { ...c2 }, { ...c4, _partial: true }].filter((l) => !isKnown(l));
    },
  };
  const sender = fakeSender();
  const run = makeRun(s, { kcar: mod }, { sender, rates: r });
  const res = await run.run();
  const sent = sender.batches.filter((b) => b.listings.length).flatMap((b) => b.listings.map((l) => l.uid));
  assert.deepEqual(sent.sort(), ['kcar:2', 'kcar:4']);
  const seen = sender.batches.filter((b) => b.seen).flatMap((b) => b.seen);
  assert.deepEqual(seen.sort(), ['kcar:1', 'kcar:3']);
  assert.equal(s.data.sent['kcar:1'].listFp, `${c1.price}|${c1.mileage_km}`, 'listFp восстановлен');
  assert.ok(s.data.sent['kcar:2'].listFp);
  assert.equal(s.data.sent['kcar:4'].listFp, undefined, 'карточка не загрузилась: в следующий раз дозагрузим');
  assert.ok(s.data.sent['kcar:3'].seen);
  assert.ok(sender.batches.at(-1).report);
  assert.equal(res.seen, 2);
});

test('сайты: нет курса — цена в рублях не считается и «не менялось» не ставится', async () => {
  const s = new State(tmp());
  const mod = { MODELS: { 'Hyundai|Palisade': 1 }, async search() { return [car(5)]; } };
  const r = new Rates(); r.refresh = async () => {};
  await makeRun(s, { kcar: mod }, { rates: r }).run();
  assert.equal(s.data.sent['kcar:5'].listFp, undefined);
});

test('сайты: листание страниц — пока встречаются наши машины, раз в сутки, повтор страницы останавливает', async () => {
  const s = new State(tmp());
  for (const id of [10, 20, 21]) s.markSent(car(id), 'fp');
  const pages = { 2: [car(10), car(11)], 3: [car(20), car(21)], 4: [car(30)], 5: [car(40)] };
  const asked = [];
  const mod = {
    MODELS: { 'Hyundai|Palisade': 1 },
    async search(b, m, { onList }) { onList([car(1)]); return []; },
    async listPage(b, m, page) { asked.push(page); return pages[page] || []; },
  };
  const sender = fakeSender();
  await makeRun(s, { kcar: mod }, { sender }).run();
  assert.deepEqual(asked, [2, 3, 4], 'на 4-й странице наших нет — дальше не листаем');
  assert.deepEqual(sender.batches.filter((b) => b.seen).flatMap((b) => b.seen).sort(), ['kcar:10', 'kcar:20', 'kcar:21']);
  asked.length = 0;
  const again = fakeSender();
  await makeRun(s, { kcar: mod }, { sender: again }).run();
  assert.deepEqual(asked, [], 'второй раз за сутки не листаем');
  assert.equal(again.batches.filter((b) => b.seen).length, 0, 'о тех же машинах второй раз за сутки не сообщаем');
  // Сайт игнорирует номер страницы и отдаёт первую: останавливаемся сразу.
  s.data.sweepAt = {};
  const same = { ...mod, async listPage(b, m, page) { asked.push(page); return [car(1)]; } };
  await makeRun(s, { kcar: same }).run();
  assert.deepEqual(asked, [2]);
});

test('сайты: «ещё продаются» уходят пачками по ходу прохода', async () => {
  const s = new State(tmp());
  const list = Array.from({ length: SEEN_CHUNK + 5 }, (_, i) => car(i));
  for (const c of list) s.markSent(c, 'fp');
  const mod = { MODELS: { 'Hyundai|Palisade': 1 }, async search(b, m, { onList }) { onList(list); return []; } };
  const sender = fakeSender();
  await makeRun(s, { kcar: mod }, { sender }).run();
  const seenBatches = sender.batches.filter((b) => b.seen);
  assert.equal(seenBatches.length, 2);
  assert.equal(seenBatches[0].seen.length, SEEN_CHUNK);
});

test('сайты: упавшая модель повторяется первой, курсор двигается после каждой модели', async () => {
  const s = new State(tmp());
  const order = [];
  const mod = {
    MODELS: { 'A|1': 1, 'A|2': 1, 'A|3': 1 },
    async search(b, m) { order.push(m); if (m === '2') throw new Error('HTTP 500'); return []; },
  };
  await makeRun(s, { kcar: mod }).run();
  assert.deepEqual(order, ['1', '2', '3']);
  assert.deepEqual(s.data.siteRetry.kcar, ['A|2']);
  assert.equal(s.data.siteCursor.kcar, 0);
  order.length = 0;
  await makeRun(s, { kcar: mod }).run();
  assert.deepEqual(order, ['2', '1', '3']);
  assert.deepEqual(s.data.siteRetry.kcar, [], 'упала и при повторе — ждёт очереди по кругу');
});

const post = (id, text = 'Hyundai Staria 2023 года, пробег 20 000 км, цена 4 500 000 ₽ под ключ') => ({ id, date: 1_700_000_000 + id, message: text, photo: { id } });
const tgLlm = () => ({
  enabled: true, provider: 'groq', apiErrors: 0,
  async extractPost() { return { is_car_listing: true, brand: 'Hyundai', model: 'Staria', year: 2023, price: 4_500_000, currency: 'RUB' }; },
});

test('каналы: отправка в бот не прошла — отметка «прочитано» не двигается', async () => {
  const s = new State(tmp());
  s.data.channelsWithLlm = 2;
  s.data.channels = { shop: 100 };
  const client = { getMessages: async () => [post(102), post(101)] };
  const sender = fakeSender({ failBatch: (l) => l.length > 0 });
  const run = makeRun(s, {}, { channels: ['shop'], client, sender, llm: tgLlm() });
  const res = await run.run();
  assert.equal(s.channelLastId('shop'), 100);
  assert.equal(run.report.channels.errors, 1);
  assert.equal(res.sendErrors, 1, 'запуск будет красным');
  // Следующий запуск: отправка прошла — двигаем.
  const ok = fakeSender();
  await makeRun(s, {}, { channels: ['shop'], client, sender: ok, llm: tgLlm() }).run();
  assert.equal(s.channelLastId('shop'), 102);
  assert.deepEqual(ok.batches.find((b) => b.listings.length).listings.map((l) => l.uid).sort(), ['tg:shop:101', 'tg:shop:102']);
});

test('каналы: фото не ушли (FloodWait) — пост и следующие перечитаем, уже готовые отправим', async () => {
  const s = new State(tmp());
  s.data.channelsWithLlm = 2;
  s.data.channels = { shop: 100, other: 5 };
  let calls = 0;
  const client = { getMessages: async (ch) => { calls++; return ch === 'shop' ? [post(103), post(102), post(101)] : [post(6)]; } };
  const sender = fakeSender();
  sender.photosOk = (uid) => {
    if (uid === 'tg:shop:102') { sender.floodUntil = Date.now() + 25 * 60_000; return false; }
    return true;
  };
  await makeRun(s, {}, { channels: ['shop', 'other'], client, sender, llm: tgLlm() }).run();
  assert.equal(s.channelLastId('shop'), 101);
  assert.deepEqual(sender.batches.find((b) => b.listings.length).listings.map((l) => l.uid), ['tg:shop:101']);
  assert.equal(s.channelLastId('other'), 5, 'под FloodWait остальные каналы не трогаем');
  assert.equal(calls, 1);
});

test('каналы: читаем после lastId от старых к новым, разрезанный альбом оставляем на потом', async () => {
  let opts;
  const many = Array.from({ length: READ_LIMIT }, (_, i) => ({ id: 1001 + i, date: 1, message: `m${i}` }));
  many[READ_LIMIT - 1].groupedId = { toString: () => 'g' };
  many[READ_LIMIT - 2].groupedId = { toString: () => 'g' };
  const client = { getMessages: async (ch, o) => { opts = o; return many; } };
  const { maxId, posts } = await readNewPosts(client, 'shop', 1000);
  assert.equal(opts.reverse, true);
  assert.equal(opts.minId, 1000);
  assert.equal(maxId, 1000 + READ_LIMIT - 2);
  assert.equal(posts.length, READ_LIMIT - 2);
});

test('FloodWait: длинная пауза — пакет не шлём, сразу ошибка; короткую пережидаем', async () => {
  let sent = 0;
  const client = { sendFile: async () => { sent++; return { id: 1 }; }, deleteMessages: async () => {} };
  const s = new BotSender(client, '@bot');
  s.floodUntil = Date.now() + 25 * 60_000;
  await assert.rejects(s.sendBatch([], {}), FloodError);
  assert.equal(sent, 0);
  assert.equal(await s.sendPhotos('u', [1]), false);
  s.floodUntil = Date.now() + 10;
  await s.sendBatch([], {});
  assert.equal(sent, 1);
  // Ошибка FloodWait от Telegram запоминается.
  const s2 = new BotSender({ sendFile: async () => { const e = new Error('A wait of 1500 seconds is required'); e.seconds = 1500; throw e; } }, 'bot');
  await assert.rejects(s2.sendBatch([], {}), FloodError);
  assert.ok(s2.flooded());
});

test('курсы: ЦБ недоступен — берём сохранённые; не 200 — не затираем', async () => {
  const saved = { rub: { RUB: 1, KRW: 0.07 }, at: Date.now() - DAY };
  const r = new Rates();
  assert.ok(r.load(saved));
  r.at = 0;
  await r.refresh(async () => ({ ok: false, status: 503, json: async () => ({}) }));
  assert.equal(r.toRub(1000, 'KRW'), 70);
  assert.ok(!new Rates().load({ rub: { KRW: 1 }, at: Date.now() - 30 * DAY }), 'слишком старые не берём');
});

test('сессия: старый ключ читается, при SESSION_KEY файл перешифровывается', async () => {
  const { encryptSession, openSession } = await import('../src/session.js');
  const old = encryptSession('sess', 'apihash');
  const a = openSession(old, { TG_API_HASH: 'apihash' });
  assert.equal(a.session, 'sess'); assert.equal(a.reencrypted, null);
  const b = openSession(old, { TG_API_HASH: 'apihash', SESSION_KEY: 'random' });
  assert.equal(b.session, 'sess');
  assert.equal(openSession(b.reencrypted, { SESSION_KEY: 'random' }).session, 'sess');
  assert.throws(() => openSession(old, { TG_API_HASH: 'other' }), /не расшифровался/);
});

test('Groq: год строкой и «Diesel» приводятся к схеме, пустой ответ переспрашивается', async () => {
  process.env.GROQ_API_KEY = 'gsk_x';
  delete process.env.ANTHROPIC_API_KEY;
  const { LLM, normalizePost } = await import('../src/llm.js?groq2');
  const n = normalizePost({ is_car_listing: 'true', brand: 'Kia', model: 'Carnival', year: '2021', mileage_km: '58 000', price: '2 650 000', fuel: 'Diesel', currency: '₽' });
  assert.equal(n.year, 2021); assert.equal(n.mileage_km, 58000); assert.equal(n.price, 2650000);
  assert.equal(n.fuel, 'diesel'); assert.equal(n.currency, 'RUB'); assert.equal(n.trim, null);
  const orig = globalThis.fetch;
  const answers = ['', JSON.stringify({ is_car_listing: true, brand: 'Kia', model: 'Carnival', year: '2021', fuel: 'Gasoline' })];
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: answers.shift() } }] }) });
  try {
    const llm = new LLM();
    const car = await llm.extractPost('Kia Carnival 2021');
    assert.equal(car.year, 2021); assert.equal(car.fuel, 'petrol');
    assert.equal(llm.apiErrors, 0);
    answers.push('', 'не json');
    assert.equal(await llm.extractPost('x'), null);
    assert.equal(llm.badResponses, 1);
    assert.equal(llm.apiErrors, 0, 'плохой ответ — не ошибка API');
  } finally { globalThis.fetch = orig; delete process.env.GROQ_API_KEY; }
});

test('итог: площадки параллельно — сумма отправленного не теряется, считается доставленное', async () => {
  const s = new State(tmp());
  const mk = (src, n) => ({
    MODELS: { 'A|1': 1, 'A|2': 1 },
    async search(b, m) { await new Promise((r) => setTimeout(r, src === 'x' ? 5 : 1)); return Array.from({ length: n }, (_, i) => ({ ...car(i), uid: `${src}:${m}:${i}` })); },
  });
  const sender = fakeSender();
  const res = await makeRun(s, { x: mk('x', 3), y: mk('y', 5) }, { sender }).run();
  assert.equal(res.queued, 16);
  assert.equal(res.sent, 16);
  assert.equal(sender.batches.at(-1).report.sent, 16);
  assert.equal(res.failed, false);
});

test('итог: один-два сбоя отправки не красят запуск, сломанная отправка красит', async () => {
  const mod = { MODELS: { 'A|1': 1, 'A|2': 1, 'A|3': 1 }, async search(b, m) { return [{ ...car(1), uid: `kcar:${m}` }]; } };
  let n = 0;
  const once = fakeSender({ failBatch: (l) => l.length > 0 && n++ === 0 });
  const r1 = await makeRun(new State(tmp()), { kcar: mod }, { sender: once }).run();
  assert.equal(r1.sendErrors, 1); assert.equal(r1.sent, 2); assert.equal(r1.failed, false);
  const broken = fakeSender({ failBatch: () => true });
  const r2 = await makeRun(new State(tmp()), { kcar: mod }, { sender: broken }).run();
  assert.equal(r2.failed, true);
});

test('Telegram 500 при отправке пакета — повтор, а не потеря', async () => {
  let calls = 0;
  const client = { sendFile: async () => { if (++calls === 1) { const e = new Error('500: FILE_WRITE_EMPTY (caused by messages.SendMedia)'); e.code = 500; throw e; } return { id: 1 }; }, deleteMessages: async () => {} };
  const s = new BotSender(client, 'bot');
  s.retryDelays = [1];
  await s.sendBatch([], {});
  assert.equal(calls, 2);
  const bad = new BotSender({ sendFile: async () => { throw new Error('CHAT_WRITE_FORBIDDEN'); } }, 'bot');
  bad.retryDelays = [1];
  await assert.rejects(bad.sendBatch([], {}), /CHAT_WRITE_FORBIDDEN/);
});

test('листание: 404 на следующей странице — конец списка, без ошибки; время на листание ограничено', async () => {
  const s = new State(tmp());
  s.markSent(car(10), 'fp');
  const asked = [];
  const mod = {
    MODELS: { 'A|1': 1, 'A|2': 1 },
    async search(b, m, { onList }) { onList([car(1)]); return []; },
    async listPage(b, m, page) { asked.push(`${m}:${page}`); if (page === 3) throw new Error('HTTP 404'); return [car(10)]; },
  };
  const run = makeRun(s, { kcar: mod });
  await run.run();
  assert.deepEqual(asked, ['1:2', '1:3', '2:2', '2:3']);
  assert.ok(s.data.sweepAt['kcar|A|1'], 'после 404 модель считается пролистанной');
  // Лимит времени на листание у площадки исчерпан — следующие модели не листаем.
  const s2 = new State(tmp());
  const run2 = makeRun(s2, { kcar: mod });
  run2.sweepMs.kcar = run2.runMs;
  asked.length = 0;
  await run2.run();
  assert.deepEqual(asked, []);
});

test('http: после 429 запросы к хосту замедляются, удачные ответы отпускают', async () => {
  const { note429, noteOk, throttle, resetThrottle } = await import('../src/http.js');
  resetThrottle();
  note429('example.com', '5');
  const h = throttle('example.com');
  assert.equal(h.gap, 2000);
  assert.ok(h.next - Date.now() > 4000);
  note429('example.com');
  assert.equal(h.gap, 4000);
  for (let i = 0; i < 20; i++) noteOk('example.com');
  assert.equal(h.gap, 0);
  resetThrottle();
});

test('olx: ссылка на вторую страницу HTML', async () => {
  const { buildHtmlUrl, MODELS } = await import('../src/sources/olx.js');
  assert.equal(buildHtmlUrl(MODELS['Hyundai|Staria'], 'staria', 2), 'https://www.olx.pl/motoryzacja/samochody/hyundai/staria/?page=2&search%5Border%5D=created_at:desc');
});
