/**
 * Pensando Guaymallén - Lógica Principal de la Aplicación
 * Senadora Provincial Luz Llorens
 */

class PensandoGuaymallenApp {
  constructor() {
    this.currentView = 'map'; // 'map' | 'conoce' | 'propuestas' | 'contacto'
    this.reports = this.loadReports();
    this.authMode = 'login'; // 'login' | 'register'
    this.currentUser = this.loadCurrentUser(); // Usuario autenticado { id, name, email }
    this.reportScope = 'all'; // 'all' | 'mine'
    this.selectedDistrict = 'all';
    this.selectedCategory = 'all';
    this.searchQuery = '';
    this.activeReportId = null;
    this.mapInstance = null;
    this.activeTab = 'map'; // for mobile view: 'map' | 'list' (en mobile arranca en 'map' como en el mockup)
    this.isPickingLocation = false;
    this.pendingLocation = null;

    this.init();
  }

  getRegisteredUsers() {
    try {
      return JSON.parse(localStorage.getItem('guaymallen_registered_users') || '{}');
    } catch (e) {
      return {};
    }
  }

  saveRegisteredUsers(users) {
    try {
      localStorage.setItem('guaymallen_registered_users', JSON.stringify(users));
    } catch (e) {}
  }

  loadCurrentUser() {
    try {
      const saved = sessionStorage.getItem('pensando_guaymallen_user');
      if (saved) {
        const user = JSON.parse(saved);
        if (user && user.email) {
          const registeredUsers = this.getRegisteredUsers();
          const registered = registeredUsers[user.email.toLowerCase()];
          if (registered) {
            return {
              id: registered.id || user.id,
              name: registered.name || user.name || user.email.split('@')[0],
              email: registered.email || user.email,
              phone: registered.phone || user.phone || ''
            };
          }
        }
        return user;
      }
    } catch (e) {}
    return null;
  }

  loadReports() {
    // Modo de prueba interactivo: No se persiste en el almacenamiento permanente.
    // Al recargar la página (F5), la plataforma vuelve automáticamente a 0 reclamos.
    try {
      localStorage.removeItem('pensando_guaymallen_reports');
      localStorage.removeItem('pensando_guaymallen_reports_v2');
      sessionStorage.removeItem('pensando_guaymallen_reports_v2');
    } catch (e) {}
    return [];
  }

  saveReports() {
    // No se guarda en localStorage: los reclamos solo viven mientras la pestaña esté abierta
  }

  init() {
    // Inicializar mapa de Guaymallén
    this.mapInstance = new GuaymallenMap('map-container');

    // Cargar selectores de distritos y categorías
    this.populateDistrictSelects();
    this.populateCategoryFilters();

    // Renderizar lista de distritos en la página "Conocé Guaymallén"
    this.renderConoceDistricts();

    // Renderizar estado de usuario en Header y Drawer
    this.renderUserHeader();
    this.syncFormUserSession();
    this.updateScopeTabs();

    // Renderizar tarjetas de reportes
    this.renderReports();

    // Actualizar marcadores en el mapa
    this.updateMapMarkers();

    // Actualizar contador
    this.updateStats();

    // Inicializar pestaña móvil si estamos en pantalla chica
    if (window.innerWidth < 768) {
      this.switchMobileTab('map');
    }

    // Eventos
    this.attachEvents();

    // Vista inicial (por defecto 'inicio', o hash '#map' / '#conoce' si viene con ancla)
    const initialView = (window.location.hash === '#map' || window.location.hash === '#mapa') ? 'map'
      : (window.location.hash === '#conoce') ? 'conoce'
      : 'inicio';
    this.navigateToView(initialView);
  }

  populateDistrictSelects() {
    const mainSelect = document.getElementById('filter-district-select');
    const bannerSelect = document.getElementById('banner-district-select');
    const step1Select = document.getElementById('step1-district-select');
    const propuestaSelect = document.getElementById('propuesta-district-select');

    // Ordenamiento alfabético de la A a la Z respetando acentos en español
    const sortedDistricts = [...APP_DATA.districts].sort((a, b) => 
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    );

    const options = [
      { id: 'all', name: `Todos los Barrios / Distritos (${sortedDistricts.length})` },
      ...sortedDistricts
    ];

    const generateHtml = (includeAll = true) => {
      return (includeAll ? options : sortedDistricts)
        .map(d => `<option value="${d.id}">${d.name}</option>`)
        .join('');
    };

    if (mainSelect) mainSelect.innerHTML = generateHtml(true);
    if (bannerSelect) bannerSelect.innerHTML = generateHtml(true);
    if (step1Select) step1Select.innerHTML = generateHtml(false);

    const pickerSelect = document.getElementById('map-picker-district-select');
    if (pickerSelect) pickerSelect.innerHTML = generateHtml(false);

    if (propuestaSelect) {
      propuestaSelect.innerHTML = `
        <option value="" disabled selected>Seleccioná tu distrito...</option>
        ${sortedDistricts.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
      `;
    }
  }

  populateCategoryFilters() {
    const categoryBar = document.getElementById('category-filter-bar');
    const modalCategorySelect = document.getElementById('modal-category-select');

    if (categoryBar) {
      categoryBar.innerHTML = APP_DATA.categories.map(cat => {
        const isActive = this.selectedCategory === cat.id;
        return `
          <button 
            type="button" 
            data-category="${cat.id}"
            class="category-chip shrink-0 px-3 py-1.5 rounded-sm text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
              isActive 
                ? 'bg-[#0a2540] text-white border-[#0a2540] shadow-xs' 
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400'
            }">
            <i class="fa-solid ${cat.icon} text-[11px] ${isActive ? 'text-[#c59b27]' : 'text-slate-400'}"></i>
            <span>${cat.name}</span>
          </button>
        `;
      }).join('');
    }

    if (modalCategorySelect) {
      modalCategorySelect.innerHTML = APP_DATA.categories
        .filter(c => c.id !== 'all')
        .map(c => `<option value="${c.id}">${c.name}</option>`)
        .join('');
    }
  }

  renderConoceDistricts() {
    const container = document.getElementById('conoce-districts-grid');
    if (!container) return;

    // Ordenamiento alfabético A-Z
    const sortedDistricts = [...APP_DATA.districts].sort((a, b) => 
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    );

    container.innerHTML = sortedDistricts.map(d => `
      <div 
        onclick="App.navigateToView('map'); App.selectDistrict('${d.id}');"
        class="bg-white p-3.5 rounded-sm border border-slate-200 border-l-4 border-l-[#0a2540] hover:border-slate-300 hover:shadow-xs transition-all cursor-pointer group flex items-center gap-3">
        <span class="w-3 h-3 rounded-none shrink-0 shadow-2xs border border-white" style="background-color: ${d.color};"></span>
        <div class="min-w-0 flex-1 flex items-center justify-between">
          <h4 class="font-serif font-bold text-sm text-[#0a2540] group-hover:text-[#0072bb] transition-colors">
            ${d.name}
          </h4>
          <i class="fa-solid fa-arrow-right text-[10px] text-slate-400 group-hover:text-[#0072bb] group-hover:translate-x-0.5 transition-all"></i>
        </div>
      </div>
    `).join('');
  }

  attachEvents() {
    // Select de distritos panel izquierdo
    const mainSelect = document.getElementById('filter-district-select');
    if (mainSelect) {
      mainSelect.addEventListener('change', (e) => this.selectDistrict(e.target.value));
    }

    // Select de distritos banner inferior
    const bannerSelect = document.getElementById('banner-district-select');
    if (bannerSelect) {
      bannerSelect.addEventListener('change', (e) => this.selectDistrict(e.target.value));
    }

    // Select de distrito en el banner del selector de ubicación en el mapa
    const pickerSelect = document.getElementById('map-picker-district-select');
    if (pickerSelect) {
      pickerSelect.addEventListener('change', (e) => this.changePickerDistrict(e.target.value));
    }

    // Buscador
    const searchInput = document.getElementById('search-reports-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderReports();
        this.updateMapMarkers();
      });
    }

    // Chips de categorías
    const categoryBar = document.getElementById('category-filter-bar');
    if (categoryBar) {
      categoryBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-chip');
        if (!btn) return;
        this.selectCategory(btn.getAttribute('data-category'));
      });
    }

    // Centrar mapa
    const btnResetMap = document.getElementById('btn-reset-map');
    if (btnResetMap) {
      btnResetMap.addEventListener('click', () => this.selectDistrict('all'));
    }

    // Minimizar / expandir tarjeta de la Senadora
    const toggleSenatorBtn = document.getElementById('toggle-senator-card');
    const senatorCard = document.getElementById('senator-floating-card');
    if (toggleSenatorBtn && senatorCard) {
      toggleSenatorBtn.addEventListener('click', () => {
        senatorCard.classList.toggle('minimized');
      });
    }

    // Tabs móvil (Feed vs Mapa)
    const tabListBtn = document.getElementById('tab-btn-list');
    const tabMapBtn = document.getElementById('tab-btn-map');
    if (tabListBtn && tabMapBtn) {
      tabListBtn.addEventListener('click', () => this.switchMobileTab('list'));
      tabMapBtn.addEventListener('click', () => this.switchMobileTab('map'));
    }

    // Formulario de nuevo reporte
    const newReportForm = document.getElementById('new-report-form');
    if (newReportForm) {
      newReportForm.addEventListener('submit', (e) => this.handleNewReportSubmit(e));
    }

    // Formulario de Propuestas Ciudadanas (Home)
    const citizenProposalForm = document.getElementById('citizen-proposal-form');
    if (citizenProposalForm) {
      citizenProposalForm.addEventListener('submit', (e) => this.handleProposalSubmit(e));
      citizenProposalForm.addEventListener('reset', () => {
        setTimeout(() => this.syncFormUserSession(), 10);
      });
    }

    const propEmail = document.getElementById('propuesta-email');
    if (propEmail) {
      propEmail.addEventListener('input', (e) => this.onPropuestaEmailInput(e));
      propEmail.addEventListener('blur', (e) => this.onPropuestaEmailBlur(e));
    }

    // Botón para fijar ubicación en el mapa
    const btnPickLocation = document.getElementById('btn-pick-map-location');
    if (btnPickLocation) {
      btnPickLocation.addEventListener('click', () => this.enableMapLocationPicker());
    }

    // Manejo de resize para mantener layout en desktop y sincronizar en mobile
    window.addEventListener('resize', () => {
      const listCol = document.getElementById('left-feed-panel');
      const mapCol = document.getElementById('right-map-panel');
      if (window.innerWidth >= 768) {
        if (listCol) listCol.style.display = '';
        if (mapCol) mapCol.style.display = '';
      } else {
        this.switchMobileTab(this.activeTab || 'map');
      }
      if (this.mapInstance && this.mapInstance.map) {
        this.mapInstance.map.invalidateSize();
      }
    });

    // Cerrar dropdown de usuario al hacer clic fuera
    document.addEventListener('click', (e) => {
      const userContainer = document.getElementById('header-user-container');
      if (userContainer && !userContainer.contains(e.target)) {
        this.closeUserDropdown();
      }
    });
  }

  // Navegación entre vistas completas (Salir completamente del mapa a otra página)
  navigateToView(viewName) {
    // Normalizar aliases a las 3 vistas principales
    if (viewName === 'propuestas' || viewName === 'contacto' || viewName === 'home') {
      viewName = 'inicio';
    }
    if (viewName === 'mapa') {
      viewName = 'map';
    }

    this.currentView = viewName;

    const views = document.querySelectorAll('.app-view');
    views.forEach(v => {
      v.classList.remove('active');
      v.style.display = 'none';
    });

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active');
      target.style.display = viewName === 'map' ? 'flex' : 'block';
    }

    // Modo Pantalla Completa:
    // Si estamos en el mapa: html y body con h-screen y overflow-hidden para layout de app
    // Si estamos en Inicio o Conocé: body con min-h-screen y overflow-y-auto para scroll web natural
    if (viewName === 'map') {
      document.documentElement.classList.add('h-screen', 'h-[100dvh]', 'overflow-hidden');
      document.body.classList.add('h-screen', 'h-[100dvh]', 'overflow-hidden');
      document.documentElement.classList.remove('min-h-screen', 'overflow-y-auto');
      document.body.classList.remove('min-h-screen', 'overflow-y-auto');
      window.scrollTo(0, 0);

      if (this.mapInstance && this.mapInstance.map) {
        this.mapInstance.map.invalidateSize();
        setTimeout(() => {
          if (this.mapInstance && this.mapInstance.map) {
            this.mapInstance.map.invalidateSize();
          }
        }, 100);
        setTimeout(() => {
          if (this.mapInstance && this.mapInstance.map) {
            this.mapInstance.map.invalidateSize();
          }
        }, 300);
      }
    } else {
      document.documentElement.classList.remove('h-screen', 'h-[100dvh]', 'overflow-hidden');
      document.body.classList.remove('h-screen', 'h-[100dvh]', 'overflow-hidden');
      document.documentElement.classList.add('min-h-screen', 'overflow-y-auto');
      document.body.classList.add('min-h-screen', 'overflow-y-auto');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Actualizar botones de navegación en el header (Desktop)
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      const targetView = btn.getAttribute('data-nav-view');
      if (targetView === viewName) {
        btn.classList.add('text-[#0a2540]', 'border-[#0072bb]', 'bg-sky-50', 'font-bold');
        btn.classList.remove('text-slate-700', 'border-transparent', 'hover:bg-slate-50', 'font-semibold');
      } else {
        btn.classList.remove('text-[#0a2540]', 'border-[#0072bb]', 'bg-sky-50', 'font-bold');
        btn.classList.add('text-slate-700', 'border-transparent', 'hover:bg-slate-50', 'font-semibold');
      }
    });

    // Actualizar botones de navegación en el menú móvil (Drawer)
    const drawerButtons = document.querySelectorAll('[data-nav-drawer-view]');
    drawerButtons.forEach(btn => {
      const targetView = btn.getAttribute('data-nav-drawer-view');
      if (targetView === viewName) {
        btn.classList.add('text-[#0a2540]', 'bg-sky-50', 'border-[#0072bb]', 'font-bold');
        btn.classList.remove('text-slate-700', 'border-transparent', 'font-semibold');
      } else {
        btn.classList.remove('text-[#0a2540]', 'bg-sky-50', 'border-[#0072bb]', 'font-bold');
        btn.classList.add('text-slate-700', 'border-transparent', 'font-semibold');
      }
    });
  }

  // Manejo del envío del formulario de propuestas ciudadanas en Inicio
  handleProposalSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const email = document.getElementById('propuesta-email')?.value.trim() || '';
    const nombre = document.getElementById('propuesta-nombre')?.value.trim() || '';
    const telefono = document.getElementById('propuesta-telefono')?.value.trim() || '';
    const departamento = document.getElementById('propuesta-departamento')?.value || '';
    const texto = document.getElementById('propuesta-texto')?.value.trim() || '';
    const archivoInput = document.getElementById('propuesta-archivo');
    const archivo = archivoInput?.files?.[0]?.name || null;

    if (!email || !nombre || !telefono || !departamento || !texto) {
      this.showToast('Por favor, completá todos los campos obligatorios (*).', 'error');
      return;
    }

    // Validar formato de correo electrónico
    if (!this.validateEmailFormat(email)) {
      const emailInput = document.getElementById('propuesta-email');
      const emailError = document.getElementById('propuesta-email-error');
      if (emailError) emailError.classList.remove('hidden');
      if (emailInput) {
        emailInput.classList.remove('border-emerald-500');
        emailInput.classList.add('border-rose-500', 'focus:border-rose-500', 'focus:ring-rose-500');
        emailInput.focus();
      }
      this.showToast('Por favor, ingresá un formato de correo válido (ej: nombre@correo.com).', 'warning', 4000);
      return;
    }

    const proposal = {
      id: 'prop-' + Date.now(),
      email,
      nombre,
      telefono,
      departamento,
      texto,
      archivo,
      createdAt: new Date().toISOString()
    };

    try {
      const saved = JSON.parse(localStorage.getItem('guaymallen_proposals') || '[]');
      saved.unshift(proposal);
      localStorage.setItem('guaymallen_proposals', JSON.stringify(saved));
    } catch (err) {
      console.warn('Error al guardar propuesta:', err);
    }

    this.showToast('¡Propuesta enviada con éxito! Tu iniciativa ha sido ingresada al despacho de la Senadora Luz Llorens.', 'success', 5000);
    form.reset();
    this.syncFormUserSession();
  }

  // Manejo del menú desplegable móvil
  toggleMobileDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    if (!drawer) return;
    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
      this.closeMobileDrawer();
    } else {
      this.openMobileDrawer();
    }
  }

  openMobileDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    const backdrop = document.getElementById('mobile-drawer-backdrop');
    const icon = document.querySelector('#mobile-drawer-btn i');
    if (!drawer) return;
    drawer.classList.remove('hidden');
    if (backdrop) backdrop.classList.remove('hidden');
    if (icon) {
      icon.classList.remove('fa-bars');
      icon.classList.add('fa-xmark');
    }
    requestAnimationFrame(() => {
      drawer.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
    });
  }

  closeMobileDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    const backdrop = document.getElementById('mobile-drawer-backdrop');
    const icon = document.querySelector('#mobile-drawer-btn i');
    if (!drawer) return;
    drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (icon) {
      icon.classList.remove('fa-xmark');
      icon.classList.add('fa-bars');
    }
    setTimeout(() => {
      if (!drawer.classList.contains('open')) {
        drawer.classList.add('hidden');
      }
      if (backdrop && !backdrop.classList.contains('open')) {
        backdrop.classList.add('hidden');
      }
    }, 250);
  }

  // Leyenda: colapso en desktop, popover en mobile
  toggleLegend() {
    const legendBox = document.getElementById('map-legend-box');
    const contentPanel = document.getElementById('legend-content-panel');
    if (window.innerWidth < 768) {
      if (contentPanel) {
        contentPanel.classList.toggle('hidden');
      }
    } else {
      if (legendBox) {
        legendBox.classList.toggle('collapsed');
      }
    }
  }

  closeMobileLegend() {
    if (window.innerWidth < 768) {
      const contentPanel = document.getElementById('legend-content-panel');
      if (contentPanel) {
        contentPanel.classList.add('hidden');
      }
    }
  }

  selectDistrict(districtId) {
    this.selectedDistrict = districtId;

    const mainSelect = document.getElementById('filter-district-select');
    const bannerSelect = document.getElementById('banner-district-select');
    if (mainSelect) mainSelect.value = districtId;
    if (bannerSelect) bannerSelect.value = districtId;

    this.mapInstance.highlightDistrict(districtId);
    this.renderReports();
    this.updateMapMarkers();

    const distObj = APP_DATA.districts.find(d => d.id === districtId);
    if (distObj) {
      this.showToast(`Distrito: ${distObj.name}`, 'info');
    } else if (districtId === 'all') {
      this.showToast('Vista general: Todos los distritos', 'info');
    }
  }

  selectCategory(categoryId) {
    this.selectedCategory = categoryId;
    this.populateCategoryFilters();
    this.renderReports();
    this.updateMapMarkers();
  }

  getMyReports() {
    return this.reports.filter(rep => {
      if (rep.isMyReport) return true;
      if (this.currentUser && rep.userEmail && rep.userEmail.toLowerCase() === this.currentUser.email.toLowerCase()) return true;
      if (this.currentUser && rep.userId && rep.userId === this.currentUser.id) return true;
      if (this.currentUser && rep.citizen && rep.citizen.toLowerCase() === this.currentUser.email.toLowerCase()) return true;
      return false;
    });
  }

  getFilteredReports() {
    return this.reports.filter(rep => {
      // Filtrar por Mis Reclamos si el scope está en 'mine'
      if (this.reportScope === 'mine') {
        const isMine = rep.isMyReport ||
          (this.currentUser && rep.userEmail && rep.userEmail.toLowerCase() === this.currentUser.email.toLowerCase()) ||
          (this.currentUser && rep.userId && rep.userId === this.currentUser.id) ||
          (this.currentUser && rep.citizen && rep.citizen.toLowerCase() === this.currentUser.email.toLowerCase());
        if (!isMine) return false;
      }

      if (this.selectedDistrict !== 'all' && rep.district !== this.selectedDistrict) {
        return false;
      }
      if (this.selectedCategory !== 'all' && rep.category !== this.selectedCategory) {
        return false;
      }
      if (this.searchQuery) {
        const matchTitle = (rep.title || '').toLowerCase().includes(this.searchQuery);
        const matchDesc = (rep.description || '').toLowerCase().includes(this.searchQuery);
        const matchAddr = (rep.address || '').toLowerCase().includes(this.searchQuery);
        const matchDist = (rep.districtName || '').toLowerCase().includes(this.searchQuery);
        if (!matchTitle && !matchDesc && !matchAddr && !matchDist) {
          return false;
        }
      }
      return true;
    });
  }

  renderReports() {
    const container = document.getElementById('reports-feed-container');
    const countBadge = document.getElementById('reports-count-badge');
    const filtered = this.getFilteredReports();

    // Actualizar badge de conteo según el scope
    if (countBadge) {
      if (this.reportScope === 'mine') {
        countBadge.textContent = `${filtered.length} propio${filtered.length === 1 ? '' : 's'}`;
        countBadge.className = "px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300";
      } else {
        countBadge.textContent = `${this.reports.length} reportes`;
        countBadge.className = "px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-[#0a2540] border border-slate-300";
      }
    }

    if (!container) return;

    // Estado vacío
    if (filtered.length === 0) {
      if (this.reportScope === 'mine') {
        // Estado vacío exclusivo para "Mis Reclamos"
        const userName = this.currentUser ? this.currentUser.name.split(' ')[0] : 'vecino';
        container.innerHTML = `
          <div class="p-6 sm:p-8 text-center bg-white rounded-sm border border-slate-300 shadow-2xs space-y-4">
            <div class="w-14 h-14 rounded-sm bg-slate-100 text-[#0a2540] mx-auto flex items-center justify-center text-2xl border border-slate-200">
              <i class="fa-solid fa-clipboard-user text-[#0072bb]"></i>
            </div>
            <div>
              <h4 class="font-serif font-bold text-slate-900 text-base mb-1">
                Aún no tenés reclamos registrados
              </h4>
              <p class="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                ¡Hola, ${userName}! Cada reclamo que publiques en tu barrio quedará registrado acá para hacerle seguimiento formal con la <strong>Senadora Luz Llorens</strong>.
              </p>
            </div>
            <div class="flex flex-col sm:flex-row gap-2 justify-center pt-1">
              <button 
                onclick="App.openReportModal()"
                class="px-5 py-2.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#0a2540] hover:bg-[#0072bb] text-white shadow-xs border-l-2 border-[#c59b27] transition-all inline-flex items-center justify-center gap-2">
                <i class="fa-solid fa-plus text-[#c59b27]"></i>
                <span>Reportar Mi Primer Problema</span>
              </button>
              <button 
                onclick="App.setFeedReportScope('all')"
                class="px-4 py-2.5 rounded-sm text-xs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all">
                Ver todos los reclamos
              </button>
            </div>
          </div>
        `;
      } else if (this.reports.length === 0) {
        container.innerHTML = `
          <div class="p-6 sm:p-8 text-center bg-white rounded-sm border border-slate-200 shadow-2xs space-y-4">
            <div class="w-14 h-14 rounded-sm bg-slate-100 text-[#0a2540] mx-auto flex items-center justify-center text-2xl border border-slate-200">
              <i class="fa-solid fa-map-location-dot text-[#0072bb]"></i>
            </div>
            <div>
              <h4 class="font-serif font-bold text-slate-900 text-base mb-1">
                Aún no hay reclamos registrados
              </h4>
              <p class="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                Sé el primer vecino en reportar un bache, luminaria rota o microbasural en tu distrito para que la <strong>Senadora Luz Llorens</strong> lo eleve a la Legislatura.
              </p>
            </div>
            <button 
              onclick="App.openReportModal()"
              class="px-5 py-2.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#0a2540] hover:bg-[#0072bb] text-white shadow-xs border-l-2 border-[#c59b27] transition-all inline-flex items-center gap-2">
              <i class="fa-solid fa-plus text-[#c59b27]"></i>
              <span>Reportar Problema en mi Barrio</span>
            </button>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="p-8 text-center bg-slate-50 rounded-sm border border-slate-200 shadow-2xs space-y-3">
            <div class="w-12 h-12 rounded-sm bg-white text-slate-500 mx-auto flex items-center justify-center text-xl border border-slate-200">
              <i class="fa-solid fa-magnifying-glass"></i>
            </div>
            <h4 class="font-serif font-bold text-slate-800 text-sm mb-1">No se encontraron reclamos</h4>
            <p class="text-xs text-slate-500 mb-4">No hay reportes que coincidan con los filtros seleccionados.</p>
            <button 
              onclick="App.clearFilters()"
              class="px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#0a2540] text-white hover:bg-[#0072bb] transition-all border-l-2 border-[#c59b27]">
              Limpiar Filtros
            </button>
          </div>
        `;
      }
      return;
    }

    const mineBannerHtml = this.reportScope === 'mine' ? `
      <div class="bg-emerald-50/90 border border-emerald-300 rounded-sm p-2.5 flex items-center justify-between gap-2 text-xs mb-3 shadow-2xs">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-2 h-2 rounded-none bg-emerald-600 shrink-0"></span>
          <span class="text-[11px] font-bold text-emerald-950 truncate uppercase tracking-wider">
            Mostrando tus reclamos personales (${filtered.length})
          </span>
        </div>
        <button 
          onclick="App.setFeedReportScope('all')" 
          class="text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:text-black bg-white px-2 py-1 rounded-sm border border-slate-300 shrink-0">
          Ver todos &rarr;
        </button>
      </div>
    ` : '';

    const cardsHtml = filtered.map(report => {
      const cat = APP_DATA.categories.find(c => c.id === report.category) || {};
      const isSelected = report.id === this.activeReportId;

      return `
        <div 
          id="report-card-${report.id}"
          class="report-card group bg-white rounded-sm p-4 border transition-all duration-150 hover:shadow-xs ${
            isSelected 
              ? 'border-[#0072bb] border-l-4 border-l-[#0072bb] shadow-xs bg-sky-50/20' 
              : 'border-slate-200 border-l-4 border-l-[#0a2540] hover:border-slate-300'
          }">
          
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-sm bg-slate-100 flex items-center justify-center text-base shrink-0 border border-slate-200" style="color: ${cat.color || '#0a2540'};">
              <i class="fa-solid ${cat.icon || 'fa-triangle-exclamation'}"></i>
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-1 mb-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                    <i class="fa-solid fa-location-dot text-slate-400 text-[9px]"></i>
                    ${report.districtName}
                  </span>
                  ${(report.isMyReport || (this.currentUser && (
                    report.userId === this.currentUser.id || 
                    (report.userEmail && report.userEmail.toLowerCase() === this.currentUser.email.toLowerCase()) ||
                    (report.citizen && report.citizen.toLowerCase() === this.currentUser.email.toLowerCase())
                  ))) ? `
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                      <i class="fa-solid fa-circle-check text-emerald-600 text-[9px]"></i>
                      Tu Reclamo
                    </span>
                  ` : ''}
                </div>
                <span class="text-[11px] text-slate-400 font-medium shrink-0">
                  ${report.date || 'Reciente'}
                </span>
              </div>

              <h3 class="font-serif font-bold text-slate-900 text-sm leading-snug line-clamp-2 mb-1 group-hover:text-[#0072bb] transition-colors">
                ${report.title}
              </h3>

              <p class="text-[11px] text-slate-500 flex items-center gap-1 mb-1.5 truncate">
                <i class="fa-solid fa-road text-slate-400 text-[10px]"></i>
                <span>${report.address}</span>
              </p>

              <div class="flex items-center gap-2 mb-2">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wider border ${report.statusColor || 'bg-sky-50 text-[#005596] border-sky-200'}">
                  <span class="w-1.5 h-1.5 rounded-none bg-current"></span>
                  ${report.status || 'Registrado'}
                </span>
              </div>
            </div>
          </div>

          <p class="text-xs text-slate-600 line-clamp-3 mt-2 leading-relaxed bg-slate-50 p-2.5 rounded-sm border border-slate-200/80">
            ${report.description}
          </p>

          <div class="pt-2.5 mt-2.5 border-t border-slate-100 flex items-center justify-between gap-1.5 sm:gap-2">
            <button 
              type="button"
              onclick="App.viewOnMap('${report.id}')"
              class="flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-sm text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#0a2540] bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-95 transition-all flex items-center justify-center gap-1">
              <i class="fa-solid fa-map-location-dot text-[11px] text-[#0072bb]"></i>
              <span>Ver en Mapa</span>
            </button>

            <button 
              type="button"
              onclick="App.upvoteReport('${report.id}')"
              class="flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-sm text-[11px] sm:text-xs font-bold uppercase tracking-wider border active:scale-95 transition-all flex items-center justify-center gap-1 ${
                report.userUpvoted 
                  ? 'bg-[#0072bb] text-white border-[#0072bb] shadow-2xs' 
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }">
              <i class="fa-solid fa-thumbs-up text-[11px]"></i>
              <span>${report.upvotes || 1}</span>
              <span>${report.userUpvoted ? 'Apoyado' : 'Apoyar'}</span>
            </button>

            <button 
              type="button"
              onclick="App.openShareModal('${report.id}')"
              title="Compartir reporte"
              class="w-8 sm:w-auto py-1.5 sm:py-2 px-2 sm:px-3 rounded-sm text-[11px] sm:text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-95 transition-all flex items-center justify-center">
              <i class="fa-solid fa-share-nodes text-[11px]"></i>
            </button>

            <button 
              type="button"
              onclick="App.deleteReport('${report.id}')"
              title="Eliminar este reclamo de prueba"
              class="w-8 sm:w-auto py-1.5 sm:py-2 px-2 sm:px-3 rounded-sm text-[11px] sm:text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 active:scale-95 transition-all flex items-center justify-center">
              <i class="fa-solid fa-trash-can text-[11px]"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = mineBannerHtml + cardsHtml;
  }

  updateMapMarkers() {
    const filtered = this.getFilteredReports();
    this.mapInstance.renderMarkers(filtered, this.activeReportId);
  }

  clearFilters() {
    this.selectedDistrict = 'all';
    this.selectedCategory = 'all';
    this.searchQuery = '';
    const searchInput = document.getElementById('search-reports-input');
    if (searchInput) searchInput.value = '';
    this.populateDistrictSelects();
    this.populateCategoryFilters();
    this.mapInstance.highlightDistrict('all');
    this.renderReports();
    this.updateMapMarkers();
  }

  viewOnMap(reportId) {
    this.navigateToView('map');
    this.activeReportId = reportId;
    this.renderReports();
    this.updateMapMarkers();

    if (window.innerWidth < 768) {
      this.switchMobileTab('map');
    }

    this.mapInstance.focusReport(reportId);

    const card = document.getElementById(`report-card-${reportId}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  onMarkerClick(reportId) {
    this.activeReportId = reportId;
    this.renderReports();

    const card = document.getElementById(`report-card-${reportId}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('ring-4', 'ring-sky-300');
      setTimeout(() => {
        card.classList.remove('ring-4', 'ring-sky-300');
      }, 1500);
    }
  }

  focusReportCard(reportId) {
    this.onMarkerClick(reportId);
    if (window.innerWidth < 768) {
      this.switchMobileTab('list');
    }
  }

  upvoteReport(reportId) {
    const rep = this.reports.find(r => r.id === reportId);
    if (!rep) return;

    if (rep.userUpvoted) {
      rep.upvotes = Math.max(1, (rep.upvotes || 1) - 1);
      rep.userUpvoted = false;
      this.showToast('Voto retirado', 'info');
    } else {
      rep.upvotes = (rep.upvotes || 1) + 1;
      rep.userUpvoted = true;
      this.showToast('¡Apoyo sumado al reclamo!', 'success');
    }

    this.saveReports();
    this.renderReports();
    this.updateMapMarkers();
  }

  deleteReport(reportId) {
    this.reports = this.reports.filter(r => r.id !== reportId);
    if (this.activeReportId === reportId) {
      this.activeReportId = null;
    }
    this.renderReports();
    this.updateMapMarkers();
    this.updateStats();
    this.updateScopeTabs();
    this.renderUserHeader();
    this.showToast('Reclamo de prueba eliminado', 'info');
  }

  // Filtrado por alcance: Todos los Reclamos vs Mis Reclamos
  setFeedReportScope(scope) {
    if (scope === 'mine' && !this.currentUser) {
      this.openAuthModal('login');
      this.showToast('Ingresá con tu correo electrónico para ver tus propios reclamos', 'info');
      return;
    }

    this.reportScope = scope;
    this.updateScopeTabs();
    this.renderReports();
    this.updateMapMarkers();

    // En pantallas chicas, si el usuario elige "Mis Reclamos", conmutar a la vista de lista
    if (scope === 'mine' && window.innerWidth < 768) {
      this.switchMobileTab('list');
    }
  }

  updateScopeTabs() {
    const tabAll = document.getElementById('feed-tab-all');
    const tabMine = document.getElementById('feed-tab-mine');
    const mineCountBadge = document.getElementById('feed-tab-mine-count');
    const myCount = this.getMyReports().length;

    if (mineCountBadge) {
      mineCountBadge.textContent = myCount;
      if (myCount > 0) {
        mineCountBadge.classList.remove('hidden');
      } else {
        mineCountBadge.classList.add('hidden');
      }
    }

    if (!tabAll || !tabMine) return;

    if (this.reportScope === 'mine') {
      tabMine.className = "flex-1 py-1.5 px-2 sm:px-3 rounded-sm transition-all flex items-center justify-center gap-1.5 bg-[#0a2540] text-white shadow-xs font-bold text-[11px] sm:text-xs uppercase tracking-wider";
      tabAll.className = "flex-1 py-1.5 px-2 sm:px-3 rounded-sm transition-all flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900 font-semibold text-[11px] sm:text-xs uppercase tracking-wider";
    } else {
      tabAll.className = "flex-1 py-1.5 px-2 sm:px-3 rounded-sm transition-all flex items-center justify-center gap-1.5 bg-white text-[#0a2540] border-b-2 border-b-[#0072bb] shadow-xs font-bold text-[11px] sm:text-xs uppercase tracking-wider";
      tabMine.className = "flex-1 py-1.5 px-2 sm:px-3 rounded-sm transition-all flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900 font-semibold text-[11px] sm:text-xs uppercase tracking-wider";
    }
  }

  switchMobileTab(tab) {
    this.activeTab = tab;
    const tabListBtn = document.getElementById('tab-btn-list');
    const tabMapBtn = document.getElementById('tab-btn-map');
    const listCol = document.getElementById('left-feed-panel');
    const mapCol = document.getElementById('right-map-panel');

    if (!tabListBtn || !tabMapBtn || !listCol || !mapCol) return;

    const legendBox = document.getElementById('map-legend-box');
    const resetBtn = document.getElementById('btn-reset-map');

    if (tab === 'list') {
      tabListBtn.classList.add('bg-[#0a2540]', 'text-white', 'shadow-xs', 'font-bold');
      tabListBtn.classList.remove('text-slate-600', 'font-semibold');
      tabMapBtn.classList.remove('bg-[#0a2540]', 'text-white', 'shadow-xs', 'font-bold');
      tabMapBtn.classList.add('text-slate-600', 'font-semibold');
      listCol.style.display = 'flex';
      mapCol.style.display = 'none';
      if (legendBox) legendBox.style.display = 'none';
      if (resetBtn) resetBtn.style.display = 'none';
      this.closeMobileLegend();
    } else {
      tabMapBtn.classList.add('bg-[#0a2540]', 'text-white', 'shadow-xs', 'font-bold');
      tabMapBtn.classList.remove('text-slate-600', 'font-semibold');
      tabListBtn.classList.remove('bg-[#0a2540]', 'text-white', 'shadow-xs', 'font-bold');
      tabListBtn.classList.add('text-slate-600', 'font-semibold');
      listCol.style.display = 'none';
      mapCol.style.display = 'block';
      if (legendBox) legendBox.style.display = '';
      if (resetBtn) resetBtn.style.display = '';

      setTimeout(() => {
        if (this.mapInstance && this.mapInstance.map) {
          this.mapInstance.map.invalidateSize();
        }
      }, 50);
      setTimeout(() => {
        if (this.mapInstance && this.mapInstance.map) {
          this.mapInstance.map.invalidateSize();
        }
      }, 250);
    }
  }

  updateStats() {
    const totalReports = this.reports.length;
    const counterBadge = document.getElementById('banner-counter-badge');
    const mobileCounter = document.getElementById('mobile-sticky-counter');

    const text = totalReports === 0 
      ? '0 reclamos registrados' 
      : `${totalReports} ${totalReports === 1 ? 'reclamo registrado' : 'reclamos registrados'}`;

    if (counterBadge) {
      counterBadge.textContent = text;
    }
    if (mobileCounter) {
      mobileCounter.textContent = text;
    }
  }

  // Modal para agregar reporte con flujo de 2 pasos
  openReportModal(preselectedDistrict = null) {
    this.navigateToView('map');
    const modal = document.getElementById('modal-new-report');
    if (!modal) return;

    const step1 = document.getElementById('report-step-1');
    const step2 = document.getElementById('new-report-form');
    const step1Select = document.getElementById('step1-district-select');

    // Determinar distrito inicial
    let initialDistrict = preselectedDistrict || (this.selectedDistrict !== 'all' ? this.selectedDistrict : 'dorrego');
    if (step1Select) {
      step1Select.value = initialDistrict;
    }
    const pickerSelect = document.getElementById('map-picker-district-select');
    if (pickerSelect) {
      pickerSelect.value = initialDistrict;
    }
    this.pickerDistrictId = initialDistrict;

    // Si no hay ubicación confirmada, empezar obligatoriamente en Paso 1 (seleccionar distrito)
    if (!this.pendingLocation) {
      if (step1) step1.classList.remove('hidden');
      if (step2) step2.classList.add('hidden');
    } else {
      if (step1) step1.classList.add('hidden');
      if (step2) step2.classList.remove('hidden');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');

    this.syncFormUserSession();
  }

  closeReportModal() {
    const modal = document.getElementById('modal-new-report');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
  }

  // Paso 1 -> Pasar al mapa enfocado solo en el distrito para arrastrar el pin rojo
  proceedToMapPicker() {
    const step1Select = document.getElementById('step1-district-select');
    const districtId = step1Select ? step1Select.value : (this.pickerDistrictId || 'dorrego');
    this.pickerDistrictId = districtId;

    const distObj = APP_DATA.districts.find(d => d.id === districtId);

    // Ocultar modal
    this.closeReportModal();

    // Sincronizar selector en el banner superior flotante
    const pickerSelect = document.getElementById('map-picker-district-select');
    if (pickerSelect) {
      pickerSelect.value = districtId;
    }

    // Mostrar barra superior de confirmación
    const pickerBanner = document.getElementById('map-picker-banner');
    if (pickerBanner) {
      pickerBanner.classList.remove('hidden');
      pickerBanner.classList.add('flex');
    }

    // En móvil, cambiar a pestaña del mapa
    if (window.innerWidth < 768) {
      this.switchMobileTab('map');
    }

    // Iniciar pin rojo arrastrable en el mapa enfocado solo en este distrito
    this.mapInstance.startDraggablePicker(districtId, this.pendingLocation);
  }

  // Reabrir picker si el usuario quiere mover el pin desde el Paso 2
  reopenMapPicker() {
    this.proceedToMapPicker();
  }

  // Cambiar distrito directamente desde el selector de la barra superior flotante
  changePickerDistrict(districtId) {
    if (!districtId) return;
    this.pickerDistrictId = districtId;
    this.pendingLocation = null;

    // 1. Cambiar INMEDIATAMENTE el distrito y pin en el mapa (0 ms)
    this.mapInstance.startDraggablePicker(districtId, null);

    // 2. Sincronizar select del Paso 1
    const step1Select = document.getElementById('step1-district-select');
    if (step1Select) {
      step1Select.value = districtId;
    }

    // 3. Sincronizar select del banner
    const pickerSelect = document.getElementById('map-picker-district-select');
    if (pickerSelect) {
      pickerSelect.value = districtId;
    }

    const distObj = APP_DATA.districts.find(d => d.id === districtId);
    if (distObj) {
      this.showToast(`Distrito: ${distObj.name}`, 'info', 1800);
    }
  }

  // Cancelar picker desde la barra superior del mapa
  cancelMapPicker() {
    this.mapInstance.stopDraggablePicker();
    const pickerBanner = document.getElementById('map-picker-banner');
    if (pickerBanner) {
      pickerBanner.classList.add('hidden');
      pickerBanner.classList.remove('flex');
    }
    this.openReportModal(this.pickerDistrictId);
  }

  // Confirmar ubicación desde la barra superior del mapa
  confirmMapPicker() {
    const latlng = this.mapInstance.getPickerLocation();
    if (!latlng) {
      this.showToast('No se pudo determinar la ubicación en el mapa', 'error');
      return;
    }

    this.pendingLocation = latlng;
    this.mapInstance.stopDraggablePicker();

    const pickerBanner = document.getElementById('map-picker-banner');
    if (pickerBanner) {
      pickerBanner.classList.add('hidden');
      pickerBanner.classList.remove('flex');
    }

    const distObj = APP_DATA.districts.find(d => d.id === this.pickerDistrictId);

    // Actualizar tarjeta del Paso 2
    const step2Badge = document.getElementById('step2-district-badge');
    const coordsPreview = document.getElementById('step2-coords-preview');
    if (step2Badge && distObj) step2Badge.textContent = distObj.name;
    if (coordsPreview) {
      coordsPreview.textContent = `Coordenadas: Lat ${latlng.lat.toFixed(5)}, Lng ${latlng.lng.toFixed(5)}`;
    }

    // Cambiar a Paso 2 en el modal
    const step1 = document.getElementById('report-step-1');
    const step2 = document.getElementById('new-report-form');
    if (step1) step1.classList.add('hidden');
    if (step2) step2.classList.remove('hidden');

    const modal = document.getElementById('modal-new-report');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      document.body.classList.add('overflow-hidden');
    }

    this.showToast('¡Ubicación fijada con éxito! Completá los detalles del reclamo.', 'success', 3500);

    // Sugerir nombre de calle mediante geocodificación inversa si está vacío
    this.tryReverseGeocode(latlng);
  }

  tryReverseGeocode(latlng) {
    const addressInput = document.getElementById('report-address-input');
    if (!addressInput || addressInput.value.trim().length > 0) return;

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat}&lon=${latlng.lng}&format=json`;
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(res => res.json())
      .then(data => {
        if (data && data.address) {
          const road = data.address.road || data.address.pedestrian || data.address.neighbourhood || '';
          if (road && !addressInput.value) {
            addressInput.value = road;
          }
        }
      })
      .catch(() => {});
  }

  handleNewReportSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const title = form['report-title'].value.trim();
    const category = form['report-category'].value;
    const address = form['report-address'].value.trim();
    const description = form['report-description'].value.trim();
    const citizen = form['report-citizen'].value.trim() || (this.currentUser ? this.currentUser.name : 'Vecino de Guaymallén');
    const districtId = this.pickerDistrictId || 'dorrego';

    // Validación estricta: UBICACIÓN OBLIGATORIA EN EL MAPA
    if (!this.pendingLocation) {
      this.showToast('⚠️ Es obligatorio seleccionar la ubicación en el mapa antes de publicar el reclamo.', 'error', 4500);
      this.proceedToMapPicker();
      return;
    }

    if (!title || !address || !description) {
      this.showToast('Por favor completá todos los campos requeridos', 'error');
      return;
    }

    const distObj = APP_DATA.districts.find(d => d.id === districtId);

    const newReport = {
      id: `rep-${Date.now()}`,
      title,
      district: districtId,
      districtName: distObj ? distObj.name : 'Guaymallén',
      category,
      lat: this.pendingLocation.lat,
      lng: this.pendingLocation.lng,
      address,
      description,
      status: "Registrado - En Gestión con Luz Llorens",
      statusColor: "bg-sky-100 text-sky-800 border-sky-200",
      upvotes: 1,
      userUpvoted: true,
      date: "Recién",
      citizen,
      userEmail: this.currentUser ? this.currentUser.email : null,
      isMyReport: true, // Siempre etiquetado como propio en esta sesión
      userId: this.currentUser ? this.currentUser.id : 'session-user'
    };

    this.reports.unshift(newReport);

    // Limpiar estado temporal de ubicación
    this.pendingLocation = null;
    form.reset();
    this.syncFormUserSession();

    this.closeReportModal();
    this.renderReports();
    this.updateMapMarkers();
    this.updateStats();
    this.updateScopeTabs();
    this.renderUserHeader();

    this.showToast('¡Reclamo registrado con éxito en Pensando Guaymallén!', 'success', 5000);

    setTimeout(() => {
      this.viewOnMap(newReport.id);
    }, 400);
  }

  // ========================================================
  // GESTIÓN DE ACCESO VECINAL (LOGIN Y REGISTRO FLUIDO)
  // ========================================================

  validateEmailFormat(email) {
    if (!email || typeof email !== 'string') return false;
    const clean = email.trim();
    if (/\s/.test(clean)) return false;
    // Formato con '@' y al menos un '.' posterior
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
  }

  // Validación de correo en tiempo real en Modal de Autenticación
  onEmailInput(e) {
    if (this._emailDebounceTimer) {
      clearTimeout(this._emailDebounceTimer);
    }

    const input = e.target;
    const email = input.value.trim();
    const errorEl = document.getElementById('auth-email-error');
    const validIcon = document.getElementById('auth-email-valid-icon');

    // Si el campo está vacío, limpiar estados inmediatamente
    if (!email) {
      if (errorEl) errorEl.classList.add('hidden');
      if (validIcon) validIcon.classList.add('hidden');
      input.classList.remove('border-rose-500', 'border-emerald-500', 'focus:ring-rose-500', 'focus:ring-emerald-400');
      return;
    }

    // Si ya completó un formato válido, marcar verde al instante sin alterar el texto
    if (this.validateEmailFormat(email)) {
      if (errorEl) errorEl.classList.add('hidden');
      if (validIcon) validIcon.classList.remove('hidden');
      input.classList.remove('border-rose-500', 'focus:ring-rose-500');
      input.classList.add('border-emerald-500', 'focus:ring-emerald-400');
      return;
    }

    // Si aún está escribiendo, esperar 350ms tras la última tecla para no interrumpir
    this._emailDebounceTimer = setTimeout(() => {
      const current = input.value.trim();
      if (!current) return;
      if (!this.validateEmailFormat(current)) {
        if (errorEl) errorEl.classList.remove('hidden');
        if (validIcon) validIcon.classList.add('hidden');
        input.classList.remove('border-emerald-500', 'focus:ring-emerald-400');
        input.classList.add('border-rose-500', 'focus:ring-rose-500');
      }
    }, 350);
  }

  onEmailBlur(e) {
    if (this._emailDebounceTimer) {
      clearTimeout(this._emailDebounceTimer);
    }
    const input = e.target;
    const email = input.value.trim();
    const errorEl = document.getElementById('auth-email-error');
    const validIcon = document.getElementById('auth-email-valid-icon');

    if (!email) {
      if (errorEl) errorEl.classList.add('hidden');
      if (validIcon) validIcon.classList.add('hidden');
      input.classList.remove('border-rose-500', 'border-emerald-500', 'focus:ring-rose-500', 'focus:ring-emerald-400');
      return;
    }

    if (this.validateEmailFormat(email)) {
      if (errorEl) errorEl.classList.add('hidden');
      if (validIcon) validIcon.classList.remove('hidden');
      input.classList.remove('border-rose-500', 'focus:ring-rose-500');
      input.classList.add('border-emerald-500', 'focus:ring-emerald-400');
    } else {
      if (errorEl) errorEl.classList.remove('hidden');
      if (validIcon) validIcon.classList.add('hidden');
      input.classList.remove('border-emerald-500', 'focus:ring-emerald-400');
      input.classList.add('border-rose-500', 'focus:ring-rose-500');
    }
  }

  // Validación de correo en tiempo real en Formulario de Propuestas Ciudadanas
  onPropuestaEmailInput(e) {
    if (this._propEmailDebounceTimer) {
      clearTimeout(this._propEmailDebounceTimer);
    }
    const input = e.target;
    const email = input.value.trim();
    const errorEl = document.getElementById('propuesta-email-error');

    if (!email) {
      if (errorEl) errorEl.classList.add('hidden');
      input.classList.remove('border-rose-500', 'border-emerald-500', 'focus:border-rose-500', 'focus:ring-rose-500');
      return;
    }

    if (this.validateEmailFormat(email)) {
      if (errorEl) errorEl.classList.add('hidden');
      input.classList.remove('border-rose-500', 'focus:border-rose-500', 'focus:ring-rose-500');
      input.classList.add('border-emerald-500');
      return;
    }

    this._propEmailDebounceTimer = setTimeout(() => {
      const current = input.value.trim();
      if (!current) return;
      if (!this.validateEmailFormat(current)) {
        if (errorEl) errorEl.classList.remove('hidden');
        input.classList.remove('border-emerald-500');
        input.classList.add('border-rose-500', 'focus:border-rose-500', 'focus:ring-rose-500');
      }
    }, 350);
  }

  onPropuestaEmailBlur(e) {
    if (this._propEmailDebounceTimer) {
      clearTimeout(this._propEmailDebounceTimer);
    }
    const input = e.target;
    const email = input.value.trim();
    const errorEl = document.getElementById('propuesta-email-error');

    if (!email) {
      if (errorEl) errorEl.classList.add('hidden');
      input.classList.remove('border-rose-500', 'border-emerald-500', 'focus:border-rose-500', 'focus:ring-rose-500');
      return;
    }

    if (this.validateEmailFormat(email)) {
      if (errorEl) errorEl.classList.add('hidden');
      input.classList.remove('border-rose-500', 'focus:border-rose-500', 'focus:ring-rose-500');
      input.classList.add('border-emerald-500');
    } else {
      if (errorEl) errorEl.classList.remove('hidden');
      input.classList.remove('border-emerald-500');
      input.classList.add('border-rose-500', 'focus:border-rose-500', 'focus:ring-rose-500');
    }
  }

  // Validación de contraseñas instantánea y fluida
  onPasswordInput(e) {
    const passInput = document.getElementById('auth-input-password');
    const pass = passInput ? passInput.value : '';
    const passError = document.getElementById('auth-password-error');

    if (passError && pass.length > 0) {
      passError.classList.add('hidden');
      if (passInput) passInput.classList.remove('border-rose-500', 'focus:ring-rose-500');
    }

    if (this.authMode === 'register') {
      const confirmInput = document.getElementById('auth-input-password-confirm');
      const confirmPass = confirmInput ? confirmInput.value : '';
      const confirmError = document.getElementById('auth-confirm-error');
      const confirmSuccess = document.getElementById('auth-confirm-success');

      if (!confirmPass) {
        if (confirmError) confirmError.classList.add('hidden');
        if (confirmSuccess) confirmSuccess.classList.add('hidden');
        if (confirmInput) confirmInput.classList.remove('border-rose-500', 'border-emerald-500');
        return;
      }

      if (pass === confirmPass) {
        if (confirmError) confirmError.classList.add('hidden');
        if (confirmSuccess) confirmSuccess.classList.remove('hidden');
        if (confirmInput) {
          confirmInput.classList.remove('border-rose-500');
          confirmInput.classList.add('border-emerald-500');
        }
      } else {
        if (confirmSuccess) confirmSuccess.classList.add('hidden');
        if (confirmError) confirmError.classList.remove('hidden');
        if (confirmInput) {
          confirmInput.classList.remove('border-emerald-500');
          confirmInput.classList.add('border-rose-500');
        }
      }
    }
  }

  // Alternar visualización de contraseña (ojo visible / oculto)
  togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = btnEl ? btnEl.querySelector('i') : null;
    if (input.type === 'password') {
      input.type = 'text';
      if (icon) {
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      }
    } else {
      input.type = 'password';
      if (icon) {
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      }
    }
  }

  openAuthModal(mode = 'login') {
    const modal = document.getElementById('modal-login');
    if (modal) {
      this.switchAuthMode(mode);
      const nameInput = document.getElementById('auth-input-name');
      const emailInput = document.getElementById('auth-input-email');
      const phoneInput = document.getElementById('auth-input-phone');
      const passInput = document.getElementById('auth-input-password');
      const confirmInput = document.getElementById('auth-input-password-confirm');

      const nameError = document.getElementById('auth-name-error');
      const emailError = document.getElementById('auth-email-error');
      const phoneError = document.getElementById('auth-phone-error');
      const validIcon = document.getElementById('auth-email-valid-icon');
      const passError = document.getElementById('auth-password-error');
      const confirmError = document.getElementById('auth-confirm-error');
      const confirmSuccess = document.getElementById('auth-confirm-success');

      if (nameError) nameError.classList.add('hidden');
      if (emailError) emailError.classList.add('hidden');
      if (phoneError) phoneError.classList.add('hidden');
      if (validIcon) validIcon.classList.add('hidden');
      if (passError) passError.classList.add('hidden');
      if (confirmError) confirmError.classList.add('hidden');
      if (confirmSuccess) confirmSuccess.classList.add('hidden');

      if (nameInput) {
        nameInput.classList.remove('border-rose-500', 'focus:ring-rose-500');
        nameInput.value = '';
      }
      if (phoneInput) {
        phoneInput.classList.remove('border-rose-500', 'focus:ring-rose-500');
        phoneInput.value = '';
      }
      if (emailInput) {
        emailInput.classList.remove('border-rose-500', 'border-emerald-500', 'focus:ring-rose-500', 'focus:ring-emerald-400');
        if (this.currentUser) {
          emailInput.value = this.currentUser.email;
          if (validIcon) validIcon.classList.remove('hidden');
          emailInput.classList.add('border-emerald-500');
        } else {
          emailInput.value = '';
        }
      }
      if (passInput) {
        passInput.classList.remove('border-rose-500', 'focus:ring-rose-500');
        passInput.value = '';
      }
      if (confirmInput) {
        confirmInput.classList.remove('border-rose-500', 'border-emerald-500');
        confirmInput.value = '';
      }

      modal.classList.remove('hidden');
      modal.classList.add('flex');
      setTimeout(() => {
        if (this.authMode === 'register' && nameInput) {
          nameInput.focus();
        } else if (emailInput && !emailInput.value) {
          emailInput.focus();
        } else if (passInput) {
          passInput.focus();
        }
      }, 50);
    }
  }

  // Alias para retrocompatibilidad
  openLoginModal(mode = 'login') {
    this.openAuthModal(mode);
  }

  closeAuthModal() {
    const modal = document.getElementById('modal-login');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    const nameError = document.getElementById('auth-name-error');
    if (nameError) nameError.classList.add('hidden');
    const emailError = document.getElementById('auth-email-error');
    if (emailError) emailError.classList.add('hidden');
    const phoneError = document.getElementById('auth-phone-error');
    if (phoneError) phoneError.classList.add('hidden');
    const passError = document.getElementById('auth-password-error');
    if (passError) passError.classList.add('hidden');
    const confirmError = document.getElementById('auth-confirm-error');
    if (confirmError) confirmError.classList.add('hidden');
  }

  // Alias para retrocompatibilidad
  closeLoginModal() {
    this.closeAuthModal();
  }

  switchAuthMode(mode) {
    this.authMode = mode === 'register' ? 'register' : 'login';

    const tabLogin = document.getElementById('auth-tab-login');
    const tabRegister = document.getElementById('auth-tab-register');
    const modalTitle = document.getElementById('auth-modal-title');
    const modalDesc = document.getElementById('auth-modal-desc');
    const submitBtnText = document.getElementById('auth-submit-text');
    const submitIcon = document.getElementById('auth-submit-icon');
    const switchPrompt = document.getElementById('auth-switch-prompt');

    const nameContainer = document.getElementById('auth-name-container');
    const nameInput = document.getElementById('auth-input-name');
    const nameError = document.getElementById('auth-name-error');

    const phoneContainer = document.getElementById('auth-phone-container');
    const phoneInput = document.getElementById('auth-input-phone');
    const phoneError = document.getElementById('auth-phone-error');

    const confirmContainer = document.getElementById('auth-confirm-container');
    const confirmInput = document.getElementById('auth-input-password-confirm');
    const confirmError = document.getElementById('auth-confirm-error');
    const confirmSuccess = document.getElementById('auth-confirm-success');

    const emailError = document.getElementById('auth-email-error');
    const passError = document.getElementById('auth-password-error');

    if (nameError) nameError.classList.add('hidden');
    if (emailError) emailError.classList.add('hidden');
    if (phoneError) phoneError.classList.add('hidden');
    if (passError) passError.classList.add('hidden');
    if (confirmError) confirmError.classList.add('hidden');
    if (confirmSuccess) confirmSuccess.classList.add('hidden');

    if (this.authMode === 'register') {
      if (tabLogin) {
        tabLogin.className = "flex-1 py-2 px-2 sm:px-3 rounded-sm text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 sm:gap-1.5 text-slate-500 hover:text-slate-800 bg-transparent transition-colors";
      }
      if (tabRegister) {
        tabRegister.className = "flex-1 py-2 px-2 sm:px-3 rounded-sm text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 sm:gap-1.5 bg-white text-[#0a2540] border-b-2 border-b-[#0072bb] shadow-2xs transition-colors";
      }
      if (modalTitle) modalTitle.textContent = "Registrá tu Cuenta Vecinal";
      if (modalDesc) modalDesc.textContent = "Completá tus datos para acceder y gestionar tus propuestas y reclamos.";
      if (submitBtnText) submitBtnText.textContent = "Registrarme y Acceder";
      if (submitIcon) submitIcon.className = "fa-solid fa-user-plus text-[#c59b27]";
      if (switchPrompt) {
        switchPrompt.innerHTML = `¿Ya tenés una cuenta registrada? <button type="button" onclick="App.switchAuthMode('login')" class="text-[#0072bb] font-bold hover:underline ml-1">Iniciá sesión acá</button>`;
      }
      if (nameContainer) nameContainer.classList.remove('hidden');
      if (nameInput) nameInput.required = true;
      if (phoneContainer) phoneContainer.classList.remove('hidden');
      if (phoneInput) phoneInput.required = true;
      if (confirmContainer) confirmContainer.classList.remove('hidden');
      if (confirmInput) confirmInput.required = true;
    } else {
      if (tabLogin) {
        tabLogin.className = "flex-1 py-2 px-2 sm:px-3 rounded-sm text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 sm:gap-1.5 bg-white text-[#0a2540] border-b-2 border-b-[#0072bb] shadow-2xs transition-colors";
      }
      if (tabRegister) {
        tabRegister.className = "flex-1 py-2 px-2 sm:px-3 rounded-sm text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 sm:gap-1.5 text-slate-500 hover:text-slate-800 bg-transparent transition-colors";
      }
      if (modalTitle) modalTitle.textContent = "Ingresá a tu Cuenta Vecinal";
      if (modalDesc) modalDesc.textContent = "Accedé con tu correo y contraseña para hacer seguimiento de tus reclamos.";
      if (submitBtnText) submitBtnText.textContent = "Iniciar Sesión y Acceder";
      if (submitIcon) submitIcon.className = "fa-solid fa-right-to-bracket text-[#c59b27]";
      if (switchPrompt) {
        switchPrompt.innerHTML = `¿No registraste tu cuenta aún? <button type="button" onclick="App.switchAuthMode('register')" class="text-[#0072bb] font-bold hover:underline ml-1">Registrate acá</button>`;
      }
      if (nameContainer) nameContainer.classList.add('hidden');
      if (nameInput) {
        nameInput.required = false;
        nameInput.value = '';
      }
      if (phoneContainer) phoneContainer.classList.add('hidden');
      if (phoneInput) {
        phoneInput.required = false;
        phoneInput.value = '';
      }
      if (confirmContainer) confirmContainer.classList.add('hidden');
      if (confirmInput) {
        confirmInput.required = false;
        confirmInput.value = '';
      }
    }
  }

  handleAuthSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const nameInput = document.getElementById('auth-input-name');
    const emailInput = document.getElementById('auth-input-email');
    const phoneInput = document.getElementById('auth-input-phone');
    const passInput = document.getElementById('auth-input-password');
    const confirmInput = document.getElementById('auth-input-password-confirm');

    const name = nameInput ? nameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const pass = passInput ? passInput.value : '';
    const confirmPass = confirmInput ? confirmInput.value : '';

    const nameError = document.getElementById('auth-name-error');
    const emailError = document.getElementById('auth-email-error');
    const phoneError = document.getElementById('auth-phone-error');
    const passError = document.getElementById('auth-password-error');
    const passErrorMsg = document.getElementById('auth-password-error-msg');
    const confirmError = document.getElementById('auth-confirm-error');

    // 1. Si es Registro: validar Nombre Completo
    if (this.authMode === 'register') {
      if (!name) {
        if (nameError) nameError.classList.remove('hidden');
        if (nameInput) {
          nameInput.classList.add('border-rose-500', 'focus:ring-rose-500');
          nameInput.focus();
        }
        this.showToast('Por favor ingresá tu nombre completo.', 'warning', 4000);
        return;
      }
    }

    // 2. Validar formato de correo electrónico
    if (!this.validateEmailFormat(email)) {
      if (emailError) emailError.classList.remove('hidden');
      if (emailInput) {
        emailInput.classList.remove('border-emerald-500');
        emailInput.classList.add('border-rose-500', 'focus:ring-rose-500');
        emailInput.focus();
      }
      this.showToast('Por favor ingresá un formato de correo válido (ej: nombre@correo.com)', 'warning', 4000);
      return;
    }

    // 3. Si es Registro: validar Teléfono
    if (this.authMode === 'register') {
      if (!phone) {
        if (phoneError) phoneError.classList.remove('hidden');
        if (phoneInput) {
          phoneInput.classList.add('border-rose-500', 'focus:ring-rose-500');
          phoneInput.focus();
        }
        this.showToast('Por favor ingresá tu número de teléfono.', 'warning', 4000);
        return;
      }
    }

    // 4. Validar contraseña
    if (!pass || pass.length < 4) {
      if (passError) {
        passError.classList.remove('hidden');
        if (passErrorMsg) passErrorMsg.textContent = pass.length === 0 ? 'Ingresá tu contraseña' : 'La contraseña debe tener al menos 4 caracteres';
      }
      if (passInput) {
        passInput.classList.add('border-rose-500', 'focus:ring-rose-500');
        passInput.focus();
      }
      this.showToast('Por favor completá tu contraseña (mínimo 4 caracteres)', 'warning', 3500);
      return;
    }

    // 5. Si es Registro: validar que confirmación sea exactamente igual
    if (this.authMode === 'register') {
      if (pass !== confirmPass) {
        if (confirmError) confirmError.classList.remove('hidden');
        if (confirmInput) {
          confirmInput.classList.add('border-rose-500', 'focus:ring-rose-500');
          confirmInput.focus();
        }
        this.showToast('Las contraseñas no coinciden. Deben ser exactamente iguales.', 'error', 4000);
        return;
      }
    }

    const registeredUsers = this.getRegisteredUsers();

    if (this.authMode === 'register') {
      // Registrar usuario en colección permanente en localStorage
      const newUser = {
        id: `usr-${Date.now()}`,
        name: name,
        email: email,
        phone: phone,
        password: pass,
        registeredAt: new Date().toISOString()
      };
      registeredUsers[email] = newUser;
      this.saveRegisteredUsers(registeredUsers);

      // Compatibilidad con cuentas previas
      try {
        const legacyAccounts = JSON.parse(localStorage.getItem('pensando_guaymallen_accounts') || '{}');
        legacyAccounts[email] = pass;
        localStorage.setItem('pensando_guaymallen_accounts', JSON.stringify(legacyAccounts));
      } catch (err) {}

      // Establecer sesión activa
      this.currentUser = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone
      };

      try {
        sessionStorage.setItem('pensando_guaymallen_user', JSON.stringify(this.currentUser));
      } catch (err) {}

      this.closeAuthModal();
      this.renderUserHeader();
      this.syncFormUserSession();
      this.setFeedReportScope('mine');
      this.showToast(`¡Registro exitoso! Bienvenido/a ${this.currentUser.name}.`, 'success', 5000);

    } else {
      // Iniciar sesión (Login pide ÚNICAMENTE correo y contraseña)
      const user = registeredUsers[email];
      let legacyAccounts = {};
      try {
        legacyAccounts = JSON.parse(localStorage.getItem('pensando_guaymallen_accounts') || '{}');
      } catch (e) {}

      if (user) {
        if (user.password !== pass) {
          if (passError) {
            passError.classList.remove('hidden');
            if (passErrorMsg) passErrorMsg.textContent = 'Contraseña incorrecta para este correo';
          }
          if (passInput) {
            passInput.classList.add('border-rose-500', 'focus:ring-rose-500');
            passInput.focus();
          }
          this.showToast('Contraseña incorrecta. Por favor revisá tus datos.', 'error', 4000);
          return;
        }

        // Recuperar Nombre Completo y Teléfono guardados previamente
        this.currentUser = {
          id: user.id || `usr-${Date.now()}`,
          name: user.name || email.split('@')[0],
          email: user.email,
          phone: user.phone || ''
        };
      } else if (legacyAccounts[email]) {
        if (legacyAccounts[email] !== pass) {
          if (passError) {
            passError.classList.remove('hidden');
            if (passErrorMsg) passErrorMsg.textContent = 'Contraseña incorrecta para este correo';
          }
          if (passInput) {
            passInput.classList.add('border-rose-500', 'focus:ring-rose-500');
            passInput.focus();
          }
          this.showToast('Contraseña incorrecta. Por favor revisá tus datos.', 'error', 4000);
          return;
        }

        const alias = email.split('@')[0];
        const formattedName = alias.charAt(0).toUpperCase() + alias.slice(1);
        this.currentUser = {
          id: `usr-${Date.now()}`,
          name: formattedName,
          email: email,
          phone: ''
        };
      } else {
        if (emailError) {
          emailError.classList.remove('hidden');
          const emailErrorMsg = document.getElementById('auth-email-error-msg');
          if (emailErrorMsg) emailErrorMsg.textContent = 'No encontramos una cuenta con este correo. Por favor registrate.';
        }
        if (emailInput) {
          emailInput.classList.add('border-rose-500', 'focus:ring-rose-500');
          emailInput.focus();
        }
        this.showToast('No encontramos una cuenta con este correo. Por favor hacé clic en "Registrarse".', 'warning', 4500);
        return;
      }

      try {
        sessionStorage.setItem('pensando_guaymallen_user', JSON.stringify(this.currentUser));
      } catch (err) {}

      this.closeAuthModal();
      this.renderUserHeader();
      this.syncFormUserSession();
      this.setFeedReportScope('mine');
      this.showToast(`¡Hola de nuevo, ${this.currentUser.name}! Sesión iniciada correctamente.`, 'success', 4500);
    }
  }

  // Alias para compatibilidad con código existente
  handleLogin(e) {
    this.handleAuthSubmit(e);
  }

  handleLogout() {
    this.currentUser = null;
    try {
      sessionStorage.removeItem('pensando_guaymallen_user');
    } catch (e) {}
    this.setFeedReportScope('all');
    this.renderUserHeader();
    this.syncFormUserSession();
    this.showToast('Sesión cerrada correctamente.', 'info');
  }

  // Renderizar estado de usuario en Header (siempre muestra Nombre, NUNCA el email)
  renderUserHeader() {
    const headerContainer = document.getElementById('header-user-container');
    const drawerContainer = document.getElementById('drawer-user-container');

    if (headerContainer) {
      if (!this.currentUser) {
        headerContainer.innerHTML = `
          <!-- Desktop: botones separados -->
          <div class="hidden md:flex items-center gap-1.5">
            <button 
              type="button"
              onclick="App.openAuthModal('login')"
              id="btn-header-login"
              class="px-3 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-white text-[#0a2540] hover:bg-slate-50 border border-slate-300 shadow-2xs transition-all flex items-center gap-1.5">
              <i class="fa-solid fa-right-to-bracket text-xs text-[#0072bb]"></i>
              <span>Ingresar</span>
            </button>
            <button 
              type="button"
              onclick="App.openAuthModal('register')"
              id="btn-header-register"
              class="px-3 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#0a2540] hover:bg-[#0072bb] text-white shadow-2xs transition-all flex items-center gap-1.5 border-l-2 border-[#c59b27]">
              <i class="fa-solid fa-user-plus text-xs text-[#c59b27]"></i>
              <span>Registrarse</span>
            </button>
          </div>

          <!-- Mobile: botón único y reducido para iniciar sesión y registrarse -->
          <button 
            type="button"
            onclick="App.openAuthModal('login')"
            id="btn-header-auth-mobile"
            class="md:hidden px-2 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#0a2540] hover:bg-[#0072bb] active:scale-95 text-white shadow-2xs flex items-center gap-1 transition-all whitespace-nowrap border-l-2 border-[#c59b27] shrink-0">
            <i class="fa-solid fa-circle-user text-[11px] text-[#c59b27] shrink-0"></i>
            <span>Acceso</span>
          </button>
        `;
      } else {
        const myCount = this.getMyReports().length;
        const displayName = this.currentUser.name || 'Vecino/a';
        headerContainer.innerHTML = `
          <div class="relative">
            <button 
              type="button"
              onclick="App.toggleUserDropdown()"
              class="px-2.5 py-1.5 rounded-sm text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-white text-[#0a2540] border border-slate-300 hover:bg-slate-50 shadow-2xs transition-all flex items-center gap-1.5 shrink-0">
              <span class="w-2 h-2 rounded-none bg-emerald-600 shrink-0"></span>
              <span class="max-w-[90px] sm:max-w-[170px] truncate" title="${displayName}">${displayName}</span>
              <i class="fa-solid fa-chevron-down text-[8px] sm:text-[9px] text-slate-400 shrink-0"></i>
            </button>

            <!-- Dropdown Menu de Usuario -->
            <div 
              id="user-profile-dropdown" 
              class="hidden absolute right-0 mt-2 w-64 bg-white rounded-sm shadow-2xl border border-slate-300 p-2 z-[600] space-y-1">
              
              <div class="p-2.5 bg-slate-50 rounded-sm border border-slate-200 mb-1">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-sm bg-[#0a2540] text-white font-bold text-xs flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-user text-xs text-[#c59b27]"></i>
                  </div>
                  <div class="min-w-0">
                    <p class="font-bold text-xs text-[#0a2540] truncate" title="${displayName}">${displayName}</p>
                    <p class="text-[10px] text-emerald-800 font-bold uppercase tracking-wider flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-none bg-emerald-600"></span>
                      Vecino Conectado
                    </p>
                  </div>
                </div>
              </div>

              <button 
                type="button"
                onclick="App.setFeedReportScope('mine'); App.closeUserDropdown();" 
                class="w-full text-left px-3 py-2 rounded-sm text-xs font-bold uppercase tracking-wider text-[#0a2540] hover:bg-slate-100 transition-colors flex items-center justify-between">
                <span class="flex items-center gap-2">
                  <i class="fa-solid fa-user-check text-[#0072bb] text-xs"></i>
                  <span>Ver Mis Reclamos</span>
                </span>
                <span class="px-2 py-0.5 rounded-none text-[10px] bg-slate-200 text-[#0a2540] font-bold">${myCount}</span>
              </button>

              <button 
                type="button"
                onclick="App.openReportModal(); App.closeUserDropdown();" 
                class="w-full text-left px-3 py-2 rounded-sm text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-2">
                <i class="fa-solid fa-plus text-[#0072bb] text-xs"></i>
                <span>Nuevo Reclamo</span>
              </button>

              <div class="pt-1 border-t border-slate-200">
                <button 
                  type="button"
                  onclick="App.handleLogout(); App.closeUserDropdown();" 
                  class="w-full text-left px-3 py-2 rounded-sm text-xs font-bold uppercase tracking-wider text-rose-700 hover:bg-rose-50 transition-colors flex items-center gap-2">
                  <i class="fa-solid fa-right-from-bracket text-xs"></i>
                  <span>Cerrar Sesión</span>
                </button>
              </div>

            </div>
          </div>
        `;
      }
    }

    if (drawerContainer) {
      if (!this.currentUser) {
        drawerContainer.innerHTML = `
          <div class="space-y-2">
            <button 
              type="button"
              onclick="App.openAuthModal('login'); App.closeMobileDrawer();" 
              class="w-full py-2.5 px-4 rounded-sm text-xs font-bold uppercase tracking-wider bg-white text-[#0a2540] border border-slate-300 hover:bg-slate-50 shadow-2xs flex items-center justify-center gap-2 transition-all">
              <i class="fa-solid fa-right-to-bracket text-[#0072bb] text-xs"></i>
              <span>Ingresar con mi Correo</span>
            </button>
            <button 
              type="button"
              onclick="App.openAuthModal('register'); App.closeMobileDrawer();" 
              class="w-full py-2.5 px-4 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#0a2540] hover:bg-[#0072bb] text-white shadow-xs border-l-2 border-[#c59b27] flex items-center justify-center gap-2 transition-all">
              <i class="fa-solid fa-user-plus text-[#c59b27] text-xs"></i>
              <span>Registrarse con mi Correo</span>
            </button>
          </div>
        `;
      } else {
        const myCount = this.getMyReports().length;
        const displayName = this.currentUser.name || 'Vecino/a';
        drawerContainer.innerHTML = `
          <div class="p-3 bg-slate-50 rounded-sm border border-slate-200 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-2 h-2 rounded-none bg-emerald-600 shrink-0"></span>
                <span class="text-xs font-bold text-[#0a2540] truncate uppercase tracking-wider" title="${displayName}">${displayName}</span>
              </div>
              <span class="text-[10px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded-none border border-slate-200 shrink-0">${myCount} reclamos</span>
            </div>
            <button 
              type="button"
              onclick="App.setFeedReportScope('mine'); App.switchMobileTab('list'); App.closeMobileDrawer();" 
              class="w-full py-2 px-3 rounded-sm text-xs font-bold uppercase tracking-wider bg-[#0a2540] text-white shadow-xs border-l-2 border-[#c59b27] flex items-center justify-center gap-2">
              <i class="fa-solid fa-user-check text-[#c59b27] text-xs"></i>
              <span>Ver Mis Reclamos</span>
            </button>
            <button 
              type="button"
              onclick="App.handleLogout(); App.closeMobileDrawer();" 
              class="w-full py-1 text-center text-xs font-bold text-rose-700 uppercase tracking-wider hover:underline">
              Cerrar Sesión
            </button>
          </div>
        `;
      }
    }
  }

  // Sincronización, autocompletado y bloqueo total de interacción/foco con sesión activa
  syncFormUserSession() {
    const propEmail = document.getElementById('propuesta-email');
    const propNombre = document.getElementById('propuesta-nombre');
    const propTel = document.getElementById('propuesta-telefono');
    const reportCitizen = document.querySelector('input[name="report-citizen"]');

    const inputs = [propEmail, propNombre, propTel, reportCitizen].filter(Boolean);

    const lockedClasses = [
      'input-locked',
      'bg-slate-100',
      'text-slate-500',
      'border-slate-300',
      'cursor-default',
      'select-none',
      'pointer-events-none'
    ];
    const editableClasses = [
      'bg-slate-50',
      'text-slate-800',
      'border-slate-300',
      'focus:bg-white',
      'focus:ring-1',
      'focus:ring-[#0072bb]',
      'focus:border-[#0072bb]'
    ];

    if (this.currentUser) {
      // 1. Asignar valores
      if (propEmail) {
        propEmail.value = this.currentUser.email || '';
        const emailErr = document.getElementById('propuesta-email-error');
        if (emailErr) emailErr.classList.add('hidden');
      }
      if (propNombre) {
        propNombre.value = this.currentUser.name || '';
      }
      if (propTel) {
        propTel.value = this.currentUser.phone || '';
      }
      if (reportCitizen) {
        reportCitizen.value = this.currentUser.name || '';
      }

      // 2. Bloqueo total: readOnly, tabIndex -1, onfocus blur, pointer-events-none, clases visuales
      inputs.forEach(input => {
        input.readOnly = true;
        input.tabIndex = -1;
        input.onfocus = (e) => e.target.blur();
        input.classList.remove('border-rose-500', 'border-emerald-500', 'focus:border-rose-500', 'focus:ring-rose-500', ...editableClasses);
        input.classList.add(...lockedClasses);
      });
    } else {
      // Sesión inactiva o cerrada: limpiar y desbloquear campos para edición normal
      inputs.forEach(input => {
        input.readOnly = false;
        input.tabIndex = 0;
        input.onfocus = null;
        input.value = '';
        input.classList.remove(...lockedClasses, 'border-rose-500', 'border-emerald-500', 'focus:border-rose-500', 'focus:ring-rose-500');
        input.classList.add(...editableClasses);
      });
      const emailErr = document.getElementById('propuesta-email-error');
      if (emailErr) emailErr.classList.add('hidden');
    }
  }

  toggleSenatorCard() {
    const card = document.getElementById('senator-floating-card');
    if (card) {
      card.classList.toggle('minimized');
    }
  }

  toggleUserDropdown() {
    const dd = document.getElementById('user-profile-dropdown');
    if (dd) dd.classList.toggle('hidden');
  }

  closeUserDropdown() {
    const dd = document.getElementById('user-profile-dropdown');
    if (dd) dd.classList.add('hidden');
  }

  openShareModal(reportId) {
    const rep = this.reports.find(r => r.id === reportId);
    if (!rep) return;

    const modal = document.getElementById('modal-share');
    const shareTitle = document.getElementById('share-modal-title');
    const shareLink = document.getElementById('share-modal-link');
    const btnWp = document.getElementById('share-btn-whatsapp');
    const btnTw = document.getElementById('share-btn-twitter');

    const fakeUrl = `${window.location.origin}${window.location.pathname}?report=${rep.id}`;
    const shareText = `Apoyá este reclamo vecinal en Pensando Guaymallén junto a la Senadora Luz Llorens: "${rep.title}" (${rep.districtName})`;

    if (shareTitle) shareTitle.textContent = rep.title;
    if (shareLink) shareLink.value = fakeUrl;

    if (btnWp) {
      btnWp.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + fakeUrl)}`;
    }
    if (btnTw) {
      btnTw.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(fakeUrl)}`;
    }

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  closeShareModal() {
    const modal = document.getElementById('modal-share');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  copyShareLink() {
    const shareLink = document.getElementById('share-modal-link');
    if (shareLink) {
      shareLink.select();
      navigator.clipboard.writeText(shareLink.value);
      this.showToast('Enlace copiado al portapapeles', 'success');
    }
  }

  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgColors = {
      success: 'bg-emerald-800 text-white border-l-4 border-emerald-400',
      error: 'bg-rose-900 text-white border-l-4 border-rose-400',
      info: 'bg-[#0a2540] text-white border-l-4 border-[#c59b27]'
    };
    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      info: 'fa-circle-info'
    };

    toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-sm shadow-xl text-xs font-bold uppercase tracking-wider transform transition-all duration-300 translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.info} text-sm"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.App = new PensandoGuaymallenApp();
});
