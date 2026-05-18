import { createClient } from '@supabase/supabase-js';
import { seedTerms } from './seed.js';

// Configuración de conexión con Supabase Cloud (Glosario-MVP)
const SUPABASE_URL = localStorage.getItem('settings-supabase-url') || 'https://zxpcnixarfpnkxrfjbxv.supabase.co';
const SUPABASE_KEY = localStorage.getItem('settings-supabase-key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4cGNuaXhhcmZwbmt4cmZqYnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjUzMzIsImV4cCI6MjA5NDcwMTMzMn0.Ih6oX-05xnUqVnlNgpnb4ehiB66jFr7HVYzLkrYSs2A';

class GlossaryDatabase {
  constructor() {
    this.dbName = 'glossary_db';
    this.dbVersion = 1;
    this.storeName = 'terms';
    this.db = null;
    
    // Inicializar cliente Supabase si las credenciales existen
    try {
      this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      console.warn('No se pudo inicializar el cliente de Supabase:', e);
      this.supabase = null;
    }
  }

  /**
   * Inicializa la base de datos local (IndexedDB) y sincroniza bidireccionalmente con la nube.
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('Error al abrir IndexedDB:', event.target.error);
        this.updateSyncUI('offline', 'Error Local');
        reject(event.target.error);
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        
        // 1. Verificar datos semilla
        await this._checkAndSeed();
        
        // 2. Iniciar sincronización bidireccional asíncrona con Supabase
        this.syncWithCloud().catch(err => {
          console.warn('Fallo la sincronización inicial con Supabase:', err);
          this.updateSyncUI('offline', 'Modo Local');
        });

        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          
          store.createIndex('termino', 'termino', { unique: false });
          store.createIndex('abreviatura', 'abreviatura', { unique: false });
          store.createIndex('categoria', 'categoria', { unique: false });
          store.createIndex('favorito', 'favorito', { unique: false });
          store.createIndex('fecha_actualizacion', 'fecha_actualizacion', { unique: false });
          store.createIndex('keywords', 'keywords', { unique: false, multiEntry: true });
        }
      };
    });
  }

  /**
   * Actualiza dinámicamente el distintivo de estado de la sincronización en la barra superior.
   */
  updateSyncUI(status, label) {
    // Ejecutar con retraso seguro por si el DOM no está cargado al inicio
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
   * Sincronización en la nube bidireccional y robusta sin bloquear la interfaz.
   */
  async syncWithCloud() {
    if (!this.supabase) {
      this.updateSyncUI('offline', 'Modo Local');
      return;
    }

    this.updateSyncUI('syncing', 'Sincronizando...');

    try {
      // 1. Obtener términos de IndexedDB
      const localTerms = await this.getAll();
      
      // 2. Obtener términos de Supabase Cloud
      const { data: remoteTerms, error } = await this.supabase
        .from('terms')
        .select('*');

      if (error) throw error;

      const localTermsMap = new Map(localTerms.map(t => [t.id, t]));
      const remoteTermsMap = new Map(remoteTerms.map(t => [t.id, t]));

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      let localUpdates = 0;
      let cloudUpdates = 0;

      // A. Procesar datos del Cloud -> Local
      for (const remote of remoteTerms) {
        const local = localTermsMap.get(remote.id);
        if (!local) {
          // No existe localmente, guardarlo
          store.put(this._sanitizeFromSupabase(remote));
          localUpdates++;
        } else {
          // Existe en ambos, comparar fechas de modificación
          const localDate = new Date(local.fecha_actualizacion || 0);
          const remoteDate = new Date(remote.fecha_actualizacion || 0);

          if (remoteDate > localDate) {
            // El de la nube es más reciente
            store.put(this._sanitizeFromSupabase(remote));
            localUpdates++;
          }
        }
      }

      // B. Procesar datos del Local -> Cloud
      for (const local of localTerms) {
        const remote = remoteTermsMap.get(local.id);
        if (!remote) {
          // Término local nuevo no subido a la nube
          const { error: insertErr } = await this.supabase
            .from('terms')
            .insert(this._prepareForSupabase(local));
          
          if (insertErr) console.error('Error insertando en Supabase:', insertErr);
          else cloudUpdates++;
        } else {
          const localDate = new Date(local.fecha_actualizacion || 0);
          const remoteDate = new Date(remote.fecha_actualizacion || 0);

          if (localDate > remoteDate) {
            // El local es más reciente
            const { error: updateErr } = await this.supabase
              .from('terms')
              .update(this._prepareForSupabase(local))
              .eq('id', local.id);

            if (updateErr) console.error('Error actualizando en Supabase:', updateErr);
            else cloudUpdates++;
          }
        }
      }

      await new Promise((resolve) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve(); // Continuar silenciosamente
      });

      this.updateSyncUI('connected', 'Sincronizado');
      if (localUpdates > 0 || cloudUpdates > 0) {
        console.log(`Sync Supabase: ${localUpdates} actualizados local, ${cloudUpdates} subidos a nube.`);
        // Disparar evento para recargar la grilla si hay cambios
        window.dispatchEvent(new CustomEvent('glossary-db-synced'));
      }
    } catch (err) {
      console.warn('Error durante la sincronización bidireccional:', err);
      this.updateSyncUI('offline', 'Modo Local');
    }
  }

  /**
   * Comprueba si la base de datos está vacía y, de ser así, carga los datos semilla.
   */
  async _checkAndSeed() {
    const terms = await this.getAll();
    if (terms.length === 0) {
      console.log('IndexedDB vacía. Precargando 18 términos semilla...');
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      for (const term of seedTerms) {
        store.put(term);
      }

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
          console.log('Términos semilla precargados exitosamente.');
          resolve();
        };
        transaction.onerror = (event) => {
          console.error('Error al precargar términos semilla:', event.target.error);
          reject(event.target.error);
        };
      });
    }
  }

  /**
   * Obtiene todos los términos del glosario desde la caché local (IndexedDB) instantáneamente.
   */
  async getAll() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  /**
   * Obtiene un término por su ID único.
   */
  async get(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  /**
   * Guarda o actualiza un término de forma local y lo sincroniza asíncronamente con Supabase.
   */
  async save(term) {
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (!term.id) {
      term.id = 'term-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
      term.fecha_creacion = todayStr;
      term.fecha_actualizacion = todayStr;
      term.veces_consultado = 0;
      term.origen = term.origen || 'manual';
      term.estado = 'activo';
    } else {
      term.fecha_actualizacion = todayStr;
    }

    // Asegurar arrays limpios para guardar en Local/Nube
    if (typeof term.keywords === 'string') {
      term.keywords = term.keywords.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    }
    if (typeof term.relacionados === 'string') {
      term.relacionados = term.relacionados.split(',').map(s => s.trim()).filter(Boolean);
    }

    // A. Guardar primero en IndexedDB de forma inmediata
    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(term);

      request.onsuccess = () => resolve(term);
      request.onerror = (event) => reject(event.target.error);
    });

    // B. Subir a Supabase Cloud en segundo plano sin interrumpir al usuario
    if (this.supabase) {
      this.supabase.from('terms')
        .upsert(this._prepareForSupabase(term))
        .then(({ error }) => {
          if (error) {
            console.error('Error de guardado en la nube:', error);
            this.updateSyncUI('offline', 'Modo Local');
          } else {
            this.updateSyncUI('connected', 'Sincronizado');
          }
        });
    }

    return term;
  }

  /**
   * Elimina un término por su ID de IndexedDB y Supabase en segundo plano.
   */
  async delete(id) {
    // A. Eliminar de IndexedDB localmente de forma inmediata
    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = (event) => reject(event.target.error);
    });

    // B. Eliminar de la nube en segundo plano
    if (this.supabase) {
      this.supabase.from('terms')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            console.error('Error de borrado en la nube:', error);
            this.updateSyncUI('offline', 'Modo Local');
          } else {
            this.updateSyncUI('connected', 'Sincronizado');
          }
        });
    }

    return true;
  }

  /**
   * Incrementa el contador de visitas localmente y lo sube asíncronamente a Supabase.
   */
  async incrementViews(id) {
    const term = await this.get(id);
    if (term) {
      term.veces_consultado = (term.veces_consultado || 0) + 1;
      
      // Local
      await new Promise((resolve) => {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(term);
        request.onsuccess = () => resolve(term);
        request.onerror = () => resolve(term);
      });

      // Cloud
      if (this.supabase) {
        this.supabase.from('terms')
          .update({ veces_consultado: term.veces_consultado })
          .eq('id', id)
          .then(({ error }) => {
            if (error) console.error('Error actualizando contador en Supabase:', error);
          });
      }
    }
    return term;
  }

  /**
   * Convierte objetos locales en la estructura exacta para Supabase.
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
      origen: term.origen || 'manual',
      estado: term.estado || 'activo',
      keywords: Array.isArray(term.keywords) ? term.keywords : [],
      relacionados: Array.isArray(term.relacionados) ? term.relacionados : []
    };
  }

  /**
   * Sanitiza objetos de Supabase para cumplir con el almacenamiento IndexedDB.
   */
  _sanitizeFromSupabase(remote) {
    return {
      id: remote.id,
      termino: remote.termino,
      abreviatura: remote.abreviatura,
      significado_es: remote.significado_es,
      definicion_corta: remote.definicion_corta,
      explicacion: remote.explicacion,
      tip: remote.tip,
      categoria: remote.categoria,
      favorito: !!remote.favorito,
      fecha_creacion: remote.fecha_creacion,
      fecha_actualizacion: remote.fecha_actualizacion,
      veces_consultado: parseInt(remote.veces_consultado || 0, 10),
      origen: remote.origen,
      estado: remote.estado,
      keywords: Array.isArray(remote.keywords) ? remote.keywords : [],
      relacionados: Array.isArray(remote.relacionados) ? remote.relacionados : []
    };
  }

  /**
   * Búsqueda flexible de términos por palabra clave (Local-first).
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
