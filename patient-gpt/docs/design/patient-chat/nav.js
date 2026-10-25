/* ASO patient chat · left navigation.
   Patients sit where ChatGPT's Projects sit.
   · Click a patient: the chat is in the context of the whole patient, and
     the patient opens to show Cases and the patient-level History.
   · Click a case: the chat is in the context of that case, and History
     shows only the conversations scoped to that case.
   · Every case row carries its state in the process (see ASO.caseState).
   · A global History section follows Patients: chats with no patient.
   Any history row loads that conversation into the chat view. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var h = ASO.h;
  var D = ASO.data;

  function histRow(c, sel) {
    return h('li', null, h('a', {
      class: 'sb-hist-row od-row', href: '#/chat/' + c.id,
      'aria-current': sel.convId === c.id ? 'page' : null
    }, [
      h('span', { class: 'od-fill od-truncate', text: c.title }),
      h('span', { class: 'sb-meta od-fixed od-nowrap', text: c.when })
    ]));
  }

  function histList(list, sel, empty) {
    if (!list.length) return h('p', { class: 'sb-empty', text: empty });
    return h('ul', { class: 'sb-hist' }, list.map(function (c) { return histRow(c, sel); }));
  }

  function caseRow(id, caseSel, sel) {
    var c = D.cases[id];
    return h('li', null, h('a', {
      class: 'sb-case' + (caseSel === id ? ' is-ctx' : ''), href: '#/c/' + id,
      'aria-current': caseSel === id && !sel.convId ? 'page' : null
    }, [
      h('span', { class: 'sb-case-top od-row' }, [
        h('span', { class: 'od-fill od-truncate', text: c.title }),
        c.due ? h('span', { class: 'sb-meta od-fixed od-nowrap', text: ASO.fmtDate(c.due) }) : null
      ]),
      ASO.caseState(c)
    ]));
  }

  function patientNode(p, sel, expanded, onToggle) {
    var isOpen = !!expanded[p.id];
    var subId = 'sb-sub-' + p.id;
    var due = D.nearestDue(p);
    var inCtx = sel.patientId === p.id;
    var caseSel = inCtx && sel.caseId ? sel.caseId : null;

    var row = h('div', { class: 'sb-row od-row' }, [
      h('button', {
        class: 'sb-chev od-fixed', type: 'button', 'aria-expanded': String(isOpen), 'aria-controls': subId,
        'aria-label': (isOpen ? 'Collapse ' : 'Expand ') + p.name,
        onclick: function () { onToggle(p.id, subId); }
      }, ASO.icon(isOpen ? 'chevDown' : 'chevRight')),
      h('a', {
        class: 'sb-link od-row od-fill' + (inCtx ? ' is-ctx' : ''), href: '#/p/' + p.id,
        'aria-current': inCtx && sel.kind === 'patient' && !sel.convId ? 'page' : null
      }, [
        h('span', { class: 'od-fill od-truncate', text: p.name }),
        due ? h('span', { class: 'sb-due od-fixed od-nowrap', text: ASO.fmtDate(due) }) : null
      ])
    ]);

    var sub = h('div', { class: 'sb-sub', id: subId, hidden: !isOpen }, [
      h('p', { class: 'sb-sublabel', text: 'Cases' }),
      h('ul', { class: 'sb-cases' }, p.cases.map(function (id) { return caseRow(id, caseSel, sel); })),
      h('p', { class: 'sb-sublabel', text: caseSel ? 'Case history · ' + caseSel.slice(-4) : 'Patient history' }),
      caseSel
        ? histList(ASO.convos.list('case', caseSel), sel, 'No chats on this case yet.')
        : histList(ASO.convos.list('patient', p.id), sel, 'No patient-level chats yet.')
    ]);

    return h('li', null, [row, sub]);
  }

  /* sel: { kind, patientId, caseId, convId }; refocus: id of a sub-list whose toggle should regain focus */
  function render(sel, expanded, onToggle, refocus) {
    var list = document.getElementById('sb-patients');
    var hist = document.getElementById('sb-history');
    var ps = D.patients.slice().sort(function (a, b) {
      return (D.nearestDue(a) || '9999').localeCompare(D.nearestDue(b) || '9999') || a.name.localeCompare(b.name);
    });
    ASO.fill(list, ps.map(function (p) { return patientNode(p, sel, expanded, onToggle); }));

    var global = ASO.convos.list('global');
    ASO.fill(hist, global.length
      ? global.map(function (c) { return histRow(c, sel); })
      : h('li', { class: 'sb-empty', text: 'Chats with no patient selected appear here.' }));

    if (refocus) {
      var btn = list.querySelector('[aria-controls="' + refocus + '"]');
      if (btn) btn.focus();
    }
  }

  ASO.nav = { render: render };
})(window);
