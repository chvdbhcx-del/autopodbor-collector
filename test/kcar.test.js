import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseList, parseDetail, encParam, listBody, plain, MODELS, search } from '../src/sources/kcar.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/kcar/${n}`, import.meta.url), 'utf8'));

test('kcar: encrypted list body decrypts to the search params', () => {
  const b = listBody(MODELS['Hyundai|Palisade']);
  const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from('SKFJ2424DasfaJRI'), Buffer.from('sfq241sf3dscs321'));
  const p = JSON.parse(Buffer.concat([d.update(Buffer.from(b.enc, 'base64')), d.final()]).toString());
  assert.equal(p.wr_eq_mnuftr_cd, '001'); assert.equal(p.wr_eq_model_grp_cd, '058'); assert.equal(p.orderBy, 'car_cd:desc');
  assert.equal(typeof encParam({ a: 1 }), 'string');
});

test('kcar: list', () => {
  const list = parseList(fx('list.json'), 'Hyundai', 'Palisade');
  assert.equal(list.length, 3);
  const l = list[0];
  assert.equal(l.uid, 'kcar:EC61444859');
  assert.equal(l.url, 'https://www.kcar.com/bc/detail/carInfoDtl?i_sCarCd=EC61444859');
  assert.equal(l.region, 'KR'); assert.equal(l.source_label, 'K Car');
  assert.equal(l.price, 24_500_000); assert.equal(l.currency, 'KRW');
  assert.equal(l.year, 2022); assert.equal(l.month, 3);
  assert.equal(l.mileage_km, 55893);
  assert.equal(l.fuel, 'petrol'); assert.equal(l.transmission, 'АКПП'); assert.equal(l.drive, 'передний');
  assert.equal(l.engine, '3.8 л'); assert.equal(l.seats, 7);
  assert.match(l.location, /Корея$/);
  assert.match(l.photos[0], /^https:\/\/img\.kcar\.com\//);
  for (const x of list) assert.ok(!JSON.stringify(x).match(/010-\d{4}/), 'no seller phones');
});

test('kcar: detail', () => {
  const d = parseDetail(fx('detail.json'));
  assert.equal(d.photos.length, 40);
  assert.equal(d.photos[0], 'https://img.kcar.com/carpicture/carpicture04/pic6144/kcar_61444859_001.jpg');
  assert.ok(d.photos.every((u) => /^https:\/\/img\.kcar\.com\/carpicture\/.+\.jpg$/.test(u)));
  assert.equal(new Set(d.photos).size, d.photos.length);
  assert.match(d.desc_orig, /비흡연/);
  assert.ok(!/&amp;|&rarr;|<\/?br/.test(d.desc_orig));
  assert.equal(d.engine, '3.8 л, 295 л.с.');
  assert.equal(d.drive, 'передний'); assert.equal(d.seats, 7);
  assert.equal(d.trim, '가솔린 3.8 2WD 캘리그래피 (7인승)');
  assert.equal(d.location, 'Кёнгидо, Корея');
  assert.equal(plain('a &amp; b</br>c'), 'a & b\nc');
});

test('kcar: unknown model -> empty search, no network', async () => {
  assert.deepEqual(await search('Mazda', '6', {}), []);
});
