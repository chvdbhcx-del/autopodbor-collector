import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseList, parseDetail, MODELS, listUrl } from '../src/sources/sbi.js';

const fx = (f) => fs.readFileSync(new URL(`./fixtures/sbi/${f}`, import.meta.url), 'utf8');

test('sbi: list -> listings', () => {
  const list = parseList(fx('list.html'), 'Toyota', 'Alphard');
  assert.equal(list.length, 2);
  const a = list[0];
  assert.equal(a.uid, 'sbi:504301698');
  assert.equal(a.url, 'https://sbimotor.com/en/cars/TOYOTA/ALPHARD/504301698');
  assert.equal(a.year, 2019); assert.equal(a.month, 8);
  assert.equal(a.mileage_km, 58660);
  assert.equal(a.engine, '2.5 л'); assert.equal(a.transmission, 'АКПП'); assert.equal(a.seats, 7);
  assert.equal(a.price, 23439); assert.equal(a.currency, 'USD'); assert.equal(a.price_note, 'FOB Япония');
  assert.equal(a.photos[0], 'https://sbimotor.com/uploads/car/images/3792376/1572632583A.jpg');
  const b = list[1];
  assert.equal(b.location, 'Кисарадзу, Япония'); assert.equal(b.drive, 'передний');
});

test('sbi: detail -> photos of this car only, specs', () => {
  const d = parseDetail(fx('detail.html'), 'Toyota');
  assert.equal(d.photos.length, 7);
  assert.ok(d.photos.every((u) => u.startsWith('https://sbimotor.com/uploads/car/images/3757715/')));
  assert.equal(d.trim, 'Special AS Platinum Selection');
  assert.equal(d.fuel, 'petrol'); assert.equal(d.seats, 8); assert.equal(d.drive, 'передний');
  assert.equal(d.location, 'Нагоя, Япония');
  assert.match(d.desc_orig, /Options: Airbag, A\/C/);
});

test('sbi: urls', () => {
  const [mk, [md]] = MODELS['Toyota|Land Cruiser Prado'];
  assert.equal(listUrl(mk, md), 'https://sbimotor.com/en/cars/TOYOTA/LAND%20CRUISER%20PRADO?q%5Bs%5D=id+desc');
});
