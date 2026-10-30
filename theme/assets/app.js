/* core.js: the shared front-end engine (window.UI). Same in every app made from APP_MAKER/template;
   app-specific things live in web/app.js (brand, nav, footer) and web/pages/*.html (the pages).

   Pages:   UI.page(name, {title, nav, icon, auth, order, chrome}, mount)
              auth: null (anyone) | 'guest' (signed-out only) | 'user' | 'admin'
              nav: label for the header / phone tab bar (omit to keep it out of the menus)
              mount(view, ctx) draws into `view`; ctx = {args, me, go, api}. Return a Promise (the page
              is "ready" when it resolves) or {ready, destroy}. URLs are #name/arg1/arg2.
   Server:  UI.api(fn, ...args) -> Promise of the server function's return value. A reply of
              {ok: false, error} rejects with that message (shown as a toast unless you .catch it).
            UI.apiQuiet(fn, ...args) is the same without Anvil's loading spinner.
   Auth:    UI.auth('login'|'signup'|'reset'|'logout', {...}) -> Promise of {ok, me, message}
   Helpers: UI.esc, UI.icon, UI.toast, UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate, UI.ago,
            UI.store, UI.setTheme, UI.feedback, UI.go, UI.refresh
   Tests:   window.UI_READY is true when the current page has finished loading. */
(function () {
  'use strict';
  if (window.UI && window.UI.__v) return;
  var UI = window.UI = { __v: 1, pages: {}, me: null, config: { name: 'App', key: 'app', home: 'home', landing: 'landing' } };
  window.UI_READY = false;

  UI.configure = function (cfg) { Object.keys(cfg).forEach(function (k) { UI.config[k] = cfg[k]; }); };

  /* ------------------------------------------------------------------ small helpers */
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  /* Disable a button while a Promise runs; returns the Promise. */
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 7.5 4M15 5.5 16.5 4M7 13H3M21 13h-4M7.5 18l-3 2M16.5 18l3 2M7.5 9.5l-3-2M16.5 9.5l3-2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };
  UI.ICONS = ICONS;
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
  };

  /* ------------------------------------------------------------------ toasts, modals */
  UI.toast = function (msg, kind) {
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = (kind === 'error' ? UI.icon('info') : kind === 'ok' ? UI.icon('check') : '') + '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select');
    setTimeout(function () { (first || wrap.querySelector('.ui-modal')).focus && (first || wrap.querySelector('.ui-modal')).focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    return new Promise(function (resolve) {
      var answered = false;
      var m = UI.modal('<h2>' + UI.esc(o.title || 'Are you sure?') + '</h2>' + (o.text ? '<p class="muted">' + UI.esc(o.text) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn ghost" data-close>' + UI.esc(o.cancel || 'Cancel') + '</button>' +
        '<button class="ui-btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-ok>' + UI.esc(o.ok || 'OK') + '</button></div>',
      { onclose: function () { if (!answered) resolve(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { answered = true; m.close(); resolve(true); };
    });
  };

  /* ------------------------------------------------------------------ theme */
  UI.theme = function () { return UI.store.get('theme', 'auto'); };
  UI.applyTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ui-dark', !!dark);
  };
  UI.setTheme = function (t) { UI.store.set('theme', t); UI.applyTheme(t); };
  UI.applyTheme(UI.theme());
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { UI.applyTheme(UI.theme()); }); } catch (e) {}
  }

  /* ------------------------------------------------------------------ server bridge */
  var bridge = null;
  function send(kind, payload) {
    if (!bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function apiCall(quiet, fn, args) {
    return send('call', { fn: fn, args: args, quiet: quiet }).then(function (res) {
      if (res && typeof res === 'object' && res.ok === false) {
        var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
        throw err;
      }
      return res;
    });
  }
  UI.api = function (fn) { return apiCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  UI.apiQuiet = function (fn) { return apiCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Sign in / up / out. On success it navigates: to where the visitor was heading (UI.after) or home
     after signing in, to the landing page after signing out. */
  UI.auth = function (kind, payload) {
    return send(kind, payload || {}).then(function (r) {
      if (r && r.ok === false) { var err = new Error(r.error); err.uiApi = true; err.expected = true; throw err; }
      if (r && 'me' in r && (r.me || kind === 'logout')) {
        UI.me = r.me || null;
        var target = r.me ? (UI.after || '#' + UI.config.home) : '#' + UI.config.landing;
        UI.after = null;
        if (location.hash === target) route(); else location.hash = target;
      }
      return r;
    });
  };
  /* Update the signed-in user's details (e.g. a new name) and redraw the header, without reloading the page. */
  UI.setMe = function (me) {
    UI.me = me || null;
    if (shellRoot) renderChrome(current.name);
  };

  /* ------------------------------------------------------------------ pages and routing */
  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  UI.allowed = function (p) {
    if (!p) return false;
    if (p.auth === 'user') return !!UI.me;
    if (p.auth === 'admin') return !!(UI.me && UI.me.is_admin);
    if (p.auth === 'guest') return !UI.me;
    return true;
  };
  UI.navPages = function () {
    return Object.keys(UI.pages).map(function (k) { return UI.pages[k]; })
      .filter(function (p) { return p.nav && UI.allowed(p) && (!p.when || p.when()); })
      .sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  UI.parseHash = function () {
    var h = (location.hash || '').replace(/^#!?\/?/, '');
    var parts = h.split('?')[0].split('/').filter(function (x) { return x !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || '', args: parts.slice(1) };
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function (name) {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h) route(); else location.hash = h;
  };
  UI.refresh = function () { route(); };
  UI.after = null;  // where to go after signing in

  var shellRoot = null, view = null, current = { name: null, destroy: null }, routeSeq = 0;

  function defaultPage() { return UI.me ? UI.config.home : UI.config.landing; }

  function route() {
    var r = UI.parseHash(), name = r.name || defaultPage(), p = UI.pages[name];
    if (!p) { name = defaultPage(); p = UI.pages[name]; r.args = []; }
    if (p.auth === 'guest' && UI.me) { p = UI.pages[UI.config.home]; name = UI.config.home; r.args = []; }
    if ((p.auth === 'user' || p.auth === 'admin') && !UI.me) {
      UI.after = location.hash && location.hash !== '#' ? location.hash : null;
      p = UI.pages.auth; name = 'auth'; r.args = [];
    }
    if (p.auth === 'admin' && !(UI.me && UI.me.is_admin)) {
      UI.toast('That page is for admins only.', 'error');
      p = UI.pages[UI.config.home]; name = UI.config.home; r.args = [];
    }
    var seq = ++routeSeq;
    window.UI_READY = false;
    if (current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = { name: name, args: r.args, destroy: null };
    if (shellRoot) {
      shellRoot.className = 'ui ui-shell page-' + name + (UI.me ? ' signed-in' : ' signed-out') + (p.chrome === false ? ' no-chrome' : '');
      renderChrome(name);
    }
    // A fresh element for every page, so listeners a page adds to `view` never pile up.
    var fresh = view.cloneNode(false);
    view.parentNode.replaceChild(fresh, view);
    view = fresh;
    window.scrollTo(0, 0);
    document.title = (p.title ? (typeof p.title === 'function' ? p.title(r.args) : p.title) + ' · ' : '') + UI.config.name;
    var ctx = { name: name, args: r.args, me: UI.me, go: UI.go, api: UI.api, page: p };
    var out;
    try { out = p.mount(view, ctx); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    if (out && out.destroy) current.destroy = out.destroy;
    Promise.resolve(ready).then(function () { if (seq === routeSeq) window.UI_READY = true; },
      function (e) {
        if (seq !== routeSeq) return;
        console.error(e);
        if (!view.innerHTML) view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
          '<h3>This page didn\'t load</h3><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
          '<button class="ui-btn" onclick="UI.refresh()">Try again</button></div></div>';
        window.UI_READY = true;
      });
  }
  UI.current = function () { return current; };

  /* The shell's parts come from web/app.js: UI.shell = {header(me, active), footer(me), tabbar(me, active)} */
  function renderChrome(active) {
    var S = UI.shell || {};
    var hd = shellRoot.querySelector('[data-ui-header]'), ft = shellRoot.querySelector('[data-ui-footer]'), tb = shellRoot.querySelector('[data-ui-tabbar]');
    if (hd) hd.innerHTML = S.header ? S.header(UI.me, active) : '';
    if (ft) ft.innerHTML = S.footer ? S.footer(UI.me, active) : '';
    if (tb) tb.innerHTML = S.tabbar ? S.tabbar(UI.me, active) : '';
  }
  UI.renderChrome = function () { if (shellRoot) renderChrome(current.name); };

  /* Called by client_code/Main.py (and by the local harness) once the page is up. */
  UI.start = function (node, bridgeFn, bootJson) {
    bridge = bridgeFn;
    var boot = typeof bootJson === 'string' ? JSON.parse(bootJson || '{}') : (bootJson || {});
    UI.me = boot.me || null;
    var host = node && node.matches && node.matches('[data-ui-app]') ? node : (node && node.querySelector('[data-ui-app]')) || node || document.body;
    host.innerHTML = '<div class="ui ui-shell">' +
      '<header class="ui-header" data-ui-header></header>' +
      '<main class="ui-main" data-ui-view></main>' +
      '<footer class="ui-footer" data-ui-footer></footer>' +
      '<nav class="ui-tabbar" data-ui-tabbar aria-label="Main"></nav></div>';
    shellRoot = host.firstChild;
    view = host.querySelector('[data-ui-view]');
    if (UI.shell && UI.shell.wire) UI.shell.wire(shellRoot);
    window.addEventListener('hashchange', route);
    route();
  };

  /* ------------------------------------------------------------------ feedback form (footer + menu) */
  UI.feedback = function (kind) {
    var kinds = [['bug', 'Something\'s broken', 'bug'], ['idea', 'An idea', 'bulb'], ['question', 'A question', 'info'], ['other', 'Something else', 'chat']];
    var m = UI.modal('<h2>Send feedback</h2><p class="muted">Found a bug or have an idea? It goes straight to the people who make ' + UI.esc(UI.config.name) + '.</p>' +
      '<form class="ui-stack" data-fb>' +
      '<div class="ui-choices">' + kinds.map(function (k) {
        return '<label class="ui-choice"><input type="radio" name="kind" value="' + k[0] + '"' + ((kind || 'bug') === k[0] ? ' checked' : '') + '>' +
          '<span>' + UI.icon(k[2]) + UI.esc(k[1]) + '</span></label>';
      }).join('') + '</div>' +
      '<label class="ui-field"><span>What happened, or what would you like?</span><textarea name="message" rows="5" required minlength="5" placeholder="The more detail, the better."></textarea></label>' +
      (UI.me ? '' : '<label class="ui-field"><span>Your email <em>(optional, if you\'d like a reply)</em></span><input type="email" name="email" autocomplete="email"></label>') +
      '<p class="ui-hint">We also send the page you were on, your screen size and browser, to help us fix bugs.</p>' +
      '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('arrow') + 'Send</button></div></form>');
    var form = m.el.querySelector('[data-fb]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(form);
      var ctx = { page: location.hash || '#', screen: innerWidth + 'x' + innerHeight, browser: navigator.userAgent.slice(0, 280), theme: UI.theme() };
      UI.busy(form.querySelector('[type=submit]'), UI.api('submit_feedback', v.kind, v.message, v.email || null, ctx)).then(function () {
        m.close(); UI.toast('Thank you! Your message was sent.', 'ok');
      });
    });
    return m;
  };

  /* Shared clicks: [data-go="page/arg"], [data-feedback], [data-theme-set] anywhere in the app. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback],[data-theme-set]');
    if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); UI.go.apply(null, el.getAttribute('data-go').split('/')); }
    else if (el.hasAttribute('data-feedback')) { e.preventDefault(); UI.feedback(el.getAttribute('data-feedback') || null); }
    else if (el.hasAttribute('data-theme-set')) { e.preventDefault(); UI.setTheme(el.getAttribute('data-theme-set')); if (UI.shell && UI.shell.onTheme) UI.shell.onTheme(); }
  });
})();


/* app.js: this app's identity and frame: name, header, footer, phone tab bar.
   Pages live in web/pages/*.html. The engine (window.UI) is web/core.js. */
(function () {
  'use strict';
  UI.configure({
    name: 'City Fun Time',
    key: 'cityfuntime',          // prefix for this app's browser storage
    tagline: 'Your real neighbourhood, a whole new life. Map data © OpenStreetMap contributors.',   // footer line
    home: 'life',                // first page after signing in
    landing: 'landing'           // first page for visitors who aren't signed in
  });

  var esc = UI.esc;

  function brand() {
    return '<a class="ui-brand" href="#" data-go="' + (UI.me ? UI.config.home : UI.config.landing) + '" aria-label="' + esc(UI.config.name) + ' home">' +
      '<img src="_/theme/icon.svg" alt="" width="32" height="32"><span>' + esc(UI.config.name) + '</span></a>';
  }

  function themeSwitch() {
    var t = UI.theme();
    return '<div class="ui-seg" role="group" aria-label="Appearance">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<button type="button" data-theme-set="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function userMenu(me) {
    return '<div class="ui-menu" data-menu hidden>' +
      '<div class="ui-menu-head"><strong>' + esc(me.name) + '</strong><span class="muted small">' + esc(me.email) + '</span></div>' +
      '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<div class="ui-menu-block"><span class="small muted">Appearance</span>' + themeSwitch() + '</div>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button></div>';
  }

  UI.shell = {
    header: function (me, active) {
      var nav = UI.navPages();
      return '<div class="ui-header-in">' + brand() +
        (me ? '<nav class="ui-nav" aria-label="Main">' + nav.map(function (p) {
          return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
        }).join('') + '</nav>' : '') +
        '<div class="ui-header-right">' +
        (me ? '<button type="button" class="ui-avatar-btn" data-menu-toggle aria-label="Your account" aria-haspopup="true">' + esc(UI.initials(me.name)) + '</button>' + userMenu(me)
          : (active === 'auth' ? '' : '<a class="ui-btn ghost" href="#auth" data-go="auth">Sign in</a><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Get started</a>')) +
        '</div></div>';
    },
    footer: function (me) {
      return '<div class="ui-footer-in"><div class="ui-footer-brand">' + brand() + '<p class="muted small">' + esc(UI.config.tagline) + '</p></div>' +
        '<div class="ui-footer-links">' +
        '<a href="#landing" data-go="landing">About</a>' +
        '<button type="button" data-feedback>Send feedback</button>' +
        '<button type="button" data-lk-open="overview">Privacy &amp; Terms</button>' +
        '</div><p class="ui-footer-legal small muted">© ' + new Date().getFullYear() + ' ' + esc(UI.config.name) + '</p></div>';
    },
    tabbar: function (me, active) {
      var nav = UI.navPages();
      if (!me || nav.length < 2) return '';
      return nav.slice(0, 4).map(function (p) {
        return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
      }).join('') + '<a href="#profile" class="' + (active === 'profile' ? 'on' : '') + '">' + UI.icon('user') + '<span>You</span></a>';
    },
    wire: function (root) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-menu-toggle]');
        var menu = root.querySelector('[data-menu]');
        if (t && menu) { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (e.target.closest('[data-signout]')) { UI.auth('logout').then(function () { UI.toast('Signed out. See you soon!'); }); }
        if (menu && !menu.hidden && !e.target.closest('[data-menu] .ui-seg')) menu.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        var menu = root.querySelector('[data-menu]');
        if (e.key === 'Escape' && menu) menu.hidden = true;
      });
    },
    onTheme: function () {  // redraw the menu's Auto/Light/Dark buttons and keep the menu open
      var menu = document.querySelector('[data-menu]'), open = menu && !menu.hidden;
      UI.renderChrome();
      if (open) document.querySelector('[data-menu]').hidden = false;
    }
  };
})();


/* ===== _cft.html ===== */
(function () {
  'use strict';
  var V = window.CFT_ASSET_V || {};
  var loaded = {};
  function script(name) {
    if (!loaded[name]) loaded[name] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = '_/theme/' + name + '?v=' + (V[name] || '1');
      s.async = false;
      s.onload = res;
      s.onerror = function () { delete loaded[name]; rej(new Error('Couldn\'t load ' + name + '. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return loaded[name];
  }
  var DATA = ['cft-content.js', 'cft-game.js'];
  var ALL = ['three.min.js', 'cft-content.js', 'cft-tiles.js', 'cft-world.js', 'cft-ui.js', 'cft-game.js'];

  window.CFT = {
    // Game data only (content + rules), enough for the Life / Quests / Album pages.
    data: function () { return DATA.reduce(function (p, n) { return p.then(function () { return script(n); }); }, Promise.resolve()); },
    // Everything the 3D game needs.
    load: function () { return ALL.reduce(function (p, n) { return p.then(function () { return script(n); }); }, Promise.resolve()); },
    key: function () { return 'save.' + (UI.me ? UI.me.id : 'guest'); },
    local: function (who) { return UI.store.get(who ? 'save.' + who : CFT.key(), null); },
    // The player's save: the server copy for signed-in players (or this device's copy if it is newer), else this device's.
    loadSave: function () {
      var local = CFT.local();
      if (!UI.me) return Promise.resolve(local);
      return UI.apiQuiet('get_save').then(function (r) {
        var srv = r && r.save;
        if (srv && local && (local.updated || 0) > (srv.updated || 0) + 1000) { CFT.push(local, true); return local; }
        if (srv) { UI.store.set(CFT.key(), srv); return srv; }
        if (local) { CFT.push(local, true); return local; }
        var guest = CFT.local('guest');
        if (guest) { CFT.adopt = guest; }  // a game played before signing in: the page offers to keep it
        return null;
      }, function () { return local; });
    },
    // Called by the game whenever something changes (debounced there). Writes locally at once, to the server every 20 s.
    persist: function (save, reason) {
      UI.store.set(CFT.key(), save);
      if (!UI.me) return;
      var now = Date.now();
      if (reason === 'exit' || reason === 'now' || now - (CFT._last || 0) > 20000) CFT.push(save);
      else { clearTimeout(CFT._t); CFT._t = setTimeout(function () { CFT.push(save); }, 20000 - (now - CFT._last)); }
    },
    push: function (save, quiet) {
      if (!UI.me) return Promise.resolve();
      CFT._last = Date.now();
      clearTimeout(CFT._t);
      return UI.apiQuiet('put_save', save).then(function (r) { CFT.lastSync = Date.now(); return r; }, function (e) { if (!quiet) console.warn('save', e && e.message); });
    },
    reset: function () {
      UI.store.set(CFT.key(), null);
      return UI.me ? UI.apiQuiet('reset_save') : Promise.resolve();
    },
    photos: function () { return UI.store.get('photos.' + (UI.me ? UI.me.id : 'guest'), []); },
    addPhoto: function (url, meta) {
      var list = CFT.photos();
      list.unshift({ url: url, caption: meta.caption, day: meta.day, street: meta.street, at: Date.now() });
      while (list.length > 24) list.pop();
      try { UI.store.set('photos.' + (UI.me ? UI.me.id : 'guest'), list); } catch (e) { /* storage full */ }
    },
    bar: function (v, max, cls) { return '<div class="cf-bar ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, max ? v / max * 100 : 0)) + '%"></i></div>'; },
    money: function (n) { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('en-US'); },
  };
})();

/* ===== admin.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['overview', 'Overview', 'grid'], ['players', 'Players', 'star'], ['feedback', 'Feedback', 'inbox'], ['users', 'Users', 'users'], ['demo', 'Demo data', 'database']];

  UI.page('admin', { title: 'Admin', auth: 'admin' }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'overview';
    var fbFilter = 'new';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Admin</h1><p class="muted">Only admins see this page.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) {
        return '<a href="#admin/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav><div data-body><div class="ui-skel"></div></div></div>';
    var body = view.querySelector('[data-body]');

    function overview() {
      return UI.api('admin_overview').then(function (d) {
        var stat = function (n, label, go) { return '<a class="ui-card ui-stat" href="#admin/' + go + '" style="text-decoration:none;color:inherit"><b>' + n + '</b><span>' + label + '</span></a>'; };
        body.innerHTML = '<div class="ad-stats">' + stat(d.users, 'people signed up', 'users') + stat(d.admins, UI.plural(d.admins, 'admin').replace(/^\d+ /, ''), 'users') +
          stat(d.feedback_new, 'new feedback', 'feedback') + stat(d.players, 'players with a save', 'players') + '</div>' +
          '<p class="muted small" style="margin-top:18px">Demo data is <b>' + esc(d.demo.state) + '</b> (' + d.demo.counts.users + ' demo people). Manage it in the Demo data tab.</p>';
      });
    }

    function feedback() {
      return UI.api('list_feedback', null).then(function (d) {
        var items = d.items.filter(function (i) { return fbFilter === 'all' || i.status === fbFilter; });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['new', 'New'], ['read', 'Read'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          var n = f[0] === 'all' ? d.items.length : d.counts[f[0]];
          return '<button data-filter="' + f[0] + '" class="' + (fbFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + n + ')</button>';
        }).join('') + '</div></div>' +
          (items.length ? '<div class="ad-fb">' + items.map(function (i) {
            var c = i.context || {};
            return '<div class="ui-item" data-id="' + esc(i.id) + '"><div class="meta"><span class="ui-badge ' + (i.kind === 'bug' ? 'bad' : i.kind === 'idea' ? 'brand' : '') + '">' + esc(i.kind_label) + '</span>' +
              '<b>' + esc(i.name) + '</b>' + (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : '') + '<span>' + esc(UI.fmtDateTime(i.created)) + '</span></div>' +
              '<p class="msg">' + esc(i.message) + '</p>' +
              '<div class="ctx">' + esc([c.page, c.screen, c.theme, c.browser].filter(Boolean).join(' · ')) + '</div>' +
              '<textarea data-note placeholder="Private note (only admins see it)">' + esc(i.note) + '</textarea>' +
              '<div class="ui-row" style="margin-top:10px">' + ['new', 'read', 'done'].map(function (s) {
                return '<button class="ui-btn sm' + (i.status === s ? ' primary' : '') + '" data-status="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>';
              }).join('') + '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-fb>' + UI.icon('trash') + 'Delete</button></div></div>';
          }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No ' + (fbFilter === 'all' ? '' : fbFilter + ' ') + 'messages</h3><p>Messages from the "Send feedback" form show up here.</p></div>');
      });
    }

    function users(query) {
      return UI.api('list_users', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-search style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'person', 'people') + '</span></form>' +
          '<table class="ad-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Admin</th><th>Active</th></tr></thead><tbody>' +
          d.users.map(function (u) {
            return '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.name) + '</b></td><td class="email">' + esc(u.email) + '</td><td class="joined muted">' + esc(UI.fmtDate(u.joined)) + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-admin' + (u.is_admin ? ' checked' : '') + '> Admin</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-enabled' + (u.enabled ? ' checked' : '') + '> Active</label></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    function demo() {
      return UI.api('admin_overview').then(function (d) {
        var c = d.demo.counts;
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>Demo data</h3>' +
          '<p class="muted">Example people and content, so the app never looks empty for the first visitors. Demo rows are flagged, so removing them never touches real data. Once removed, it stays removed until you load it again.</p>' +
          '<p>Status: <b>' + esc(d.demo.state) + '</b> · ' + Object.keys(c).map(function (k) { return c[k] + ' ' + esc(k); }).join(', ') + '</p>' +
          '<div class="ui-row"><button class="ui-btn primary" data-demo="load">' + UI.icon('refresh') + (d.demo.state === 'loaded' ? 'Reload demo data' : 'Load demo data') + '</button>' +
          '<button class="ui-btn danger" data-demo="remove">' + UI.icon('trash') + 'Remove demo data</button></div></div>';
      });
    }

    function players(query) {
      return UI.api('admin_players', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-psearch style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by game name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'player') + '</span></form>' +
          '<p class="muted small">Game names show on the public leaderboard. Hide a player or reset a name that is not okay.</p>' +
          '<table class="ad-users"><thead><tr><th>Player</th><th>Email</th><th>Progress</th><th>Last played</th><th>Leaderboard</th></tr></thead><tbody>' +
          d.players.map(function (p) {
            return '<tr data-pid="' + esc(p.id) + '"><td><b>' + esc(p.name) + '</b>' + (p.demo ? ' <span class="ui-badge">demo</span>' : '') + '</td><td class="email">' + esc(p.email) + '</td>' +
              '<td class="muted small">Lv ' + p.level + ' · ' + CFT.money(p.worth) + ' · ' + p.missions + ' missions · ' + p.turfs + ' blocks · day ' + p.day + '</td>' +
              '<td class="joined muted">' + esc(UI.ago(p.updated)) + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-hide' + (p.hidden ? '' : ' checked') + '> Shown</label> <button class="ui-btn sm ghost" data-rename>Reset name</button></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    var DRAW = { overview: overview, players: players, feedback: feedback, users: users, demo: demo };

    view.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { fbFilter = f.getAttribute('data-filter'); feedback(); return; }
      var st = e.target.closest('[data-status]');
      if (st) {
        var card = st.closest('[data-id]');
        UI.api('set_feedback_status', card.getAttribute('data-id'), st.getAttribute('data-status'), card.querySelector('[data-note]').value).then(function () { UI.toast('Saved', 'ok'); feedback(); });
        return;
      }
      var del = e.target.closest('[data-del-fb]');
      if (del) {
        UI.confirm({ title: 'Delete this message?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_feedback', del.closest('[data-id]').getAttribute('data-id')).then(feedback);
        });
        return;
      }
      var rn = e.target.closest('[data-rename]');
      if (rn) {
        UI.confirm({ title: 'Reset this name to "Player"?', ok: 'Reset name' }).then(function (yes) {
          if (yes) UI.api('admin_set_player', rn.closest('[data-pid]').getAttribute('data-pid'), null, true).then(function () { UI.toast('Name reset', 'ok'); players(); });
        });
        return;
      }
      var dm = e.target.closest('[data-demo]');
      if (dm) {
        var load = dm.getAttribute('data-demo') === 'load';
        UI.confirm({ title: load ? 'Load the demo data?' : 'Remove the demo data?', text: load ? 'Demo people and content are added (any old demo rows are replaced).' : 'Every demo row is deleted. Real data stays.', ok: load ? 'Load' : 'Remove', danger: !load })
          .then(function (yes) { if (yes) UI.busy(dm, UI.api(load ? 'demo_load' : 'demo_remove')).then(function () { UI.toast('Done', 'ok'); demo(); }); });
      }
    });
    view.addEventListener('change', function (e) {
      var prow = e.target.closest('tr[data-pid]');
      if (prow && e.target.hasAttribute('data-hide')) {
        var box0 = e.target;
        UI.api('admin_set_player', prow.getAttribute('data-pid'), !box0.checked, null).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box0.checked = !box0.checked; UI.toast(err.message, 'error'); });
        return;
      }
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id'), box = e.target;
      var fn = box.hasAttribute('data-admin') ? 'set_admin' : box.hasAttribute('data-enabled') ? 'set_enabled' : null;
      if (fn) UI.api(fn, id, box.checked).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
    });
    view.addEventListener('submit', function (e) {
      if (e.target.matches('[data-search]')) { e.preventDefault(); users(UI.formData(e.target).q); }
      if (e.target.matches('[data-psearch]')) { e.preventDefault(); players(UI.formData(e.target).q); }
    });
    return DRAW[tab]();
  });
})();

/* ===== album.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('album', { title: 'Album', nav: 'Album', icon: 'image', order: 4 }, function (view) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="min-height:240px"></div></div>';
    return CFT.data().then(function () { return CFT.loadSave(); }).then(function (s) {
      var D = window.CFT_DATA, st = (s && s.stickers) || {};
      var have = Object.keys(st).filter(function (k) { return st[k] > 0; }).length, total = CFTGame.STICKERS.length;
      var photos = CFT.photos();
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Album</h1><p class="muted">' + have + ' of ' + total + ' stickers. Find sticker packs 🎴 on the street, buy them at bookshops and gift shops, or chat with strangers. Each full set gives a bonus forever.</p></div>' +
        '<div style="min-width:200px">' + CFT.bar(have, total, 'gold') + '</div></div>' +
        '<div class="al-sets">' + D.STICKER_SETS.map(function (set) {
          var done = set.items.every(function (x) { return st[x[0]] > 0; });
          return '<div class="cf-sticker-card al-set ' + (done ? 'done' : '') + '"><h3>' + esc(set.n) + (set.rare ? ' ✨' : '') + '</h3><div class="al-bonus">' + (done ? '✅ ' : '🎁 ') + esc(set.bonusText) + '</div><div class="al-grid">' +
            set.items.map(function (x) { return '<div class="al-st ' + (st[x[0]] > 0 ? 'got' : '') + '" title="' + esc(x[2]) + '"><span class="cf-emoji">' + (st[x[0]] > 0 ? x[1] : '?') + '</span>' + (st[x[0]] > 1 ? '<i>×' + st[x[0]] + '</i>' : '') + '</div>'; }).join('') + '</div></div>';
        }).join('') + '</div>' +
        '<h2 style="margin-top:36px">📸 Photos</h2>' + (photos.length ? '<div class="al-photos">' + photos.map(function (p) {
          return '<figure class="al-photo" style="margin:0"><img src="' + esc(p.url) + '" alt="' + esc(p.caption || 'A photo from the game') + '"><p>' + esc(p.caption || '') + '</p><small>Day ' + esc(p.day) + (p.street ? ' · ' + esc(p.street) : '') + '</small></figure>';
        }).join('') + '</div>' : '<div class="ui-empty"><h3>No photos yet</h3><p>Photo missions (Noor the photographer has lots) save a snapshot of your city here. Photos stay on this device.</p></div>') + '</div>';
    });
  });
})();

/* ===== auth.html ===== */
(function () {
  var esc = UI.esc;
  function pw(name, auto) {
    return '<div class="au-pw"><input type="password" name="' + name + '" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-show>Show</button></div>';
  }
  UI.page('auth', { title: 'Sign in', auth: 'guest' }, function (view, ctx) {
    var mode = ['signup', 'reset'].indexOf(ctx.args[0]) >= 0 ? ctx.args[0] : 'login';
    function draw(msg, isErr) {
      var heading = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
      var sub = { login: 'Sign in to continue to ' + esc(UI.config.name) + '.', signup: 'It\'s free and takes a few seconds.',
        reset: 'We\'ll email you a link to choose a new password.' }[mode];
      view.innerHTML = '<div class="au-wrap"><div class="ui-card au-card">' +
        '<h1>' + heading + '</h1><p class="muted">' + sub + '</p>' +
        (mode !== 'reset' ? '<div class="ui-seg" role="tablist"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Sign in</button>' +
          '<button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>' : '<div style="height:14px"></div>') +
        '<form class="ui-stack" data-form="' + mode + '" novalidate>' +
        (mode === 'signup' ? '<label class="ui-field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="60"></label>' : '') +
        '<label class="ui-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
        (mode === 'login' ? '<label class="ui-field"><span>Password</span>' + pw('password', 'current-password') + '</label>' : '') +
        (mode === 'signup' ? '<label class="ui-field"><span>Password <em>(at least 8 characters)</em></span>' + pw('password', 'new-password') + '</label>' +
          (window.LegalKit ? '<div>' + LegalKit.consentField() + '</div>' : '') : '') +
        '<div data-msg role="alert"' + (msg ? ' class="' + (isErr ? 'ui-error' : 'ui-note') + '">' + esc(msg) : ' hidden>') + '</div>' +
        '<button class="ui-btn primary block" type="submit">' + { login: 'Sign in', signup: 'Create account', reset: 'Send the link' }[mode] + '</button></form>' +
        '<div class="au-links">' + (mode === 'login' ? '<a data-mode="reset">Forgot your password?</a>' : '<a data-mode="login">' + UI.icon('back') + ' Back to sign in</a>') +
        '<a href="#landing" data-go="landing">About ' + esc(UI.config.name) + '</a></div></div></div>';
      var first = view.querySelector('input');
      if (first && !msg) first.focus();
    }
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { e.preventDefault(); mode = m.getAttribute('data-mode'); history.replaceState(null, '', '#auth' + (mode === 'login' ? '' : '/' + mode)); draw(); return; }
      var s = e.target.closest('[data-show]');
      if (s) { var i = s.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; s.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, v = UI.formData(form);
      var problem = !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email address.'
        : mode !== 'reset' && (v.password || '').length < (mode === 'signup' ? 8 : 1) ? (mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.')
        : mode === 'signup' && (v.name || '').trim().length < 2 ? 'Please tell us your name.' : null;
      if (problem) { say(problem, true); return; }
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;  // the kit shows its own message
      UI.busy(form.querySelector('[type=submit]'), UI.auth(mode, v)).then(function (r) {
        if (mode === 'reset' || (r && !r.me)) { mode = 'login'; draw(r && r.message, false); restore({ email: v.email }); }
        else UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    });
    function say(msg, isErr) {
      var box = view.querySelector('[data-msg]');
      box.className = isErr ? 'ui-error' : 'ui-note'; box.textContent = msg; box.hidden = false;
    }
    function restore(v) {
      ['name', 'email'].forEach(function (k) { var i = view.querySelector('[name=' + k + ']'); if (i && v[k]) i.value = v[k]; });
    }
    draw();
  });
})();

/* ===== landing.html ===== */
(function () {
  var COPY = {
    eyebrow: 'A life sim on your real streets',
    title: 'Your neighbourhood. <em>A whole new life.</em>',
    lead: 'Type your address and the real streets around it become a 3D city full of people. Run errands for the neighbours, make friends, fall in love, open a pizzeria, win the blocks back from the Pigeon Mafia.',
    proof: ['🗺️ Any city on Earth', '📜 150+ missions', '📱 Phone & computer', '💸 Free'],
    stepsTitle: 'How it works',
    stepsLead: 'From a borrowed couch to the penthouse.',
    steps: [['🏠', 'Move in', 'Type your address (or pick Montréal or New York). Your street, your corner café, your park: built from OpenStreetMap.'],
            ['🏃', 'Hustle', 'Collect coins, books and roses. Do errands for Nonna Rosa. Odd jobs, a lemonade stand, a skateboard.'],
            ['🌇', 'Live it up', 'Friends, a partner, a wedding, kids, a dog, a fleet of businesses and the best view in the city.']],
    featuresTitle: 'Everything in the game',
    features: [
      ['📜', '153 missions', 'A ten-chapter story plus side quests. Every one happens at a real café, park, school or shop near you.'],
      ['🧑‍🤝‍🧑', 'A living city', 'People walk their dogs, cars honk, pigeons scatter. Say hi to anyone: sometimes they tip you.'],
      ['💘', 'Love & family', 'Meet Sam at the flower shop. Dates at sunset, a ring, a wedding, a baby who loses Mr. Snuggles.'],
      ['🤝', 'Friends with perks', 'A gamer, a DJ, a photographer, a foodie, a mechanic... 14 friends, each with a bonus.'],
      ['💼', '15 businesses', 'Lemonade stand to boutique hotel. Upgrade, hire managers, run rush-hour deliveries to real addresses.'],
      ['🏠', 'Better homes', 'Couch, basement, one-bedroom, loft, townhouse, then the top floor of the tallest tower around.'],
      ['🎨', 'Take over the blocks', 'Twelve crews run the blocks. Tag their posters, then beat the boss at a race, dance-off, quiz or chase.'],
      ['🛵', 'Wheels', 'Skateboard, kick scooter, bike, Vespa, compact car, family SUV, sports car.'],
      ['🎴', '72 stickers', 'Twelve sticker sets to complete, each with a permanent bonus. Plus a photo album of your city.'],
      ['💪', 'Stats that matter', 'Fitness, Charm, Smarts, Style and Street cred change your speed, your dates, your income and your discounts.'],
      ['🌙', 'Day & night', 'A full day every 24 minutes. Lit windows at night, rent at midnight, golden-hour photo shoots.'],
      ['🚇', 'Metro', 'Unlock real metro entrances and ride between them.']],
    cast: ['🧔 Cousin Max', '👵 Nonna Rosa', '🏃‍♀️ Coach Kim', '👩‍💼 Priya', '🧑‍🔧 Dmitri', '🧑‍🎨 Luna', '🛹 Kai', '🎮 Jay', '📸 Noor', '🍜 Benny', '🎧 Zoe', '🐶 Ollie', '🌷 Sam', '🧑‍🍳 Chef Tomás', '🤑 Chad Moneybags'],
    faq: [['Is it really my street?', 'Yes. The buildings, streets, parks, rivers, house numbers and shop names come from OpenStreetMap, the free world map made by volunteers. Heights are guessed where the map has none, so your building might be a floor or two off.'],
          ['Do I need an account?', 'No. Press Play and go: your game is saved in this browser. Create a free account to save it to the cloud, keep it across devices and appear on the leaderboard.'],
          ['Who sees my address?', 'Nobody else. The address you type is looked up on OpenStreetMap\'s search to find it on the map. If you have an account, it\'s stored with your save so your world loads in the same place. Other players only see the name you choose.'],
          ['Does it work on my phone?', 'Yes, in any modern browser. Drag on the left to walk, drag on the right to look. Phones get lighter graphics automatically.'],
          ['Is it free?', 'Yes. No ads, no in-app purchases. All the money in the game is pretend money.'],
          ['What do I need?', 'An internet connection (the map streams in as you explore) and a browser with WebGL, which every recent browser has.']],
  };

  function heroArt() {
    // A sticker-style city block: buildings, a street, a runner, a coin, a mission marker, a heart, a scooter.
    var b = function (x, y, w, h, fill, rows, cols) {
      var s = '<rect class="ink" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"/>';
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) s += '<rect class="' + ((r + c) % 3 ? 'win' : 'wind') + '" x="' + (x + 12 + c * ((w - 24) / cols)) + '" y="' + (y + 14 + r * 30) + '" width="' + ((w - 24) / cols - 10) + '" height="18" rx="3"/>';
      return s;
    };
    return '<div class="lp-art" aria-hidden="true"><svg class="lp-svg" viewBox="0 0 520 470" xmlns="http://www.w3.org/2000/svg">' +
      '<rect class="sky ink" x="4" y="4" width="512" height="462" rx="40"/>' +
      '<circle cx="430" cy="80" r="40" fill="#ffc21f" class="ink"/>' +
      '<path d="M40 70 q20-22 44 0 q18-16 34 2 q-4 14-24 12 h-46 q-16-2-8-14z" fill="#fff" class="ink"/>' +
      b(36, 150, 110, 206, '#ff8a3d', 6, 2) + b(150, 96, 120, 260, '#ffffff', 8, 3) + b(274, 176, 96, 180, '#20c997', 5, 2) + b(374, 130, 110, 226, '#ff5c8a', 7, 2) +
      '<path d="M150 96 l60 -34 l60 34z" fill="#6b4eff" class="ink"/>' +
      '<rect class="walk ink" x="6" y="356" width="508" height="28"/><rect class="road" x="8" y="386" width="504" height="70" rx="0"/>' +
      '<g fill="#fff">' + [30, 110, 190, 270, 350, 430].map(function (x) { return '<rect x="' + x + '" y="417" width="44" height="7" rx="3"/>'; }).join('') + '</g>' +
      '<g transform="translate(212 300)"><rect class="ink" x="-14" y="0" width="28" height="34" rx="6" fill="#6b4eff"/><circle class="ink" cx="0" cy="-12" r="13" fill="#e9b98f"/><path d="M-13 -18 q13 -14 26 0" fill="#3a2618" class="ink"/>' +
      '<path class="ink" d="M-8 34 l-10 22 M8 34 l12 20" fill="none" stroke-linecap="round"/><path class="ink" d="M-14 8 l-14 14 M14 8 l14 -12" fill="none" stroke-linecap="round"/></g>' +
      '<g class="lp-bob"><path transform="translate(212 252)" d="M-26 0 h30 v-12 l22 18 -22 18 v-12 h-30z" fill="#ffc21f" class="ink"/></g>' +
      '<g transform="translate(330 306)"><rect class="ink" x="-13" y="0" width="26" height="32" rx="6" fill="#9b2c4f"/><circle class="ink" cx="0" cy="-11" r="12" fill="#f1c9a5"/><path d="M-12 -16 q12 -12 24 0" fill="#d9d4cc" class="ink"/>' +
      '<path class="ink" d="M-7 32 l-4 18 M7 32 l4 18" fill="none" stroke-linecap="round"/></g>' +
      '<g class="lp-bob2"><g transform="translate(330 250)"><rect class="ink" x="-17" y="-22" width="34" height="38" rx="10" fill="#ffc21f"/><text x="0" y="8" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="30" fill="#1f1a3d">!</text></g></g>' +
      '<g class="lp-bob"><circle cx="110" cy="320" r="17" fill="#ffd54a" class="ink"/><text x="110" y="327" text-anchor="middle" font-size="18" font-weight="800" fill="#a35f00" font-family="Fredoka, sans-serif">$</text></g>' +
      '<g class="lp-bob2"><circle cx="440" cy="318" r="17" fill="#ffd1dc" class="ink"/><path d="M440 326 c-7-6 -14-9 -14-15 a6 6 0 0 1 14 -2 a6 6 0 0 1 14 2 c0 6 -7 9 -14 15z" fill="#ff5c8a"/></g>' +
      '<g class="lp-bob2"><path class="ink" d="M90 232 c-12-14 -34-2 -22 16 l22 20 l22 -20 c12-18 -10-30 -22-16z" fill="#ff5c8a"/></g>' +
      '<g transform="translate(410 412)"><rect class="ink" x="-34" y="-20" width="60" height="22" rx="10" fill="#7fd1c7"/><path class="ink" d="M22 -20 l10 -26 h12" fill="none" stroke-linecap="round"/>' +
      '<circle cx="-24" cy="6" r="11" fill="#222" class="ink"/><circle cx="24" cy="6" r="11" fill="#222" class="ink"/></g>' +
      '<rect x="4" y="4" width="512" height="462" rx="40" fill="none" class="ink"/>' +
      '</svg></div>';
  }

  UI.page('landing', { title: 'Welcome' }, function (view, ctx) {
    var me = ctx.me, C = COPY, esc = UI.esc;
    var primary = '<a class="ui-btn primary lg" href="#play" data-go="play">🎮 ' + (me ? 'Keep playing' : 'Play now, it\'s free') + '</a>' +
      (me ? '<a class="ui-btn lg" href="#life" data-go="life">My life</a>' : '<a class="ui-btn lg" href="#auth/signup" data-go="auth/signup">Create an account</a>');
    view.innerHTML =
      '<section class="lp-hero"><div class="ui-wrap"><div>' +
        '<div class="eyebrow">' + esc(C.eyebrow) + '</div><h1>' + C.title + '</h1><p class="lp-lead">' + esc(C.lead) + '</p>' +
        '<div class="lp-cta">' + primary + '</div>' +
        '<div class="lp-proof">' + C.proof.map(function (p) { return '<span class="cf-pill cf-emoji">' + esc(p) + '</span>'; }).join('') + '</div>' +
      '</div>' + heroArt() + '</div></section>' +
      '<section class="lp-section" id="how"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.stepsTitle) + '</h2><p>' + esc(C.stepsLead) + '</p></div>' +
        '<div class="lp-steps">' + C.steps.map(function (s) { return '<div class="ui-card lp-step"><span class="cf-emoji">' + s[0] + '</span><h3>' + esc(s[1]) + '</h3><p class="muted">' + esc(s[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.featuresTitle) + '</h2><p>Grown from a coin-collecting game into a full city life.</p></div>' +
        '<div class="lp-feats">' + C.features.map(function (f) { return '<div class="ui-card lp-feat"><span class="cf-emoji">' + f[0] + '</span><h3>' + esc(f[1]) + '</h3><p>' + esc(f[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Meet the neighbours</h2><p>They all need a hand with something.</p></div><div class="lp-cast">' +
        C.cast.map(function (c) { return '<span class="cf-emoji">' + esc(c) + '</span>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Questions</h2></div><div class="lp-faq">' +
        C.faq.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-band"><div><h2>Cousin Max is waiting with the couch.</h2><p>No download. Press play, type your address, go.</p></div>' +
        '<a class="ui-btn accent lg" href="#play" data-go="play">🎮 Play now</a></div></div></section>';
  });
})();

/* ===== life.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('life', { title: 'My life', nav: 'Life', icon: 'heart', auth: 'user', order: 2 }, function (view, ctx) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="min-height:180px"></div></div>';
    function welcome(adopt) {
      view.innerHTML = '<div class="ui-wrap"><div class="cf-sticker-card lf-welcome"><div class="big">🧳</div><h1>Your new life starts at your front door</h1>' +
        '<p class="muted" style="max-width:560px;margin:0 auto">Type your address and your real neighbourhood turns into a 3D city full of people. Cousin Max has a couch for you. The rest is up to you.</p>' +
        '<div class="lf-steps"><div><b>1. Move in</b><p class="muted small">Pick your street, your name and your look.</p></div><div><b>2. Hustle</b><p class="muted small">Coins, errands, odd jobs, a lemonade stand.</p></div><div><b>3. Live it up</b><p class="muted small">Friends, love, a family, a penthouse, the whole neighbourhood.</p></div></div>' +
        (adopt ? '<p class="ui-note">We found a game you played on this device before signing in (' + esc(adopt.name) + ', level ' + CFTGame.levelOf(adopt.xp) + '). Press Play to keep it.</p>' : '') +
        '<a class="ui-btn primary lg cf-hero-btn" href="#play" data-go="play">🎮 ' + (adopt ? 'Keep playing' : 'Start my new life') + '</a></div></div>';
    }
    function draw(s) {
      var S = CFTGame.summary(s), D = window.CFT_DATA, lv = S.level, a = CFTGame.xpAt(lv), b = CFTGame.xpAt(lv + 1);
      var track = s.track && s.m[s.track] && s.m[s.track].s === 'active' ? s.track : null;
      var M = track ? (CFTGame.MISSION[track] || (s.dyn || {})[track]) : null;
      var stats = D.STATS.map(function (st) { var v = s.stats[st.id] || 0; return '<div class="lf-stat"><span class="cf-emoji">' + st.e + '</span><div>' + st.name + CFT.bar(v % 1, 1, 'mint') + '</div><span>' + Math.floor(v) + '</span></div>'; }).join('');
      var love = s.partner ? '<p class="lf-big">' + D.CAST[s.partner].e + ' ' + esc(D.CAST[s.partner].n) + '</p><p class="muted">' + (s.married ? 'Married 💒' : s.engaged ? 'Engaged 💍' : 'Your ' + (s.pref === 'bf' ? 'boyfriend' : 'girlfriend')) + '</p>' : '<p class="muted">Single, for now. Nonna Rosa has opinions about that.</p>';
      if (s.kids.length) love += '<div class="lf-chips">' + s.kids.map(function (k) { return '<span class="cf-pill">' + (s.day - k.born > 12 ? '🧒' : '👶') + ' ' + esc(k.name) + '</span>'; }).join('') + '</div>';
      if (s.pets.length) love += '<div class="lf-chips" style="margin-top:8px">' + s.pets.map(function (p) { return '<span class="cf-pill">' + (p.kind === 'dog' ? '🐕' : '🐈') + ' ' + esc(p.name) + '</span>'; }).join('') + '</div>';
      var friends = Object.keys(s.friends || {});
      var biz = Object.keys(s.biz || {});
      var apt = D.APARTMENTS[s.apt.tier];
      view.innerHTML = '<div class="ui-wrap">' +
        '<section class="lf-hero"><div class="lf-av">' + esc(UI.initials(s.name)) + '</div><div><h1>' + esc(s.name) + '</h1><div class="sub">⭐ Level ' + lv + ' · Day ' + s.day + ' · ' + esc(S.home) + '</div>' + CFT.bar(s.xp - a, b - a) + '</div>' +
        '<div class="lf-play"><div class="lf-money">' + CFT.money(s.money) + '</div><span class="cf-pill gold">Net worth ' + CFT.money(S.worth) + '</span><a class="ui-btn accent lg cf-hero-btn" href="#play" data-go="play">🎮 Play</a></div></section>' +
        '<div class="lf-grid">' +
        '<div class="lf-card ' + (M ? 'lf-now' : '') + '"><h3><span class="cf-emoji">🎯</span> Right now</h3>' + (M ? '<p class="lf-big">' + esc(M.title) + '</p><p class="muted">Step ' + (s.m[track].st + 1) + ' of ' + M.steps.length + ': ' + esc(stepText(s, track, M)) + '</p>'
          : '<p class="lf-big">Free roaming</p><p class="muted">' + G_open(s) + ' people in the neighbourhood have a mission for you.</p>') + '<a class="ui-btn sm" href="#quests" data-go="quests">All quests</a></div>' +
        '<div class="lf-card"><h3><span class="cf-emoji">' + apt.e + '</span> Home</h3><p class="lf-big">' + esc(apt.n) + '</p><p class="muted">' + esc(s.apt.label || '') + '</p><p class="small">' + (apt.rent ? CFT.money(apt.rent) + ' rent / day' : 'Owned, no rent') + ' · +' + apt.happy + ' 😊</p></div>' +
        '<div class="lf-card"><h3><span class="cf-emoji">💘</span> Love & family</h3>' + love + '</div>' +
        '<div class="lf-card"><h3><span class="cf-emoji">📊</span> Stats</h3>' + stats + '<div class="lf-stat"><span class="cf-emoji">😊</span><div>Happiness' + CFT.bar(s.happy, 100, 'pink') + '</div><span>' + Math.round(s.happy) + '%</span></div></div>' +
        '<div class="lf-card"><h3><span class="cf-emoji">🤝</span> Friends (' + friends.length + ')</h3>' + (friends.length ? '<div class="lf-list">' + friends.map(function (id) { var c = D.CAST[id]; return '<div class="lf-li"><span class="cf-emoji">' + c.e + '</span><div><b>' + esc(c.n) + '</b><small>' + esc(D.FRIEND_PERKS[id] || '') + '</small></div></div>'; }).join('') + '</div>' : '<p class="muted">Help people with missions and they\'ll become friends. Every friend has a perk.</p>') + '</div>' +
        '<div class="lf-card"><h3><span class="cf-emoji">💼</span> Businesses (' + biz.length + ')</h3>' + (biz.length ? '<div class="lf-list">' + biz.map(function (id) { var d = CFTGame.BIZ[id], x = s.biz[id]; return '<div class="lf-li"><span class="cf-emoji">' + d.e + '</span><div><b>' + esc(x.name) + ' ' + '★'.repeat(x.lvl) + '</b><small>' + esc(d.n) + (x.mgr ? ' · managed' : '') + '</small></div></div>'; }).join('') + '</div>' : '<p class="muted">A lemonade stand is $60. A boutique hotel is $1.5 million. Everything in between is up to you.</p>') + '</div>' +
        '<div class="lf-card"><h3><span class="cf-emoji">🎨</span> Blocks</h3><p class="lf-big">' + S.turfs + ' block' + (S.turfs === 1 ? '' : 's') + ' won</p><p class="muted">' + (S.turfs ? 'The crews have respect for you. Watch for rival tags.' : 'Pigeon Mafia, Skate Rats, Bingo Grannies... Every block has a crew to win over.') + '</p></div>' +
        '<div class="lf-card"><h3><span class="cf-emoji">🎴</span> Collection</h3><p class="lf-big">' + S.stickers + ' / ' + S.stickersTotal + ' stickers</p>' + CFT.bar(S.stickers, S.stickersTotal, 'gold') + '<p class="muted small" style="margin-top:8px">' + S.missions + ' of ' + S.missionsTotal + ' missions done</p><a class="ui-btn sm" href="#album" data-go="album">Open the album</a></div>' +
        '<div class="lf-card wide"><h3><span class="cf-emoji">📔</span> Diary</h3><div class="lf-diary">' + ((s.log || []).slice(0, 16).map(function (l) { return '<div><span>' + esc(l.e) + '</span><span>' + esc(l.t) + '</span><small>Day ' + l.d + '</small></div>'; }).join('') || '<p class="muted">Nothing yet. Go make some memories.</p>') + '</div></div>' +
        '</div><p class="muted small" style="margin-top:20px">Saved ' + (s.updated ? UI.ago(new Date(s.updated).toISOString()) : 'just now') + ' · <a href="#ranks" data-go="ranks">See the leaderboard</a></p></div>';
    }
    function stepText(s, id, M) {
      var ms = s.m[id], st = M.steps[ms.st] || {}, bf = s.pref === 'bf';
      var left = st.do === 'deliver' ? (st.n || 1) - (ms.p || 0) : '';
      return String(st.text || '').replace(/\{place\}/g, (ms.tg && ms.tg.name) || 'a spot nearby').replace(/\{n\}/g, left)
        .replace(/\{pt\}/g, bf ? 'boyfriend' : 'girlfriend').replace(/\{kid\}/g, s.kids[0] ? s.kids[0].name : 'your kid').replace(/\{name\}/g, s.name)
        .replace(/\{he\}/g, bf ? 'he' : 'she').replace(/\{him\}/g, bf ? 'him' : 'her').replace(/\{his\}/g, bf ? 'his' : 'her');
    }
    function G_open(s) { return CFTGame.MISSION ? window.CFT_DATA.MISSIONS.filter(function (m) { return !s.m[m.id] && CFTGame.reqMet(s, m) || (s.m[m.id] && s.m[m.id].s === 'open'); }).length : 0; }
    return CFT.data().then(function () { return CFT.loadSave(); }).then(function (s) {
      if (!s) return welcome(CFT.adopt);
      draw(CFTGame.migrate(s));
    });
  });
})();

/* ===== play.html ===== */
(function () {
  UI.page('play', { title: 'Play', nav: 'Play', icon: 'map', order: 1, chrome: false }, function (view, ctx) {
    view.innerHTML = '<div class="cft-root"><div class="cft-loading"><div class="cft-spin">🏙️</div><p>Getting the city ready...</p></div></div>';
    var root = view.querySelector('.cft-root');
    var game = null, dead = false;
    function exit() { UI.go(ctx.me ? 'life' : 'landing'); }
    var ready = CFT.load().then(function () { return CFT.loadSave(); }).then(function (save) {
      if (dead) return;
      if (!save && CFT.adopt) { save = CFT.adopt; CFT.adopt = null; CFT.push(save); }
      game = CFTGame.mount(root, {
        save: save, me: ctx.me,
        onSave: function (s, reason) { CFT.persist(s, reason); },
        onPhoto: function (url, meta) { CFT.addPhoto(url, meta); },
        onExit: exit,
        onReset: function () { CFT.reset().then(function () { if (game) { game.destroy(); game = null; } UI.refresh(); }); },
      });
      window.CFT_GAME = game;
    });
    function hide() { if (document.hidden && game && game.G.saveNow) game.G.saveNow('now'); }
    document.addEventListener('visibilitychange', hide);
    return {
      ready: ready,
      destroy: function () { dead = true; document.removeEventListener('visibilitychange', hide); if (game) game.destroy(); game = null; window.CFT_GAME = null; },
    };
  });
})();

/* ===== profile.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('profile', { title: 'Your profile', auth: 'user' }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="pf-head"><span class="ui-avatar">' + esc(UI.initials(me.name)) + '</span>' +
      '<div><h1>' + esc(me.name) + '</h1><div class="muted">' + esc(me.email) + (me.joined ? ' · member since ' + esc(UI.fmtDate(me.joined, { month: 'long', year: 'numeric' })) : '') + '</div></div></div>' +
      '<div class="pf-grid"><form class="ui-card ui-stack" data-name><h3>Your name</h3><label class="ui-field"><span>Shown to other people</span>' +
      '<input type="text" name="name" value="' + esc(me.name) + '" maxlength="60" required></label><button class="ui-btn primary" type="submit">Save</button></form>' +
      '<div class="ui-card ui-stack"><h3>Appearance</h3><p class="muted small">Follow your device, or pick one.</p><div data-theme-box></div>' +
      '<h3 style="margin-top:22px">Password</h3><p class="muted small">We\'ll email you a link to choose a new one.</p>' +
      '<button class="ui-btn" data-reset>' + UI.icon('mail') + 'Email me a reset link</button></div></div>' +
      '<div class="ui-card" style="margin-top:16px"><div class="pf-links">' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<button data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms, and your data</button>' +
      '<button data-signout-here>' + UI.icon('logout') + 'Sign out</button></div></div></div>';
    function themeBox() {
      var t = UI.theme();
      view.querySelector('[data-theme-box]').innerHTML = '<div class="ui-seg">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" data-theme-pick="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    themeBox();
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme-pick]');
      if (t) { UI.setTheme(t.getAttribute('data-theme-pick')); themeBox(); UI.renderChrome(); return; }
      if (e.target.closest('[data-reset]')) {
        UI.busy(e.target.closest('[data-reset]'), UI.auth('reset', { email: me.email })).then(function (r) { UI.toast(r.message, 'ok'); });
      }
      if (e.target.closest('[data-signout-here]')) UI.auth('logout');
    });
    view.querySelector('[data-name]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_profile', v.name)).then(function (r) {
        UI.setMe(r.me); ctx.me = r.me; UI.toast('Saved', 'ok');
        view.querySelector('.pf-head h1').textContent = r.me.name;
      });
    });
  });
})();

/* ===== quests.html ===== */
(function () {
  var esc = UI.esc;
  var FILTERS = [['all', 'All'], ['active', 'Active'], ['open', 'Available'], ['done', 'Done'], ['locked', 'Locked']];
  function stepLabel(st, s) {
    var t = (st.text || st.do).replace(/\{place\}/g, 'a nearby spot').replace(/\{n\}/g, '').replace(/\{pt\}/g, s && s.pref === 'bf' ? 'boyfriend' : 'girlfriend')
      .replace(/\{kid\}/g, s && s.kids[0] ? s.kids[0].name : 'your kid').replace(/\{he\}/g, 'they').replace(/\{him\}|\{his\}/g, 'them').replace(/\{name\}/g, s ? s.name : 'you');
    return t.replace(/\s*\(\s*left\)/, '');
  }
  function rewardPills(r) {
    var D = window.CFT_DATA, out = [];
    if (r.money) out.push('<span class="cf-pill gold">💵 ' + CFT.money(r.money) + '</span>');
    if (r.xp) out.push('<span class="cf-pill grape">⭐ ' + r.xp + ' XP</span>');
    Object.keys(r.stats || {}).forEach(function (k) { var st = D.STATS.filter(function (x) { return x.id === k; })[0]; out.push('<span class="cf-pill">' + st.e + ' +' + r.stats[k] + ' ' + st.name + '</span>'); });
    Object.keys(r.items || {}).forEach(function (k) { if (r.items[k] > 0) out.push('<span class="cf-pill">' + D.ITEMS[k].e + ' ' + esc(D.ITEMS[k].n) + '</span>'); });
    if (r.friend) out.push('<span class="cf-pill pink">🤝 New friend</span>');
    if (r.partner) out.push('<span class="cf-pill pink">💘 Love</span>');
    if (r.married) out.push('<span class="cf-pill pink">💒 Wedding</span>');
    if (r.kid) out.push('<span class="cf-pill pink">👶 Baby</span>');
    if (r.happy) out.push('<span class="cf-pill">😊 +' + r.happy + '</span>');
    return out.join('');
  }
  UI.page('quests', { title: 'Quests', nav: 'Quests', icon: 'star', order: 3 }, function (view, ctx) {
    var filter = FILTERS.some(function (f) { return f[0] === ctx.args[0]; }) ? ctx.args[0] : 'all';
    var save = null, board = null;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="min-height:240px"></div></div>';
    function draw() {
      var D = window.CFT_DATA, all = [];
      board.forEach(function (c) { all = all.concat(c.missions); });
      var count = function (st) { return all.filter(function (m) { return st === 'all' || m.status === st; }).length; };
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Quests</h1><p class="muted">' + D.MISSIONS.length + ' missions across ' + D.CHAPTERS.length + ' chapters. Missions happen at real places around your home.</p></div>' +
        '<a class="ui-btn primary" href="#play" data-go="play">🎮 Play</a></div>' +
        (save ? '' : '<p class="ui-note" style="margin-bottom:16px">You haven\'t started yet. Everything below is waiting for you.</p>') +
        '<div class="qs-filters">' + FILTERS.map(function (f) { return '<button type="button" data-filter="' + f[0] + '" class="' + (filter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + count(f[0]) + ')</button>'; }).join('') + '</div>' +
        board.map(function (c) {
          var list = c.missions.filter(function (m) { return filter === 'all' || m.status === filter; });
          if (!list.length) return '';
          var done = c.missions.filter(function (m) { return m.status === 'done'; }).length;
          return '<section class="qs-ch"><div class="qs-ch-h"><span class="cf-emoji">' + c.ch.e + '</span><div class="grow"><h2>' + (c.ch.id < 10 ? 'Chapter ' + c.ch.id + ': ' : '') + esc(c.ch.n) + '</h2><p class="muted small">' + esc(c.ch.blurb) + '</p></div>' +
            '<div><span class="small muted">' + done + ' / ' + c.missions.length + '</span>' + CFT.bar(done, c.missions.length, 'mint') + '</div></div><div class="qs-list">' +
            list.map(function (m) {
              return '<button type="button" class="qs-m ' + m.status + '" data-m="' + m.id + '"><span class="cf-emoji">' + (m.status === 'locked' ? '🔒' : m.giver.e) + '</span><span class="grow"><b>' + esc(m.title) + '</b><small>' + esc(m.giver.n) + (m.tracked ? ' · 🎯 tracking' : '') + '</small></span>' +
                '<span class="qs-st ' + m.status + '">' + { done: 'Done', active: 'Active', open: 'New', locked: 'Locked' }[m.status] + '</span></button>';
            }).join('') + '</div></section>';
        }).join('') + '</div>';
    }
    function show(id) {
      var D = window.CFT_DATA, M = CFTGame.MISSION[id], c = D.CAST[M.giver];
      var st = save && save.m[id], status = st ? st.s : (save && CFTGame.reqMet(save, M) ? 'open' : 'locked');
      var cur = st && st.s === 'active' ? st.st : st && st.s === 'done' ? 99 : -1;
      var req = M.req || {}, reqs = [];
      (req.m || []).forEach(function (r) { var x = CFTGame.MISSION[r]; reqs.push((save && save.m[r] && save.m[r].s === 'done' ? '✅ ' : '⬜ ') + esc(x ? x.title : r)); });
      if (req.lvl) reqs.push('⭐ Level ' + req.lvl);
      if (req.partner) reqs.push('💘 Be in a relationship');
      if (req.stat) Object.keys(req.stat).forEach(function (k) { reqs.push('📊 ' + k + ' ' + req.stat[k]); });
      var m = UI.modal('<div class="ui-row" style="gap:12px;margin-bottom:6px"><span class="cf-emoji" style="font-size:2.4rem">' + c.e + '</span><div><h2 style="margin:0">' + esc(M.title) + '</h2><p class="muted" style="margin:0">' + esc(c.n) + ' · ' + esc(c.role) + '</p></div></div>' +
        (status === 'locked' ? '<p class="muted">Unlocks after:</p><ul>' + reqs.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>'
          : '<p class="qs-quote">"' + esc(M.intro[0].replace(/^[^:]{2,24}:\s/, '').replace(/\{place\}/g, 'a place nearby').replace(/\{name\}/g, save ? save.name : 'friend')) + '"</p>' +
            '<ol class="qs-steps">' + M.steps.map(function (s, i) { return '<li class="' + (i < cur ? 'done' : i === cur ? 'now' : '') + '">' + esc(stepLabel(s, save)) + '</li>'; }).join('') + '</ol>') +
        '<h4>Reward</h4><div class="qs-reward">' + rewardPills(M.reward) + '</div>' +
        '<div class="ui-row end" style="margin-top:18px">' + (status === 'active' && save && save.track !== id ? '<button class="ui-btn" data-track>🎯 Track it</button>' : '') +
        '<a class="ui-btn primary" href="#play" data-go="play">🎮 Play</a></div>', { wide: false });
      var tb = m.el.querySelector('[data-track]');
      if (tb) tb.onclick = function () { save.track = id; save.updated = Date.now(); CFT.persist(save, 'now'); m.close(); board = CFTGame.missionBoard(save); draw(); UI.toast('Tracking "' + M.title + '"', 'ok'); };
    }
    view.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { filter = f.getAttribute('data-filter'); history.replaceState(null, '', '#quests/' + filter); draw(); return; }
      var b = e.target.closest('[data-m]');
      if (b) show(b.getAttribute('data-m'));
    });
    return CFT.data().then(function () { return CFT.loadSave(); }).then(function (s) {
      save = s ? CFTGame.migrate(s) : null;
      board = CFTGame.missionBoard(save);
      draw();
    });
  });
})();

/* ===== ranks.html ===== */
(function () {
  var esc = UI.esc;
  var BOARDS = [['worth', '💰 Net worth'], ['level', '⭐ Level'], ['turfs', '🎨 Blocks'], ['missions', '📜 Missions']];
  UI.page('ranks', { title: 'Leaderboard', nav: 'Ranks', icon: 'users', order: 5 }, function (view, ctx) {
    var board = BOARDS.some(function (b) { return b[0] === ctx.args[0]; }) ? ctx.args[0] : 'worth';
    var data = null;
    function val(e) { return board === 'worth' ? CFT.money(e.worth) : board === 'level' ? 'Lv ' + e.level : board === 'turfs' ? e.turfs + ' 🏳️' : e.missions + ' 📜'; }
    function draw() {
      var list = data[board] || [];
      view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="ui-page-head"><div><h1>Leaderboard</h1><p class="muted">The neighbourhood\'s biggest lives. Everyone plays in their own city, but the money is the same.</p></div></div>' +
        '<div class="rk-totals"><div class="ui-card ui-stat tight"><b>' + data.players + '</b><span>players</span></div><div class="ui-card ui-stat tight"><b>' + data.missions_done.toLocaleString() + '</b><span>missions done</span></div><div class="ui-card ui-stat tight"><b>' + data.turfs_won + '</b><span>blocks won</span></div></div>' +
        '<div class="rk-tabs">' + BOARDS.map(function (b) { return '<button type="button" data-b="' + b[0] + '" class="' + (b[0] === board ? 'on' : '') + '">' + b[1] + '</button>'; }).join('') + '</div>' +
        '<div class="rk-list">' + (list.length ? list.map(function (e) {
          return '<div class="rk-row ' + (e.me ? 'me' : '') + '"><span class="rk-rank">' + e.rank + '</span><span class="rk-name"><b>' + esc(e.name) + (e.me ? ' (you)' : '') + '</b><small>Level ' + e.level + ' · day ' + e.day + (e.partner ? ' · 💘' : '') + (e.kids ? ' · ' + '👶'.repeat(Math.min(3, e.kids)) : '') + (e.biz ? ' · 💼 ' + e.biz : '') + '</small></span><span class="rk-val">' + val(e) + '</span></div>';
        }).join('') : '<div class="ui-empty"><h3>Nobody here yet</h3><p>Be the first.</p></div>') + '</div>' +
        (UI.me ? '' : '<p class="muted small" style="margin-top:18px">Guests play too, but only <a href="#auth/signup" data-go="auth/signup">players with an account</a> show up here.</p>') + '</div>';
    }
    view.addEventListener('click', function (e) { var b = e.target.closest('[data-b]'); if (b) { board = b.getAttribute('data-b'); history.replaceState(null, '', '#ranks/' + board); draw(); } });
    return UI.api('leaderboard').then(function (d) { data = d; draw(); });
  });
})();
