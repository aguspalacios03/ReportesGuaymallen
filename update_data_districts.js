const fs = require('fs');

const exact = JSON.parse(fs.readFileSync('districts_exact.json', 'utf8'));
let dataJs = fs.readFileSync('assets/js/data.js', 'utf8');

// Replace districts: [ ... ], with exact
const jsonString = JSON.stringify(exact, null, 2);
const startMarker = '  // 20 Distritos Oficiales de Guaymallén según el mapa oficial\n  districts: ';
const endMarker = '  // Reclamos iniciales vacíos para permitir registrar reclamos reales\n  initialReports: [],';

const startIndex = dataJs.indexOf(startMarker);
const endIndex = dataJs.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
  const newContent = dataJs.substring(0, startIndex + startMarker.length) + 
                     jsonString + ',\n\n' + 
                     dataJs.substring(endIndex);
  fs.writeFileSync('assets/js/data.js', newContent, 'utf8');
  console.log('assets/js/data.js updated with exact district geometry!');
} else {
  console.error('Markers not found in data.js');
}
