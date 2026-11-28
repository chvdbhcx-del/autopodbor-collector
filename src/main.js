// Сборщик: обходит площадки, закрытые для серверов бота, и Telegram-каналы, переводит, шлёт пакеты в бот.
// В конце просит бот обновить подписки по площадкам, которые бот опрашивает сам («#refresh»).
// Сам проход — src/collect.js.
//   npm start        — работать постоянно, проход раз в interval_minutes
//   npm run once     — один проход и выход (для cron)
import 'dotenv/config';
import fs from 'node:fs';
import YAML from 'yaml';
import { State } from './state.js';
import { Rates } from './rates.js';
import { LLM } from './llm.js';
import { makeClient, BotSender } from './tg.js';
import { openSession } from './session.js';
import { Run } from './collect.js';
import { sleep } from './sources/channels.js';

const cfg = YAML.parse(fs.readFileSync(new URL('../config.yaml', import.meta.url), 'utf8'));

async function main() {
  const bot = process.env.BOT_USERNAME;
  if (!bot) throw new Error('Заполните BOT_USERNAME в .env');
  // В Actions сессия лежит зашифрованной в ветке state (её создаёт workflow «login»).
  if (!process.env.TG_SESSION && fs.existsSync('session.enc')) {
    const { session, reencrypted } = openSession(fs.readFileSync('session.enc', 'utf8'));
    process.env.TG_SESSION = session;
    // Появился SESSION_KEY: перешифровываем файл им, шаг «Save state» положит новый в ветку state.
    if (reencrypted) { fs.writeFileSync('session.enc', reencrypted); console.log('[tg] session.enc перешифрован ключом SESSION_KEY'); }
  }
  if (!process.env.TG_SESSION) throw new Error('Нет TG_SESSION: сначала выполните вход (workflow «login» или npm run login)');
  const client = makeClient();
  await client.connect();
  if (!(await client.checkAuthorization())) throw new Error('Сессия недействительна: выполните npm run login заново');
  const me = await client.getMe();
  console.log(`[tg] вошёл как ${me.firstName || ''} (id ${me.id}). Этот id укажите боту как ingest_user_ids.`);

  const sender = new BotSender(client, bot);
  await sender.clearChat();
  // Битый state.json бросает ошибку здесь: лучше красный запуск, чем повторная рассылка всей базы.
  const state = new State(new URL('../state.json', import.meta.url).pathname);
  const rates = new Rates();
  const llm = new LLM();

  const once = process.argv.includes('--once');
  let failed = false;
  do {
    try {
      const r = await new Run({ cfg, state, rates, llm, sender, client }).run();
      // Часть пакетов не дошла до бота (FloodWait, обрыв): запуск красный, чтобы это было видно в Actions и /health.
      if (r.sendErrors) failed = true;
    } catch (e) { console.error('[run]', e); failed = true; }
    if (once) break;
    failed = false;
    await sleep((cfg.interval_minutes || 30) * 60_000);
  } while (true);
  await client.disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
