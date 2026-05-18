/**
 * Componentes de UI Dinámicos para el Glosario Técnico MVP
 */

/**
 * Mapea el nombre de una categoría a su clase CSS correspondiente.
 */
export function getCategoryClass(category) {
  if (!category) return 'cat-prog';
  const clean = category.toLowerCase().trim();
  
  const mapping = {
    'ia': 'cat-ia',
    'inteligencia artificial': 'cat-ia',
    'diseño web': 'cat-diseno',
    'programación': 'cat-prog',
    'programacion': 'cat-prog',
    'desarrollo de apps': 'cat-apps',
    'marketing digital': 'cat-marketing',
    'ux/ui': 'cat-uxui',
    'ux': 'cat-uxui',
    'ui': 'cat-uxui',
    'branding': 'cat-branding',
    'automatización': 'cat-auto',
    'automatizacion': 'cat-auto'
  };
  
  return mapping[clean] || 'cat-prog';
}

/**
 * Renderiza la tarjeta de un término en la grilla principal.
 */
export function renderCard(term) {
  const catClass = getCategoryClass(term.categoria);
  const isFavClass = term.favorito ? 'is-favorite' : '';
  const abbrevLabel = term.abreviatura ? `(${term.abreviatura})` : '';
  const dateFormatted = term.fecha_actualizacion || term.fecha_creacion || '2026-05-18';
  
  return `
    <article class="term-card ${catClass}" data-id="${term.id}">
      <div class="card-header">
        <span class="card-category ${catClass}">${term.categoria}</span>
        <button class="card-favorite-btn ${isFavClass}" data-id="${term.id}" aria-label="Marcar favorito" title="Alternar favorito">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499c.172-.403.743-.403.915 0l2.35 4.773 5.242.763c.44.064.618.608.301.916l-3.8 3.702.898 5.223c.075.44-.39.778-.779.57L12 17.25l-4.69 2.477c-.389.208-.853-.13-1.002-.57l.899-5.223-3.8-3.702c-.317-.308-.139-.852.302-.916l5.243-.763 2.35-4.773Z" />
          </svg>
        </button>
      </div>

      <div class="card-title-block">
        <h3 class="card-title">
          ${term.termino}
          ${term.abreviatura && term.abreviatura !== term.termino ? `<span class="card-abbrev">${abbrevLabel}</span>` : ''}
        </h3>
      </div>

      <div class="card-meaning">${term.significado_es}</div>
      <p class="card-description">${term.definicion_corta}</p>

      <div class="card-footer">
        <span class="card-date">${dateFormatted}</span>
        <div class="card-footer-stats">
          <span class="card-stat" title="Veces consultado">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.43 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            ${term.veces_consultado || 0}
          </span>
        </div>
      </div>
    </article>
  `;
}

/**
 * Renderiza el cuerpo completo del detalle de un término en el cajón lateral.
 */
export function renderDetail(term) {
  const catClass = getCategoryClass(term.categoria);
  
  // Procesar tags y relacionados
  const keywordsHtml = term.keywords && term.keywords.length > 0
    ? term.keywords.map(kw => `<span class="chip">${kw}</span>`).join('')
    : '<span class="empty-list-msg" style="padding: 0">Sin palabras clave</span>';

  const relacionadosHtml = term.relacionados && term.relacionados.length > 0
    ? term.relacionados.map(rel => `<span class="chip chip-related" data-name="${rel}">${rel}</span>`).join('')
    : '<span class="empty-list-msg" style="padding: 0">Sin términos relacionados</span>';

  const dateCreacion = term.fecha_creacion || '2026-05-18';
  const dateActualizacion = term.fecha_actualizacion || dateCreacion;

  return `
    <div class="detail-cat-row">
      <span class="category-pill ${catClass}">${term.categoria}</span>
      <div class="detail-dates-col">
        <span>Creado: ${dateCreacion}</span>
        <span>Actualizado: ${dateActualizacion}</span>
      </div>
    </div>

    <div class="detail-main-header">
      <h2 class="detail-main-title">
        ${term.termino}
        ${term.abreviatura && term.abreviatura !== term.termino ? `<span>(${term.abreviatura})</span>` : ''}
      </h2>
      <button class="pronounce-btn" data-term="${term.termino}" aria-label="Escuchar pronunciación" title="Escuchar pronunciación en inglés">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
        </svg>
      </button>
    </div>

    <!-- Significado destacado -->
    <div class="detail-meaning-card ${catClass}">
      <h4>Traducción / Significado</h4>
      <p>${term.significado_es}</p>
    </div>

    <!-- Navegación de Pestañas (Tabs) -->
    <div class="tabs-navigation">
      <button class="tab-btn active" data-tab="tab-definition">Definición</button>
      <button class="tab-btn" data-tab="tab-explanation">Explicación</button>
      <button class="tab-btn" data-tab="tab-practice">Práctica & Tags</button>
    </div>

    <!-- Contenidos de Pestañas -->
    <div class="tab-contents">
      
      <!-- Pestaña 1: Definición -->
      <div id="tab-definition" class="tab-pane active">
        <h4 class="detail-section-title">Definición General</h4>
        <p class="detail-paragraph">${term.definicion_corta}</p>
      </div>

      <!-- Pestaña 2: Explicación Ampliada -->
      <div id="tab-explanation" class="tab-pane">
        <h4 class="detail-section-title">Detalle Técnico & Funcionamiento</h4>
        <p class="detail-paragraph">
          ${term.explicacion ? term.explicacion.replace(/\n/g, '<br><br>') : 'No se ha ingresado una explicación ampliada para este concepto técnico todavía.'}
        </p>
      </div>

      <!-- Pestaña 3: Práctica & Tags -->
      <div id="tab-practice" class="tab-pane">
        <div style="display: flex; flex-direction: column; gap: 20px;">
          
          <!-- Tip Práctico -->
          ${term.tip ? `
            <div class="tip-callout">
              <div class="tip-callout-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.467 5.99 5.99 0 0 0-1.925 3.546 5.974 5.974 0 0 1-2.133-1A3.75 3.75 0 0 0 12 18Z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 0 1-.495-7.467 5.99 5.99 0 0 1 1.925 3.546 5.974 5.974 0 0 0 2.133-1A3.75 3.75 0 0 1 12 18Z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 0 0-.495-7.467 5.99 5.99 0 0 0-1.925 3.546 5.974 5.974 0 0 1-2.133-1A3.75 3.75 0 0 0 12 18Z" />
                </svg>
              </div>
              <div class="tip-callout-content">
                <h4>Consejo Práctico / Tip</h4>
                <p>${term.tip}</p>
              </div>
            </div>
          ` : ''}

          <!-- Palabras Clave -->
          <div>
            <h4 class="detail-section-title">Palabras Clave (Keywords)</h4>
            <div class="chips-list">
              ${keywordsHtml}
            </div>
          </div>

          <!-- Relacionados -->
          <div>
            <h4 class="detail-section-title">Conceptos Relacionados</h4>
            <div class="chips-list">
              ${relacionadosHtml}
            </div>
          </div>

        </div>
      </div>

    </div>
  `;
}

/**
 * Renderiza un elemento simple de la barra lateral (Favoritos o Recientes).
 */
export function renderSidebarItem(term) {
  const abbrev = term.abreviatura ? ` (${term.abreviatura})` : '';
  const star = term.favorito 
    ? `<svg xmlns="http://www.w3.org/2000/svg" class="star-indicator" fill="currentColor" viewBox="0 0 24 24">
        <path d="M11.48 3.499c.172-.403.743-.403.915 0l2.35 4.773 5.242.763c.44.064.618.608.301.916l-3.8 3.702.898 5.223c.075.44-.39.778-.779.57L12 17.25l-4.69 2.477c-.389.208-.853-.13-1.002-.57l.899-5.223-3.8-3.702c-.317-.308-.139-.852.302-.916l5.243-.763 2.35-4.773Z" />
       </svg>`
    : '';

  return `
    <li data-id="${term.id}">
      <span class="term-link-name">${term.termino}<span class="term-link-abbrev">${abbrev}</span></span>
      ${star}
    </li>
  `;
}

/**
 * Renderiza una pequeña tarjeta en la sección inferior de Novedades.
 */
export function renderNovedadCard(term) {
  const catClass = getCategoryClass(term.categoria);
  const dateFormatted = term.fecha_actualizacion || term.fecha_creacion || '2026-05-18';
  
  return `
    <div class="novedad-card" data-id="${term.id}">
      <div class="novedad-header">
        <span class="novedad-tag ${catClass}">${term.categoria}</span>
        <span class="novedad-date">${dateFormatted}</span>
      </div>
      <h3 class="novedad-title">${term.termino}</h3>
      <p class="novedad-desc">${term.definicion_corta}</p>
    </div>
  `;
}
