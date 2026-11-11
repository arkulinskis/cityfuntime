/* cft-kit.js: window.CFT, the glue between the Python Forms and City Fun Time's JavaScript engine.

   - Loads the engine files on demand (their addresses with ?v= hashes are <meta name="cft-asset"> tags in head_html,
     kept current by tools/assets.py): CFT.data() = content + rules (Life, Quests, Album), CFT.load() = the whole 3D game.
   - Keeps the save in two places: this browser (always, localStorage "cityfuntime.save.<user id|guest>", the same key as
     the old JavaScript app, so saves survive the conversion) and the server (signed in: get_save / put_save).
   - Server calls go through Python: window.CFT_HOST.call(fn, argsJson, quiet) is set by client_code/cft.py and returns
     JSON text {result} or {error}. CFT.me is set by cft.py too ({id, name, ...} or null).
   - CFT.viewJSON(name, arg) turns the save into plain JSON for the Forms pages (life, quests, mission, album), so Python
     never walks the engine's objects.
   - CFT.mountGame(root, hooks) mounts the 3D game (Components/Game). */
(function () {
  'use strict';
  var loaded = {};
  var STORE = 'cityfuntime.';

  function assetUrl(name) {
    var metas = document.querySelectorAll('meta[name="cft-asset"]');
    for (var i = 0; i < metas.length; i++) {
      var c = metas[i].getAttribute('content') || '';
      if (c.indexOf('_/theme/' + name + '?') === 0) return c;
    }
    return '_/theme/' + name;
  }
  function script(name) {
    if (!loaded[name]) loaded[name] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = assetUrl(name);
      s.async = false;
      s.onload = res;
      s.onerror = function () { delete loaded[name]; rej(new Error('Couldn\'t load ' + name + '. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return loaded[name];
  }
  function chain(list) { return list.reduce(function (p, n) { return p.then(function () { return script(n); }); }, Promise.resolve()); }
  var DATA = ['cft-content.js', 'cft-game.js'];
  var ALL = ['three.min.js', 'cft-content.js', 'cft-tiles.js', 'cft-world.js', 'cft-ui.js', 'cft-fun.js', 'cft-game.js'];

  function get(k, dflt) { try { var v = localStorage.getItem(STORE + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } }
  function set(k, v) { try { localStorage.setItem(STORE + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
  function esc(s) { return String(s == null ? '' : s); }
  function money(n) { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('en-US'); }
  function pct(v, max) { return Math.max(0, Math.min(100, max ? v / max * 100 : 0)); }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function ago(ms) {
    var s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [30, 'day'], [12, 'month'], [1e9, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return n + ' ' + steps[i][1] + (n === 1 ? '' : 's') + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  }

  var CFT = window.CFT = {
    me: null,
    adopt: null,
    save: null,
    api: function (fn, args, quiet) {
      var host = window.CFT_HOST;
      if (!host) return Promise.reject(new Error('Not ready yet'));
      return Promise.resolve(host.call(fn, JSON.stringify(args || []), !!quiet)).then(function (text) {
        var r = JSON.parse(text);
        if (r.error) throw new Error(r.error);
        return r.result;
      });
    },
    // The server's backup copy of the map tiles (server_code/Tiles.py), used by the 3D world (cft-world.js).
    tiles: {
      archive: function (keys) { return CFT.api('tile_archive', [keys], true); },
      backup: function (key) { return CFT.api('tile_backup', [key], true); }
    },
    data: function () { return chain(DATA); },
    load: function () { return chain(ALL); },
    key: function () { return 'save.' + (CFT.me ? CFT.me.id : 'guest'); },
    local: function (who) { return get(who ? 'save.' + who : CFT.key(), null); },
    // The player's save: the server copy for signed-in players (or this device's copy if it is newer), else this device's.
    loadSave: function () {
      var local = CFT.local();
      if (!CFT.me) return Promise.resolve(local);
      return CFT.api('get_save', [], true).then(function (r) {
        var srv = r && r.save;
        if (srv && local && (local.updated || 0) > (srv.updated || 0) + 1000) { CFT.push(local, true); return local; }
        if (srv) { set(CFT.key(), srv); return srv; }
        if (local) { CFT.push(local, true); return local; }
        var guest = CFT.local('guest');
        if (guest) { CFT.adopt = guest; }  // a game played before signing in: the page offers to keep it
        return null;
      }, function () { return local; });
    },
    // Called by the game whenever something changes (debounced there). Writes locally at once, to the server every 20 s.
    persist: function (save, reason) {
      set(CFT.key(), save);
      if (!CFT.me) return;
      var now = Date.now();
      if (reason === 'exit' || reason === 'now' || now - (CFT._last || 0) > 20000) CFT.push(save);
      else { clearTimeout(CFT._t); CFT._t = setTimeout(function () { CFT.push(save); }, 20000 - (now - CFT._last)); }
    },
    push: function (save, quiet) {
      if (!CFT.me) return Promise.resolve();
      CFT._last = Date.now();
      clearTimeout(CFT._t);
      return CFT.api('put_save', [save], true).then(function (r) { CFT.lastSync = Date.now(); return r; },
        function (e) { if (!quiet) console.warn('save', e && e.message); });
    },
    reset: function () {
      set(CFT.key(), null);
      return CFT.me ? CFT.api('reset_save', [], true) : Promise.resolve();
    },
    photos: function () { return get('photos.' + (CFT.me ? CFT.me.id : 'guest'), []); },
    addPhoto: function (url, meta) {
      var list = CFT.photos();
      list.unshift({ url: url, caption: meta.caption, day: meta.day, street: meta.street, at: Date.now() });
      while (list.length > 24) list.pop();
      set('photos.' + (CFT.me ? CFT.me.id : 'guest'), list);
    },
    money: money,

    // ---- for the Forms pages: load content + the save once, then ask for plain JSON views of it
    prepare: function () {
      return CFT.data().then(function () { return CFT.loadSave(); }).then(function (s) {
        CFT.save = s ? window.CFTGame.migrate(s) : null;
        return true;
      });
    },
    track: function (id) {
      var s = CFT.save;
      if (!s) return false;
      s.track = id; s.updated = Date.now();
      CFT.persist(s, 'now');
      return true;
    },
    viewJSON: function (name, arg) { return JSON.stringify(VIEWS[name](CFT.save, arg)); },

    // ---- the 3D game (Components/Game): hooks = {exit(), reload()} from Python
    mountGame: function (root, hooks) {
      var game = null, dead = false;
      function hide() { if (document.hidden && game && game.G.saveNow) game.G.saveNow('now'); }
      document.addEventListener('visibilitychange', hide);
      var ctl = {
        destroy: function () {
          dead = true;
          document.removeEventListener('visibilitychange', hide);
          if (game) game.destroy();
          game = null; window.CFT_GAME = null;
        }
      };
      ctl.ready = CFT.load().then(function () { return CFT.loadSave(); }).then(function (save) {
        if (dead) return;
        if (!save && CFT.adopt) { save = CFT.adopt; CFT.adopt = null; CFT.push(save); }
        root.innerHTML = '';
        game = window.CFTGame.mount(root, {
          save: save, me: CFT.me,
          onSave: function (s, reason) { CFT.persist(s, reason); },
          onPhoto: function (url, meta) { CFT.addPhoto(url, meta); },
          onExit: function () { hooks.exit(); },
          onReset: function () { CFT.reset().then(function () { if (game) { game.destroy(); game = null; } hooks.reload(); }); }
        });
        window.CFT_GAME = game;
      }, function (e) {
        if (dead) return;
        root.innerHTML = '';
        var p = document.createElement('p');
        p.className = 'cft-fail';
        p.textContent = (e && e.message) || 'The city couldn\'t load. Check your connection and try again.';
        root.appendChild(p);
      });
      return ctl;
    }
  };

  // ------------------------------------------------------------------ plain JSON views for the Forms pages
  function stepText(s, id, M) {
    var ms = s.m[id], st = M.steps[ms.st] || {}, bf = s.pref === 'bf';
    var left = st.do === 'deliver' ? (st.n || 1) - (ms.p || 0) : '';
    return String(st.text || '').replace(/\{place\}/g, (ms.tg && ms.tg.name) || 'a spot nearby').replace(/\{n\}/g, left)
      .replace(/\{pt\}/g, bf ? 'boyfriend' : 'girlfriend').replace(/\{kid\}/g, s.kids[0] ? s.kids[0].name : 'your kid').replace(/\{name\}/g, s.name)
      .replace(/\{he\}/g, bf ? 'he' : 'she').replace(/\{him\}/g, bf ? 'him' : 'her').replace(/\{his\}/g, bf ? 'his' : 'her');
  }
  function stepLabel(st, s) {
    var t = (st.text || st.do).replace(/\{place\}/g, 'a nearby spot').replace(/\{n\}/g, '').replace(/\{pt\}/g, s && s.pref === 'bf' ? 'boyfriend' : 'girlfriend')
      .replace(/\{kid\}/g, s && s.kids[0] ? s.kids[0].name : 'your kid').replace(/\{he\}/g, 'they').replace(/\{him\}|\{his\}/g, 'them').replace(/\{name\}/g, s ? s.name : 'you');
    return t.replace(/\s*\(\s*left\)/, '');
  }
  function openCount(s) {
    return window.CFT_DATA.MISSIONS.filter(function (m) { return !s.m[m.id] && window.CFTGame.reqMet(s, m) || (s.m[m.id] && s.m[m.id].s === 'open'); }).length;
  }
  var STATUS = { done: 'Done', active: 'Active', open: 'New', locked: 'Locked' };

  var VIEWS = {
    life: function (s) {
      var G = window.CFTGame, D = window.CFT_DATA;
      if (!s) {
        var a = CFT.adopt;
        return { welcome: true, adopt: a ? { name: a.name || 'Player', level: G.levelOf(a.xp || 0) } : null };
      }
      var S = G.summary(s), lv = S.level, x0 = G.xpAt(lv), x1 = G.xpAt(lv + 1);
      var track = s.track && s.m[s.track] && s.m[s.track].s === 'active' ? s.track : null;
      var M = track ? (G.MISSION[track] || (s.dyn || {})[track]) : null;
      var apt = D.APARTMENTS[s.apt.tier] || D.APARTMENTS[0];
      var love;
      if (s.partner) {
        love = { title: D.CAST[s.partner].e + ' ' + D.CAST[s.partner].n, sub: s.married ? 'Married 💒' : s.engaged ? 'Engaged 💍' : 'Your ' + (s.pref === 'bf' ? 'boyfriend' : 'girlfriend') };
      } else love = { title: '', sub: 'Single, for now. Nonna Rosa has opinions about that.' };
      love.kids = (s.kids || []).map(function (k) { return { text: (s.day - k.born > 12 ? '🧒' : '👶') + ' ' + esc(k.name), tone: '' }; });
      love.pets = (s.pets || []).map(function (p) { return { text: (p.kind === 'dog' ? '🐕' : '🐈') + ' ' + esc(p.name), tone: '' }; });
      // street life (cft-fun.js): sweethearts around town, the cardboard crown, monsters bonked
      var fun = s.fun || {}, bonks = (s.counters || {}).bonks || 0;
      (fun.crushes || []).forEach(function (c) { love.pets.push({ text: '💕 ' + esc(c.name), tone: 'pink' }); });
      if (fun.king) love.pets.push({ text: '👑 ' + esc(fun.king) + ' of the Streets', tone: 'gold' });
      else if (fun.hearts) love.pets.push({ text: '🧡 ' + fun.hearts + ' street hearts', tone: '' });
      if (bonks) love.pets.push({ text: '👾 ' + bonks + ' monsters bonked', tone: 'grape' });
      return {
        welcome: false, name: s.name, initials: initials(s.name), sub: '⭐ Level ' + lv + ' · Day ' + s.day + ' · ' + (S.home || ''),
        xp: pct(s.xp - x0, x1 - x0), money: money(s.money), worth: 'Net worth ' + money(S.worth),
        now: M ? { on: true, title: M.title, text: 'Step ' + (s.m[track].st + 1) + ' of ' + M.steps.length + ': ' + stepText(s, track, M) }
          : { on: false, title: 'Free roaming', text: openCount(s) + ' people in the neighbourhood have a mission for you.' },
        home: { e: apt.e, title: apt.n, label: s.apt.label || '', note: (apt.rent ? money(apt.rent) + ' rent / day' : 'Owned, no rent') + ' · +' + apt.happy + ' 😊' },
        love: love,
        stats: D.STATS.map(function (st) { var v = s.stats[st.id] || 0; return { e: st.e, name: st.name, pct: pct(v % 1, 1), value: String(Math.floor(v)), tone: 'mint' }; })
          .concat([{ e: '😊', name: 'Happiness', pct: pct(s.happy, 100), value: Math.round(s.happy) + '%', tone: 'pink' }]),
        friends: Object.keys(s.friends || {}).map(function (id) { var c = D.CAST[id] || { e: '🙂', n: id }; return { e: c.e, title: c.n, sub: D.FRIEND_PERKS[id] || '' }; }),
        biz: Object.keys(s.biz || {}).map(function (id) {
          var d = G.BIZ[id] || { e: '💼', n: id }, b = s.biz[id];
          return { e: d.e, title: b.name + ' ' + '★'.repeat(b.lvl || 1), sub: d.n + (b.mgr ? ' · managed' : '') };
        }),
        turfs: S.turfs + ' block' + (S.turfs === 1 ? '' : 's') + ' won',
        turfsNote: S.turfs ? 'The crews have respect for you. Watch for rival tags.' : 'Pigeon Mafia, Skate Rats, Bingo Grannies... Every block has a crew to win over.',
        stickers: S.stickers + ' / ' + S.stickersTotal + ' stickers', stickersPct: pct(S.stickers, S.stickersTotal),
        missions: S.missions + ' of ' + S.missionsTotal + ' missions done',
        diary: (s.log || []).slice(0, 16).map(function (l) { return { e: esc(l.e), text: esc(l.t), day: 'Day ' + l.d }; }),
        saved: 'Saved ' + (s.updated ? ago(s.updated) : 'just now')
      };
    },
    quests: function (s, filter) {
      var G = window.CFTGame, D = window.CFT_DATA, board = G.missionBoard(s), all = [];
      board.forEach(function (c) { all = all.concat(c.missions); });
      var counts = { all: all.length };
      ['active', 'open', 'done', 'locked'].forEach(function (k) { counts[k] = all.filter(function (m) { return m.status === k; }).length; });
      return {
        lead: D.MISSIONS.length + ' missions across ' + D.CHAPTERS.length + ' chapters. Missions happen at real places around your home.',
        started: !!s, counts: counts,
        chapters: board.map(function (c) {
          var list = c.missions.filter(function (m) { return filter === 'all' || m.status === filter; });
          var done = c.missions.filter(function (m) { return m.status === 'done'; }).length;
          return {
            e: c.ch.e, title: (c.ch.id < 10 ? 'Chapter ' + c.ch.id + ': ' : '') + c.ch.n, blurb: c.ch.blurb || '',
            count: done + ' / ' + c.missions.length, pct: pct(done, c.missions.length),
            missions: list.map(function (m) {
              return { id: m.id, e: m.status === 'locked' ? '🔒' : m.giver.e, title: m.title, sub: m.giver.n + (m.tracked ? ' · 🎯 tracking' : ''),
                status: m.status, label: STATUS[m.status] };
            })
          };
        }).filter(function (c) { return c.missions.length; })
      };
    },
    mission: function (save, id) {
      var G = window.CFTGame, D = window.CFT_DATA, M = G.MISSION[id], c = D.CAST[M.giver];
      var st = save && save.m[id], status = st ? st.s : (save && G.reqMet(save, M) ? 'open' : 'locked');
      var cur = st && st.s === 'active' ? st.st : st && st.s === 'done' ? 99 : -1;
      var req = M.req || {}, reqs = [];
      (req.m || []).forEach(function (r) { var x = G.MISSION[r]; reqs.push((save && save.m[r] && save.m[r].s === 'done' ? '✅ ' : '⬜ ') + (x ? x.title : r)); });
      if (req.lvl) reqs.push('⭐ Level ' + req.lvl);
      if (req.partner) reqs.push('💘 Be in a relationship');
      if (req.stat) Object.keys(req.stat).forEach(function (k) { reqs.push('📊 ' + k + ' ' + req.stat[k]); });
      if (!save) reqs.unshift('🎮 Start a game: press Play and move in');
      var r = M.reward || {}, out = [];
      if (r.money) out.push({ text: '💵 ' + money(r.money), tone: 'gold' });
      if (r.xp) out.push({ text: '⭐ ' + r.xp + ' XP', tone: 'grape' });
      Object.keys(r.stats || {}).forEach(function (k) { var x = D.STATS.filter(function (y) { return y.id === k; })[0] || { e: '📊', name: k }; out.push({ text: x.e + ' +' + r.stats[k] + ' ' + x.name, tone: '' }); });
      Object.keys(r.items || {}).forEach(function (k) { if (r.items[k] > 0 && D.ITEMS[k]) out.push({ text: D.ITEMS[k].e + ' ' + D.ITEMS[k].n, tone: '' }); });
      if (r.friend) out.push({ text: '🤝 New friend', tone: 'pink' });
      if (r.partner) out.push({ text: '💘 Love', tone: 'pink' });
      if (r.married) out.push({ text: '💒 Wedding', tone: 'pink' });
      if (r.kid) out.push({ text: '👶 Baby', tone: 'pink' });
      if (r.happy) out.push({ text: '😊 +' + r.happy, tone: '' });
      return {
        id: id, e: c.e, title: M.title, who: c.n + ' · ' + c.role, status: status, reqs: reqs,
        quote: '"' + String(M.intro[0] || '').replace(/^[^:]{2,24}:\s/, '').replace(/\{place\}/g, 'a place nearby').replace(/\{name\}/g, save ? save.name : 'friend') + '"',
        steps: M.steps.map(function (x, i) { return { text: stepLabel(x, save), state: i < cur ? 'done' : i === cur ? 'now' : '' }; }),
        rewards: out, canTrack: status === 'active' && !!save && save.track !== id
      };
    },
    album: function (s) {
      var G = window.CFTGame, D = window.CFT_DATA, st = (s && s.stickers) || {};
      var have = Object.keys(st).filter(function (k) { return st[k] > 0; }).length, total = G.STICKERS.length;
      return {
        lead: have + ' of ' + total + ' stickers. Find sticker packs 🎴 on the street, buy them at bookshops and gift shops, or chat with strangers. Each full set gives a bonus forever.',
        pct: pct(have, total),
        sets: D.STICKER_SETS.map(function (set) {
          var done = set.items.every(function (x) { return st[x[0]] > 0; });
          return {
            title: set.n + (set.rare ? ' ✨' : ''), bonus: (done ? '✅ ' : '🎁 ') + set.bonusText, done: done,
            stickers: set.items.map(function (x, i) { var n = st[x[0]] || 0; return { e: n > 0 ? x[1] : '?', got: n > 0, count: n > 1 ? '×' + n : '', name: x[2], odd: i % 2 === 1 }; })
          };
        }),
        photos: CFT.photos().map(function (p) { return { url: p.url, caption: p.caption || '', meta: 'Day ' + p.day + (p.street ? ' · ' + p.street : '') }; })
      };
    }
  };
})();
