/* ═══════════════════════════════════════════════════════════════
   InsectErik · mejoras interactivas compartidas
   - Tema claro/oscuro
   - Buscador global (Ctrl/Cmd + K)
   - Libreta de campo y especie al azar
   - Acciones y especies relacionadas en la ficha
   - Animaciones de aparición y botón de subir
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  if (!global.IE) return;

  var IE = global.IE;
  var el = function (tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  };

  function getAppSpecies() {
    if (global.InsectErikApp && typeof global.InsectErikApp.getSpecies === 'function') {
      var list = global.InsectErikApp.getSpecies();
      if (list && list.length) return Promise.resolve(list);
    }
    return IE.loadSpecies().catch(function () { return []; });
  }

  /* ── Tema y accesos en la cabecera ────────────────────────── */
  function installHeaderActions() {
    var nav = document.querySelector('.top-header .top-nav') || document.querySelector('.top-header');
    if (!nav || nav.querySelector('.ie-theme-btn')) return;

    var themeBtn = el('button', 'ie-theme-btn ie-theme-toggle', '☾');
    themeBtn.type = 'button';
    themeBtn.setAttribute('aria-label', 'Cambiar de tema');
    themeBtn.addEventListener('click', function () {
      IE.theme.toggle();
      IE.toast(IE.theme.current() === 'dark' ? 'Modo oscuro activado' : 'Modo claro activado');
    });
    nav.appendChild(themeBtn);

    var paletteBtn = el('button', 'ie-theme-btn ie-palette-toggle', '⌕');
    paletteBtn.type = 'button';
    paletteBtn.setAttribute('aria-label', 'Buscar en todo el sitio (Ctrl + K)');
    paletteBtn.title = 'Buscar en todo el sitio (Ctrl + K)';
    paletteBtn.addEventListener('click', openPalette);
    nav.appendChild(paletteBtn);

    IE.theme.apply();
  }

  /* ── Buscador global ──────────────────────────────────────── */
  var paletteState = {
    overlay: null,
    input: null,
    results: null,
    items: [],
    active: -1,
    loading: false
  };

  var STATIC_PAGES = [
    { name: 'Inicio · Catálogo', sub: 'Todas las especies', href: '/', icon: '🏠', keywords: 'inicio catalogo especies' },
    { name: 'Juego · ¿Cuánto sabes?', sub: 'Quiz, explorador y memoria', href: 'juego.html', icon: '🎮', keywords: 'juego quiz memoria aprender' },
    { name: 'Colecciones', sub: 'Listas temáticas de especies', href: 'colecciones.html', icon: '📚', keywords: 'colecciones listas temas' },
    { name: 'Listas del catálogo', sub: 'Recientes, con más fotos, sin foto…', href: 'listas.html', icon: '🗂', keywords: 'listas recientes fotos taxonomia' },
    { name: 'Mapa veredal', sub: 'Explora las 15 veredas de Tibirita', href: 'mapa.html', icon: '🗺', keywords: 'mapa veredas tibirita' },
    { name: 'Estadísticas', sub: 'Gráficas y colaboradores', href: 'estadisticas.html', icon: '📊', keywords: 'estadisticas graficas datos' },
    { name: 'Línea de tiempo', sub: 'Calendario de observaciones', href: 'linea-tiempo.html', icon: '📅', keywords: 'linea tiempo calendario observaciones fechas meses' },
    { name: 'Comparador de especies', sub: 'Compara dos o tres fichas lado a lado', href: 'comparador.html', icon: '⇄', keywords: 'comparar comparador especies diferencias' }
  ];

  function createPalette() {
    if (paletteState.overlay) return;

    var overlay = el('div', 'ie-palette-overlay');
    overlay.innerHTML =
      '<div class="ie-palette" role="dialog" aria-modal="true" aria-label="Buscar en InsectErik">' +
        '<div class="ie-palette-head">' +
          '<span aria-hidden="true">⌕</span>' +
          '<input type="search" autocomplete="off" spellcheck="false" placeholder="Busca una especie, vereda, autor o página…">' +
          '<kbd>Esc</kbd>' +
        '</div>' +
        '<div class="ie-palette-results"></div>' +
        '<div class="ie-palette-foot"><span>↑ ↓ para moverte</span><span>Enter para abrir</span><span>Ctrl + K para abrir</span></div>' +
      '</div>';

    document.body.appendChild(overlay);
    paletteState.overlay = overlay;
    paletteState.input = overlay.querySelector('input');
    paletteState.results = overlay.querySelector('.ie-palette-results');

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closePalette();
    });

    paletteState.input.addEventListener('input', function () { renderPalette(paletteState.input.value); });
    paletteState.input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') { event.preventDefault(); movePalette(1); }
      if (event.key === 'ArrowUp') { event.preventDefault(); movePalette(-1); }
      if (event.key === 'Enter') { event.preventDefault(); openActive(); }
    });
  }

  function openPalette() {
    createPalette();
    paletteState.overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    paletteState.input.value = '';
    paletteState.active = -1;
    renderPalette('');
    setTimeout(function () { paletteState.input.focus(); }, 40);
  }

  function closePalette() {
    if (!paletteState.overlay) return;
    paletteState.overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function renderPalette(query) {
    var q = (query || '').trim().toLowerCase();
    paletteState.loading = true;
    paletteState.results.innerHTML = '<div class="ie-palette-empty">Buscando…</div>';
    paletteState.items = [];

    getAppSpecies().then(function (species) {
      if (!paletteState.overlay || !paletteState.overlay.classList.contains('is-open')) return;
      var staticMatches = STATIC_PAGES.filter(function (page) {
        return !q || (page.name + ' ' + page.sub + ' ' + page.keywords).toLowerCase().indexOf(q) !== -1;
      });

      var speciesMatches = species.filter(function (sp) {
        if (!q) return false;
        return (sp.searchText || (sp.name + ' ' + sp.scientificName).toLowerCase()).indexOf(q) !== -1;
      }).slice(0, 8);

      var html = '';
      if (speciesMatches.length) {
        html += '<div class="ie-palette-label">Especies</div>';
        speciesMatches.forEach(function (sp) {
          var photo = sp.photos && sp.photos[0];
          html += paletteItemHtml({
            kind: 'species',
            href: IE.speciesUrl(sp.id),
            icon: photo ? '<img src="' + IE.escapeHtml(photo) + '" alt="">' : '🌿',
            name: sp.name,
            sub: sp.scientificName || IE.getCategoryPath(sp).join(' › '),
            tag: sp.categoryLabel || 'Especie'
          });
        });
      }

      if (staticMatches.length) {
        html += '<div class="ie-palette-label">Páginas y herramientas</div>';
        staticMatches.forEach(function (page) {
          html += paletteItemHtml({
            kind: 'page',
            href: page.href,
            icon: page.icon,
            name: page.name,
            sub: page.sub,
            tag: 'Página'
          });
        });
      }

      if (!html) {
        html = '<div class="ie-palette-empty">No encontramos coincidencias para “' + IE.escapeHtml(query) + '”.<br>Prueba con el nombre común, el científico o una vereda.</div>';
      }

      paletteState.results.innerHTML = html;
      paletteState.items = Array.prototype.slice.call(paletteState.results.querySelectorAll('.ie-palette-item'));
      paletteState.items.forEach(function (item, index) {
        item.addEventListener('mouseenter', function () { setActive(index); });
        item.addEventListener('click', function (event) {
          if (item.dataset.action === 'notebook') {
            event.preventDefault();
            closePalette();
            openNotebook();
          }
        });
      });
      paletteState.loading = false;
      setActive(0);
    });
  }

  function paletteItemHtml(item) {
    return '<a class="ie-palette-item" href="' + IE.escapeHtml(item.href) + '" data-kind="' + item.kind + '">' +
      '<span class="ie-palette-thumb">' + item.icon + '</span>' +
      '<span class="ie-palette-text"><strong>' + IE.escapeHtml(item.name) + '</strong>' +
      '<small>' + IE.escapeHtml(item.sub || '') + '</small></span>' +
      '<span class="ie-palette-tag">' + IE.escapeHtml(item.tag || '') + '</span>' +
    '</a>';
  }

  function setActive(index) {
    if (!paletteState.items.length) return;
    paletteState.active = (index + paletteState.items.length) % paletteState.items.length;
    paletteState.items.forEach(function (item, i) {
      item.classList.toggle('is-active', i === paletteState.active);
    });
    var active = paletteState.items[paletteState.active];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  function movePalette(direction) {
    setActive(paletteState.active + direction);
  }

  function openActive() {
    var active = paletteState.items[paletteState.active];
    if (active) {
      if (active.dataset.action === 'notebook') {
        closePalette();
        openNotebook();
      } else {
        global.location.href = active.getAttribute('href');
      }
    }
  }

  /* ── Libreta de campo ─────────────────────────────────────── */
  function progressHtml(seen, total) {
    var pct = total ? Math.round(seen / total * 100) : 0;
    return '<div class="ie-progress">' +
      '<div class="ie-progress-bar"><span style="width:' + pct + '%"></span></div>' +
      '<span><strong>' + seen + '</strong> / ' + total + ' especies vistas</span>' +
    '</div>';
  }

  function openNotebook() {
    getAppSpecies().then(function (species) {
      var favorites = IE.notebook.getFavorites();
      var seen = IE.notebook.getSeen();
      var byId = {};
      species.forEach(function (sp) { byId[sp.id] = sp; });
      var favSpecies = favorites.map(function (id) { return byId[id]; }).filter(Boolean);
      var seenSpecies = seen.map(function (id) { return byId[id]; }).filter(Boolean);

      var html = '<div class="ie-notebook">' +
        '<div class="ie-notebook-stats">' +
          '<div class="ie-notebook-stat"><strong>' + favSpecies.length + '</strong><span>Favoritas</span></div>' +
          '<div class="ie-notebook-stat"><strong>' + seenSpecies.length + '</strong><span>Vistas</span></div>' +
          '<div class="ie-notebook-stat"><strong>' + species.length + '</strong><span>En el catálogo</span></div>' +
        '</div>' +
        '<div class="ie-notebook-actions">' +
          '<button class="ie-btn" type="button" data-notebook="export">⬇ Exportar mi libreta</button>' +
          '<button class="ie-btn ie-btn-ghost" type="button" data-notebook="clear">Borrar libreta</button>' +
        '</div>' +
        progressHtml(seenSpecies.length, species.length) +
        '<h3>★ Favoritas</h3>' +
        (favSpecies.length ? IE.speciesListHtml(favSpecies) : '<div class="ie-notebook-empty">Marca el corazón de una especie para guardarla aquí.</div>') +
        '<h3>✓ Vistas</h3>' +
        (seenSpecies.length ? IE.speciesListHtml(seenSpecies) : '<div class="ie-notebook-empty">Cuando veas una especie en el catálogo, marca el ojo para llevar tu progreso.</div>') +
      '</div>';

      var dialog = IE.modal({
        title: 'Mi libreta de campo',
        subtitle: 'Tus favoritos y especies vistas se guardan en este navegador, sin necesidad de cuenta.',
        html: html
      });

      dialog.element.querySelector('[data-notebook="export"]').addEventListener('click', function () {
        var text = IE.notebook.exportText(species);
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'libreta-insecterik.txt';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        IE.toast('Libreta exportada');
      });

      dialog.element.querySelector('[data-notebook="clear"]').addEventListener('click', function () {
        if (!global.confirm('¿Borrar todos tus favoritos y especies vistas? Esta acción no se puede deshacer.')) return;
        IE.notebook.clear();
        dialog.close();
        IE.toast('Libreta borrada');
      });
    });
  }

  /* ── Especie al azar ──────────────────────────────────────── */
  var lastRandomId = null;

  function openRandomSpecies() {
    getAppSpecies().then(function (species) {
      if (!species.length) {
        IE.toast('Todavía no hay especies cargadas');
        return;
      }
      var dialog = IE.modal({
        title: 'Descubre una especie',
        subtitle: 'Una pequeña sorpresa del catálogo de Tibirita',
        html: '<div class="ie-random" data-random-body></div>',
        onOpen: function (overlay) { drawRandom(species, overlay); }
      });
      dialog.element._randomSpecies = species;
    });
  }

  function drawRandom(species, overlay) {
    var body = overlay.querySelector('[data-random-body]');
    if (!body) return;
    var pool = species.length > 1 ? species.filter(function (sp) { return sp.id !== lastRandomId; }) : species;
    var sp = pool[Math.floor(Math.random() * pool.length)];
    lastRandomId = sp.id;
    var photo = sp.photos && sp.photos[0];
    var path = IE.getCategoryPath(sp).join(' › ');

    body.innerHTML =
      (photo
        ? '<img class="ie-random-img" src="' + IE.escapeHtml(photo) + '" alt="' + IE.escapeHtml(sp.name) + '">'
        : '<div class="ie-random-img">🌿</div>') +
      '<div>' +
        (path ? '<div class="ie-palette-tag" style="display:inline-block;margin-bottom:8px">' + IE.escapeHtml(path) + '</div>' : '') +
        '<h2>' + IE.escapeHtml(sp.name) + '</h2>' +
        (sp.scientificName ? '<p class="sci">' + IE.escapeHtml(sp.scientificName) + '</p>' : '') +
        '<p>' + IE.escapeHtml(sp.description || 'Una especie registrada en el catálogo de biodiversidad de Tibirita.') + '</p>' +
        '<div class="ie-random-actions">' +
          '<a class="ie-btn ie-btn-primary" href="' + IE.speciesUrl(sp.id) + '">Ver ficha completa →</a>' +
          '<button class="ie-btn" type="button" data-random-again>🎲 Otra especie</button>' +
          '<button class="ie-btn ie-btn-ghost" type="button" data-random-fav>' + (IE.notebook.isFavorite(sp.id) ? '♥ En favoritas' : '♡ Guardar en favoritas') + '</button>' +
        '</div>' +
      '</div>';

    body.querySelector('[data-random-again]').addEventListener('click', function () {
      drawRandom(species, overlay);
    });
    body.querySelector('[data-random-fav]').addEventListener('click', function (event) {
      var active = IE.notebook.toggleFavorite(sp.id);
      event.currentTarget.textContent = active ? '♥ En favoritas' : '♡ Guardar en favoritas';
      IE.toast(active ? 'Guardada en tu libreta' : 'Quitada de favoritas');
    });
  }

  /* ── Acciones y relacionadas en la ficha de especie ───────── */
  function installSpeciesActions(sp) {
    if (!sp || document.querySelector('.ie-species-actions')) return;
    var anchor = document.getElementById('speciesScientific') || document.getElementById('speciesTitle');
    if (!anchor) return;

    var actions = el('div', 'ie-species-actions');
    actions.innerHTML =
      '<button class="ie-btn" type="button" data-species-action="fav"></button>' +
      '<button class="ie-btn" type="button" data-species-action="seen"></button>' +
      '<a class="ie-btn ie-btn-ghost" href="comparador.html?ids=' + encodeURIComponent(sp.id) + '">⇄ Comparar</a>' +
      '<button class="ie-btn ie-btn-ghost" type="button" data-species-action="share">↗ Compartir</button>' +
      '<button class="ie-btn ie-btn-ghost" type="button" data-species-action="notebook">📒 Mi libreta</button>';

    anchor.insertAdjacentElement('afterend', actions);

    function refresh() {
      var fav = IE.notebook.isFavorite(sp.id);
      var seen = IE.notebook.isSeen(sp.id);
      var favBtn = actions.querySelector('[data-species-action="fav"]');
      var seenBtn = actions.querySelector('[data-species-action="seen"]');
      favBtn.textContent = fav ? '♥ En favoritas' : '♡ Guardar en favoritas';
      favBtn.classList.toggle('ie-btn-primary', fav);
      seenBtn.textContent = seen ? '✓ Ya la vi' : '○ Marcar como vista';
      seenBtn.classList.toggle('ie-btn-primary', seen);
    }
    refresh();

    actions.querySelector('[data-species-action="fav"]').addEventListener('click', function () {
      var active = IE.notebook.toggleFavorite(sp.id);
      refresh();
      IE.toast(active ? 'Guardada en tu libreta' : 'Quitada de favoritas');
    });
    actions.querySelector('[data-species-action="seen"]').addEventListener('click', function () {
      var active = IE.notebook.toggleSeen(sp.id);
      refresh();
      IE.toast(active ? '¡Sumada a tus especies vistas!' : 'Quitada de especies vistas');
    });
    actions.querySelector('[data-species-action="share"]').addEventListener('click', function () {
      IE.share(sp.name + ' · InsectErik', global.location.href);
    });
    actions.querySelector('[data-species-action="notebook"]').addEventListener('click', openNotebook);

    IE.on('notebook', refresh);
    installRelated(sp);
  }

  function installRelated(sp) {
    if (!sp || document.querySelector('.ie-related')) return;
    var footer = document.querySelector('footer');
    if (!footer) return;

    getAppSpecies().then(function (species) {
      var related = species.filter(function (item) {
        return item.id !== sp.id && item.categoryLabel && item.categoryLabel === sp.categoryLabel;
      });
      if (related.length < 4) {
        var group = sp.grupo || sp.subgrupo || sp.reino;
        var extra = species.filter(function (item) {
          return item.id !== sp.id && related.indexOf(item) === -1 &&
            (group ? item.grupo === group || item.subgrupo === group || item.reino === group : true);
        });
        related = related.concat(extra);
      }
      related = related.slice(0, 4);
      if (!related.length) return;

      var section = el('section', 'ie-related');
      section.innerHTML = '<h2>También te puede interesar</h2><div class="ie-related-grid">' +
        related.map(function (item) {
          var photo = item.photos && item.photos[0];
          return '<a class="ie-related-card" href="' + IE.speciesUrl(item.id) + '">' +
            (photo ? '<img src="' + IE.escapeHtml(photo) + '" alt="" loading="lazy">' : '<div class="ie-related-noimg">🌿</div>') +
            '<strong>' + IE.escapeHtml(item.name) + '</strong>' +
            '<small>' + IE.escapeHtml(item.scientificName || item.categoryLabel || '') + '</small>' +
          '</a>';
        }).join('') +
      '</div>';
      footer.parentNode.insertBefore(section, footer);
    });
  }

  function watchSpeciesPage() {
    if (global.InsectErikSpecies) {
      installSpeciesActions(global.InsectErikSpecies);
      return;
    }
    IE.on('species', function (sp) { installSpeciesActions(sp); });

    // Respaldo: si la página aún no expone el evento, se intenta por el id de la URL.
    var id = new URLSearchParams(global.location.search).get('id');
    if (id) {
      getAppSpecies().then(function (species) {
        var sp = species.filter(function (item) { return item.id === id; })[0];
        if (sp) installSpeciesActions(sp);
      });
    }
  }

  /* ── Animaciones al aparecer y botón de subir ─────────────── */
  var revealObserver = null;

  function initReveal() {
    if (!('IntersectionObserver' in global)) return;
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('ie-in');
          revealObserver.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -40px 0px', threshold: .06 });
    }
    revealScan();
  }

  function revealScan() {
    if (!revealObserver) return;
    var selector = '.card, .summary-card, .chart-card, .lista-block, .panel, .data-card, .species-row, .collection-card, .photo-cta';
    document.querySelectorAll(selector).forEach(function (node) {
      if (node.classList.contains('ie-reveal') || node.classList.contains('ie-in')) return;
      // No animar lo que ya está a la vista para evitar parpadeos en el primer pantallazo.
      var rect = node.getBoundingClientRect();
      if (rect.top < global.innerHeight * .92) {
        node.classList.add('ie-in');
        return;
      }
      node.classList.add('ie-reveal');
      revealObserver.observe(node);
    });
  }

  function installBackToTop() {
    var button = el('button', 'ie-top-btn', '↑');
    button.type = 'button';
    button.setAttribute('aria-label', 'Volver arriba');
    button.addEventListener('click', function () {
      global.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(button);
    function onScroll() {
      button.classList.toggle('is-visible', global.scrollY > 560);
    }
    global.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ── Atajos de teclado ────────────────────────────────────── */
  function installShortcuts() {
    document.addEventListener('keydown', function (event) {
      var key = event.key;
      var isTyping = /^(INPUT|TEXTAREA|SELECT)$/.test((event.target.tagName || '')) || event.target.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && (key === 'k' || key === 'K')) {
        event.preventDefault();
        if (paletteState.overlay && paletteState.overlay.classList.contains('is-open')) closePalette();
        else openPalette();
        return;
      }

      if (key === 'Escape' && paletteState.overlay && paletteState.overlay.classList.contains('is-open')) {
        closePalette();
        return;
      }

      // "/" abre el buscador si no se está escribiendo en un campo.
      if (key === '/' && !isTyping) {
        event.preventDefault();
        openPalette();
      }
    });
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function init() {
    installHeaderActions();
    installShortcuts();
    installBackToTop();
    initReveal();
    watchSpeciesPage();
    document.addEventListener('ie:species-rendered', revealScan);
    document.addEventListener('ie:gallery-rendered', revealScan);
    var selectors = window.MutationObserver ? true : false;
    if (selectors) {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; revealScan(); });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  IE.openNotebook = openNotebook;
  IE.openRandomSpecies = openRandomSpecies;
  IE.openPalette = openPalette;
  IE.revealScan = revealScan;
})(window);
