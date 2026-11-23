// "Start over" wipes the life everywhere (cft-kit.js CFT.reset + mountGame onReset). Node, no browser:
//   node tools/testing/reset_test.js   -> PASS/FAIL lines, exit 1 on a failure. Run by tools/check.py.
// The fake game's destroy() makes the same last "exit" save the real one does (cft-game.js destroy), which used to
// write the old life straight back after the wipe (2026-11-23 bug).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

function world(signedIn) {
  const store = new Map();
  const server = { save: null, calls: [] };
  const localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const scripts = [];
  const document = { querySelectorAll: () => [], createElement: () => ({}), head: { appendChild: s => { scripts.push(s); setTimeout(s.onload, 0); } },
    addEventListener() {}, removeEventListener() {}, hidden: false };
  const win = { localStorage, document, setTimeout, clearTimeout, console, alert: m => { win.alerted = m; } };
  win.window = win;
  win.CFT_HOST = { call(fn, args) {
    server.calls.push(fn); const a = JSON.parse(args);
    if (fn === 'get_save') return JSON.stringify({ result: { save: server.save } });
    if (fn === 'put_save') { server.save = a[0]; return JSON.stringify({ result: {} }); }
    if (fn === 'reset_save') { server.save = null; return JSON.stringify({ result: {} }); }
    if (fn === 'get_balance') return JSON.stringify({ result: { values: {} } });
    return JSON.stringify({ result: null });
  } };
  win.CFTGame = { migrate: s => s, mount(root, opts) {
    const save = opts.save || { money: 50, xp: 0, home: {}, updated: Date.now() };
    win.lastOpts = opts;
    return { G: { saveNow: r => opts.onSave(save, r) }, destroy() { save.updated = Date.now() + 5000; opts.onSave(save, 'exit'); } };
  } };
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../theme/assets/cft-kit.js'), 'utf8'), win);
  win.CFT.me = signedIn ? { id: 'u1' } : null;
  return { win, store, server };
}
const tick = () => new Promise(r => setTimeout(r, 20));

(async () => {
  for (const signedIn of [true, false]) {
    const who = signedIn ? 'signed in' : 'guest';
    const { win, store, server } = world(signedIn);
    const id = signedIn ? 'u1' : 'guest';
    const rich = { money: 999999, xp: 50000, home: { label: 'Old' }, m: { boss1: { s: 'done' } }, updated: Date.now() };
    store.set('cityfuntime.save.' + id, JSON.stringify(rich));
    if (signedIn) { server.save = rich; store.set('cityfuntime.save.guest', JSON.stringify(rich)); }
    store.set('cityfuntime.photos.' + id, '[{"url":"x"}]');
    store.set('cityfuntime.dexpics.' + id, '{"slime":"x"}');
    let reloaded = 0;
    const ctl = win.CFT.mountGame({ innerHTML: '' }, { exit() {}, reload() { reloaded++; } });
    await ctl.ready;
    ok(win.lastOpts.save && win.lastOpts.save.money === 999999, who + ': the old life loads first');
    win.lastOpts.onReset();
    for (let i = 0; i < 5; i++) await tick();
    ok(reloaded === 1, who + ': the page reloads once');
    ok(!store.has('cityfuntime.save.' + id), who + ': this device forgot the life (the exit save did not write it back)');
    ok(!store.has('cityfuntime.save.guest'), who + ': no guest life left to be offered back');
    ok(!store.has('cityfuntime.photos.' + id) && !store.has('cityfuntime.dexpics.' + id), who + ': photos and creature pictures gone');
    if (signedIn) ok(server.save === null, who + ': the server copy is gone and stays gone');
    ok(!win.CFT.wiping, who + ': saving is back on for the new life');
    const save = await win.CFT.loadSave();
    ok(save === null && !win.CFT.adopt, who + ': the next load starts a brand-new life');
  }
  console.log(fails ? fails + ' FAILED' : 'ALL RESET TESTS PASSED');
  process.exit(fails ? 1 : 0);
})();
