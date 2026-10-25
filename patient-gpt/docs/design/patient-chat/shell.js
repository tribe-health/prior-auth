/* ASO patient chat · app shell: routes, top bar context, pages, panels, theme.
   Routes (kept in memory; the URL hash mirrors them when it can):
     /              nothing selected: chat box and "Due next", all patients in scope
     /p/<patient>   new chat in the context of the whole patient
     /c/<case>      new chat in the context of one case
     /chat/<id>     an opened conversation; its own scope drives the chrome
   A trailing /files opens the Files and evidence panel; /menu opens the
   sidebar drawer on a phone. Navigation never depends on the hash or on a
   link's default behavior, so it works inside sandboxed previews too. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var h = ASO.h;
  var D = ASO.data;

  var app, main, view, scrim, prompt, filesBtn, filesScrim;
  var path = '/';
  var route = { name: 'home', id: '', extra: '' };
  var expanded = {};
  var lastScopeKey = '';
  var first = true;
  var filesOpen = false;
  var wide = g.matchMedia('(min-width: 768px)');
  var canMirror = location.protocol !== 'about:';

  function parse(p) {
    var parts = String(p).replace(/^\/+/, '').split('/');
    var id = decodeURIComponent(parts[1] || '');
    var extra = parts[2] || '';
    var conv = parts[0] === 'chat' ? ASO.convos.get(id) : null;
    if (conv && !conv.draft) return { name: 'chat', id: id, extra: extra };
    if (parts[0] === 'c' && D.cases[id]) return { name: 'case', id: id, extra: extra };
    if (parts[0] === 'p' && D.patient(id)) return { name: 'patient', id: id, extra: extra };
    return { name: 'home', id: '', extra: '' };
  }

  /* the scope in effect: from the route, or from the opened conversation */
  function scope() {
    if (route.name === 'chat') {
      var cv = ASO.convos.get(route.id);
      return { kind: cv.scope.kind, patientId: cv.scope.patientId, caseId: cv.scope.caseId, convId: cv.id };
    }
    if (route.name === 'case') return { kind: 'case', patientId: D.cases[route.id].patientId, caseId: route.id, convId: null };
    if (route.name === 'patient') return { kind: 'patient', patientId: route.id, caseId: null, convId: null };
    return { kind: 'global', patientId: null, caseId: null, convId: null };
  }

  function mirror() {
    var seg = route.name === 'chat' ? 'chat' : route.name === 'case' ? 'c' : 'p';
    var base = route.name === 'home' ? '/' : '/' + seg + '/' + encodeURIComponent(route.id);
    path = base + (filesOpen && scope().kind !== 'global' ? '/files' : '');
    if (!canMirror) return;
    try { if (location.hash !== '#' + path) location.hash = path; } catch (err) { canMirror = false; }
  }

  function go(hash) {
    path = String(hash).replace(/^#/, '') || '/';
    render();
  }

  /* ── views ──────────────────────────────────────────────────────── */
  function queueList(cases) {
    return h('ul', { class: 'queue' }, cases.map(function (c) {
      return h('li', null, h('a', { class: 'q-row', href: '#/c/' + c.id }, [
        h('span', { class: 'od-field' }, [
          h('span', { class: 'q-name', text: D.patientOf(c).name }),
          h('span', { class: 'q-title', text: c.title }),
          ASO.caseState(c)
        ]),
        h('span', { class: 'od-field' }, [
          h('span', { class: 'q-due od-nowrap' + (ASO.isSoon(c) ? ' soon' : ''), text: ASO.dueText(c) }),
          h('span', { class: 'q-next', text: 'Next: ' + D.nextOf(c) })
        ])
      ]));
    }));
  }

  function homeView() {
    return h('div', { class: 'home' }, [
      h('h1', { class: 'greeting', text: 'Which case first, Dr. James?' }),
      h('div', { 'data-composer-slot': '' }),
      h('section', { class: 'due', 'aria-labelledby': 'due-h' }, [
        h('h2', { class: 'sec-h', id: 'due-h', text: 'Due next' }),
        queueList(D.openCases())
      ])
    ]);
  }

  function docRow(id) {
    var d = D.docs[id];
    var page = Number(Object.keys(d.text)[0]);
    return h('li', { class: 'doc-row' }, [
      h('span', null, h('button', {
        class: 'cite', type: 'button', 'aria-label': 'Open ' + id,
        onclick: function () { ASO.host.openSource(id, page); }
      }, id)),
      h('span', { class: 'od-field' }, [
        h('span', { class: 'doc-title', text: d.title }),
        h('span', { class: 'doc-sub', text: d.date + ' · ' + d.pages + (d.pages === 1 ? ' page' : ' pages') + (d.caseId ? ' · first used by ' + d.caseId : '') }),
        d.unfiled ? h('span', null, h('span', { class: 'tag', text: 'Unfiled · ' + d.received })) : null
      ])
    ]);
  }

  function facts(list) {
    return h('p', { class: 'page-facts' }, list.filter(Boolean).map(function (f) { return h('span', { class: 'od-nowrap', text: f }); }));
  }

  function patientView(p) {
    var docIds = p.inbox.concat(D.filedDocs(p.id));
    return h('div', { class: 'page' }, [
      h('header', { class: 'page-head' }, [
        h('h1', { class: 'page-title', text: p.name }),
        facts(['DOB ' + p.dob, 'MRN ' + p.mrn, p.payer, 'Member ' + p.member])
      ]),
      h('div', { 'data-composer-slot': '' }),
      h('section', { class: 'page-sec', 'aria-labelledby': 'cases-h' }, [
        h('h2', { class: 'sec-h', id: 'cases-h', text: 'Cases' }),
        h('ul', { class: 'rows' }, p.cases.map(function (id) {
          var c = D.cases[id];
          return h('li', null, h('a', { class: 'row', href: '#/c/' + id }, [
            h('span', { class: 'od-field' }, [
              h('span', { class: 'row-title', text: c.title }),
              h('span', { class: 'row-sub', text: id }),
              ASO.caseState(c)
            ]),
            h('span', { class: 'row-side od-nowrap', text: c.due ? c.dueKind + ' ' + ASO.fmtDate(c.due) : D.statusLabelOf(c) })
          ]));
        }))
      ]),
      h('section', { class: 'page-sec', 'aria-labelledby': 'chart-h' }, [
        h('h2', { class: 'sec-h', id: 'chart-h', text: 'Chart' }),
        h('p', { class: 'sec-note', text: docIds.length
          ? 'Documents belong to the patient, not to one case. Any case for ' + p.first + ' can cite them.'
          : 'No chart documents are on file for ' + p.first + ' yet.' }),
        docIds.length ? h('ul', { class: 'rows' }, docIds.map(docRow)) : null
      ])
    ]);
  }

  function caseView(c) {
    var p = D.patientOf(c);
    return h('div', { class: 'page' }, [
      h('header', { class: 'page-head' }, [
        h('h1', { class: 'page-title', text: c.title }),
        facts([c.id, p.name, c.payer, c.policy])
      ]),
      h('div', { 'data-composer-slot': '' }),
      h('section', { class: 'page-sec', 'aria-labelledby': 'next-h' }, [
        h('h2', { class: 'sec-h', id: 'next-h', text: 'Next move' }),
        h('p', { class: 'case-next', text: ASO.runs.sentence(D.nextOf(c)) }),
        h('p', { class: 'sec-note', text: 'A new chat here stays inside this case. Earlier conversations on it are under Case history in the sidebar, and its files are behind the Files control above.' })
      ])
    ]);
  }

  function threadView(t, label) {
    return h('div', { class: 'thread-wrap' }, [h('h1', { class: 'sr-only', text: label }), t.el]);
  }

  /* ── chrome ─────────────────────────────────────────────────────── */
  function toggle(patientId, subId) {
    expanded[patientId] = !expanded[patientId];
    ASO.nav.render(scope(), expanded, toggle, subId);
  }

  function renderCtx(s) {
    var box = document.getElementById('ctx');
    var p = s.patientId ? D.patient(s.patientId) : null;
    var btn = h('button', {
      class: 'ctx-btn od-row', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
      'aria-label': 'Context: ' + (p ? p.name + (s.caseId ? ', case ' + s.caseId : ', whole chart') : 'all patients') + '. Change context'
    }, [
      h('span', { class: 'od-truncate', text: p ? p.name : 'All patients' }),
      s.caseId ? h('span', { class: 'ctx-id od-fixed od-nowrap', text: s.caseId }) : null,
      ASO.icon('chevDown', 'od-fixed')
    ]);
    btn.addEventListener('click', function () {
      var items;
      if (!p) {
        items = [{ heading: 'Set context' }].concat(D.patients.map(function (x) {
          return { icon: 'user', label: x.name, sub: x.payer, onSelect: function () { go('#/p/' + x.id); } };
        }));
      } else {
        items = [{ heading: p.name }, { icon: 'user', label: 'Whole patient', sub: 'Chart and every case', current: s.kind === 'patient', onSelect: function () { go('#/p/' + p.id); } }]
          .concat(p.cases.map(function (id) {
            var k = D.cases[id];
            return { icon: 'doc', label: k.title, sub: id + ' · ' + D.stageInfo(k).label, current: id === s.caseId, onSelect: function () { go('#/c/' + id); } };
          }))
          .concat([{ icon: 'queue', label: 'All patients', sub: 'Clear the context', onSelect: function () { go('#/'); } }]);
      }
      ASO.menu(btn, items, { place: 'below-start', label: 'Context' });
    });
    ASO.fill(box, btn);
  }

  /* case: state, tally, deadline and next action stay in view. patient: what the chart holds. */
  function renderStrip(s) {
    var el = document.getElementById('strip');
    if (s.kind === 'global') { el.hidden = true; return; }
    if (s.kind === 'patient') {
      var p = D.patient(s.patientId);
      var n = D.filedDocs(p.id).length;
      ASO.fill(el, [
        h('span', { class: 'strip-fact od-nowrap', text: p.cases.length + (p.cases.length === 1 ? ' case' : ' cases') }),
        h('span', { class: 'strip-fact od-nowrap', text: n + (n === 1 ? ' chart document' : ' chart documents') }),
        p.inbox.length ? h('span', { class: 'tag od-nowrap', text: p.inbox.length + ' unfiled' }) : null,
        h('span', { class: 'strip-next', text: p.payer })
      ]);
      el.hidden = false;
      return;
    }
    var c = D.cases[s.caseId];
    var t = D.tally(c);
    ASO.fill(el, [
      ASO.caseState(c),
      c.order.length ? h('span', { class: 'tally od-cluster', role: 'group', 'aria-label': 'Criteria' }, ['met', 'gap', 'void'].map(function (k) {
        return ASO.stateChip(k, t[k] + ' ' + k.toUpperCase());
      })) : null,
      c.due ? h('span', { class: 'strip-due od-nowrap' + (ASO.isSoon(c) ? ' soon' : '') }, [ASO.icon('clock', 'od-fixed'), h('span', { text: ASO.dueText(c) })]) : null,
      h('span', { class: 'strip-next', text: 'Next: ' + D.nextOf(c) })
    ]);
    el.hidden = false;
  }

  /* the Files control and its panel follow the patient or case in context */
  function syncFiles(s) {
    var can = s.kind !== 'global';
    var show = can && filesOpen;
    filesBtn.hidden = !can;
    filesBtn.setAttribute('aria-expanded', String(show));
    if (can) document.getElementById('files-count').textContent = String(ASO.files.count(s));
    ASO.files.show(show, s);
    filesScrim.hidden = !show;
    if (show) app.setAttribute('data-files', 'open');
    else app.removeAttribute('data-files');
  }

  function refreshChrome() {
    D.sync();
    var s = scope();
    var key = s.kind + ':' + (s.caseId || s.patientId || '');
    if (key !== lastScopeKey) {
      /* entering a patient or case context opens that patient; a manual collapse then sticks */
      if (s.patientId) expanded[s.patientId] = true;
      lastScopeKey = key;
    }
    app.setAttribute('data-scope', s.kind);
    ASO.nav.render(s, expanded, toggle);
    renderCtx(s);
    renderStrip(s);
    syncFiles(s);
    ASO.composer.chips();
  }

  function setFiles(open, moveFocus) {
    filesOpen = !!open;
    refreshChrome();
    mirror();
    if (moveFocus === false) return;
    if (filesOpen) document.getElementById('files-close').focus();
    else if (!filesBtn.hidden) filesBtn.focus();
  }

  /* ── drawer (phone) and collapse (desktop) ──────────────────────── */
  function closeDrawer() {
    if (app.getAttribute('data-drawer') !== 'open') return;
    app.removeAttribute('data-drawer');
    scrim.hidden = true;
    main.inert = false;
  }
  function openSidebar(moveFocus) {
    if (wide.matches) {
      app.setAttribute('data-sidebar', 'open');
    } else {
      app.setAttribute('data-drawer', 'open');
      scrim.hidden = false;
      main.inert = true;
    }
    if (moveFocus !== false) document.getElementById('sb-toggle').focus();
  }
  function closeSidebar() {
    if (wide.matches) app.setAttribute('data-sidebar', 'closed');
    else closeDrawer();
    document.getElementById('sb-open').focus();
  }

  /* ── theme ──────────────────────────────────────────────────────── */
  function setTheme(dark) {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('aso-theme', dark ? 'dark' : 'light'); } catch (err) { /* storage is unavailable in sandboxed previews */ }
  }

  /* ── render ─────────────────────────────────────────────────────── */
  function render() {
    var hadPrompt = document.activeElement === prompt;
    route = parse(path);
    if (route.extra === 'files') filesOpen = true;
    ASO.closeMenu(false);
    closeDrawer();
    if (!first) ASO.canvas.close();
    app.setAttribute('data-route', route.name);

    var conv, title = 'PatientGPT';
    if (route.name === 'home') {
      conv = ASO.convos.draftFor({ kind: 'global' });
      ASO.fill(view, homeView());
    } else if (route.name === 'patient') {
      conv = ASO.convos.draftFor({ kind: 'patient', patientId: route.id });
      ASO.fill(view, patientView(D.patient(route.id)));
      title = D.patient(route.id).name;
    } else if (route.name === 'case') {
      conv = ASO.convos.draftFor({ kind: 'case', caseId: route.id });
      ASO.fill(view, caseView(D.cases[route.id]));
      title = D.patientOf(D.cases[route.id]).name + ' · ' + route.id;
    } else {
      conv = ASO.convos.get(route.id);
      ASO.fill(view, threadView(conv, conv.title));
      title = conv.title;
    }
    document.title = (title === 'PatientGPT' ? title : title + ' · PatientGPT') + ' · ASO';

    ASO.thread.setCurrent(conv);
    ASO.composer.refresh();
    refreshChrome();
    if (route.name === 'chat') ASO.thread.activate(conv);
    else view.scrollTop = 0;
    if (route.extra === 'menu') openSidebar(!first);
    mirror();

    if (hadPrompt) ASO.composer.focus();
    else if (!first) view.focus({ preventScroll: true });
    first = false;
  }

  function init() {
    app = document.getElementById('app');
    main = document.getElementById('main');
    view = document.getElementById('view');
    scrim = document.getElementById('scrim');
    prompt = document.getElementById('prompt');
    filesBtn = document.getElementById('files-btn');
    filesScrim = document.getElementById('files-scrim');

    ASO.fillIcons(document);
    ASO.host.init();
    ASO.files.init();
    ASO.thread.init();
    ASO.composer.init();
    ASO.searchUI.init();

    var mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
    document.getElementById('search-kbd').textContent = mac ? '⌘K' : 'Ctrl K';

    /* the patient with the nearest deadline starts open, so cases and their states are visible */
    var open = D.openCases();
    if (open.length) expanded[open[0].patientId] = true;

    /* In-app links are handled here, in the capture phase, and never left to
       the browser: a preview's <base> or click guard cannot redirect or block them. */
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#/"]') : null;
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      go(a.getAttribute('href'));
    }, true);
    document.getElementById('skip').addEventListener('click', function (e) {
      e.preventDefault();
      view.focus();
    });

    document.getElementById('sb-open').addEventListener('click', function () { openSidebar(); });
    document.getElementById('sb-toggle').addEventListener('click', closeSidebar);
    scrim.addEventListener('click', closeDrawer);
    filesBtn.addEventListener('click', function () { setFiles(!filesOpen); });
    document.getElementById('files-close').addEventListener('click', function () { setFiles(false); });
    filesScrim.addEventListener('click', function () { setFiles(false); });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
      if (app.getAttribute('data-drawer') === 'open') { closeDrawer(); document.getElementById('sb-open').focus(); }
      else if (filesOpen && !app.hasAttribute('data-canvas') && !filesBtn.hidden) setFiles(false);
    });
    if (wide.addEventListener) wide.addEventListener('change', closeDrawer);

    var profile = document.getElementById('profile-btn');
    profile.addEventListener('click', function () {
      var dark = document.documentElement.classList.contains('dark');
      ASO.menu(profile, [
        { icon: dark ? 'sun' : 'moon', label: dark ? 'Switch to light theme' : 'Switch to dark theme', onSelect: function () { setTheme(!dark); } },
        { icon: 'doc', label: 'Open the guide', sub: 'What to try, click by click', href: 'patient-chat-storyboard.html' },
        { note: 'Signed in as ' + D.user.name + ', surgeon. Synthetic demo data only.' }
      ], { place: 'above-start', label: 'Account' });
    });

    g.addEventListener('hashchange', function () {
      var next = location.hash.replace(/^#/, '') || '/';
      if (next === path) return;
      filesOpen = /\/files$/.test(next);
      path = next;
      render();
    });

    path = location.hash.replace(/^#/, '') || '/';
    render();
  }

  ASO.shell = {
    go: go, refreshChrome: refreshChrome, setFiles: setFiles, closeDrawer: closeDrawer,
    filesOpen: function () { return filesOpen; }
  };
  init();
})(window);
