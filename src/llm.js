// Перевод описаний и разбор постов из каналов: Claude API (ANTHROPIC_API_KEY) или Groq (GROQ_API_KEY).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const MODEL = process.env.LLM_MODEL || 'claude-opus-5-5';

const Translation = z.object({
  title_ru: z.string().describe('Короткий заголовок по-русски: марка, модель, комплектация'),
  desc_ru: z.string().describe('Описание продавца на русском, без воды, до 600 символов'),
});

const PostCar = z.object({
  is_car_listing: z.boolean().describe('true, если пост предлагает одну конкретную машину'),
  brand: z.string().nullable().describe('Марка латиницей: Hyundai, Kia, Toyota, BYD, Mercedes-Benz'),
  model: z.string().nullable().describe('Модель латиницей: Grand Starex, Staria, Carnival, Land Cruiser Prado'),
  trim: z.string().nullable(),
  year: z.number().int().nullable(),
  month: z.number().int().nullable(),
  mileage_km: z.number().int().nullable(),
  fuel: z.enum(['diesel', 'petrol', 'hybrid', 'ev', 'lpg']).nullable(),
  transmission: z.string().nullable().describe('АКПП, МКПП, вариатор, робот'),
  drive: z.string().nullable().describe('2WD, 4WD, AWD'),
  engine: z.string().nullable().describe('Объём или мощность, например 2.5 или 2.2 CRDi'),
  price: z.number().nullable(),
  currency: z.enum(['RUB', 'USD', 'EUR', 'KRW', 'JPY', 'CNY']).nullable(),
  price_note: z.string().nullable().describe('Условия цены: «под ключ во Владивостоке», «в Корее», «без растаможки»'),
  location: z.string().nullable(),
  title_ru: z.string().nullable(),
  desc_ru: z.string().nullable().describe('Суть поста по-русски, до 400 символов, без контактов и хэштегов'),
});

// Groq отвечает в JSON-режиме без строгой схемы: год строкой, «Diesel» с большой буквы, цена «2 650 000».
// Приводим такие ответы к схеме, а не выбрасываем пост как «не объявление».
const FUELS = ['diesel', 'petrol', 'hybrid', 'ev', 'lpg'];
const FUEL_ALIASES = { gasoline: 'petrol', gas: 'petrol', бензин: 'petrol', дизель: 'diesel', гибрид: 'hybrid', electric: 'ev', электро: 'ev', газ: 'lpg' };
const CURRENCIES = ['RUB', 'USD', 'EUR', 'KRW', 'JPY', 'CNY'];
const CUR_ALIASES = { '₽': 'RUB', РУБ: 'RUB', 'РУБ.': 'RUB', '$': 'USD', '€': 'EUR', '₩': 'KRW', '¥': 'JPY', YUAN: 'CNY', RMB: 'CNY' };
const toNum = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[\s\u00a0]/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && /\d/.test(String(v)) ? n : null;
};
const toInt = (v) => { const n = toNum(v); return n == null ? null : Math.round(n); };
const toStr = (v) => (v == null || v === '' ? null : typeof v === 'string' ? v : String(v));
export function normalizePost(o) {
  if (!o || typeof o !== 'object') return o;
  const out = { ...o };
  if (typeof out.is_car_listing === 'string') out.is_car_listing = /^(true|yes|да|1)$/i.test(out.is_car_listing.trim());
  for (const k of ['year', 'month', 'mileage_km']) if (k in out) out[k] = toInt(out[k]);
  if ('price' in out) out.price = toNum(out.price);
  for (const k of ['brand', 'model', 'trim', 'transmission', 'drive', 'engine', 'price_note', 'location', 'title_ru', 'desc_ru']) if (k in out) out[k] = toStr(out[k]);
  if (out.fuel != null) { const f = String(out.fuel).trim().toLowerCase(); out.fuel = FUELS.includes(f) ? f : FUEL_ALIASES[f] || null; }
  if (out.currency != null) { const c = String(out.currency).trim().toUpperCase(); out.currency = CURRENCIES.includes(c) ? c : CUR_ALIASES[c] || null; }
  for (const k of Object.keys(PostCar.shape)) if (!(k in out)) out[k] = k === 'is_car_listing' ? false : null;
  return out;
}

const TRANSLATE_SYSTEM =
  'Ты переводишь объявления о продаже автомобилей на русский для покупателей из России. ' +
  'Переводи точно, сохраняй цифры, комплектацию и состояние. Убирай рекламные штампы, телефоны и ссылки. ' +
  'Если описания нет, напиши короткое описание по характеристикам.';

const EXTRACT_SYSTEM =
  'Ты разбираешь посты из Telegram-каналов автоподборщиков. Определи, предлагается ли в посте одна конкретная машина, ' +
  'и извлеки поля. Не выдумывай: если поля нет в тексте, ставь null. ' +
  'Цену бери ту, что указана для покупателя, а её условия пиши в price_note. ' +
  'Пост с несколькими машинами, отзыв клиента или реклама услуг: is_car_listing=false.';

// Groq снимает модели с линейки без предупреждения: при 404 берём первую доступную из списка.
export const GROQ_PREFERRED = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'];
let GROQ_MODEL = process.env.GROQ_MODEL || GROQ_PREFERRED[0];

export function pickGroqModel(available, current) {
  return GROQ_PREFERRED.find((m) => m !== current && available.includes(m)) || null;
}

// Подсказка для JSON-режима Groq: перечень полей схемы.
function fieldsHint(schema) {
  const shape = schema.shape || {};
  return Object.entries(shape).map(([k, v]) => `${k}${v.description ? ` (${v.description})` : ''}`).join('; ');
}

export class LLM {
  constructor() {
    this.groqKey = process.env.GROQ_API_KEY || null;
    // Ошибки API (не «пост не про машину»): по ним main.js не сдвигает отметку прочитанного в каналах.
    this.apiErrors = 0;
    // Ответы, которые не удалось разобрать даже после повтора (пост пропущен).
    this.badResponses = 0;
    const anthropic = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
    this.enabled = anthropic || !!this.groqKey;
    this.client = anthropic ? new Anthropic() : null;
    this.provider = anthropic ? 'claude' : this.groqKey ? 'groq' : null;
    if (!this.enabled) console.warn('[llm] нет ANTHROPIC_API_KEY или GROQ_API_KEY: перевод и разбор постов выключены');
    else console.log(`[llm] ${this.client ? `Claude ${MODEL}` : `Groq ${GROQ_MODEL}`}`);
  }

  async #switchGroqModel() {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${this.groqKey}` }, signal: AbortSignal.timeout(20_000) });
      const ids = ((await r.json()).data || []).map((m) => m.id);
      const next = pickGroqModel(ids, GROQ_MODEL);
      if (!next) return false;
      console.log(`[llm] Groq: модели ${GROQ_MODEL} нет, перехожу на ${next}`);
      GROQ_MODEL = next;
      return true;
    } catch { return false; }
  }

  async #groq(system, text, schema) {
    const body = {
      model: GROQ_MODEL,
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${system}\nОтветь только JSON-объектом с полями: ${fieldsHint(schema)}. Отсутствующее ставь null.` },
        { role: 'user', content: text },
      ],
    };
    let badRetried = false;
    for (let i = 0; i < 5; i++) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.groqKey}` },
          body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
        });
        if (r.status === 429) {
          // Groq говорит, сколько ждать; дольше минуты не ждём.
          const wait = Math.min(60, Number(r.headers.get('retry-after')) || 5 * (i + 1));
          await new Promise((res) => setTimeout(res, wait * 1000));
          continue;
        }
        const data = await r.json();
        if (r.status === 404 && /model/i.test(data?.error?.message || '') && await this.#switchGroqModel()) { body.model = GROQ_MODEL; continue; }
        if (!r.ok) { this.apiErrors++; console.error(`[llm] Groq ${r.status}: ${data?.error?.message}`); return null; }
        // Плохой ответ (пустой content у gpt-oss, не JSON, не по схеме) — не ошибка API: один раз переспрашиваем,
        // потом пропускаем пост, но пишем в лог, чтобы потери было видно.
        const content = data?.choices?.[0]?.message?.content;
        let parsed = null, why = 'пустой ответ';
        if (content && String(content).trim()) {
          try {
            const obj = JSON.parse(content);
            parsed = schema.safeParse(schema === PostCar ? normalizePost(obj) : obj);
            if (!parsed.success) why = `не по схеме: ${parsed.error.issues.slice(0, 3).map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`;
          } catch { why = 'не JSON'; }
        }
        if (parsed?.success) return parsed.data;
        if (!badRetried) { badRetried = true; console.warn(`[llm] Groq: ${why}, переспрашиваю`); continue; }
        this.badResponses++;
        console.warn(`[llm] Groq: ${why}, пропускаю`);
        return null;
      } catch (e) {
        this.apiErrors++;
        console.error('[llm] Groq', e.message);
        return null;
      }
    }
    this.apiErrors++;
    console.warn('[llm] Groq: лимит запросов, пропускаю');
    return null;
  }

  async #parse(system, text, schema) {
    if (!this.client) return this.#groq(system, text, schema);
    try {
      const resp = await this.client.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: text }],
        // Простая задача: низкое усилие экономит токены.
        output_config: { format: zodOutputFormat(schema), effort: 'low' },
      });
      if (resp.stop_reason === 'refusal') return null;
      return resp.parsed_output ?? null;
    } catch (e) {
      this.apiErrors++;
      if (e instanceof Anthropic.RateLimitError) console.warn('[llm] лимит запросов, пропускаю до следующего прохода');
      else if (e instanceof Anthropic.APIError) console.error(`[llm] ошибка API ${e.status}: ${e.message}`);
      else console.error('[llm]', e.message);
      return null;
    }
  }

  translate(title, desc, specs) {
    if (!this.enabled) return null;
    const text = `Заголовок: ${title}\nХарактеристики: ${specs}\n\nОписание продавца:\n${desc || '(нет)'}`;
    return this.#parse(TRANSLATE_SYSTEM, text.slice(0, 8000), Translation);
  }

  extractPost(text) {
    if (!this.enabled) return null;
    return this.#parse(EXTRACT_SYSTEM, text.slice(0, 6000), PostCar);
  }
}
