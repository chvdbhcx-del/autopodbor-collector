// Скачивает страницы площадок в samples/ (для разработки разборщиков).
import fs from 'node:fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const list = JSON.parse(process.env.URLS);
fs.mkdirSync('samples', { recursive: true });
for (const [name, u, opt] of list) {
  try {
    const r = await fetch(u, { method: opt?.method || 'GET', body: opt?.body, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...(opt?.headers || {}) }, signal: AbortSignal.timeout(30000) });
    const b = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(`samples/${name}`, b);
    console.log(name, r.status, b.length, r.url);
  } catch (e) { console.log(name, 'ERR', e.message); }
}
