// Первый вход userbot-аккаунта. Печатает строку сессии: вставьте её в .env как TG_SESSION.
import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { makeClient } from './tg.js';

const rl = readline.createInterface({ input, output });
const client = makeClient('');
await client.start({
  phoneNumber: () => rl.question('Телефон аккаунта для каналов (+7...): '),
  password: () => rl.question('Пароль двухэтапной проверки (если есть): '),
  phoneCode: () => rl.question('Код из Telegram: '),
  onError: (e) => console.error(e.message),
});
console.log('\nГотово. Добавьте в .env строку:\n');
console.log(`TG_SESSION=${client.session.save()}\n`);
console.log('Никому не передавайте её: это полный доступ к аккаунту.');
await client.disconnect();
rl.close();
process.exit(0);
