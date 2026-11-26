// Сессия userbot хранится зашифрованной (AES-256-GCM, ключ — sha256 от TG_API_HASH).
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
