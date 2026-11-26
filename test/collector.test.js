import test from 'node:test';
import assert from 'node:assert/strict';
import { mapListItem, enrichFromDetail, buildQuery, yearMonth } from '../src/sources/encar.js';
import { readNewPosts, looksLikeListing, postToListing } from '../src/sources/channels.js';
import { toBot, fingerprint } from '../src/listing.js';
import { Rates } from '../src/rates.js';

const W = { brand: 'Hyundai', model: 'Staria', ko_brand: '현대', ko_model: '스타리아', car_type: 'Y' };

test('encar list item -> listing', () => {
  const it = {
    Id: '38123456', Manufacturer: '현대', Model: '스타리아', Badge: '라운지', BadgeDetail: '9인승 프레스티지',
    FuelType: '디젤', Transmission: '오토', Year: 202203.0, FormYear: '2022', Mileage: 41200.0, Price: 3150.0,
    OfficeCityState: '서울', ModifiedDate: '2026-11-20 10:11:12.000 +09',
    Photos: [{ location: '/carpicture08/pic3812/38123456_001.jpg' }, { location: '/carpicture08/pic3812/38123456_002.jpg' }],
  };
  const l = mapListItem(it, W);
  assert.equal(l.uid, 'encar:38123456');
  assert.equal(l.year, 2022); assert.equal(l.month, 3);
  assert.equal(l.price, 31_500_000); assert.equal(l.currency, 'KRW');
  assert.equal(l.fuel, 'diesel'); assert.equal(l.transmission, 'АКПП'); assert.equal(l.location, 'Сеул');
  assert.equal(l.photos[0], 'https://ci.encar.com/carpicture/carpicture08/pic3812/38123456_001.jpg');
  enrichFromDetail(l, { photos: [{ path: '/carpicture08/x_001.jpg' }], contents: { text: '무사고 1인 신조' }, spec: { seatCount: 9, displacement: 2199 } });
  assert.equal(l.seats, 9); assert.equal(l.engine, '2.2 л'); assert.equal(l.desc_orig, '무사고 1인 신조');
  const b = toBot(l);
  assert.ok(!('desc_orig' in b));
  assert.equal(typeof fingerprint(l), 'string');
  assert.match(buildQuery(W), /Manufacturer\.현대\._\.ModelGroup\.스타리아\./);
  assert.deepEqual(yearMonth(2021), [2021, null]);
});

test('rates', () => {
  const r = new Rates(); r.rub.KRW = 0.068;
  assert.equal(r.toRub(31_500_000, 'KRW'), 2_142_000);
  assert.equal(r.toRub(null, 'KRW'), null);
});

test('channel posts: albums merged, LLM fields mapped', async () => {
  const photo = (n) => ({ id: n });
  const msgs = [
    { id: 103, date: 1700000300, message: 'Отзыв клиента, спасибо!' },
    { id: 102, date: 1700000200, groupedId: { toString: () => '77' }, photo: photo(2) },
    { id: 101, date: 1700000100, groupedId: { toString: () => '77' }, photo: photo(1),
      message: 'Hyundai Grand Starex Urban 2021, дизель 2.5, пробег 58 000 км. Цена 2 650 000 ₽ под ключ во Владивостоке' },
  ];
  const fakeClient = { getMessages: async () => msgs };
  const { posts, maxId } = await readNewPosts(fakeClient, 'asiamotorsvl', 100);
  assert.equal(maxId, 103);
  assert.equal(posts.length, 2);
  const album = posts.find((p) => p.id === 101);
  assert.equal(album.photos.length, 2);
  assert.ok(looksLikeListing(album));
  assert.ok(!looksLikeListing(posts.find((p) => p.id === 103)));
  const llm = { extractPost: async () => ({ is_car_listing: true, brand: 'Hyundai', model: 'Grand Starex', year: 2021, mileage_km: 58000, fuel: 'diesel', price: 2650000, currency: 'RUB', price_note: 'под ключ во Владивостоке', trim: null, month: null, transmission: null, drive: null, engine: '2.5', location: null, title_ru: null, desc_ru: null }) };
  const l = await postToListing(llm, new Rates(), 'asiamotorsvl', album);
  assert.equal(l.uid, 'tg:asiamotorsvl:101');
  assert.equal(l.url, 'https://t.me/asiamotorsvl/101');
  assert.equal(l.price_rub, 2650000);
  assert.equal(l.from_text, true);
  assert.equal(l._media.length, 2);
});
