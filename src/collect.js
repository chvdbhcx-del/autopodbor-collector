// Один проход сборщика: площадки, каналы, «ещё продаются» и отчёт для /health.
// Вынесено из main.js, чтобы проверять тестами без Telegram и сети.
import { toBot, fingerprint } from './listing.js';
import { ensureJoined, readNewPosts, looksLikeListing, postToListing, sleep as tgSleep } from './sources/channels.js';

export const BATCH = 80;
// Сколько uid «ещё продаются» в одном пакете и с какого числа отправлять их по ходу прохода.
export const SEEN_CHUNK = 3000;
// Листание следующих страниц списка (только для «ещё продаются»): раз в сутки на модель, до 10 страниц,
// пока на странице встречаются уже отправленные в бот машины.
export const SWEEP_HOURS = 24;
export const SWEEP_PAGES = 10;
// Одну и ту же машину сообщаем боту как «ещё продаётся» не чаще раза в 20 часов: бот скрывает
// через 14 дней, а каждая отметка — запись в его базе.
export const SEEN_REPORT_HOURS = 20;

export const listFingerprint = (l) => `${l.price}|${l.mileage_km}`;

// Простой пул: не больше n задач одновременно.
export async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  });
  await Promise.all(workers);
  return out;
}

export class Run {
  constructor({ cfg, state, rates, llm, sender, client, importSource, sleep, now }) {
    this.cfg = cfg;
    this.state = state;
    this.rates = rates;
    this.llm = llm;
    this.sender = sender;
    this.client = client;
    this.importSource = importSource || ((name) => import(`./sources/${name}.js`));
    this.sleep = sleep || tgSleep;
    this.now = now || Date.now;
    this.seenPending = new Set();
    this.seenTotal = 0;
    this.chain = Promise.resolve();
    this.report = { sites: {}, channels: { ok: 0, errors: 0, found: 0, sent: 0 } };
    this.firstRun = Object.keys(state.data.sent).length === 0;
    this.sendErrors = 0;
  }

  // Машина снова встретилась на площадке. В бот уходят только те, что он знает от нас.
  markSeen(uid) {
    const v = this.state.data.sent[uid];
    if (!v) return;
    const now = this.now();
    this.state.touch(uid, now);
    if (now - (v.ss || 0) < SEEN_REPORT_HOURS * 3600_000) return;
    if (!this.seenPending.has(uid)) { this.seenPending.add(uid); this.seenTotal++; }
    if (this.seenPending.size >= SEEN_CHUNK) this.flushSeen();
  }

  // «Ещё продаются» уходят в бот по ходу прохода, а не только в конце: если job убьют по таймауту,
  // отмеченное до этого всё равно дойдёт.
  flushSeen() {
    if (!this.seenPending.size) return this.chain;
    const uids = [...this.seenPending];
    this.seenPending.clear();
    return this.enqueue(async () => {
      for (let i = 0; i < uids.length; i += SEEN_CHUNK) {
        const part = uids.slice(i, i + SEEN_CHUNK);
        await this.sender.sendBatch([], { notify: false, seen: part });
        // Дошло: следующие сутки эти uid не повторяем. Не дошло — повторим в следующий запуск.
        const at = this.now();
        for (const u of part) if (this.state.data.sent[u]) this.state.data.sent[u].ss = at;
      }
    }, 'seen');
  }

  enqueue(fn, what) {
    this.chain = this.chain.then(fn).catch((e) => { this.sendErrors++; console.warn(`[send] ${what}:`, e.message); });
    return this.chain;
  }

  async sendAll(listings) {
    for (let i = 0; i < listings.length; i += BATCH) {
      const chunk = listings.slice(i, i + BATCH);
      // Первый запуск наполняет базу: не засыпаем подписчиков уведомлениями.
      await this.sender.sendBatch(chunk.map(toBot), { notify: !this.firstRun });
      for (const l of chunk) {
        const v = this.state.markSent(l, l._fp || fingerprint(l));
        // Карточка не загрузилась или нет курса: «не менялось» не ставим, в следующий раз дозагрузим.
        if (l._listFp && !l._partial) v.listFp = l._listFp;
      }
      this.state.save();
    }
  }

  // Порядок моделей площадки: сначала упавшие в прошлый раз, потом по кругу с курсора.
  modelOrder(name, keys) {
    const start = (this.state.data.siteCursor?.[name] || 0) % Math.max(keys.length, 1);
    const ring = keys.slice(start).concat(keys.slice(0, start));
    const retry = (this.state.data.siteRetry?.[name] || []).filter((k) => keys.includes(k));
    return { retry, ring: ring.filter((k) => !retry.includes(k)) };
  }

  async collectSites(deadline) {
    const names = this.cfg.sites || [];
    const state = this.state;
    let total = 0;
    // Раньше фото Autowini заливал сборщик (до 25 машин за запуск), у остальных в боте их нет.
    // Один раз сбрасываем «не менялось» у Autowini, чтобы машины ушли в бот заново со ссылками на фото.
    if (!state.data.autowiniPhotosV2) {
      for (const [uid, v] of Object.entries(state.data.sent || {})) if (uid.startsWith('autowini:') && v) delete v.listFp;
      state.data.autowiniPhotosV2 = true;
    }
    state.data.siteCursor = state.data.siteCursor || {};
    state.data.siteRetry = state.data.siteRetry || {};
    state.data.sweepAt = state.data.sweepAt || {};
    await Promise.all(names.map(async (name) => {
      let mod;
      try { mod = await this.importSource(name); } catch (e) { console.warn(`[${name}] модуль не загружен: ${e.message}`); return; }
      const keys = Object.keys(mod.MODELS || {});
      const { retry, ring } = this.modelOrder(name, keys);
      const st = (this.report.sites[name] = { ok: 0, errors: 0, found: 0, sent: 0, empty: 0, models: keys.length });
      const nextRetry = [];
      const tried = new Set();
      for (const key of [...retry, ...ring]) {
        if (this.now() > deadline) { console.log(`[${name}] время вышло, продолжу со следующего запуска`); break; }
        tried.add(key);
        const isRetry = retry.includes(key);
        try {
          total += await this.collectModel(name, mod, key, st, deadline);
        } catch (e) {
          console.warn(`[${name}] ${key.replace('|', ' ')}: ${e.message}`);
          st.errors++;
          st.lastError = String(e.message || e).slice(0, 200);
          // Упавшую модель повторим первой в следующий запуск; упала и при повторе — ждёт очереди по кругу.
          if (!isRetry) nextRetry.push(key);
        }
        // Курсор после каждой модели: если job убьют, следующий запуск не начнёт с той же.
        if (!isRetry) state.data.siteCursor[name] = (keys.indexOf(key) + 1) % keys.length;
        await this.sleep(1000);
      }
      // Повторы, до которых не дошли, остаются на следующий раз.
      for (const k of retry) if (!tried.has(k)) nextRetry.push(k);
      state.data.siteRetry[name] = nextRetry;
    }));
    return total;
  }

  async collectModel(name, mod, key, st, deadline) {
    const state = this.state;
    const [brand, model] = key.split('|');
    const listed = new Set();
    const onList = (list) => { for (const l of list) { listed.add(l.uid); this.markSeen(l.uid); } };
    // Уже отправленное и не изменившееся (цена, пробег) не перекачиваем.
    const isKnown = (l) => {
      const known = state.data.sent[l.uid]?.listFp === listFingerprint(l);
      if (known) this.markSeen(l.uid);
      return known;
    };
    const list = await mod.search(brand, model, { rates: this.rates, isKnown, onList, deadline });
    st.ok++;
    st.found += Math.max(list.length, listed.size);
    if (!list.length && !listed.size) st.empty++;
    for (const l of list) {
      l.price_rub = this.rates.toRub(l.price, l.currency);
      // Цена есть, а курса нет: рубли посчитаем, когда курс появится (не ставим «не менялось»).
      if (l.price != null && l.currency && l.price_rub == null) l._partial = true;
      l._listFp = listFingerprint(l);
    }
    const fresh = [];
    for (const l of list) {
      if (!state.isUnchanged(l.uid, fingerprint(l))) { fresh.push(l); continue; }
      // Не изменилось — значит, всё ещё на площадке: бот продлит жизнь. И запоминаем «не менялось»,
      // чтобы в следующий раз не грузить карточку (у Autowini его стёрла миграция фото).
      this.markSeen(l.uid);
      if (!l._partial && state.data.sent[l.uid]) state.data.sent[l.uid].listFp = l._listFp;
    }
    st.sent += fresh.length;
    await this.translateAll(fresh);
    // Отправка идёт своей очередью, площадка не ждёт её и берёт следующую модель.
    if (fresh.length) this.enqueue(() => this.sendAll(fresh), name);
    console.log(`[${name}] ${brand} ${model}: в списке ${listed.size || list.length}, отправлено ${fresh.length}`);
    if (mod.listPage) await this.sweep(name, mod, key, listed, deadline);
    return fresh.length;
  }

  // Следующие страницы списка: известные машины, ушедшие из первой страницы, тоже «ещё продаются».
  async sweep(name, mod, key, listed, deadline) {
    const sk = `${name}|${key}`;
    const at = this.state.data.sweepAt[sk] || 0;
    if (this.now() - at < SWEEP_HOURS * 3600_000) return;
    const [brand, model] = key.split('|');
    let pages = 0;
    for (let page = 2; page <= SWEEP_PAGES; page++) {
      if (this.now() > deadline) return; // не успели: досмотрим в следующий запуск
      let items;
      try { items = await mod.listPage(brand, model, page); } catch (e) { console.warn(`[${name}] ${brand} ${model} стр. ${page}: ${e.message}`); return; }
      pages++;
      let fresh = 0, known = 0;
      for (const l of items || []) {
        if (listed.has(l.uid)) continue;
        listed.add(l.uid);
        fresh++;
        if (this.state.known(l.uid)) { known++; this.markSeen(l.uid); }
      }
      // Пустая страница, повтор уже виденной (сайт не понял номер) или ни одной нашей машины — дальше не листаем.
      if (!fresh || !known) break;
      await this.sleep(800);
    }
    this.state.data.sweepAt[sk] = this.now();
    if (pages) console.log(`[${name}] ${brand} ${model}: просмотрено ещё ${pages} стр.`);
  }

  async translateAll(list) {
    // На бесплатном Groq лимит уходит на каналы; описания площадок бот переводит сам при просмотре.
    if (this.llm.provider !== 'claude') return;
    await pool(list, 3, async (l) => {
      if (!l.desc_orig || l.desc_ru) return;
      const cached = this.state.cachedTranslation(l.uid, l.desc_orig);
      if (cached && cached.desc_ru) { Object.assign(l, cached); return; }
      const specs = [l.year, l.mileage_km != null ? `${l.mileage_km} км` : null, l.engine, l.transmission].filter(Boolean).join(', ');
      const t = await this.llm.translate(`${l.brand} ${l.model} ${l.trim || ''}`.trim(), l.desc_orig, specs);
      if (t) { l.title_ru = t.title_ru; l.desc_ru = t.desc_ru; }
    });
  }

  // Каналы: отметка «прочитано» двигается только после того, как объявления канала дошли до бота.
  async collectChannels() {
    const { cfg, state, llm, sender } = this;
    let sent = 0;
    // Без LLM посты не разобрать: каналы не трогаем, чтобы не сдвигать отметку «прочитано».
    if (!llm.enabled) { console.log('[tg] каналы пропущены: нет ключа LLM'); return 0; }
    // Первый запуск с ключом: перечитать каналы заново (раньше их могли пролистать без разбора).
    // (v2: прошлый проход шёл на снятой модели Groq и ничего не разобрал.)
    if (state.data.channelsWithLlm !== 2) { state.data.channels = {}; state.data.channelsWithLlm = 2; }
    for (const ch of cfg.channels || []) {
      if (sender.flooded() && (sender.floodUntil - this.now()) > sender.maxFloodWaitMs) {
        console.warn('[tg] Telegram просит паузу: остальные каналы прочитаю в следующий раз');
        break;
      }
      try {
        const last = state.channelLastId(ch);
        if (last == null) await ensureJoined(this.client, ch);
        const { posts, maxId } = await readNewPosts(this.client, ch, last, cfg.channel_backfill || 30);
        const out = [];
        let cand = 0;
        let upTo = maxId;
        for (const p of posts) {
          if (!looksLikeListing(p)) continue;
          cand++;
          const errs0 = llm.apiErrors;
          const l = await postToListing(llm, this.rates, ch, p);
          // Ошибка LLM (лимит, ключ): этот пост и следующие перечитаем в следующий раз.
          if (llm.apiErrors > errs0) { upTo = p.id - 1; console.warn(`[tg] @${ch}: ошибка LLM, продолжу с поста ${p.id}`); break; }
          if (!l) continue;
          // Фото — раньше JSON: так у уведомления подписчикам уже будет альбом.
          // Не ушли (FloodWait): пост и следующие перечитаем, иначе фото у объявления не будет никогда.
          if (!(await sender.sendPhotos(l.uid, l._media))) { upTo = p.id - 1; console.warn(`[tg] @${ch}: фото не ушли, продолжу с поста ${p.id}`); break; }
          delete l._media;
          out.push(l);
        }
        // Сначала объявления в бот, потом отметка «прочитано»: при сбое отправки посты перечитаются.
        if (out.length) await this.sendAll(out).catch((e) => { this.sendErrors++; throw e; });
        if (upTo != null && upTo >= (last || 0)) state.setChannelLastId(ch, upTo);
        this.report.channels.ok++;
        this.report.channels.found += out.length;
        this.report.channels.sent += out.length;
        sent += out.length;
        state.save();
        console.log(`[tg] @${ch}: постов ${posts.length}, похожих ${cand}, объявлений ${out.length}`);
      } catch (e) {
        console.warn(`[tg] @${ch}: ${e.message}`);
        this.report.channels.errors++;
        this.report.channels.lastError = `@${ch}: ${String(e.message || e).slice(0, 180)}`;
      }
      await this.sleep(2000);
    }
    return sent;
  }

  async run() {
    const t0 = this.now();
    if (this.rates.load && this.state.data.rates) this.rates.load(this.state.data.rates);
    await this.rates.refresh();
    if (this.rates.dump) this.state.data.rates = this.rates.dump() || this.state.data.rates;
    // Каналы и подписки первыми: они быстрые и важнее всего.
    const fromTg = await this.collectChannels();
    try { await this.sender.refresh(); } catch (e) { console.warn('[refresh]', e.message); }
    const deadline = t0 + (this.cfg.run_minutes || 38) * 60_000;
    const fromSites = await this.collectSites(deadline);
    this.flushSeen();
    await this.chain;
    const pruned = this.state.prune();
    if (pruned) console.log(`[state] удалено ${pruned} давно не встречавшихся записей`);
    this.state.save();
    const finishedAt = this.now();
    // Последним пакетом — отчёт прохода (для /health). Старый бот незнакомое поле просто пропустит.
    try {
      await this.sender.sendBatch([], { notify: false, report: {
        ...this.report,
        startedAt: Math.floor(t0 / 1000), finishedAt: Math.floor(finishedAt / 1000),
        durationSec: Math.round((finishedAt - t0) / 1000), sent: fromSites + fromTg, seen: this.seenTotal,
        sendErrors: this.sendErrors, llmErrors: this.llm.apiErrors || 0, llmBad: this.llm.badResponses || 0,
        floodUntil: this.sender.floodUntil ? Math.floor(this.sender.floodUntil / 1000) : 0,
        runId: process.env.GITHUB_RUN_ID || null,
      } });
    } catch (e) { this.sendErrors++; console.warn('[send] report:', e.message); }
    console.log(`[run] отправлено ${fromSites + fromTg} (площадки ${fromSites}, каналы ${fromTg}), ещё продаются ${this.seenTotal}, за ${Math.round((finishedAt - t0) / 1000)} с`);
    return { sent: fromSites + fromTg, seen: this.seenTotal, sendErrors: this.sendErrors };
  }
}
