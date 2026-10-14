const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('cache_osm/2965016.json', 'utf8'));
const relation = raw.elements.find(e => e.type === 'relation');
console.log('Relation id:', relation.id, 'members:', relation.members.length);
const outer = relation.members.filter(m => m.type === 'way');
console.log('Way members:', outer.length);

const wayMap = new Map();
const nodeMap = new Map();

raw.elements.forEach(e => {
  if (e.type === 'way') wayMap.set(e.id, e.nodes);
  if (e.type === 'node') nodeMap.set(e.id, { lat: e.lat, lon: e.lon });
});

console.log('Found ways in file:', wayMap.size, 'found nodes in file:', nodeMap.size);

const waysCoords = outer.map(m => {
  const nodeIds = wayMap.get(m.ref);
  if (!nodeIds) {
    console.log('Missing way ref:', m.ref);
    return null;
  }
  return nodeIds.map(nid => nodeMap.get(nid)).filter(Boolean);
}).filter(w => w && w.length >= 2);

console.log('Extracted waysCoords:', waysCoords.length);
waysCoords.forEach((w, i) => {
  console.log(`Way ${i}: length ${w.length}, start [${w[0].lat}, ${w[0].lon}], end [${w[w.length-1].lat}, ${w[w.length-1].lon}]`);
});
