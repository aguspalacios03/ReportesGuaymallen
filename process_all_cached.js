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
  { id: 2962926, key: 'puente_de_hierro', name: 'Puente de Hierro', color: '#62C9EC', desc: 'Extremo noreste de Guaymallén' },
  { id: 11174871, key: 'colonia_molina', name: 'Colonia Molina', color: '#F59E0B', desc: 'Distrito productivo del norte, capital del camote' }
];

function stitchDistrict(rel) {
  const filePath = path.join('cache_osm', `${rel.id}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`Missing file for ${rel.name}`);
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

  if (waysCoords.length === 0) return null;

  let remaining = waysCoords.map(w => [...w]);
  let ring = [...remaining.shift()];

  let changed = true;
  while (remaining.length > 0 && changed) {
    changed = false;
    const startNode = ring[0];
    const endNode = ring[ring.length - 1];

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      const s0 = seg[0];
      const s1 = seg[seg.length - 1];

      // End of ring matches start of seg
      if (Math.hypot(endNode.lat - s0.lat, endNode.lon - s0.lon) < 0.00015) {
        ring.push(...seg.slice(1));
        remaining.splice(i, 1);
        changed = true;
        break;
      }
      // End of ring matches end of seg
      if (Math.hypot(endNode.lat - s1.lat, endNode.lon - s1.lon) < 0.00015) {
        ring.push(...seg.slice(0, -1).reverse());
        remaining.splice(i, 1);
        changed = true;
        break;
      }
      // Start of ring matches end of seg
      if (Math.hypot(startNode.lat - s1.lat, startNode.lon - s1.lon) < 0.00015) {
        ring.unshift(...seg.slice(0, -1));
        remaining.splice(i, 1);
        changed = true;
        break;
      }
      // Start of ring matches start of seg
      if (Math.hypot(startNode.lat - s0.lat, startNode.lon - s0.lon) < 0.00015) {
        ring.unshift(...seg.slice(1).reverse());
        remaining.splice(i, 1);
        changed = true;
        break;
      }
    }
  }

  // Ensure closed
  if (ring.length > 2) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (Math.hypot(first.lat - last.lat, first.lon - last.lon) > 0.0001) {
      ring.push(first);
    }
  }

  // Mild simplification: filter out collinear points with tolerance 0.00008 (~8 meters)
  const pts = ring.slice(0, -1);
  function DouglasPeucker(points, epsilon) {
    if (points.length <= 2) return points;
    let dmax = 0;
    let index = 0;
    const end = points.length - 1;
    for (let i = 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[0], points[end]);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }
    if (dmax > epsilon) {
      const recResults1 = DouglasPeucker(points.slice(0, index + 1), epsilon);
      const recResults2 = DouglasPeucker(points.slice(index), epsilon);
      return recResults1.slice(0, -1).concat(recResults2);
    } else {
      return [points[0], points[end]];
    }
  }

  function perpendicularDistance(p, lineStart, lineEnd) {
    let dx = lineEnd.lon - lineStart.lon;
    let dy = lineEnd.lat - lineStart.lat;
    const mag = Math.hypot(dx, dy);
    if (mag === 0) return Math.hypot(p.lon - lineStart.lon, p.lat - lineStart.lat);
    return Math.abs(dy * p.lon - dx * p.lat + lineEnd.lon * lineStart.lat - lineEnd.lat * lineStart.lon) / mag;
  }

  const simplified = DouglasPeucker(pts, 0.00008);
  simplified.push(simplified[0]); // close ring

  const polygon = simplified.map(p => [Number(p.lat.toFixed(5)), Number(p.lon.toFixed(5))]);

  // Compute centroid
  let cLat = 0, cLng = 0;
  simplified.forEach(p => { cLat += p.lat; cLng += p.lon; });
  cLat = Number((cLat / simplified.length).toFixed(5));
  cLng = Number((cLng / simplified.length).toFixed(5));

  return {
    id: rel.key,
    name: rel.name,
    color: rel.color,
    desc: rel.desc,
    center: [cLat, cLng],
    polygon: polygon
  };
}

const allDistricts = [];
relations.forEach(r => {
  const d = stitchDistrict(r);
  if (d) {
    console.log(`✓ ${d.name}: ${d.polygon.length} points, Center: [${d.center}]`);
    allDistricts.push(d);
  }
});

console.log(`\nSuccessfully processed ${allDistricts.length} / 20 districts!`);
fs.writeFileSync('districts_exact.json', JSON.stringify(allDistricts, null, 2));
