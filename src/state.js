// Локальное состояние сборщика (state.json): что уже ушло в бот и до какого поста дочитан канал.
// Файл живёт в ветке state и переписывается после каждого пакета, поэтому держим его маленьким:
// вместо исходного описания храним его хеш, пустые поля не пишем, давно не встречавшееся удаляем.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

// Не встречалось на площадках столько дней: удаляем запись. Бот скрывает такие машины через 14 дней,
// так что при возвращении объявления оно просто уйдёт в бот заново.
export const PRUNE_DAYS = 45;
const DAY = 86_400_000;

// Отпечаток объявления (sha1 hex): для сравнения хватает 16 знаков. Старые 40-значные сравниваются по префиксу.
const shortFp = (fp) => String(fp).slice(0, 16);

export const descHash = (s) => (s ? createHash('sha1').update(String(s)).digest('base64').slice(0, 12) : null);

export class State {
  constructor(path = 'state.json') {
    this.path = path;
    this.data = { sent: {}, channels: {} };
    let raw = null;
    try { raw = fs.readFileSync(path, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (raw != null && raw.trim()) {
      // Битый файл — не «первый запуск»: молча начать с нуля значит заново разослать всю базу
      // подписчикам и затереть настоящую историю при сохранении.
      let parsed;
      try { parsed = JSON.parse(raw); } catch (e) { throw new Error(`state.json не читается (${e.message}): разберитесь вручную, не перезаписываю`); }
      this.data = { sent: {}, channels: {}, ...parsed };
    }
    this.compact();
  }

  // Старый формат: полный descOrig и null-поля в каждой записи. Переводим в компактный.
  compact() {
    for (const [uid, v] of Object.entries(this.data.sent)) {
      if (!v) { delete this.data.sent[uid]; continue; }
      if (v.fp) v.fp = shortFp(v.fp);
      if ('descOrig' in v) { if (v.descOrig) v.dh = descHash(v.descOrig); delete v.descOrig; }
      for (const k of ['title_ru', 'desc_ru']) if (v[k] == null) delete v[k];
    }
  }

  isUnchanged(uid, fp) { const s = this.data.sent[uid]?.fp; return Boolean(s && fp) && shortFp(s) === shortFp(fp); }
  known(uid) { return Boolean(this.data.sent[uid]); }

  cachedTranslation(uid, descOrig) {
    const s = this.data.sent[uid];
    return s && s.desc_ru && (s.dh || null) === descHash(descOrig) ? { title_ru: s.title_ru || null, desc_ru: s.desc_ru } : null;
  }

  markSent(l, fp) {
    const v = { fp: shortFp(fp), at: Date.now() };
    const dh = descHash(l.desc_orig);
    if (dh) v.dh = dh;
    // Перевод нужен только как кеш (каналы и Claude): без него запись в 5 раз меньше.
    if (l.title_ru) v.title_ru = l.title_ru;
    if (l.desc_ru) v.desc_ru = l.desc_ru;
    this.data.sent[l.uid] = v;
    return v;
  }

  // Объявление снова встретилось на площадке: запись не удаляем при чистке.
  touch(uid, now = Date.now()) {
    const v = this.data.sent[uid];
    if (v) v.seen = now;
  }

  // Удалить записи, не встречавшиеся дольше days дней. У постов каналов (tg:*) «встречи» нет:
  // их держим вдвое дольше, считая от отправки (пост не перечитывается, запись нужна как кеш).
  prune(days = PRUNE_DAYS, now = Date.now()) {
    let n = 0;
    for (const [uid, v] of Object.entries(this.data.sent)) {
      const edge = now - (uid.startsWith('tg:') ? 2 * days : days) * DAY;
      if (Math.max(v.at || 0, v.seen || 0) < edge) { delete this.data.sent[uid]; n++; }
    }
    return n;
  }

  channelLastId(name) { return this.data.channels[name] ?? null; }
  setChannelLastId(name, id) { this.data.channels[name] = id; }
  save() {
    const tmp = this.path + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.path);
  }
}
