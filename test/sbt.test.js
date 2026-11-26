import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseList, parseImages, MODELS } from '../src/sources/sbt.js';

const fx = (f) => fs.readFileSync(new URL(`./fixtures/sbt/${f}`, import.meta.url), 'utf8');

test('sbt: list page -> listings', () => {
  const list = parseList(fx('list.html'), 'Toyota', 'Alphard');
  assert.equal(list.length, 3);
  const a = list.find((l) => l.uid === 'sbt:AX7953');
  assert.equal(a.url, 'https://www.sbtjapan.com/used-cars/toyota/alphard/AX7953');
  assert.equal(a.region, 'JP');
  assert.equal(a.year, 2012); assert.equal(a.month, 8);
  assert.equal(a.mileage_km, 116000);
  assert.equal(a.trim, '240X');
  assert.equal(a.fuel, 'petrol'); assert.equal(a.transmission, 'АКПП'); assert.equal(a.drive, 'полный');
  assert.equal(a.engine, '2.4 л');
  assert.equal(a.price, 3000); assert.equal(a.currency, 'USD'); assert.equal(a.price_note, 'FOB Япония');
  assert.equal(a.location, 'Нагоя, Япония');
  assert.match(a.photos[0], /^https:\/\/img\.sbtjapan\.com\/img\/carphoto\/AX7953\/normal\/f\.jpg/);
  assert.doesNotMatch(a.photos[0], /imwidth/);
  // склад партнёра в Корее
  const k = list.find((l) => l.uid === 'sbt:DDL7365');
  assert.equal(k.region, 'KR'); assert.equal(k.location, 'Инчхон, Корея'); assert.equal(k.price_note, 'FOB Корея');
  assert.equal(k.fuel, 'diesel'); assert.equal(k.price, 30200);
});

test('sbt: stockImages json -> photos', () => {
  const p = parseImages(fx('images.json'));
  assert.equal(p.length, 6);
  assert.equal(p[0], 'https://img.sbtjapan.com/img/carphoto/AX7953/normal/f.jpg?v=1795678761');
  assert.ok(p.every((u) => u.startsWith('https://')));
  assert.deepEqual(parseImages({ result: 0 }), []);
});

test('sbt: models', () => {
  assert.equal(MODELS['Toyota|Alphard'], 'toyota/alphard');
  assert.ok(Object.keys(MODELS).every((k) => k.split('|').length === 2));
});
