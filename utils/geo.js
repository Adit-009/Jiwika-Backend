function isValidCoordinate(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return false;
  }
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (isNaN(nLat) || isNaN(nLng)) {
    return false;
  }
  if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
    return false;
  }
  // 0,0 is Null Island (invalid for land locations)
  if (Math.abs(nLat) < 0.00001 && Math.abs(nLng) < 0.00001) {
    return false;
  }
  return true;
}

/**
 * Reusable Haversine Distance Utility
 * Standardized Order: (lat1, lng1, lat2, lng2)
 * Returns distance in KM rounded to 1 decimal place, or null if invalid coordinates.
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  if (!isValidCoordinate(lat1, lng1) || !isValidCoordinate(lat2, lng2)) {
    return null;
  }

  const nLat1 = Number(lat1);
  const nLng1 = Number(lng1);
  const nLat2 = Number(lat2);
  const nLng2 = Number(lng2);

  const R = 6371; // Earth's radius in km
  const dLat = toRad(nLat2 - nLat1);
  const dLng = toRad(nLng2 - nLng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(nLat1)) * Math.cos(toRad(nLat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  return Math.round(dist * 10) / 10;
}

/**
 * OSRM Driving Road Distance Utility (with Haversine fallback)
 * Standardized Order: (lat1, lng1, lat2, lng2)
 * Returns driving road distance in KM rounded to 1 decimal place, or null if invalid coordinates.
 */
async function getDrivingDistance(lat1, lng1, lat2, lng2) {
  if (!isValidCoordinate(lat1, lng1) || !isValidCoordinate(lat2, lng2)) {
    return null;
  }

  const nLat1 = Number(lat1);
  const nLng1 = Number(lng1);
  const nLat2 = Number(lat2);
  const nLng2 = Number(lng2);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const url = `https://router.project-osrm.org/route/v1/driving/${nLng1},${nLat1};${nLng2},${nLat2}?overview=false`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const meters = data.routes[0].distance;
        const km = meters / 1000;
        return Math.round(km * 10) / 10;
      }
    }
  } catch (err) {
    // Fall back to Haversine straight line if OSRM is unavailable or times out
  }

  return calculateDistance(nLat1, nLng1, nLat2, nLng2);
}

function getDistance(lat1, lng1, lat2, lng2) {
  return calculateDistance(lat1, lng1, lat2, lng2);
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

// 35 Administrative Districts of Assam
const DISTRICTS = {
  Bajali: [],
  Baksa: [],
  Barpeta: [],
  Biswanath: [],
  Bongaigaon: [],
  Cachar: [],
  Charaideo: [],
  Chirang: [],
  Darrang: [],
  Dhemaji: [],
  Dhubri: [],
  Dibrugarh: [],
  "Dima Hasao": [],
  Goalpara: [],
  Golaghat: [],
  Hailakandi: [],
  Hojai: [],
  Jorhat: [],
  Kamrup: [],
  "Kamrup Metropolitan": [],
  "Karbi Anglong": [],
  Karimganj: [],
  Kokrajhar: [],
  Lakhimpur: [],
  Majuli: [],
  Morigaon: [],
  Nagaon: [],
  Nalbari: [],
  Sivasagar: [],
  Sonitpur: [],
  "South Salmara-Mankachar": [],
  Tamulpur: [],
  Tinsukia: [],
  Udalguri: [],
  "West Karbi Anglong": []
};

// Default coordinates for each of the 35 districts (based on headquarters)
const LOCATION_COORDINATES = {
  Bajali: { lat: 26.3313, lng: 91.1738 },
  Baksa: { lat: 26.4764, lng: 91.4116 },
  Barpeta: { lat: 26.3200, lng: 91.0000 },
  Biswanath: { lat: 26.7327, lng: 93.1557 },
  Bongaigaon: { lat: 26.4764, lng: 90.5581 },
  Cachar: { lat: 24.8333, lng: 92.7789 },
  Charaideo: { lat: 27.0189, lng: 95.0306 },
  Chirang: { lat: 26.5298, lng: 90.5284 },
  Darrang: { lat: 26.4326, lng: 92.0360 },
  Dhemaji: { lat: 27.4815, lng: 94.5772 },
  Dhubri: { lat: 26.0210, lng: 89.9708 },
  Dibrugarh: { lat: 27.4728, lng: 94.9120 },
  "Dima Hasao": { lat: 25.1833, lng: 93.0333 },
  Goalpara: { lat: 26.1732, lng: 90.6277 },
  Golaghat: { lat: 26.5222, lng: 93.9611 },
  Hailakandi: { lat: 24.6833, lng: 92.5667 },
  Hojai: { lat: 26.0022, lng: 92.8617 },
  Jorhat: { lat: 26.7578, lng: 94.2098 },
  Kamrup: { lat: 26.2309, lng: 91.6841 },
  "Kamrup Metropolitan": { lat: 26.1445, lng: 91.7362 },
  "Karbi Anglong": { lat: 25.8490, lng: 93.4333 },
  Karimganj: { lat: 24.8667, lng: 92.3667 },
  Kokrajhar: { lat: 26.4000, lng: 90.2667 },
  Lakhimpur: { lat: 27.2300, lng: 94.1000 },
  Majuli: { lat: 26.9632, lng: 94.1950 },
  Morigaon: { lat: 26.2500, lng: 92.2667 },
  Nagaon: { lat: 26.3500, lng: 92.6833 },
  Nalbari: { lat: 26.4444, lng: 91.4444 },
  Sivasagar: { lat: 26.9838, lng: 94.6375 },
  Sonitpur: { lat: 26.6338, lng: 92.7926 },
  "South Salmara-Mankachar": { lat: 25.6833, lng: 89.8833 },
  Tamulpur: { lat: 26.6358, lng: 91.5794 },
  Tinsukia: { lat: 27.5000, lng: 95.3600 },
  Udalguri: { lat: 26.7465, lng: 92.0962 },
  "West Karbi Anglong": { lat: 25.8333, lng: 92.5833 }
};

function getLocationCoordinates(district, location) {
  // If specific location coordinate mapping is not found, fall back to district center coordinates
  if (district && LOCATION_COORDINATES[district]) {
    return LOCATION_COORDINATES[district];
  }
  return { lat: 26.2006, lng: 92.9376 }; // default Assam center fallback
}

module.exports = {
  calculateDistance,
  getDrivingDistance,
  getDistance,
  isValidCoordinate,
  getLocationCoordinates,
  DISTRICTS,
  LOCATION_COORDINATES,
};
