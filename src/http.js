// Общий HTTP для источников: прокси, таймауты, повтор при 429/5xx, вежливые паузы, замедление после 429.
import { fetch, ProxyAgent, EnvHttpProxyAgent } from 'undici';

const agents = new Map();
function dispatcherFor(proxy) {
  const key = proxy || (process.env.HTTPS_PROXY || process.env.https_proxy ? 'env' : '');
  if (!key) return undefined;
  if (!agents.has(key)) agents.set(key, key === 'env' ? new EnvHttpProxyAgent() : new ProxyAgent(key));
  return agents.get(key);
}

// Свежий Chrome: старая версия в User-Agent — частый повод для антибот-защиты отдать заглушку.
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Дедлайн прохода: источники проверяют его между карточками, чтобы зависшая площадка не съела весь запуск.
export const timeUp = (deadline) => Boolean(deadline) && Date.now() > deadline;
// Сколько самых новых объявлений модели дозагружать карточкой за проход. Остальные из списка
// только отмечаются как «ещё продаются» (onList).
export const DETAIL_TOP = 30;

// Площадка ответила 429: замедляем все запросы к этому хосту (общая пауза, удваивается при повторе,
// понемногу отпускает при удачных ответах). Retry-After уважаем.
const hosts = new Map();
const hostOf = (url) => { try { return new URL(url).host; } catch { return ''; } };
export function throttle(host) {
  if (!hosts.has(host)) hosts.set(host, { gap: 0, next: 0 });
  return hosts.get(host);
}
export function note429(host, retryAfterSec) {
  const h = throttle(host);
  h.gap = Math.min(30_000, Math.max(2000, h.gap * 2));
  const wait = Math.min(120_000, Math.max(h.gap, (Number(retryAfterSec) || 0) * 1000));
  h.next = Math.max(h.next, Date.now() + wait);
  console.warn(`[http] ${host}: 429, пауза ${Math.round(wait / 1000)} с, дальше не чаще раза в ${Math.round(h.gap / 1000)} с`);
}
export function noteOk(host) {
  const h = hosts.get(host);
  if (h && h.gap) h.gap = h.gap > 1000 ? Math.round(h.gap * 0.8) : 0;
}
export async function waitHost(host) {
  const h = hosts.get(host);
  if (!h) return;
  const now = Date.now();
  const at = Math.max(h.next, now);
  h.next = at + h.gap;
  if (at > now) await sleep(at - now);
}
export function resetThrottle() { hosts.clear(); }

export async function get(url, { headers = {}, proxy, retries = 2, timeout = 30_000, as = 'text' } = {}) {
  let last, busy = 0;
  const host = hostOf(url);
  for (let i = 0; i <= retries; i++) {
    try {
      await waitHost(host);
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8', ...headers },
        dispatcher: dispatcherFor(proxy),
        signal: AbortSignal.timeout(timeout),
      });
      if (r.status === 429) { last = new Error('HTTP 429'); note429(host, r.headers.get('retry-after')); if (++busy <= 3) i--; continue; }
      if (r.status >= 500) { last = new Error(`HTTP ${r.status}`); await sleep(3000 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      noteOk(host);
      return as === 'json' ? r.json() : r.text();
    } catch (e) {
      last = e;
      if (/HTTP 4\d\d/.test(e.message) && !/429/.test(e.message)) throw e;
      await sleep(1500 * (i + 1));
    }
  }
  throw last;
}
