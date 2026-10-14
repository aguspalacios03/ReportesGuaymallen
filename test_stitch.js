const fs = require('fs');

// We have the downloaded OSM relations or we can re-assemble properly
function stitchWays(ways) {
  // ways is an array of arrays of {lat, lon}
  if (!ways || ways.length === 0) return [];
  
  let remaining = ways.map(w => [...w]);
  let ring = [...remaining.shift()];

  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    const startNode = ring[0];
    const endNode = ring[ring.length - 1];

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      const s0 = seg[0];
      const s1 = seg[seg.length - 1];

      // Check match with end of ring
      if (Math.hypot(endNode.lat - s0.lat, endNode.lon - s0.lon) < 0.0001) {
        ring.push(...seg.slice(1));
        remaining.splice(i, 1);
        progress = true;
        break;
      }
      if (Math.hypot(endNode.lat - s1.lat, endNode.lon - s1.lon) < 0.0001) {
        ring.push(...seg.slice(0, -1).reverse());
        remaining.splice(i, 1);
        progress = true;
        break;
      }

      // Check match with start of ring
      if (Math.hypot(startNode.lat - s1.lat, startNode.lon - s1.lon) < 0.0001) {
        ring.unshift(...seg.slice(0, -1));
        remaining.splice(i, 1);
        progress = true;
        break;
      }
      if (Math.hypot(startNode.lat - s0.lat, startNode.lon - s0.lon) < 0.0001) {
        ring.unshift(...seg.slice(1).reverse());
        remaining.splice(i, 1);
        progress = true;
        break;
      }
    }
  }

  return ring;
}

console.log('Stitch function ready');
