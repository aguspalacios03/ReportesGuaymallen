/**
 * Pensando Guaymallén - Módulo de Mapa Interactivo con Leaflet
 * Senadora Provincial Luz Llorens
 */

class GuaymallenMap {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = options;
    this.map = null;
    this.markersGroup = null;
    this.districtLayersGroup = null;
    this.markersMap = new Map(); // id -> leaflet marker
    this.districtLayersMap = new Map(); // districtId -> polygon layer
    this.isPickLocationMode = false;
    this.onLocationPicked = null;
    this.activeReportId = null;
    this.activeDistrictId = 'all';

    // Control de transición de cámara para evitar desacople de polígonos durante zooms interrumpidos
    this._cameraTransitioning = false;
    this._cameraTransitionTimer = null;

    // Estado del reconocedor de gestos (tap consciente vs. arrastre / pan / pinch)
    this._gesture = null;            // gesto de un dedo en curso
    this._activePointers = new Set(); // punteros apoyados (para detectar pinch)
    this._userNavigating = false;     // true desde dragstart hasta moveend (incluye inercia)
    this._lastUserNavEnd = 0;         // timestamp del último fin de navegación manual
    this._lastValidTapAt = 0;         // timestamp del último tap válido (usado por marcadores)
    this._lastPointerType = 'mouse';

    this.init();
  }

  init() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Map container '#${this.containerId}' not found.`);
      return;
    }

    if (typeof L === 'undefined') {
      console.error("Leaflet library 'L' is not loaded!");
      return;
    }

    // Centro geográfico óptimo para ver todo el departamento de Guaymallén
    const guaymallenCenter = [-32.8960, -68.7650];
    const initialZoom = 12;

    try {
      // Renderer vectorial con padding controlado para sincronización perfecta de SVG con la capa de tiles
      this.vectorRenderer = L.svg({ padding: 0.5 });

      // Inicializar mapa de Leaflet
      this.map = L.map(this.containerId, {
        center: guaymallenCenter,
        zoom: initialZoom,
        minZoom: 11,
        maxZoom: 18,
        renderer: this.vectorRenderer,
        zoomControl: false, // Ubicado en la esquina superior derecha
        tap: false          // Desactivar tap handler legado para evitar clics fantasma al soltar el arrastre en pantallas táctiles
      });

      // Control de zoom en top-right para desktop (en mobile se oculta por CSS para pantalla táctil)
      L.control.zoom({ position: 'topright' }).addTo(this.map);

      // Capa base limpia y de alto rendimiento de OpenStreetMap con pre-carga de caché
      this.tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        maxZoom: 19,
        keepBuffer: 8,
        updateWhenIdle: false,
        updateWhenZooming: true
      }).addTo(this.map);

      // Grupos de capas
      this.districtLayersGroup = L.layerGroup().addTo(this.map);
      this.markersGroup = L.layerGroup().addTo(this.map);

      // Renderizar los 21 distritos oficiales con geometrías reales y precalcular límites
      this.renderDistricts();
      this.cacheDistrictBounds();

      // ============================================================
      // RECONOCEDOR DE GESTOS (TAP vs. ARRASTRE) BASADO EN POINTER EVENTS
      // ------------------------------------------------------------
      // La selección de distritos YA NO depende del evento 'click' del
      // navegador (que en mobile se dispara también tras arrastres cortos
      // dentro del "touch slop" y seleccionaba el distrito bajo el dedo).
      // Solo un tap real (un único dedo, sin desplazamiento, sin que el mapa
      // se mueva, sin pinch y sin estar frenando una inercia) selecciona.
      // ============================================================
      this._setupTapRecognizer(container);

      // Recalcular tamaño para evitar cualquier parpadeo de carga
      setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 150);
      setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 500);

      window.addEventListener('resize', () => {
        if (this.map) this.map.invalidateSize();
      });

    } catch (err) {
      console.error("Error al inicializar mapa:", err);
    }
  }

  renderDistricts() {
    if (!this.map || !this.districtLayersGroup) return;
    this.districtLayersGroup.clearLayers();
    this.districtLayersMap.clear();

    const districts = APP_DATA.districts || [];
    // Detección estricta y universal de pantalla táctil o móvil (Chrome Android, iOS Safari, etc.)
    const isTouchOrSmallScreen = ('ontouchstart' in window) || 
                                 (navigator.maxTouchPoints > 0) || 
                                 (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
                                 (window.innerWidth <= 1024);

    districts.forEach(dist => {
      const distColor = dist.color || '#0284C7';

      const polygon = L.polygon(dist.polygon, {
        color: distColor,
        weight: 1.5,
        opacity: 0.85,
        fillColor: distColor,
        fillOpacity: 0.28,
        renderer: this.vectorRenderer,
        className: `district-poly district-${dist.id}`
      });

      // Tooltip informativo y efecto hover: EXCLUSIVAMENTE en computadoras desktop con mouse físico real.
      // En dispositivos móviles o táctiles queda 100% DESACTIVADO para erradicar cualquier selección fantasma,
      // borde negro o tooltip pegado que aparezca al arrastrar o soltar el dedo en mobile.
      if (!isTouchOrSmallScreen) {
        polygon.bindTooltip(`
          <div class="px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 shadow-sm rounded-sm bg-white/95 border border-slate-300">
            <span class="w-2.5 h-2.5 rounded-none inline-block border border-white shrink-0" style="background-color: ${distColor};"></span>
            <span>Distrito ${dist.name}</span>
          </div>
        `, {
          permanent: false,
          sticky: true,
          className: 'custom-district-tooltip'
        });

        // Efecto hover solo con mouse real (nunca con dedo ni eventos táctiles sintetizados)
        polygon.on('mouseover', (e) => {
          if (this._userNavigating || this._cameraTransitioning || this._lastPointerType !== 'mouse') return;
          if (e && e.originalEvent) {
            if (e.originalEvent.pointerType && e.originalEvent.pointerType !== 'mouse') return;
            if (e.originalEvent.sourceCapabilities && e.originalEvent.sourceCapabilities.firesTouchEvents) return;
          }
          polygon.setStyle({
            weight: 3,
            color: '#1A2B4C',
            fillOpacity: 0.5
          });
        });

        polygon.on('mouseout', () => {
          if (this.activeDistrictId !== dist.id) {
            polygon.setStyle({
              weight: 1.5,
              color: distColor,
              fillOpacity: 0.28
            });
          }
        });
      }

      // IMPORTANTE: la selección del distrito NO se hace en 'click'.
      // La resuelve _handleTap() a partir de un tap validado por el reconocedor de gestos.
      // Aquí solo se frena la propagación para que Leaflet no procese el click como "click en el mapa".
      polygon.on('click', (e) => {
        if (e) L.DomEvent.stopPropagation(e);
      });

      this.districtLayersGroup.addLayer(polygon);
      this.districtLayersMap.set(dist.id, polygon);
    });
  }

  /**
   * Reconocedor de gestos de un solo dedo basado exclusivamente en Pointer Events
   * (soportados en Chrome Android, Safari iOS 13+, Firefox y desktop).
   * Un gesto se considera TAP solo si:
   *  - hay un único puntero apoyado durante todo el gesto (sin pinch),
   *  - el dedo no se desplaza más de la tolerancia,
   *  - Leaflet no inicia ningún arrastre (dragstart) durante el gesto,
   *  - el mapa no estaba en movimiento por un arrastre/inercia al apoyar el dedo,
   *  - dura menos de 600 ms.
   * Cualquier otra cosa es navegación y JAMÁS modifica el distrito seleccionado.
   */
  _setupTapRecognizer(container) {
    const TOUCH_TOLERANCE = 6;  // px
    const MOUSE_TOLERANCE = 4;  // px
    const MAX_TAP_MS = 600;
    const NAV_COOLDOWN_MS = 300;
    const opts = { capture: true, passive: true };

    const cancelGesture = () => { if (this._gesture) this._gesture.cancelled = true; };

    container.addEventListener('pointerdown', (e) => {
      this._lastPointerType = e.pointerType || 'mouse';
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      // Si el mapa estaba en una transición o animación de zoom, detenerla inmediatamente
      // para anclar los polígonos al mapa con escala 1 exacta y sin deformaciones
      if (this._cameraTransitioning) {
        this.stopCameraTransition();
      }

      // Erradicar tooltips y limpiar cualquier hover previo en polígonos
      this.closeAllTooltips();
      this.resetDistrictHoverStyles();

      this._activePointers.add(e.pointerId);
      if (this._activePointers.size > 1) {
        // Segundo dedo: es un pinch / zoom, nunca un tap
        cancelGesture();
        this._userNavigating = true;
        return;
      }

      // Seguridad: si quedó marcado como navegando pero el mapa lleva >1s quieto, liberar
      if (this._userNavigating && Date.now() - (this._lastMoveAt || 0) > 1000) {
        this._userNavigating = false;
      }

      this._gesture = {
        id: e.pointerId,
        type: e.pointerType || 'mouse',
        x: e.clientX,
        y: e.clientY,
        t: Date.now(),
        maxMove: 0,
        // Si el dedo se apoya mientras el mapa se desliza por inercia (o recién se detuvo),
        // ese toque solo sirve para frenar el mapa: nunca selecciona.
        cancelled: this._userNavigating || (Date.now() - this._lastUserNavEnd < NAV_COOLDOWN_MS)
      };
    }, opts);

    container.addEventListener('pointermove', (e) => {
      if (e.pointerType) this._lastPointerType = e.pointerType;
      const g = this._gesture;
      if (!g || e.pointerId !== g.id || g.cancelled) return;
      const d = Math.hypot(e.clientX - g.x, e.clientY - g.y);
      if (d > g.maxMove) g.maxMove = d;
      const tol = g.type === 'mouse' ? MOUSE_TOLERANCE : TOUCH_TOLERANCE;
      if (g.maxMove > tol) g.cancelled = true;
    }, opts);

    const finish = (e, isCancel) => {
      this._activePointers.delete(e.pointerId);
      const g = this._gesture;
      if (!g || e.pointerId !== g.id) return;
      this._gesture = null;

      if (isCancel || g.cancelled) return;
      const d = Math.hypot(e.clientX - g.x, e.clientY - g.y);
      const tol = g.type === 'mouse' ? MOUSE_TOLERANCE : TOUCH_TOLERANCE;
      if (Math.max(d, g.maxMove) > tol) return;
      if (Date.now() - g.t > MAX_TAP_MS) return;

      // ✅ Tap consciente confirmado
      this._lastValidTapAt = Date.now();
      this._handleTap(e);
    };

    container.addEventListener('pointerup', (e) => finish(e, false), opts);
    container.addEventListener('pointercancel', (e) => finish(e, true), opts);
    // Si el puntero sale del contenedor (p. ej. arrastre hacia el header) se descarta
    container.addEventListener('lostpointercapture', (e) => this._activePointers.delete(e.pointerId), opts);

    // Estado de navegación manual reportado por Leaflet (arrastres deliberados del usuario)
    this.map.on('dragstart', () => {
      this._userNavigating = true;
      cancelGesture();
      if (this._cameraTransitioning) {
        this.stopCameraTransition();
      }
      this.resetDistrictHoverStyles();
      this.closeAllTooltips();
    });
    this.map.on('zoomstart', () => {
      cancelGesture();
      this.resetDistrictHoverStyles();
      this.closeAllTooltips();
    });
    this.map.on('drag', () => {
      this._lastMoveAt = Date.now();
      cancelGesture();
    });
    this.map.on('dragend', () => {
      this._userNavigating = false;
      this._lastUserNavEnd = Date.now();
      this.resetDistrictHoverStyles();
      this.closeAllTooltips();
    });
    this.map.on('moveend zoomend', () => {
      this.resetDistrictHoverStyles();
      this.closeAllTooltips();
    });
  }

  /**
   * Ejecuta la acción de un tap ya validado. Es el ÚNICO lugar donde
   * el mapa cambia el distrito seleccionado.
   */
  _handleTap(e) {
    const target = e.target;
    if (!target || !target.closest) return;

    // Modo selección de ubicación para un nuevo reclamo: mover el pin
    if (this.isPickLocationMode) {
      if (typeof this.pickerClickHandler === 'function') {
        this.pickerClickHandler({ latlng: this.map.mouseEventToLatLng(e) });
      }
      return;
    }

    // Toques sobre marcadores, popups, tooltips o controles: los manejan sus propios handlers
    if (target.closest('.leaflet-marker-icon, .leaflet-popup, .leaflet-tooltip, .leaflet-control, .leaflet-control-container, button, a, input, select, #senator-floating-card')) {
      return;
    }

    if (!window.App) return;

    let distId = null;
    const poly = target.closest('.district-poly');
    if (poly) {
      const cls = Array.from(poly.classList).find(c => c.indexOf('district-') === 0 && c !== 'district-poly');
      if (cls) distId = cls.slice('district-'.length);
    }

    // Si el elemento DOM bajo el toque no es directamente el path del polígono (por ejemplo
    // capas internas de SVG), determinar el distrito matemáticamente a partir de las coordenadas del toque
    if (!distId && this.map && APP_DATA.districts) {
      const latlng = this.map.mouseEventToLatLng(e);
      const foundDist = APP_DATA.districts.find(d => this.isPointInPolygon(latlng, d.polygon));
      if (foundDist) distId = foundDist.id;
    }

    if (distId) {
      // Tap sobre un distrito: alternar su selección (si ya estaba seleccionado, volver a 'all')
      const isAlreadySelected = (window.App.selectedDistrict === distId) || (this.activeDistrictId === distId);
      window.App.selectDistrict(isAlreadySelected ? 'all' : distId);
    } else {
      // Tap deliberado fuera de cualquier distrito (área vacía / mapa general):
      // Si hay un distrito activo, deseleccionar y volver a la vista general de Guaymallén
      const hasActiveSelection = (window.App.selectedDistrict && window.App.selectedDistrict !== 'all') ||
                                 (this.activeDistrictId && this.activeDistrictId !== 'all');
      if (hasActiveSelection) {
        window.App.selectDistrict('all');
      }
    }
  }

  closeAllTooltips() {
    if (!this.map || !this.districtLayersMap) return;
    try {
      this.districtLayersMap.forEach((layer) => {
        if (layer && typeof layer.closeTooltip === 'function') {
          layer.closeTooltip();
        }
      });
    } catch (_) {}
  }

  resetDistrictHoverStyles() {
    if (!this.districtLayersMap) return;
    this.districtLayersMap.forEach((layer, id) => {
      if (id !== this.activeDistrictId) {
        const dist = APP_DATA.districts ? APP_DATA.districts.find(d => d.id === id) : null;
        const baseColor = (dist && dist.color) ? dist.color : '#0284C7';
        layer.setStyle({
          weight: 1.5,
          color: baseColor,
          fillColor: baseColor,
          fillOpacity: 0.28
        });
      }
    });
  }

  stopCameraTransition() {
    if (this._cameraTransitionTimer) {
      clearTimeout(this._cameraTransitionTimer);
      this._cameraTransitionTimer = null;
    }
    if (this.map) {
      this.map.stop();
      const currentZoom = this.map.getZoom();
      const snappedZoom = Math.round(currentZoom);
      // Forzar anclaje a zoom entero y escala 1 en el renderer para que los polígonos
      // NUNCA queden estirados, agigantados o achicados respecto al mapa base
      if (Math.abs(currentZoom - snappedZoom) > 0.001) {
        this.map.setView(this.map.getCenter(), snappedZoom, { animate: false, reset: true });
      }
      if (this.map.dragging && !this.map.dragging.enabled()) {
        this.map.dragging.enable();
      }
      if (this.vectorRenderer && typeof this.vectorRenderer._update === 'function') {
        this.vectorRenderer._update();
      }
    }
    this._cameraTransitioning = false;
  }

  animateCameraToBounds(bounds, options = {}) {
    if (!this.map) return;
    this.stopCameraTransition();

    const isMobile = window.innerWidth <= 768;
    const padding = options.padding || (isMobile ? [30, 30] : [60, 60]);
    const maxZoom = options.maxZoom || (isMobile ? 13 : 13.5);
    const duration = options.duration !== undefined ? options.duration : 0.35; // 350ms, super fluido

    this._cameraTransitioning = true;
    if (this.map.dragging) this.map.dragging.disable();

    this.map.fitBounds(bounds, {
      padding: padding,
      maxZoom: maxZoom,
      animate: true,
      duration: duration
    });

    const finalize = () => {
      if (this._cameraTransitionTimer) {
        clearTimeout(this._cameraTransitionTimer);
        this._cameraTransitionTimer = null;
      }
      this.map.off('moveend', finalize);
      this.stopCameraTransition();
    };

    this.map.on('moveend', finalize);
    this._cameraTransitionTimer = setTimeout(finalize, Math.round(duration * 1000) + 100);
  }

  animateCameraTo(latlng, zoom, duration = 0.35, onComplete = null) {
    if (!this.map) return;
    this.stopCameraTransition();

    this._cameraTransitioning = true;
    if (this.map.dragging) this.map.dragging.disable();

    this.map.setView(latlng, zoom, {
      animate: true,
      duration: duration
    });

    const finalize = () => {
      if (this._cameraTransitionTimer) {
        clearTimeout(this._cameraTransitionTimer);
        this._cameraTransitionTimer = null;
      }
      this.map.off('moveend', finalize);
      this.stopCameraTransition();
      if (typeof onComplete === 'function') onComplete();
    };

    this.map.on('moveend', finalize);
    this._cameraTransitionTimer = setTimeout(finalize, Math.round(duration * 1000) + 100);
  }

  highlightDistrict(districtId) {
    if (!this.map) return;
    this.activeDistrictId = districtId;

    this.districtLayersMap.forEach((layer, id) => {
      const dist = APP_DATA.districts ? APP_DATA.districts.find(d => d.id === id) : null;
      const baseColor = (dist && dist.color) ? dist.color : '#4338CA';

      if (id === districtId) {
        layer.setStyle({
          weight: 4,
          color: '#1A2B4C',
          fillColor: baseColor,
          fillOpacity: 0.6
        });
        layer.bringToFront();
        if (dist) {
          const bounds = dist._bounds || layer.getBounds();
          this.animateCameraToBounds(bounds, { duration: 0.35 });
        }
      } else {
        layer.setStyle({
          weight: 1.5,
          color: baseColor,
          fillColor: baseColor,
          fillOpacity: 0.28
        });
      }
    });

    if (districtId === 'all') {
      this.resetView();
    }
  }

  createCustomIcon(category, isSelected = false) {
    const catConfig = (APP_DATA.categories && APP_DATA.categories.find(c => c.id === category)) || { pinColor: '#0284C7' };
    const pinColor = catConfig.pinColor || '#0284C7';
    
    let iconSvg = '';
    switch (category) {
      case 'baches':
        iconSvg = `<svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        break;
      case 'alumbrado':
        iconSvg = `<svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`;
        break;
      case 'limpieza':
        iconSvg = `<svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
        break;
      case 'seguridad':
        iconSvg = `<svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
        break;
      case 'parques':
        iconSvg = `<svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-4 4.3a1 1 0 0 0 .8 1.7H10l-3 3.3a1 1 0 0 0 .7 1.7H10l-3 3.3a1 1 0 0 0 .7 1.7H12"/></svg>`;
        break;
      default:
        iconSvg = `<svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    }

    const sizeClass = isSelected ? 'scale-125 ring-4 ring-sky-400 z-50' : 'hover:scale-110';
    const pulseRing = isSelected ? '<div class="absolute -inset-1 rounded-full bg-sky-500 opacity-75 animate-ping"></div>' : '';

    const html = `
      <div class="relative group cursor-pointer transition-transform duration-200 ${sizeClass}" style="transform-origin: 50% 100%;">
        ${pulseRing}
        <div class="w-8 h-8 rounded-full shadow-lg flex items-center justify-center border-2 border-white transition-all shadow-black/25" style="background-color: ${pinColor};">
          ${iconSvg}
        </div>
        <div class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] mx-auto -mt-0.5" style="border-top-color: ${pinColor};"></div>
      </div>
    `;

    return L.divIcon({
      className: 'custom-map-marker',
      html: html,
      iconSize: [32, 40],
      iconAnchor: [16, 40],
      popupAnchor: [0, -40]
    });
  }

  renderMarkers(reports, activeReportId = null) {
    if (!this.map || !this.markersGroup) return;
    this.markersGroup.clearLayers();
    this.markersMap.clear();
    this.activeReportId = activeReportId;

    reports.forEach(report => {
      const isSelected = report.id === activeReportId;
      const icon = this.createCustomIcon(report.category, isSelected);

      const marker = L.marker([report.lat, report.lng], {
        icon: icon,
        title: report.title,
        riseOnHover: true
      });

      const popupContent = `
        <div class="w-72 bg-white rounded-sm shadow-2xl overflow-hidden font-sans border border-slate-300 border-l-4 border-l-[#0072bb]">
          <div class="p-3.5 space-y-2">
            <div class="flex items-center justify-between gap-1">
              <span class="px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-[#0a2540] border border-slate-200">
                ${report.districtName}
              </span>
              <span class="text-[10px] text-slate-400 font-medium">
                ${report.date || 'Reciente'}
              </span>
            </div>

            <h4 class="font-serif font-bold text-slate-900 text-sm leading-snug">
              ${report.title}
            </h4>
            
            <p class="text-xs text-slate-500 flex items-center gap-1">
              <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <span>${report.address}</span>
            </p>

            <p class="text-xs text-slate-600 line-clamp-3 leading-relaxed bg-slate-50 p-2 rounded-sm border border-slate-200/80">
              ${report.description}
            </p>

            <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <button 
                onclick="window.App.upvoteReport('${report.id}')"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider ${report.userUpvoted ? 'bg-[#0072bb] text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} transition-all shadow-xs border border-slate-200">
                <svg class="w-3.5 h-3.5 ${report.userUpvoted ? 'fill-current' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"/></svg>
                <span>${report.upvotes || 1}</span>
                <span>${report.userUpvoted ? 'Apoyado' : 'Apoyar'}</span>
              </button>

              <button 
                onclick="window.App.focusReportCard('${report.id}')"
                class="px-3 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#0a2540] hover:bg-[#0072bb] text-white transition-all shadow-xs border-l-2 border-[#c59b27]">
                Ver en Lista
              </button>
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        maxWidth: 320,
        className: 'custom-leaflet-popup'
      });

      marker.on('click', (e) => {
        // Bloquear clic en marcador si el mapa se estaba arrastrando o navegando libremente
        if (this._userNavigating || (Date.now() - (this._lastUserNavEnd || 0) < 300)) {
          return;
        }

        if (e) {
          if (e.originalEvent) e.originalEvent.stopPropagation();
          L.DomEvent.stopPropagation(e);
        }
        this._ignoreNextMapClick = true;
        setTimeout(() => { this._ignoreNextMapClick = false; }, 200);

        if (window.App) {
          window.App.onMarkerClick(report.id);
        }
      });

      this.markersGroup.addLayer(marker);
      this.markersMap.set(report.id, marker);
    });
  }

  focusReport(reportId, zoom = 16) {
    const marker = this.markersMap.get(reportId);
    if (!marker || !this.map) return;

    this.animateCameraTo(marker.getLatLng(), zoom, 0.35, () => {
      marker.openPopup();
    });
  }

  resetView() {
    if (!this.map) return;
    this.animateCameraTo([-32.8960, -68.7650], 12, 0.35);
  }

  createDraggableRedIcon() {
    const html = `
      <div class="draggable-pin-container select-none">
        <div class="pin-ring-pulse"></div>
        <div class="pin-marker-head">
          <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>
        <div class="pin-marker-point"></div>
      </div>
    `;
    return L.divIcon({
      className: 'custom-draggable-pin',
      html: html,
      iconSize: [44, 54],
      iconAnchor: [22, 54],
      tooltipAnchor: [0, -56]
    });
  }

  isPointInPolygon(point, polygon) {
    if (!polygon || polygon.length === 0) return true;
    const x = point.lat !== undefined ? point.lat : point[0];
    const y = point.lng !== undefined ? point.lng : point[1];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  cacheDistrictBounds() {
    if (!APP_DATA.districts) return;
    APP_DATA.districts.forEach(dist => {
      if (!dist._bounds && dist.polygon && dist.polygon.length) {
        dist._bounds = L.latLngBounds(dist.polygon);
      }
    });
  }

  startDraggablePicker(districtId, initialLocation = null) {
    if (!this.map) return;
    this.isPickLocationMode = true;

    // Ocultar leyenda y botón de centrado del mapa durante el modo picker para una vista totalmente limpia
    const legendBox = document.getElementById('map-legend-box');
    if (legendBox) legendBox.classList.add('hidden');
    const resetBtn = document.getElementById('btn-reset-map');
    if (resetBtn) resetBtn.classList.add('hidden');

    // 1. APAGAR capas normales (removiéndolas del mapa sin destruirlas para evitar costo de re-renderizado)
    if (this.map.hasLayer(this.districtLayersGroup)) {
      this.map.removeLayer(this.districtLayersGroup);
    }
    if (this.map.hasLayer(this.markersGroup)) {
      this.map.removeLayer(this.markersGroup);
    }

    // 2. Encender o actualizar INSTANTÁNEAMENTE el distrito seleccionado (0 ms)
    const dist = APP_DATA.districts.find(d => d.id === districtId);
    if (!dist) return;

    if (!dist._bounds && dist.polygon) {
      dist._bounds = L.latLngBounds(dist.polygon);
    }

    const distColor = dist.color || '#0284C7';

    if (!this.pickerDistrictLayer) {
      this.pickerDistrictLayer = L.polygon(dist.polygon, {
        color: distColor,
        weight: 3.5,
        opacity: 1,
        fillColor: distColor,
        fillOpacity: 0.35,
        interactive: false
      }).addTo(this.map);
    } else {
      // Reutilizar la capa existente para cambio instantáneo de geometría y color sin parpadeo
      this.pickerDistrictLayer.setLatLngs(dist.polygon);
      this.pickerDistrictLayer.setStyle({
        color: distColor,
        fillColor: distColor,
        fillOpacity: 0.35
      });
      if (!this.map.hasLayer(this.pickerDistrictLayer)) {
        this.pickerDistrictLayer.addTo(this.map);
      }
      this.pickerDistrictLayer.bringToFront();
    }

    // 3. Posicionar el pin arrastrable instantáneamente dentro del distrito
    let startPoint = initialLocation || dist.center || [-32.8960, -68.7650];
    if (!this.isPointInPolygon(startPoint, dist.polygon)) {
      startPoint = dist.center;
    }

    if (!this.pickerMarker) {
      this.pickerMarker = L.marker(startPoint, {
        draggable: true,
        icon: this.createDraggableRedIcon(),
        zIndexOffset: 1200,
        autoPan: true
      }).addTo(this.map);
    } else {
      this.pickerMarker.setLatLng(startPoint);
      if (!this.map.hasLayer(this.pickerMarker)) {
        this.pickerMarker.addTo(this.map);
      }
    }

    let lastValidLatLng = L.latLng(
      startPoint.lat !== undefined ? startPoint.lat : startPoint[0],
      startPoint.lng !== undefined ? startPoint.lng : startPoint[1]
    );

    // 4. DELIMITACIÓN ESTRICTA: El pin NO PUEDE SALIRSE del distrito
    this.pickerMarker.off('drag');
    this.pickerMarker.off('dragend');

    this.pickerMarker.on('drag', () => {
      const current = this.pickerMarker.getLatLng();
      if (dist && this.isPointInPolygon(current, dist.polygon)) {
        lastValidLatLng = current;
      } else {
        this.pickerMarker.setLatLng(lastValidLatLng);
      }
    });

    this.pickerMarker.on('dragend', () => {
      const current = this.pickerMarker.getLatLng();
      if (dist && !this.isPointInPolygon(current, dist.polygon)) {
        this.pickerMarker.setLatLng(lastValidLatLng);
      }
    });

    // Permitir clic en el mapa solo dentro del distrito
    if (this.pickerClickHandler) {
      this.map.off('click', this.pickerClickHandler);
    }
    this.pickerClickHandler = (e) => {
      if (this.isPickLocationMode && this.pickerMarker) {
        if (this._userNavigating || (Date.now() - (this._lastUserNavEnd || 0) < 300)) return;

        if (dist && this.isPointInPolygon(e.latlng, dist.polygon)) {
          lastValidLatLng = e.latlng;
          this.pickerMarker.setLatLng(e.latlng);
        } else {
          if (window.App && dist) {
            window.App.showToast(`El punto debe estar dentro de los límites de ${dist.name}`, 'warning', 2500);
          }
        }
      }
    };
    this.map.on('click', this.pickerClickHandler);

    // 5. Movimiento de cámara suave, rápido y sincronizado (350ms)
    this.map.setMaxBounds(null);
    if (dist._bounds) {
      this.animateCameraToBounds(dist._bounds, {
        padding: [50, 50],
        maxZoom: 14,
        duration: 0.35
      });
    } else if (dist.center) {
      this.animateCameraTo(dist.center, 13.5, 0.35);
    }
  }

  getPickerLocation() {
    if (this.pickerMarker) {
      return this.pickerMarker.getLatLng();
    }
    return null;
  }

  stopDraggablePicker() {
    this.isPickLocationMode = false;
    this.map.setMaxBounds(null);

    // Ocultar capa del distrito en modo picker
    if (this.pickerDistrictLayer && this.map.hasLayer(this.pickerDistrictLayer)) {
      this.map.removeLayer(this.pickerDistrictLayer);
    }

    if (this.pickerMarker && this.map.hasLayer(this.pickerMarker)) {
      this.map.removeLayer(this.pickerMarker);
    }

    if (this.pickerClickHandler) {
      this.map.off('click', this.pickerClickHandler);
      this.pickerClickHandler = null;
    }

    // Restaurar capas normales instantáneamente (ya están en memoria)
    if (!this.map.hasLayer(this.districtLayersGroup)) {
      this.map.addLayer(this.districtLayersGroup);
    }
    if (!this.map.hasLayer(this.markersGroup)) {
      this.map.addLayer(this.markersGroup);
    }

    // Volver a mostrar leyenda y botón de centrado
    const legendBox = document.getElementById('map-legend-box');
    if (legendBox) legendBox.classList.remove('hidden');
    const resetBtn = document.getElementById('btn-reset-map');
    if (resetBtn) resetBtn.classList.remove('hidden');
  }
}


