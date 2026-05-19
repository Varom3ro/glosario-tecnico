import './mobile.css';
import { createClient } from '@supabase/supabase-js';

// ===== CONFIG =====
const SUPABASE_URL = 'https://zxpcnixarfpnkxrfjbxv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4cGNuaXhhcmZwbmt4cmZqYnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjUzMzIsImV4cCI6MjA5NDcwMTMzMn0.Ih6oX-05xnUqVnlNgpnb4ehiB66jFr7HVYzLkrYSs2A';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const PROXY_URL = `${SUPABASE_URL}/functions/v1/gemini-proxy`;

// Extrae dinámicamente las categorías únicas de los términos cargados en Supabase
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

// ===== STATE =====
const state = { query: '', category: null, terms: [], selectedTerm: null, isLogin: true };

// ===== HELPERS =====
function $(id) { return document.getElementById(id); }
function getCatClass(cat) {
  if (!cat) return 'm-cat-prog';
  const m = { 'ia':'m-cat-ia','diseño web':'m-cat-diseno','programación':'m-cat-prog','desarrollo de apps':'m-cat-apps','marketing digital':'m-cat-marketing','ux/ui':'m-cat-uxui','branding':'m-cat-branding','automatización':'m-cat-auto' };
  return m[cat.toLowerCase().trim()] || 'm-cat-prog';
}
function showToast(msg, type='success') {
  const c = $('m-toast-container'); if (!c) return;
  const t = document.createElement('div');
  t.className = `m-toast ${type}`; t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ===== AUTH =====
async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) { showApp(session); return; }
  $('auth-screen').classList.remove('hide');
  $('main-screen').classList.add('hide');
}

function showApp(session) {
  $('auth-screen').classList.add('hide');
  $('main-screen').classList.remove('hide');
  loadTerms();
}

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const btn = $('btn-auth-submit');
  const errDiv = $('auth-error');
  btn.disabled = true; btn.innerHTML = '<span>Procesando...</span>'; errDiv.classList.add('hide');

  try {
    let result;
    if (state.isLogin) {
      result = await supabase.auth.signInWithPassword({ email, password });
    } else {
      result = await supabase.auth.signUp({ email, password });
    }
    if (result.error) throw result.error;

    if (!state.isLogin && result.data?.user && !result.data.session) {
      showToast('¡Cuenta creada! Revisa tu correo para confirmar.', 'success');
      errDiv.textContent = 'Revisa tu bandeja de entrada para confirmar tu correo.';
      errDiv.classList.remove('hide'); errDiv.style.borderColor = 'rgba(16,185,129,0.3)'; errDiv.style.color = 'var(--success)'; errDiv.style.background = 'rgba(16,185,129,0.1)';
    } else if (result.data.session) {
      showApp(result.data.session);
    }
  } catch (err) {
    errDiv.textContent = err.message || 'Error de autenticación.';
    errDiv.classList.remove('hide'); errDiv.style.borderColor=''; errDiv.style.color=''; errDiv.style.background='';
  } finally {
    btn.disabled = false; btn.innerHTML = `<span>${state.isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}</span>`;
  }
});

$('btn-auth-toggle').addEventListener('click', () => {
  state.isLogin = !state.isLogin;
  $('btn-auth-submit').innerHTML = `<span>${state.isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}</span>`;
  $('btn-auth-toggle').innerHTML = state.isLogin ? '¿No tienes cuenta? <strong>Regístrate</strong>' : '¿Ya tienes cuenta? <strong>Inicia Sesión</strong>';
  $('auth-error').classList.add('hide');
});

$('btn-m-logout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  $('auth-screen').classList.remove('hide');
  $('main-screen').classList.add('hide');
  state.terms = [];
});

// ===== DATA LOADING =====
async function loadTerms() {
  const { data, error } = await supabase.from('terms').select('*').order('fecha_actualizacion', { ascending: false });
  if (error) { showToast('Error cargando términos: ' + error.message, 'danger'); return; }
  state.terms = data || [];
  renderCategories();
  renderList();
}

function getFilteredTerms() {
  let t = state.terms;
  if (state.query) {
    const q = state.query.toLowerCase();
    t = t.filter(x => x.termino?.toLowerCase().includes(q) || x.abreviatura?.toLowerCase().includes(q) || x.significado_es?.toLowerCase().includes(q) || x.definicion_corta?.toLowerCase().includes(q) || (x.keywords || []).some(k => k.toLowerCase().includes(q)));
  }
  if (state.category) t = t.filter(x => x.categoria?.toLowerCase() === state.category.toLowerCase());
  return t;
}

// ===== RENDERING =====
function renderCategories() {
  const el = $('m-categories-list');
  const dynamicCats = getDynamicCategories(state.terms);

  // Rellenar datalist del formulario móvil para autocompletado flexible
  const datalist = $('m-categories-datalist');
  if (datalist) {
    datalist.innerHTML = dynamicCats.map(c => `<option value="${c}"></option>`).join('');
  }

  el.innerHTML = dynamicCats.map(c => {
    const count = state.terms.filter(t => t.categoria?.toLowerCase().trim() === c.toLowerCase().trim()).length;
    const active = state.category?.toLowerCase().trim() === c.toLowerCase().trim() ? 'active' : '';
    return `<button class="m-cat-pill ${active}" data-cat="${c}">${c} (${count})</button>`;
  }).join('');
}

function renderList() {
  const terms = getFilteredTerms();
  const list = $('m-terms-list');
  const empty = $('m-empty-state');
  const info = $('m-results-info');
  info.textContent = state.category ? `${terms.length} en "${state.category}"` : state.query ? `${terms.length} resultados` : `${terms.length} términos`;

  if (terms.length === 0) { list.innerHTML = ''; empty.classList.remove('hide'); return; }
  empty.classList.add('hide');
  list.innerHTML = terms.map(t => {
    const cc = getCatClass(t.categoria);
    return `<div class="m-term-card" data-id="${t.id}">
      <div class="m-card-top"><span class="m-card-cat ${cc}">${t.categoria}</span>${t.favorito ? '<span class="m-card-fav"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11.48 3.499c.172-.403.743-.403.915 0l2.35 4.773 5.242.763c.44.064.618.608.301.916l-3.8 3.702.898 5.223c.075.44-.39.778-.779.57L12 17.25l-4.69 2.477c-.389.208-.853-.13-1.002-.57l.899-5.223-3.8-3.702c-.317-.308-.139-.852.302-.916l5.243-.763 2.35-4.773Z"/></svg></span>' : ''}</div>
      <h3 class="m-card-title">${t.termino}${t.abreviatura && t.abreviatura !== t.termino ? ` <small style="font-weight:400;color:var(--text-muted)">(${t.abreviatura})</small>` : ''}</h3>
      <div class="m-card-meaning">${t.significado_es}</div>
      <p class="m-card-desc">${t.definicion_corta}</p>
    </div>`;
  }).join('');
}

// ===== SEARCH =====
$('m-input-search').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });

// ===== CATEGORIES =====
$('m-categories-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.m-cat-pill');
  if (!btn) return;
  const cat = btn.dataset.cat;
  state.category = state.category === cat ? null : cat;
  renderCategories(); renderList();
});

// ===== TERM DETAIL =====
$('m-terms-list').addEventListener('click', (e) => {
  const card = e.target.closest('.m-term-card');
  if (!card) return;
  const term = state.terms.find(t => t.id === card.dataset.id);
  if (!term) return;
  state.selectedTerm = term;
  openDetail(term);
});

async function openDetail(term) {
  const cc = getCatClass(term.categoria);
  const kwHtml = (term.keywords||[]).map(k => `<span class="m-chip">${k}</span>`).join('') || '<span style="color:var(--text-muted);font-size:0.8rem">Sin keywords</span>';
  $('m-detail-body').innerHTML = `
    <span class="m-detail-category ${cc}">${term.categoria}</span>
    <h2 class="m-detail-term-name">${term.termino}</h2>
    <div class="m-detail-meaning">${term.significado_es}</div>
    <div class="m-detail-section"><h4>Definición</h4><p>${term.definicion_corta}</p></div>
    ${term.explicacion ? `<div class="m-detail-section"><h4>Explicación Técnica</h4><p>${term.explicacion}</p></div>` : ''}
    ${term.tip ? `<div class="m-detail-tip"><p>💡 ${term.tip}</p></div>` : ''}
    <div class="m-detail-section"><h4>Keywords</h4><div class="m-detail-chips">${kwHtml}</div></div>`;
  $('btn-m-detail-fav').style.color = term.favorito ? 'var(--warning)' : 'var(--text-secondary)';
  
  // Show/hide delete and edit based on ownership
  const { data: { user } } = await supabase.auth.getUser();
  const isOwner = user && term.user_id === user.id;
  $('btn-m-detail-delete').style.display = isOwner ? '' : 'none';
  $('btn-m-detail-edit').style.display = isOwner ? '' : 'none';
  $('m-detail-modal').classList.remove('hide');
}

$('btn-m-detail-back').addEventListener('click', () => { $('m-detail-modal').classList.add('hide'); });

$('btn-m-detail-fav').addEventListener('click', async () => {
  if (!state.selectedTerm) return;
  const newFav = !state.selectedTerm.favorito;
  const { error } = await supabase.from('terms').update({ favorito: newFav }).eq('id', state.selectedTerm.id);
  if (error) { showToast('Error al actualizar favorito', 'danger'); return; }
  state.selectedTerm.favorito = newFav;
  $('btn-m-detail-fav').style.color = newFav ? 'var(--warning)' : 'var(--text-secondary)';
  const idx = state.terms.findIndex(t => t.id === state.selectedTerm.id);
  if (idx >= 0) state.terms[idx].favorito = newFav;
  renderList();
  showToast(newFav ? '⭐ Añadido a favoritos' : 'Eliminado de favoritos');
});

$('btn-m-detail-edit').addEventListener('click', () => {
  if (!state.selectedTerm) return;
  const term = state.selectedTerm;
  $('m-form-id').value = term.id;
  $('m-form-termino').value = term.termino;
  $('m-form-abreviatura').value = term.abreviatura || '';
  $('m-form-categoria').value = term.categoria;
  $('m-form-significado').value = term.significado_es;
  $('m-form-definicion').value = term.definicion_corta;
  $('m-form-explicacion').value = term.explicacion || '';
  $('m-form-tip').value = term.tip || '';
  $('m-form-keywords').value = term.keywords ? term.keywords.join(', ') : '';

  $('m-create-title').textContent = 'Editar Término';
  $('m-detail-modal').classList.add('hide');
  $('m-create-modal').classList.remove('hide');
});

$('btn-m-detail-delete').addEventListener('click', async () => {
  if (!state.selectedTerm || !confirm('¿Eliminar este término permanentemente?')) return;
  const { error } = await supabase.from('terms').delete().eq('id', state.selectedTerm.id);
  if (error) { showToast('Error al eliminar: ' + error.message, 'danger'); return; }
  state.terms = state.terms.filter(t => t.id !== state.selectedTerm.id);
  $('m-detail-modal').classList.add('hide');
  renderList(); showToast('Término eliminado');
});

// ===== CREATE TERM =====
$('fab-create').addEventListener('click', () => {
  $('m-form-id').value = '';
  $('m-term-form').reset();
  $('m-create-title').textContent = 'Crear Término';
  $('m-create-modal').classList.remove('hide');
});

$('btn-m-create-back').addEventListener('click', () => { $('m-create-modal').classList.add('hide'); });

$('btn-m-save').addEventListener('click', async () => {
  const termino = $('m-form-termino').value.trim();
  const significado = $('m-form-significado').value.trim();
  const definicion = $('m-form-definicion').value.trim();
  const categoria = $('m-form-categoria').value;
  if (!termino || !significado || !definicion || !categoria) { showToast('Completa los campos obligatorios (*)', 'danger'); return; }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { showToast('Sesión expirada. Inicia sesión de nuevo.', 'danger'); return; }

  const todayStr = new Date().toISOString().split('T')[0];
  const isEditing = !!$('m-form-id').value;
  const existingTerm = isEditing ? state.terms.find(t => t.id === $('m-form-id').value) : null;

  const id = $('m-form-id').value || ('term-' + Date.now() + '-' + Math.random().toString(36).substr(2,5));
  const kw = $('m-form-keywords').value.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);

  const term = {
    id, termino, categoria, user_id: user.id,
    abreviatura: $('m-form-abreviatura').value.trim(),
    significado_es: significado, definicion_corta: definicion,
    explicacion: $('m-form-explicacion').value.trim(),
    tip: $('m-form-tip').value.trim(),
    keywords: kw, 
    relacionados: existingTerm ? (existingTerm.relacionados || []) : [],
    favorito: existingTerm ? (existingTerm.favorito || false) : false, 
    fecha_creacion: existingTerm ? existingTerm.fecha_creacion : todayStr, 
    fecha_actualizacion: todayStr,
    veces_consultado: existingTerm ? (existingTerm.veces_consultado || 0) : 0, 
    origen: existingTerm ? (existingTerm.origen || 'mobile') : 'mobile', 
    estado: existingTerm ? (existingTerm.estado || 'activo') : 'activo'
  };

  const { error } = await supabase.from('terms').upsert(term);
  if (error) { showToast('Error al guardar: ' + error.message, 'danger'); return; }

  $('m-create-modal').classList.add('hide');
  
  // Limpiar buscador principal para reflejar de inmediato el nuevo término
  state.query = '';
  const searchInput = $('m-input-search');
  if (searchInput) searchInput.value = '';

  showToast('✅ Término guardado en la nube');
  await loadTerms();
});

// ===== IA AUTOFILL (via proxy) =====
// ===== IA AUTOFILL (via proxy) =====
const btnAutofill = $('btn-m-autofill');
if (btnAutofill) {
  btnAutofill.addEventListener('click', async () => {
    const termino = $('m-form-termino').value.trim();
    if (!termino) { showToast('Escribe un término primero', 'danger'); return; }
    btnAutofill.disabled = true;
    btnAutofill.classList.add('loading');
    showToast('Generando con IA...', 'success');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showToast('Sesión expirada', 'danger'); return; }

      const prompt = `Genera una ficha técnica profesional en español para "${termino}". Devuelve JSON con: categoria (uno de: "IA","Diseño web","Programación","Desarrollo de apps","Marketing digital","UX/UI","Branding","Automatización"), abreviatura, significado_es, definicion_corta (max 150 chars), explicacion, tip, keywords (string separado por comas).`;

      const schema = { type:"object", properties:{ categoria:{type:"string",enum:["IA","Diseño web","Programación","Desarrollo de apps","Marketing digital","UX/UI","Branding","Automatización"]}, abreviatura:{type:"string"}, significado_es:{type:"string"}, definicion_corta:{type:"string"}, explicacion:{type:"string"}, tip:{type:"string"}, keywords:{type:"string"} }, required:["categoria","significado_es","definicion_corta","explicacion","tip","keywords"] };

      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ prompt, model: 'gemini-3-flash-preview', type: 'autofill', schema })
      });

      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || `Error ${res.status}`); }
      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) throw new Error('Respuesta vacía de la IA');
      const parsed = JSON.parse(raw.trim());

      if (parsed.categoria) $('m-form-categoria').value = parsed.categoria;
      if (parsed.abreviatura) $('m-form-abreviatura').value = parsed.abreviatura;
      if (parsed.significado_es) $('m-form-significado').value = parsed.significado_es;
      if (parsed.definicion_corta) $('m-form-definicion').value = parsed.definicion_corta;
      if (parsed.explicacion) $('m-form-explicacion').value = parsed.explicacion;
      if (parsed.tip) $('m-form-tip').value = parsed.tip;
      if (parsed.keywords) $('m-form-keywords').value = parsed.keywords;
      showToast('✨ Autocompletado con IA', 'success');
    } catch (err) {
      showToast('Error IA: ' + err.message, 'danger');
    } finally {
      btnAutofill.disabled = false;
      btnAutofill.classList.remove('loading');
    }
  });
}

// ===== IA DEEPDIVE =====
const btnMIAExpand = $('btn-m-ia-expand');
if (btnMIAExpand) {
  btnMIAExpand.addEventListener('click', async () => {
    if (!state.selectedTerm) return;
    const term = state.selectedTerm;
    showToast('Generando guía con IA...', 'success');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showToast('Sesión expirada', 'danger'); return; }

      const prompt = `Genera una guía de estudio en HTML para "${term.termino}" (${term.categoria}). Incluye: caso de uso real (<h3>), código práctico (<pre><code>), y buenas prácticas (<ul><li>). En español, HTML puro.`;

      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ prompt, model: 'gemini-3-flash-preview', type: 'deepdive' })
      });

      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || `Error ${res.status}`); }
      const data = await res.json();
      const html = data.candidates?.[0]?.content?.parts?.[0]?.text || '<p>No se pudo generar contenido.</p>';
      $('m-ia-content').innerHTML = html;
      $('m-ia-modal').classList.remove('hide');
    } catch (err) {
      showToast('Error IA: ' + err.message, 'danger');
    }
  });
}

const btnMIABack = $('btn-m-ia-back');
if (btnMIABack) btnMIABack.addEventListener('click', () => { $('m-ia-modal').classList.add('hide'); });

// ===== BOTTOM NAV =====
document.querySelectorAll('.m-nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.m-nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    if (tab === 'home') { state.category = null; state.query = ''; $('m-input-search').value = ''; renderCategories(); renderList(); }
    else if (tab === 'favorites') { state.category = null; state.query = ''; const favs = state.terms.filter(t=>t.favorito); $('m-results-info').textContent = `${favs.length} favoritos`; $('m-terms-list').innerHTML = favs.length ? favs.map(t => renderCardHTML(t)).join('') : ''; $('m-empty-state').classList.toggle('hide', favs.length > 0); }
    else if (tab === 'categories') { state.query = ''; $('m-input-search').value = ''; renderCategories(); renderList(); }
    else if (tab === 'profile') { showToast(`Sesión: ${supabase.auth.getUser().then(r => r.data?.user?.email || 'desconocido')}`); }
  });
});

function renderCardHTML(t) {
  const cc = getCatClass(t.categoria);
  return `<div class="m-term-card" data-id="${t.id}"><div class="m-card-top"><span class="m-card-cat ${cc}">${t.categoria}</span>${t.favorito?'<span class="m-card-fav"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><path d="M11.48 3.499c.172-.403.743-.403.915 0l2.35 4.773 5.242.763c.44.064.618.608.301.916l-3.8 3.702.898 5.223c.075.44-.39.778-.779.57L12 17.25l-4.69 2.477c-.389.208-.853-.13-1.002-.57l.899-5.223-3.8-3.702c-.317-.308-.139-.852.302-.916l5.243-.763 2.35-4.773Z"/></svg></span>':''}</div><h3 class="m-card-title">${t.termino}</h3><div class="m-card-meaning">${t.significado_es}</div><p class="m-card-desc">${t.definicion_corta}</p></div>`;
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // Register Service Worker for PWA install
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
  initAuth();
});
