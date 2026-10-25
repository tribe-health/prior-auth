/* ASO patient chat · DOM helpers, icons, formatting, menu.
   One outline icon family: 20px grid, 1.5px stroke, round caps. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var NS = 'http://www.w3.org/2000/svg';

  var ICONS = {
    plus: '<path d="M10 4v12M4 10h12"/>',
    search: '<circle cx="9" cy="9" r="5.5"/><path d="M13.2 13.2 17 17"/>',
    edit: '<path d="M4 16h3l8.5-8.5a2.1 2.1 0 0 0-3-3L4 13v3z"/><path d="M11.5 5.5l3 3"/>',
    panel: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M8 4v12"/>',
    queue: '<path d="M4 6h12M4 10h12M4 14h8"/>',
    chevDown: '<path d="M5 8l5 5 5-5"/>',
    chevRight: '<path d="M8 5l5 5-5 5"/>',
    mic: '<rect x="7.5" y="3" width="5" height="9" rx="2.5"/><path d="M4.5 10a5.5 5.5 0 0 0 11 0M10 15.5V18"/>',
    up: '<path d="M10 16V4M5 9l5-5 5 5"/>',
    stop: '<rect x="5.5" y="5.5" width="9" height="9" rx="1.5" fill="currentColor"/>',
    x: '<path d="M5 5l10 10M15 5L5 15"/>',
    doc: '<path d="M6 3h6l3 3v11H6z"/><path d="M12 3v3h3M8.5 10h4M8.5 13h4"/>',
    clock: '<circle cx="10" cy="10" r="6.5"/><path d="M10 6.5V10l2.5 1.5"/>',
    check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
    sun: '<circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
    moon: '<path d="M16 11.5A6.5 6.5 0 1 1 8.5 4a5 5 0 0 0 7.5 7.5z"/>',
    ext: '<path d="M11 4h5v5M16 4l-7 7M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5"/>',
    lock: '<rect x="5" y="9" width="10" height="7.5" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
    user: '<circle cx="10" cy="7" r="3"/><path d="M4 16.5c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5"/>',
    arrowRight: '<path d="M4 10h12M11 5l5 5-5 5"/>',
    arrowLeft: '<path d="M16 10H4M9 5l-5 5 5 5"/>',
    folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H8l2 2h5.5A1.5 1.5 0 0 1 17 8.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z"/>',
    receipt: '<path d="M5 3h10v14l-2.5-1.5L10 17l-2.5-1.5L5 17z"/><path d="M8 7.5h4M8 10.5h4"/>'
  };

  /* state shapes: check-circle, barred diamond, dashed ring */
  var MARKS = {
    met: '<circle cx="7" cy="7" r="5.6"/><path d="M4.3 7.2l1.9 1.9 3.6-3.9"/>',
    gap: '<path d="M7 1.4 12.6 7 7 12.6 1.4 7z"/><path d="M4.8 7h4.4"/>',
    'void': '<circle cx="7" cy="7" r="5.6" stroke-dasharray="2.2 2.2"/>'
  };

  var SWEEP = '<g transform="rotate(-13 256 256) translate(0 18)">' +
    '<path class="u" d="M80 250C172 186 300 154 432 162C306 126 176 148 80 208C64 218 64 240 80 250Z"/>' +
    '<path class="l" d="M80 308C176 266 306 234 432 240C448 250 448 274 432 284C306 278 176 312 80 330C66 324 66 314 80 308Z"/></g>';

  function h(tag, attrs, kids) {
    var el = document.createElement(tag), k, v;
    if (attrs) {
      for (k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, kids);
    return el;
  }

  function append(el, kids) {
    if (kids == null || kids === false) return;
    (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
  }

  /* replace an element's children, skipping empty entries */
  function fill(el, kids) {
    while (el.firstChild) el.removeChild(el.firstChild);
    append(el, kids);
    return el;
  }

  function svg(viewBox, cls, inner) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', viewBox);
    s.setAttribute('class', cls);
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    s.innerHTML = inner;
    return s;
  }

  function icon(name, cls) { return svg('0 0 20 20', 'ico' + (cls ? ' ' + cls : ''), ICONS[name] || ''); }
  function sweep() { return svg('0 0 512 512', 'sweep', SWEEP); }

  function fillIcons(root) {
    (root || document).querySelectorAll('[data-ico]').forEach(function (el) {
      if (!el.querySelector('svg.ico')) el.insertBefore(icon(el.getAttribute('data-ico')), el.firstChild);
    });
  }

  function stateChip(state, label) {
    var key = MARKS[state] ? state : 'void';
    return h('span', { class: 'state state-' + key }, [
      svg('0 0 14 14', 'mark-state', MARKS[key]),
      h('span', { text: label || key.toUpperCase() })
    ]);
  }

  /* Where a case sits in the process: one block per stage of the state
     machine. Stages passed are filled, the current stage is wider and in the
     accent, and the state's name is always written beside the track. */
  function caseState(c) {
    var D = ASO.data;
    var info = D.stageInfo(c);
    var track = h('span', { class: 'stage-track', 'aria-hidden': 'true' }, D.STAGES.map(function (st, i) {
      var cls = i < info.filled ? ' is-done' : (!info.terminal && i === info.index ? ' is-now' : '');
      return h('span', { class: 'stage-pip' + cls });
    }));
    var where = info.terminal ? 'Final state: ' : 'Stage ' + (info.index + 1) + ' of ' + D.STAGES.length + ': ';
    return h('span', { class: 'case-state' }, [
      track,
      h('span', { class: 'sr-only', text: where }),
      h('span', { class: 'stage-label od-nowrap' }, [
        info.terminal ? icon(info.key === 'approved' ? 'check' : 'x') : null,
        info.label
      ])
    ]);
  }

  /* ── dates ──────────────────────────────────────────────────────── */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function parseDate(d) { var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(d) { var x = parseDate(d); return MONTHS[x.getMonth()] + ' ' + x.getDate(); }
  function daysUntil(d) { return Math.round((parseDate(d) - parseDate(ASO.data.today)) / 86400000); }
  function dueLabel(d) {
    var n = daysUntil(d);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n > 1) return 'in ' + n + ' days';
    if (n === -1) return 'yesterday';
    return (-n) + ' days ago';
  }
  function dueText(c) {
    if (!c.due) return c.statusLabel;
    return c.dueKind + ' ' + fmtDate(c.due) + ' · ' + dueLabel(c.due);
  }
  function isSoon(c) { return !!c.due && daysUntil(c.due) <= 1; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clock() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  var seq = 0;
  function uid(prefix) { seq += 1; return (prefix || 'id') + '-' + seq; }

  function announce(text) {
    var live = document.getElementById('live');
    if (live) live.textContent = text;
  }

  /* ── menu: one open at a time, arrow keys, Escape returns focus ─── */
  var open = null;

  function closeMenu(focusBack) {
    if (!open) return;
    var m = open;
    open = null;
    m.el.remove();
    m.btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', m.onDoc, true);
    document.removeEventListener('keydown', m.onKey, true);
    if (focusBack) m.btn.focus();
  }

  function menu(btn, items, opts) {
    if (open && open.btn === btn) { closeMenu(true); return; }
    closeMenu(false);
    opts = opts || {};
    var el = h('div', { class: 'menu ' + (opts.place || 'below-start'), role: 'menu', 'aria-label': opts.label || 'Menu' });
    items.forEach(function (it) {
      if (!it) return;
      if (it.heading) { el.appendChild(h('p', { class: 'menu-head', text: it.heading })); return; }
      if (it.note) { el.appendChild(h('p', { class: 'menu-note', text: it.note })); return; }
      var inner = [
        it.icon ? icon(it.icon, 'od-fixed') : null,
        h('span', { class: 'od-field od-fill' }, [
          h('span', { class: 'menu-label', text: it.label }),
          it.sub ? h('span', { class: 'menu-sub', text: it.sub }) : null
        ])
      ];
      var node = it.href
        ? h('a', { class: 'menu-item od-row', role: 'menuitem', href: it.href, target: it.target, rel: it.target ? 'noopener' : null }, inner)
        : h('button', { class: 'menu-item od-row', role: 'menuitem', type: 'button' }, inner);
      if (it.current) node.setAttribute('aria-current', 'true');
      node.addEventListener('click', function () {
        closeMenu(!it.href);
        if (it.onSelect) it.onSelect();
      });
      el.appendChild(node);
    });
    btn.parentNode.appendChild(el);
    btn.setAttribute('aria-expanded', 'true');
    var m = { el: el, btn: btn };
    m.onDoc = function (e) { if (!el.contains(e.target) && !btn.contains(e.target)) closeMenu(false); };
    m.onKey = function (e) {
      var its = Array.prototype.slice.call(el.querySelectorAll('.menu-item'));
      var i = its.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
      else if (e.key === 'Tab') { closeMenu(false); }
      else if (!its.length) { return; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); (its[i + 1] || its[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (its[i - 1] || its[its.length - 1]).focus(); }
    };
    document.addEventListener('pointerdown', m.onDoc, true);
    document.addEventListener('keydown', m.onKey, true);
    open = m;
    var first = el.querySelector('.menu-item');
    if (first) first.focus();
  }

  ASO.h = h;
  ASO.fill = fill;
  ASO.icon = icon;
  ASO.sweep = sweep;
  ASO.fillIcons = fillIcons;
  ASO.stateChip = stateChip;
  ASO.caseState = caseState;
  ASO.fmtDate = fmtDate;
  ASO.daysUntil = daysUntil;
  ASO.dueLabel = dueLabel;
  ASO.dueText = dueText;
  ASO.isSoon = isSoon;
  ASO.clock = clock;
  ASO.uid = uid;
  ASO.announce = announce;
  ASO.menu = menu;
  ASO.closeMenu = closeMenu;
})(window);
