// Курсы ЦБ РФ для пересчёта цен в рубли.
const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';

export class Rates {
  constructor() { this.rub = { RUB: 1 }; this.at = 0; }
  async refresh() {
    if (Date.now() - this.at < 6 * 3600_000) return;
    try {
      const r = await fetch(CBR_URL, { signal: AbortSignal.timeout(20_000) });
      const data = await r.json();
      for (const [code, v] of Object.entries(data.Valute)) this.rub[code] = v.Value / v.Nominal;
      this.at = Date.now();
    } catch (e) {
      console.warn('[rates] ЦБ недоступен, оставляю прошлый курс:', e.message);
    }
  }
  toRub(amount, currency) {
    if (amount == null || !currency) return null;
    const rate = this.rub[String(currency).toUpperCase()];
    return rate ? Math.round(amount * rate) : null;
  }
}
