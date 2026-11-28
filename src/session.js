// Сессия userbot хранится зашифрованной (AES-256-GCM) в ветке state.
// Ключ — секрет SESSION_KEY (случайная строка, только для этого). Пока его нет, ключ берётся
// из TG_API_HASH, как раньше; файл, зашифрованный старым ключом, читается и после появления SESSION_KEY.
import crypto from 'node:crypto';

const keyFrom = (secret) => crypto.createHash('sha256').update(`autopodbor:${secret}`).digest();

export function encryptSession(session, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([c.update(session, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

export function decryptSession(blob, secret) {
  const b = Buffer.from(blob.trim(), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', keyFrom(secret), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

// Ключ для шифрования новых файлов.
export const sessionSecret = (env = process.env) => env.SESSION_KEY || env.TG_API_HASH;

// Расшифровать session.enc. reencrypted — тот же файл под SESSION_KEY, если он был под старым ключом.
export function openSession(blob, env = process.env) {
  const keys = [env.SESSION_KEY, env.TG_API_HASH].filter(Boolean);
  let last;
  for (const k of keys) {
    try {
      const session = decryptSession(blob, k);
      return { session, reencrypted: env.SESSION_KEY && k !== env.SESSION_KEY ? encryptSession(session, env.SESSION_KEY) : null };
    } catch (e) { last = e; }
  }
  throw new Error(`session.enc не расшифровался${last ? ` (${last.message})` : ''}: проверьте SESSION_KEY или войдите заново`);
}
