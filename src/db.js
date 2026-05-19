import { createClient } from '@supabase/supabase-js';

// Configuración de conexión con Supabase Cloud (Glosario-MVP)
const SUPABASE_URL = 'https://zxpcnixarfpnkxrfjbxv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4cGNuaXhhcmZwbmt4cmZqYnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjUzMzIsImV4cCI6MjA5NDcwMTMzMn0.Ih6oX-05xnUqVnlNgpnb4ehiB66jFr7HVYzLkrYSs2A';

class GlossaryDatabase {
  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Carga inicial desde caché persistente en localStorage para arranque instantáneo (Offline-First)
    this.cachedTerms = [];
    try {
      const savedCache = localStorage.getItem('glossary_terms_cache');
      if (savedCache) {
        this.cachedTerms = JSON.parse(savedCache);
      }
    } catch (e) {
      console.error('Error al inicializar la caché de términos de localStorage:', e);
    }
  }

  /**
   * Envoltura defensiva para evitar consultas colgadas por problemas de red/GoTrue en Supabase.
   */
  async withTimeout(promise, timeoutMs = 3500, errorMsg = 'Tiempo de espera de conexión agotado') {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Inicializa la conexión con Supabase.
   */
  async init() {
    this.updateSyncUI('connected', 'Sincronizado');
    return this.supabase;
  }

  /**
   * Actualiza dinámicamente el distintivo de estado de la sincronización en la barra superior.
   */
  updateSyncUI(status, label) {
    setTimeout(() => {
      const badge = document.getElementById('cloud-sync-badge');
      if (!badge) return;

      badge.className = `badge-sync ${status}`;
      
      let iconColor = 'currentColor';
      if (status === 'connected') iconColor = 'var(--success)';
      else if (status === 'syncing') iconColor = 'var(--warning)';
      else iconColor = 'var(--text-muted)';

      badge.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="${iconColor}" style="width: 11px; height: 11px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
        </svg>
        <span>${label}</span>
      `;
    }, 150);
  }

  /**
   * Obtiene todos los términos del glosario desde Supabase en tiempo real.
   */
  async getAll() {
    try {
      this.updateSyncUI('syncing', 'Sincronizando...');
      
      const queryPromise = this.supabase
        .from('terms')
        .select('*')
        .order('fecha_actualizacion', { ascending: false });

      const { data, error } = await this.withTimeout(queryPromise, 3500, 'Supabase no responde (Timeout)');

      if (error) throw error;

      this.cachedTerms = data || [];
      
      // Guardar en caché persistente local
      try {
        localStorage.setItem('glossary_terms_cache', JSON.stringify(this.cachedTerms));
      } catch (errCache) {
        console.error('Error al guardar caché en localStorage:', errCache);
      }

      this.updateSyncUI('connected', 'Sincronizado');
      return this.cachedTerms;
    } catch (err) {
      console.warn('Error al obtener términos de Supabase (usando caché local):', err);
      this.updateSyncUI('offline', 'Modo Local');
      return this.cachedTerms;
    }
  }

  /**
   * Obtiene un término por su ID único.
   */
  async get(id) {
    try {
      const getPromise = this.supabase
        .from('terms')
        .select('*')
        .eq('id', id)
        .single();

      const { data, error } = await this.withTimeout(getPromise, 2500, 'Supabase no responde (Timeout)');

      if (error) throw error;
      return data;
    } catch (err) {
      console.error(`Error obteniendo término con id ${id}:`, err);
      // Fallback instantáneo a la caché local persistida
      return this.cachedTerms.find(t => t.id === id) || null;
    }
  }

  /**
   * Guarda o actualiza un término en Supabase.
   */
  async save(term) {
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: { user } } = await this.supabase.auth.getUser();

    if (!term.id) {
      term.id = 'term-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
      term.fecha_creacion = todayStr;
      term.fecha_actualizacion = todayStr;
      term.veces_consultado = 0;
      term.origen = term.origen || 'desktop';
      term.estado = 'activo';
      term.user_id = user ? user.id : null;
    } else {
      term.fecha_actualizacion = todayStr;
      // Mantener el user_id original
      if (term.user_id === undefined && user) {
        term.user_id = user.id;
      }
    }

    // Asegurar arrays limpios
    if (typeof term.keywords === 'string') {
      term.keywords = term.keywords.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    }
    if (typeof term.relacionados === 'string') {
      term.relacionados = term.relacionados.split(',').map(s => s.trim()).filter(Boolean);
    }

    const prepared = this._prepareForSupabase(term);

    this.updateSyncUI('syncing', 'Guardando...');
    
    const upsertPromise = this.supabase
      .from('terms')
      .upsert(prepared);

    try {
      const { error } = await this.withTimeout(upsertPromise, 3500, 'Tiempo de espera de guardado agotado');
      if (error) throw error;
      this.updateSyncUI('connected', 'Sincronizado');
    } catch (err) {
      console.warn('Error al guardar en Supabase, guardando localmente en caché:', err);
      this.updateSyncUI('offline', 'Modo Local');
    }

    // Actualizar caché de inmediato
    const idx = this.cachedTerms.findIndex(t => t.id === term.id);
    if (idx >= 0) {
      this.cachedTerms[idx] = prepared;
    } else {
      this.cachedTerms.unshift(prepared);
    }

    // Persistir caché
    try {
      localStorage.setItem('glossary_terms_cache', JSON.stringify(this.cachedTerms));
    } catch (errCache) {
      console.error('Error al persistir caché:', errCache);
    }

    return prepared;
  }

  /**
   * Elimina un término por su ID de Supabase.
   */
  async delete(id) {
    this.updateSyncUI('syncing', 'Eliminando...');
    
    const deletePromise = this.supabase
      .from('terms')
      .delete()
      .eq('id', id);

    try {
      const { error } = await this.withTimeout(deletePromise, 3500, 'Tiempo de espera de borrado agotado');
      if (error) throw error;
      this.updateSyncUI('connected', 'Sincronizado');
    } catch (err) {
      console.warn('Error al borrar en Supabase, removiendo de caché local:', err);
      this.updateSyncUI('offline', 'Modo Local');
    }

    this.cachedTerms = this.cachedTerms.filter(t => t.id !== id);
    try {
      localStorage.setItem('glossary_terms_cache', JSON.stringify(this.cachedTerms));
    } catch (errCache) {
      console.error('Error al persistir caché tras borrado:', errCache);
    }
    return true;
  }

  /**
   * Incrementa el contador de visitas en Supabase.
   */
  async incrementViews(id) {
    const term = await this.get(id);
    if (term) {
      term.veces_consultado = (term.veces_consultado || 0) + 1;
      
      const updatePromise = this.supabase
        .from('terms')
        .update({ veces_consultado: term.veces_consultado })
        .eq('id', id);

      try {
        const { error } = await this.withTimeout(updatePromise, 2500, 'Timeout al actualizar visitas');
        if (error) throw error;
      } catch (err) {
        console.warn('Error actualizando contador en Supabase, registrando localmente:', err);
      }

      const idx = this.cachedTerms.findIndex(t => t.id === id);
      if (idx >= 0) {
        this.cachedTerms[idx].veces_consultado = term.veces_consultado;
        try {
          localStorage.setItem('glossary_terms_cache', JSON.stringify(this.cachedTerms));
        } catch (e) {}
      }
    }
    return term;
  }

  /**
   * Convierte objetos en la estructura exacta para Supabase.
   */
  _prepareForSupabase(term) {
    return {
      id: term.id,
      termino: term.termino,
      abreviatura: term.abreviatura || '',
      significado_es: term.significado_es,
      definicion_corta: term.definicion_corta,
      explicacion: term.explicacion || '',
      tip: term.tip || '',
      categoria: term.categoria,
      favorito: !!term.favorito,
      fecha_creacion: term.fecha_creacion,
      fecha_actualizacion: term.fecha_actualizacion,
      veces_consultado: parseInt(term.veces_consultado || 0, 10),
      origen: term.origen || 'desktop',
      estado: term.estado || 'activo',
      keywords: Array.isArray(term.keywords) ? term.keywords : [],
      relacionados: Array.isArray(term.relacionados) ? term.relacionados : [],
      user_id: term.user_id || null
    };
  }

  /**
   * Búsqueda flexible de términos por palabra clave (Caché en memoria súper rápido).
   */
  async search(query) {
    const terms = await this.getAll();
    if (!query || query.trim() === '') return terms;

    const cleanQuery = query.trim().toLowerCase();
    
    return terms.filter(term => {
      const nameMatch = term.termino?.toLowerCase().includes(cleanQuery);
      const abbrevMatch = term.abreviatura?.toLowerCase().includes(cleanQuery);
      const signMatch = term.significado_es?.toLowerCase().includes(cleanQuery);
      const descMatch = term.definicion_corta?.toLowerCase().includes(cleanQuery);
      
      const keywordsMatch = term.keywords?.some(k => k.toLowerCase().includes(cleanQuery));
      const relatedMatch = term.relacionados?.some(r => r.toLowerCase().includes(cleanQuery));

      return nameMatch || abbrevMatch || signMatch || descMatch || keywordsMatch || relatedMatch;
    });
  }

  /**
   * Obtiene favoritos.
   */
  async getFavorites() {
    const terms = await this.getAll();
    return terms.filter(term => term.favorito === true);
  }

  /**
   * Novedades ordenadas por fecha.
   */
  async getUpdates(limit = 5) {
    const terms = await this.getAll();
    return terms
      .sort((a, b) => new Date(b.fecha_actualizacion) - new Date(a.fecha_actualizacion))
      .slice(0, limit);
  }

  /**
   * Términos populares.
   */
  async getPopular(limit = 5) {
    const terms = await this.getAll();
    return terms
      .sort((a, b) => (b.veces_consultado || 0) - (a.veces_consultado || 0))
      .slice(0, limit);
  }
}

export const db = new GlossaryDatabase();
export default db;
