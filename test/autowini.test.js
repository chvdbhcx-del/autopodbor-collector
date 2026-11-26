import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseList, listUrl, MODELS } from '../src/sources/autowini.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/autowini/${n}`, import.meta.url), 'utf8'));

test('autowini: list', () => {
  const list = parseList(fx('list.json'), 'Hyundai', 'Palisade');
  assert.equal(list.length, 3);
  const l = list[0];
  assert.equal(l.uid, 'autowini:IC5722310');
  assert.equal(l.url, 'https://www.autowini.com/items/Used-2023-Hyundai-Palisade-IC5722310');
  assert.equal(l.price, 18721); assert.equal(l.currency, 'USD'); assert.equal(l.price_note, 'FOB Корея');
  assert.equal(l.region, 'KR'); assert.equal(l.location, 'Корея');
  assert.equal(l.year, 2023); assert.equal(l.mileage_km, 62079);
  assert.equal(l.fuel, 'petrol'); assert.equal(l.transmission, 'АКПП');
  assert.equal(l.engine, '3.8 л'); assert.equal(l.seats, 7);
  assert.equal(l.trim, '3.8 Gasoline 2WD Exclusive');
  assert.equal(l.photos.length, 5);
  assert.ok(l.photos.every((u) => /^https:\/\/imagebox\.autowini\.com\/.+_720\.jpe?g$/.test(u)));
  assert.match(l.desc_orig, /Palisade/);
});

test('autowini: Land Cruiser group filtered to Prado, Japan stock', () => {
  const list = parseList(fx('list_lc.json'), 'Toyota', 'Land Cruiser Prado');
  assert.equal(list.length, 7); // восьмой — обычный Land Cruiser
  assert.equal(list[0].region, 'JP'); assert.equal(list[0].price_note, 'FOB Япония');
  assert.equal(list[0].drive, 'полный');
  assert.ok(list.every((l) => ['petrol', 'diesel'].includes(l.fuel)));
});

test('autowini: url', () => {
  assert.equal(listUrl(MODELS['Hyundai|Palisade']), 'https://v2api.autowini.com/items/cars?make=C0680&subModel=C5165&sorting=recentDate');
});
