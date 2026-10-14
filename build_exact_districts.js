const https = require('https');
const fs = require('fs');
const path = require('path');

const relations = [
  { id: 2965016, key: 'dorrego', name: 'Dorrego', color: '#4A90E2', desc: 'Límite oeste con Capital y Godoy Cruz' },
  { id: 2965025, key: 'san_jose', name: 'San José', color: '#50E36B', desc: 'Zona histórica comercial de Guaymallén' },
  { id: 2965024, key: 'pedro_molina', name: 'Pedro Molina', color: '#7B2456', desc: 'Noroeste, entre San José y Bermejo' },
  { id: 2965011, key: 'nueva_ciudad', name: 'Nueva Ciudad', color: '#8C5A4C', desc: 'Entre San José, Pedro Molina y Villa Nueva' },
  { id: 2964999, key: 'las_canas', name: 'Las Cañas', color: '#E58A99', desc: 'Corredor comercial del Shopping y Acceso Este' },
  { id: 2964983, key: 'san_francisco_del_monte', name: 'San Francisco del Monte', color: '#4A7C8A', desc: 'Límite sur de Guaymallén' },
  { id: 2964995, key: 'villa_nueva', name: 'Villa Nueva', color: '#4355B9', desc: 'Centro cívico y administrativo del departamento' },
  { id: 2964997, key: 'belgrano', name: 'Belgrano', color: '#C4A6EB', desc: 'Zona norte-centro, Calle Mitre y Gomensoro' },
  { id: 2964981, key: 'bermejo', name: 'Bermejo', color: '#8EE8B3', desc: 'Tradición ceramista y viveros en Mathus Hoyos' },
  { id: 2964979, key: 'buena_nueva', name: 'Buena Nueva', color: '#3A8E3F', desc: 'Carril Godoy Cruz y Tirasso' },
  { id: 2964976, key: 'capilla_del_rosario', name: 'Capilla del Rosario', color: '#2D8275', desc: 'Barrio Santa Ana y zona residencial' },
  { id: 2964971, key: 'jesus_nazareno', name: 'Jesús Nazareno', color: '#F04D9C', desc: 'Acceso Sur y Este' },
  { id: 2964503, key: 'el_sauce', name: 'El Sauce', color: '#C44DE0', desc: 'Zona norte productiva y residencial' },
  { id: 2964491, key: 'rodeo_de_la_cruz', name: 'Rodeo de la Cruz', color: '#F6B89E', desc: 'Gran polo comercial del este, Bandera de los Andes' },
  { id: 2964447, key: 'colonia_segovia', name: 'Colonia Segovia', color: '#6B7F42', desc: 'Cinturón verde hortícola del norte' },
  { id: 2962924, key: 'los_corralitos', name: 'Los Corralitos', color: '#D07A44', desc: 'Corazón rural y productivo, Severo del Castillo' },
  { id: 2964448, key: 'kilometro_11', name: 'Kilómetro 11', color: '#F3E856', desc: 'Eje sur-este de Guaymallén' },
  { id: 2962909, key: 'kilometro_8', name: 'Kilómetro 8', color: '#DE4957', desc: 'Extremo sur-este de Guaymallén' },
  { id: 2962912, key: 'la_primavera', name: 'La Primavera', color: '#2B5385', desc: 'Zona agrícola tradicional' },
  { id: 2962926, key: 'puente_de_hierro', name: 'Puente de Hierro', color: '#62C9EC', desc: 'Extremo noreste de Guaymallén' }
];

if (!fs.existsSync('cache_osm')) {
  fs.mkdirSync('cache_osm');
}

function fetchRelation(rel) {
  const cachePath = path.join('cache_osm', `${rel.id}.json`);
  if (fs.existsSync(cachePath)) {
    return Promise.resolve(JSON.parse(fs.readFileSync(cachePath, 'utf8')));
  }

  return new Promise((resolve, reject) => {
    const url = `https://api.openstreetmap.org/api/0.6/relation/${rel.id}/full.json`;
    console.log(`Downloading ${rel.name} (ID: ${rel.id})...`);
    
    https.get(url, { headers: { 'User-Agent': 'PensandoGuaymallenApp/1.0 (contacto: agustin@example.com)' } }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${rel.name}: status ${res.statusCode}`));
      }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          fs.writeFileSync(cachePath, raw);
          resolve(data);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function assemblePolygon(osmData, relMeta) {
  const nodeMap = new Map();
  const wayMap = new Map();
  let relationElement = null;

  osmData.elements.forEach(el => {
    if (el.type === 'node') {
      nodeMap.set(el.id, { lat: el.lat, lon: el.lon });
    } else if (el.type === 'way') {
      wayMap.set(el.id, el.nodes);
    } else if (el.type === 'relation') {
      relationElement = el;
    }
  });

  if (!relationElement) return null;

  // Outer ways
  const outerMembers = relationElement.members.filter(m => m.type === 'way' && (m.role === 'outer' || m.role === ''));
  const ways = outerMembers.map(m => wayMap.get(m.ref)).filter(Boolean);

  if (ways.length === 0) return null;

  // Convert ways to coordinate arrays
  let segments = ways.map(nodeIds => {
    return nodeIds.map(id => nodeMap.get(id)).filter(Boolean);
  }).filter(wc => wc.length >= 2);

  if (segments.length === 0) return null;

  let ring = [...segments.shift()];

  let progress = true;
  while (segments.length > 0 && progress) {
    progress = false;
    const startNode = ring[0];
    const endNode = ring[ring.length - 1];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const s0 = seg[0];
      const s1 = seg[seg.length - 1];

      // End of ring matches start of seg
      if (Math.hypot(endNode.lat - s0.lat, endNode.lon - s0.lon) < 0.0002) {
        ring.push(...seg.slice(1));
        segments.splice(i, 1);
        progress = true;
        break;
      }
      // End of ring matches end of seg
      if (Math.hypot(endNode.lat - s1.lat, endNode.lon - s1.lon) < 0.0002) {
        ring.push(...seg.slice(0, -1).reverse());
        segments.splice(i, 1);
        progress = true;
        break;
      }
      // Start of ring matches end of seg
      if (Math.hypot(startNode.lat - s1.lat, startNode.lon - s1.lon) < 0.0002) {
        ring.unshift(...seg.slice(0, -1));
        segments.splice(i, 1);
        progress = true;
        break;
      }
      // Start of ring matches start of seg
      if (Math.hypot(startNode.lat - s0.lat, startNode.lon - s0.lon) < 0.0002) {
        ring.unshift(...seg.slice(1).reverse());
        segments.splice(i, 1);
        progress = true;
        break;
      }
    }
  }

  // Close the ring if needed
  if (ring.length > 2) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (Math.hypot(first.lat - last.lat, first.lon - last.lon) > 0.0001) {
      ring.push(first);
    }
  }

  // Ramer-Douglas-Peucker simplification (~20 meters precision)
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

  const simplified = simplify(ring, 0.0002);
  const polygon = simplified.map(p => [Number(p.lat.toFixed(5)), Number(p.lon.toFixed(5))]);

  // Centroid
  let cLat = 0, cLng = 0;
  polygon.forEach(p => { cLat += p[0]; cLng += p[1]; });
  cLat = Number((cLat / polygon.length).toFixed(5));
  cLng = Number((cLng / polygon.length).toFixed(5));

  return {
    id: relMeta.key,
    name: relMeta.name,
    color: relMeta.color,
    desc: relMeta.desc,
    center: [cLat, cLng],
    polygon: polygon
  };
}

async function run() {
  const result = [];
  for (const rel of relations) {
    try {
      const data = await fetchRelation(rel);
      const districtObj = assemblePolygon(data, rel);
      if (districtObj) {
        console.log(`✓ ${rel.name}: ${districtObj.polygon.length} vertices, Center: [${districtObj.center}]`);
        result.push(districtObj);
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error(`Error processing ${rel.name}:`, e.message);
    }
  }

  console.log(`\nAssembled ${result.length} of ${relations.length} districts.`);
  fs.writeFileSync('districts_exact.json', JSON.stringify(result, null, 2));
  console.log('Saved to districts_exact.json');
}

run();
