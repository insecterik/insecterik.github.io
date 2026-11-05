/* ═══════════════════════════════════════════════════════════════
   InsectErik · núcleo compartido
   Utilidades, libreta de campo (favoritos/vistas), tema y carga de
   especies. No depende de ninguna página en concreto.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var GH_USER = 'insecterik';
  var GH_REPO = 'insecterik.github.io';
  var GH_BRANCH = 'main';
  var GH_API = 'https://api.github.com/repos/' + GH_USER + '/' + GH_REPO + '/contents/';
  var GH_RAW = 'https://raw.githubusercontent.com/' + GH_USER + '/' + GH_REPO + '/' + GH_BRANCH + '/';

  function safeGet(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function emit(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent('ie:' + name, { detail: detail }));
    } catch (e) { /* navegadores muy antiguos */ }
  }

  /* ── Libreta de campo ─────────────────────────────────────── */
  var FAV_KEY = 'ie_favoritos_v1';
  var SEEN_KEY = 'ie_vistos_v1';

  function uniqueIds(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).filter(function (id) {
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  var notebook = {
    getFavorites: function () { return uniqueIds(safeGet(FAV_KEY, [])); },
    getSeen: function () { return uniqueIds(safeGet(SEEN_KEY, [])); },
    isFavorite: function (id) { return this.getFavorites().indexOf(id) !== -1; },
    isSeen: function (id) { return this.getSeen().indexOf(id) !== -1; },
    toggleFavorite: function (id) {
      var list = this.getFavorites();
      var index = list.indexOf(id);
      if (index === -1) list.push(id); else list.splice(index, 1);
      safeSet(FAV_KEY, list);
      emit('notebook', { type: 'favorites', id: id, active: index === -1 });
      return index === -1;
    },
    toggleSeen: function (id) {
      var list = this.getSeen();
      var index = list.indexOf(id);
      if (index === -1) list.push(id); else list.splice(index, 1);
      safeSet(SEEN_KEY, list);
      emit('notebook', { type: 'seen', id: id, active: index === -1 });
      return index === -1;
    },
    clear: function () {
      safeSet(FAV_KEY, []);
      safeSet(SEEN_KEY, []);
      emit('notebook', { type: 'clear' });
    },
    exportText: function (species) {
      var favs = this.getFavorites();
      var seen = this.getSeen();
      var byId = {};
      (species || []).forEach(function (sp) { byId[sp.id] = sp; });
      function line(id, mark) {
        var sp = byId[id];
        return mark + ' ' + (sp ? sp.name + (sp.scientificName ? ' (' + sp.scientificName + ')' : '') : id);
      }
      var out = ['Mi libreta de campo · InsectErik', ''];
      out.push('Favoritas (' + favs.length + ')');
      favs.forEach(function (id) { out.push(line(id, '★')); });
      out.push('');
      out.push('Vistas (' + seen.length + ')');
      seen.forEach(function (id) { out.push(line(id, '✓')); });
      return out.join('\n');
    }
  };

  /* ── Tema claro / oscuro ──────────────────────────────────── */
  var THEME_KEY = 'ie_tema';

  function currentTheme() {
    var saved = safeGet(THEME_KEY, null);
    if (saved === 'dark' || saved === 'light') return saved;
    try {
      return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function applyTheme(theme) {
    var value = theme || currentTheme();
    document.documentElement.setAttribute('data-theme', value);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', value === 'dark' ? '#0c1714' : '#16332f');
    document.querySelectorAll('.ie-theme-toggle').forEach(function (btn) {
      btn.textContent = value === 'dark' ? '☀' : '☾';
      btn.setAttribute('aria-label', value === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      btn.setAttribute('title', btn.getAttribute('aria-label'));
    });
    return value;
  }

  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    safeSet(THEME_KEY, next);
    applyTheme(next);
    emit('theme', { theme: next });
    return next;
  }

  applyTheme();

  /* ── Utilidades ───────────────────────────────────────────── */
  function slugify(str) {
    return (str || '')
      .toString().trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function capitalize(str) {
    str = (str || '').toString();
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    return (str == null ? '' : String(str))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanValue(value) {
    value = (value == null ? '' : String(value)).trim();
    if ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
        (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")) {
      value = value.slice(1, -1);
    }
    return value;
  }

  /* Parser de front matter suficiente para los campos de Decap:
     escalares, listas de texto, listas de objetos y objetos de un nivel. */
  function parseFrontMatter(raw) {
    raw = (raw || '').replace(/\r\n/g, '\n');
    var match = /^---\s*\n([\s\S]*?)\n---/.exec(raw);
    if (!match) return {};

    var lines = match[1].split('\n');
    var data = {};
    var currentKey = null;
    var container = null; // 'array' | 'object'
    var pendingObject = null;

    function flushObjectItem() {
      if (pendingObject && currentKey) {
        if (!Array.isArray(data[currentKey])) data[currentKey] = [];
        data[currentKey].push(pendingObject);
      }
      pendingObject = null;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim() || /^\s*#/.test(line)) continue;

      var indent = line.search(/\S/);
      var trimmed = line.trim();

      if (indent === 0) {
        flushObjectItem();
        var kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(trimmed);
        if (!kv) continue;
        currentKey = kv[1];
        var value = cleanValue(kv[2]);
        if (value === '') {
          // Se decide más abajo si es lista u objeto según la primera línea hija.
          data[currentKey] = null;
          container = 'unknown';
        } else if (value === '[]') {
          data[currentKey] = [];
          container = null;
        } else {
          data[currentKey] = value;
          container = null;
        }
        continue;
      }

      if (!currentKey) continue;

      var listItem = /^-\s+(.*)$/.exec(trimmed);
      if (listItem) {
        if (container !== 'array') {
          if (container === 'object' && data[currentKey] && typeof data[currentKey] === 'object') {
            // no debería mezclarse; se conserva lo que haya
          } else {
            data[currentKey] = [];
          }
          container = 'array';
        }
        var item = listItem[1].trim();
        var itemKv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(item);
        if (itemKv) {
          pendingObject = {};
          pendingObject[itemKv[1]] = cleanValue(itemKv[2]);
        } else {
          flushObjectItem();
          data[currentKey].push(cleanValue(item));
        }
        continue;
      }

      var nestedKv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(trimmed);
      if (nestedKv) {
        if (pendingObject) {
          pendingObject[nestedKv[1]] = cleanValue(nestedKv[2]);
          continue;
        }
        if (container !== 'object') {
          data[currentKey] = {};
          container = 'object';
        }
        data[currentKey][nestedKv[1]] = cleanValue(nestedKv[2]);
      }
    }
    flushObjectItem();

    // Normaliza null -> [] para que el resto del código no tenga que comprobarlo.
    Object.keys(data).forEach(function (key) {
      if (data[key] === null) data[key] = [];
    });
    return data;
  }

  function toArray(value) {
    if (value == null || value === '') return [];
    if (Array.isArray(value)) return value;
    return [value];
  }

  function namesFrom(value) {
    return toArray(value).map(function (item) {
      if (item && typeof item === 'object') return cleanValue(item.nombre || item.name || '');
      return cleanValue(item);
    }).filter(Boolean);
  }

  function normalizeSpecies(fm, path) {
    var photos = namesFrom(fm.imagenes);
    if (!photos.length && fm.imagen) photos = [cleanValue(fm.imagen)].filter(Boolean);
    photos = photos.filter(function (src) { return /^(https?:|\/|images\/)/.test(src); });

    var taxonomia = (fm.taxonomia && typeof fm.taxonomia === 'object' && !Array.isArray(fm.taxonomia))
      ? fm.taxonomia
      : {};

    var title = cleanValue(fm.title) || '(sin nombre)';
    return {
      id: slugify(title) + '-' + slugify(path),
      path: path,
      name: title,
      scientificName: cleanValue(fm.cientifico),
      description: cleanValue(fm.descripcion),
      location: cleanValue(fm.ubicacion),
      vereda: namesFrom(fm.vereda),
      date: cleanValue(fm.fecha),
      photos: photos,
      taxonomia: taxonomia,
      autores: namesFrom(fm.autores).length ? namesFrom(fm.autores) : namesFrom(fm.autor),
      reino: cleanValue(fm.reino),
      grupo: cleanValue(fm.grupo),
      subgrupo: cleanValue(fm.subgrupo),
      categoria: cleanValue(fm.categoria),
      subcategoria: cleanValue(fm.subcategoria),
      categoryLabel: cleanValue(fm.subcategoria || fm.categoria || fm.subgrupo || fm.grupo || fm.reino),
      searchText: [
        title, fm.cientifico, fm.descripcion, fm.ubicacion,
        fm.reino, fm.grupo, fm.subgrupo, fm.categoria, fm.subcategoria
      ].concat(namesFrom(fm.vereda), namesFrom(fm.autores), namesFrom(fm.autor))
        .join(' ').toLowerCase()
    };
  }

  /* ── Carga de datos estáticos (data.json) ────────────────── */
  var DATA_CACHE_KEY = 'ie_data_cache_v1';
  var SPECIES_CACHE_KEY = 'ie_especies_cache_v2';
  var CACHE_MS = 10 * 60 * 1000;
  var dataPromise = null;
  var speciesPromise = null;

  function readDataCache() {
    try {
      var cached = JSON.parse(global.sessionStorage.getItem(DATA_CACHE_KEY) || 'null');
      if (!cached || !cached.data || !cached.data.levels) return null;
      if ((Date.now() - cached.ts) > CACHE_MS) return null;
      return cached.data;
    } catch (e) {
      return null;
    }
  }

  function writeDataCache(data) {
    try {
      global.sessionStorage.setItem(DATA_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) { /* cuota llena o modo privado */ }
  }

  /* data.json lo genera scripts/build-data.mjs a partir de content/*.md.
     Si no existe (por ejemplo, en una copia local antigua), cada página
     mantiene su respaldo por la API de GitHub. */
  function loadData(options) {
    options = options || {};
    if (!options.force && dataPromise) return dataPromise;

    var cached = options.force ? null : readDataCache();
    if (cached) {
      dataPromise = Promise.resolve(cached);
      return dataPromise;
    }

    dataPromise = fetch('data.json', { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('data.json respondió ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.levels || typeof data.levels !== 'object') {
          throw new Error('data.json no tiene la estructura esperada');
        }
        writeDataCache(data);
        return data;
      })
      .catch(function (error) {
        dataPromise = null;
        throw error;
      });

    return dataPromise;
  }

  /* ── Carga de especies (con caché de sesión) ──────────────── */
  function readCache(allowStale) {
    try {
      var cached = JSON.parse(global.sessionStorage.getItem(SPECIES_CACHE_KEY) || 'null');
      if (!cached || !Array.isArray(cached.data) || !cached.data.length) return null;
      if (!allowStale && (Date.now() - cached.ts) > CACHE_MS) return null;
      return cached.data;
    } catch (e) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      global.sessionStorage.setItem(SPECIES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) { /* cuota llena o modo privado */ }
  }

  function sortByDate(species) {
    species.sort(function (a, b) {
      var da = a.date ? new Date(a.date).getTime() : 0;
      var db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });
    return species;
  }

  function normalizeSpeciesList(rawList) {
    return sortByDate((Array.isArray(rawList) ? rawList : []).map(function (item) {
      return normalizeSpecies(item, item && (item.__path || item.path) || '');
    }).filter(Boolean));
  }

  function loadSpeciesFromData(options) {
    return loadData(options).then(function (data) {
      var raw = data.levels && data.levels.especies;
      if (!Array.isArray(raw) || !raw.length) {
        throw new Error('data.json no contiene especies');
      }
      var species = normalizeSpeciesList(raw);
      if (!species.length) throw new Error('No se pudieron normalizar las especies de data.json');
      writeCache(species);
      return species;
    });
  }

  function loadSpeciesFromGitHub() {
    return fetch(GH_API + 'content/especies?ref=' + GH_BRANCH, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('GitHub API respondió ' + response.status);
        return response.json();
      })
      .then(function (items) {
        var files = (Array.isArray(items) ? items : []).filter(function (item) {
          return item.type === 'file' && /\.md$/i.test(item.name);
        });
        return Promise.all(files.map(function (file) {
          var path = 'content/especies/' + file.name;
          return fetch(GH_RAW + path)
            .then(function (response) { return response.ok ? response.text() : ''; })
            .catch(function () { return ''; })
            .then(function (text) {
              if (!text) return null;
              return normalizeSpecies(parseFrontMatter(text), path);
            });
        }));
      })
      .then(function (list) {
        var species = sortByDate(list.filter(Boolean));
        if (species.length) writeCache(species);
        return species;
      });
  }

  function loadSpecies(options) {
    options = options || {};
    if (!options.force && speciesPromise) return speciesPromise;

    var cached = options.force ? null : readCache(false);
    if (cached) {
      speciesPromise = Promise.resolve(cached);
      return speciesPromise;
    }

    speciesPromise = loadSpeciesFromData(options)
      .catch(function (error) {
        console.warn('No se pudo usar data.json; se intenta la API de GitHub.', error);
        return loadSpeciesFromGitHub();
      })
      .catch(function (error) {
        var stale = readCache(true);
        if (stale) {
          console.warn('No se pudo actualizar el catálogo; se usa la copia en caché.', error);
          return stale;
        }
        speciesPromise = null;
        throw error;
      });

    return speciesPromise;
  }

  /* ── Toasts ───────────────────────────────────────────────── */
  var toastTimer = null;
  function toast(message) {
    var el = document.querySelector('.ie-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ie-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-visible'); }, 2600);
  }

  /* ── Modal genérico ───────────────────────────────────────── */
  function modal(options) {
    options = options || {};
    var overlay = document.createElement('div');
    overlay.className = 'ie-modal-overlay';
    overlay.innerHTML =
      '<div class="ie-modal" role="dialog" aria-modal="true" aria-label="' + escapeHtml(options.title || 'Ventana') + '">' +
        '<button class="ie-modal-close" type="button" aria-label="Cerrar">&times;</button>' +
        (options.head !== false
          ? '<div class="ie-modal-head"><h2>' + escapeHtml(options.title || '') + '</h2>' +
            (options.subtitle ? '<p>' + escapeHtml(options.subtitle) + '</p>' : '') + '</div>'
          : '') +
        '<div class="ie-modal-body">' + (options.html || '') + '</div>' +
      '</div>';

    function close() {
      overlay.classList.remove('is-open');
      setTimeout(function () { overlay.remove(); }, 180);
      document.removeEventListener('keydown', onKey);
      if (options.onClose) options.onClose();
    }
    function onKey(event) {
      if (event.key === 'Escape') close();
    }
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.closest('.ie-modal-close')) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('is-open'); });
    if (options.onOpen) options.onOpen(overlay, close);
    return { element: overlay, close: close };
  }

  function speciesListHtml(species) {
    if (!species || !species.length) {
      return '<p class="ie-notebook-empty">No hay especies para mostrar.</p>';
    }
    return '<div class="ie-species-list">' + species.map(function (sp) {
      var photo = sp.photos && sp.photos[0];
      return '<a class="ie-species-item" href="especie.html?id=' + encodeURIComponent(sp.id) + '">' +
        (photo
          ? '<img src="' + escapeHtml(photo) + '" alt="" loading="lazy">'
          : '<span class="ie-species-noimg">🌿</span>') +
        '<span><strong>' + escapeHtml(sp.name || '(sin nombre)') + '</strong>' +
        '<small>' + escapeHtml(sp.scientificName || sp.categoryLabel || '') + '</small></span>' +
      '</a>';
    }).join('') + '</div>';
  }

  function showSpeciesList(title, species, subtitle) {
    return modal({
      title: title,
      subtitle: subtitle || (species.length + (species.length === 1 ? ' especie' : ' especies')),
      html: speciesListHtml(species)
    });
  }

  function speciesUrl(id) {
    return 'especie.html?id=' + encodeURIComponent(id);
  }

  function share(title, url) {
    url = url || global.location.href;
    if (navigator.share) {
      return navigator.share({ title: title || document.title, url: url }).catch(function () {});
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(url).then(function () {
        toast('Enlace copiado al portapapeles');
      }).catch(function () {
        toast('No se pudo copiar el enlace');
      });
    }
    global.prompt('Copia este enlace:', url);
    return Promise.resolve();
  }

  function getCategoryPath(sp) {
    return [sp.reino, sp.grupo, sp.subgrupo, sp.categoria, sp.subcategoria]
      .filter(Boolean);
  }

  var IE = {
    GH_API: GH_API,
    GH_RAW: GH_RAW,
    GH_BRANCH: GH_BRANCH,
    notebook: notebook,
    theme: {
      apply: applyTheme,
      toggle: toggleTheme,
      current: function () { return document.documentElement.getAttribute('data-theme') || 'light'; }
    },
    toast: toast,
    modal: modal,
    showSpeciesList: showSpeciesList,
    speciesListHtml: speciesListHtml,
    share: share,
    speciesUrl: speciesUrl,
    getCategoryPath: getCategoryPath,
    loadData: loadData,
    loadSpecies: loadSpecies,
    clearDataCache: function () {
      dataPromise = null;
      try { global.sessionStorage.removeItem(DATA_CACHE_KEY); } catch (e) {}
    },
    clearSpeciesCache: function () {
      speciesPromise = null;
      try { global.sessionStorage.removeItem(SPECIES_CACHE_KEY); } catch (e) {}
    },
    parseFrontMatter: parseFrontMatter,
    normalizeSpecies: normalizeSpecies,
    toArray: toArray,
    namesFrom: namesFrom,
    slugify: slugify,
    capitalize: capitalize,
    escapeHtml: escapeHtml,
    cleanValue: cleanValue,
    safeGet: safeGet,
    safeSet: safeSet,
    on: function (name, handler) {
      document.addEventListener('ie:' + name, function (event) { handler(event.detail); });
    }
  };

  global.IE = IE;
})(window);
