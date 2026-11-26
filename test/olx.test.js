import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseList, parseDetail, buildApiUrl, buildHtmlUrl, MODELS } from '../src/sources/olx.js';

const fx = (f) => fs.readFileSync(new URL(`./fixtures/olx/${f}`, import.meta.url), 'utf8');

test('olx API list -> listings', () => {
  const list = parseList(JSON.parse(fx('api.json')), 'Hyundai', 'Santa Fe');
  assert.equal(list.length, 2); // повтор платного объявления убран
  const [a, b] = list; // новые сверху
  assert.equal(a.uid, 'olx:1114737180');
  assert.equal(a.source, 'olx'); assert.equal(a.region, 'EU');
  assert.match(a.url, /^https:\/\/www\.olx\.pl\/d\/oferta\//);
  assert.equal(a.year, 2023); assert.equal(a.mileage_km, 37000);
  assert.equal(a.fuel, 'petrol'); assert.equal(a.transmission, 'АКПП'); assert.equal(a.drive, 'полный');
  assert.equal(a.engine, '1.6 л, 230 л.с.');
  assert.equal(a.currency, 'PLN'); assert.ok(a.price > 10000);
  assert.equal(a.location, 'Pokrzydowo, Польша');
  assert.equal(a.photos.length, 7);
  assert.match(a.photos[0], /^https:\/\/ireland\.apollo\.olxcdn\.com\/v1\/files\/.+\/image;s=\d+x\d+$/);
  assert.ok(a.desc_orig && !/<br/.test(a.desc_orig));
  assert.ok(a.posted_at > b.posted_at);
  assert.equal(b.fuel, 'hybrid'); // «CNG i Hybryda»
  assert.match(b.external_url, /otomoto\.pl/);
});

test('olx HTML list (fallback) -> listings', () => {
  const list = parseList(fx('list.html'), 'Hyundai', 'Staria');
  assert.equal(list.length, 2);
  for (const l of list) {
    assert.match(l.uid, /^olx:\d+$/);
    assert.equal(l.model, 'Staria');
    assert.ok(l.photos.length > 0 && l.photos.every((u) => u.startsWith('https://')));
    assert.ok(l.year > 2000);
  }
});

test('otomoto detail -> all photos + text', () => {
  const d = parseDetail(fx('otomoto.html'));
  assert.equal(d.photos.length, 12);
  assert.match(d.photos[0], /^https:\/\/ireland\.apollo\.olxcdn\.com\/.+;s=1280x0$/);
  assert.ok(d.desc_orig.length > 50 && !/<b>/.test(d.desc_orig));
});

test('olx urls', () => {
  const u = buildApiUrl(MODELS['Hyundai|Grand Starex']);
  assert.match(u, /category_id=191/);
  assert.match(u, /filter_enum_model%5B0%5D=h-1-starex&filter_enum_model%5B1%5D=h-1/);
  assert.equal(buildHtmlUrl(MODELS['Hyundai|Staria']), 'https://www.olx.pl/motoryzacja/samochody/hyundai/staria/?search%5Border%5D=created_at:desc');
  const prado = parseList({ data: [{ id: 1, title: 'Toyota Land Cruiser 200 V8', params: [] }, { id: 2, title: 'Toyota Land Cruiser Prado 150', params: [] }] }, 'Toyota', 'Land Cruiser Prado');
  assert.deepEqual(prado.map((l) => l.uid), ['olx:2']);
});
