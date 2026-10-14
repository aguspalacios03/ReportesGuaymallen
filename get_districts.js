const https = require('https');
const fs = require('fs');

const relationIds = [
  2965016, // Dorrego
  2965025, // San José
  2965024, // Pedro Molina
  2965011, // Nueva Ciudad
  2964999, // Las Cañas
  2964983, // San Francisco del Monte
  2964995, // Villa Nueva
  2964997, // Belgrano
  2964981, // El Bermejo
  2964979, // Buena Nueva
  2964976, // Capilla del Rosario
  2964971, // Jesús Nazareno
  2964503, // El Sauce
  2964491, // Rodeo de la Cruz
  2964447, // Colonia Segovia
  2962924, // Los Corralitos
  2964448, // Kilómetro 11
  2962909, // Kilómetro 8
  2962912, // La Primavera
  2962926  // Puente de Hierro
];

const query = `[out:json][timeout:60];
(
  ${relationIds.map(id => `relation(${id});`).join('\n  ')}
);
out geom;
`;

const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
console.log('Fetching geometries for all 20 Guaymallén districts...');

https.get(url, { headers: { 'User-Agent': 'PensandoGuaymallen/1.0' } }, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Elements returned:', json.elements.length);

      // Map relation to polygon
      const idToKey = {
        2965016: { id: 'dorrego', name: 'Dorrego', color: '#4A90E2' },
        2965025: { id: 'san_jose', name: 'San José', color: '#50E36B' },
        2965024: { id: 'pedro_molina', name: 'Pedro Molina', color: '#7B2456' },
        2965011: { id: 'nueva_ciudad', name: 'Nueva Ciudad', color: '#8C5A4C' },
        2964999: { id: 'las_canas', name: 'Las Cañas', color: '#E58A99' },
        2964983: { id: 'san_francisco_del_monte', name: 'San Francisco del Monte', color: '#4A7C8A' },
        2964995: { id: 'villa_nueva', name: 'Villa Nueva', color: '#4355B9' },
        2964997: { id: 'belgrano', name: 'Belgrano', color: '#C4A6EB' },
        2964981: { id: 'bermejo', name: 'Bermejo', color: '#8EE8B3' },
        2964979: { id: 'buena_nueva', name: 'Buena Nueva', color: '#3A8E3F' },
        2964976: { id: 'capilla_del_rosario', name: 'Capilla del Rosario', color: '#2D8275' },
        2964971: { id: 'jesus_nazareno', name: 'Jesús Nazareno', color: '#F04D9C' },
        2964503: { id: 'el_sauce', name: 'El Sauce', color: '#C44DE0' },
        2964491: { id: 'rodeo_de_la_cruz', name: 'Rodeo de la Cruz', color: '#F6B89E' },
        2964447: { id: 'colonia_segovia', name: 'Colonia Segovia', color: '#6B7F42' },
        2962924: { id: 'los_corralitos', name: 'Los Corralitos', color: '#D07A44' },
        2964448: { id: 'kilometro_11', name: 'Kilómetro 11', color: '#F3E856' },
        2962909: { id: 'kilometro_8', name: 'Kilómetro 8', color: '#DE4957' },
        2962912: { id: 'la_primavera', name: 'La Primavera', color: '#2B5385' },
        2962926: { id: 'puente_de_hierro', name: 'Puente de Hierro', color: '#62C9EC' }
      };

      const districtsResult = [];

      json.elements.forEach(rel => {
        const meta = idToKey[rel.id];
        if (!meta) return;

        // An OSM relation has members (ways with role 'outer')
        // We reconstruct the closed polygon from outer ways
        const outerWays = rel.members.filter(m => m.role === 'outer' && m.geometry && m.geometry.length > 0);
        
        // Assemble ways into a continuous ring
        let segments = outerWays.map(w => w.geometry);
        if (segments.length === 0) return;

        let ring = [...segments[0]];
        segments.splice(0, 1);

        while (segments.length > 0) {
          const lastPoint = ring[ring.length - 1];
          let foundIndex = -1;
          let reverse = false;

          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const dStart = Math.hypot(lastPoint.lat - seg[0].lat, lastPoint.lon - seg[0].lon);
            const dEnd = Math.hypot(lastPoint.lat - seg[seg.length - 1].lat, lastPoint.lon - seg[seg.length - 1].lon);

            if (dStart < 0.0001) {
              foundIndex = i;
              reverse = false;
              break;
            } else if (dEnd < 0.0001) {
              foundIndex = i;
              reverse = true;
              break;
            }
          }

          if (foundIndex !== -1) {
            let seg = segments[foundIndex];
            if (reverse) seg = [...seg].reverse();
            ring.push(...seg.slice(1));
            segments.splice(foundIndex, 1);
          } else {
            // Pick closest
            let bestIndex = 0;
            let bestDist = Infinity;
            let bestReverse = false;
            for (let i = 0; i < segments.length; i++) {
              const seg = segments[i];
              const dStart = Math.hypot(lastPoint.lat - seg[0].lat, lastPoint.lon - seg[0].lon);
              const dEnd = Math.hypot(lastPoint.lat - seg[seg.length - 1].lat, lastPoint.lon - seg[seg.length - 1].lon);
              if (dStart < bestDist) { bestDist = dStart; bestIndex = i; bestReverse = false; }
              if (dEnd < bestDist) { bestDist = dEnd; bestIndex = i; bestReverse = true; }
            }
            let seg = segments[bestIndex];
            if (bestReverse) seg = [...seg].reverse();
            ring.push(...seg);
            segments.splice(bestIndex, 1);
          }
        }

        // Simplify ring: retain points with step or distance threshold so file is compact and fast
        // Ramer-Douglas-Peucker simplification
        function simplify(pts, tolerance) {
          if (pts.length <= 2) return pts;
          let maxD = 0;
          let index = 0;
          const [p1, p2] = [pts[0], pts[pts.length - 1]];
          for (let i = 1; i < pts.length - 1; i++) {
            const d = Math.abs((p2.lat - p1.lat) * pts[i].lon - (p2.lon - p1.lon) * pts[i].lat + p2.lon * p1.lat - p2.lat * p1.lon) /
                      Math.hypot(p2.lat - p1.lat, p2.lon - p1.lon);
            if (d > maxD) { maxD = d; index = i; }
          }
          if (maxD > tolerance) {
            const r1 = simplify(pts.slice(0, index + 1), tolerance);
            const r2 = simplify(pts.slice(index), tolerance);
            return r1.slice(0, -1).concat(r2);
          }
          return [p1, p2];
        }

        const simplified = simplify(ring, 0.0001); // ~10m precision
        const polygonCoords = simplified.map(p => [Number(p.lat.toFixed(5)), Number(p.lon.toFixed(5))]);

        // Calculate centroid
        let cLat = 0, cLng = 0;
        polygonCoords.forEach(p => { cLat += p[0]; cLng += p[1]; });
        cLat /= polygonCoords.length;
        cLng /= polygonCoords.length;

        districtsResult.push({
          id: meta.id,
          name: meta.name,
          color: meta.color,
          center: [Number(cLat.toFixed(5)), Number(cLng.toFixed(5))],
          polygon: polygonCoords,
          desc: `Distrito Oficial de Guaymallén`
        });
      });

      console.log(`Successfully assembled ${districtsResult.length} district polygons!`);
      fs.writeFileSync('districts_exact.json', JSON.stringify(districtsResult, null, 2));
      console.log('Saved to districts_exact.json');
    } catch(e) {
      console.error('Error parsing:', e);
    }
  });
}).on('error', err => console.error(err));
