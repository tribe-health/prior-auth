/* ASO patient chat · Files and evidence panel.
   The right-hand panel for the patient or case in context, in the manner of
   the files and review panes beside the chat in Claude and ChatGPT's coding
   tools. It lists what the workflow has generated (statement, staff request,
   gate record, letter, packet, receipt), the evidence behind each criterion,
   and the chart documents. Opening an item shows it in the document viewer,
   which sits in the same place and offers a way back to this list.
   Everything here is derived from the shared case record, so the panel is
   always current: shell.js re-renders it whenever that record changes. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var h = ASO.h;
  var D = ASO.data;
  var el = {};

  function pages(n) { return n + (n === 1 ? ' page' : ' pages'); }

  function srcBtn(doc, page) {
    var label = doc + (page ? ' p.' + page : '');
    return h('button', {
      class: 'cite', type: 'button', 'aria-label': 'Open source ' + label,
      onclick: function () { ASO.host.openSource(doc, page); }
    }, label);
  }

  /* o: { kind, title, sub, host, onOpen } */
  function row(o) {
    var kids = [
      h('span', { class: 'f-kind od-fixed', text: o.kind }),
      h('span', { class: 'od-field od-fill' }, [
        h('span', { class: 'f-title', text: o.title }),
        o.sub ? h('span', { class: 'f-sub', text: o.sub }) : null
      ])
    ];
    var cls = 'f-row od-row-top' + (o.host ? ' is-host' : '');
    return h('li', null, o.onOpen
      ? h('button', { class: cls, type: 'button', onclick: o.onOpen }, kids)
      : h('div', { class: cls }, kids));
  }

  function evidenceRow(k) {
    var cites = k.cites && k.cites.length ? k.cites : (k.doc ? [{ doc: k.doc, page: k.page }] : []);
    return h('li', null, h('div', { class: 'f-row od-row-top' }, [
      h('span', { class: 'od-fixed' }, ASO.stateChip(k.state)),
      h('span', { class: 'od-field od-fill' }, [
        h('span', { class: 'f-title', text: k.sec + ' ' + k.name }),
        h('span', { class: 'f-sub', text: k.evidence }),
        cites.length
          ? h('span', { class: 'f-cites od-cluster' }, cites.map(function (x) { return srcBtn(x.doc, x.page); }))
          : h('span', { class: 'f-sub', text: k.cite && k.cite !== 'no source' ? 'Source: ' + k.cite : 'No source on file.' })
      ])
    ]));
  }

  function docRow(id, note) {
    var d = D.docs[id];
    var page = Number(Object.keys(d.text)[0]);
    return row({
      kind: d.policy ? 'Policy' : (d.unfiled ? 'Unfiled' : 'Chart'),
      title: d.title,
      sub: id + ' · ' + d.date + ' · ' + pages(d.pages) + (note ? ' · ' + note : ''),
      onOpen: function () { ASO.host.openSource(id, page); }
    });
  }

  /* What the workflow has produced on a case: read off its record, see records.js. */
  function generatedFor(c) { return ASO.records.list(c); }

  function citedDocs(c) {
    var ids = {};
    c.order.forEach(function (kid) {
      var k = c.criteria[kid];
      if (k.doc) ids[k.doc] = 1;
      (k.cites || []).forEach(function (x) { ids[x.doc] = 1; });
    });
    return ids;
  }

  function section(title, rows, empty) {
    return h('section', { class: 'f-sec' }, [
      h('h3', { class: 'f-sec-h', text: title }),
      rows.length ? h('ul', { class: 'f-list' }, rows) : h('p', { class: 'f-empty', text: empty })
    ]);
  }

  /* s: { kind: 'patient' | 'case', patientId, caseId } */
  function render(s) {
    var p = D.patient(s.patientId);
    var c = s.caseId ? D.cases[s.caseId] : null;
    var secs = [];
    el.meta.textContent = p.name + (c ? ' · ' + c.id : ' · whole chart');

    if (c) {
      var cited = citedDocs(c);
      secs.push(section('Generated in this case', generatedFor(c).map(row),
        'Nothing has been generated on this case yet. Statements, drafts, packets and receipts appear here as they are made.'));
      secs.push(section('Evidence by criterion', c.order.map(function (kid) { return evidenceRow(c.criteria[kid]); }),
        'No policy criteria are matched to this case yet.'));
      if (c.policyDoc) secs.push(section('Governing policy', [docRow(c.policyDoc, c.policyEff)], ''));
      secs.push(section('Other chart documents',
        D.filedDocs(p.id).filter(function (id) { return !cited[id]; }).map(function (id) { return docRow(id); }),
        'Every filed document is already cited above.'));
    } else {
      var gen = [];
      p.cases.forEach(function (cid) {
        var items = generatedFor(D.cases[cid]);
        if (!items.length) return;
        gen.push(h('li', { class: 'f-group', text: D.cases[cid].title + ' · ' + cid }));
        items.forEach(function (it) { gen.push(row(it)); });
      });
      secs.push(section('Generated', gen, 'Nothing has been generated for this patient yet.'));
      secs.push(section('Chart documents', D.filedDocs(p.id).map(function (id) {
        return docRow(id, D.docs[id].caseId ? 'first used by ' + D.docs[id].caseId : '');
      }), 'No chart documents are on file.'));
    }
    if (p.inbox.length) {
      secs.push(section('Unfiled', p.inbox.map(function (id) { return docRow(id, D.docs[id].received); }), ''));
    }
    ASO.fill(el.body, secs);
  }

  function count(s) {
    var p = D.patient(s.patientId);
    var n = D.filedDocs(p.id).length + p.inbox.length;
    (s.caseId ? [s.caseId] : p.cases).forEach(function (cid) { n += generatedFor(D.cases[cid]).length; });
    return n;
  }

  function show(open, s) {
    if (!open) { el.root.hidden = true; return; }
    render(s);
    el.root.hidden = false;
  }

  function init() {
    el.root = document.getElementById('files');
    el.meta = document.getElementById('files-meta');
    el.body = document.getElementById('files-body');
  }

  ASO.files = { init: init, show: show, count: count };
})(window);
