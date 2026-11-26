// Вход запасного аккаунта по QR-коду прямо в GitHub Actions (workflow «login»).
// QR печатается в лог; его сканируют в приложении Telegram: Настройки → Устройства → Подключить устройство.
// Строка сессии не печатается: она шифруется ключом из TG_API_HASH и кладётся в ветку state (session.enc).
import fs from 'node:fs';
import qrcode from 'qrcode-terminal';
import { makeClient } from './tg.js';
import { encryptSession } from './session.js';

const client = makeClient('');
await client.connect();
let shown = 0;
const user = await client.signInUserWithQrCode(
  { apiId: Number(process.env.TG_API_ID), apiHash: process.env.TG_API_HASH },
  {
    qrCode: async ({ token }) => {
      shown++;
      const url = `tg://login?token=${Buffer.from(token).toString('base64url')}`;
      console.log(`\n===== QR #${shown}: отсканируйте в течение 30 секунд (Настройки → Устройства → Подключить устройство) =====\n`);
      qrcode.generate(url, { small: true }, (q) => console.log(q));
      if (shown > 12) throw new Error('QR так и не отсканировали, запустите заново');
    },
    password: async () => {
      if (!process.env.TG_2FA) throw new Error('У аккаунта включён облачный пароль: добавьте секрет TG_2FA и запустите заново');
      return process.env.TG_2FA;
    },
    onError: async (e) => { console.error('Ошибка входа:', e.message); return true; },
  },
);
fs.writeFileSync('session.enc', encryptSession(client.session.save(), process.env.TG_API_HASH));
console.log(`\nВошёл как ${user.firstName || ''} (id ${user.id}). Отправьте боту с админского аккаунта: /ingest ${user.id}`);
await client.disconnect();
process.exit(0);
