// Локальное состояние сборщика (state.json): что уже ушло в бот и до какого поста дочитан канал.
import fs from 'node:fs';

export class State {
  constructor(path = 'state.json') {
    this.path = path;
    this.data = { sent: {}, channels: {} };
    try { this.data = { sent: {}, channels: {}, ...JSON.parse(fs.readFileSync(path, 'utf8')) }; } catch { /* первый запуск */ }
  }
  isUnchanged(uid, fp) { return this.data.sent[uid]?.fp === fp; }
  cachedTranslation(uid, descOrig) {
    const s = this.data.sent[uid];
    return s && s.descOrig === (descOrig || null) ? { title_ru: s.title_ru, desc_ru: s.desc_ru } : null;
  }
  markSent(l, fp) {
    this.data.sent[l.uid] = { fp, title_ru: l.title_ru || null, desc_ru: l.desc_ru || null, descOrig: l.desc_orig || null, at: Date.now() };
  }
  channelLastId(name) { return this.data.channels[name] ?? null; }
  setChannelLastId(name, id) { this.data.channels[name] = id; }
  save() {
    const tmp = this.path + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.path);
  }
}
