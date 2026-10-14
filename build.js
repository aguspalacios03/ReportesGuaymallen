/**
 * Script de compilación para producción (Build)
 * Pensando Guaymallén - Senadora Provincial Luz Llorens
 * 
 * Genera una versión limpia y lista para producción en el directorio /dist
 */

const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const distDir = path.join(__dirname, 'dist');

console.log('\n========================================================');
console.log('📦 Pensando Guaymallén - Compilación para Producción');
console.log('   Senadora Provincial Luz Llorens');
console.log('========================================================\n');

try {
  // 1. Limpiar directorio dist previo si existe
  if (fs.existsSync(distDir)) {
    console.log('🧹 Limpiando directorio dist/ anterior...');
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  // 2. Crear directorio dist nuevo
  fs.mkdirSync(distDir, { recursive: true });
  console.log('📁 Directorio dist/ preparado.');

  // 3. Copiar index.html
  const indexPath = path.join(srcDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    fs.copyFileSync(indexPath, path.join(distDir, 'index.html'));
    console.log('📄 [OK] index.html copiado.');
  } else {
    throw new Error('No se encontró index.html en la raíz del proyecto.');
  }

  // 4. Copiar carpeta assets (CSS, JS, imágenes, iconos, vendors)
  const assetsSrc = path.join(srcDir, 'assets');
  const assetsDist = path.join(distDir, 'assets');
  if (fs.existsSync(assetsSrc)) {
    fs.cpSync(assetsSrc, assetsDist, { recursive: true });
    console.log('🎨 [OK] assets/ copiado (CSS, JS, imágenes y librerías).');
  }

  // 5. Copiar README.md si existe
  const readmePath = path.join(srcDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.copyFileSync(readmePath, path.join(distDir, 'README.md'));
  }

  // 6. Contar archivos y tamaño total compilado
  function getDirStats(dir) {
    let count = 0;
    let bytes = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = getDirStats(fullPath);
        count += sub.count;
        bytes += sub.bytes;
      } else {
        count += 1;
        bytes += fs.statSync(fullPath).size;
      }
    }
    return { count, bytes };
  }

  const stats = getDirStats(distDir);
  const sizeMb = (stats.bytes / (1024 * 1024)).toFixed(2);
  const sizeKb = (stats.bytes / 1024).toFixed(1);

  console.log('\n--------------------------------------------------------');
  console.log(`✨ ¡Compilación completada exitosamente!`);
  console.log(`📊 Archivos generados: ${stats.count} archivos`);
  console.log(`💾 Tamaño total compilado: ${sizeMb > 1 ? sizeMb + ' MB' : sizeKb + ' KB'}`);
  console.log(`🚀 Salida de producción lista en: ${distDir}`);
  console.log('--------------------------------------------------------\n');
  process.exit(0);

} catch (error) {
  console.error('\n❌ Error durante la compilación:', error.message);
  process.exit(1);
}
