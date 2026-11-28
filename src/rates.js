// Курсы ЦБ РФ для пересчёта цен в рубли.
// Последние удачные курсы хранятся в state (dump/load): если ЦБ недоступен, берём их, а не оставляем
// price_rub пустым — пустая цена у бота проходит любой фильтр «до N ₽».
const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
const MAX_AGE = 14 * 86_400_000; // старее двух недель не верим

export class Rates {
  constructor() { this.rub = { RUB: 1 }; this.at = 0; }

  load(saved) {
    if (!saved || !saved.rub || !saved.at || Date.now() - saved.at > MAX_AGE) return false;
    this.rub = { ...saved.rub, RUB: 1 };
    this.at = saved.at;
    return true;
  }
  dump() { return this.at ? { rub: this.rub, at: this.at } : null; }
  get ready() { return Object.keys(this.rub).length > 1; }

  async refresh(fetchFn = fetch) {
    if (Date.now() - this.at < 6 * 3600_000) return;
    try {
      const r = await fetchFn(CBR_URL, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const next = { RUB: 1 };
      for (const [code, v] of Object.entries(data?.Valute || {})) if (v && v.Value > 0 && v.Nominal > 0) next[code] = v.Value / v.Nominal;
      if (Object.keys(next).length < 5) throw new Error('пустой ответ');
      this.rub = next;
      this.at = Date.now();
    } catch (e) {
      console.warn(`[rates] ЦБ недоступен (${e.message}), ${this.ready ? 'оставляю прошлый курс' : 'курсов нет: цены в рублях не посчитаны'}`);
    }
  }
  toRub(amount, currency) {
    if (amount == null || !currency) return null;
    const rate = this.rub[String(currency).toUpperCase()];
    return rate ? Math.round(amount * rate) : null;
  }
}
