import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseList, parseDetail, MODELS } from '../src/sources/beforward.js';

const fx = (f) => fs.readFileSync(new URL(`./fixtures/beforward/${f}`, import.meta.url), 'utf8');

test('beforward: stocklist -> listings', () => {
  const list = parseList(fx('list.html'), 'Toyota', 'Alphard');
  assert.equal(list.length, 3);
  const a = list[0];
  assert.equal(a.uid, 'beforward:17508511');
  assert.equal(a.url, 'https://www.beforward.jp/toyota/alphard/cf658315/id/17508511/');
  assert.equal(a.year, 2021); assert.equal(a.month, 10);
  assert.equal(a.mileage_km, 86006);
  assert.equal(a.engine, '2.5 л');
  assert.equal(a.transmission, 'вариатор');
  assert.equal(a.fuel, 'petrol'); assert.equal(a.seats, 7); assert.equal(a.drive, 'передний');
  assert.equal(a.price, 25040); assert.equal(a.currency, 'USD'); assert.equal(a.price_note, 'FOB Япония');
  assert.equal(a.location, 'Иокогама, Япония'); assert.equal(a.region, 'JP');
  assert.equal(a.photos[0], 'https://image-cdn.beforward.jp/large/202611/17508511/CF658315_2314b3ea.jpg');
  assert.equal(list[1].trim, '2.5SA');
  const k = list[2]; // склад в Корее
  assert.equal(k.region, 'KR'); assert.equal(k.location, 'Корея'); assert.equal(k.fuel, 'diesel');
  assert.equal(k.price_note, 'FOB Корея');
});

test('beforward: detail -> photos, remarks, specs', () => {
  const d = parseDetail(fx('detail.html'), 'Toyota');
  assert.equal(d.photos.length, 8);
  assert.ok(d.photos.every((u) => /^https:\/\/image-cdn\.beforward\.jp\/large\//.test(u)));
  assert.match(d.desc_orig, /HAS PUSH START\nHAS NAVIGATION\./);
  assert.match(d.desc_orig, /Selling points: Non Smoker/);
  assert.doesNotMatch(d.desc_orig, /One Owner/); // не отмечено
  assert.equal(d.trim, 'ELEGANCE 2.5 CVT SUNROOF-NAVI');
  assert.equal(d.fuel, 'petrol'); assert.equal(d.seats, 7); assert.equal(d.engine, '2.5 л');
  assert.equal(d.location, 'Сингапур');
});

test('beforward: models', () => {
  assert.deepEqual(MODELS['Toyota|Alphard'], { make: 1, models: [102, 103] });
});
