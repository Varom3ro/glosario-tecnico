import './style.css';
import db from './db.js';
import { renderCard, renderDetail, renderSidebarItem, renderNovedadCard } from './components.js';

// ==========================================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================================================
const state = {
  currentQuery: '',
  selectedCategory: null,
  selectedTermId: null,
  recentTermIds: JSON.parse(localStorage.getItem('glossary_recents') || '[]'),
  activeTab: 'tab-definition',
  isLogin: true
};

// Extrae dinámicamente las categorías únicas de los términos cargados en la nube ("libre albedrío")
function getDynamicCategories(allTerms) {
  const cats = new Set();
  allTerms.forEach(t => {
    if (t.categoria && t.categoria.trim() !== '') {
      cats.add(t.categoria.trim());
    }
  });
  if (cats.size === 0) {
    return ['IA', 'Diseño web', 'Programación', 'Desarrollo de apps', 'Marketing digital', 'UX/UI', 'Branding', 'Automatización'];
  }
  return Array.from(cats).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// Instancia diferida para instalación de PWA
let deferredPrompt = null;

// ==========================================================================
// INICIALIZACIÓN DE LA APP
// ==========================================================================
// Autenticación centralizada con Supabase Cloud
async function initAuth() {
  state.isLogin = true;
  const loadingScreen = document.getElementById('loading-screen');
  
  // Escuchar cambios de estado de autenticación en Supabase
  db.supabase.auth.onAuthStateChange(async (event, session) => {
    const authScreen = document.getElementById('auth-screen');
    const appContainer = document.getElementById('app');
    const btnLogout = document.getElementById('btn-logout');
    
    if (session) {
      authScreen.classList.add('hide');
      appContainer.classList.remove('hide');
      if (btnLogout) btnLogout.classList.remove('hide');
      
      // Limpiar error de auth
      const authErr = document.getElementById('auth-error');
      if (authErr) authErr.classList.add('hide');
      
      // Cargar datos
      await loadAndRender();
    } else {
      authScreen.classList.remove('hide');
      appContainer.classList.add('hide');
      if (btnLogout) btnLogout.classList.add('hide');
      closeDetail();
    }

    // Ocultar pantalla de carga una vez procesado el cambio de estado
    if (loadingScreen) loadingScreen.classList.add('hide');
  });

  // Verificar sesión actual
  const { data: { session } } = await db.supabase.auth.getSession();
  const authScreen = document.getElementById('auth-screen');
  const appContainer = document.getElementById('app');
  const btnLogout = document.getElementById('btn-logout');

  if (session) {
    authScreen.classList.add('hide');
    appContainer.classList.remove('hide');
    if (btnLogout) btnLogout.classList.remove('hide');
    await loadAndRender();
  } else {
    authScreen.classList.remove('hide');
    appContainer.classList.add('hide');
    if (btnLogout) btnLogout.classList.add('hide');
  }

  // Ocultar pantalla de carga una vez verificado el estado inicial
  if (loadingScreen) loadingScreen.classList.add('hide');
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Configurar Tema Visual (Claro / Oscuro)
  initTheme();

  // 2. Inicializar Supabase y Auth
  try {
    await initAuth();
  } catch (error) {
    showToast('Error de conexión con la nube de Supabase.', 'danger');
    console.error(error);
  }

  // 3. Registrar Event Listeners
  setupEventListeners();

  // 4. Configurar instalador PWA
  setupPWAInstall();

  // 5. Registrar Service Worker para soporte offline PWA
  registerServiceWorker();
});

// ==========================================================================
// CARGA Y RENDERIZADO DE LA INTERFAZ (TIEMPO REAL)
// ==========================================================================
async function loadAndRender() {
  // A. Obtener términos desde IndexedDB aplicando filtros de búsqueda
  const filteredTerms = await db.search(state.currentQuery);
  
  // B. Aplicar filtro de categoría si está seleccionado
  let termsToRender = filteredTerms;
  if (state.selectedCategory) {
    termsToRender = filteredTerms.filter(
      term => term.categoria?.toLowerCase().trim() === state.selectedCategory.toLowerCase().trim()
    );
  }

  // C. Renderizar la Grilla Principal
  renderTermsGrid(termsToRender);

  // D. Renderizar la Barra Lateral (Estadísticas, Categorías, Favoritos, Recientes)
  await renderSidebar(filteredTerms);

  // E. Renderizar Novedades (Últimos actualizados, máx 4)
  await renderNovedades();
}

/**
 * Renderiza la grilla de términos y maneja el estado vacío.
 */
function renderTermsGrid(terms) {
  const grid = document.getElementById('terms-grid');
  const emptyState = document.getElementById('empty-state');
  const resultsCount = document.getElementById('results-count');

  // Actualizar contador
  if (state.selectedCategory) {
    resultsCount.textContent = `Mostrando ${terms.length} término${terms.length !== 1 ? 's' : ''} en "${state.selectedCategory}"`;
  } else if (state.currentQuery) {
    resultsCount.textContent = `Encontrados ${terms.length} resultado${terms.length !== 1 ? 's' : ''} para "${state.currentQuery}"`;
  } else {
    resultsCount.textContent = `Mostrando todos los términos (${terms.length})`;
  }

  // Evaluar estado vacío
  if (terms.length === 0) {
    grid.classList.add('hide');
    emptyState.classList.remove('hide');
    
    // Pre-poblar botón del estado vacío
    const missingTermSpan = document.getElementById('missing-term-name');
    if (missingTermSpan) {
      missingTermSpan.textContent = state.currentQuery || 'nuevo concepto';
    }
  } else {
    emptyState.classList.add('hide');
    grid.classList.remove('hide');
    
    // Generar e insertar HTML de las tarjetas
    grid.innerHTML = terms.map(term => renderCard(term)).join('');
  }
}

/**
 * Renderiza las listas y widgets del Sidebar lateral.
 */
async function renderSidebar(allSearchedTerms) {
  const allTerms = await db.getAll();
  
  // 1. Estadísticas de progreso
  const totalCount = allTerms.length;
  const favoritesCount = allTerms.filter(t => t.favorito).length;
  document.getElementById('stat-total').textContent = totalCount;
  document.getElementById('stat-favorites').textContent = favoritesCount;

  // 2. Filtros de Categorías Dinámicos (con conteo)
  renderCategoriesFilter(allTerms);

  // 3. Renderizar Favoritos Destacados
  const favoritesList = document.getElementById('favorites-list');
  const favTerms = allTerms.filter(t => t.favorito);
  if (favTerms.length === 0) {
    favoritesList.innerHTML = '<li class="empty-list-msg">No has marcado favoritos aún</li>';
  } else {
    favoritesList.innerHTML = favTerms
      .slice(0, 5) // limitar a 5
      .map(term => renderSidebarItem(term))
      .join('');
  }

  // 4. Renderizar Recientes
  const recentsList = document.getElementById('recents-list');
  const recentTerms = [];
  
  // Buscar objetos de términos basados en nuestro array de IDs recientes
  for (const id of state.recentTermIds) {
    const term = allTerms.find(t => t.id === id);
    if (term) recentTerms.push(term);
  }

  if (recentTerms.length === 0) {
    recentsList.innerHTML = '<li class="empty-list-msg">No hay consultas recientes</li>';
  } else {
    recentsList.innerHTML = recentTerms
      .slice(0, 5) // limitar a 5
      .map(term => renderSidebarItem(term))
      .join('');
  }
}

/**
 * Renders the category lists on Sidebar (desktop) and horizontal scroll (mobile)
 */
function renderCategoriesFilter(allTerms) {
  const container = document.getElementById('categories-container');
  const mobileContainer = document.getElementById('mobile-categories-list');
  const clearBtn = document.getElementById('btn-clear-category');

  const dynamicCats = getDynamicCategories(allTerms);

  // Calcular recuentos de ítems por categoría de forma dinámica e insensible a mayúsculas
  const counts = {};
  dynamicCats.forEach(cat => counts[cat] = 0);
  allTerms.forEach(term => {
    const trimmedCat = term.categoria?.trim();
    const matchedCat = dynamicCats.find(c => c.toLowerCase() === trimmedCat?.toLowerCase());
    if (matchedCat) {
      counts[matchedCat]++;
    }
  });

  // Rellenar dinámicamente el datalist del formulario modal para el autocompletado interactivo
  const datalist = document.getElementById('categories-datalist');
  if (datalist) {
    datalist.innerHTML = dynamicCats.map(cat => `<option value="${cat}"></option>`).join('');
  }

  // Generar HTML de categorías
  const getCategoriesHtml = () => {
    return dynamicCats.map(cat => {
      const activeClass = state.selectedCategory?.toLowerCase() === cat.toLowerCase() ? 'active' : '';
      
      // Mapear categoría a su clase CSS correspondiente
      const mapping = {
        'ia': 'cat-ia',
        'diseño web': 'cat-diseno',
        'programación': 'cat-prog',
        'desarrollo de apps': 'cat-apps',
        'marketing digital': 'cat-marketing',
        'ux/ui': 'cat-uxui',
        'branding': 'cat-branding',
        'automatización': 'cat-auto'
      };
      const cleanCat = mapping[cat.toLowerCase()] || 'cat-prog';

      return `
        <button class="category-pill ${cleanCat} ${activeClass}" data-category="${cat}">
          <span>${cat}</span>
          <span style="font-size: 0.7rem; font-weight: 800; opacity: 0.8; margin-left: 4px;">(${counts[cat] || 0})</span>
        </button>
      `;
    }).join('');
  };

  const htmlContent = getCategoriesHtml();
  if (container) container.innerHTML = htmlContent;
  if (mobileContainer) mobileContainer.innerHTML = htmlContent;

  // Mostrar u ocultar botón de limpiar filtros
  if (clearBtn) {
    if (state.selectedCategory) {
      clearBtn.classList.remove('hide');
    } else {
      clearBtn.classList.add('hide');
    }
  }
}

/**
 * Renderiza la sección inferior de Novedades.
 */
async function renderNovedades() {
  const container = document.getElementById('novedades-grid');
  const newestTerms = await db.getUpdates(4); // Obtener 4 novedades
  
  if (newestTerms.length === 0) {
    container.innerHTML = '<span class="empty-list-msg">No hay actualizaciones todavía</span>';
  } else {
    container.innerHTML = newestTerms.map(term => renderNovedadCard(term)).join('');
  }
}

// ==========================================================================
// CAJÓN DE DETALLE (SLIDE-OUT DRAWER)
// ==========================================================================
async function openDetail(id) {
  state.selectedTermId = id;
  
  // Incrementar vistas
  const updatedTerm = await db.incrementViews(id);
  if (!updatedTerm) return;

  // Registrar en Recientes (anteponer y evitar duplicados)
  state.recentTermIds = [id, ...state.recentTermIds.filter(x => x !== id)].slice(0, 10);
  localStorage.setItem('glossary_recents', JSON.stringify(state.recentTermIds));

  // Renderizar el cuerpo del término
  const bodyContainer = document.getElementById('drawer-term-body');
  bodyContainer.innerHTML = renderDetail(updatedTerm);

  // Configurar estado favorito en el header del Drawer
  const favBtn = document.getElementById('btn-drawer-favorite');
  if (updatedTerm.favorito) {
    favBtn.classList.add('is-favorite');
  } else {
    favBtn.classList.remove('is-favorite');
  }

  // Verificar la propiedad del término (el creador coincide con el usuario autenticado)
  const { data: { user } } = await db.supabase.auth.getUser();
  const isOwner = user && updatedTerm.user_id === user.id;

  // Mostrar u ocultar botones de editar y eliminar según permisos
  const btnEdit = document.getElementById('btn-drawer-edit');
  const btnDelete = document.getElementById('btn-drawer-delete');
  if (btnEdit) btnEdit.classList.toggle('hide', !isOwner);
  if (btnDelete) btnDelete.classList.toggle('hide', !isOwner);

  // Añadir evento al botón de pronunciación por voz en inglés
  const pronounceBtn = bodyContainer.querySelector('.pronounce-btn');
  if (pronounceBtn) {
    pronounceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const termToSpeak = pronounceBtn.getAttribute('data-term');
      speakEnglishTerm(termToSpeak);
    });
  }

  // Activar por defecto la pestaña "Definición"
  switchTab('tab-definition');

  // Añadir eventos a los botones de pestañas del Drawer
  const tabBtns = bodyContainer.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabId = e.currentTarget.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Añadir evento a los términos relacionados dentro del drawer
  const relatedChips = bodyContainer.querySelectorAll('.chip-related');
  relatedChips.forEach(chip => {
    chip.addEventListener('click', async (e) => {
      const termName = e.currentTarget.getAttribute('data-name');
      const allTerms = await db.getAll();
      const matched = allTerms.find(t => t.termino.toLowerCase().trim() === termName.toLowerCase().trim() || t.abreviatura?.toLowerCase().trim() === termName.toLowerCase().trim());
      if (matched) {
        openDetail(matched.id);
      } else {
        showToast(`El término "${termName}" no está creado en Supabase`, 'warning');
      }
    });
  });

  // Mostrar el Drawer agregando la clase open
  const drawer = document.getElementById('drawer-detail');
  drawer.classList.add('open');

  // Actualizar vistas sin recargar todo el listado molesto
  await loadAndRender();
}

function closeDetail() {
  state.selectedTermId = null;
  const drawer = document.getElementById('drawer-detail');
  drawer.classList.remove('open');
}

function switchTab(tabId) {
  state.activeTab = tabId;
  
  // Modificar clases activas en botones
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Modificar clases en paneles de contenido
  const tabPanes = document.querySelectorAll('.tab-pane');
  tabPanes.forEach(pane => {
    if (pane.id === tabId) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });
}

// ==========================================================================
// FORMULARIO: CREAR Y EDITAR FICHA (DIALOG MODAL)
// ==========================================================================
async function openModal(termId = null) {
  const modal = document.getElementById('modal-term-form');
  const form = document.getElementById('term-form');
  const title = document.getElementById('modal-form-title');
  
  form.reset();
  document.getElementById('form-term-id').value = '';
  title.textContent = 'Crear Ficha Técnica';

  if (termId) {
    // Modo Edición: Cargar datos
    const term = await db.get(termId);
    if (!term) return;

    title.textContent = `Editar Ficha: ${term.termino}`;
    document.getElementById('form-term-id').value = term.id;
    document.getElementById('form-termino').value = term.termino;
    document.getElementById('form-abreviatura').value = term.abreviatura || '';
    document.getElementById('form-significado_es').value = term.significado_es;
    document.getElementById('form-categoria').value = term.categoria;
    document.getElementById('form-favorito').checked = !!term.favorito;
    document.getElementById('form-definicion_corta').value = term.definicion_corta;
    document.getElementById('form-explicacion').value = term.explicacion || '';
    document.getElementById('form-tip').value = term.tip || '';
    document.getElementById('form-keywords').value = term.keywords ? term.keywords.join(', ') : '';
    document.getElementById('form-relacionados').value = term.relacionados ? term.relacionados.join(', ') : '';
  } else if (state.currentQuery) {
    // Si hay una búsqueda activa, pre-poblar el término principal
    document.getElementById('form-termino').value = state.currentQuery;
  }

  modal.showModal();
}

function closeModal() {
  const modal = document.getElementById('modal-term-form');
  modal.close();
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('form-term-id').value;
  const isNew = !id;

  const termData = {
    termino: document.getElementById('form-termino').value.trim(),
    abreviatura: document.getElementById('form-abreviatura').value.trim(),
    significado_es: document.getElementById('form-significado_es').value.trim(),
    categoria: document.getElementById('form-categoria').value,
    favorito: document.getElementById('form-favorito').checked,
    definicion_corta: document.getElementById('form-definicion_corta').value.trim(),
    explicacion: document.getElementById('form-explicacion').value.trim(),
    tip: document.getElementById('form-tip').value.trim(),
    keywords: document.getElementById('form-keywords').value,
    relacionados: document.getElementById('form-relacionados').value
  };

  if (!isNew) {
    termData.id = id;
    // Preservar contador de vistas y origen de datos
    const existing = await db.get(id);
    if (existing) {
      termData.veces_consultado = existing.veces_consultado || 0;
      termData.origen = existing.origen || 'manual';
      termData.fecha_creacion = existing.fecha_creacion;
      termData.estado = existing.estado || 'activo';
    }
  }

  try {
    const savedTerm = await db.save(termData);
    showToast(
      isNew ? `Término "${savedTerm.termino}" creado con éxito en la nube!` : `Término "${savedTerm.termino}" actualizado correctamente!`,
      'success'
    );
    closeModal();

    // Limpiar buscador principal para reflejar de inmediato el concepto guardado
    const searchInput = document.getElementById('input-search');
    const clearSearchBtn = document.getElementById('btn-clear-search');
    if (searchInput) searchInput.value = '';
    state.currentQuery = '';
    if (clearSearchBtn) clearSearchBtn.classList.add('hide');
    
    // Recargar interfaz
    await loadAndRender();

    // Si estábamos editando y el Drawer estaba abierto, actualizarlo también
    if (!isNew && state.selectedTermId === id) {
      openDetail(id);
    }
  } catch (error) {
    showToast('Error al guardar el término en la nube de Supabase.', 'danger');
    console.error(error);
  }
}

async function handleDeleteTerm(id) {
  const term = await db.get(id);
  if (!term) return;

  const confirmDelete = confirm(`¿Estás seguro de que deseas eliminar permanentemente el término "${term.termino}" de la nube de Supabase? Esta acción es irreversible.`);
  if (!confirmDelete) return;

  try {
    await db.delete(id);
    showToast(`Término "${term.termino}" eliminado con éxito de Supabase.`, 'warning');
    closeDetail();
    
    // Quitar de Recientes
    state.recentTermIds = state.recentTermIds.filter(x => x !== id);
    localStorage.setItem('glossary_recents', JSON.stringify(state.recentTermIds));

    await loadAndRender();
  } catch (error) {
    showToast('Error al intentar eliminar el concepto de la nube.', 'danger');
    console.error(error);
  }
}

async function toggleTermFavorite(id) {
  const term = await db.get(id);
  if (!term) return;

  term.favorito = !term.favorito;
  await db.save(term);

  showToast(
    term.favorito ? `"${term.termino}" agregado a favoritos en Supabase!` : `"${term.termino}" removido de favoritos.`,
    'info'
  );

  // Sincronizar UI del Drawer si está abierto
  if (state.selectedTermId === id) {
    const favBtn = document.getElementById('btn-drawer-favorite');
    if (term.favorito) {
      favBtn.classList.add('is-favorite');
    } else {
      favBtn.classList.remove('is-favorite');
    }
  }

  await loadAndRender();
}

// ==========================================================================
// EVENT LISTENERS Y EVENT DELEGATION
// ==========================================================================
function setupEventListeners() {
  // 1. Buscador Principal (Keyup en tiempo real)
  const searchInput = document.getElementById('input-search');
  const clearSearchBtn = document.getElementById('btn-clear-search');

  searchInput.addEventListener('input', async (e) => {
    state.currentQuery = e.target.value;
    
    if (state.currentQuery.trim() !== '') {
      clearSearchBtn.classList.remove('hide');
    } else {
      clearSearchBtn.classList.add('hide');
    }
    await loadAndRender();
  });

  clearSearchBtn.addEventListener('click', async () => {
    searchInput.value = '';
    state.currentQuery = '';
    clearSearchBtn.classList.add('hide');
    searchInput.focus();
    await loadAndRender();
  });

  // 2. Filtro de Categoría por Clics (Delegado en Sidebar y Carrusel Móvil)
  const handleCategoryClick = async (e) => {
    const pill = e.target.closest('.category-pill');
    if (!pill) return;

    const category = pill.getAttribute('data-category');
    
    if (state.selectedCategory === category) {
      // Si ya está seleccionada, deseleccionar
      state.selectedCategory = null;
    } else {
      state.selectedCategory = category;
    }

    await loadAndRender();
  };

  document.getElementById('categories-container').addEventListener('click', handleCategoryClick);
  document.getElementById('mobile-categories-list').addEventListener('click', handleCategoryClick);

  // Limpiar filtro de categoría
  document.getElementById('btn-clear-category').addEventListener('click', async () => {
    state.selectedCategory = null;
    await loadAndRender();
  });

  // 3. Crear Ficha (Botones)
  document.getElementById('btn-add-term').addEventListener('click', () => openModal());
  document.getElementById('btn-empty-state-create').addEventListener('click', () => openModal());

  // Formulario Cancelar / Cerrar
  document.getElementById('btn-form-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-modal-close').addEventListener('click', closeModal);
  document.getElementById('term-form').addEventListener('submit', handleFormSubmit);

  // 4. Detalle de Ficha (Clics Delegados en la Grilla Principal)
  document.getElementById('terms-grid').addEventListener('click', async (e) => {
    const favBtn = e.target.closest('.card-favorite-btn');
    const termCard = e.target.closest('.term-card');

    if (favBtn) {
      e.stopPropagation(); // Evitar abrir detalles
      const id = favBtn.getAttribute('data-id');
      await toggleTermFavorite(id);
      return;
    }

    if (termCard) {
      const id = termCard.getAttribute('data-id');
      await openDetail(id);
    }
  });

  // Detalle de Ficha (Clics Delegados en Novedades Inferiores)
  document.getElementById('novedades-grid').addEventListener('click', (e) => {
    const card = e.target.closest('.novedad-card');
    if (card) {
      const id = card.getAttribute('data-id');
      openDetail(id);
    }
  });

  // 5. Clics Delegados en Sidebar (Favoritos / Recientes)
  const handleSidebarItemClick = (e) => {
    const li = e.target.closest('li');
    if (li && !li.classList.contains('empty-list-msg')) {
      const id = li.getAttribute('data-id');
      openDetail(id);
    }
  };
  document.getElementById('favorites-list').addEventListener('click', handleSidebarItemClick);
  document.getElementById('recents-list').addEventListener('click', handleSidebarItemClick);

  // 6. Acciones del Drawer Detalle
  document.getElementById('btn-drawer-close').addEventListener('click', closeDetail);
  document.getElementById('drawer-overlay').addEventListener('click', closeDetail);
  
  document.getElementById('btn-drawer-favorite').addEventListener('click', async () => {
    if (state.selectedTermId) {
      await toggleTermFavorite(state.selectedTermId);
    }
  });

  document.getElementById('btn-drawer-edit').addEventListener('click', () => {
    if (state.selectedTermId) {
      openModal(state.selectedTermId);
    }
  });

  document.getElementById('btn-drawer-delete').addEventListener('click', async () => {
    if (state.selectedTermId) {
      await handleDeleteTerm(state.selectedTermId);
    }
  });

  // Auto-corrector de modelos para garantizar estabilidad global
  const currentSavedModel = localStorage.getItem('glossary_gemini_model');
  if (!currentSavedModel || currentSavedModel === 'gemini-3-flash' || currentSavedModel === 'gemini-2.0-flash') {
    localStorage.setItem('glossary_gemini_model', 'gemini-1.5-flash');
  }

  // 10. Autenticación Supabase (Inicio de Sesión, Registro y Salida)
  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const btn = document.getElementById('btn-auth-submit');
      const errDiv = document.getElementById('auth-error');
      
      btn.disabled = true;
      btn.innerHTML = '<span>Procesando...</span>';
      errDiv.classList.add('hide');

      try {
        let result;
        if (state.isLogin) {
          result = await db.supabase.auth.signInWithPassword({ email, password });
        } else {
          result = await db.supabase.auth.signUp({ email, password });
        }
        
        if (result.error) throw result.error;

        if (!state.isLogin && result.data?.user && !result.data.session) {
          showToast('¡Cuenta creada! Revisa tu correo para confirmar.', 'success');
          errDiv.textContent = 'Revisa tu bandeja de entrada para confirmar tu correo.';
          errDiv.classList.remove('hide');
          errDiv.style.borderColor = 'rgba(16,185,129,0.3)';
          errDiv.style.color = 'var(--success)';
          errDiv.style.background = 'rgba(16,185,129,0.1)';
        } else if (result.data.session) {
          showToast('¡Sesión iniciada con éxito!', 'success');
        }
      } catch (err) {
        errDiv.textContent = err.message || 'Error de autenticación.';
        errDiv.classList.remove('hide');
        errDiv.style.borderColor = ''; errDiv.style.color = ''; errDiv.style.background = '';
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>${state.isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}</span>`;
      }
    });
  }

  const btnAuthToggle = document.getElementById('btn-auth-toggle');
  if (btnAuthToggle) {
    btnAuthToggle.addEventListener('click', () => {
      state.isLogin = !state.isLogin;
      document.getElementById('btn-auth-submit').innerHTML = `<span>${state.isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}</span>`;
      btnAuthToggle.innerHTML = state.isLogin 
        ? '¿No tienes cuenta? <strong>Regístrate</strong>' 
        : '¿Ya tienes cuenta? <strong>Inicia Sesión</strong>';
      document.getElementById('auth-error').classList.add('hide');
    });
  }

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        await db.supabase.auth.signOut();
        showToast('Sesión cerrada correctamente.', 'info');
      }
    });
  }

  // 7. Modales de Ajustes de API
  const btnSettingsToggle = document.getElementById('btn-settings-toggle');
  const modalSettings = document.getElementById('modal-settings');
  const btnSettingsClose = document.getElementById('btn-settings-close');
  const btnSettingsClear = document.getElementById('btn-settings-clear');
  const btnSettingsSave = document.getElementById('btn-settings-save');
  const inputApiKey = document.getElementById('settings-api-key');
  const selectModel = document.getElementById('settings-model');

  btnSettingsToggle.addEventListener('click', () => {
    const savedKey = localStorage.getItem('glossary_gemini_api_key') || '';
    const savedModel = localStorage.getItem('glossary_gemini_model') || 'gemini-1.5-flash';
    inputApiKey.value = savedKey;
    selectModel.value = savedModel;
    modalSettings.showModal();
  });

  btnSettingsClose.addEventListener('click', () => {
    modalSettings.close();
  });

  btnSettingsClear.addEventListener('click', () => {
    localStorage.removeItem('glossary_gemini_api_key');
    inputApiKey.value = '';
    showToast('Clave de API de Gemini eliminada correctamente.', 'warning');
  });

  btnSettingsSave.addEventListener('click', () => {
    const key = inputApiKey.value.trim();
    const model = selectModel.value;

    if (!key) {
      showToast('Por favor, introduce una API Key de Gemini válida.', 'warning');
      return;
    }

    localStorage.setItem('glossary_gemini_api_key', key);
    localStorage.setItem('glossary_gemini_model', model);
    showToast('Ajustes de API guardados de forma local con éxito.', 'success');
    modalSettings.close();
  });

  // 8. Autocompletar Formulario con IA
  const btnAutofillIA = document.getElementById('btn-autofill-ia');
  
  btnAutofillIA.addEventListener('click', async () => {
    const apiKey = localStorage.getItem('glossary_gemini_api_key');
    const model = localStorage.getItem('glossary_gemini_model') || 'gemini-1.5-flash';
    const termName = document.getElementById('form-termino').value.trim();
    const category = document.getElementById('form-categoria').value;

    if (!apiKey) {
      showToast('Por favor, ingresa tu API Key de Gemini en los Ajustes primero.', 'warning');
      // Abrir modal de ajustes de inmediato
      inputApiKey.value = '';
      selectModel.value = model;
      modalSettings.showModal();
      return;
    }

    if (!termName) {
      showToast('Por favor, escribe un "Término Principal" para poder autocompletar con la IA.', 'warning');
      document.getElementById('form-termino').focus();
      return;
    }

    // Poner el botón en estado de carga
    const originalHTML = btnAutofillIA.innerHTML;
    btnAutofillIA.disabled = true;
    btnAutofillIA.classList.add('loading');
    btnAutofillIA.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="sparkles-icon spin-slow">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
      <span>Generando...</span>
    `;

    showToast(`Generando contenido estructurado con la IA de ${model}...`, 'info');

    try {
      const promptText = `Genera una ficha técnica sumamente profesional y detallada en español para el concepto técnico "${termName}". Devuelve un objeto JSON con las siguientes propiedades exactas:
      - categoria: Clasificación técnica del término. Si el usuario ya especificó "${category || ''}", mantén esa o corrígela si es errónea. Si está vacía o no es válida, clasifícala seleccionando EXACTAMENTE uno de estos valores: "IA", "Diseño web", "Programación", "Desarrollo de apps", "Marketing digital", "UX/UI", "Branding", "Automatización".
      - abreviatura: Siglas o abreviatura si aplica (ej: "API"), o cadena vacía si no aplica.
      - significado_es: Significado literal o traducción al español (ej: "Interfaz de Programación de Aplicaciones").
      - definicion_corta: Una oración concisa (máximo 150 caracteres) resumiendo el concepto de manera clara.
      - explicacion: Explicación técnica detallada y profunda sobre su arquitectura, funcionamiento, uso o implicaciones.
      - tip: Un consejo práctico de implementación en proyectos reales o caso de uso pragmático.
      - keywords: Palabras clave relevantes separadas por comas (ej: "interfaz, endpoints, http, json").
      - relacionados: Otros términos relacionados en el glosario separados por comas (ej: "JSON, REST, HTTP").`;

      let parsedData = null;

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: promptText
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "object",
                properties: {
                  categoria: {
                    type: "string",
                    enum: ["IA", "Diseño web", "Programación", "Desarrollo de apps", "Marketing digital", "UX/UI", "Branding", "Automatización"]
                  },
                  abreviatura: { type: "string" },
                  significado_es: { type: "string" },
                  definicion_corta: { type: "string" },
                  explicacion: { type: "string" },
                  tip: { type: "string" },
                  keywords: { type: "string" },
                  relacionados: { type: "string" }
                },
                required: ["categoria", "significado_es", "definicion_corta", "explicacion", "tip", "keywords"]
              }
            }
          })
        });

        if (!response.ok) {
          if (response.status === 429) {
            throw new Error("Límite de cuota gratuito superado (HTTP 429). Por favor, espera 30 segundos.");
          }
          let errorDetail = `Status ${response.status}`;
          try {
            const errJson = await response.json();
            if (errJson.error && errJson.error.message) {
              errorDetail = errJson.error.message;
            }
          } catch (_) {}
          throw new Error(errorDetail);
        }

        const data = await response.json();
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts[0]) {
          throw new Error('La respuesta de la IA no contiene datos utilizables.');
        }

        const rawText = data.candidates[0].content.parts[0].text;
        parsedData = JSON.parse(rawText.trim());

      } catch (primaryError) {
        if (primaryError.message.includes('429') || primaryError.message.includes('cuota') || primaryError.message.includes('quota') || primaryError.message.includes('Quota')) {
          throw primaryError;
        }
        console.warn('Fallo el intento inicial con responseSchema. Iniciando fallback de compatibilidad...', primaryError);
        showToast('Iniciando reintento de compatibilidad...', 'info');

        // Fallback: Solicitud estándar sin JSON Schema estricto en la config
        const fallbackPrompt = `${promptText}\n\nResponde ÚNICAMENTE con el objeto JSON solicitado con los campos especificados, sin código de markdown adicional ni formato de bloque de código.`;
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: fallbackPrompt
                  }
                ]
              }
            ]
          })
        });

        if (!response.ok) {
          let errorDetail = `Status ${response.status}`;
          try {
            const errJson = await response.json();
            if (errJson.error && errJson.error.message) {
              errorDetail = errJson.error.message;
            }
          } catch (_) {}
          throw new Error(errorDetail);
        }

        const data = await response.json();
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts[0]) {
          throw new Error('La respuesta de compatibilidad no contiene datos.');
        }

        const rawText = data.candidates[0].content.parts[0].text;
        let cleanText = rawText.trim();
        
        // Remover bloques de código markdown de la respuesta si la IA los incluyó
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
        }

        parsedData = JSON.parse(cleanText);
      }

      // Auto-rellenar campos en el formulario
      if (parsedData.categoria) document.getElementById('form-categoria').value = parsedData.categoria;
      if (parsedData.abreviatura !== undefined) document.getElementById('form-abreviatura').value = parsedData.abreviatura;
      if (parsedData.significado_es) document.getElementById('form-significado_es').value = parsedData.significado_es;
      if (parsedData.definicion_corta) document.getElementById('form-definicion_corta').value = parsedData.definicion_corta;
      if (parsedData.explicacion) document.getElementById('form-explicacion').value = parsedData.explicacion;
      if (parsedData.tip) document.getElementById('form-tip').value = parsedData.tip;
      if (parsedData.keywords) document.getElementById('form-keywords').value = parsedData.keywords;
      if (parsedData.relacionados) document.getElementById('form-relacionados').value = parsedData.relacionados;

      showToast(`¡Campos autocompletados correctamente por Gemini!`, 'success');

    } catch (error) {
      console.error('Error al autocompletar con Gemini:', error);
      showToast(`Error al conectar con la IA: ${error.message}`, 'danger');
      if (error.message.includes('429') || error.message.includes('cuota') || error.message.includes('quota') || error.message.includes('Quota')) {
        startCooldown(btnAutofillIA, originalHTML, 30);
        return;
      }
    } finally {
      if (!btnAutofillIA.classList.contains('btn-cooldown')) {
        btnAutofillIA.disabled = false;
        btnAutofillIA.classList.remove('loading');
        btnAutofillIA.innerHTML = originalHTML;
      }
    }
  });

  // 9. Generar Caso de Uso / Guía de Estudio con IA desde el Drawer
  const btnIAGenerate = document.getElementById('btn-ia-generate');
  const modalDeepdive = document.getElementById('modal-ai-deepdive');
  const btnDeepdiveClose = document.getElementById('btn-deepdive-close');
  const btnDeepdiveDone = document.getElementById('btn-deepdive-done');
  const deepdiveContent = document.getElementById('deepdive-content');

  btnIAGenerate.addEventListener('click', async () => {
    if (!state.selectedTermId) return;

    const apiKey = localStorage.getItem('glossary_gemini_api_key');
    const model = localStorage.getItem('glossary_gemini_model') || 'gemini-1.5-flash';

    if (!apiKey) {
      showToast('Por favor, ingresa tu API Key de Gemini en los Ajustes primero.', 'warning');
      inputApiKey.value = '';
      selectModel.value = model;
      modalSettings.showModal();
      return;
    }

    const term = await db.get(state.selectedTermId);
    if (!term) return;

    // Cambiar estado a cargando
    const originalHTML = btnIAGenerate.innerHTML;
    btnIAGenerate.disabled = true;
    btnIAGenerate.classList.add('loading');
    btnIAGenerate.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="sparkles-icon spin-slow">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
      <span>Generando Guía Práctica...</span>
    `;

    showToast(`Generando guía práctica en tiempo real con ${model}...`, 'info');

    try {
      const promptText = `Actúa como un Ingeniero de Software Principal y experto en pedagogía técnica. Genera una guía de estudio exhaustiva, ultra-detallada y de alta gama en formato HTML limpio para el término técnico "${term.termino}" en la categoría "${term.categoria}". Debe incluir:
      - Un subtítulo con la etiqueta <h3> que diga "Caso de Uso en la Vida Real" y una explicación profunda y clara de cómo se aplica este concepto en un producto real.
      - Un subtítulo con la etiqueta <h3> que diga "Código Práctico o Implementación" junto a una demostración en código comentada usando <pre><code>.
      - Un subtítulo con la etiqueta <h3> que diga "Buenas Prácticas e Implicaciones" con una lista de viñetas (<ul> y <li>) enumerando buenas prácticas y errores comunes a evitar.
      - Escribe de manera extremadamente profesional en español. Utiliza etiquetas HTML semánticas puras (<h3>, <p>, <ul>, <li>, <strong>, <pre>, <code>). No utilices Markdown (sin triple acento grave o asteriscos). Genera directamente código HTML limpio.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: promptText
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Límite de cuota gratuito superado (HTTP 429). Por favor, espera 30 segundos.");
        }
        let errorDetail = `Status ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.error && errJson.error.message) {
            errorDetail = errJson.error.message;
          }
        } catch (_) {}
        throw new Error(errorDetail);
      }

      const data = await response.json();
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts[0]) {
        throw new Error('No se recibió contenido válido de la API.');
      }

      const htmlResult = data.candidates[0].content.parts[0].text;
      
      // Inyectar y abrir
      deepdiveContent.innerHTML = htmlResult;
      modalDeepdive.showModal();
      showToast('¡Guía de IA de alta fidelidad generada!', 'success');

    } catch (error) {
      console.error('Error al generar deepdive:', error);
      showToast(`Error al expandir con IA: ${error.message}`, 'danger');
      if (error.message.includes('429') || error.message.includes('cuota') || error.message.includes('quota') || error.message.includes('Quota')) {
        startCooldown(btnIAGenerate, originalHTML, 30);
        return;
      }
    } finally {
      if (!btnIAGenerate.classList.contains('btn-cooldown')) {
        btnIAGenerate.disabled = false;
        btnIAGenerate.classList.remove('loading');
        btnIAGenerate.innerHTML = originalHTML;
      }
    }
  });

  btnDeepdiveClose.addEventListener('click', () => modalDeepdive.close());
  btnDeepdiveDone.addEventListener('click', () => modalDeepdive.close());

  // Toggle de Tema Visual
  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);
}

// ==========================================================================
// TEMA VISUAL (CLARO / OSCURO)
// ==========================================================================
function initTheme() {
  const savedTheme = localStorage.getItem('glossary_theme') || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }
}

function toggleTheme() {
  const isLight = document.documentElement.classList.contains('light');
  if (isLight) {
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
    localStorage.setItem('glossary_theme', 'dark');
    showToast('Modo Oscuro activado', 'info');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    localStorage.setItem('glossary_theme', 'light');
    showToast('Modo Claro activado', 'info');
  }
}

// ==========================================================================
// TOAST NOTIFICATIONS (SISTEMA DE AVISOS PREMIUM)
// ==========================================================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast card`;

  let icon = '';
  switch (type) {
    case 'success':
      icon = `
        <span class="toast-icon toast-icon-success">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </span>`;
      break;
    case 'warning':
      icon = `
        <span class="toast-icon toast-icon-warning">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </span>`;
      break;
    case 'danger':
      icon = `
        <span class="toast-icon toast-icon-danger">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </span>`;
      break;
    default: // info
      icon = `
        <span class="toast-icon" style="color: var(--primary);">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.083.985l-.04.025m-.083-.01v5.25H16.5m-6 0h.008v.008H10.5v-.008zm1.5-12c.075 0 .15.008.223.024A2.25 2.25 0 0012 3.75c-.3 0-.585.06-.84.167a2.25 2.25 0 00-.223.107A2.252 2.252 0 0012 6Z" />
          </svg>
        </span>`;
  }

  toast.innerHTML = `
    ${icon}
    <span style="flex: 1;">${message}</span>
  `;

  container.appendChild(toast);

  // Eliminar elemento del DOM después de completarse la animación out
  setTimeout(() => {
    toast.remove();
  }, 3850);
}

// ==========================================================================
// CAPACIDADES PWA (INSTALADOR)
// ==========================================================================
function setupPWAInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir el banner automático del navegador
    e.preventDefault();
    deferredPrompt = e;
    
    // Mostrar nuestro propio botón premium de instalación en el Header
    const btnInstall = document.getElementById('btn-install-pwa');
    if (btnInstall) {
      btnInstall.classList.remove('hide');
    }
  });

  const btnInstall = document.getElementById('btn-install-pwa');
  if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      
      // Mostrar prompt nativo
      deferredPrompt.prompt();
      
      // Esperar la elección del usuario
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`Instalación de PWA elegida por usuario: ${outcome}`);
      
      // Limpiar prompt diferido
      deferredPrompt = null;
      btnInstall.classList.add('hide');
    });
  }

  window.addEventListener('appinstalled', () => {
    console.log('¡Glosario Técnico MVP instalado con éxito como PWA en el dispositivo!');
    showToast('¡Aplicación instalada con éxito en tu dispositivo!', 'success');
    if (btnInstall) {
      btnInstall.classList.add('hide');
    }
  });
}

// ==========================================================================
// REGISTRO DE SERVICE WORKER (PWA OFFLINE)
// ==========================================================================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then((reg) => {
          console.log('Service Worker registrado con éxito. Scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('Error al registrar el Service Worker:', err);
        });
    });
  }
}

// ==========================================================================
// AYUDANTE DE COOLDOWN (CONTEO REGRESIVO PARA MIGRACIÓN DE ERRORES 429)
// ==========================================================================
function startCooldown(button, originalHTML, seconds) {
  button.disabled = true;
  button.classList.add('btn-cooldown');
  let currentSec = seconds;
  
  const interval = setInterval(() => {
    currentSec--;
    if (currentSec <= 0) {
      clearInterval(interval);
      button.disabled = false;
      button.classList.remove('btn-cooldown');
      button.innerHTML = originalHTML;
    } else {
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="sparkles-icon spin-slow">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <span>Espera (${currentSec}s)</span>
      `;
    }
  }, 1000);
  
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="sparkles-icon spin-slow">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
    <span>Espera (${currentSec}s)</span>
  `;
}

// ==========================================================================
// SÍNTESIS DE VOZ - PRONUNCIACIÓN DE TÉRMINOS EN INGLÉS (OFFLINE TTS)
// ==========================================================================
function speakEnglishTerm(text) {
  if ('speechSynthesis' in window) {
    // Si ya hay una locución en reproducción, cancelarla de inmediato
    window.speechSynthesis.cancel();

    // Limpiar texto para evitar deletreo si tiene barras o guiones
    const cleanedText = text.replace(/[\/\-_]/g, ' ');
    
    const utterance = new SynthesisUtterance(cleanedText);
    function SynthesisUtterance(textVal) {
      return new window.SpeechSynthesisUtterance(textVal);
    }
    const finalUtterance = SynthesisUtterance(cleanedText);
    finalUtterance.lang = 'en-US'; // Pronunciación estadounidense
    finalUtterance.rate = 0.82;   // Un poco más pausado para mejor comprensión
    finalUtterance.pitch = 1.05;  // Tono de voz natural
    
    // Intentar buscar una voz en inglés del sistema operativo para máxima claridad
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(voice => 
      voice.lang.startsWith('en-US') || 
      voice.lang.startsWith('en-')
    );
    if (englishVoice) {
      finalUtterance.voice = englishVoice;
    }
    
    window.speechSynthesis.speak(finalUtterance);
    showToast(`Escuchando pronunciación en inglés de "${text}"...`, 'info');
  } else {
    showToast('Tu navegador o dispositivo no soporta síntesis de voz (Web Speech API).', 'warning');
  }
}

// Escuchar cambios sincronizados desde Supabase para actualizar la grilla en tiempo real
window.addEventListener('glossary-db-synced', () => {
  loadAndRender().catch(err => console.error('Error al recargar UI tras sincronización:', err));
});
