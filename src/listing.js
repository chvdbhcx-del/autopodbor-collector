// Единый формат объявления. Поля совпадают с тем, что принимает бот (bot/tgcloud/lib/ingest.js).
import { createHash } from 'node:crypto';

export const BOT_FIELDS = [
  'uid', 'source', 'source_label', 'region', 'url', 'brand', 'model', 'trim', 'year', 'month',
  'mileage_km', 'fuel', 'transmission', 'drive', 'engine', 'seats', 'price', 'currency', 'price_rub',
  'price_note', 'location', 'title_ru', 'desc_ru', 'desc_orig', 'photos', 'from_text', 'posted_at',
];

export function toBot(l) {
  const out = {};
  for (const k of BOT_FIELDS) if (l[k] !== undefined && l[k] !== null) out[k] = l[k];
  return out;
}

// Меняется, если поменялось то, что видит пользователь: цена, пробег, фото, текст.
export function fingerprint(l) {
  const key = JSON.stringify([l.price, l.price_rub, l.mileage_km, (l.photos || []).slice(0, 3), l.desc_orig || null]);
  return createHash('sha1').update(key).digest('hex');
}
