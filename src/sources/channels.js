// Telegram-каналы продавцов: читаем новые посты userbot-аккаунтом, склеиваем альбомы,
// LLM решает, объявление ли это, и вытаскивает поля.
import { Api } from 'telegram';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ensureJoined(client, channel) {
  try {
    await client.invoke(new Api.channels.JoinChannel({ channel }));
  } catch (e) {
    if (!/USER_ALREADY_PARTICIPANT/.test(e.message || '')) console.warn(`[tg] не вступил в @${channel}: ${e.message}`);
  }
}

// Посты после lastId. Альбом (несколько сообщений с одним groupedId) склеивается в один пост.
export async function readNewPosts(client, channel, lastId, backfill = 30) {
  const opts = lastId ? { minId: lastId, limit: 200 } : { limit: backfill };
  const msgs = await client.getMessages(channel, opts);
  const posts = new Map();
  for (const m of [...msgs].reverse()) {
    if (!m || !m.id) continue;
    const key = m.groupedId ? `g${m.groupedId.toString()}` : `m${m.id}`;
    let p = posts.get(key);
    if (!p) { p = { id: m.id, date: m.date, text: '', photos: [] }; posts.set(key, p); }
    if (m.message && m.message.length > p.text.length) p.text = m.message;
    if (m.photo) p.photos.push(m.photo);
    p.id = Math.min(p.id, m.id);
  }
  const maxId = msgs.reduce((a, m) => Math.max(a, m?.id || 0), lastId || 0);
  return { posts: [...posts.values()], maxId };
}

// Быстрый фильтр до LLM: без цифр года/цены и без фото это не объявление.
export function looksLikeListing(p) {
  if (!p.text || p.text.length < 40) return false;
  if (!p.photos.length) return false;
  return /(19|20)\d{2}/.test(p.text) && /(₽|руб|\$|€|¥|₩|млн|тыс|цена|стоимост|под ключ)/i.test(p.text);
}

export async function postToListing(llm, rates, channel, p) {
  const car = await llm.extractPost(p.text);
  if (!car || !car.is_car_listing || !car.brand || !car.model) return null;
  const priceRub = car.currency === 'RUB' ? car.price : rates.toRub(car.price, car.currency);
  return {
    uid: `tg:${channel.toLowerCase()}:${p.id}`,
    source: 'tg',
    source_label: `@${channel}`,
    region: null,
    url: `https://t.me/${channel}/${p.id}`,
    brand: car.brand,
    model: car.model,
    trim: car.trim,
    year: car.year,
    month: car.month,
    mileage_km: car.mileage_km,
    fuel: car.fuel,
    transmission: car.transmission,
    drive: car.drive,
    engine: car.engine,
    price: car.price,
    currency: car.currency,
    price_rub: priceRub != null ? Math.round(priceRub) : null,
    price_note: car.price_note,
    location: car.location,
    title_ru: car.title_ru,
    desc_ru: car.desc_ru,
    from_text: true,
    posted_at: p.date,
    photos: [],            // фото уходят в бот отдельными сообщениями
    _media: p.photos,
  };
}

export { sleep };
