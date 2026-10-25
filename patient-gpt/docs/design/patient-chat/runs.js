/* ASO patient chat · scripted agent runs, case scope, plus shared surfaces.
   Each function returns an AG-UI-shaped event list (see agui-stream.js).
   Every case is worked from its own record, so the same runs serve any case:
   report, blockers, evidence, the four gates, drafting, records. What differs
   per case (the open question, what an attached document changes, the
   peer-to-peer, the payer's answer) lives in flows.js. Agent rules held
   throughout: a gap never becomes met by reinterpretation, the agent never
   attests for the surgeon, no approval odds, one question at a time, and
   every report runs CASE, CRITERIA STATUS, CONFLICTS, BLOCKERS, NEXT MOVE.
   Global and patient-scope runs live in runs-scope.js. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var D = ASO.data;
  var S = ASO.stream;
  var CAT = ASO.a2ui.catalog;

  function surface(components, data) {
    var id = ASO.uid('surf');
    return [
      { createSurface: { surfaceId: id, catalogId: CAT } },
      { updateComponents: { surfaceId: id, components: components } },
      { updateDataModel: { surfaceId: id, path: '/', value: data || {} } }
    ];
  }

  function sentence(str) { return String(str).replace(/\.$/, '') + '.'; }
  function caseOf(t) { return D.cases[t.caseId]; }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  /* Every answer ends by offering the next prompts. They are worked out when
     the answer finishes, so they follow whatever the run just changed. */
  function end(b) { return b.custom('aso.suggest', {}).finish(); }
  function suggest(labels) {
    return surface([{ id: 'root', component: 'Suggestions', items: { path: '/items' } }],
      { items: labels.map(function (l) { return { label: l, prompt: l }; }) });
  }

  /* ── shared surfaces ────────────────────────────────────────────── */
  function caseItem(c) {
    return { patientId: c.patientId, caseId: c.id, title: D.patientOf(c).name, sub: c.title + ' · ' + c.id, meta: ASO.dueText(c), soon: ASO.isSoon(c) };
  }
  function contextSurface(items) {
    return surface([
      { id: 'root', component: 'Column', children: ['ctx'] },
      { id: 'ctx', component: 'ContextList', items: { path: '/items' } }
    ], { items: items });
  }
  function caseRows(ids) {
    return contextSurface(ids.map(function (id) { return caseItem(D.cases[id]); }));
  }
  function dueSurface() { return contextSurface(D.openCases().map(caseItem)); }

  /* refs: document ids, or { doc, page } for a specific passage */
  function docsSurface(refs) {
    var seen = {};
    var items = [];
    refs.forEach(function (r) {
      var id = typeof r === 'string' ? r : r.doc;
      var d = D.docs[id];
      if (!d) return;
      var page = typeof r === 'string' ? Number(Object.keys(d.text)[0]) : r.page;
      if (seen[id + ':' + page]) return;
      seen[id + ':' + page] = 1;
      items.push({ doc: id, page: page, title: d.title,
        sub: d.date + ' · ' + d.pages + (d.pages === 1 ? ' page' : ' pages') + (d.policy ? ' · payer policy' : (d.caseId ? ' · first used by ' + d.caseId : '')) });
    });
    return surface([
      { id: 'root', component: 'Column', children: ['docs'] },
      { id: 'docs', component: 'DocumentList', items: { path: '/items' } }
    ], { items: items });
  }

  function nextSurface(text, action) {
    var comp = { id: 'next', component: 'NextMove', text: text };
    if (action) comp.action = action;
    return surface([
      { id: 'root', component: 'Column', children: ['s-next'] },
      { id: 's-next', component: 'Section', title: 'Next move', children: ['next'] },
      comp
    ], {});
  }

  function blockerSurface(c) {
    return surface([
      { id: 'root', component: 'Column', children: ['s-block', 's-next'] },
      { id: 's-block', component: 'Section', title: 'Blockers', children: ['block'] },
      { id: 'block', component: 'BlockerList', items: { path: '/blockers' } },
      { id: 's-next', component: 'Section', title: 'Next move', children: ['next'] },
      { id: 'next', component: 'NextMove', text: { path: '/next' } }
    ], { blockers: D.blockersOf(c), next: sentence(D.nextOf(c)) });
  }

  /* a report is a snapshot: it shows the case as it stood when it was written */
  function snapshot(c) {
    var p = D.patientOf(c);
    return {
      'case': {
        patient: p.name, id: c.id, procedure: c.procedure, codes: c.codes, payer: c.payer,
        policy: c.policy ? c.policy + (c.policyEff ? ' · ' + c.policyEff : '') : null,
        status: D.statusLabelOf(c)
      },
      criteria: c.order.map(function (id) {
        var k = c.criteria[id];
        return { sec: k.sec, name: k.name, state: k.state, evidence: k.evidence, doc: k.doc || null, page: k.page || null, cites: k.cites || null, cite: k.cite || null };
      }),
      conflicts: Object.keys(c.conflicts).map(function (id) {
        var x = c.conflicts[id];
        return { kind: x.kind, text: x.text, doc: x.doc, page: x.page, resolved: x.resolved, statement: x.statement };
      }),
      blockers: D.blockersOf(c),
      next: sentence(D.nextOf(c))
    };
  }

  function reportSurface(c) {
    return surface([
      { id: 'root', component: 'Column', children: ['s-case', 's-crit', 's-conf', 's-block', 's-next'] },
      { id: 's-case', component: 'Section', title: 'Case', children: ['case'] },
      { id: 'case', component: 'CaseHeader', value: { path: '/case' } },
      { id: 's-crit', component: 'Section', title: 'Criteria status', children: ['crit'] },
      { id: 'crit', component: 'CriteriaList', items: { path: '/criteria' } },
      { id: 's-conf', component: 'Section', title: 'Conflicts', children: ['conf'] },
      { id: 'conf', component: 'ConflictList', items: { path: '/conflicts' } },
      { id: 's-block', component: 'Section', title: 'Blockers', children: ['block'] },
      { id: 'block', component: 'BlockerList', items: { path: '/blockers' } },
      { id: 's-next', component: 'Section', title: 'Next move', children: ['next'] },
      { id: 'next', component: 'NextMove', text: { path: '/next' } }
    ], snapshot(c));
  }

  /* A surface drawn when its event plays, so it shows the case after the
     state changes earlier in the same run. */
  function live(kind, c) {
    if (kind === 'report') return reportSurface(c);
    if (kind === 'blockers') return blockerSurface(c);
    var next = D.nextOf(c);
    var act = /^(Affirm|Draft)/.test(next) ? { name: 'run_prompt', label: 'Draft the letter', context: { prompt: 'Draft the letter' } } : null;
    return nextSurface(sentence(next), act);
  }

  /* the one open question on a case travels with every report until it is answered */
  function ask(b, c) {
    var key = ASO.flows.openQuestion(c);
    if (key) b.text('One question only you can answer.').surface(ASO.flows.questionSurface(key, c));
    return b;
  }

  /* ── any case ───────────────────────────────────────────────────── */
  function catchup(t) {
    var c = caseOf(t);
    var brief = ASO.flows.brief(c);
    var b = S.builder(t.id);
    if (brief.reads.length) b.step('Reading new chart documents', brief.reads);
    b.step('Checking criteria against policy', [
      { name: 'match_policy_criteria', args: { 'case': c.id }, result: c.order.length ? D.tallyText(c) : 'No policy confirmed', ms: 720 }
    ]);
    b.text(brief.text).surface(reportSurface(c));
    return end(ask(b, c));
  }

  function report(t) {
    var c = caseOf(t);
    var b = S.builder(t.id)
      .step('Checking criteria against policy', [
        { name: 'match_policy_criteria', args: { 'case': c.id }, result: c.order.length ? D.tallyText(c) : 'No policy confirmed', ms: 680 }
      ])
      .surface(reportSurface(c));
    return end(ask(b, c));
  }

  function blockers(t) {
    var c = caseOf(t);
    var list = D.blockersOf(c);
    var b = S.builder(t.id)
      .step('Listing open items', [{ name: 'list_blockers', args: { 'case': c.id }, result: list.length + ' open' }])
      .text(list.length ? (list.length === 1 ? 'One thing is' : list.length + ' things are') + ' in the way.' : 'Nothing is blocking this case from my side.')
      .surface(blockerSurface(c));
    return end(ask(b, c));
  }

  function evidence(t) {
    var c = caseOf(t);
    var refs = [];
    c.order.forEach(function (id) {
      var k = c.criteria[id];
      (k.cites && k.cites.length ? k.cites : (k.doc ? [{ doc: k.doc, page: k.page }] : [])).forEach(function (x) { refs.push(x); });
    });
    var none = D.openCriteria(c).concat(c.order.map(function (id) { return c.criteria[id]; }).filter(function (k) { return k.deferred && k.state !== 'met'; }));
    var b = S.builder(t.id).step('Collecting cited sources', [
      { name: 'list_citations', args: { 'case': c.id }, result: plural(refs.length, 'cited passage') }
    ]);
    if (!refs.length) return end(b.text('No document supports a criterion on this case yet.'));
    b.text('These are the passages the criteria rest on. Open one to read the source.').surface(docsSurface(refs));
    if (none.length) {
      b.text(plural(none.length, 'criterion') + (none.length === 1 ? ' has' : ' have') + ' no source that meets the policy: ' +
        none.map(function (k) { return k.sec; }).join(', ') + '. I will not fill that from memory or from what was said in clinic.');
    }
    return end(b);
  }

  /* ── gates, drafting, signing, submitting: the agent asks, the surgeon acts ── */
  function draft(t) {
    var c = caseOf(t);
    var L = ASO.host.composeLetter(c);
    var om = L.omitted.length;
    var n = L.cited.length;
    return end(S.builder(t.id)
      .step('Assembling cited claims', [
        { name: 'collect_claims', args: { 'case': c.id }, result: n + ' with sources, ' + om + ' omitted', ms: 760 },
        { name: 'check_citations', args: { letter: 'v1' }, result: 'Every sentence carries a document, page and date', ms: 640 }
      ])
      .state([{ op: 'replace', path: '/letter/version', value: 1 }])
      .text('Draft v1 is open beside the chat. ' + n + (n === 1 ? ' claim cites' : ' claims cite') + ' the chart.' +
        (om ? ' ' + om + (om === 1 ? ' criterion is' : ' criteria are') + ' left out because the chart has no source that meets the policy. The letter lists each one with the reason.' : '') +
        ' Read it, then sign it yourself.')
      .custom('aso.host', { action: 'letter_ready' }));
  }

  function gateRequest(t, lead) {
    var c = caseOf(t);
    var open = D.openCriteria(c);
    return S.builder(t.id)
      .step('Checking drafting gates', [{ name: 'check_gates', args: { 'case': c.id }, result: '0 of 4 affirmed' }])
      .text((lead || '') + 'Policy, governing section, pathway and operative plan each need your affirmation, and I can’t give it for you.' +
        (open.length ? ' Note that ' + open.map(function (k) { return k.sec; }).join(' and ') + (open.length === 1 ? ' has' : ' have') + ' no source that meets the policy. If you go ahead, the letter lists ' + (open.length === 1 ? 'it' : 'them') + ' as not asserted.' : ''))
      .interrupt({ id: 'gates', reason: 'gate_affirmation_required' });
  }

  function notReady(t, verb) {
    var c = caseOf(t);
    var b = S.builder(t.id);
    if (c.phase === 'intake' || !c.order.length) {
      b.text('I can’t ' + verb + ' yet. No payer policy is confirmed for this case, so there is nothing to cite against.');
      return end(ask(b, c));
    }
    return end(ask(b.text('I can’t ' + verb + ' yet. Evidence is still being assembled, and ' +
      plural(D.openCriteria(c).length, 'criterion') + ' ' + (D.openCriteria(c).length === 1 ? 'has' : 'have') + ' no source on file.')
      .surface(blockerSurface(c)), c));
  }

  function draftRequest(t) {
    var c = caseOf(t);
    if (c.letter.version) {
      return end(S.builder(t.id)
        .text('Letter v' + c.letter.version + ' is already ' + (c.letter.signed ? 'signed' : 'drafted') + '. Opening it beside the chat.')
        .custom('aso.host', { action: 'show_letter' }));
    }
    if (c.phase) return notReady(t, 'draft');
    if (!c.gates.affirmed) return gateRequest(t, 'I can’t draft yet. ');
    return draft(t);
  }

  function gatesAsked(t) {
    var c = caseOf(t);
    if (c.gates.affirmed) {
      return end(S.builder(t.id).text('The four gates were affirmed by ' + D.user.name + ' on ' + c.gates.at + '. Opening the record.')
        .custom('aso.host', { action: 'open_record', kind: 'gates' }));
    }
    if (c.phase) return notReady(t, 'raise the gates');
    return gateRequest(t, '');
  }

  function signAsked(t) {
    var c = caseOf(t);
    if (!c.letter.version) return draftRequest(t);
    return end(S.builder(t.id)
      .text(c.letter.signed ? 'Letter v' + c.letter.version + ' was signed on ' + c.letter.signedAt + '. Opening it.'
        : 'Signing is yours. The letter is open beside the chat: read it, then use Approve and sign.')
      .custom('aso.host', { action: 'show_letter' }));
  }

  function submitAsked(t) {
    var c = caseOf(t);
    if (c.submission) {
      return end(S.builder(t.id).text('This case was submitted on ' + c.submission.at + ', confirmation ' + c.submission.ref + '. Opening the receipt.')
        .custom('aso.host', { action: 'open_record', kind: 'receipt' }));
    }
    if (!c.letter.signed) {
      return end(S.builder(t.id).text('There is nothing to submit yet. The order is fixed: you affirm the four gates, I draft, you sign, then the packet is yours to submit.')
        .surface(nextSurface(sentence(D.nextOf(c)))));
    }
    return S.builder(t.id).text('The packet is in the conversation. Submitting it is yours to do, not mine.')
      .custom('aso.host', { action: 'packet' }).finish();
  }

  function afterSubmit(t) {
    var c = caseOf(t);
    return end(S.builder(t.id)
      .step('Filing the receipt', [{ name: 'file_receipt', args: { 'case': c.id, ref: c.submission.ref }, result: 'Receipt filed to the case' }])
      .text('The receipt is on file: confirmation ' + c.submission.ref + '. The case is with ' + D.payerName(c) + ' now, and I have set a follow-up for ' + ASO.fmtDate(c.due) +
        '. I will not guess the outcome. When a determination arrives, attach it with + and I will read it.'));
  }

  function openRecord(t, kind) {
    var c = caseOf(t);
    var R = ASO.records;
    if (kind === 'gate') kind = 'gates';
    if (kind === 'packet' && c.letter.signed && !c.submission) return submitAsked(t);
    if (!R.has(c, kind)) return end(S.builder(t.id).text(R.missing(c, kind)).surface(nextSurface(sentence(D.nextOf(c)))));
    return end(S.builder(t.id).text('Opening the ' + R.label(kind) + ' beside the chat.')
      .custom('aso.host', { action: 'open_record', kind: kind }));
  }

  /* anything else: nearest chart passages inside this case, or say what is needed */
  function caseSearch(t, text) {
    var c = caseOf(t);
    var hits = ASO.search.query(text, { caseId: c.id, kind: 'Chart', limit: 4 });
    if (!hits.length) {
      return end(S.builder(t.id)
        .step('Searching this case', [{ name: 'vector_search', args: { scope: c.id, query: text.slice(0, 48) }, result: 'Nothing above the similarity floor', ms: 600 }])
        .text('I need a little more to go on. Nothing filed on this case is close to that, and I will not answer from outside the chart. Try naming a symptom, a document or a criterion, or pick one of these.'));
    }
    return end(S.builder(t.id)
      .step('Searching this case', [
        { name: 'vector_search', args: { scope: c.id, query: text.slice(0, 48) }, result: plural(hits.length, 'passage') + ' above the similarity floor', ms: 640 }
      ])
      .text('These are the closest passages in this case. Open one to read the source.')
      .surface(docsSurface(hits.map(function (x) { return { doc: x.doc, page: x.page }; }))));
  }

  function caseMatch(t, text, docs) {
    var q = text.toLowerCase();
    var F = ASO.flows;
    if (docs && docs.length) return F.ingest(t, docs[0]);
    var rec = q.match(/\b(letter|packet|receipt|brief|determination|outcome|gates?|statement|request)\b/);
    if (/^(open|show|view|see)\b/.test(q) && rec) return openRecord(t, rec[1]);
    if (/appeal/.test(q)) return F.appeal(t);
    if (/peer|p2p|talking point/.test(q)) return F.p2p(t);
    if (/deni|determination|decision/.test(q)) return F.determination(t);
    if (/payer status|portal|heard|any news|check .*status/.test(q)) return F.payerStatus(t);
    if (/submit/.test(q)) return submitAsked(t);
    if (/\bsign/.test(q)) return signAsked(t);
    if (/gate|affirm/.test(q)) return gatesAsked(t);
    if (/draft|letter/.test(q)) return draftRequest(t);
    if (/staff|maya|request|obtain/.test(q)) return F.staff(t);
    if (/policy|governs|applies/.test(q)) return F.policy(t);
    if (/evidence|sources|documents|records|chart/.test(q)) return evidence(t);
    if (/block|waiting|missing|need/.test(q)) return blockers(t);
    if (/catch|brief me|up to date|update me|summar/.test(q)) return catchup(t);
    if (/criteria|status|report|check|where|stand/.test(q)) return report(t);
    return caseSearch(t, text);
  }

  ASO.runs = {
    surface: surface, sentence: sentence, plural: plural, end: end, suggest: suggest, ask: ask,
    contextSurface: contextSurface, caseItem: caseItem, caseRows: caseRows, dueSurface: dueSurface,
    docsSurface: docsSurface, nextSurface: nextSurface, blockerSurface: blockerSurface, reportSurface: reportSurface, live: live,
    draft: draft, afterSubmit: afterSubmit, caseMatch: caseMatch
  };
})(window);
