const https = require('https');

const id = 2965016; // Dorrego
const url = `https://nominatim.openstreetmap.org/details.php?osmtype=R&osmid=${id}&class=boundary&format=geojson`;

console.log('Fetching', url);
https.get(url, { headers: { 'User-Agent': 'PensandoGuaymallenApp/1.0 (agustin@example.com)' } }, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const geo = JSON.parse(data);
      console.log('GeoJSON type:', geo.geometry && geo.geometry.type);
      console.log('Coords count:', geo.geometry && geo.geometry.coordinates && geo.geometry.coordinates[0] && geo.geometry.coordinates[0].length);
    } catch(e) {
      console.log('Error:', e.message, data.substring(0, 150));
    }
  });
}).on('error', err => console.error(err));
