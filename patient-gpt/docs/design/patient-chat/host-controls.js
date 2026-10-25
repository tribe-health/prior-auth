/* ASO patient chat · host-owned controls and the canvas.
   Everything in this file is drawn by the app, never from an agent surface:
   the four drafting gates, letter approval and signing, the submission
   packet and its receipt. The agent can only pause (an AG-UI interrupt) and
   wait. Gates do not animate. Sources and the letter open in the canvas. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var h = ASO.h;
  var D = ASO.data;
  var cv = {};
  var app = null;
  var opener = null;

  /* ── canvas ─────────────────────────────────────────────────────── */
  var canvas = {
    open: function (title, meta, body, foot) {
      if (cv.el.hidden) opener = document.activeElement;
      cv.title.textContent = title;
      cv.meta.textContent = meta || '';
      ASO.fill(cv.body, body);
      ASO.fill(cv.foot, foot);
      cv.foot.hidden = !foot;
      cv.el.hidden = false;
      app.setAttribute('data-canvas', 'open');
      cv.body.scrollTop = 0;
      cv.close.focus();
    },
    close: function () {
      if (cv.el.hidden) return;
      cv.el.hidden = true;
      app.removeAttribute('data-canvas');
      if (opener && document.contains(opener)) opener.focus();
      opener = null;
    }
  };

  function srcBtn(doc, page) {
    var label = doc + (page ? ' p.' + page : '');
    return h('button', {
      class: 'cite', type: 'button', 'aria-label': 'Open source ' + label,
      onclick: function () { openSource(doc, page); }
    }, label);
  }

  function openSource(docId, page) {
    var d = D.docs[docId];
    if (!d) return;
    var pages = Object.keys(d.text).map(Number).sort(function (a, b) { return a - b; });
    var cur = pages.indexOf(Number(page)) >= 0 ? Number(page) : pages[0];
    var owner = d.policy ? 'Payer policy library' : 'Patient chart: ' + D.patient(d.patientId).name;
    var used = d.policy ? 'Synthetic policy text' : (d.unfiled ? 'Unfiled · ' + d.received : (d.caseId ? 'First used by ' + d.caseId : 'Not yet cited'));
    var body = h('div', { class: 'src' });

    function fact(k, v) { return h('div', { class: 'a-fact' }, [h('dt', { text: k }), h('dd', { text: v })]); }
    function draw(refocus) {
      ASO.fill(body, [
        h('dl', { class: 'a-facts' }, [
          fact('Dated', d.date), fact('Length', d.pages + (d.pages === 1 ? ' page' : ' pages')),
          fact('Held in', owner), fact('Status', used), fact('Source hash', d.hash)
        ]),
        pages.length > 1 ? h('div', { class: 'src-tabs od-cluster', role: 'group', 'aria-label': 'Pages with cited passages' }, pages.map(function (n) {
          return h('button', {
            class: 'tab', type: 'button', 'aria-pressed': String(n === cur),
            onclick: function () { cur = n; draw(true); }
          }, 'Page ' + n);
        })) : null,
        h('figure', { class: 'paper excerpt' }, [
          h('figcaption', { class: 'paper-meta', text: docId + ' · page ' + cur + ' of ' + d.pages }),
          h('blockquote', { text: d.text[cur] })
        ]),
        h('p', { class: 'src-note', text: 'Synthetic excerpt. Page images are not part of this prototype.' })
      ]);
      if (refocus) {
        var on = body.querySelector('.tab[aria-pressed="true"]');
        if (on) on.focus();
      }
    }

    draw(false);
    canvas.open(d.title, docId + ' · ' + d.date, body, null);
  }

  /* a short generated record, such as the surgeon's statement */
  function openNote(title, meta, lines) {
    canvas.open(title, meta, h('article', { class: 'paper letter' }, lines.map(function (line) {
      return h('p', { text: line });
    })), null);
  }

  function hostHead(title, note, ico) {
    return h('header', { class: 'host-head' }, [
      h('h3', { class: 'host-h od-row' }, [ASO.icon(ico || 'lock', 'od-fixed'), h('span', { class: 'od-fill', text: title })]),
      h('p', { class: 'host-note', text: note })
    ]);
  }

  /* ── four drafting gates ────────────────────────────────────────── */
  /* a case names its own four gates; one opened from the policy library gets them from its record */
  function gatesFor(c) {
    if (c.gateDefs) return c.gateDefs;
    var first = c.criteria[c.order[0]] || {};
    var pol = D.docs[c.policyDoc];
    var polPage = pol ? Number(Object.keys(pol.text).pop()) : null;
    return [
      { name: 'Policy', what: D.payerName(c) + ' ' + c.policy + (c.policyEff ? ', ' + c.policyEff : ''), doc: c.policyDoc, page: 1 },
      { name: 'Governing section', what: c.order.map(function (id) { return c.criteria[id].sec; }).join(', '), doc: c.policyDoc, page: polPage },
      { name: 'Pathway', what: c.title, doc: first.doc, page: first.page },
      { name: 'Operative plan', what: c.procedure + (c.codes ? ' · CPT ' + c.codes : ''), doc: first.doc, page: first.page }
    ];
  }
  function gateBlock(c, gate) {
    var x = gate.needs ? c.conflicts[gate.needs] : null;
    return x && !x.resolved ? x : null;
  }

  function raiseGates(t) {
    var c = D.cases[t.caseId];
    if (t.gates && t.gates.sync && t.el.contains(t.gates.el)) {
      var firstBox = t.gates.el.querySelector('input:not(:disabled)');
      if (firstBox) firstBox.focus();
      return;
    }
    var gs = gatesFor(c);
    var boxes = [];
    var count = h('span', { class: 'gate-count', role: 'status' });
    var btn = h('button', { class: 'btn primary', type: 'button' }, 'Affirm as ' + D.user.name);

    var list = h('ul', { class: 'gate-list' }, gs.map(function (gate) {
      var id = ASO.uid('gate');
      var cb = h('input', { type: 'checkbox', id: id });
      var x = gate.needs ? c.conflicts[gate.needs] : null;
      var why = h('span', { class: 'gate-why', hidden: true, text: (x && x.gateWhy) || 'Answer the open question first. It can change this gate.' });
      cb.addEventListener('change', sync);
      boxes.push({ gate: gate, cb: cb, why: why });
      return h('li', { class: 'gate od-row-top' }, [
        h('span', { class: 'gate-box od-fixed' }, cb),
        h('div', { class: 'od-field od-fill' }, [
          h('label', { class: 'gate-name', for: id, text: gate.name }),
          h('span', { class: 'gate-what', text: gate.what }),
          why,
          D.docs[gate.doc] ? h('span', { class: 'a-cites od-cluster' }, [srcBtn(gate.doc, gate.page)]) : null
        ])
      ]);
    }));

    var panel = h('section', { class: 'host gates', 'aria-label': 'Four gates before drafting' }, [
      hostHead('Four gates before drafting', 'Only the signed-in surgeon can affirm these. The assistant cannot.'),
      list,
      h('div', { class: 'host-actions od-cluster' }, [btn, count])
    ]);

    function sync() {
      var n = 0;
      boxes.forEach(function (b) {
        var blocked = !!gateBlock(c, b.gate);
        b.cb.disabled = blocked;
        if (blocked) b.cb.checked = false;
        b.why.hidden = !blocked;
        if (b.cb.checked) n += 1;
      });
      btn.disabled = n < boxes.length;
      count.textContent = n + ' of ' + boxes.length + ' checked';
    }

    btn.addEventListener('click', function () {
      c.gates = { affirmed: true, at: D.today + ' ' + ASO.clock() };
      t.gates.sync = null;
      ASO.fill(panel, [
        hostHead('Four gates affirmed', 'Affirmed by ' + D.user.name + ' · ' + c.gates.at, 'check'),
        h('ul', { class: 'gate-list' }, gs.map(function (gate) {
          return h('li', { class: 'gate od-row-top' }, [
            ASO.icon('check', 'od-fixed'),
            h('div', { class: 'od-field od-fill' }, [
              h('span', { class: 'gate-name', text: gate.name }),
              h('span', { class: 'gate-what', text: gate.what })
            ])
          ]);
        }))
      ]);
      ASO.shell.refreshChrome();
      ASO.announce('Four gates affirmed. Drafting the letter.');
      ASO.thread.run(t, ASO.runs.draft(t));
    });

    t.gates = { el: panel, sync: sync };
    t.el.appendChild(panel);
    sync();
    ASO.thread.scroll(t, true);
  }

  /* ── letter: every claim cited, anything unsupported listed, not written around ── */
  function composeLetter(c) {
    var cited = [];
    var omitted = [];
    var docs = {};
    c.order.forEach(function (id) {
      var k = c.criteria[id];
      if (k.state === 'met') {
        var cites = k.cites && k.cites.length ? k.cites : [{ doc: k.doc, page: k.page }];
        cites.forEach(function (x) { docs[x.doc] = 1; });
        cited.push({ sec: k.sec, text: k.claim, cites: cites });
      } else {
        omitted.push({ sec: k.sec, name: k.name, state: k.state, reason: k.evidence });
      }
    });
    var said = Object.keys(c.conflicts).map(function (id) { return c.conflicts[id]; })
      .filter(function (x) { return x.resolved && x.statement; }).map(function (x) { return x.statement; });
    return { cited: cited, omitted: omitted, docs: Object.keys(docs), statement: said.length ? said.join(' ') : null };
  }

  function openLetter(t, caseId) {
    var c = D.cases[caseId || t.caseId];
    if (!c || !c.letter) return;
    var p = D.patientOf(c);
    var L = ASO.records.letterOf(c);
    if (!L) return;
    var proc = c.procedure.charAt(0).toLowerCase() + c.procedure.slice(1);
    var dated = c.letter.date || D.today;
    var here = !!t && t.caseId === c.id;

    var paper = h('article', { class: 'paper letter' }, [
      h('p', { class: 'paper-meta', text: 'Version ' + c.letter.version + ' · ' + (c.letter.signed ? 'Signed' : 'Draft') + ' · ' + dated + ' · synthetic' }),
      h('h3', { class: 'paper-title', text: 'Letter of medical necessity' }),
      h('p', { class: 'letter-addr' }, [
        h('span', { text: c.payer.split(' · ')[0] + ' Utilization Management' }),
        h('span', { text: 'Re: ' + p.name + ' · Member ' + p.member }),
        h('span', { text: 'Case ' + c.id + ' · Policy ' + c.policy })
      ]),
      h('p', { text: 'I am requesting authorization for ' + proc + (c.codes ? ' (CPT ' + c.codes.replace(/ · /g, ', ') + ')' : '') + '. Each statement below cites the chart document and page it comes from.' }),
      h('ol', { class: 'claims' }, L.cited.map(function (x) {
        return h('li', null, [h('span', { class: 'sec od-nowrap', text: x.sec }), ' ', x.text, ' '].concat(
          x.cites.map(function (ci) { return srcBtn(ci.doc, ci.page); })));
      })),
      L.statement ? h('p', { text: 'Surgeon statement, ' + dated + ': ' + L.statement }) : null,
      L.omitted.length ? h('section', { class: 'omitted' }, [
        h('h4', { text: 'Not asserted in this letter' }),
        h('ul', null, L.omitted.map(function (o) {
          return h('li', null, [ASO.stateChip(o.state), h('span', { text: o.sec + ' ' + o.name + '. ' + o.reason })]);
        }))
      ]) : null,
      h('p', { class: 'letter-sign', text: c.letter.signed ? 'Signed electronically by ' + D.user.sign + ' · ' + c.letter.signedAt : 'Unsigned draft. Not yet approved by the surgeon.' })
    ]);

    var foot;
    if (c.letter.signed) {
      foot = h('p', { class: 'signed' }, [ASO.icon('check', 'od-fixed'), h('span', { text: 'Signed ' + c.letter.signedAt + '.' + (c.submission ? ' Submitted ' + c.submission.at + '.' : ' The packet is ready to submit.') })]);
    } else if (here) {
      foot = [
        h('button', { class: 'btn primary od-fixed', type: 'button', onclick: function () { sign(t, c.id); } }, 'Approve and sign'),
        h('p', { class: 'foot-note od-fill', text: 'Signing records your name and the time against version ' + c.letter.version + '.' })
      ];
    } else {
      /* a letter is signed inside its own case, so the packet lands in that case's conversation */
      foot = [
        h('a', { class: 'btn primary od-fixed', href: '#/c/' + c.id }, 'Go to the case to sign'),
        h('p', { class: 'foot-note od-fill', text: 'This draft belongs to ' + c.id + '. Signing happens inside that case.' })
      ];
    }
    canvas.open('Letter of medical necessity', c.id + ' · v' + c.letter.version, paper, foot);
  }

  function letterCard(t) {
    var c = D.cases[t.caseId];
    var status = h('span', { class: 'card-status', text: c.letter.signed ? 'Signed ' + c.letter.signedAt : 'Draft · unsigned' });
    t.letterCards = (t.letterCards || []).concat([status]);
    return h('section', { class: 'host artifact od-row', 'aria-label': 'Letter of medical necessity' }, [
      ASO.icon('doc', 'od-fixed'),
      h('div', { class: 'od-field od-fill' }, [
        h('span', { class: 'artifact-name', text: 'Letter of medical necessity · v' + c.letter.version }),
        status
      ]),
      h('button', { class: 'btn ghost od-fixed', type: 'button', onclick: function () { openLetter(t, c.id); } }, 'Open')
    ]);
  }

  function sign(t, caseId) {
    var c = D.cases[caseId || t.caseId];
    if (c.letter.signed) return;
    c.letter.signed = true;
    c.letter.date = D.today;
    c.letter.signedAt = D.today + ' ' + ASO.clock();
    if (t.draft) {
      /* signed from the files panel before any message: the record still needs a conversation to live in */
      ASO.convos.commit(t, 'Letter v' + c.letter.version + ' signed');
      ASO.thread.divider(t, 'Today');
      ASO.shell.go('#/chat/' + t.id);
    }
    (t.letterCards || []).forEach(function (el) { el.textContent = 'Signed ' + c.letter.signedAt; });
    openLetter(t, c.id);
    packet(t, c.id);
    ASO.shell.refreshChrome();
    ASO.announce('Letter version ' + c.letter.version + ' signed. The submission packet is in the conversation.');
  }

  /* ── submission packet and receipt ──────────────────────────────── */
  var REF = { 'BCBS TX': 'TX-PA-884', Aetna: 'AE-PA-207', Cigna: 'CG-PA-551', Humana: 'HU-PA-630' };
  var refNo = 17326;

  function packet(t, caseId) {
    var c = D.cases[caseId || t.caseId];
    if (!c.letter.signed || c.submission) return;
    if (t.packetEl && t.el.contains(t.packetEl)) { ASO.thread.scroll(t, true); return; }
    var L = ASO.records.letterOf(c);
    var itemList = ASO.records.itemList;
    var payer = D.payerName(c);
    var items = ASO.records.packetItems(c);
    var btn = h('button', { class: 'btn primary', type: 'button' }, 'Submit to ' + payer);
    var panel = h('section', { class: 'host packet', 'aria-label': 'Submission packet' }, [
      hostHead('Submission packet', items.length + ' items for ' + c.payer + ' through the provider portal'),
      itemList(items, false),
      L.omitted.length ? h('ul', { class: 'warns' }, L.omitted.map(function (o) {
        return h('li', { text: o.sec + ' ' + o.name + ' has no supporting source. The reviewer will see it listed as not asserted.' });
      })) : null,
      h('div', { class: 'host-actions od-cluster' }, [btn])
    ]);
    btn.addEventListener('click', function () {
      refNo += 1;
      c.submission = { at: D.today + ' ' + ASO.clock(), ref: (REF[payer] || 'PA-000') + refNo };
      c.due = '2026-10-13';
      c.dueKind = 'Follow up by';
      ASO.fill(panel, [
        hostHead('Submission receipt', 'Received ' + c.submission.at + ' · confirmation ' + c.submission.ref + ' (synthetic)', 'receipt'),
        itemList(items, true),
        h('p', { class: 'pk-sum', text: items.length + ' of ' + items.length + ' items acknowledged. Page counts match the packet.' })
      ]);
      ASO.shell.refreshChrome();
      ASO.announce('Submitted to ' + payer + '. Receipt received.');
      ASO.thread.run(t, ASO.runs.afterSubmit(t));
    });
    t.packetEl = panel;
    t.el.appendChild(panel);
    ASO.thread.scroll(t, true);
  }

  /* ── peer-to-peer outcome: recorded by the surgeon, never predicted ── */
  function raiseOutcome(t) {
    var c = D.cases[t.caseId];
    if (!c.peer || c.peer.outcome) return;
    if (t.outcomeEl && t.el.contains(t.outcomeEl)) { ASO.thread.scroll(t, true); return; }
    var name = ASO.uid('outcome');
    var err = h('p', { class: 'a-q-err', role: 'alert', hidden: true, text: 'Choose what the reviewer decided before recording.' });
    var opts = [['approved', 'Denial overturned: the request is approved'], ['denied', 'Denial upheld']];
    var fs = h('fieldset', { class: 'a-q-opts' }, [h('legend', { class: 'sr-only', text: 'What the reviewer decided' })].concat(opts.map(function (o, i) {
      return h('label', { class: 'a-q-opt od-row', for: name + i }, [
        h('input', { type: 'radio', name: name, id: name + i, value: o[0] }), h('span', { class: 'od-fill', text: o[1] })
      ]);
    })));
    var btn = h('button', { class: 'btn primary', type: 'button' }, 'Record as ' + D.user.name);
    var panel = h('section', { class: 'host gates', 'aria-label': 'Record the peer-to-peer outcome' }, [
      hostHead('Record the peer-to-peer outcome', 'Use this after the call on ' + c.peer.when + '. Only the signed-in surgeon can record it.'),
      fs, err, h('div', { class: 'host-actions od-cluster' }, [btn])
    ]);
    btn.addEventListener('click', function () {
      var sel = fs.querySelector('input:checked');
      if (!sel) { err.hidden = false; fs.querySelector('input').focus(); return; }
      var at = D.today + ' ' + ASO.clock();
      c.peer.outcome = { result: sel.value, at: at };
      c.outcome = sel.value;
      c.outcomeAt = D.today;
      c.due = null;
      ASO.fill(panel, [hostHead(sel.value === 'approved' ? 'Outcome recorded: denial overturned' : 'Outcome recorded: denial upheld',
        'Recorded by ' + D.user.name + ' · ' + at + '. The surgeon’s record of the call, not a payer document.', 'check')]);
      ASO.shell.refreshChrome();
      ASO.announce('Peer-to-peer outcome recorded.');
      ASO.thread.run(t, ASO.flows.afterOutcome(t));
    });
    t.outcomeEl = panel;
    t.el.appendChild(panel);
    ASO.thread.scroll(t, true);
  }

  /* ── wiring from the event stream ───────────────────────────────── */
  function onInterrupt(t, intr) {
    if (intr && intr.id === 'gates') raiseGates(t);
    if (intr && intr.id === 'p2p_outcome') raiseOutcome(t);
  }

  function onCustom(t, v) {
    var c = D.cases[t.caseId];
    if (!c) return;
    var here = ASO.thread.current() === t && !t.muted;
    if (v.action === 'letter_ready') c.letter.content = composeLetter(c);
    if (v.action === 'letter_ready' || v.action === 'show_letter') {
      if (t.agent) t.agent.body.appendChild(letterCard(t));
      if (here) openLetter(t);
    } else if (v.action === 'record_card' || v.action === 'open_record') {
      var card = ASO.records.card(c, v.kind);
      if (card && t.agent) t.agent.body.appendChild(card);
      if (v.action === 'open_record' && here) ASO.records.open(c, v.kind);
    } else if (v.action === 'packet') {
      packet(t, c.id);
    }
  }

  function refresh() {
    var t = ASO.thread.current();
    if (t && t.gates && t.gates.sync) t.gates.sync();
  }

  function init() {
    app = document.getElementById('app');
    cv.el = document.getElementById('canvas');
    cv.title = document.getElementById('canvas-title');
    cv.meta = document.getElementById('canvas-meta');
    cv.body = document.getElementById('canvas-body');
    cv.foot = document.getElementById('canvas-foot');
    cv.close = document.getElementById('canvas-close');
    /* letters written before today are composed from the case record, so they open like any other */
    Object.keys(D.cases).forEach(function (id) { ASO.records.letterOf(D.cases[id]); });
    cv.close.addEventListener('click', function () {
      canvas.close();
      if (ASO.shell.filesOpen()) ASO.shell.setFiles(false, false);
    });
    document.getElementById('canvas-back').addEventListener('click', canvas.close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !cv.el.hidden && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        canvas.close();
      }
    });
  }

  ASO.canvas = canvas;
  ASO.host = {
    init: init, openSource: openSource, openLetter: openLetter, openNote: openNote, composeLetter: composeLetter, gatesFor: gatesFor,
    onInterrupt: onInterrupt, onCustom: onCustom, refresh: refresh
  };
})(window);
