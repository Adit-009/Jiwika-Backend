const assert = require('assert');
const { calculateDistance, isValidCoordinate } = require('./geo');

console.log('Running backend geo unit tests...');

// 1. Same location -> 0 km
const sameLocationDist = calculateDistance(26.1445, 91.7362, 26.1445, 91.7362);
assert.strictEqual(sameLocationDist, 0, 'Same location should be 0 km');

// 2. Nearby locations (Guwahati center to Dispur, ~5-6 km)
const nearbyDist = calculateDistance(26.1445, 91.7362, 26.1420, 91.7890);
assert.strictEqual(typeof nearbyDist, 'number', 'Nearby distance should be a number');
assert(nearbyDist > 4 && nearbyDist < 7, `Expected nearby distance ~5.3 km, got ${nearbyDist} km`);

// 3. Far locations (Guwahati to Dibrugarh, ~340-350 km)
const farDist = calculateDistance(26.1445, 91.7362, 27.4728, 94.9120);
assert(farDist > 330 && farDist < 360, `Expected far distance ~345 km, got ${farDist} km`);

// 4. String input parsing
const stringInputDist = calculateDistance('26.1445', '91.7362', '27.4728', '94.9120');
assert.strictEqual(stringInputDist, farDist, 'String input should parse correctly');

// 5. Invalid coordinates: Null Island (0,0)
assert.strictEqual(calculateDistance(0, 0, 26.1445, 91.7362), null, 'Null Island (0,0) should return null');

// 6. Out of range coordinates
assert.strictEqual(calculateDistance(95, 91.7362, 26.1445, 91.7362), null, 'Lat > 90 should return null');
assert.strictEqual(calculateDistance(26.1445, 190, 26.1445, 91.7362), null, 'Lng > 180 should return null');

// 7. Null or undefined values
assert.strictEqual(calculateDistance(null, 91.7362, 26.1445, 91.7362), null, 'Null lat should return null');
assert.strictEqual(calculateDistance(undefined, 91.7362, 26.1445, 91.7362), null, 'Undefined lat should return null');
assert.strictEqual(calculateDistance(26.1445, 'invalid', 26.1445, 91.7362), null, 'NaN should return null');

// 8. isValidCoordinate assertions
assert.strictEqual(isValidCoordinate(26.1445, 91.7362), true);
assert.strictEqual(isValidCoordinate(0, 0), false);
assert.strictEqual(isValidCoordinate(null, 91.7362), false);

console.log('✅ All backend geo unit tests passed successfully!');
