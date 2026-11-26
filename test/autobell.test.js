import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseList, parseDetail, buildCondition, photoUrl, fuelOf, gearOf, MODELS } from '../src/sources/autobell.js';

const fx = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/autobell/${f}`, import.meta.url), 'utf8'));

test('autobell list -> listings', () => {
  const list = parseList(fx('list.json'), 'Kia', 'Carnival');
  assert.equal(list.length, 2); // баннер и повтор убраны
  const [a, b] = list;
  assert.equal(a.uid, 'autobell:3a640303-ed20-47a4-838c-53593c7e17cf');
  assert.equal(a.url, 'https://autobell.co.kr/buycar/buyCarDetailType?dlrPrdId=3a640303-ed20-47a4-838c-53593c7e17cf');
  assert.equal(a.region, 'KR'); assert.equal(a.source_label, 'Autobell');
  assert.equal(a.price, 7_500_000); assert.equal(a.currency, 'KRW');
  assert.equal(a.year, 2015); assert.equal(a.month, 7);
  assert.equal(a.mileage_km, 109505);
  assert.equal(a.fuel, 'diesel'); assert.equal(a.transmission, 'АКПП');
  assert.equal(a.location, 'Кёнгидо, Корея');
  assert.equal(a.trim, '9인승 디젤 럭셔리');
  assert.match(a.photos[0], /^https:\/\/cdn\.autobell\.co\.kr\/picture\/dlr\/prd\/carImg\//);
  assert.ok(a.posted_at > 1_700_000_000);
  assert.equal(b.fuel, 'petrol');
  assert.equal(b.photos[0], 'https://image.m-park.co.kr/mpark/AttEdit/CarPhoto/Large/5111500/5111500078R1.jpg');
});

test('autobell detail -> photos, text, specs', () => {
  const d = parseDetail({ photo: fx('photo.json'), content: fx('content.json'), option: fx('option.json') });
  assert.equal(d.photos.length, 18);
  assert.ok(d.photos.every((u) => u.startsWith('https://cdn.autobell.co.kr/picture/')));
  assert.match(d.desc_orig, /^짧은주행/); assert.match(d.desc_orig, /임동근/);
  assert.ok(!/<br|&#034;/.test(d.desc_orig));
  assert.equal(d.engine, '2.0 л'); assert.equal(d.seats, 5);
  assert.equal(d.fuel, 'petrol'); assert.equal(d.transmission, 'АКПП');
  const m = parseDetail({ photo: fx('photo_mpark.json') });
  assert.equal(m.photos.length, 5);
  assert.match(m.photos[4], /^https:\/\/image\.m-park\.co\.kr\/mpark\/AttEdit\/CarPhoto\/Large\/\d+\/\d+R5\.jpg$/);
  // фото autoinside недоступны снаружи Кореи — отбрасываются
  const ah = parseDetail({ photo: { data: [{ bImg: 'AH_BATCH_INSERT/20261012/X_1X.jpg', sortNo: 1 }] } });
  assert.equal(ah.photos.length, 0);
  assert.equal(photoUrl('AH_BATCH_INSERT/20261012/X_1X.jpg'), 'https://www.autoinside.co.kr/shCardImg/20261012/X_1X.jpg');
});

test('autobell condition and maps', () => {
  const c = buildCondition(MODELS['BMW|X5']);
  assert.equal(c.crMnfcCd, '67'); assert.equal(c.crMdlCd, '141');
  assert.deepEqual(c.crDtlMdlCd, ['3817', '2708', '318', '1349', '1348']);
  assert.equal(c.type, 'normal'); assert.equal(c.order, 'upd_dt');
  assert.equal(fuelOf('가솔린+전기'), 'hybrid'); assert.equal(fuelOf('LPG(일반인 구입)'), 'lpg'); assert.equal(fuelOf('전기'), 'ev');
  assert.equal(gearOf('수동'), 'МКПП'); assert.equal(gearOf('CVT'), 'вариатор');
});
