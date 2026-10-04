// My character and Combat, lifted from source/player-guide/index.html.
// Two changes from the source, both required by the brief: the character comes from
// and saves to the database (debounced) instead of localStorage and window.claude,
// and the divine and race trait texts are passed in from the database instead of
// being written in this file.

import { ABS, SKILLS, CATS, esc, num, sgn, normalize, readCode, mergeImport } from './character';

function core(root, opts) {
  const $ = (s) => root.querySelector(s);
  const S = { C: normalize(opts.character) };
  const mod = (k) => Math.floor((num(S.C.ab[k]) - 10) / 2);
  const pb = () => 2 + Math.floor((Math.max(1, Math.min(20, num(S.C.level) || 1)) - 1) / 4);

  /* saving: straight to the database, shortly after the last change */
  let saveT = null, busy = false, dirty = false;
  const setState = (t) => { const el = root.querySelector('#saveState') || document.getElementById('saveState'); if (el) el.textContent = t; };
  async function push() {
    if (busy) { dirty = true; return; }
    busy = true;
    try { await opts.save(S.C); setState('Saved.'); } catch (e) { setState('Not saved. Check your connection; your changes are still on this page.'); }
    busy = false;
    if (dirty) { dirty = false; push(); }
  }
  function save() { S.C.t = Date.now(); setState('Saving…'); clearTimeout(saveT); saveT = setTimeout(push, 800); }
  const flush = () => { if (saveT) { clearTimeout(saveT); saveT = null; push(); } };
  return { $, S, mod, pb, save, flush, setState };
}

export function mountSheet(root, opts) {
  const { $, S, mod, pb, save, flush } = core(root, opts);
  const RACES = opts.races || [];
  const DIVINE = opts.divine || {};
  const gp = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
  function sp(o, k, v) { const ps = k.split('.'); const l = ps.pop(); const t = ps.reduce((a, p) => (a[p] = a[p] || {}), o); t[l] = v; }

  $('#raceSel').innerHTML = '<option value="">Choose a race</option>' + RACES.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
  $('#abil').innerHTML = ABS.map(([k, n]) => `<div class="ab"><label class="f">${n}<input type="number" min="1" max="30" data-k="ab.${k}"></label><div class="abm"><b id="m-${k}"></b>modifier</div><label class="ck"><input type="checkbox" data-k="sv.${k}"> Trained save <b id="s-${k}"></b></label></div>`).join('');
  $('#skills').innerHTML = SKILLS.map(([n, a], i) => `<label class="sk"><select data-k="sk.${n}"><option value="0">Untrained</option><option value="1">Proficient</option><option value="2">Expertise</option></select><span>${n} <small>${a}</small></span><b id="k-${i}"></b></label>`).join('');

  function fillForm() {
    root.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k, v = gp(S.C, k);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? (k.indexOf('sk.') === 0 ? '0' : '') : v;
    });
  }
  function derived() {
    ABS.forEach(([k]) => { $('#m-' + k).textContent = sgn(mod(k)); $('#s-' + k).textContent = sgn(mod(k) + (S.C.sv[k] ? pb() : 0)); });
    SKILLS.forEach(([n, a], i) => { $('#k-' + i).textContent = sgn(mod(a) + pb() * num(S.C.sk[n])); });
    $('#pbv').textContent = sgn(pb()); $('#inv').textContent = sgn(mod('dex')); $('#ppv').textContent = 10 + mod('wis') + pb() * num(S.C.sk['Perception']);
  }

  function onField(e) {
    const el = e.target, k = el.dataset && el.dataset.k; if (!k) return;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    if (k.indexOf('sk.') === 0) v = Number(v);
    const oldMax = num(S.C.hpMax);
    sp(S.C, k, v); if (k === 'hpMax' && (num(S.C.hp) === oldMax || num(S.C.hp) > num(S.C.hpMax))) S.C.hp = num(S.C.hpMax);
    derived(); save();
  }
  root.addEventListener('input', onField);
  root.addEventListener('change', onField);

  /* attacks, abilities, spells */
  let editId = null;
  function clearOptForm() { editId = null; $('#o-name').value = ''; $('#o-roll').value = ''; $('#o-max').value = '0'; $('#o-desc').value = ''; $('#oSave').textContent = 'Add to my list'; $('#oCancel').hidden = true; }
  function renderOpts() {
    if (!S.C.options.length) { $('#oList').innerHTML = '<p class="who">Nothing here yet. Add your first attack, ability, or spell above.</p>'; return; }
    $('#oList').innerHTML = CATS.map(([c, label]) => {
      const xs = S.C.options.filter((o) => o.cat === c); if (!xs.length) return '';
      return `<h4>${label}</h4>` + xs.map((o) => `<div class="orow"><span><b>${esc(o.name)}</b> <small>${esc(o.cost)}${o.max ? ', ' + o.max + ' uses' : ''}</small></span><span><button class="act sm" data-edit="${esc(o.id)}">Edit</button> <button class="act sm" data-del="${esc(o.id)}">Remove</button></span></div>`).join('');
    }).join('');
  }
  $('#oSave').addEventListener('click', () => {
    const name = $('#o-name').value.trim(); if (!name) { $('#o-name').focus(); return; }
    const o = { id: editId || ('o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), cat: $('#o-cat').value, name: name, cost: $('#o-cost').value, roll: $('#o-roll').value.trim(), max: Math.max(0, Math.min(12, num($('#o-max').value))), used: 0, desc: $('#o-desc').value.trim() };
    const i = S.C.options.findIndex((x) => x.id === editId);
    if (i >= 0) { o.used = Math.min(S.C.options[i].used || 0, o.max); S.C.options[i] = o; } else S.C.options.push(o);
    clearOptForm(); renderOpts(); save();
  });
  $('#oCancel').addEventListener('click', clearOptForm);
  $('#oList').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) { const o = S.C.options.find((x) => x.id === ed.dataset.edit); if (!o) return; editId = o.id; $('#o-cat').value = o.cat; $('#o-name').value = o.name; $('#o-cost').value = o.cost; $('#o-roll').value = o.roll || ''; $('#o-max').value = o.max || 0; $('#o-desc').value = o.desc || ''; $('#oSave').textContent = 'Save changes'; $('#oCancel').hidden = false; $('#o-name').focus(); }
    if (del) { S.C.options = S.C.options.filter((x) => x.id !== del.dataset.del); if (editId === del.dataset.del) clearOptForm(); renderOpts(); save(); }
  });
  function addOpts(list) { let n = 0; list.forEach((x) => { if (S.C.options.some((o) => o.name === x.name)) return; S.C.options.push(Object.assign({ id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cat: 'Ability', cost: 'Passive', roll: '', max: 0, used: 0, desc: '' }, x)); n++; }); renderOpts(); if (n) save(); return n; }
  $('#addRace').addEventListener('click', () => {
    const r = RACES.find((x) => x.id === S.C.race); if (!r) { $('#raceSel').focus(); return; }
    const list = r.traits.map((t) => ({ name: t[0], desc: t[1] })); if (num(S.C.level) >= 7) list.push({ name: r.name + ' level 7 upgrade', desc: r.up }); addOpts(list);
  });
  // only on the page when the campaign's phase allows it
  const extra = $('#addDivine');
  if (extra) extra.addEventListener('click', () => {
    const list = (DIVINE.all || []).concat(DIVINE[S.C[opts.divineBy]] || []).map((x) => Object.assign({}, x));
    addOpts(list);
  });

  /* the old character codes still work */
  const impBtn = document.getElementById('impBtn');
  if (impBtn) impBtn.addEventListener('click', () => {
    const msg = document.getElementById('impMsg'), box = document.getElementById('impCode'); let o;
    try { o = readCode(box.value); } catch (e) { msg.textContent = 'That is not a character code. It should start with TBG1: and be copied whole.'; return; }
    S.C = mergeImport(S.C, o, opts.privateKeys);
    clearOptForm(); fillForm(); derived(); renderOpts(); save(); box.value = '';
    msg.textContent = 'Imported ' + (S.C.name || 'your character') + '. The Combat page is filled in too.';
  });

  fillForm(); derived(); renderOpts();
  window.addEventListener('pagehide', flush);
  return () => { flush(); window.removeEventListener('pagehide', flush); };
}

export function mountCombat(root, opts) {
  const { $, S, save, flush } = core(root, opts);
  const RACES = opts.races || [];
  let cFilter = 'All';
  function renderCombat() {
    const C = S.C;
    const r = RACES.find((x) => x.id === C.race);
    const who = [num(C.level) ? ('Level ' + num(C.level)) : '', r ? r.name : '', C.cls].filter(Boolean).join(' ');
    const pills = (label, n) => Array.from({ length: Math.max(0, Math.min(4, n)) }, (_, i) => `<button class="pill" aria-pressed="false">${label}${n > 1 ? ' ' + (i + 1) : ''}</button>`).join('');
    const line = (label, v) => `<div class="cardline"><small>${label}</small>${v ? esc(v) : '<span class="who">Not set yet</span>'}</div>`;
    $('#cLeft').innerHTML = `<div class="plate">
    <h3>${C.name ? esc(C.name) : 'Unnamed character'}</h3><p class="who">${esc(who)}</p>
    <div class="stats"><div class="stat"><b>${num(C.ac)}</b>Armor class</div><div class="stat"><b><span id="hpNow">${num(C.hp)}</span><small>/${num(C.hpMax)}</small></b>Hit points</div><div class="stat"><b class="sm">${esc(C.speed)}</b>Speed</div></div>
    <div class="hpc"><input id="hpAmt" type="number" min="0" inputmode="numeric" aria-label="Amount of damage or healing" placeholder="Amount"><button class="act" data-hp="dmg">Take damage</button><button class="act" data-hp="heal">Heal</button></div>
    <p class="kv">Temporary hit points <b id="tempNow">${num(C.temp)}</b> <button class="act sm" data-hp="temp">Set from amount</button></p>
    <h4>This turn</h4>
    <div class="pills">${pills('Action', num(C.acts) || 1)}${pills('Bonus action', num(C.bonus))}${pills('Reaction', num(C.react))}</div>
    <p class="kv">Attacks per action <b>${num(C.atk) || 1}</b></p>
    <p><button class="act" id="newTurn">Start a new turn</button></p>
    <h4>Combat card</h4>
    ${line('Go-to attack', C.card.go)}${line('Signature move', C.card.sig)}${line('Emergency button', C.card.emg)}
    <p style="margin-top:14px"><button class="act" id="longRest">Finish a long rest</button></p>
    <p class="who" id="saveState" style="margin:8px 0 0"></p>
  </div>`;
    let h = `<div class="chips" style="margin-top:0">${['All', 'Action', 'Bonus action', 'Reaction'].map((x) => `<button class="fchip" data-f="${x}" aria-pressed="${x === cFilter}">${x === 'All' ? 'Everything' : x + 's'}</button>`).join('')}</div>`;
    if (!C.options.length) h += `<div class="plate"><p>Your attacks, abilities, and spells will appear here in one list.</p><p><a class="act" href="${esc(opts.sheetHref)}">Add them on My character</a></p></div>`;
    else {
      const list = C.options.filter((o) => cFilter === 'All' || o.cost === cFilter); let any = false;
      CATS.forEach(([c, label]) => {
        const xs = list.filter((o) => o.cat === c); if (!xs.length) return; any = true;
        h += `<h3 class="cat">${label}</h3>` + xs.map((o) => `<div class="opt"><div class="oh"><b>${esc(o.name)}</b><span class="badge">${esc(o.cost)}</span></div>${o.roll ? `<div class="roll">${esc(o.roll)}</div>` : ''}${o.max ? `<div class="uses" data-o="${esc(o.id)}">Uses ${Array.from({ length: o.max }, (_, i) => `<input type="checkbox" aria-label="Use ${i + 1} spent" ${i < (o.used || 0) ? 'checked' : ''}>`).join('')}</div>` : ''}${o.desc ? `<p>${esc(o.desc)}</p>` : ''}</div>`).join('');
      });
      if (!any) h += '<p class="who">Nothing on your list uses that kind of action.</p>';
    }
    $('#cRight').innerHTML = h;
  }
  $('#cLeft').addEventListener('click', (e) => {
    const C = S.C;
    const pill = e.target.closest('.pill'); if (pill) { pill.setAttribute('aria-pressed', pill.getAttribute('aria-pressed') !== 'true'); return; }
    if (e.target.closest('#newTurn')) { root.querySelectorAll('#cLeft .pill').forEach((p) => p.setAttribute('aria-pressed', 'false')); return; }
    if (e.target.closest('#longRest')) { C.hp = num(C.hpMax); C.temp = 0; C.options.forEach((o) => (o.used = 0)); save(); renderCombat(); return; }
    const hb = e.target.closest('[data-hp]'); if (hb) {
      const inp = $('#hpAmt'); let a = Math.max(0, num(inp.value)); const kind = hb.dataset.hp;
      if (kind === 'temp') { C.temp = a; }
      else if (!a) { inp.focus(); return; }
      else if (kind === 'dmg') { const t = Math.min(num(C.temp), a); C.temp = num(C.temp) - t; a -= t; C.hp = Math.max(0, num(C.hp) - a); }
      else { C.hp = Math.min(num(C.hpMax), num(C.hp) + a); }
      $('#hpNow').textContent = num(C.hp); $('#tempNow').textContent = num(C.temp); inp.value = ''; save();
    }
  });
  $('#cRight').addEventListener('click', (e) => { const f = e.target.closest('[data-f]'); if (f) { cFilter = f.dataset.f; renderCombat(); } });
  $('#cRight').addEventListener('change', (e) => { const u = e.target.closest('.uses'); if (!u) return; const o = S.C.options.find((x) => x.id === u.dataset.o); if (!o) return; o.used = u.querySelectorAll('input:checked').length; save(); });

  renderCombat();
  window.addEventListener('pagehide', flush);
  return () => { flush(); window.removeEventListener('pagehide', flush); };
}
