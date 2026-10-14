const https = require('https');

const query = `[out:json][timeout:25];
relation(2965016);
out geom;`;

const url = 'https://overpass.kumi.systems/api/interpreter?data=' + encodeURIComponent(query);
console.log('Testing kumi.systems...');

https.get(url, { headers: { 'User-Agent': 'PensandoGuaymallen/1.0' } }, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      console.log('Success! elements:', j.elements.length, 'members:', j.elements[0].members.length);
    } catch(e) {
      console.log('Err:', e.message, data.substring(0, 100));
    }
  });
}).on('error', err => console.log('Err:', err.message));
