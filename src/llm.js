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

const TRANSLATE_SYSTEM =
  'Ты переводишь объявления о продаже автомобилей на русский для покупателей из России. ' +
  'Переводи точно, сохраняй цифры, комплектацию и состояние. Убирай рекламные штампы, телефоны и ссылки. ' +
  'Если описания нет, напиши короткое описание по характеристикам.';

const EXTRACT_SYSTEM =
  'Ты разбираешь посты из Telegram-каналов автоподборщиков. Определи, предлагается ли в посте одна конкретная машина, ' +
  'и извлеки поля. Не выдумывай: если поля нет в тексте, ставь null. ' +
  'Цену бери ту, что указана для покупателя, а её условия пиши в price_note. ' +
  'Пост с несколькими машинами, отзыв клиента или реклама услуг: is_car_listing=false.';

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// Подсказка для JSON-режима Groq: перечень полей схемы.
function fieldsHint(schema) {
  const shape = schema.shape || {};
  return Object.entries(shape).map(([k, v]) => `${k}${v.description ? ` (${v.description})` : ''}`).join('; ');
}

export class LLM {
  constructor() {
    this.groqKey = process.env.GROQ_API_KEY || null;
    const anthropic = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
    this.enabled = anthropic || !!this.groqKey;
    this.client = anthropic ? new Anthropic() : null;
    if (!this.enabled) console.warn('[llm] нет ANTHROPIC_API_KEY или GROQ_API_KEY: перевод и разбор постов выключены');
    else console.log(`[llm] ${this.client ? `Claude ${MODEL}` : `Groq ${GROQ_MODEL}`}`);
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
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.groqKey}` },
          body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
        });
        if (r.status === 429) { await new Promise((res) => setTimeout(res, 5000 * (i + 1))); continue; }
        const data = await r.json();
        if (!r.ok) { console.error(`[llm] Groq ${r.status}: ${data?.error?.message}`); return null; }
        const parsed = schema.safeParse(JSON.parse(data.choices[0].message.content));
        return parsed.success ? parsed.data : null;
      } catch (e) {
        console.error('[llm] Groq', e.message);
        return null;
      }
    }
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
