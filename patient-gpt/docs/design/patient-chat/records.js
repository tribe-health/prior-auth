/* ASO patient chat · generated records and their viewers.
   A record is something the workflow produced on a case: a surgeon statement,
   a staff request, the gate record, the letter, the packet, its receipt, a
   peer-to-peer brief, the outcome. Every one is read off the case's working
   record, so the list is always current, and every one opens in the document
   viewer on every case. Chart documents open through host.openSource. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var h = ASO.h;
  var D = ASO.data;

  var LABEL = {
    letter: 'letter', packet: 'submission packet', receipt: 'submission receipt', gates: 'gate record',
    statement: 'surgeon statement', request: 'staff request', brief: 'peer-to-peer brief',
    determination: 'determination', outcome: 'call outcome'
  };

  function cite(doc, page) {
    if (!doc || !D.docs[doc]) return null;
    var label = doc + (page ? ' p.' + page : '');
    return h('button', {
      class: 'cite', type: 'button', 'aria-label': 'Open source ' + label,
      onclick: function () { ASO.host.openSource(doc, page); }
    }, label);
  }
  function cites(list) {
    var btns = (list || []).map(function (x) { return cite(x.doc, x.page); }).filter(Boolean);
    return btns.length ? h('span', { class: 'a-cites od-cluster' }, btns) : null;
  }
  function fact(k, v) { return h('div', { class: 'a-fact' }, [h('dt', { text: k }), h('dd', { text: v })]); }
  function paper(meta, title, kids) {
    return h('article', { class: 'paper letter' }, [h('p', { class: 'paper-meta', text: meta }), h('h3', { class: 'paper-title', text: title })].concat(kids));
  }

  /* ── packet contents, shared with the host's submit control ─────── */
  function letterOf(c) {
    if (c.letter.version && !c.letter.content) c.letter.content = ASO.host.composeLetter(c);
    return c.letter.content;
  }
  function packetItems(c) {
    var L = letterOf(c);
    return [{ name: 'Letter of medical necessity v' + c.letter.version, sub: 'Signed by ' + D.user.sign + ' on ' + c.letter.signedAt, pages: 2 }]
      .concat(L.docs.map(function (id) {
        var d = D.docs[id];
        return { name: d.title, sub: id + ' · ' + d.date, pages: d.pages };
      }));
  }
  function itemList(items, acked) {
    return h('ul', { class: 'pk-list' }, items.map(function (it) {
      var pages = it.pages + (it.pages === 1 ? ' page' : ' pages');
      return h('li', { class: 'pk-item' }, [
        h('span', { class: 'od-field' }, [h('span', { class: 'pk-name', text: it.name }), h('span', { class: 'pk-sub', text: it.sub })]),
        h('span', { class: 'pk-side od-nowrap' + (acked ? ' pk-ack' : '') }, acked ? [ASO.icon('check'), h('span', { text: 'Acknowledged · ' + pages })] : pages)
      ]);
    }));
  }

  /* ── viewers ────────────────────────────────────────────────────── */
  function openGates(c) {
    ASO.canvas.open('Four gates affirmed', c.id + ' · ' + c.gates.at, paper(
      'Affirmed by ' + D.user.name + ' · ' + c.gates.at + ' · synthetic', 'Four gates before drafting', [
        h('p', { text: 'Each gate was affirmed by the signed-in surgeon. The assistant cannot affirm a gate.' }),
        h('ul', { class: 'rec-list' }, ASO.host.gatesFor(c).map(function (gt) {
          return h('li', { class: 'rec-item od-row-top' }, [
            ASO.icon('check', 'od-fixed'),
            h('div', { class: 'od-field od-fill' }, [h('span', { class: 'rec-name', text: gt.name }), h('span', { class: 'rec-what', text: gt.what }), cites([gt])])
          ]);
        }))
      ]), null);
  }

  function openRequest(c) {
    var r = c.staffRequest;
    ASO.canvas.open('Staff request', c.id + ' · ' + r.at, paper('Sent ' + r.at + ' · synthetic', 'Request for ' + D.coordinator.name, [
      h('dl', { class: 'a-facts' }, [fact('To', D.coordinator.name + ', ' + D.coordinator.role.toLowerCase()), fact('From', D.user.name), fact('Case', c.id), fact('Status', 'Open')]),
      h('ul', { class: 'rec-list' }, (r.items || []).map(function (it) { return h('li', { class: 'rec-item', text: it }); })),
      h('p', { class: 'letter-sign', text: 'A request changes nothing on the criteria. A criterion moves only when a document is filed.' })
    ]), null);
  }

  function openStatement(c, id) {
    var s = c.statements[id];
    ASO.host.openNote(s.title, c.id + ' · ' + s.at, [s.text, 'Recorded by ' + D.user.sign + ' on ' + s.at + '. Attributed to the surgeon, not to the chart. A statement does not change a criterion.']);
  }

  function openPacket(c) {
    var items = packetItems(c);
    var L = letterOf(c);
    var sent = !!c.submission;
    ASO.canvas.open('Submission packet', c.id + ' · ' + items.length + ' items', paper(
      (sent ? 'Submitted ' + c.submission.at : 'Not submitted') + ' · synthetic', 'Submission packet', [
        h('p', { text: items.length + ' items for ' + c.payer + ' through the provider portal.' }),
        itemList(items, sent),
        L.omitted.length ? h('ul', { class: 'warns' }, L.omitted.map(function (o) {
          return h('li', { text: o.sec + ' ' + o.name + ' has no supporting source. The reviewer sees it listed as not asserted.' });
        })) : null,
        h('p', { class: 'letter-sign', text: sent ? 'Submitted by ' + D.user.name + '. Confirmation ' + c.submission.ref + ' (synthetic).' : 'Only the surgeon can submit. The control is in the conversation.' })
      ]), null);
  }

  function openReceipt(c) {
    var items = packetItems(c);
    ASO.canvas.open('Submission receipt', c.id + ' · ' + c.submission.ref, paper('Received ' + c.submission.at + ' · synthetic', 'Submission receipt', [
      h('dl', { class: 'a-facts' }, [
        fact('Payer', c.payer), fact('Confirmation', c.submission.ref),
        fact('Received', c.submission.at), fact('Channel', 'Provider portal')
      ]),
      itemList(items, true),
      h('p', { class: 'pk-sum', text: items.length + ' of ' + items.length + ' items acknowledged. Page counts match the packet.' })
    ]), null);
  }

  function openBrief(c) {
    var said = c.statements.pt_stop;
    ASO.canvas.open('Peer-to-peer brief', c.id + ' · ' + c.briefAt, paper('Prepared ' + c.briefAt + ' · synthetic', 'Peer-to-peer brief', [
      h('p', { class: 'letter-addr' }, [
        h('span', { text: 'Call with the ' + c.peer.reviewer + ' · ' + c.peer.when }),
        h('span', { text: D.patientOf(c).name + ' · ' + c.procedure }),
        h('span', { text: 'Policy ' + c.policy + ' · confirmation ' + c.submission.ref })
      ]),
      h('ol', { class: 'claims' }, ASO.flows.briefPoints(c).map(function (p) { return h('li', null, [h('span', { text: p.text }), ' ', cites(p.cites)]); })),
      said ? h('p', { text: 'Surgeon statement, ' + said.at + ': ' + said.text }) : null,
      h('p', { class: 'letter-sign', text: 'The unmet criterion stays as the record shows it. This brief gives no estimate of the outcome.' })
    ]), null);
  }

  function openOutcome(c) {
    var o = c.peer.outcome;
    ASO.host.openNote('Peer-to-peer outcome', c.id + ' · ' + o.at, [
      o.result === 'approved' ? 'The reviewer overturned the denial on the call.' : 'The reviewer upheld the denial on the call.',
      'Recorded by ' + D.user.sign + ' on ' + o.at + '. This is the surgeon’s record of the call, not a payer document. The written determination is filed when it arrives.'
    ]);
  }

  /* ── what a case has produced, oldest step first ────────────────── */
  function list(c) {
    var out = [];
    function add(kind, key, title, sub, onOpen) { out.push({ kind: kind, key: key, title: title, sub: sub, host: true, onOpen: onOpen }); }
    Object.keys(c.statements).forEach(function (id) {
      var s = c.statements[id];
      add('Statement', 'statement', s.title, 'Recorded ' + s.at, function () { openStatement(c, id); });
    });
    if (c.staffRequest.sent) add('Request', 'request', 'Staff request to ' + D.coordinator.name, (c.staffRequest.items || [])[0] || 'Sent ' + c.staffRequest.at, function () { openRequest(c); });
    if (c.gates.affirmed) add('Gates', 'gates', 'Four gates affirmed', 'By ' + D.user.name + ' · ' + c.gates.at, function () { openGates(c); });
    if (c.letter.version && letterOf(c)) {
      add('Letter', 'letter', 'Letter of medical necessity v' + c.letter.version, c.letter.signed ? 'Signed ' + c.letter.signedAt : 'Draft · unsigned',
        function () { ASO.host.openLetter(ASO.thread.current(), c.id); });
    }
    if (c.letter.signed) add('Packet', 'packet', 'Submission packet', packetItems(c).length + ' items for ' + c.payer, function () { openPacket(c); });
    if (c.submission) add('Receipt', 'receipt', 'Submission receipt', 'Received ' + c.submission.at + ' · ' + c.submission.ref, function () { openReceipt(c); });
    if (c.detDoc && !D.docs[c.detDoc].unfiled) {
      var d = D.docs[c.detDoc];
      add('Outcome', 'determination', d.title, c.detDoc + ' · ' + d.date, function () { ASO.host.openSource(c.detDoc, Number(Object.keys(d.text)[0])); });
    }
    if (c.peer && c.briefAt) add('Brief', 'brief', 'Peer-to-peer brief', 'Prepared ' + c.briefAt + ' · call ' + c.peer.when, function () { openBrief(c); });
    if (c.peer && c.peer.outcome) {
      add('Outcome', 'outcome', 'Peer-to-peer outcome: ' + (c.peer.outcome.result === 'approved' ? 'overturned' : 'upheld'), 'Recorded by ' + D.user.name + ' · ' + c.peer.outcome.at, function () { openOutcome(c); });
    }
    return out;
  }

  function find(c, key) {
    var all = list(c);
    var hit = all.filter(function (r) { return r.key === key; });
    if (!hit.length && key === 'determination') hit = all.filter(function (r) { return r.key === 'outcome'; });
    return hit[hit.length - 1] || null;
  }
  function has(c, key) { return !!find(c, key); }
  function open(c, key) {
    var r = find(c, key);
    if (r) r.onOpen();
    return !!r;
  }

  /* why a record does not exist yet, in the agent's words */
  function missing(c, key) {
    return {
      letter: 'There is no letter on this case yet.',
      packet: 'There is no packet yet. It is assembled when you sign the letter.',
      receipt: 'There is no receipt, because this case has not been submitted.',
      gates: 'The four gates have not been affirmed on this case.',
      statement: 'No surgeon statement is recorded on this case.',
      request: 'No staff request has been sent on this case.',
      brief: c.peer ? 'The brief is not prepared yet. Ask me to prep the peer-to-peer.' : 'There is no peer-to-peer on this case, so there is no brief.',
      determination: c.detDoc && D.docs[c.detDoc].unfiled ? 'A determination letter arrived today but is not filed. Attach it with + and I will read it.' : 'No determination is on file for this case.',
      outcome: 'No call outcome is recorded on this case.'
    }[key] || 'That record does not exist on this case.';
  }

  /* a record, as a card in the conversation: drawn by the app, opened by the surgeon */
  function card(c, key) {
    var r = find(c, key);
    if (!r) return null;
    return h('section', { class: 'host artifact od-row', 'aria-label': r.title }, [
      ASO.icon(key === 'receipt' ? 'receipt' : 'doc', 'od-fixed'),
      h('div', { class: 'od-field od-fill' }, [h('span', { class: 'artifact-name', text: r.title }), h('span', { class: 'card-status', text: r.sub })]),
      h('button', { class: 'btn ghost od-fixed', type: 'button', onclick: r.onOpen }, 'Open')
    ]);
  }

  ASO.records = {
    list: list, has: has, open: open, missing: missing, card: card,
    label: function (k) { return LABEL[k] || k; },
    packetItems: packetItems, itemList: itemList, letterOf: letterOf
  };
})(window);
