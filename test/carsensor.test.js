import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseList, parseDetail, MODELS, listUrl, manYen, mileage, gear } from '../src/sources/carsensor.js';

const fx = (f) => fs.readFileSync(new URL(`./fixtures/carsensor/${f}`, import.meta.url), 'utf8');

test('carsensor: list -> listings (万円 -> JPY)', () => {
  const list = parseList(fx('list.html'), 'Toyota', 'Alphard');
  assert.equal(list.length, 2);
  const a = list[0];
  assert.equal(a.uid, 'carsensor:AU7549112949');
  assert.equal(a.url, 'https://www.carsensor.net/usedcar/detail/AU7549112949/index.html');
  assert.equal(a.region, 'JP');
  assert.equal(a.year, 2021);
  assert.equal(a.mileage_km, 50000);
  assert.equal(a.price, 3_971_000); assert.equal(a.currency, 'JPY');
  assert.match(a.price_note, /4075000/);
  assert.equal(a.transmission, 'вариатор');
  assert.equal(a.engine, '2.5 л');
  assert.equal(a.location, 'Гифу, Япония');
  assert.match(a.trim, /^2\.5 S Cパッケージ/);
  assert.match(a.desc_orig, /衝突被害軽減ブレーキ車/);
  assert.match(a.photos[0], /^https:\/\/ccsrpcma\.carsensor\.net\/CSphoto\/.+_001L\.JPG$/);
  const h = list[1];
  assert.equal(h.fuel, 'hybrid'); assert.equal(h.drive, 'полный'); assert.equal(h.location, 'Оита, Япония');
});

test('carsensor: detail -> photos, specs, text', () => {
  const d = parseDetail(fx('detail.html'));
  assert.ok(d.photos.length >= 6);
  assert.ok(d.photos.every((u) => u.startsWith('https://') && u.includes('/CSphoto/')));
  assert.equal(d.fuel, 'petrol'); assert.equal(d.seats, 7); assert.equal(d.engine, '2.5 л');
  assert.equal(d.drive, 'передний'); // «前輪駆動(FF)» из каталожных данных
  assert.equal(d.transmission, 'вариатор');
  assert.match(d.desc_orig, /キズ、へこみは若干/);
});

test('carsensor: helpers', () => {
  assert.equal(manYen('397.1'), 3_971_000);
  assert.equal(manYen('応談'), null);
  assert.equal(mileage('12.8万km'), 128_000);
  assert.equal(mileage('<span>5</span>km'), 5);
  assert.equal(gear('フロアAT'), 'АКПП');
  assert.equal(gear('フロアMT'), 'МКПП');
  assert.equal(gear('インパネMTモード付CVT'), 'вариатор');
  assert.equal(listUrl(MODELS['Toyota|Alphard'][0]), 'https://www.carsensor.net/usedcar/bTO/s009/index.html?SORT=19');
});
