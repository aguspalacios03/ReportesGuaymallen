# Pensando Guaymallén - Plataforma Ciudadana
### Senadora Provincial Luz Llorens (Mendoza, Argentina)

Plataforma web moderna e interactiva de reporte ciudadano y mapa participativo orientada al departamento de Guaymallén, desarrollada para la campaña y gestión legislativa de la Senadora Provincial **Luz Llorens**.

---

## 🌟 Características Principales

1. **Header Institucional y Branding**:
   - Identidad visual "Pensando Guaymallén - Junto a Vos" y "LUZ LLORENS - SENADORA PROVINCIAL".
   - Paleta cromática oficial: Azul marino profundo (`#1A2B4C`), violeta/púrpura institucional (`#7C3AED`), verde ambiental (`#10B981`), amarillo alumbrado (`#EAB308`) y rojo vial (`#DC2626`).
   - Navegación con modales informativos: *Inicio*, *Conocé Guaymallén*, *Reportar Problema* (activo), *Propuestas*, *Contacto* y portal *Login*.

2. **Panel Izquierdo (Feed de Reportes Ciudadanos Recientes)**:
   - Filtro dinámico en tiempo real por Distrito/Barrio (Dorrego, San José, Villa Nueva, Rodeo de la Cruz, El Bermejo, Las Cañas, Belgrano, etc.).
   - Chips de filtrado rápido por categoría (Baches, Alumbrado, Limpieza, Seguridad, Parques).
   - Buscador por calle o palabra clave.
   - Tarjetas de reporte completas con miniatura, estado legislativo, dirección, y los botones:
     - **Ver en Mapa**: Vuela suavemente hacia el marcador y abre su popup interactivo.
     - **Confirmar Issue / Upvote (+1)**: Sistema de apoyos de vecinos con conteo en vivo.
     - **Compartir**: Modal para compartir en WhatsApp o Twitter/X y copiar enlace directo.

3. **Panel Derecho (Mapa Interactivo con Leaflet.js)**:
   - Centrado en Guaymallén, Mendoza (`-32.8988, -68.7900`).
   - **Límites de Distritos interactivos**: Polígonos con efecto hover y clic que filtran automáticamente los reclamos de ese distrito.
   - **Marcadores temáticos personalizados**:
     - 🛑 **Baches y Calles** (Rojo / Marrón)
     - 💡 **Alumbrado Público** (Amarillo / Ámbar)
     - ♻️ **Limpieza y Residuos** (Verde)
     - 🛡️ **Seguridad Ciudadana** (Púrpura)
     - 🌳 **Parques y Espacios Públicos** (Verde Bosque)
   - **Leyenda del Mapa (Map Legend)** flotante en esquina superior derecha que permite filtrar por categoría.
   - **Selector de Capas**: Mapa Urbano y Vista Satelital de alta resolución.
   - **Tarjeta Flotante Institucional**: Fotografía real de la Senadora Luz Llorens con cita, acceso a propuestas y botón directo de WhatsApp (con modo minimizable a avatar circular para no obstaculizar la vista).

4. **Banner Inferior ("Explorá tu Barrio" & Reporte Rápido)**:
   - Selector rápido sincronizado con el mapa y el feed.
   - Contador destacado de reclamos.
   - CTA principal: **"REPORTAR PROBLEMA EN MI BARRIO"**, que abre el modal interactivo para enviar un reclamo e incluso permite hacer clic sobre el mapa para fijar la ubicación exacta.

---

## 🚀 Cómo Ejecutar la Aplicación

### Opción 1: Apertura Directa en el Navegador (Sin instalación)
Simplemente haz doble clic en el archivo `index.html` o ábrelo con Google Chrome, Microsoft Edge, Firefox o Brave.

### Opción 2: Con el Servidor Local Ligero (Node.js)
En la terminal de la carpeta del proyecto, ejecuta:
```bash
node serve.js
```
Luego abre tu navegador en:
`http://localhost:3000`

---

## 📁 Estructura del Proyecto

```
Proyecto Lula/
├── index.html               # Página principal con layout de dos columnas y modales
├── serve.js                 # Servidor estático local sin dependencias
├── README.md                # Documentación del proyecto
└── assets/
    ├── css/
    │   └── styles.css       # Estilos personalizados, Leaflet tweaks y animaciones
    ├── js/
    │   ├── data.js          # Datos de distritos, coordenadas, categorías y reportes iniciales
    │   ├── map.js           # Controlador del mapa Leaflet, marcadores SVG y polígonos
    │   └── app.js           # Estado de la aplicación, filtros, upvotes y modales
    └── img/
        ├── luz_llorens.png  # Fotografía oficial de la Senadora Luz Llorens
        └── hero_luz_vecinos.png # Imagen institucional de campaña con vecinos
```
