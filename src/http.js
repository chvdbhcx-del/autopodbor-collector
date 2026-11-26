// Общий HTTP для источников: прокси, таймауты, повтор при 429/5xx, вежливые паузы.
import { fetch, ProxyAgent, EnvHttpProxyAgent } from 'undici';

const agents = new Map();
function dispatcherFor(proxy) {
  const key = proxy || (process.env.HTTPS_PROXY || process.env.https_proxy ? 'env' : '');
  if (!key) return undefined;
  if (!agents.has(key)) agents.set(key, key === 'env' ? new EnvHttpProxyAgent() : new ProxyAgent(key));
  return agents.get(key);
}

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function get(url, { headers = {}, proxy, retries = 2, timeout = 30_000, as = 'text' } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8', ...headers },
        dispatcher: dispatcherFor(proxy),
        signal: AbortSignal.timeout(timeout),
      });
      if (r.status === 429 || r.status >= 500) { last = new Error(`HTTP ${r.status}`); await sleep(3000 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return as === 'json' ? r.json() : r.text();
    } catch (e) {
      last = e;
      if (/HTTP 4\d\d/.test(e.message) && !/429/.test(e.message)) throw e;
      await sleep(1500 * (i + 1));
    }
  }
  throw last;
}
