/* Smoke test (tools/ui_test.py runs it at desktop and phone width): opens every page address signed out, then as a
   new member, then as the admin (the ADMIN_EMAILS address becomes admin on the local App Server). Fails on an empty
   page, sideways scrolling or a missing piece; ui_test.py also fails on any JS/Python exception in the log.
   The game page (#play) only has to mount the engine with every file (the 3D game itself is played by tools/live/game_test.py). */
(async function () {
  const log = [], bad = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 30000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const vw = () => (screen.width < 500 ? screen.width : window.innerWidth);  // phone emulation: innerWidth grows with a too-wide page
  async function check(hash, ready, what) {
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    await until(() => window.UI_READY && location.hash === hash, hash, 45000);
    try { await until(ready, hash + ': ' + what, 20000); } catch (e) { bad.push(e.message); log.push('FAIL ' + hash + ' ' + what); return; }
    await sleep(400);
    const w = document.documentElement.scrollWidth;
    if (w > vw() + 1) bad.push(hash + ' scrolls sideways (' + w + ' > ' + vw() + ')');
    log.push('ok   ' + hash + ' ' + what);
  }
  const text = (s) => ($(s) || {}).innerText || '';
  const main = () => text('.ui-main').trim().length > 80;
  try {
    // ---- signed out
    await check('#landing', () => main() && $('.lp-hero a[href="#auth/signup"]') && $('.ytf-cover'), 'hero + Watch section');
    await check('#quests', () => $$('.qs-m').length > 50, 'every mission listed');
    await check('#quests/locked', () => $$('.qs-m.locked').length > 10 && !$$('.qs-m.done').length, 'filter');
    $$('.qs-m')[0].click();
    await until(() => $('.qs-dlg') && text('.qs-dlg').length > 20, 'mission dialog');
    $$('.qs-dlg button').find((b) => /Close/.test(b.textContent)).click();
    await until(() => !$('.qs-dlg'), 'dialog closed');
    log.push('ok   mission dialog opens and closes');
    await check('#album', () => $$('.al-set').length >= 12 && $$('.al-st').length >= 72, 'sticker sets');
    await check('#ranks', () => main() && $$('.rk-tabs button').length === 4, 'leaderboard');
    await check('#ranks/level', () => $('.anvil-role-on'), 'level board');
    await check('#auth/signup', () => $$('.au-card input').length >= 3, 'sign-up form');
    await check('#play', () => $('.cft-root') && ($('.cft') || $('.cft-loading') || $('.cft-fail')), 'game mounts');
    await sleep(2500);
    log.push(($('.cft') ? 'ok   ' : 'note ') + '#play engine: ' + ($('.cft') ? 'game UI drawn' : $('.cft-fail') ? 'load failed: ' + text('.cft-fail') : 'still loading'));
    if ($('.cft-fail')) bad.push('#play: ' + text('.cft-fail'));
    if ($('.cft') && !($('[data-bonk]') && window.CFTFun && window.CFT_DATA.MONSTERS)) bad.push('#play: the street-life module (cft-fun.js) or its bonk button is missing');
    else if ($('.cft')) log.push('ok   #play street life loaded (cft-fun.js, the bonk button)');
    await check('#landing', () => main(), 'back from the game');

    // ---- a new member
    location.hash = '#auth/signup';
    await until(() => window.UI_READY && $$('.au-card input').length >= 3, 'sign-up form');
    const inputs = $$('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]');
    type(inputs[0], 'Smoke Tester'); type(inputs[1], 'smoke' + Date.now() + '@example.com'); type(inputs[2], 'Hb-' + Math.random().toString(36).slice(2) + '-Kq7');
    const tick = $('.au-card input[type=checkbox]'); if (tick && !tick.checked) tick.click();
    $$('.anvil-role-btn-block button').find((b) => /Create account/.test(b.textContent)).click();
    await until(() => location.hash === '#life' && window.UI_READY, 'signed in', 40000);
    await check('#life', () => main() && ($('.lf-hero') || $('.lf-welcome')) && (($('.lf-welcome') || {}).offsetParent || ($('.lf-hero') || {}).offsetParent), 'life (welcome or scrapbook)');
    await check('#quests', () => $$('.qs-m').length > 50, 'quests');
    await check('#album', () => $$('.al-set').length >= 12, 'album');
    await check('#ranks', () => main(), 'ranks');
    await check('#profile', () => main() && $('.pf-head'), 'profile');
    await check('#play', () => $('.cft-root'), 'game mounts (member)');
    await sleep(2000);
    await check('#life', () => main(), 'back to life');

    // ---- sign out, then the admin
    $('.anvil-role-avatar button').click();
    await sleep(300);
    $$('.ui-menu button').find((b) => /Sign out/.test(b.textContent)).click();
    await until(() => location.hash === '#landing' && window.UI_READY && !$('.ui-shell.signed-in'), 'signed out', 20000);
    await sleep(800);
    await check('#auth', () => $$('.au-card input').length >= 2, 'sign-in form');
    const vis = () => $$('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]').filter((i) => i.offsetParent);
    const pw = 'Hb-local-admin-Kq7-2026';
    type(vis()[0], 'arkulinskis@gmail.com'); type(vis()[1], pw);
    $$('.anvil-role-btn-block button').find((b) => /Sign in/.test(b.textContent)).click();
    await sleep(3500);
    if (location.hash !== '#life') {  // no admin account in this local database yet: create it
      $$('.ui-seg button').find((b) => /Create account/.test(b.textContent)).click();
      await sleep(500);
      const i = vis(); type(i[0], 'Local Admin'); type(i[1], 'arkulinskis@gmail.com'); type(i[2], pw);
      const t2 = $('.au-card input[type=checkbox]'); if (t2 && !t2.checked) t2.click();
      $$('.anvil-role-btn-block button').find((b) => /Create account/.test(b.textContent)).click();
    }
    await until(() => location.hash === '#life' && window.UI_READY, 'signed in as admin', 40000);
    await check('#admin/overview', () => $$('.ad-stat').length >= 4 && /\d/.test(text('.ad-stats')), 'admin overview');
    await check('#admin/players', () => $$('.ad-player-row').length >= 1, 'admin players (demo saves)');
    await check('#admin/maps', () => /tiles kept/.test(text('.ad-maps')), 'admin map backup');
    await check('#admin/feedback', () => main(), 'admin feedback');
    await check('#admin/users', () => $$('.ad-user-row').length >= 1, 'admin users');
    await check('#admin/demo', () => /Status/.test(text('.ad-demo')), 'admin demo data');
    await check('#ranks', () => $$('.rk-row').length >= 1, 'ranks with demo players');
    log.push(bad.length ? 'PROBLEMS: ' + bad.join(' | ') : 'PASSED');
    return { ok: !bad.length, log: log };
  } catch (e) {
    log.push(String(e && e.message || e));
    if (bad.length) log.push('PROBLEMS: ' + bad.join(' | '));
    return { ok: false, log: log };
  }
})();
