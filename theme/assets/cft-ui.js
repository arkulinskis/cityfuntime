/* City Fun Time: everything on screen around the 3D city. HUD, dialogue, choices, the phone and its apps, shops,
   business / home / bank / metro panels, minigames (dance-off, quiz), the start screen, banners, feed, confetti.
   CFTUI.create(G, root) -> U. Styles live in web/pages/play.html (they ship in app.css). */
(function () {
'use strict';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PLACES = [
  { name: 'Plateau Mont-Royal', city: 'Montréal', lat: 45.5240, lon: -73.5810, e: '🥯' },
  { name: 'Mile End', city: 'Montréal', lat: 45.5235, lon: -73.6005, e: '🎨' },
  { name: 'Old Montréal', city: 'Montréal', lat: 45.5046, lon: -73.5573, e: '⛪' },
  { name: 'Downtown', city: 'Montréal', lat: 45.5030, lon: -73.5700, e: '🏙️' },
  { name: 'Greenwich Village', city: 'New York', lat: 40.7336, lon: -74.0027, e: '🗽' },
  { name: 'Williamsburg', city: 'Brooklyn', lat: 40.7145, lon: -73.9566, e: '🌉' },
];
const SKIN = ['#f6d7c0', '#f1c9a5', '#e9b98f', '#d39d6c', '#b57b4a', '#8d5a33', '#6b4126'];
const HAIR = ['#1d1d1d', '#3a2618', '#6b4423', '#b98545', '#e1c06a', '#b24a2a', '#d9d4cc', '#7b52c7', '#ef6aa5'];
const SHIRT = ['#e8453c', '#2b6cb0', '#2f9e6e', '#f2b134', '#7b52c7', '#ef6aa5', '#1f2937', '#3aa6b9', '#ff8a3d'];
const hexN = h => parseInt(h.slice(1), 16);
const STYLES = ['Short', 'Long', 'Bun', 'Ponytail', 'Curly', 'Spiky', 'Bob', 'Thin on top', 'Side part'];
const toHex = n => '#' + ('000000' + (n >>> 0).toString(16)).slice(-6);

function create(G, root) {
  const D = G.D;
  const U = {};
  const $ = sel => root.querySelector(sel);
  root.innerHTML = `
  <div class="cft">
    <canvas class="cft-canvas"></canvas>
    <div class="cft-hud" hidden>
      <!-- HUD redesign (2026-11-18): you (top left) · where and when (top centre) · the map (top right) · missions (left)
           · the hotbar: attack + ammo, water, lightning, extinguisher, heal (bottom centre) · actions (bottom right) -->
      <div class="cft-tl">
        <div class="cft-hcard cft-me">
          <button type="button" class="cft-lvl" title="Level: open your Character (talents, charms)"><span class="cft-star">⭐</span><b data-lvl>1</b><i class="cft-pts" data-pts hidden></i></button>
          <div class="cft-me-main">
            <div class="cft-me-top"><b class="cft-me-name" data-name></b><span class="cft-money" data-money-chip><span>💵</span><b data-money>$0</b></span></div>
            <div class="cft-bar xp" title="Experience (blue = rested bonus)"><s data-restbar></s><i data-xpbar></i></div>
          </div>
        </div>
        <div class="cft-hcard cft-vitals" data-meters>
          <div class="cft-meter cft-hp" title="Health"><span>❤️</span><div class="cft-bar hp"><i data-hpbar></i></div><b data-hptext></b></div>
          <div class="cft-meter" title="Energy"><span>⚡</span><div class="cft-bar e"><i data-ebar></i></div></div>
          <div class="cft-meter" title="Happiness"><span data-hface>😊</span><div class="cft-bar h"><i data-hbar></i></div></div>
        </div>
        <div class="cft-missions">
          <button class="cft-quest" data-quest type="button">
            <span class="cft-qarrow"><svg viewBox="0 0 24 24" data-qarrow><path d="M12 2 20 21 12 16.5 4 21z"/></svg></span>
            <span class="cft-qtext"><b data-qtitle></b><span data-qstep></span></span><em data-qdist></em>
          </button>
          <div class="cft-mlist" data-mlist></div>
          <button type="button" class="cft-mcount" data-mcount title="Missions on the map, and how weird the city has become (open the Campaign app)"></button>
        </div>
      </div>
      <!-- the four corners (2026-11-18, the user: "all info in the 4 corners, nothing in the middle column or the middle row";
           the map back in the bottom left): top right = where/when, mayhem, boss + foe bars, the feed -->
      <div class="cft-tr">
        <div class="cft-tc"><div class="cft-where"><div class="cft-clock" data-clock></div><div class="cft-boro" data-boro hidden title="The borough you're in: each one has its own colours, banners and road lines"><i></i><b></b></div></div><div class="cft-street" data-street></div><button type="button" class="cft-colour" data-colour hidden aria-label="Colour in this block"><span data-colourtext></span><span class="cft-cbars" aria-hidden="true"><i><b data-cbar></b></i><i><b data-cbar></b></i><i><b data-cbar></b></i></span></button></div>
        <div class="cft-boss" data-boss hidden><b data-bossname></b><div class="cft-bar boss"><i data-bossbar></i></div><small data-bosshint></small></div>
        <div class="cft-foe" data-foe hidden><b data-foename></b><div class="cft-bar foe"><i data-foebar></i></div></div>
        <div class="cft-feed" data-feed></div>
      </div>
      <div class="cft-bl">
        <div class="cft-timer" data-timer hidden></div>
        <div class="cft-mmwrap" data-mmwrap data-size="m" title="Minimap: click for the big map">
          <canvas class="cft-mm" data-mm></canvas><span data-mmzoom></span>
          <button type="button" class="cft-mmb cft-mmz" data-mmz title="Zoom the minimap (M)" aria-label="Zoom the minimap">±</button>
          <button type="button" class="cft-mmb cft-mms" data-mms title="Map size: small, medium, large (N)" aria-label="Change the map size">⤢</button>
        </div>
      </div>
      <div class="cft-br">
        <button class="cft-act" data-act type="button" hidden><kbd>E</kbd><span data-acttext></span></button>
        <div class="cft-hotbar" data-hotbar>
          <button type="button" class="cft-hb main" data-bonk title="Attack (F, or click with the mouse captured)" aria-label="Attack"><span data-bonkicon>🖐️</span><em data-ammo></em><kbd>F</kbd></button>
          <button type="button" class="cft-hb water" data-pw="water" title="Water power (1): soaks and knocks back figments, puts out fires. Refill: water orbs, hydrants (E)" aria-label="Water power"><span>💧</span><em data-pwn="water"></em><kbd>1</kbd></button>
          <button type="button" class="cft-hb volt" data-pw="volt" title="Lightning power (2): zaps and chains between figments, double on wet ones. Refill: lightning orbs, storms" aria-label="Lightning power"><span>🌩️</span><em data-pwn="volt"></em><kbd>2</kbd></button>
          <button type="button" class="cft-hb foam" data-pw="foam" title="Fire extinguisher (3, then hold right mouse + hold left click): puts out fires fast. Found near fires" aria-label="Fire extinguisher"><span>🧯</span><em data-pwn="foam"></em><kbd>3</kbd></button>
          <button type="button" class="cft-hb web" data-pw="web" title="Web shooter (4, then hold right mouse + left click): sticks to a wall and pulls you to it. Jump to let go" aria-label="Web shooter"><span>🕸️</span><em data-pwn="web"></em><kbd>4</kbd></button>
          <button type="button" class="cft-hb gun empty" data-pw="gun" title="Shooter (5): none yet. Find one around town (🎯 on the map)" aria-label="Shooter"><span data-gunicon>🎯</span><em data-pwn="gun"></em><kbd>5</kbd></button>
          <button type="button" class="cft-hb" data-quaff title="Eat or drink to heal (Q)" aria-label="Heal"><span>🍵</span><kbd>Q</kbd></button>
        </div>
        <div class="cft-btns">
          <button type="button" data-block title="Block: hold (G). Time it just before a hit for a PERFECT PARRY" aria-label="Block">🛡️</button>
          <button type="button" data-ride title="Ride (V)" aria-label="Ride">🛹</button>
          <button type="button" data-phone title="Phone (P)" aria-label="Phone">📱</button>
          <button type="button" data-jump class="cft-touch" title="Jump (wall jump off walls, bounce off everything)" aria-label="Jump">⤒</button>
        </div>
      </div>
    </div>
    <div class="cft-sight" data-sight hidden aria-hidden="true"><i></i><b data-sightlbl></b></div>
    <div class="cft-joy" data-joy><div class="cft-knob" data-knob></div></div>
    <div class="cft-banners" data-banners></div>
    <div class="cft-toast" data-toast></div>
    <div class="cft-layer" data-layer></div>
    <div class="cft-loading" data-loading hidden><div class="cft-spin">🏙️</div><p data-loadtext></p><div data-loadbtns></div><p class="cft-tip" data-tip></p></div>
    <div class="cft-flash" data-flash></div>
    <div class="cft-hurt" data-hurt></div>
    <canvas class="cft-confetti" data-confetti></canvas>
  </div>`;
  const shell = root.firstElementChild;
  U.canvas = $('.cft-canvas'); U.joy = $('[data-joy]'); U.knob = $('[data-knob]');
  const hudEl = $('.cft-hud');
  if (matchMedia('(pointer: coarse)').matches) shell.classList.add('touch');
  const save = () => G.save;

  // ------------------------------------------------------------------ overlays
  const stack = [];
  U.isOpen = () => stack.length > 0;
  function overlay(html, cls, o) {
    o = o || {};
    const el = document.createElement('div');
    el.className = 'cft-ov ' + (cls || '');
    el.innerHTML = html;
    const layer = $('[data-layer]');
    if (layer) layer.appendChild(el);   // null once the game was torn down (U.destroy): the dialog just never shows
    const entry = { el, close: null, onEsc: o.onEsc };
    stack.push(entry);
    if (G.W) G.W.unlock();
    entry.close = () => { const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1); el.remove(); if (o.onclose) o.onclose(); };
    if (o.dismiss) el.addEventListener('mousedown', e => { if (e.target === el) entry.close(); });
    return entry;
  }
  U.closeAll = () => { while (stack.length) stack[stack.length - 1].close(); };
  // for cft-cine.js: its own overlay (pauses the game like any dialog), "is it on top?", and the HUD fading out
  U.overlay = overlay;
  U.isTop = entry => stack[stack.length - 1] === entry;
  U.cineMode = on => { if (on) shell.setAttribute('data-cine', ''); else shell.removeAttribute('data-cine'); };

  // ------------------------------------------------------------------ small notices
  let toastT = 0;
  U.toast = function (text) {
    const el = $('[data-toast]');
    if (!el) return;
    el.textContent = text; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3000);
  };
  U.feed = function (e, text) {
    const box = $('[data-feed]');
    if (!box) return;
    const it = document.createElement('div');
    it.className = 'cft-fi';
    it.innerHTML = '<span>' + esc(e) + '</span>' + esc(text);
    box.prepend(it);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => { it.classList.add('out'); setTimeout(() => it.remove(), 400); }, 2600);
  };
  const bannerQ = [];
  let bannerBusy = false;
  U.clearBanners = () => { bannerQ.length = 0; };  // tests: start from an empty queue
  U.banner = function (title, sub, kind, color) { bannerQ.push({ title, sub, kind, color }); if (!bannerBusy) nextBanner(); };
  function nextBanner() {
    const b = bannerQ.shift();
    if (!b) { bannerBusy = false; return; }
    bannerBusy = true;
    const el = document.createElement('div');
    el.className = 'cft-banner ' + (b.kind || '');
    el.innerHTML = '<b>' + esc(b.title) + '</b>' + (b.sub ? '<span>' + esc(b.sub) + '</span>' : '');
    if (b.color) { el.style.setProperty('--boro', b.color.css || b.color); if (b.color.ink) el.style.setProperty('--boro-ink', b.color.ink); }  // borough banners wear the borough's colour
    const box = $('[data-banners]');
    if (!box) { bannerQ.length = 0; bannerBusy = false; return; }   // the game was torn down while banners were queued
    box.appendChild(el);
    const long = b.kind === 'done' || b.kind === 'level' || /^(loot|ach)/.test(b.kind || '');
    setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); nextBanner(); }, 350); }, bannerQ.length > 2 ? 1700 : long ? 3600 : 3000);  // a queue moves faster
  }
  U.prompt = function (text) {
    const b = $('[data-act]');
    if (!text) { b.hidden = true; return; }
    b.hidden = false;
    $('[data-acttext]').textContent = text;
  };
  U.timer = function (label, secs) {
    const el = $('[data-timer]');
    if (label == null) { el.hidden = true; return; }
    el.hidden = false;
    const s = Math.ceil(secs);
    el.innerHTML = '<span>' + esc(label) + '</span><b class="' + (s <= 10 ? 'low' : '') + '">' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '</b>';
  };
  U.loading = function (text, error) {
    const el = $('[data-loading]');
    if (text == null) { el.hidden = true; hudEl.hidden = false; return; }
    el.hidden = false; hudEl.hidden = true;
    $('[data-loadtext]').textContent = text;
    $('[data-tip]').textContent = '💡 ' + D.TIPS[Math.floor(Date.now() / 6000) % D.TIPS.length];
    $('[data-loadbtns]').innerHTML = error ? '<button class="cft-btn" type="button" onclick="location.reload()">Try again</button>' : '';
  };
  U.hurt = function () { const f = $('[data-hurt]'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };
  U.foe = function (o) {
    const el = $('[data-foe]');
    if (!o) { if (!el.hidden) el.hidden = true; return; }
    el.hidden = false; el.className = 'cft-foe ' + (o.rank || '');
    setText('foe', '[data-foename]', o.name + ' · level ' + o.lvl); $('[data-foebar]').style.width = Math.round(o.pct * 100) + '%';
  };
  U.flash = function () { const f = $('[data-flash]'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };
  U.fade = async function (fn, text) {
    const o = overlay('<div class="cft-fadetext">' + esc(text || '') + '</div>', 'cft-fade');
    await new Promise(r => setTimeout(r, 900));
    await fn();
    await new Promise(r => setTimeout(r, 700));
    o.close();
  };
  U.countdown = function (cb) {
    const el = document.createElement('div');
    el.className = 'cft-count';
    shell.appendChild(el);
    let n = 3;
    const step = () => {
      el.textContent = n > 0 ? n : 'GO!';
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      G.sfx.tick();
      if (n === 0) { cb(); setTimeout(() => el.remove(), 700); return; }
      n--; setTimeout(step, 800);
    };
    step();
  };
  U.progress = function (text, secs) {
    return new Promise(res => {
      const o = overlay('<div class="cft-prog"><b>' + esc(text) + '</b><div class="cft-bar big"><i></i></div></div>', 'cft-mini');
      const bar = o.el.querySelector('i');
      const t0 = performance.now();
      const tick = () => { const t = (performance.now() - t0) / (secs * 1000); bar.style.width = Math.min(100, t * 100) + '%'; if (t < 1) requestAnimationFrame(tick); else { o.close(); res(); } };
      tick();
    });
  };
  // confetti
  let conf = [];
  U.confetti = function () {
    const cv = $('[data-confetti]');
    cv.width = innerWidth; cv.height = innerHeight;
    const cols = ['#6b4eff', '#ffc21f', '#ff5c8a', '#20c997', '#3b82f6', '#ff8a3d'];
    for (let i = 0; i < 140; i++) conf.push({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6, c: cols[i % cols.length], s: 5 + Math.random() * 6, t: 0 });
    if (conf.length === 140) requestAnimationFrame(confStep);
  };
  function confStep() {
    const cv = $('[data-confetti]'); if (!cv) return;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    conf = conf.filter(p => p.t < 3.2);
    for (const p of conf) { p.t += 0.016; p.x += p.vx; p.y += p.vy; p.vy += 0.45; p.vx *= 0.99; p.r += 0.2; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); }
    if (conf.length) requestAnimationFrame(confStep); else g.clearRect(0, 0, cv.width, cv.height);
  }

  // ------------------------------------------------------------------ dialogue
  function speakerOf(line, who) {
    const m = /^([^:]{2,24}):\s(.*)$/s.exec(line);
    if (m) {
      const name = m[1].trim();
      const id = Object.keys(D.CAST).find(k => D.CAST[k].n === name || D.CAST[k].n.split(' ').pop() === name || D.CAST[k].n.split(' ')[0] === name || k === name.toLowerCase());
      if (id) return { id, name: D.CAST[id].n, e: D.CAST[id].e, text: m[2] };
      if (name === 'Everyone' || name.startsWith(save().kids[0] ? save().kids[0].name : '§')) return { id: null, name, e: name === 'Everyone' ? '🎉' : '🧒', text: m[2] };
    }
    const c = who && D.CAST[who];
    return { id: who, name: c ? c.n : '', e: c ? c.e : '💬', text: line };
  }
  function portrait(e) { return '<div class="cft-face">' + esc(e || '💬') + '</div>'; }
  // U.dialog({who, lines, ask: {q, opts: [{t, need, reply, good}]}}) -> true when a good answer was picked (or no question)
  U.dialog = function (o) {
    return new Promise(resolve => {
      const ov = overlay('<div class="cft-dlg"><div class="cft-dlg-in">' + portrait('') + '<div class="cft-dlg-body"><b class="cft-dlg-name"></b><p class="cft-dlg-text"></p><div class="cft-dlg-opts"></div></div></div><span class="cft-dlg-next">▶</span></div>', 'cft-dlg-wrap');
      const lines = (o.lines || []).slice();
      const face = ov.el.querySelector('.cft-face'), nm = ov.el.querySelector('.cft-dlg-name'), tx = ov.el.querySelector('.cft-dlg-text'), op = ov.el.querySelector('.cft-dlg-opts'), nx = ov.el.querySelector('.cft-dlg-next');
      let typing = null, full = '', i = -1, done = false;
      function show(line, sp) {
        sp = sp || speakerOf(line, o.who);
        if (o.name) { sp.name = o.name; sp.e = o.e || sp.e; }
        face.textContent = sp.e || '💬'; nm.textContent = sp.name || '';
        full = G.text(sp.text); tx.textContent = '';
        let k = 0;
        clearInterval(typing);
        typing = setInterval(() => { k += 2; tx.textContent = full.slice(0, k); if (k >= full.length) { clearInterval(typing); typing = null; } }, 16);
      }
      function next() {
        if (done) return;
        if (typing) { clearInterval(typing); typing = null; tx.textContent = full; return; }
        i++;
        if (i < lines.length) { show(lines[i]); if (o.onLine && !o.askAgain && o.result === undefined) o.onLine(i); return; }   // onLine: the voice for line i (cft-cine.js, scenes turned off)
        if (o.ask) return ask();
        finish(true);
      }
      function ask() {
        nx.hidden = true;
        if (o.ask.q) { const sp = speakerOf(o.ask.q, null); face.textContent = '🙂'; nm.textContent = G.save.name; tx.textContent = sp.text; }
        op.innerHTML = o.ask.opts.map((a, k) => {
          const need = a.need ? Object.keys(a.need).map(s => (D.STATS.find(x => x.id === s) || { e: '' }).e + ' ' + a.need[s]).join(' ') : '';
          const lock = a.need && Object.keys(a.need).some(s => G.stat(s) < a.need[s]);
          return '<button type="button" class="cft-opt' + (lock ? ' lock' : '') + '" data-k="' + k + '"><kbd>' + (k + 1) + '</kbd>' + esc(a.t) + (need ? ' <em>' + esc(need) + '</em>' : '') + '</button>';
        }).join('');
      }
      function choose(k) {
        const a = o.ask.opts[k]; if (!a) return;
        const lock = a.need && Object.keys(a.need).some(s => G.stat(s) < a.need[s]);
        op.innerHTML = '';
        nx.hidden = false;
        if (lock) {
          const s = Object.keys(a.need)[0], st = D.STATS.find(x => x.id === s);
          show('', { e: '😅', name: G.save.name, text: 'You open your mouth... and nothing smooth comes out. (Needs ' + st.name + ' ' + a.need[s] + ', you have ' + Math.floor(G.stat(s)) + '.) Try another answer, or come back later.' });
          lines.length = 0; i = 0; o.askAgain = true;
          return;
        }
        show('', { e: (speakerOf('', o.who).e), name: (speakerOf('', o.who).name), text: a.reply });
        lines.length = 0; i = 0;
        o.result = !!a.good;
        o.ask = null;
      }
      function finish(v) { done = true; clearInterval(typing); if (o.onClose) o.onClose(); ov.close(); document.removeEventListener('keydown', key, true); resolve(o.result !== undefined ? o.result : v); }
      ov.el.addEventListener('click', e => {
        const b = e.target.closest('[data-k]');
        if (b) { choose(+b.dataset.k); return; }
        if (op.children.length) return;
        if (o.askAgain && !typing) { o.askAgain = false; ask(); return; }
        next();
      });
      function key(e) {
        if (stack[stack.length - 1] !== ov) return;
        if (/^Digit[1-9]$/.test(e.code) && op.children.length) { choose(+e.code.slice(5) - 1); e.preventDefault(); e.stopPropagation(); return; }
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
          e.preventDefault(); e.stopPropagation();
          if (op.children.length) return;
          if (o.askAgain && !typing) { o.askAgain = false; ask(); return; }
          next();
        }
        if (e.code === 'Escape' && !o.ask) { e.preventDefault(); e.stopPropagation(); finish(true); }
      }
      document.addEventListener('keydown', key, true);
      next();
    });
  };
  // U.choose({who, title, text, opts: [{t, v}]}) -> v
  U.choose = function (o) {
    return new Promise(resolve => {
      const c = o.who && D.CAST[o.who];
      const sp = c ? speakerOf(o.text || '', o.who) : { e: '', name: o.title || '', text: o.text || '' };
      const ov = overlay('<div class="cft-card cft-choose">' + (c ? '<div class="cft-choose-head">' + portrait(c.e) + '<b>' + esc(c.n) + '</b></div>' : (o.title ? '<h3>' + esc(o.title) + '</h3>' : '')) +
        '<p>' + esc(c ? sp.text : o.text).replace(/\n/g, '<br>') + '</p><div class="cft-opts">' +
        o.opts.map((x, k) => '<button type="button" class="cft-opt" data-k="' + k + '"><kbd>' + (k + 1) + '</kbd>' + esc(x.t) + '</button>').join('') + '</div></div>', 'cft-center', { dismiss: true, onclose: () => finish(null) });
      let done = false;
      function finish(v) { if (done) return; done = true; document.removeEventListener('keydown', key, true); ov.close(); resolve(v); }
      ov.el.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) finish(o.opts[+b.dataset.k].v); });
      function key(e) {
        if (stack[stack.length - 1] !== ov) return;
        if (/^Digit[1-9]$/.test(e.code)) { const x = o.opts[+e.code.slice(5) - 1]; if (x) { e.preventDefault(); e.stopPropagation(); finish(x.v); } }
        if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
      }
      document.addEventListener('keydown', key, true);
    });
  };
  U.confirm = (text, ok) => U.choose({ title: 'Are you sure?', text, opts: [{ t: ok || 'Yes', v: true }, { t: 'Cancel', v: false }] }).then(v => !!v);
  U.ask = function (label, dflt) {
    return new Promise(resolve => {
      const ov = overlay('<form class="cft-card cft-askf"><h3>' + esc(label) + '</h3><input type="text" maxlength="32" value="' + esc(dflt || '') + '"><div class="cft-opts row"><button class="cft-btn primary" type="submit">OK</button><button class="cft-btn" type="button" data-x>Cancel</button></div></form>', 'cft-center', { onclose: () => resolve(null) });
      const f = ov.el.querySelector('form'), inp = f.querySelector('input');
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
      f.addEventListener('submit', e => { e.preventDefault(); const v = inp.value; resolve(v); ov.close(); });
      f.querySelector('[data-x]').onclick = () => { ov.close(); resolve(null); };
      inp.addEventListener('keydown', e => e.stopPropagation());
    });
  };

  // ------------------------------------------------------------------ minigames
  U.dance = function (n, speed) {
    return new Promise(resolve => {
      const arrows = [['ArrowLeft', '⬅️', 'KeyA'], ['ArrowUp', '⬆️', 'KeyW'], ['ArrowDown', '⬇️', 'KeyS'], ['ArrowRight', '➡️', 'KeyD']];
      const ov = overlay('<div class="cft-card cft-dance"><h3>💃 Dance-off!</h3><p class="muted">Hit the arrow (or WASD) before the ring closes.</p>' +
        '<div class="cft-dance-stage"><div class="cft-dance-ring"></div><div class="cft-dance-arrow">🎵</div></div>' +
        '<div class="cft-dance-score"><span data-hit>0</span> / ' + n + '</div><div class="cft-dance-pads">' +
        arrows.map((a, k) => '<button type="button" data-k="' + k + '">' + a[1] + '</button>').join('') + '</div></div>', 'cft-center');
      const ring = ov.el.querySelector('.cft-dance-ring'), arr = ov.el.querySelector('.cft-dance-arrow'), hitEl = ov.el.querySelector('[data-hit]');
      if (G.W) G.W.pose = 'dance';
      let i = 0, hits = 0, cur = -1, t0 = 0, win = 1.25 / (speed || 1), raf = 0, done = false, wait = 0;
      function nextBeat() {
        if (i >= n) return end();
        cur = Math.floor(Math.random() * 4); t0 = performance.now(); i++;
        arr.textContent = arrows[cur][1]; arr.className = 'cft-dance-arrow'; ring.style.transform = 'scale(1)';
      }
      function judge(k) {
        if (cur < 0 || done) return;
        const t = (performance.now() - t0) / 1000 / win;
        if (k === cur && t <= 1) { hits++; arr.className = 'cft-dance-arrow ' + (t < 0.55 ? 'perfect' : 'good'); G.sfx.tick(); }
        else { arr.className = 'cft-dance-arrow miss'; }
        hitEl.textContent = hits;
        cur = -1; wait = performance.now() + 260;
      }
      function loop() {
        if (done) return;
        raf = requestAnimationFrame(loop);
        const now = performance.now();
        if (cur < 0) { if (now > wait) nextBeat(); return; }
        const t = (now - t0) / 1000 / win;
        ring.style.transform = 'scale(' + Math.max(0.05, 1 - t) + ')';
        if (t > 1) { arr.className = 'cft-dance-arrow miss'; cur = -1; wait = now + 260; }
      }
      function end() {
        done = true; cancelAnimationFrame(raf);
        document.removeEventListener('keydown', key, true);
        if (G.W) G.W.pose = null;
        const sc = hits / n;
        arr.textContent = sc >= 0.7 ? '🎉' : '😅';
        setTimeout(() => { ov.close(); resolve(sc); }, 900);
      }
      function key(e) {
        const k = arrows.findIndex(a => a[0] === e.code || a[2] === e.code);
        if (k >= 0) { e.preventDefault(); e.stopPropagation(); judge(k); }
        if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); i = n; hits = 0; end(); }
      }
      ov.el.addEventListener('pointerdown', e => { const b = e.target.closest('[data-k]'); if (b) { e.preventDefault(); judge(+b.dataset.k); } });
      document.addEventListener('keydown', key, true);
      if (window.CFT_TEST && window.CFT_TEST.autoplay) { const bot = setInterval(() => { if (done) return clearInterval(bot); if (cur >= 0) judge(cur); }, 120); }
      setTimeout(loop, 500);
    });
  };
  U.quiz = function (qs, need, who) {
    return new Promise(resolve => {
      const list = qs.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(qs.length, Math.max(need + 1, 3)));
      let i = 0, right = 0;
      const head = who ? '<div class="cft-choose-head">' + portrait(who.e) + '<b>' + esc(who.n) + '</b></div>' : '<h3>❓ Quiz</h3>';
      const ov = overlay('<div class="cft-card cft-quiz">' + head + '<p class="cft-quiz-n"></p><p class="cft-quiz-q"></p><div class="cft-opts"></div></div>', 'cft-center');
      const nEl = ov.el.querySelector('.cft-quiz-n'), qEl = ov.el.querySelector('.cft-quiz-q'), oEl = ov.el.querySelector('.cft-opts');
      function show() {
        if (i >= list.length) return end();
        const q = list[i];
        nEl.textContent = 'Question ' + (i + 1) + ' of ' + list.length + ' · ' + right + ' right (need ' + need + ')';
        qEl.textContent = q[0];
        oEl.innerHTML = q[1].map((a, k) => '<button type="button" class="cft-opt" data-k="' + k + '"><kbd>' + (k + 1) + '</kbd>' + esc(a) + '</button>').join('');
      }
      function pickAns(k) {
        const q = list[i]; if (!q) return;
        const ok = k === q[2];
        if (ok) right++;
        const btns = oEl.querySelectorAll('button');
        btns.forEach((b, j) => { b.disabled = true; if (j === q[2]) b.classList.add('right'); else if (j === k) b.classList.add('wrong'); });
        (ok ? G.sfx.tick : G.sfx.fail)();
        i++;
        setTimeout(show, 750);
      }
      function end() {
        const ok = right >= need;
        document.removeEventListener('keydown', key, true);
        qEl.textContent = ok ? '🎉 ' + right + ' right. You passed!' : '😅 ' + right + ' right. You need ' + need + '. Try again!';
        nEl.textContent = '';
        oEl.innerHTML = '<button type="button" class="cft-btn primary" data-done>OK</button>';
        oEl.querySelector('[data-done]').onclick = () => { ov.close(); resolve(ok); };
      }
      ov.el.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b && !b.disabled) pickAns(+b.dataset.k); });
      function key(e) { if (/^Digit[1-4]$/.test(e.code)) { e.preventDefault(); e.stopPropagation(); const b = oEl.querySelector('[data-k="' + (+e.code.slice(5) - 1) + '"]'); if (b && !b.disabled) pickAns(+b.dataset.k); } }
      document.addEventListener('keydown', key, true);
      if (window.CFT_TEST && window.CFT_TEST.autoplay) { const bot = setInterval(() => { const q = list[i]; if (!q) return clearInterval(bot); const b = oEl.querySelector('[data-k="' + q[2] + '"]'); if (b && !b.disabled) pickAns(q[2]); }, 150); }
      show();
    });
  };

  // ------------------------------------------------------------------ help + start screen
  U.help = function (first) {
    const t = shell.classList.contains('touch');
    const ov = overlay('<div class="cft-card cft-help"><h3>' + (first ? '👋 Welcome to the city!' : '🎮 How to play') + '</h3>' +
      (first ? '<p>Cousin Max is waiting by the 🏠 flag with a big yellow <b>!</b> over his head. Walk up and talk to him to start your new life.</p>' : '') +
      '<div class="cft-keys">' + (t ? '<div><kbd>Left thumb</kbd> walk</div><div><kbd>Right thumb</kbd> look</div><div><kbd>Action button</kbd> talk, shop, tag</div><div><kbd>🖐️</kbd> bonk monsters (they come out at night)</div><div><kbd>🛡️</kbd> hold to block: just before a hit = PERFECT PARRY</div><div><kbd>📱</kbd> your phone (👕 Wardrobe: what you wear)</div><div><kbd>💧 🌩️ 🧯 🕸️ 🎯</kbd> water, lightning, extinguisher (hold), web (pulls you to the wall you face), your shooter (hold to keep firing)</div><div><kbd>⤒</kbd> jump: off walls, onto roofs, bounce off everything</div>'
        : '<div><kbd>W A S D</kbd> move</div><div><kbd>Shift</kbd> sprint</div><div><kbd>Space</kbd> jump (twice: double jump)</div><div><kbd>F</kbd> or click: bonk (and smash things) · the gold arc on the ground is how far your bonk reaches (pink = something is in reach)</div><div><kbd>G</kbd> held: block (time it for a PERFECT PARRY)</div><div><kbd>Right mouse</kbd> held: aim with the sight · <kbd>left click</kbd> uses the slot you chose with <kbd>1</kbd>–<kbd>5</kbd> (💧 water, 🌩️ lightning, 🧯 extinguisher, 🕸️ web: sticks to walls and pulls you in, 🎯 your shooter: hold to keep firing, ammo from crates) · let go = back to bonking</div><div><kbd>Scroll wheel</kbd> while aiming (or with slot 5 chosen): switch shooters · otherwise (and <kbd>Ctrl</kbd> + wheel): camera zoom</div><div><kbd>Q</kbd> eat or drink to heal</div><div><kbd>B</kbd> toot (yes, really)</div><div><kbd>Space</kbd> held in the air: jetpack / glide</div><div><kbd>Space</kbd> while climbing a wall: jump off it (<kbd>Shift</kbd> + <kbd>Space</kbd>: jump up it)</div><div><kbd>⭐</kbd> your level: talents, charms</div><div><kbd>Mouse</kbd> look (click to capture)</div><div><kbd>E</kbd> talk, shop, tag, interact</div><div><kbd>P</kbd> phone: quests, map, bag, people</div><div><kbd>V</kbd> hop on / off your ride</div><div>In a car: ramps 🛹 and rings of fire 🔥 pop up · <kbd>Space</kbd> hop · in the air <kbd>W</kbd>/<kbd>S</kbd> flip, <kbd>A</kbd>/<kbd>D</kbd> spin, <kbd>Space</kbd> barrel roll · land wheels down</div><div><kbd>I</kbd> wardrobe: one thing per slot</div><div><kbd>1</kbd> water power · <kbd>2</kbd> lightning · <kbd>3</kbd> held: extinguisher</div><div><kbd>Space</kbd> at a wall in the air: wall jump; benches, bins and heads are bouncy</div><div><kbd>M</kbd> minimap zoom · <kbd>N</kbd> map size · <kbd>Esc</kbd> pause</div>') +
      '</div><p class="muted">Watch for the red <b>❗</b> over a figment: it is about to strike. When its ring turns gold, block. Big gold <b>letters</b> on the map are people with missions; E next to a parked car borrows it. The <b>gold arrow</b> over your head always points to your current goal. Ranged weapons need ammo 🎯 (crates around town); nosy people find ✨ secrets in the tight gaps between buildings. Coins 🪙, books 📚, roses 🌹, dumbbells 🏋️, shades 🕶️ and spray cans 🎨 make you richer and better at things.</p>' +
      // not data-go: that attribute is the app-wide "navigate to a page" link (web/core.js) and sent players to the home page
      '<button type="button" class="cft-btn primary big" data-letsgo>Let\'s go!</button></div>', 'cft-center');
    ov.el.querySelector('[data-letsgo]').onclick = e => { e.stopPropagation(); ov.close(); if (G.W && !t) G.W.lock(); };
  };
  U.startScreen = function (me) {
    return new Promise(resolve => {
      const look = { skin: hexN(SKIN[2]), hair: hexN(HAIR[1]), shirt: hexN(SHIRT[0]), style: 0, glasses: false, beard: false };
      const sw = (name, list, key) => '<div class="cft-sw" data-sw="' + key + '"><span>' + name + '</span>' + list.map((c, k) => '<button type="button" style="background:' + c + '" data-c="' + c + '" class="' + (k === (key === 'skin' ? 2 : key === 'hair' ? 1 : 0) ? 'on' : '') + '" aria-label="' + name + ' ' + (k + 1) + '"></button>').join('') + '</div>';
      const ov = overlay(`<div class="cft-start">
        <div class="cft-start-in">
          <div class="cft-start-hero"><span>🏙️</span><h2>City Fun Time</h2><p>Move to the city. Your real neighbourhood, built from the map. Run errands, make friends, fall in love, open businesses, take over the blocks.</p></div>
          <form class="cft-start-form" data-f1>
            <h3>1 · Who are you?</h3>
            <label class="cft-field"><span>Your name</span><input name="name" maxlength="20" required value="${esc(me && me.name ? me.name.split(' ')[0] : '')}" placeholder="Alex"></label>
            ${sw('Skin', SKIN, 'skin')}${sw('Hair', HAIR, 'hair')}${sw('Shirt', SHIRT, 'shirt')}
            <div class="cft-sw cft-styles" data-styles><span>Style</span>${STYLES.map((n, k) => '<button type="button" class="cft-chipb ' + (k ? '' : 'on') + '" data-style="' + k + '">' + n + '</button>').join('')}</div>
            <div class="cft-row"><label class="cft-check"><input type="checkbox" name="glasses"> Glasses</label><label class="cft-check"><input type="checkbox" name="beard"> Beard</label></div>
            <h3>2 · Where do you live?</h3>
            <p class="muted small">Type your address or any place on Earth. The city around it becomes your game world. (The address is looked up on OpenStreetMap.)</p>
            <div class="cft-search"><input name="q" placeholder="1234 Rue Saint-Denis, Montréal" autocomplete="street-address"><button class="cft-btn primary" type="submit">Move in</button></div>
            <div class="cft-search-row"><button class="cft-btn" type="button" data-loc>📍 Use where I am</button><span class="cft-msg" data-msg></span></div>
            <p class="muted small">Or pick a neighbourhood:</p>
            <div class="cft-places">${PLACES.map((p, k) => '<button type="button" class="cft-place" data-p="' + k + '"><span>' + p.e + '</span><b>' + esc(p.name) + '</b><em>' + esc(p.city) + '</em></button>').join('')}</div>
          </form>
        </div></div>`, 'cft-start-wrap');
      const f = ov.el.querySelector('form'), msg = ov.el.querySelector('[data-msg]');
      ov.el.querySelectorAll('[data-sw]').forEach(row => row.addEventListener('click', e => {
        const b = e.target.closest('[data-c]'); if (!b) return;
        row.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        look[row.dataset.sw] = hexN(b.dataset.c);
      }));
      ov.el.querySelector('[data-styles]').addEventListener('click', e => {
        const b = e.target.closest('[data-style]'); if (!b) return;
        ov.el.querySelectorAll('[data-style]').forEach(x => x.classList.toggle('on', x === b));
        look.style = +b.dataset.style;
      });
      ov.el.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
      const done = home => {
        const name = (f.elements.name.value || '').trim() || (me && me.name ? me.name.split(' ')[0] : 'Alex');
        look.glasses = f.elements.glasses.checked; look.beard = f.elements.beard.checked; look.long = [1, 2, 3, 6].includes(look.style);
        ov.close();
        resolve({ name: name.slice(0, 20), look, home });
      };
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const q = f.elements.q.value.trim();
        if (!q) { msg.textContent = 'Type an address, or pick a neighbourhood below.'; return; }
        msg.textContent = 'Looking it up...';
        try { const p = await geocode(q); if (!p) { msg.textContent = 'Couldn\'t find that. Try adding the city.'; return; } done(p); }
        catch (err) { msg.textContent = 'The address search isn\'t reachable. You can type coordinates, like 45.52, -73.58'; }
      });
      ov.el.querySelector('[data-loc]').onclick = () => {
        if (!navigator.geolocation) { msg.textContent = 'This browser can\'t share your location.'; return; }
        msg.textContent = 'Finding you...';
        navigator.geolocation.getCurrentPosition(pos => done({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Where I live', short: 'My neighbourhood' }),
          () => { msg.textContent = 'Location wasn\'t shared. Type your address instead.'; }, { timeout: 15000 });
      };
      ov.el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const p = PLACES[+b.dataset.p]; done({ lat: p.lat, lon: p.lon, label: p.name + ', ' + p.city, short: p.name }); });
    });
  };
  // ------------------------------------------------------------------ the wardrobe (2026-11-17)
  // Your live character in the middle (W.showOff), a slot per body part around it (D.WEAR_SLOTS) and three charms under it.
  // Tap a slot: everything that fits it, from shops and from loot, with what each would change. Every slot holds ONE thing
  // (G.wearShop / G.rpg.equip clear the other), so a cap and a helmet, or a shield and a camera, are a real choice.
  const FX_LABEL = { fit: '💪', charm: '💬', smarts: '🧠', style: '🕶️', cred: '🔥', armour: '🛡️ armour', life: '❤️', speed: '% speed', block: '% block', bonk: '👊 bonk' };
  function fxChips(f, base) {
    const out = [];
    for (const k of Object.keys(Object.assign({}, base, f))) {
      const d = Math.round(((f[k] || 0) - ((base || {})[k] || 0)) * 10) / 10;
      if (!d) continue;
      const lab = FX_LABEL[k] || k;
      out.push('<i class="cft-fx ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '+' : '−') + Math.abs(d) + (lab.charAt(0) === '%' ? lab : ' ' + lab) + '</i>');
    }
    return out.join('');
  }
  let wardOv = null, wardSlot = null;
  const CHARMS = ['c1', 'c2', 'c3'];
  const lootOpt = (it, on) => ({ src: 'loot', id: it.id, it, n: it.n, e: it.e, q: it.q, on });
  const charmOpts = c => { const w = G.rpg && G.rpg.worn(c); return (w ? [lootOpt(w, true)] : []).concat(G.rpg ? G.rpg.spare(c).map(it => lootOpt(it)) : []); };
  U.wardrobe = function (slot) {
    if (wardOv) { wardPick(slot || null); return; }
    const W = G.W;
    wardOv = overlay('<div class="cft-ward" role="dialog" aria-label="Wardrobe"><div class="cft-ward-top"><b>👕 Wardrobe</b><span class="cft-wsum" data-wsum></span>' +
      '<button type="button" class="cft-btn sm" data-wspare>🎒 Spare loot</button><button type="button" class="cft-pbtn" data-wx aria-label="Close the wardrobe">✕</button></div>' +
      '<div class="cft-ward-doll"><div class="cft-ward-col" data-wcol="L"></div><div class="cft-ward-col" data-wcol="R"></div></div>' +
      '<div class="cft-wcharms" data-wcharms></div><div class="cft-ward-sheet" data-wsheet aria-live="polite"></div></div>',
      'cft-wardwrap', { onclose: () => { wardOv = null; wardSlot = null; W.showOff = false; G.dirty(); } });
    W.showOff = true;
    wardOv.el.addEventListener('click', onWardClick);
    wardPick(slot || null);
  };
  U.wardrobeOpen = () => !!wardOv;
  function slotBtn(sl, n, e, cur, count) {
    return '<button type="button" class="cft-wslot' + (cur ? ' full ' + (cur.q != null ? 'q' + cur.q : 'shop') : '') + (wardSlot === sl ? ' sel' : '') + '" data-wslot="' + sl + '" aria-label="' + esc(n + ': ' + (cur ? cur.n : 'empty') + (count > 1 ? ', ' + count + ' to choose from' : '')) + '">' +
      '<span>' + (cur ? cur.e : e) + '</span><small>' + esc(n) + '</small>' + (count > 1 ? '<em>' + count + '</em>' : '') + '</button>';
  }
  function wardDraw() {
    if (!wardOv) return;
    const el = wardOv.el;
    for (const side of ['L', 'R']) el.querySelector('[data-wcol="' + side + '"]').innerHTML = D.WEAR_SLOTS.filter(x => x.side === side).map(x => slotBtn(x.id, x.n, x.e, G.wornIn(x.id), G.slotOptions(x.id).length)).join('');
    el.querySelector('[data-wcharms]').innerHTML = G.rpg ? '<small>Charms</small>' + CHARMS.map(c => { const o = charmOpts(c); return slotBtn(c, 'Charm', '✨', o.find(x => x.on), o.length); }).join('') : '';
    const hp = G.fun ? G.fun.maxHp() : 0, ar = G.rpg ? Math.round(G.rpg.bonus('armor')) : 0;
    el.querySelector('[data-wsum]').innerHTML = D.STATS.map(st => '<i title="' + st.name + '">' + st.e + ' ' + Math.floor(G.stat(st.id)) + '</i>').join('') +
      '<i title="Armour">🛡️ ' + ar + '</i>' + (hp ? '<i title="Most health">❤️ ' + hp + '</i>' : '');
  }
  function wardPick(slot) {
    if (!wardOv) return;
    wardSlot = slot;
    wardDraw();
    const sh = wardOv.el.querySelector('[data-wsheet]');
    sh.classList.toggle('open', !!slot);
    if (!slot) { sh.innerHTML = '<p class="cft-ward-tip">Tap a slot. Each one holds <b>one</b> thing: a cap <i>or</i> a helmet, a shield <i>or</i> a camera. A pink number means you have a choice waiting.</p>'; return; }
    if (slot === 'spare') { sh.innerHTML = spareSheet(); return; }
    const charm = CHARMS.includes(slot);
    const def = charm ? { n: 'Charm', e: '✨', hint: 'Charms add stats and perks. Monsters, treasure chests and mission rewards drop them.' } : D.WEAR_SLOTS.find(x => x.id === slot);
    if (!def) { wardPick(null); return; }
    const opts = charm ? charmOpts(slot) : G.slotOptions(slot);
    const cur = opts.find(o => o.on), base = cur ? G.wearFx(cur) : {};
    let h = '<div class="cft-wsheet-h"><b>' + def.e + ' ' + esc(def.n) + '</b><small>One at a time' + (opts.length > 1 ? ' · ' + opts.length + ' to choose from' : '') + '</small>' +
      '<button type="button" class="cft-pbtn" data-wpick="" aria-label="Close the list">✕</button></div>';
    if (!opts.length) h += '<p class="muted">Nothing for this slot yet.</p>';
    for (const o of opts) {
      const line = o.src === 'shop' ? itemLine(o.it) : G.rpg.statLine(o.it);
      const tag = o.src === 'shop' ? '🛍️ Shop' : D.RPG.QUALITY[o.q].n + ' loot';
      const chips = o.on ? '' : fxChips(G.wearFx(o), base);
      h += '<div class="cft-wopt' + (o.on ? ' on' : '') + (o.q != null ? ' cft-loot q' + o.q : '') + '"><span>' + o.e + '</span><div><b>' + esc(o.n) + (o.on ? ' <i class="cft-new on">wearing</i>' : '') + '</b>' +
        '<small><span class="cft-wsrc">' + tag + '</span>' + (line ? ' · ' + esc(line) : '') + '</small>' +
        (o.on ? '' : '<div class="cft-fxs">' + (chips || '<i class="cft-fx">same numbers, new look</i>') + '</div>') + '</div>' +
        (o.on ? '<button type="button" class="cft-btn sm ghost" data-wact="off" data-wid="' + slot + '">Take off</button>'
          : '<button type="button" class="cft-btn sm primary" data-wact="' + o.src + '" data-wid="' + esc(o.id) + '">' + (cur ? 'Swap' : 'Wear') + '</button>') + '</div>';
    }
    h += '<p class="muted small">' + esc(def.hint) + (cur && opts.length > 1 ? ' Green and red show what a swap changes.' : '') + '</p>';
    sh.innerHTML = h;
  }
  function spareSheet() {
    if (!G.rpg) return '<p class="muted">Still loading.</p>';
    const v = G.rpg.view(), junk = v.bag.filter(x => x.q === 0).length;
    const h = '<div class="cft-wsheet-h"><b>🎒 Spare loot (' + v.bag.length + ' of 30)</b><small>Not worn right now</small><button type="button" class="cft-pbtn" data-wpick="" aria-label="Close the list">✕</button></div>' +
      (junk ? '<div class="cft-row"><button type="button" class="cft-btn sm" data-wact="junk">🧾 Sell ' + junk + ' junk</button></div>' : '') +
      (v.bag.length ? v.bag.map(it => lootRow(v, it, (it.q ? '<button type="button" class="cft-btn sm ' + (v.upgrade(it) ? 'primary' : '') + '" data-wact="loot" data-wid="' + it.id + '">' + (v.upgrade(it) ? '▲ Wear' : 'Wear') + '</button>' : '') +
        '<button type="button" class="cft-btn sm ghost" data-wact="sell" data-wid="' + it.id + '">' + G.fmt$(v.sellPrice(it)) + '</button>')).join('') : '<p class="muted">Empty. Bonk monsters, open treasure chests 🧰 and finish missions.</p>');
    for (const it of save().rpg.loot) it.fresh = 0;
    return h;
  }
  function onWardClick(e) {
    if (e.target.closest('[data-wx]')) { wardOv.close(); return; }
    if (e.target.closest('[data-wspare]')) { wardPick(wardSlot === 'spare' ? null : 'spare'); return; }
    const sl = e.target.closest('[data-wslot]');
    if (sl) { wardPick(wardSlot === sl.dataset.wslot ? null : sl.dataset.wslot); return; }
    const pk = e.target.closest('[data-wpick]');
    if (pk) { wardPick(pk.dataset.wpick || null); return; }
    const b = e.target.closest('[data-wact]');
    if (!b) return;
    const id = b.dataset.wid, act = b.dataset.wact, charm = CHARMS.includes(wardSlot), wear = act === 'shop' || act === 'loot';
    if (act === 'shop') G.wearShop(id);
    else if (act === 'loot') { if (charm) G.rpg.equip(id, wardSlot); else G.rpg.equip(id); }
    else if (act === 'off') { if (charm) G.rpg.unequip(id); else G.takeOff(id); }
    else if (act === 'sell') G.rpg.sell(id);
    else if (act === 'junk') G.rpg.sellJunk();
    if (G.rpg) G.rpg.mark();
    if (wear) { const p = G.W.player.pos; G.W.burst(p.x, p.y + 1.6, p.z, '✨', 5, { spread: 1.2, up: 2.5 }); G.sfx.pick(); }
    wardPick(wardSlot);
    const sel = wear && wardOv && wardOv.el.querySelector('.cft-wslot.sel');
    if (sel) sel.classList.add('pop');
  }
  U.lookEditor = function () {
    const s = save(), W = G.W;
    const cur = Object.assign({ skin: hexN(SKIN[2]), hair: hexN(HAIR[1]), shirt: hexN(SHIRT[0]), style: s.look && s.look.long ? 1 : 0, glasses: false, beard: false, pack: true }, s.look || {});
    const sw = (name, list, key) => '<div class="cft-sw" data-sw="' + key + '"><span>' + name + '</span>' + list.map((c, k) => '<button type="button" style="background:' + c + '" data-c="' + c + '" class="' + (c === toHex(cur[key]) ? 'on' : '') + '" aria-label="' + name + ' ' + (k + 1) + '"></button>').join('') + '</div>';
    const ov = overlay('<div class="cft-card cft-look"><h3>🪞 Your look</h3>' + sw('Skin', SKIN, 'skin') + sw('Hair', HAIR, 'hair') + sw('Shirt', SHIRT, 'shirt') +
      '<div class="cft-sw cft-styles" data-styles><span>Style</span>' + STYLES.map((n, k) => '<button type="button" class="cft-chipb ' + (k === cur.style ? 'on' : '') + '" data-style="' + k + '">' + n + '</button>').join('') + '</div>' +
      '<div class="cft-row"><label class="cft-check"><input type="checkbox" data-flag="glasses" ' + (cur.glasses ? 'checked' : '') + '> Glasses</label><label class="cft-check"><input type="checkbox" data-flag="beard" ' + (cur.beard ? 'checked' : '') + '> Beard</label>' +
      '<label class="cft-check"><input type="checkbox" data-flag="pack" ' + (cur.pack !== false ? 'checked' : '') + '> Backpack</label></div>' +
      '<p class="muted small">Outfits, shoes and headphones from the shops show on you too. An outfit sets your shirt colour.</p>' +
      '<div class="cft-opts row"><button type="button" class="cft-btn primary" data-x>Looks good</button></div></div>', 'cft-lookwrap', { onclose: () => { W.showOff = false; G.dirty(); } });
    const apply = () => { cur.long = [1, 2, 3, 6].includes(cur.style); s.look = cur; W.setLook(G.playerLook()); };
    W.showOff = true;
    ov.el.addEventListener('click', e => {
      const c = e.target.closest('[data-c]'), st = e.target.closest('[data-style]');
      if (c) { const row = c.closest('[data-sw]'); row.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === c)); cur[row.dataset.sw] = hexN(c.dataset.c); apply(); }
      else if (st) { ov.el.querySelectorAll('[data-style]').forEach(x => x.classList.toggle('on', x === st)); cur.style = +st.dataset.style; apply(); }
      else if (e.target.closest('[data-x]')) ov.close();
    });
    ov.el.addEventListener('change', e => { const f = e.target.closest('[data-flag]'); if (f) { cur[f.dataset.flag] = f.checked; apply(); } });
  };
  async function geocode(q) {
    const m = q.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (m) return { lat: +m[1], lon: +m[2], label: q.trim(), short: q.trim() };
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=' + encodeURIComponent(q));
      const j = await r.json();
      if (j && j[0]) {
        const a = j[0].address || {};
        const short = [[a.house_number, a.road].filter(Boolean).join(' '), a.city || a.town || a.village || a.suburb].filter(Boolean).join(', ');
        return { lat: +j[0].lat, lon: +j[0].lon, label: j[0].display_name, short: short || q };
      }
    } catch (e) { /* try the next service */ }
    const r = await fetch('https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(q));
    const j = await r.json();
    const ft = j.features && j.features[0];
    if (!ft) return null;
    const p = ft.properties || {};
    const short = [[p.housenumber, p.street || p.name].filter(Boolean).join(' '), p.city].filter(Boolean).join(', ');
    return { lat: ft.geometry.coordinates[1], lon: ft.geometry.coordinates[0], label: short || q, short: short || q };
  }

  // ------------------------------------------------------------------ HUD
  const last = {};
  let mmRadius = 150, hudT = 0, mmT = 0;
  const mm = $('[data-mm]');
  function sizeMinimap() {
    const r = mm.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    mm.width = Math.max(1, Math.round(r.width * dpr)); mm.height = Math.max(1, Math.round(r.height * dpr));
  }
  window.addEventListener('resize', sizeMinimap);
  const fmtClock = h => String(Math.floor(h) % 24).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');
  const fmtDist = d => d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km';
  function setText(key, sel, v) { if (last[key] !== v) { last[key] = v; $(sel).textContent = v; } }
  U.hud = {
    bump(k) { const el = k === 'money' ? $('[data-money-chip]') : $('.cft-lvl'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); },
    frame(dt) {
      const s = save(); if (!s) return;
      const W = G.W;
      setText('money', '[data-money]', G.fmt$(s.money));
      setText('name', '[data-name]', s.name || 'You');
      const lv = G.level(), a = G.xpAt(lv), b = G.xpAt(lv + 1);
      setText('lvl', '[data-lvl]', String(lv));
      $('[data-xpbar]').style.width = Math.round((s.xp - a) / (b - a) * 100) + '%';
      if (G.fun && G.fun.maxHp) { const hp = G.fun.hp(), mx = G.fun.maxHp(); $('[data-hpbar]').style.width = Math.round(hp / mx * 100) + '%'; setText('hp', '[data-hptext]', Math.ceil(hp) + ''); $('[data-hurt]').classList.toggle('low', hp < mx * 0.25); }
      if (s.rpg) $('[data-restbar]').style.width = Math.min(100, Math.round((s.xp - a + (s.rpg.rested || 0)) / (b - a) * 100)) + '%';  // rested XP: the blue part ahead of your bar
      $('[data-ebar]').style.width = Math.round(s.energy / G.maxEnergy() * 100) + '%';
      $('[data-hbar]').style.width = Math.round(s.happy) + '%';
      setText('hface', '[data-hface]', s.happy > 75 ? '😄' : s.happy > 50 ? '😊' : s.happy > 30 ? '😐' : '😟');
      const h = s.clock;
      const sky = h >= 6 && h < 18 ? '☀️' : h >= 18 && h < 21 ? '🌇' : '🌙';
      setText('clock', '[data-clock]', sky + ' Day ' + s.day + ' · ' + fmtClock(h));
      hudT -= dt;
      if (hudT <= 0) {
        hudT = 0.3;
        const st = W.streetAt(W.player.pos.x, W.player.pos.z);
        const tid = G.turfIdOf(W.player.pos.x, W.player.pos.z), t = s.turf[tid];
        setText('street', '[data-street]', (st ? '📍 ' + st : '') + (t && t.name ? '  ·  ' + (t.own ? '🏳️‍🌈 ' : G.CREW[t.crew].e + ' ') + t.name : ''));
        // the borough chip (2026-11-17): name + the borough's colour, so you always know where you are
        const bd = W.districtAt ? W.districtAt(W.player.pos.x, W.player.pos.z) : null, be = $('[data-boro]'), bk = bd ? bd.n + bd.look.id : '';
        if (be.dataset.k !== bk) {
          be.dataset.k = bk; be.hidden = !bd;
          if (bd) { be.querySelector('b').textContent = bd.n; be.style.setProperty('--boro', bd.look.css); be.style.setProperty('--boro-ink', bd.look.ink); be.classList.remove('cft-boro-new'); void be.offsetWidth; be.classList.add('cft-boro-new'); }
        }
        // quest card
        const id = s.track && s.m[s.track] && s.m[s.track].s === 'active' ? s.track : null;
        const goal = G.rt.goal;
        const q = $('[data-quest]');
        if (id) { setText('qt', '[data-qtitle]', G.getM(id).title); setText('qs', '[data-qstep]', G.stepText(id)); q.classList.remove('idle'); }
        else if (goal) { setText('qt', '[data-qtitle]', goal.label); setText('qs', '[data-qstep]', 'Press E when you get there'); q.classList.add('idle'); }
        else { setText('qt', '[data-qtitle]', 'Free roam'); setText('qs', '[data-qstep]', 'Open your phone (P) for quests and odd jobs'); q.classList.add('idle'); }
        setText('qd', '[data-qdist]', goal && goal.d != null ? fmtDist(goal.d) : '');
        $('[data-ride]').textContent = s.equip.ride ? D.ITEMS[s.equip.ride].e : '🚶';
        if (G.rpg) { const bd = G.rpg.badge(); setText('pts', '[data-pts]', bd ? '✨' + bd : ''); $('[data-pts]').hidden = !bd; }
        const lw = G.rpg && G.rpg.weapon();
        setText('bonk', '[data-bonkicon]', lw ? lw.e : s.equip.weapon && D.ITEMS[s.equip.weapon] ? D.ITEMS[s.equip.weapon].e : '🖐️');
        missionList(id);
      }
      const goal = G.rt.goal;
      if (goal) {
        const p = W.player.pos, sy = Math.sin(W.cam.yaw), cy = Math.cos(W.cam.yaw), dx = goal.x - p.x, dz = goal.z - p.z;
        $('[data-qarrow]').style.transform = 'rotate(' + Math.atan2(dx * cy - dz * sy, -(dx * sy + dz * cy)) + 'rad)';
      }
      mmT -= dt;
      if (mmT <= 0) { mmT = shell.classList.contains('touch') ? 0.1 : 0.04; drawMinimap(); }
    },
  };
  function minimapData() {
    const s = save(), W = G.W, p = W.player.pos, markers = [], rects = [];
    const radar = s.equip.phone === 'phone3' ? 2 : s.equip.phone === 'phone2' ? 1 : 0;
    for (const k of G.rt.pickups) if (!k.dead) markers.push({ x: k.x, z: k.z, color: k.mission ? '#ff5c8a' : D.PICKUPS[k.type].bg, r: k.mission ? 5 : 3.2, ring: k.mission ? '#fff' : 'rgba(0,0,0,.45)', edge: !!k.mission });
    if (radar) for (const pl of G.allPlaces()) { if (Math.abs(pl.pin.x - p.x) > mmRadius * 1.4 || Math.abs(pl.pin.z - p.z) > mmRadius * 1.4) continue; const k = D.KINDS[pl.kind]; if (k && (k.sells.length || pl.kind === 'metro' || pl.kind === 'bank')) markers.push({ x: pl.pin.x, z: pl.pin.z, color: '#ffffff', r: 5.5, emoji: k.e, ring: 'rgba(31,26,61,.5)' }); }
    for (const id of Object.keys(s.biz)) { const q = G.xz(s.biz[id]); markers.push({ x: q.x, z: q.z, color: '#6b4eff', r: 7, emoji: G.BIZ[id].e, ring: '#fff', edge: true }); }
    // missions: a big letter per person (M for Max...), GTA-style; they stick to the minimap's edge with an arrow
    if (G.rt.spots) for (const sp of G.rt.spots.values()) if (sp.open.length || sp.who === 'boss') markers.push(sp.who === 'boss' ? { x: sp.x, z: sp.z, color: '#ffc21f', r: 6.5, emoji: '⚔️', ring: '#1f1a3d', edge: true }
      : { x: sp.x, z: sp.z, color: '#ffc21f', r: 8, letter: G.hero ? G.hero.letterOf(sp) : '!', ring: '#1f1a3d', edge: true });
    if (G.hero) G.hero.markers(markers);
    for (const id of Object.keys(s.turf)) {
      const t = s.turf[id];
      if (!t.spots) continue;
      const b = G.turfBounds(id);
      if (t.own) rects.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, fill: 'rgba(107,78,255,.16)', stroke: 'rgba(107,78,255,.6)' });
      else if (radar >= 2 || G.turfIdOf(p.x, p.z) === id) rects.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, fill: G.CREW[t.crew].color + '22', stroke: G.CREW[t.crew].color + '88' });
      t.spots.forEach((sp, k) => { if (t.own && t.rival !== k) return; if (!t.own && t.tags[k]) return; const q = G.xz({ lat: sp[0], lon: sp[1] }); markers.push({ x: q.x, z: q.z, color: t.own ? '#ff4d4d' : G.CREW[t.crew].color, r: 4.5, emoji: t.own ? '🚨' : '', ring: '#fff', edge: t.own }); });
    }
    if (G.rt.race) G.rt.race.cps.forEach((c, i) => { if (i >= G.rt.race.i) markers.push({ x: c.x, z: c.z, color: i === G.rt.race.i ? '#ffc21f' : '#6b4eff', r: 6, emoji: '🏁', ring: '#fff', edge: i === G.rt.race.i }); });
    const h = G.homeSpot();
    markers.push({ x: h.x, z: h.z, color: '#ff5c8a', r: 8, emoji: '🏠', ring: '#fff', edge: true });
    if (G.fun) G.fun.markers(markers);
    if (G.chaos) G.chaos.markers(markers);
    if (G.camp) G.camp.markers(markers);
    if (G.wild) G.wild.markers(markers);
    if (G.stunt) G.stunt.markers(markers);
    if (G.aim && G.aim.markers) G.aim.markers(markers);   // shooters lying around town
    const goal = G.rt.goal;
    if (goal) markers.push({ x: goal.x, z: goal.z, color: '#6b4eff', r: 9, emoji: goal.e || '⭐', ring: '#ffc21f', edge: true });
    return { markers, rects };
  }
  function drawMinimap() {
    if (!G.W) return;
    if (!mm.width || mm.width < 10) sizeMinimap();
    const d = minimapData();
    G.W.drawMinimap(mm, { radius: mmRadius, markers: d.markers, rects: d.rects });
  }
  function toggleZoom() { mmRadius = mmRadius === 150 ? 380 : mmRadius === 380 ? 70 : 150; $('[data-mmzoom]').textContent = mmRadius === 150 ? '' : mmRadius + ' m'; }
  // map size (2026-11-18): small / medium / large, saved in settings.mapSize (N, the ⤢ button, Settings)
  const MAP_SIZES = ['s', 'm', 'l'], MAP_NAMES = { s: 'small', m: 'medium', l: 'large' };
  U.mapSize = function (sz) {
    const s = save(), w = $('[data-mmwrap]');
    if (!sz) sz = MAP_SIZES[(MAP_SIZES.indexOf((s && s.settings.mapSize) || 'm') + 1) % 3];
    if (s) { s.settings.mapSize = sz; G.dirty(); }
    w.dataset.size = sz;
    requestAnimationFrame(() => { sizeMinimap(); drawMinimap(); });
    return sz;
  };
  // the other missions on the map (up to 4), under the tracked one: letter, title, distance. Click = track it / go there.
  function missionList(tracked) {
    const W = G.W, p = W.player.pos, el = $('[data-mlist]');
    const rows = [];
    for (const id of G.activeMissions()) if (id !== tracked && G.MISSION[id]) { const m = G.getM(id); rows.push({ id, act: 1, t: m.title, sub: G.stepText(id), who: m.giver }); }
    for (const id of G.openMissions()) { const m = G.getM(id); if (!G.MISSION[id]) continue; const sp = G.spotOf(m.giver, m.at), q = sp ? G.xz(sp) : null; rows.push({ id, act: 0, t: m.title, sub: D.CAST[m.giver].n, who: m.giver, d: q ? Math.hypot(q.x - p.x, q.z - p.z) : null }); }
    const key = rows.slice(0, 4).map(r => r.id + (r.d != null ? Math.round(r.d / 25) : '')).join('|') + rows.length;
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    el.innerHTML = rows.slice(0, 4).map(r => '<button type="button" class="cft-mrow' + (r.act ? ' act' : '') + '" data-mid="' + r.id + '"><i>' + (G.hero ? esc(G.hero.letterOf({ who: r.who })) : '!') + '</i><span><b>' + esc(r.t) + '</b><small>' + esc(r.sub) + '</small></span>' + (r.d != null ? '<em>' + fmtDist(r.d) + '</em>' : '') + '</button>').join('') +
      (rows.length > 4 ? '<button type="button" class="cft-mrow more" data-mid="">+' + (rows.length - 4) + ' more</button>' : '');
  }

  // ------------------------------------------------------------------ input
  function onKey(e) {
    if (!G.W || G.state() !== 'play') return;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (stack.length) {
      if (e.code === 'Escape' || ((e.code === 'KeyP' || e.code === 'Tab') && stack[stack.length - 1].el.classList.contains('cft-phone-wrap')) || (e.code === 'KeyI' && stack[stack.length - 1].el.classList.contains('cft-wardwrap'))) {
        const top = stack[stack.length - 1];
        if (top.el.classList.contains('cft-dlg-wrap') || top.el.classList.contains('cft-fade') || top.el.classList.contains('cft-cine-wrap')) return;
        e.preventDefault(); top.close();
      }
      return;
    }
    if (e.code === 'KeyE' || e.code === 'Enter') { e.preventDefault(); G.interact(); }
    else if (e.code === 'KeyP' || e.code === 'Tab' || e.code === 'Escape') { e.preventDefault(); U.phone(); }
    else if (e.code === 'KeyV') G.toggleRide();
    else if (e.code === 'KeyF') { if (!e.repeat) G.attack(); }
    else if (e.code === 'KeyG') { if (!e.repeat && G.fun) G.fun.setBlock(true); }
    else if (e.code === 'KeyQ') { if (!e.repeat && G.fun) G.fun.quaff(); }
    else if (e.code === 'KeyM') toggleZoom();
    else if (e.code === 'KeyN') U.mapSize();
    // 1-4 choose what the sight fires (2026-11-19): hold the right mouse button to aim, left click to use it
    else if (/^(Digit|Numpad)[1-5]$/.test(e.code)) { if (!e.repeat) { const k = SLOT_KEYS[+e.code.slice(-1) - 1]; if (G.aim) G.aim.select(k); else if (G.camp && k !== 'web' && k !== 'gun') G.camp.power(k, true); } }
    else if (e.code === 'KeyH') U.help();
    else if (e.code === 'KeyI') U.wardrobe();
    else if (e.code === 'KeyB') { if (!e.repeat && G.chaos) G.chaos.fart(); }
  }
  document.addEventListener('keydown', onKey);
  const unblock = () => { if (G.fun && G.fun.blocking) G.fun.setBlock(false); };
  const SLOT_KEYS = ['water', 'volt', 'foam', 'web', 'gun'];
  function onKeyUp(e) { if (e.code === 'KeyG') unblock(); if ((e.code === 'Digit3' || e.code === 'Numpad3') && G.camp && !G.aim) G.camp.power('foam', false); }
  document.addEventListener('keyup', onKeyUp);
  const unaim = () => { if (G.aim) { G.aim.fire(false); G.aim.setAim(false); } };
  window.addEventListener('blur', unblock);
  window.addEventListener('blur', unaim);
  // The right mouse button, held, aims (2026-11-19, the user: "remove block on right mouse... right mouse creates a sight;
  // the left click does what's active in the 1 2 3 panel while you hold it; releasing goes back to bonk"). Block: G / 🛡️.
  U.canvas.addEventListener('contextmenu', e => e.preventDefault());
  U.canvas.addEventListener('mousedown', e => { if (e.button === 2 && G.W && G.state() === 'play' && !stack.length && G.aim) { e.preventDefault(); G.aim.setAim(true); } });
  const onMouseUp = e => { if (e.button === 2) unaim(); else if (e.button === 0 && G.aim) G.aim.fire(false); };
  window.addEventListener('mouseup', onMouseUp);
  { const b = $('[data-block]');
    b.addEventListener('pointerdown', e => { e.preventDefault(); if (G.fun && G.state() === 'play' && !stack.length) G.fun.setBlock(true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, unblock); }
  $('[data-act]').addEventListener('click', () => G.interact());
  $('[data-phone]').addEventListener('click', () => U.phone());
  $('[data-ride]').addEventListener('click', () => G.toggleRide());
  $('[data-bonk]').addEventListener('click', () => G.attack());
  $('[data-quaff]').addEventListener('click', () => G.fun && G.fun.quaff());
  $('.cft-lvl').addEventListener('click', () => U.phone('hero'));
  // a left click: with the sight up, use the chosen slot; else (mouse captured) bonk
  U.canvas.addEventListener('mousedown', e => {
    if (e.button !== 0 || !G.W || G.state() !== 'play' || stack.length) return;
    if (G.aim && G.aim.on()) { e.preventDefault(); G.aim.fire(true); }
    else if (G.W.isLocked()) G.attack();
  });
  $('[data-mmwrap]').addEventListener('click', e => { if (e.target.closest('[data-mmz],[data-mms]')) return; U.phone('map'); });
  $('[data-mmz]').addEventListener('click', () => toggleZoom());
  $('[data-mms]').addEventListener('click', () => U.mapSize());
  $('[data-mcount]').addEventListener('click', () => U.phone('camp'));
  $('[data-mlist]').addEventListener('click', e => { const r = e.target.closest('[data-mid]'); if (!r) return; const id = r.dataset.mid, s = save(); if (id && s.m[id] && s.m[id].s === 'active') { G.track(id); U.toast('🎯 Tracking: ' + G.getM(id).title); } else U.phone('quests'); });
  for (const b of shell.querySelectorAll('[data-pw]')) { // the hotbar: a mouse click chooses the slot; a finger chooses AND uses it (hold the extinguisher)
    const k = b.dataset.pw;
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (G.state() !== 'play' || stack.length) return;
      if (G.aim) { if (e.pointerType === 'mouse') G.aim.select(k); else G.aim.tap(k, true); }
      else if (G.camp && k !== 'web' && k !== 'gun') G.camp.power(k, true);
    });
    if (k === 'foam' || k === 'gun') for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (G.aim) G.aim.tap(k, false); else if (G.camp && k === 'foam') G.camp.power('foam', false); });
  }
  $('[data-quest]').addEventListener('click', () => U.phone('quests'));
  $('[data-colour]').addEventListener('click', () => U.phone('colour'));
  $('[data-jump]').addEventListener('touchstart', e => { if (G.W) { G.W.input.jump = true; G.W.input.hold = true; } e.preventDefault(); }, { passive: false });
  for (const ev of ['touchend', 'touchcancel']) $('[data-jump]').addEventListener(ev, () => { if (G.W) G.W.input.hold = false; });  // held: jetpack thrust, gliding
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && G.W && G.state() === 'play' && !stack.length && U.wasLocked) U.phone(); U.wasLocked = !!document.pointerLockElement; });

  // ------------------------------------------------------------------ the phone
  const APPS = [
    ['quests', '📜', 'Quests'], ['map', '🗺️', 'Map'], ['me', '🧑', 'Me'], ['wardrobe', '👕', 'Wardrobe'], ['hero', '🧙', 'Character'], ['rep', '🤝', 'Reputation'], ['ach', '🏆', 'Achievements'], ['bag', '🎒', 'Bag'], ['people', '💞', 'People'], ['homes', '🏠', 'Homes'],
    ['business', '💼', 'Business'], ['turf', '🎨', 'Turf'], ['street', '👑', 'Street life'], ['chaos', '🤪', 'Chaos'], ['stunt', '🏁', 'Stunts'], ['dex', '📸', 'Dex'], ['colour', '🎨', 'Colour'], ['camp', '🌀', 'Campaign'], ['album', '🎴', 'Album'], ['diary', '📔', 'Diary'], ['settings', '⚙️', 'Settings'],
  ];
  let phoneOv = null, phoneApp = null;
  U.phone = function (app) {
    if (phoneOv) { if (app) render(app); return; }
    phoneOv = overlay('<div class="cft-phone"><div class="cft-phone-top"><button type="button" class="cft-pbtn" data-home>⌂</button><b data-ptitle>Phone</b><span class="cft-pmoney" data-pmoney></span><button type="button" class="cft-pbtn" data-close>✕</button></div><div class="cft-phone-body" data-pbody></div></div>',
      'cft-phone-wrap', { dismiss: true, onclose: () => { phoneOv = null; G.dirty(); } });
    const el = phoneOv.el;
    el.querySelector('[data-close]').onclick = () => phoneOv.close();
    el.querySelector('[data-home]').onclick = () => render(null);
    el.addEventListener('click', onPhoneClick);
    el.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') e.stopPropagation(); });
    render(app || null);
  };
  function render(app) {
    if (!phoneOv) return;
    phoneApp = app;
    const s = save(), body = phoneOv.el.querySelector('[data-pbody]');
    phoneOv.el.querySelector('[data-ptitle]').textContent = app ? APPS.find(a => a[0] === app)[2] : '📱 ' + s.name + '\'s phone';
    phoneOv.el.querySelector('[data-pmoney]').textContent = G.fmt$(s.money);
    phoneOv.el.querySelector('[data-home]').style.visibility = app ? 'visible' : 'hidden';
    body.innerHTML = app ? (VIEWS[app] ? VIEWS[app]() : '') : homeScreen();
    body.scrollTop = 0;
    if (app === 'map') setTimeout(drawBigMap, 20);
  }
  U.refreshPhone = () => { if (phoneOv) { const b = phoneOv.el.querySelector('[data-pbody]'), st = b.scrollTop; render(phoneApp); b.scrollTop = st; } };
  function homeScreen() {
    const s = save(), act = G.activeMissions().length, open = G.openMissions().length;
    const badge = { quests: act + open, people: Object.keys(s.friends).length, business: Object.values(s.biz).filter(b => !b.mgr && b.till > 5).length,
      street: s.fun && s.fun.crushes ? s.fun.crushes.length : 0, hero: G.rpg ? G.rpg.badge() : 0 };
    return '<div class="cft-apps">' + APPS.map(a => '<button type="button" class="cft-app" data-app="' + a[0] + '"><span>' + a[1] + '</span><b>' + a[2] + '</b>' +
      (badge[a[0]] ? '<i>' + badge[a[0]] + '</i>' : '') + '</button>').join('') + '</div>' +
      '<div class="cft-pcard"><b>☀️ Day ' + s.day + ' · ' + fmtClock(s.clock) + '</b><span>' + esc(s.apt.label || '') + ' · ' + esc(D.APARTMENTS[s.apt.tier].n) + '</span></div>' +
      '<div class="cft-row"><button type="button" class="cft-btn" data-act="help">🎮 Controls</button><button type="button" class="cft-btn" data-act="exit">💾 Save & exit</button></div>';
  }
  const bar = (v, max, cls) => '<div class="cft-bar ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, v / max * 100)) + '%"></i></div>';
  const VIEWS = {};
  VIEWS.quests = function () {
    const s = save();
    const act = G.activeMissions(), open = G.openMissions();
    const card = id => {
      const m = G.getM(id), st = G.curStep(id), c = D.CAST[m.giver];
      return '<div class="cft-q ' + (s.track === id ? 'tracked' : '') + '"><div class="cft-q-h"><span>' + (m.job || m.rush ? (m.title.split(' ')[0]) : c.e) + '</span><b>' + esc(m.title) + '</b></div>' +
        '<p>' + esc(G.stepText(id)) + '</p><small>Step ' + (s.m[id].st + 1) + ' of ' + m.steps.length + (st && st.when ? ' · ⏰ ' + st.when[0] + ':00–' + st.when[1] + ':00' : '') + '</small>' +
        '<div class="cft-row">' + (s.track === id ? '<span class="cft-tag">🎯 Tracking</span>' : '<button type="button" class="cft-btn sm primary" data-act="track" data-id="' + id + '">🎯 Track</button>') +
        '<button type="button" class="cft-btn sm ghost" data-act="abandon" data-id="' + id + '">Drop</button></div></div>';
    };
    const jobs = G.jobs();
    const done = Object.keys(s.m).filter(k => G.MISSION[k] && s.m[k].s === 'done').length;
    return '<div class="cft-sec"><h4>Active (' + act.length + ')</h4>' + (act.length ? act.map(card).join('') : '<p class="muted">No active quests. Look for people with a yellow <b>!</b> over their head.</p>') + '</div>' +
      '<div class="cft-sec"><h4>People with missions (' + open.length + ')</h4>' + (open.length ? open.slice(0, 30).map(id => {
        const m = G.getM(id), c = D.CAST[m.giver], sp = G.spotOf(m.giver, m.at);
        return '<div class="cft-li"><span>' + c.e + '</span><div><b>' + esc(m.title) + '</b><small>' + esc(c.n) + ' · ' + esc(sp ? sp.name : '') + '</small></div><button type="button" class="cft-btn sm" data-act="goto" data-id="' + id + '">🎯</button></div>';
      }).join('') : '<p class="muted">Nobody needs you right now. Level up, explore, try odd jobs.</p>') + '</div>' +
      '<div class="cft-sec"><h4>💼 Odd jobs today</h4>' + jobs.map(j => '<div class="cft-li"><span>' + j.e + '</span><div><b>' + esc(j.t) + '</b><small>' + G.fmt$(j.pay) + '</small></div>' +
        (j.taken ? '<span class="cft-tag">Taken</span>' : '<button type="button" class="cft-btn sm primary" data-act="job" data-id="' + j.i + '">Take</button>') + '</div>').join('') + '</div>' +
      '<div class="cft-sec"><h4>Story</h4><p class="muted">' + done + ' of ' + D.MISSIONS.length + ' missions done. See them all on the Quests page.</p>' + bar(done, D.MISSIONS.length) + '</div>';
  };
  VIEWS.map = function () {
    return '<div class="cft-mapwrap"><canvas class="cft-bigmap" data-bigmap></canvas><div class="cft-mapbtns"><button type="button" class="cft-pbtn" data-act="zin">＋</button><button type="button" class="cft-pbtn" data-act="zout">－</button></div></div>' +
      '<div class="cft-legend"><span>🚩 borough names, coloured</span><span>🏠 home</span><span>❗ missions</span><span>💼 your businesses</span><span>🟪 your blocks</span><span>🧡 street folk</span><span>💕 sweethearts</span><span>💢 banned</span><span>⭐ goal</span></div>';
  };
  let mapScale = 0.5;
  function drawBigMap() {
    const cv = phoneOv && phoneOv.el.querySelector('[data-bigmap]');
    if (!cv) return;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const d = minimapData(), p = G.W.player.pos;
    const s = save();
    d.rects = [];
    for (const id of Object.keys(s.turf)) { const t = s.turf[id]; if (!t.spots) continue; const b = G.turfBounds(id); d.rects.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, fill: t.own ? 'rgba(107,78,255,.2)' : G.CREW[t.crew].color + '22', stroke: t.own ? '#6b4eff' : G.CREW[t.crew].color + '99', label: (t.own ? '🏳️‍🌈 ' : G.CREW[t.crew].e + ' ') + t.name }); }
    G.W.drawMap(cv, { cx: p.x, cz: p.z, scale: mapScale * dpr, markers: d.markers.filter(m => m.r > 4), rects: d.rects });
  }
  VIEWS.me = function () {
    const s = save(), lv = G.level(), a = G.xpAt(lv), b = G.xpAt(lv + 1), sum = window.CFTGame.summary(s);
    const eq = D.WEAR_SLOTS.map(x => { const w = G.wornIn(x.id); return '<button type="button" class="cft-slot' + (w ? '' : ' empty') + '" data-act="wardrobe" data-id="' + x.id + '"><span>' + (w ? w.e : x.e) + '</span><small>' + esc(w ? w.n : x.n) + '</small></button>'; }).join('');
    return '<div class="cft-me"><div class="cft-me-h"><button type="button" class="cft-face big" data-act="look" title="Change your look" aria-label="Change your look">🪞</button><div><b>' + esc(s.name) + (s.rpg && s.rpg.title ? ' <small class="cft-title">' + esc(s.rpg.title) + '</small>' : '') + '</b><span>Level ' + lv + ' · ' + (s.xp - a) + ' / ' + (b - a) + ' XP</span>' + bar(s.xp - a, b - a, 'xp') + '</div></div>' +
      '<div class="cft-grid2"><div class="cft-mini"><small>Cash</small><b>' + G.fmt$(s.money) + '</b></div><div class="cft-mini"><small>Net worth</small><b>' + G.fmt$(sum.worth) + '</b></div>' +
      '<div class="cft-mini"><small>⚡ Energy</small><b>' + Math.round(s.energy) + ' / ' + G.maxEnergy() + '</b></div><div class="cft-mini"><small>😊 Happiness</small><b>' + Math.round(s.happy) + '% → ' + Math.round(G.happyTarget()) + '%</b></div></div>' +
      '<div class="cft-sec"><h4>Stats</h4>' + D.STATS.map(st => { const v = G.stat(st.id); return '<div class="cft-stat"><span>' + st.e + '</span><div><b>' + st.name + ' ' + Math.floor(v) + '</b><small>' + esc(st.blurb) + '</small>' + bar(v % 1 || (v >= 1 ? 0 : 0), 1, 'st') + '</div></div>'; }).join('') + '</div>' +
      '<div class="cft-sec"><h4>Wearing <button type="button" class="cft-btn sm" data-act="wardrobe" data-id="">👕 Open wardrobe</button></h4><div class="cft-slots">' + eq + '</div></div>' +
      '<div class="cft-sec"><h4>Life so far</h4><div class="cft-grid2">' + [['📜 Missions', sum.missions], ['💼 Odd jobs', sum.jobs], ['🪙 Coins', s.counters.coins || 0], ['🚶 Walked', ((s.walked || 0) / 1000).toFixed(1) + ' km'], ['📸 Photos', s.counters.photos || 0], ['🎨 Tags', s.counters.tags || 0], ['💬 Chats', s.counters.chats || 0], ['🏁 Races won', s.counters.races || 0]].map(x => '<div class="cft-mini"><small>' + x[0] + '</small><b>' + x[1] + '</b></div>').join('') + '</div></div></div>';
  };
  VIEWS.bag = function () {
    const s = save();
    const groups = { food: [], gift: [], quest: [], tool: [] };
    for (const k of Object.keys(s.bag)) { const it = D.ITEMS[k]; if (!it || s.bag[k] <= 0) continue; const g = it.type === 'snack' ? 'food' : it.type === 'gift' ? 'gift' : it.type === 'tool' ? 'tool' : 'quest'; groups[g].push(k); }
    const row = (k, btn) => { const it = D.ITEMS[k]; return '<div class="cft-li"><span>' + it.e + '</span><div><b>' + esc(it.n) + ' ×' + s.bag[k] + '</b><small>' + itemLine(it) + '</small></div>' + (btn || '') + '</div>'; };
    const rides = Object.keys(D.VEHICLES).filter(G.owned);
    const gear = Object.keys(s.owned).filter(k => D.ITEMS[k] && D.ITEMS[k].type === 'gear').length + (s.rpg ? s.rpg.loot.length : 0);
    return '<div class="cft-sec"><h4>🍎 Snacks</h4>' + (groups.food.map(k => row(k, '<button type="button" class="cft-btn sm primary" data-act="eat" data-id="' + k + '">Eat</button>')).join('') || '<p class="muted">Nothing to eat. Cafés, bakeries and groceries sell snacks.</p>') + '</div>' +
      '<div class="cft-sec"><h4>🎁 Gifts</h4>' + (groups.gift.map(k => row(k)).join('') || '<p class="muted">No gifts. Florists, bakeries and gift shops sell them. Give them to people to make them like you.</p>') + '</div>' +
      (groups.tool.length || groups.quest.length ? '<div class="cft-sec"><h4>🧰 Other</h4>' + groups.tool.concat(groups.quest).map(k => row(k)).join('') + '</div>' : '') +
      '<div class="cft-sec"><h4>🛹 Rides</h4>' + (rides.length ? '<div class="cft-chips"><button type="button" class="cft-chipb ' + (!s.equip.ride ? 'on' : '') + '" data-act="ride" data-id="">🚶 On foot</button>' + rides.map(k => '<button type="button" class="cft-chipb ' + (s.equip.ride === k ? 'on' : '') + '" data-act="ride" data-id="' + k + '">' + D.ITEMS[k].e + ' ' + esc(D.ITEMS[k].n) + '</button>').join('') + '</div>' : '<p class="muted">No rides yet. Skateboards are $120 at bike & board shops.</p>') + '</div>' +
      '<div class="cft-sec"><h4>👕 Clothes and gear</h4><div class="cft-li"><span>👕</span><div><b>' + gear + ' piece' + (gear === 1 ? '' : 's') + ' of gear</b><small>Clothes, shoes, weapons, shields and charms live in the Wardrobe: one thing per slot.</small></div><button type="button" class="cft-btn sm primary" data-act="wardrobe" data-id="">Open</button></div></div>';
  };
  function itemLine(it) {
    const p = [];
    if (it.energy) p.push((it.energy > 0 ? '+' : '') + it.energy + ' ⚡');
    if (it.happy) p.push('+' + it.happy + ' 😊');
    if (it.rel) p.push('+' + it.rel + ' ❤️ as a gift');
    if (it.stats) for (const k in it.stats) p.push('+' + it.stats[k] + ' ' + D.STATS.find(s => s.id === k).e);
    if (it.speed) p.push('+' + Math.round(it.speed * 100) + '% speed');
    if (it.weapon) p.push('Bonk ' + it.weapon.dmg + ' · reach ' + it.weapon.reach + ' m' + (it.weapon.ranged ? ' · ranged' : '') + (it.weapon.stun ? ' · stuns' : ''));
    if (it.fortune) p.push('Something will happen. Probably');
    if (it.radar) p.push(it.radar > 1 ? 'Map shows blocks + shops' : 'Map shows shops');
    if (it.maxEnergy) p.push('+' + it.maxEnergy + ' max ⚡');
    if (it.sticker) p.push('A random sticker');
    if (it.hours) p.push('Takes ' + it.hours + ' h');
    if (it.apt) p.push('Needs: ' + D.APARTMENTS[it.apt].n);
    if (it.type === 'vehicle') { const v = D.VEHICLES[Object.keys(D.ITEMS).find(k => D.ITEMS[k] === it)]; if (v) p.push('Top speed ' + Math.round(v.run * 3.6) + ' km/h'); }
    if (it.type === 'pet') p.push('Follows you, +😊');
    if (it.type === 'license') p.push('Lets you ride bigger things');
    return p.join(' · ');
  }
  VIEWS.people = function () {
    const s = save();
    const f = s.settings.follow;
    const person = (id, extra) => { const c = D.CAST[id], r = s.rel[id] || 0; return '<div class="cft-li"><span>' + c.e + '</span><div><b>' + esc(c.n) + '</b><small>' + esc(extra || c.role) + '</small>' + bar(r, 100, 'rel') + '</div>' +
      (Object.keys(s.bag).some(k => D.ITEMS[k] && D.ITEMS[k].type === 'gift') ? '<button type="button" class="cft-btn sm" data-act="gift" data-id="' + id + '">🎁</button>' : '') + '</div>'; };
    let h = '';
    if (s.partner) h += '<div class="cft-sec"><h4>💘 ' + (s.married ? 'Married to' : s.engaged ? 'Engaged to' : 'Your ' + (s.pref === 'bf' ? 'boyfriend' : 'girlfriend')) + '</h4>' + person(s.partner, s.married ? 'Spouse' : s.engaged ? 'Fiancé(e) 💍' : 'Dating') +
      '<label class="cft-check"><input type="checkbox" data-follow="partner" ' + (f.partner ? 'checked' : '') + '> Walks with you</label></div>';
    if (s.kids.length) h += '<div class="cft-sec"><h4>👶 Kids</h4>' + s.kids.map(k => '<div class="cft-li"><span>' + (s.day - k.born > 12 ? '🧒' : '👶') + '</span><div><b>' + esc(k.name) + '</b><small>' + (s.day - k.born) + ' days old</small></div></div>').join('') +
      '<label class="cft-check"><input type="checkbox" data-follow="kids" ' + (f.kids ? 'checked' : '') + '> Walk with you</label></div>';
    if (s.pets.length) h += '<div class="cft-sec"><h4>🐾 Pets</h4>' + s.pets.map(p => '<div class="cft-li"><span>' + (p.kind === 'dog' ? '🐕' : '🐈') + '</span><div><b>' + esc(p.name) + '</b><small>Since day ' + p.since + '</small></div></div>').join('') +
      '<label class="cft-check"><input type="checkbox" data-follow="pets" ' + (f.pets ? 'checked' : '') + '> Follow you</label></div>';
    const fr = Object.keys(s.friends);
    h += '<div class="cft-sec"><h4>🤝 Friends (' + fr.length + ')</h4>' + (fr.length ? fr.map(id => person(id, '⭐ ' + (D.FRIEND_PERKS[id] || '')) + '<div class="cft-row"><button type="button" class="cft-btn sm ' + (f.friend === id ? '' : 'primary') + '" data-act="hang" data-id="' + id + '">' + (f.friend === id ? '👋 Stop hanging out' : '🤝 Hang out') + '</button></div>').join('') : '<p class="muted">Missions are the best way to make friends. Each friend has a perk.</p>') + '</div>';
    const met = Object.keys(s.rel).filter(id => !s.friends[id] && id !== s.partner && D.CAST[id] && !D.CAST[id].animal);
    if (met.length) h += '<div class="cft-sec"><h4>👋 People you know</h4>' + met.map(id => person(id)).join('') + '</div>';
    return h;
  };
  VIEWS.homes = function () {
    const s = save(), cur = D.APARTMENTS[s.apt.tier];
    const furn = Object.keys(s.owned).filter(k => D.ITEMS[k] && D.ITEMS[k].type === 'furniture');
    return '<div class="cft-pcard big"><span class="cft-big-e">' + cur.e + '</span><b>' + esc(cur.n) + '</b><span>' + esc(s.apt.label) + '</span><small>' + (cur.rent ? G.fmt$(cur.rent) + ' rent per day' : 'No rent') + ' · +' + cur.happy + ' 😊</small></div>' +
      '<div class="cft-sec"><h4>Move up</h4>' + D.APARTMENTS.filter(a => a.tier > s.apt.tier).map(a => '<div class="cft-li"><span>' + a.e + '</span><div><b>' + esc(a.n) + '</b><small>' + esc(a.blurb) + '<br>' + (a.rent ? G.fmt$(a.cost) + ' to move in · ' + G.fmt$(a.rent) + '/day' : G.fmt$(a.cost) + ' to buy · no rent') + ' · +' + a.happy + ' 😊' + (a.kids ? ' · room for ' + a.kids + ' kid' + (a.kids > 1 ? 's' : '') : '') + '</small></div>' +
        '<button type="button" class="cft-btn sm ' + (s.money >= a.cost ? 'primary' : '') + '" data-act="move" data-id="' + a.tier + '" ' + (s.money >= a.cost ? '' : 'disabled') + '>Move</button></div>').join('') + '</div>' +
      '<div class="cft-sec"><h4>Furniture</h4>' + (furn.length ? '<div class="cft-chips">' + furn.map(k => '<span class="cft-chipb">' + D.ITEMS[k].e + ' ' + esc(D.ITEMS[k].n) + '</span>').join('') + '</div>' : '<p class="muted">Furniture shops sell sofas, TVs, pianos... Every piece makes you happier.</p>') + '</div>';
  };
  VIEWS.business = function () {
    const s = save();
    const owned = Object.keys(s.biz);
    const tot = owned.reduce((a, id) => a + G.bizIncome(id), 0);
    return '<div class="cft-pcard"><b>💼 ' + owned.length + ' of ' + D.BUSINESSES.length + ' businesses</b><span>' + G.fmt$(tot) + ' per hour · turf ' + G.fmt$(G.turfIncome()) + ' per hour</span><small>Happiness ×' + G.happyMul().toFixed(2) + ' · Smarts boost +' + Math.round(G.stat('smarts') * 2) + '%</small></div>' +
      D.BUSINESSES.map(d => {
        const b = s.biz[d.id];
        if (b) return '<div class="cft-biz own"><div class="cft-li"><span>' + d.e + '</span><div><b>' + esc(b.name) + ' ' + '★'.repeat(b.lvl) + '</b><small>' + esc(b.addr || '') + ' · ' + G.fmt$(G.bizIncome(d.id)) + '/h · ' + (b.mgr ? '🧑‍💼 managed' : 'till ' + G.fmt$(b.till) + ' / ' + G.fmt$(G.bizCap(d.id))) + '</small></div></div><div class="cft-row">' +
          (b.lvl < 5 ? '<button type="button" class="cft-btn sm" data-act="upgrade" data-id="' + d.id + '">⬆️ ' + esc(d.up[b.lvl - 1]) + ' ' + G.fmt$(G.upgradeCost(d.id)) + '</button>' : '<span class="cft-tag">Max level</span>') +
          (!b.mgr ? '<button type="button" class="cft-btn sm" data-act="mgr" data-id="' + d.id + '">🧑‍💼 Manager ' + G.fmt$(G.managerCost(d.id)) + '</button>' : '') +
          '<button type="button" class="cft-btn sm ghost" data-act="findbiz" data-id="' + d.id + '">🎯</button></div></div>';
        const can = s.money >= d.cost;
        return '<div class="cft-biz"><div class="cft-li"><span>' + d.e + '</span><div><b>' + esc(d.n) + '</b><small>' + G.fmt$(d.cost) + ' · earns ~' + G.fmt$(d.income * G.incomeMul(d.id)) + '/h</small></div><button type="button" class="cft-btn sm ' + (can ? 'primary' : '') + '" data-act="buybiz" data-id="' + d.id + '" ' + (can ? '' : 'disabled') + '>Open</button></div></div>';
      }).join('') + '<p class="muted small">New businesses open in a free storefront near where you\'re standing. Visit to collect the till, or hire a manager.</p>';
  };
  VIEWS.turf = function () {
    const s = save(), p = G.W.player.pos;
    if (!s.m['c6-luna'] || s.m['c6-luna'].s === 'open') return '<div class="cft-empty">🎨<p>Every block around here belongs to a crew. Luna the street artist knows how to win them back. Finish the "Wall Flower" mission to start.</p></div>';
    const ids = Object.keys(s.turf).filter(id => s.turf[id].spots).sort((a, b) => { const A = G.turfBounds(a), B = G.turfBounds(b); return Math.hypot((A.x0 + A.x1) / 2 - p.x, (A.z0 + A.z1) / 2 - p.z) - Math.hypot((B.x0 + B.x1) / 2 - p.x, (B.z0 + B.z1) / 2 - p.z); });
    const own = ids.filter(id => s.turf[id].own).length;
    return '<div class="cft-pcard"><b>🏳️‍🌈 ' + own + ' blocks</b><span>' + G.fmt$(G.turfIncome()) + ' per hour · 🎨 ' + (s.bag.spray || 0) + ' spray cans · 🔥 cred ' + Math.floor(G.stat('cred')) + '</span><small>Tag all 4 crew posters in a block, then beat the boss.</small></div>' +
      ids.slice(0, 25).map(id => { const t = s.turf[id], c = G.CREW[t.crew]; const n = t.tags.filter(Boolean).length;
        return '<div class="cft-li"><span>' + (t.own ? '🏳️‍🌈' : c.e) + '</span><div><b>' + esc(t.name) + '</b><small>' + (t.own ? 'Yours · +' + G.fmt$(15 + 10 * G.turfRing(id)) + '/h' + (t.rival != null ? ' · 🚨 rival tag!' : '') : esc(c.n) + ' · ' + n + '/4 tagged · needs 🔥' + G.turfNeed(id) + ' · ' + { race: 'race', dance: 'dance-off', quiz: 'quiz', chase: 'chase', cred: 'cred check' }[c.ch]) + '</small></div></div>'; }).join('') +
      (ids.length ? '' : '<p class="muted">Walk around to discover blocks.</p>');
  };
  VIEWS.street = function () {
    if (!G.fun) return '<div class="cft-empty">👑<p>The street is still waking up.</p></div>';
    const s = save(), v = G.fun.summary(), w = v.weapon;
    const weapons = Object.keys(s.owned).filter(k => D.ITEMS[k] && D.ITEMS[k].weapon);
    const hearts = n => '❤️'.repeat(Math.max(1, Math.round(n / 20)));
    const hv = G.hero ? G.hero.summary() : null;
    const heroCard = hv ? '<div class="cft-pcard"><b>✨ ' + (hv.main ? 'MAIN CHARACTER MODE' : 'Swagger ' + hv.swag + '/100') + '</b><span>' + hv.fans + ' fans · ' + hv.gifts + ' gifts from admirers · ' + hv.compliments + ' compliments</span>' + (hv.main ? '' : bar(hv.swag, 100)) +
      '<small>🍩 Tom Hearton\'s freed: ' + hv.hearton + ' (+' + hv.energy + ' max energy) · 🛒 groceries freed: ' + hv.grocery + ' (+' + hv.hp + ' max health)<br>💥 ' + hv.smash + ' smashed · ' + hv.wrecks + ' wreck' + (hv.wrecks === 1 ? '' : 's') + ' · 🚗 ' + hv.borrowed + ' borrowed · 🛡️ ' + hv.parries + ' perfect parr' + (hv.parries === 1 ? 'y' : 'ies') + '</small></div>' : '';
    return heroCard + '<div class="cft-pcard"><b>' + (v.king ? '👑 ' : '🧡 ') + esc(v.folkTitle) + '</b><span>' + v.hearts + ' street hearts' + (v.king ? ' · a tribute arrives every morning' : ' · crowned at ' + v.crownAt) + '</span>' +
      (v.king ? '' : bar(v.hearts, v.crownAt)) + '<small>Street folk sit on corners all over town (🧡 on the map). A coin, some food or a listening ear earns hearts.</small></div>' +
      '<div class="cft-sec"><h4>💕 Sweethearts (' + v.crushes.length + ')' + (v.crushTitle ? ' · ' + esc(v.crushTitle) : '') + '</h4>' +
      (v.crushes.length ? v.crushes.map(c => '<div class="cft-li"><span>💕</span><div><b>' + esc(c.name) + ' ' + hearts(c.love) + '</b><small>' + c.dist + ' m away · ' + (c.seen > 1 ? 'misses you (' + c.seen + ' days)' : 'saw you ' + (c.seen ? 'yesterday' : 'today')) + '</small>' + bar(c.love, 100, 'rel') + '</div>' +
        '<button type="button" class="cft-btn sm" data-act="findcrush" data-id="' + c.id + '">🎯</button></div>').join('')
        : '<p class="muted">Nobody yet. Walk up to a stranger, press E and try a pick-up line. Charm and style help.</p>') + '</div>' +
      '<div class="cft-sec"><h4>👾 Monsters · ' + esc(v.monsterTitle || 'Not a bonker yet') + '</h4><div class="cft-li"><span>' + w.e + '</span><div><b>' + esc(w.n) + '</b><small>Bonk ' + w.dmg + ' · reach ' + w.reach + ' m' + (w.ranged ? ' · ranged' : '') + ' · press F</small></div></div>' +
      (weapons.length > 1 || (weapons.length === 1 && s.equip.weapon !== weapons[0]) ? '<div class="cft-chips">' + weapons.map(k => '<button type="button" class="cft-chipb ' + (s.equip.weapon === k ? 'on' : '') + '" data-act="weapon" data-id="' + k + '">' + D.ITEMS[k].e + ' ' + esc(D.ITEMS[k].n) + '</button>').join('') + '</div>' : '') +
      '<p class="muted small">' + (v.night ? '🌙 It\'s night: ' + v.monstersOut + ' out there right now.' : '☀️ They come out after 21:30. Bakeries, toy shops and joke shops sell things to bonk with.') + '</p></div>' +
      (v.grudges.length ? '<div class="cft-sec"><h4>💢 Shops that banned you</h4>' + v.grudges.map(g => '<div class="cft-li"><span>💢</span><div><b>' + esc(g.name) + '</b><small>' + g.days + ' more day' + (g.days > 1 ? 's' : '') + ', or go and say sorry</small></div></div>').join('') + '</div>' : '') +
      '<div class="cft-sec"><h4>Shenanigans so far</h4><div class="cft-grid2">' + [['👾 Monsters bonked', v.bonks], ['🤡 Pranks', v.pranks], ['🏃 Escapes', v.escapes], ['😘 Hearts won', v.flirts], ['💕 Dates', v.dates], ['🧡 Kind acts', v.helped],
        ['🍌 Banana slides', v.slides], ['🤸 Bounces', v.bounces], ['😂 Jokes told', v.jokes], ['🎪 Street events', v.events]].map(x => '<div class="cft-mini"><small>' + x[0] + '</small><b>' + x[1] + '</b></div>').join('') + '</div></div>';
  };
  // ---- the chaos update (cft-chaos.js): aura, mayhem, the Dex, ranged weapons, flying
  // The Dex (2026-11-19, the user: "a bunch of things I can take pictures next to... is there a gallery? how am I completing
  // or collecting something?"): every creature you can snap, your photo of each, what's left and what it pays.
  VIEWS.dex = function () {
    if (!G.chaos) return '<div class="cft-empty">📸<p>The Dex is still loading.</p></div>';
    const v = G.chaos.summary(), pics = G.chaos.dexPics ? G.chaos.dexPics() : {}, RAR = { legendary: '👑 Legendary', rare: '💎 Rare', common: 'Common', neighbour: 'Neighbour' };
    const next = [[4, 'Okafor\'s mission at the library'], [6, '🏆 Brainrot Scholar'], [20, '🎓 the title "the Brainrot Professor"']].find(m => v.dexGot < m[0]);
    return '<div class="cft-pcard cft-dexhead"><b>📸 ' + v.dexGot + ' / ' + v.dexAll + ' creatures</b>' + bar(v.dexGot, v.dexAll, 'xp') +
      '<small>See an animal or a weird creature? Walk close and press <b>E</b> (the 📸 button) to snap it. Every <b>new</b> one pays cash + XP and its photo lands here and in your Album. ' +
      'Animals live all over town; the weird ones show as ❓ on the minimap (some fly, some only come out at night). A rainbow trail on the ground points to new ones.' + (next ? ' Next reward: <b>' + next[0] + ' snapped</b> = ' + esc(next[1]) + '.' : ' You snapped them all! 🎓') + '</small></div>' +
      '<div class="cft-dexg">' + v.dex.map(d => '<div class="cft-dexp ' + (d.got ? 'got ' : '') + d.rar + '" title="' + esc(d.got ? d.line || d.n : '???') + '">' +
        (d.got && pics[d.id] ? '<img alt="" src="' + pics[d.id] + '">' : '<span>' + (d.got ? d.e : '❓') + '</span>') +
        '<b>' + esc(d.got ? d.e + ' ' + d.n : '???') + '</b><small>' + esc(RAR[d.rar] || '') + (d.night ? ' · 🌙 night' : '') + (d.fly ? ' · flies' : '') + (d.got > 1 ? ' · ×' + d.got : '') + '</small></div>').join('') + '</div>';
  };
  VIEWS.chaos = function () {
    if (!G.chaos) return '<div class="cft-empty">🤪<p>The chaos is still loading.</p></div>';
    const v = G.chaos.summary(), s = save(), RAR = { legendary: '👑 Legendary', rare: '💎 Rare', common: 'Common', neighbour: 'Neighbour' };
    const fly = v.fly === 'jet' ? '🫘 Bean jetpack: hold Space in the air (refills on the ground). Golden ⭕ sky hoops pay out.' : v.fly === 'glide' ? '☂️ Glide-brella: hold Space while falling. Golden ⭕ sky hoops pay out.' : 'Nothing yet. Hardware stores sell the 🫘 Bean jetpack, clothes shops the ☂️ Glide-brella (back slot).';
    return '<div class="cft-pcard cft-aura"><b>😎 ' + v.aura.toLocaleString() + ' aura</b><span>Best mayhem: ' + (v.best ? v.best.toLocaleString() + ' pts (rank ' + esc(v.bestRank) + ')' : 'none yet') + '</span>' +
      '<small>Chain chaos without stopping (bonks, smashes, stunts, piñatas, launches, photos) and watch the meter at the top climb D → SSS. Stop for a few seconds and it cashes in. Getting pooped on by a seagull costs aura. Such is life.</small></div>' +
      '<div class="cft-sec"><h4>📸 The Dex · ' + v.dexGot + ' / ' + v.dexAll + '</h4><p class="muted small">Snap creatures with E when one is close. Your photos and what is left: the 📸 Dex app.</p><button type="button" class="cft-btn sm" data-app="dex">Open the Dex</button></div>' +
      '<div class="cft-sec"><h4>🎯 Shooters (slot 5)</h4>' + (v.ranged.length ? '<div class="cft-chips">' + v.ranged.map(k => '<button type="button" class="cft-chipb ' + ((G.aim ? G.aim.gun() : s.equip.weapon) === k ? 'on' : '') + '" data-act="weapon" data-id="' + k + '">' + D.ITEMS[k].e + ' ' + esc(D.ITEMS[k].n) + '</button>').join('') + '</div>' : '') +
      '<p class="muted small">' + (v.ranged.length ? 'Tap one to put it in slot 5. Key 5 picks the slot; hold the right mouse button to aim and left click to fire (hold to keep firing); the scroll wheel switches shooters while you aim.' : 'Shooters lie around town (🎯 on the map, under an orange beam). Toy shops 🎈, fast food 🥤🌭, gift shops 🎉💨, groceries 🍌, clothes 👕 and hardware stores 🥔🍄 sell them too.') +
      ' Figments throw things too: dodge, block, or block right as it lands to send it back. 🔁</p></div>' +
      '<div class="cft-sec"><h4>🛩️ Flying</h4><p class="muted small">' + fly + '</p></div>' +
      '<div class="cft-sec"><h4>Chaos so far</h4><div class="cft-grid2">' + v.stats.map(x => '<div class="cft-mini"><small>' + x[0] + '</small><b>' + x[1] + '</b></div>').join('') + '</div></div>';
  };
  // ---- colour blocks (cft-color.js, 2026-11-21): 2 km squares that start grey and get their colour back layer by layer
  VIEWS.colour = function () {
    if (!G.color) return '<div class="cft-empty">🎨<p>The colours are still loading.</p></div>';
    const v = G.color.summary(), h = v.here, T = v.T;
    const bar = (lv, col) => '<div class="cft-bar"><i style="width:' + Math.round(lv * 100) + '%;background:' + col + '"></i></div>';
    const COLS = ['#ff8a3d', '#6b4eff', '#20c997'];
    const how = [
      'Free places: outposts (Tom Hearton\'s, groceries) ' + T.wOutpost + ' pts, metro stations ' + T.wMetro + ' pts, walking into a shop (E) ' + T.wShop + ' pt (made-up shops ' + T.wMadeUp + '). ' + Math.round(h.lib * 10) / 10 + ' / ' + h.libT + ' pts.',
      'Find secret stashes in the tight gaps between buildings: ' + h.found + ' / ' + T.secretTarget + '.',
      'Bonk figments inside this block: ' + h.kills + ' / ' + T.killTarget + ' (champions count 2, rares 3, guardians 5).'];
    const rows = v.LAYERS.map((L, i) => '<div class="cft-li"><span>' + L[1] + '</span><div><b>' + L[2] + ' · ' + Math.round(h.lv[i] * 100) + '%</b>' + bar(h.lv[i], COLS[i]) + '<small>' + how[i] + '</small></div></div>').join('');
    const list = v.list.slice(0, 14).map(q => '<div class="cft-row"><span>' + (q.here ? '📍 ' : '') + (q.done ? '🌈 ' : '') + 'Block ' + q.bx + ', ' + q.bz + (q.here ? ' (you are here)' : ' · ' + q.dist + ' km') + '</span><b>' + Math.round(q.avg * 100) + '%</b></div>').join('');
    return '<div class="cft-pcard cft-aura"><b>🎨 ' + (h.done ? 'This block is restored 🌈' : Math.round(h.avg * 100) + '% colour in this block') + '</b><span>' + v.restored + ' block' + (v.restored === 1 ? '' : 's') + ' restored</span>' +
      '<small>The Static drained the colour out of the city. The map is cut into 2 km squares (your home sits in the middle of the first one). Each square gets its colour back in three layers, and when all three are full it is restored: cash, XP and a rainbow.' + (v.on ? '' : ' (Colour blocks are off in Settings: you see full colour everywhere.)') + '</small></div>' +
      '<div class="cft-sec"><h4>This block</h4>' + rows + '</div>' +
      '<div class="cft-sec"><h4>Blocks you have been to</h4>' + list + '</div>';
  };
  // ---- the stunt update (cft-stunt.js, 2026-11-19): ramps and rings of fire that pop up when you drive
  VIEWS.stunt = function () {
    if (!G.stunt) return '<div class="cft-empty">🏁<p>The stunts are still loading.</p></div>';
    const v = G.stunt.summary();
    return '<div class="cft-pcard cft-aura"><b>🏁 Best stunt: ' + (v.best.pts ? v.best.pts.toLocaleString() + ' pts' : 'none yet') + '</b><span>' + (v.best.pts ? esc(v.best.name) : 'Get in a car and find a ramp') + ' · best air ' + v.bestAir + ' s</span>' +
      '<small>' + (v.inCar ? v.near + ' stunt spots around you right now (🔥 and 🌋 on the map).' : 'Get in any car (your own, or borrow a parked one with E) and ramps 🛹, MEGA ramps 🌋 and rings of fire 🔥 pop up along the streets.') + '</small></div>' +
      '<div class="cft-sec"><h4>🕹️ How to do tricks</h4><p class="muted small">Drive over the blue arrows for a burst of speed, then off the ramp. In the air: <b>W / S</b> flip, <b>A / D</b> spin, <b>Space</b> barrel roll (on a phone: the stick and ⤒). Let go before you land and the car levels itself. Wheels down = it counts. Roof down = WIPEOUT. Space on the road = a little hop.</p>' +
      '<p class="muted small">Rings of fire hang where the arrows carry you. Land on the 🎯 for a bullseye. Mix tricks in one jump for a bigger multiplier, and launch again within a few seconds to keep a streak going.</p></div>' +
      '<div class="cft-sec"><h4>Stunts so far</h4><div class="cft-grid2">' + v.stats.map(x => '<div class="cft-mini"><small>' + x[0] + '</small><b>' + x[1] + '</b></div>').join('') + '</div></div>';
  };
  // ---- the campaign (cft-camp.js, 2026-11-18): the crazy list, missions on the map, secrets, ammo and powers, mega figments
  VIEWS.camp = function () {
    if (!G.camp) return '<div class="cft-empty">🌀<p>The campaign is still loading.</p></div>';
    const v = G.camp.summary();
    const mood = v.tier === 0 ? 'calm' : v.tier < 5 ? 'a bit weird' : v.tier < 10 ? 'properly weird' : v.tier < v.wild.length ? 'absolutely unhinged' : 'FULLY UNHINGED';
    const head = v.intro !== 'done' ? '<div class="cft-pcard cft-aura"><b>🌀 The opening: ' + Math.floor(v.left / 60) + ':' + String(v.left % 60).padStart(2, '0') + ' left</b><span>You can\'t die. Everything is chasing you. Survive, then go home.</span></div>'
      : '<div class="cft-pcard"><b>🌀 The city is ' + mood + '</b><span>' + Math.min(v.tier, v.wild.length) + ' of ' + v.wild.length + ' crazy things switched on · up to ' + v.cap + ' missions on the map at once</span>' +
        '<small>Every mission you finish switches on the next crazy thing below. The map never shows more than ' + v.cap + ' missions, so you always know what to do next.</small></div>';
    return head + '<div class="cft-sec"><h4>🤪 The crazy list</h4>' + v.wild.map(w => '<div class="cft-li ' + (w.on ? '' : 'locked') + '"><span>' + (w.on ? w.e : w.next ? '⏭️' : '🔒') + '</span><div><b>' + esc(w.n) + (w.next ? ' · after your next mission' : '') + '</b><small>' + esc(w.on || w.next ? w.d : '???') + '</small></div></div>').join('') + '</div>' +
      '<div class="cft-sec"><h4>🎒 Ammo and powers</h4><div class="cft-grid2">' +
      '<div class="cft-mini"><small>🎯 Ammo (ranged weapons)</small><b>' + v.ammo + ' / ' + v.max.ammo + '</b></div><div class="cft-mini"><small>💧 Water power (1)</small><b>' + v.water + ' / ' + v.max.water + '</b></div>' +
      '<div class="cft-mini"><small>🌩️ Lightning (2)</small><b>' + v.volt + ' / ' + v.max.volt + '</b></div><div class="cft-mini"><small>🧯 Extinguisher (hold 3)</small><b>' + v.foam + '%</b></div></div>' +
      '<p class="muted small">Ammo crates 🎯 sit around town (orange beams): run for them. Water orbs 💧 and lightning orbs 🌩️ float about; hydrants fill your water (E). Extinguishers 🧯 turn up near fires. Wet figments take double from lightning.</p></div>' +
      '<div class="cft-sec"><h4>Your story so far</h4><div class="cft-grid2">' +
      '<div class="cft-mini"><small>🔍 Secrets found</small><b>' + v.secrets + '</b></div><div class="cft-mini"><small>🦖 MEGA figments beaten</small><b>' + v.megas + '</b></div>' +
      '<div class="cft-mini"><small>🔥 Fires put out</small><b>' + v.fires + '</b></div><div class="cft-mini"><small>🦘 Best bounce chain</small><b>' + (save().counters.bestchain || 0) + '</b></div></div>' +
      '<p class="muted small">Secrets hide in the tight gaps between buildings: alleys you can barely fit into. Squeeze in and look for a ✨. Walls can be wall-jumped and roofs walked on.</p></div>';
  };
  // ---- the long game (cft-rpg.js): Character, Reputation, Achievements
  const lootRow = (v, it, btns, label) => '<div class="cft-li cft-loot q' + it.q + '"><span>' + it.e + '</span><div><b>' + esc(it.n) + (it.fresh ? ' <i class="cft-new">new</i>' : '') + '</b><small>' + (label || (it.slot && it.slot !== 'charm' ? v.slotNames[it.slot] : 'Charm')) + ' · ' +
    v.quality[it.q].n + ' · item level ' + it.il + ' · ' + esc(v.statLine(it)) + '</small></div>' + (btns || '') + '</div>';
  VIEWS.hero = function () {
    if (!G.rpg) return '<div class="cft-empty">🧙<p>Still loading.</p></div>';
    const v = G.rpg.view(), s = save();
    let h = '<div class="cft-pcard"><b>🧙 ' + esc(s.name) + (v.title ? ', ' + esc(v.title) : '') + '</b><span>Level ' + v.level + ' · 🏆 ' + v.achPoints + ' achievement points' +
      (v.rested ? ' · 💤 rested for ' + v.rested + ' XP' : '') + '</span>' +
      (v.titles.length ? '<div class="cft-chips"><button type="button" class="cft-chipb ' + (v.title ? '' : 'on') + '" data-act="title" data-id="">No title</button>' +
        v.titles.map(t => '<button type="button" class="cft-chipb ' + (v.title === t ? 'on' : '') + '" data-act="title" data-id="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>'
        : '<small>Titles come from achievements and Exalted factions.</small>') + '</div>';
    if (v.pending) h += '<div class="cft-sec"><div class="cft-li"><span>🎁</span><div><b>' + v.pending + ' mission reward' + (v.pending > 1 ? 's' : '') + ' to choose</b><small>Pick one of three charms for each</small></div><button type="button" class="cft-btn sm primary" data-act="claim">Choose</button></div></div>';
    const ups = v.bag.filter(it => v.upgrade(it)).length;
    h += '<div class="cft-sec"><h4>🛡️ Gear · ❤️ ' + (G.fun ? Math.ceil(G.fun.hp()) + '/' + G.fun.maxHp() : '') + ' health · armour ' + v.armor + '</h4><div class="cft-li"><span>👕</span><div><b>' + v.worn.filter(w => w.it).length + ' loot pieces worn · ' + v.bag.length + ' spare</b>' +
      '<small>' + (ups ? '▲ ' + ups + ' possible upgrade' + (ups > 1 ? 's' : '') + '. ' : '') + 'Swap gear and charms in the Wardrobe: your character with a slot for each thing.</small></div><button type="button" class="cft-btn sm primary" data-act="wardrobe" data-id="">Open</button></div></div>';
    h += '<div class="cft-sec"><h4>🌳 Talents · ' + v.points + ' point' + (v.points === 1 ? '' : 's') + ' to spend</h4><p class="muted small">A point every level. Three points in a branch open its next tier; the fifth tier is that branch\'s big one.</p>';
    for (const br of v.branches) {
      h += '<div class="cft-branch"><b class="cft-branch-h">' + br.b.e + ' ' + br.b.n + ' <small>' + br.spent + ' · ' + esc(br.b.blurb) + '</small></b>' + br.talents.map(x =>
        '<button type="button" class="cft-tal' + (x.rank ? ' got' : '') + (x.can ? ' can' : '') + (x.open ? '' : ' locked') + '" data-act="talent" data-id="' + x.t.id + '"><span>' + (x.open ? x.t.e : '🔒') + '</span><b>' + esc(x.t.n) +
        '</b><em>' + x.rank + '/' + x.t.max + '</em><small>' + (x.open ? esc(x.text) : 'Tier ' + x.t.tier + ': spend ' + ((x.t.tier - 1) * 3) + ' points in ' + br.b.n + ' first') + '</small></button>').join('') + '</div>';
    }
    h += '<div class="cft-row"><span class="muted small">' + v.spent + ' points spent</span>' + (v.spent ? '<button type="button" class="cft-btn sm ghost" data-act="respec">Reset talents ' + (v.respecCost ? G.fmt$(v.respecCost) : '(free the first time)') + '</button>' : '') + '</div></div>';
    for (const it of s.rpg.loot) it.fresh = 0;
    return h;
  };
  VIEWS.rep = function () {
    if (!G.rpg) return '';
    const v = G.rpg.view();
    return '<p class="muted small">Five groups in the neighbourhood notice what you do. Every tier brings a reward; Exalted brings a title and a Legendary charm.</p>' +
      v.factions.map(x => '<div class="cft-li cft-rep t' + x.t + '"><span>' + x.f.e + '</span><div><b>' + esc(x.f.n) + ' · <em>' + x.tier + '</em></b><small>' + esc(x.f.d) + '</small>' +
        bar(x.v - x.from, Math.max(1, x.to - x.from), 'rel') + '<small>' + (x.next ? (x.v - x.from) + ' / ' + (x.to - x.from) + ' to ' + x.next + ': ' + esc(x.reward.d) : 'Exalted. You are their favourite person.') + '</small></div></div>').join('');
  };
  VIEWS.ach = function () {
    if (!G.rpg) return '';
    const v = G.rpg.view(), cats = [...new Set(v.ach.map(x => x.a.cat))], got = v.ach.filter(x => x.done).length;
    return '<div class="cft-pcard"><b>🏆 ' + v.achPoints + ' points</b><span>' + got + ' of ' + v.ach.length + ' achievements · ' + v.streets + ' streets and ' + v.blocks + ' blocks discovered</span></div>' +
      cats.map(c => '<div class="cft-sec"><h4>' + esc(c) + '</h4>' + v.ach.filter(x => x.a.cat === c).map(x => '<div class="cft-li cft-ach' + (x.done ? ' got' : '') + '"><span>' + (x.done ? x.a.e : '🔒') + '</span><div><b>' + esc(x.a.n) +
        ' <em>' + x.a.pts + '</em></b><small>' + esc(x.a.d) + (x.a.title ? ' · title: ' + esc(x.a.title) : '') + (x.done ? ' · day ' + x.done : '') + '</small>' + (x.done ? '' : bar(x.v, x.a.c, 'st')) + '</div></div>').join('') + '</div>').join('');
  };
  VIEWS.album = function () {
    const s = save();
    const dupes = Object.keys(s.stickers).reduce((a, k) => a + Math.max(0, s.stickers[k] - 1), 0);
    const have = Object.keys(s.stickers).filter(k => s.stickers[k] > 0).length;
    return '<div class="cft-pcard"><b>🎴 ' + have + ' / ' + G.STICKERS.length + ' stickers</b><span>' + dupes + ' duplicates · 5 duplicates = 1 sticker of your choice</span>' + (dupes >= 5 ? '<button type="button" class="cft-btn sm primary" data-act="swap">🔄 Swap 5 duplicates</button>' : '') + '</div>' +
      D.STICKER_SETS.map(set => { const done = G.setDone(set.id); return '<div class="cft-set ' + (done ? 'done' : '') + '"><div class="cft-set-h"><b>' + esc(set.n) + '</b><small>' + (done ? '✅ ' : '🎁 ') + esc(set.bonusText) + '</small></div><div class="cft-stickers">' +
        set.items.map(([id, e, n]) => '<div class="cft-sticker ' + (s.stickers[id] > 0 ? 'got' : '') + '" title="' + esc(n) + '"><span>' + (s.stickers[id] > 0 ? e : '?') + '</span>' + (s.stickers[id] > 1 ? '<i>×' + s.stickers[id] + '</i>' : '') + '</div>').join('') + '</div></div>'; }).join('');
  };
  VIEWS.diary = function () {
    const s = save();
    return '<div class="cft-sec">' + (s.log.length ? s.log.map(l => '<div class="cft-li"><span>' + esc(l.e) + '</span><div><b>' + esc(l.t) + '</b><small>Day ' + l.d + ' · ' + String(l.h).padStart(2, '0') + ':00</small></div></div>').join('') : '<p class="muted">Your story starts now.</p>') + '</div>';
  };
  VIEWS.settings = function () {
    const s = save(), st = s.settings;
    return '<div class="cft-sec"><h4>You</h4><div class="cft-row"><span>Name: <b>' + esc(s.name) + '</b></span><button type="button" class="cft-btn sm" data-act="rename">Change</button></div>' +
      '<div class="cft-row"><span>Skin, hair, style, glasses...</span><button type="button" class="cft-btn sm primary" data-act="look">🪞 Change your look</button></div>' +
      (s.pref ? '<div class="cft-row"><span>Looking for: <b>' + (s.pref === 'bf' ? 'a boyfriend' : 'a girlfriend') + '</b></span><button type="button" class="cft-btn sm" data-act="pref">Switch</button></div>' : '') + '</div>' +
      '<div class="cft-sec"><h4>Game</h4><label class="cft-check"><input type="checkbox" data-set="sound" ' + (st.sound ? 'checked' : '') + '> Sound effects</label>' +
      '<label class="cft-check"><input type="checkbox" data-set="music" ' + (st.music !== false ? 'checked' : '') + '> Music</label>' +
      '<label class="cft-check"><input type="checkbox" data-set="voice" ' + (st.voice !== false ? 'checked' : '') + '> Voiced missions</label>' +
      '<label class="cft-check"><input type="checkbox" data-set="announcer" ' + (st.announcer !== false ? 'checked' : '') + '> Announcer (cheers out loud when you do something great)</label>' +
      '<label class="cft-check"><input type="checkbox" data-set="cine" ' + (st.cine !== false ? 'checked' : '') + '> Cinematic mission scenes</label>' +
      '<label class="cft-check"><input type="checkbox" data-set="reach" ' + (st.reach !== false ? 'checked' : '') + '> Show how far my bonk reaches (gold arc on the ground)</label>' +
      '<label class="cft-check"><input type="checkbox" data-set="colour" ' + (st.colour !== false ? 'checked' : '') + '> Colour comes back block by block (off = full colour everywhere)</label>' +
      '<div class="cft-row"><span>Compliments and hype</span><div class="cft-chips">' + [['max', 'Max'], ['some', 'Some'], ['off', 'Off']].map(q => '<button type="button" class="cft-chipb ' + ((st.hype || 'max') === q[0] ? 'on' : '') + '" data-act="hype" data-id="' + q[0] + '">' + q[1] + '</button>').join('') + '</div></div>' +
      '<div class="cft-row"><span>Graphics</span><div class="cft-chips">' + ['auto', 'high', 'low'].map(q => '<button type="button" class="cft-chipb ' + (st.quality === q ? 'on' : '') + '" data-act="quality" data-id="' + q + '">' + q + '</button>').join('') + '</div></div>' +
      '<div class="cft-row"><span>Map size (N)</span><div class="cft-chips">' + MAP_SIZES.map(q => '<button type="button" class="cft-chipb ' + ((st.mapSize || 'm') === q ? 'on' : '') + '" data-act="mapsize" data-id="' + q + '">' + MAP_NAMES[q] + '</button>').join('') + '</div></div>' +
      '<p class="muted small">Graphics changes apply next time you open the game. "low" turns off shadows and draws fewer people, for phones and older laptops.</p></div>' +
      '<div class="cft-sec"><h4>Home address</h4><p class="muted small">Your world is built around ' + esc(s.home.short || s.home.label) + '. To live somewhere else, start a new life.</p><button type="button" class="cft-btn danger" data-act="reset">Start a new life…</button></div>' +
      '<div class="cft-sec"><p class="muted small">Map data © OpenStreetMap contributors · tiles by OpenFreeMap / OpenMapTiles · hills © <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">Mapterhorn</a> (open elevation data, shown 1.5× taller)</p></div>';
  };

  async function onPhoneClick(e) {
    const app = e.target.closest('[data-app]');
    if (app) { if (app.dataset.app === 'wardrobe') { phoneOv.close(); U.wardrobe(); } else render(app.dataset.app); return; }
    const fol = e.target.closest('[data-follow]');
    if (fol) { save().settings.follow[fol.dataset.follow] = fol.checked; G.refreshFollowers(); G.dirty(); return; }
    const set = e.target.closest('[data-set]');
    if (set) {
      save().settings[set.dataset.set] = set.checked; G.dirty();
      if (set.dataset.set === 'music' && window.ArkMusic) window.ArkMusic.enabled(set.checked);
      if (set.dataset.set === 'colour' && G.color) G.color.apply('snap');
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const s = save(), id = b.dataset.id, act = b.dataset.act;
    switch (act) {
      case 'track': G.track(id); U.refreshPhone(); break;
      case 'mapsize': U.mapSize(id); U.refreshPhone(); break;
      case 'abandon': if (await U.confirm('Drop "' + G.getM(id).title + '"? You can pick it up again later.', 'Drop it')) { G.abandon(id); U.refreshPhone(); } break;
      case 'goto': { const m = G.getM(id), sp = G.spotOf(m.giver, m.at); s.track = null; phoneOv.close(); U.toast('🎯 ' + D.CAST[m.giver].n + ' is at ' + (sp ? sp.name : 'their spot') + '. Follow the arrow!'); G.rt.pinGoal = sp; break; }
      case 'job': G.takeJob(+id); phoneOv.close(); U.toast('💼 Job taken. Follow the arrow!'); break;
      case 'zin': mapScale = Math.min(3, mapScale * 1.5); drawBigMap(); break;
      case 'zout': mapScale = Math.max(0.12, mapScale / 1.5); drawBigMap(); break;
      case 'eat': { const it = D.ITEMS[id]; G.giveItem(id, -1); G.addEnergy((it.energy || 0) * G.foodMul()); if (it.happy) G.addHappy(it.happy); if (it.give) G.giveItem(it.give, 1); U.feed(it.e, 'Yum!'); U.refreshPhone(); break; }
      case 'ride': G.setRide(id || null); U.refreshPhone(); break;
      case 'wardrobe': phoneOv.close(); U.wardrobe(id || null); break;
      case 'gift': await G.giveGift(id); U.refreshPhone(); break;
      case 'hang': s.settings.follow.friend = s.settings.follow.friend === id ? null : id; G.refreshFollowers(); U.refreshPhone(); G.dirty(); break;
      case 'move': phoneOv.close(); await G.moveHome(+id); break;
      case 'buybiz': phoneOv.close(); await G.buyBiz(id); break;
      case 'upgrade': G.upgradeBiz(id); U.refreshPhone(); break;
      case 'mgr': G.hireManager(id); U.refreshPhone(); break;
      case 'findbiz': { const q = s.biz[id]; G.rt.pinGoal = { lat: q.lat, lon: q.lon, name: q.name }; s.track = null; phoneOv.close(); break; }
      case 'findcrush': { const q = s.fun.crushes.find(c => c.id === id); if (q) { G.rt.pinGoal = { lat: q.lat, lon: q.lon, name: q.name }; s.track = null; phoneOv.close(); U.toast('💕 ' + q.name + ' is waiting. Follow the arrow!'); } break; }
      case 'talent': if (G.rpg.learn(id)) U.refreshPhone(); else U.toast(G.rpg.points() ? 'That tier is still locked: spend points lower in the branch.' : 'No points left. You get one every level.'); break;
      case 'respec': if (await U.confirm('Reset all your talents and get the points back?', 'Reset')) { G.rpg.respec(); U.refreshPhone(); } break;
      case 'equipc': G.rpg.equip(id); U.refreshPhone(); break;
      case 'unequipc': G.rpg.unequip(id); U.refreshPhone(); break;
      case 'sellc': G.rpg.sell(id); U.refreshPhone(); break;
      case 'selljunk': G.rpg.sellJunk(); U.refreshPhone(); break;
      case 'title': G.rpg.setTitle(id || null); U.refreshPhone(); break;
      case 'claim': await G.rpg.claim(); U.refreshPhone(); break;
      case 'weapon': if (G.aim && G.aim.isShooter(D.ITEMS[id] && D.ITEMS[id].weapon)) { G.aim.pickGun(id); if (G.aim.slot() !== 'gun') G.aim.select('gun'); } else if (s.equip.weapon === id) delete s.equip.weapon; else { s.equip.weapon = id; if (G.rpg) G.rpg.unequip('weapon'); } U.refreshPhone(); G.dirty(); break;
      case 'swap': await swapStickers(); U.refreshPhone(); break;
      case 'rename': { const n = await U.ask('Your name', s.name); if (n && n.trim()) { s.name = n.trim().slice(0, 20); G.dirty(); } U.refreshPhone(); break; }
      case 'look': phoneOv.close(); U.lookEditor(); break;
      case 'pref': s.pref = s.pref === 'bf' ? 'gf' : 'bf'; G.refreshFollowers(); G.dirty(); U.refreshPhone(); break;
      case 'quality': s.settings.quality = id; G.dirty(); U.refreshPhone(); break;
      case 'hype': s.settings.hype = id; G.dirty(); U.refreshPhone(); break;
      case 'reset': if (await U.confirm('Start a brand-new life? Your money, missions, home and everything else will be gone for good.', 'Yes, start over')) G.reset(); break;
      case 'help': phoneOv.close(); U.help(); break;
      case 'exit': phoneOv.close(); G.exit(); break;
      default: break;
    }
  }
  async function swapStickers() {
    const s = save();
    const missing = G.STICKERS.filter(x => !x.feat && !(s.stickers[x.id] > 0));
    if (!missing.length) { U.toast('You have every sticker!'); return; }
    const v = await U.choose({ title: '🔄 Pick a sticker', text: 'Trade 5 duplicates for:', opts: missing.slice(0, 9).map(x => ({ t: x.e + ' ' + x.n, v: x.id })).concat([{ t: 'Cancel', v: '' }]) });
    if (!v) return;
    let need = 5;
    for (const k of Object.keys(s.stickers)) { while (need > 0 && s.stickers[k] > 1) { s.stickers[k]--; need--; } }
    s.stickers[v] = 1;
    U.feed(G.STICKERS.find(x => x.id === v).e, 'Swapped!');
    G.dirty();
  }

  // ------------------------------------------------------------------ places: shop, business, home, bank, metro
  U.shopPanel = function (pl) {
    const k = D.KINDS[pl.kind];
    const draw = ov => {
      const s = save();
      ov.el.querySelector('[data-items]').innerHTML = k.sells.map(id => {
        const it = D.ITEMS[id], why = G.canBuy(id), price = G.priceOf(id);
        const free = G.isFriend('rosa') && (pl.kind === 'bakery' || pl.kind === 'cafe') && (it.type === 'food' || it.type === 'snack');
        return '<div class="cft-li"><span>' + it.e + '</span><div><b>' + esc(it.n) + '</b><small>' + itemLine(it) + '</small></div><button type="button" class="cft-btn sm ' + (why ? '' : 'primary') + '" data-buy="' + id + '" ' + (why && why !== 'Not enough money' ? 'disabled' : '') + ' title="' + esc(why || '') + '">' +
          (why && why !== 'Not enough money' ? esc(why) : free ? 'Free 💕' : price ? G.fmt$(price) : 'Free') + '</button></div>';
      }).join('');
      ov.el.querySelector('[data-cash]').textContent = G.fmt$(s.money);
    };
    const ov = overlay('<div class="cft-card cft-shop"><div class="cft-shop-h"><span>' + k.e + '</span><div><b>' + esc(pl.name || k.n) + '</b><small>' + esc(k.n) + (pl.virtual ? ' · a made-up shop' : ' · a real place on the map') + '</small></div><b class="cft-pmoney" data-cash></b><button type="button" class="cft-pbtn" data-x>✕</button></div>' +
      (G.discount() > 0.01 ? '<p class="cft-disc">🕶️ Style discount: ' + Math.round(G.discount() * 100) + '% off</p>' : '') + '<div data-items class="cft-shop-items"></div>' +
      (G.fun && G.fun.canPrank(pl) ? '<div class="cft-row"><button type="button" class="cft-btn sm ghost" data-prank>🤡 Pull a prank (the owner will chase you)</button></div>' : '') + '</div>', 'cft-center', { dismiss: true });
    ov.el.querySelector('[data-x]').onclick = () => ov.close();
    ov.el.addEventListener('click', e => {
      if (e.target.closest('[data-prank]')) { ov.close(); G.fun.prank(pl); return; }
      const b = e.target.closest('[data-buy]'); if (b) { G.buy(b.dataset.buy, pl); draw(ov); }
    });
    draw(ov);
  };
  U.bizPanel = function (id) {
    const d = G.BIZ[id];
    const draw = ov => {
      const b = save().biz[id];
      ov.el.querySelector('[data-body]').innerHTML = '<div class="cft-grid2"><div class="cft-mini"><small>Income</small><b>' + G.fmt$(G.bizIncome(id)) + '/h</b></div><div class="cft-mini"><small>Earned so far</small><b>' + G.fmt$(b.earned || 0) + '</b></div></div>' +
        (b.mgr ? '<p>🧑‍💼 Your manager collects the till for you.</p>' : '<div class="cft-li"><span>💰</span><div><b>Till: ' + G.fmt$(b.till) + '</b><small>Fills up to ' + G.fmt$(G.bizCap(id)) + ' (4 hours). Hire a manager to collect automatically.</small>' + bar(b.till, G.bizCap(id)) + '</div><button type="button" class="cft-btn sm primary" data-a="collect" ' + (b.till >= 1 ? '' : 'disabled') + '>Collect</button></div>') +
        '<div class="cft-li"><span>🚨</span><div><b>Rush hour</b><small>Deliver orders to real addresses for big tips. Once a day.</small></div><button type="button" class="cft-btn sm ' + (b.rushDay === save().day ? '' : 'primary') + '" data-a="rush" ' + (b.rushDay === save().day ? 'disabled' : '') + '>' + (b.rushDay === save().day ? 'Tomorrow' : 'Start') + '</button></div>' +
        (b.lvl < 5 ? '<div class="cft-li"><span>⬆️</span><div><b>' + esc(d.up[b.lvl - 1]) + '</b><small>Level ' + (b.lvl + 1) + ': +60% income</small></div><button type="button" class="cft-btn sm" data-a="up">' + G.fmt$(G.upgradeCost(id)) + '</button></div>' : '') +
        (!b.mgr ? '<div class="cft-li"><span>🧑‍💼</span><div><b>Hire a manager</b><small>Collects the till and keeps earning while you\'re away.</small></div><button type="button" class="cft-btn sm" data-a="mgr">' + G.fmt$(G.managerCost(id)) + '</button></div>' : '');
    };
    const ov = overlay('<div class="cft-card cft-shop"><div class="cft-shop-h"><span>' + d.e + '</span><div><b>' + esc(save().biz[id].name) + '</b><small>' + esc(d.n) + ' · ' + '★'.repeat(save().biz[id].lvl) + '</small></div><button type="button" class="cft-pbtn" data-x>✕</button></div><div data-body></div></div>', 'cft-center', { dismiss: true });
    ov.el.querySelector('[data-x]').onclick = () => ov.close();
    ov.el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'collect') G.collectTill(id);
      if (b.dataset.a === 'up') G.upgradeBiz(id);
      if (b.dataset.a === 'mgr') G.hireManager(id);
      if (b.dataset.a === 'rush') { ov.close(); G.startRush(id); return; }
      draw(ov);
    });
    draw(ov);
  };
  U.homePanel = function () {
    const s = save(), a = D.APARTMENTS[s.apt.tier];
    const fam = [s.partner ? D.CAST[s.partner].e + ' ' + D.CAST[s.partner].n : null].concat(s.kids.map(k => '🧒 ' + k.name)).concat(s.pets.map(p => (p.kind === 'dog' ? '🐕 ' : '🐈 ') + p.name)).filter(Boolean);
    const ov = overlay('<div class="cft-card cft-shop"><div class="cft-shop-h"><span>' + a.e + '</span><div><b>Home</b><small>' + esc(a.n) + ' · ' + esc(s.apt.label) + '</small></div><button type="button" class="cft-pbtn" data-x>✕</button></div>' +
      '<div class="cft-li"><span>😴</span><div><b>Sleep until 7:00</b><small>Fills your energy. Rent is paid at midnight.</small></div><button type="button" class="cft-btn sm primary" data-a="sleep">Sleep</button></div>' +
      '<div class="cft-li"><span>🛋️</span><div><b>Relax for an hour</b><small>+15 ⚡, +2 😊</small></div><button type="button" class="cft-btn sm" data-a="relax">Relax</button></div>' +
      (fam.length ? '<div class="cft-li"><span>💞</span><div><b>Family time</b><small>' + esc(fam.join(' · ')) + '</small></div><button type="button" class="cft-btn sm" data-a="family">Hang out</button></div>' : '') +
      '<div class="cft-row"><button type="button" class="cft-btn" data-a="homes">🏠 Find a better place</button></div></div>', 'cft-center', { dismiss: true });
    ov.el.querySelector('[data-x]').onclick = () => ov.close();
    ov.el.addEventListener('click', async e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'sleep') { ov.close(); await G.sleep(); }
      if (b.dataset.a === 'relax') { ov.close(); await U.fade(() => { G.save.clock += 1; G.save.gameMin += 60; G.addEnergy(15); G.addHappy(2); }, '🛋️ Ahh...'); }
      if (b.dataset.a === 'family') { ov.close(); await U.fade(() => { G.save.clock += 2; G.save.gameMin += 120; G.addHappy(8); if (s.partner) G.addRel(s.partner, 4); }, '💞 Family time'); U.feed('💞', 'Everyone is happier'); }
      if (b.dataset.a === 'homes') { ov.close(); U.phone('homes'); }
    });
  };
  U.bankPanel = function (pl) {
    const draw = ov => {
      const s = save();
      ov.el.querySelector('[data-body]').innerHTML = '<div class="cft-grid2"><div class="cft-mini"><small>Pocket</small><b>' + G.fmt$(s.money) + '</b></div><div class="cft-mini"><small>Savings (1%/day)</small><b>' + G.fmt$(s.savings) + '</b></div></div>' +
        '<div class="cft-row"><button type="button" class="cft-btn sm" data-a="dep" data-v="0.5">Deposit half</button><button type="button" class="cft-btn sm" data-a="dep" data-v="1">Deposit all</button><button type="button" class="cft-btn sm" data-a="wd">Withdraw all</button></div>' +
        '<p class="muted small">Savings earn 1% interest every game day. Missions count money in your pocket, so withdraw before big purchases.</p>';
    };
    const ov = overlay('<div class="cft-card cft-shop"><div class="cft-shop-h"><span>🏦</span><div><b>' + esc(pl.name || 'Bank') + '</b><small>Savings account</small></div><button type="button" class="cft-pbtn" data-x>✕</button></div><div data-body></div></div>', 'cft-center', { dismiss: true });
    ov.el.querySelector('[data-x]').onclick = () => ov.close();
    ov.el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const s = save();
      if (b.dataset.a === 'dep') { const v = Math.floor(s.money * +b.dataset.v); s.money -= v; s.savings += v; }
      if (b.dataset.a === 'wd') { s.money += s.savings; s.savings = 0; }
      G.sfx.cash(); G.dirty(); draw(ov);
    });
    draw(ov);
  };
  U.metroPanel = function (here) {
    const s = save();
    const list = s.metro.filter(m => m.id !== here.id);
    const ov = overlay('<div class="cft-card cft-shop"><div class="cft-shop-h"><span>🚇</span><div><b>' + esc(here.name || 'Metro') + '</b><small>Ride to any station you\'ve freed from its guardian · $3</small></div><button type="button" class="cft-pbtn" data-x>✕</button></div>' +
      (list.length ? list.map((m, i) => '<div class="cft-li"><span>🚉</span><div><b>' + esc(m.name) + '</b><small>' + (G.W ? Math.round(Math.hypot(G.xz(m).x - G.W.player.pos.x, G.xz(m).z - G.W.player.pos.z)) + ' m away' : '') + '</small></div><button type="button" class="cft-btn sm primary" data-i="' + i + '">Ride</button></div>').join('')
        : '<p class="muted">Every metro entrance has a guardian (💀 on the map). Beat it and the station joins your network: ride between them in seconds.</p>') + '</div>', 'cft-center', { dismiss: true });
    ov.el.querySelector('[data-x]').onclick = () => ov.close();
    ov.el.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { ov.close(); G.metroTo(list[+b.dataset.i]); } });
  };

  U.init = function () { sizeMinimap(); setTimeout(() => U.onReady && U.onReady(), 0); };
  U.applySettings = function () { const s = save(); if (s && s.settings.mapSize) { $('[data-mmwrap]').dataset.size = s.settings.mapSize; requestAnimationFrame(sizeMinimap); } };
  U.destroy = function () {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', unblock);
    window.removeEventListener('blur', unaim);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('resize', sizeMinimap);
    U.closeAll();
    root.innerHTML = '';
  };
  return U;
}
window.CFTUI = { create };
})();
