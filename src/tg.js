// Подключение userbot-аккаунта (GramJS) и отправка данных в бот.
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { CustomFile } from 'telegram/client/uploads.js';

export function makeClient(session = process.env.TG_SESSION || '') {
  const apiId = Number(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH;
  if (!apiId || !apiHash) throw new Error('Заполните TG_API_ID и TG_API_HASH в .env (ключи с my.telegram.org)');
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });
  client.setLogLevel('error');
  return client;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GramJS сам ждёт при FloodWait до floodSleepThreshold; добавляем короткую паузу между отправками.
export class BotSender {
  constructor(client, botUsername) {
    this.client = client;
    this.bot = botUsername.replace(/^@/, '');
  }

  // Фото поста канала: бот запомнит file_id по подписи «#ingest <uid> <pos>».
  async sendPhotos(uid, photos) {
    if (!photos.length) return;
    const list = photos.slice(0, 10);
    try {
      await this.client.sendFile(this.bot, { file: list, caption: list.map((_, i) => `#ingest ${uid} ${i}`) });
    } catch (e) {
      console.warn(`[send] альбом ${uid} не ушёл (${e.message}), шлю по одному`);
      for (let i = 0; i < list.length; i++) {
        try { await this.client.sendFile(this.bot, { file: list[i], caption: `#ingest ${uid} ${i}` }); } catch { /* пропуск */ }
        await sleep(400);
      }
    }
    await sleep(700);
  }

  // Пакет объявлений одним JSON-файлом.
  async sendBatch(listings, { notify = true } = {}) {
    const body = Buffer.from(JSON.stringify({ v: 1, notify, listings }), 'utf8');
    const name = `batch-${Date.now()}.json`;
    await this.client.sendFile(this.bot, { file: new CustomFile(name, body.length, '', body), forceDocument: true });
    await sleep(1500);
  }
}
