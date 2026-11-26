// Проверка: какие площадки открываются с этой машины (напрямую или через туннель).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const SITES = {
  kbchacha: 'https://www.kbchachacha.com/public/search/main.kbc',
  kcar: 'https://www.kcar.com/bc/search',
  kcar_api: 'https://api.kcar.com/bc/search/list',
  autowini: 'https://www.autowini.com/cars/search',
  autobell: 'https://www.autobell.co.kr/buycar/searchList',
  beforward: 'https://www.beforward.jp/stocklist/make=1/model=3086/',
  sbt: 'https://www.sbtjapan.com/used-cars/toyota/alphard/',
  sbi: 'https://www.sbimotors.com/',
  carsensor: 'https://www.carsensor.net/usedcar/bTO/s012/index.html',
  goonet: 'https://www.goo-net-exchange.com/usedcars/TOYOTA/ALPHARD/',
  mobilede: 'https://suchen.mobile.de/fahrzeuge/search.html?isSearchRequest=true&ms=11600%3B5%3B%3B&s=Car&vc=Car',
  autoscout: 'https://www.autoscout24.de/lst/hyundai/santa-fe?atype=C',
  autouncle: 'https://www.autouncle.de/de/gebrauchtwagen/Hyundai/Santa-Fe',
  truckscout: 'https://www.truckscout24.de/',
  olx: 'https://www.olx.pl/motoryzacja/samochody/hyundai/',
  guazi: 'https://www.guazi.com/',
  autocango: 'https://www.autocango.com/',
  drom: 'https://auto.drom.ru/hyundai/santa_fe/',
  plc: 'https://plc.auction/',
  autosender: 'https://autosender.ru/',
  dokanmazad: 'https://dokanmazad.com/',
  encar: 'https://api.encar.com/search/car/list/general?count=true&q=(And.Hidden.N._.CarType.Y.)&sr=%7CModifiedDate%7C0%7C1',
  ip: 'https://api.ipify.org?format=json',
};
const out = await Promise.all(Object.entries(SITES).map(async ([k, u]) => {
  const t = Date.now();
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(25000) });
    const s = await r.text();
    const title = (s.match(/<title[^>]*>([^<]{0,80})/i) || [])[1] || s.slice(0, 80);
    return `${k.padEnd(11)} ${r.status} ${String(s.length).padStart(8)}b ${String(Date.now() - t).padStart(6)}ms  ${title.replace(/\s+/g, ' ').trim()}`;
  } catch (e) {
    return `${k.padEnd(11)} ERR ${e.cause?.code || e.name} ${Date.now() - t}ms`;
  }
}));
console.log(out.join('\n'));
