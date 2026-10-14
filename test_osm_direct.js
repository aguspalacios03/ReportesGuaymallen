const https = require('https');

const url = 'https://api.openstreetmap.org/api/0.6/relation/2965016/full.json';
console.log('Testing OSM API 0.6 direct...');

https.get(url, { headers: { 'User-Agent': 'PensandoGuaymallen/1.0 (contact: test@example.com)' } }, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      console.log('Direct OSM API SUCCESS! Elements count:', j.elements.length);
      const nodes = j.elements.filter(e => e.type === 'node');
      const ways = j.elements.filter(e => e.type === 'way');
      console.log('Nodes:', nodes.length, 'Ways:', ways.length);
    } catch(e) {
      console.log('Err:', e.message, data.substring(0, 100));
    }
  });
}).on('error', err => console.log('Err:', err.message));
