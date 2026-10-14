// Test stitch with proper closed ring
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('cache_osm/2965016.json', 'utf8'));
const relation = raw.elements.find(e => e.type === 'relation');
const outer = relation.members.filter(m => m.type === 'way');

const wayMap = new Map();
const nodeMap = new Map();

raw.elements.forEach(e => {
  if (e.type === 'way') wayMap.set(e.id, e.nodes);
  if (e.type === 'node') nodeMap.set(e.id, { lat: e.lat, lon: e.lon });
});

const waysCoords = outer.map(m => {
  const nodeIds = wayMap.get(m.ref);
  return nodeIds ? nodeIds.map(nid => nodeMap.get(nid)).filter(Boolean) : null;
}).filter(w => w && w.length >= 2);

let remaining = waysCoords.map(w => [...w]);
let ring = [...remaining.shift()];

while (remaining.length > 0) {
  const endNode = ring[ring.length - 1];
  let found = false;

  for (let i = 0; i < remaining.length; i++) {
    const seg = remaining[i];
    const s0 = seg[0];
    const s1 = seg[seg.length - 1];

    if (Math.hypot(endNode.lat - s0.lat, endNode.lon - s0.lon) < 0.0001) {
      ring.push(...seg.slice(1));
      remaining.splice(i, 1);
      found = true;
      break;
    }
    if (Math.hypot(endNode.lat - s1.lat, endNode.lon - s1.lon) < 0.0001) {
      ring.push(...seg.slice(0, -1).reverse());
      remaining.splice(i, 1);
      found = true;
      break;
    }
  }

  if (!found) break;
}

console.log('Unsimplified ring points:', ring.length);
console.log('Start point:', ring[0], 'End point:', ring[ring.length-1]);
