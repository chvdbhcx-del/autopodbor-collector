// Подключение userbot-аккаунта (GramJS) и отправка данных в бот.
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { CustomFile } from 'telegram/client/uploads.js';
import { Api } from 'telegram';

export function makeClient(session = process.env.TG_SESSION || '') {
  const apiId = Number(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH;
  if (!apiId || !apiHash) throw new Error('Заполните TG_API_ID и TG_API_HASH в .env (ключи с my.telegram.org)');
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });
  client.setLogLevel('error');
  return client;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GramJS сам ждёт при FloodWait до floodSleepThreshold (60 с); дольше — бросает ошибку, её ловит noteFlood.
// Пауза общая для фото и пакетов: под FloodWait аккаунт не может отправить в бот ничего.
export class BotSender {
  constructor(client, botUsername) {
    this.client = client;
    this.bot = botUsername.replace(/^@/, '');
    // Паузу FloodWait до 2 минут пережидаем на месте, дольше — откладываем отправку до следующего запуска.
    this.maxFloodWaitMs = 120_000;
    // Паузы перед повторами при временных ошибках Telegram (500, обрыв).
    this.retryDelays = [3000, 10_000];
  }

  // Служебные сообщения не должны оставаться в чате аккаунта: бот удаляет их у обеих сторон,
  // а здесь подчищаем у себя на случай, если бот не успел.
  async forget(sent) {
    const ids = (Array.isArray(sent) ? sent : [sent]).map((m) => m && m.id).filter(Boolean);
    if (!ids.length) return;
    try { await this.client.deleteMessages(this.bot, ids, { revoke: false }); } catch { /* уже удалено */ }
  }

  // Очистить переписку с ботом у себя (в начале каждого запуска).
  async clearChat() {
    try {
      const peer = await this.client.getInputEntity(this.bot);
      await this.client.invoke(new Api.messages.DeleteHistory({ peer, maxId: 0, justClear: true, revoke: false }));
    } catch (e) { console.warn('[send] не очистил чат с ботом:', e.message); }
  }

  // Telegram ответил FloodWait: до этого момента фото не грузим, иначе ожидание только растёт.
  flooded() { return Date.now() < (this.floodUntil || 0); }
  noteFlood(e) {
    if (e?.flood) return true;
    const sec = e?.seconds || Number(/wait of (\d+) seconds/.exec(e?.message || '')?.[1]) || Number(/FLOOD_WAIT_(\d+)/.exec(e?.message || '')?.[1]);
    if (!sec) return false;
    this.floodUntil = Math.max(this.floodUntil || 0, Date.now() + sec * 1000);
    console.warn(`[send] Telegram просит паузу ${sec} с`);
    return true;
  }

  // Фото поста канала: бот запомнит file_id по подписи «#ingest <uid> <pos>». true, если ушли все.
  async sendPhotos(uid, photos) {
    if (!photos.length) return true;
    try { await this.#gate('photos'); } catch { return false; }
    // Все фото поста, пачками по 10 (больше Telegram в один альбом не берёт). Бот хранит до 60.
    const all = photos.slice(0, 60);
    for (let off = 0; off < all.length; off += 10) {
      const list = all.slice(off, off + 10);
      try {
        await this.forget(await this.client.sendFile(this.bot, { file: list, caption: list.map((_, i) => `#ingest ${uid} ${off + i}`) }));
      } catch (e) {
        if (this.noteFlood(e)) return false;
        console.warn(`[send] альбом ${uid} не ушёл (${e.message}), шлю по одному`);
        for (let i = 0; i < list.length; i++) {
          try { await this.forget(await this.client.sendFile(this.bot, { file: list[i], caption: `#ingest ${uid} ${off + i}` })); } catch (e2) { if (this.noteFlood(e2)) return false; }
          await sleep(400);
        }
      }
      await sleep(700);
    }
    return true;
  }

  // Перед отправкой: если Telegram велел ждать, короткую паузу переждём, а длинную — нет:
  // бросаем ошибку сразу, вызывающий не отметит пакет отправленным и повторит его в следующий запуск.
  async #gate(what) {
    const left = (this.floodUntil || 0) - Date.now();
    if (left <= 0) return;
    if (left <= this.maxFloodWaitMs) { await sleep(left + 1000); return; }
    throw new FloodError(Math.ceil(left / 1000), what);
  }

  async #send(what, fn) {
    for (let i = 0; ; i++) {
      await this.#gate(what);
      try { return await fn(); } catch (e) {
        if (this.noteFlood(e)) throw new FloodError(e.seconds || Math.ceil(((this.floodUntil || 0) - Date.now()) / 1000), what);
        // Сбой на стороне Telegram (500 FILE_WRITE_EMPTY и т. п.) обычно проходит при повторе.
        if (!isTransient(e) || i >= this.retryDelays.length) throw e;
        console.warn(`[send] ${what}: ${e.message}, повтор через ${Math.round(this.retryDelays[i] / 1000)} с`);
        await sleep(this.retryDelays[i]);
      }
    }
  }

  // Попросить бот обновить подписки по площадкам, которые он опрашивает сам.
  async refresh() {
    await this.#send('refresh', async () => this.forget(await this.client.sendMessage(this.bot, { message: '#refresh' })));
  }

  // Пакет объявлений одним JSON-файлом.
  async sendBatch(listings, { notify = true, seen, report } = {}) {
    const body = Buffer.from(JSON.stringify({ v: 1, notify, listings, ...(seen ? { seen } : {}), ...(report ? { report } : {}) }), 'utf8');
    const name = `batch-${Date.now()}.json`;
    await this.#send('batch', async () => this.forget(await this.client.sendFile(this.bot, { file: new CustomFile(name, body.length, '', body), forceDocument: true })));
    await sleep(1500);
  }
}

// Временные ошибки Telegram: внутренние (500), запись файла, таймаут и обрыв соединения.
export function isTransient(e) {
  const code = Number(e?.code);
  const msg = String(e?.errorMessage || e?.message || '');
  return code >= 500 || /^5\d\d\b|FILE_WRITE|INTERNAL|RPC_CALL_FAIL|RPC_MCGET_FAIL|WORKER_BUSY|TIMEOUT|Timeout|ECONNRESET|socket hang up|Not connected/.test(msg);
}

// Telegram попросил паузу дольше, чем мы готовы ждать в этом запуске.
export class FloodError extends Error {
  constructor(seconds, what = '') {
    super(`FloodWait ${seconds} с${what ? ` (${what})` : ''}`);
    this.seconds = seconds;
    this.flood = true;
  }
}
