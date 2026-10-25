/* ASO patient chat · scripted agent runs, global and patient scope.
   Global: nothing is selected, every patient is in scope. Answers come from
   the case queue or from the simulated vector index, and can carry rows that
   set patient or case context, narrowing the same conversation.
   Patient: the whole chart across every case for one patient.
   When a request only makes sense inside one case (draft, sign, submit, a
   peer-to-peer), the agent asks which case and then carries the same request
   into it. When it cannot tell what is meant, it says what it needs.
   Case-scope runs live in runs.js and flows.js. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var D = ASO.data;
  var S = ASO.stream;
  var R = ASO.runs;

  var plural = R.plural;
  var CASE_ACT = /draft|letter|gate|affirm|\bsign|submit|packet|receipt|peer|p2p|appeal|attach|catch me up|block|criteria|determination/;

  function clip(s, n) { return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; }
  function hitLabel(hit) { return (hit.kind === 'Chart' ? hit.label : hit.kind + ' ' + hit.label) + ' · ' + hit.score.toFixed(2); }

  /* a request that belongs inside one case: ask which, and keep the request */
  function whichCase(t, ids, text, where) {
    t.pendingPrompt = text;
    return S.builder(t.id)
      .step('Working out the case', [{ name: 'list_cases', args: { scope: where }, result: plural(ids.length, 'case') }])
      .text(ids.length === 1
        ? 'That is something I do inside a case. There is one here. Choose it and I will carry on with the same request.'
        : 'That is something I do inside one case, and I can’t tell which you mean. Choose one and I will carry on there with the same request.')
      .surface(R.caseRows(ids))
      .finish();
  }

  function named(q) {
    return D.patients.filter(function (p) {
      return p.name.toLowerCase().split(' ').some(function (part) { return new RegExp('\\b' + part + '\\b').test(q); });
    })[0] || null;
  }

  /* ── global: all patients in scope ──────────────────────────────── */
  function due(t) {
    var open = D.openCases();
    return R.end(S.builder(t.id)
      .step('Reading the case queue', [{ name: 'list_cases', args: { status: 'open', scope: 'all patients' }, result: plural(open.length, 'open case') }])
      .text(plural(open.length, 'case') + (open.length === 1 ? ' is' : ' are') + ' open, nearest deadline first. Choose one to continue inside that case.')
      .surface(R.dueSurface()));
  }

  function waiting(t) {
    var open = D.openCases();
    var mine = open.filter(function (c) { return c.owner === 'surgeon'; });
    return R.end(S.builder(t.id)
      .step('Reading the case queue', [{ name: 'list_cases', args: { waiting_on: D.user.name }, result: mine.length + ' of ' + plural(open.length, 'open case') }])
      .text(mine.length ? (mine.length === 1 ? 'One case is' : mine.length + ' cases are') + ' waiting on you, nearest deadline first.' : 'Nothing is waiting on you.')
      .surface(R.contextSurface(mine.map(R.caseItem))));
  }

  function patientNamed(t, p, text, q) {
    if (CASE_ACT.test(q)) t.pendingPrompt = text;
    var rows = [{ patientId: p.id, caseId: null, title: p.name, sub: 'Whole chart · ' + p.payer, meta: plural(p.cases.length, 'case') }]
      .concat(p.cases.map(function (id) { return R.caseItem(D.cases[id]); }));
    return S.builder(t.id)
      .step('Finding the patient', [{ name: 'find_patient', args: { name: p.name }, result: p.mrn + ' · ' + plural(p.cases.length, 'case') }])
      .text('That is ' + p.name + '. Choose the whole chart or one case, and I will ' + (t.pendingPrompt ? 'carry on with the same request there.' : 'answer from there.'))
      .surface(R.contextSurface(rows))
      .finish();
  }

  function globalSearch(t, text) {
    var hits = ASO.search.query(text, { limit: 24 });
    var st = ASO.search.stats();
    var best = {};
    var order = [];
    hits.forEach(function (hit) {
      if (!hit.patientId || best[hit.patientId]) return;
      best[hit.patientId] = hit;
      order.push(hit.patientId);
    });
    var b = S.builder(t.id).step('Searching every chart', [
      { name: 'embed_query', args: { text: clip(text, 48) }, result: 'Query embedded (simulated)' },
      { name: 'vector_search', args: { scope: 'all patients', passages: st.passages }, result: plural(order.length, 'patient') + ' above the similarity floor', ms: 700 }
    ]);
    if (!order.length) {
      return R.end(b.text('I need a little more to go on. Nothing in the charts is close to that, and I will not answer from outside them. Name a patient, a symptom, a document type, a payer or a case number, or start from one of these.'));
    }
    return R.end(b.text('These charts hold the closest passages. Choose a patient to continue inside that chart.')
      .surface(R.contextSurface(order.slice(0, 5).map(function (pid) {
        var hit = best[pid];
        return { patientId: pid, caseId: null, title: D.patient(pid).name, sub: hit.show, meta: hitLabel(hit) };
      }))));
  }

  /* ── patient: the whole chart, across cases ─────────────────────── */
  function patientCases(t, p) {
    return R.end(S.builder(t.id)
      .step('Reading the patient record', [{ name: 'list_cases', args: { patient: p.name }, result: plural(p.cases.length, 'case') }])
      .text(p.name + ' has ' + plural(p.cases.length, 'case') + '. Choose one to continue inside it.')
      .surface(R.caseRows(p.cases)));
  }

  function patientChart(t, p) {
    var ids = D.filedDocs(p.id);
    var b = S.builder(t.id)
      .step('Reading the patient chart', [{ name: 'list_patient_documents', args: { patient: p.name }, result: plural(ids.length, 'document') + ' on file' }]);
    if (!ids.length) return R.end(b.text('No chart documents are on file for ' + p.name + ' yet.').surface(R.caseRows(p.cases)));
    var unfiled = p.inbox.length ? ' ' + plural(p.inbox.length, 'document') + (p.inbox.length === 1 ? ' is' : ' are') + ' waiting to be filed and ' + (p.inbox.length === 1 ? 'is' : 'are') + ' not counted. Open a case and attach ' + (p.inbox.length === 1 ? 'it' : 'them') + ' with +.' : '';
    return R.end(b.text('The chart holds ' + plural(ids.length, 'document') + ', newest first. They belong to the patient, so any case can cite them.' + unfiled)
      .surface(R.docsSurface(ids)));
  }

  function openCase(t, p, title) {
    var c = D.createCase(p.id, title);
    var ids = D.filedDocs(p.id);
    return S.builder(t.id)
      .step('Opening the case', [
        { name: 'create_case', args: { patient: p.name }, result: c.id + ', Intake' },
        { name: 'list_patient_documents', args: { patient: p.name }, result: ids.length + ' already in the chart' }
      ])
      .text('Opened ' + c.id + ' for ' + p.name + '. ' + (ids.length
        ? plural(ids.length, 'chart document') + ' from earlier cases ' + (ids.length === 1 ? 'is' : 'are') + ' already on file and carry over, so nothing has to be collected twice.'
        : 'The chart has no documents on file yet.'))
      .surface(R.contextSurface([R.caseItem(c)]))
      .text('It is at intake. Choose it to continue inside the case, and I will ask you to confirm the payer policy before I check anything.')
      .finish();
  }

  function patientSearch(t, p, text) {
    var hits = ASO.search.query(text, { patientId: p.id, limit: 10 });
    var b = S.builder(t.id).step('Searching the patient chart', [
      { name: 'embed_query', args: { text: clip(text, 48) }, result: 'Query embedded (simulated)' },
      { name: 'vector_search', args: { scope: p.name, cases: p.cases.length }, result: plural(hits.length, 'passage') + ' above the similarity floor', ms: 680 }
    ]);
    if (!hits.length) {
      return R.end(b.text('I need a little more to go on. Nothing in ' + p.first + '’s chart is close to that. Name a symptom, a document or a date, or start from one of these.'));
    }
    var docs = hits.filter(function (x) { return x.kind === 'Chart'; }).slice(0, 5).map(function (x) { return { doc: x.doc, page: x.page }; });
    var caseIds = [];
    hits.forEach(function (x) { if (x.caseId && caseIds.indexOf(x.caseId) < 0) caseIds.push(x.caseId); });
    b.text('The closest passages come from ' + plural(caseIds.length, 'case') + ' in this chart.');
    if (docs.length) b.surface(R.docsSurface(docs));
    return R.end(b.surface(R.caseRows(caseIds.slice(0, 3))));
  }

  function patientMatch(t, q, text) {
    var p = D.patient(t.patientId);
    if (t.awaiting === 'procedure') {
      t.awaiting = null;
      return openCase(t, p, text);
    }
    var m = text.match(/^\s*(?:please\s+)?(?:open|start|new|create)\b.*?\bcase\b\s*(?:for|:)?\s*(.*)$/i);
    if (m) {
      if (m[1].trim().length > 2) return openCase(t, p, m[1].trim());
      t.awaiting = 'procedure';
      return S.builder(t.id).text('Which procedure is the new case for? Give me the operation and level, for example “L5–S1 microdiscectomy”.').finish();
    }
    if (CASE_ACT.test(q)) return whichCase(t, p.cases, text, p.name);
    if (/\bcases?\b|status|deadline/.test(q)) return patientCases(t, p);
    if (/chart|document|summar|records/.test(q)) return patientChart(t, p);
    return patientSearch(t, p, text);
  }

  /* ── after a row sets context: the same conversation, narrower ──── */
  function contextSet(t) {
    var held = t.pendingPrompt;
    t.pendingPrompt = null;
    if (t.scope.kind === 'case') {
      if (held) return R.caseMatch(t, held, []);
      var c = D.cases[t.caseId];
      var b = S.builder(t.id)
        .step('Loading case context', [{ name: 'load_case_context', args: { 'case': c.id }, result: c.order.length ? D.tallyText(c) : 'No policy confirmed' }])
        .text('From here I answer inside ' + c.id + ', ' + c.title + '. The rest of the patient’s chart stays available to cite.');
      if (ASO.flows.openQuestion(c)) return R.end(R.ask(b, c));
      return R.end(b.surface(R.nextSurface(R.sentence(D.nextOf(c)), { name: 'run_prompt', label: 'Catch me up', context: { prompt: 'Catch me up' } })));
    }
    var p = D.patient(t.patientId);
    if (held) return patientMatch(t, held.toLowerCase(), held);
    var n = D.filedDocs(p.id).length;
    return R.end(S.builder(t.id)
      .step('Loading patient context', [{ name: 'load_patient_context', args: { patient: p.name }, result: plural(n, 'document') + ' · ' + plural(p.cases.length, 'case') }])
      .text('From here I answer from ' + p.name + '’s whole chart: ' + plural(n, 'document') + ' across ' + plural(p.cases.length, 'case') + '. Choose a case to narrow further.')
      .surface(R.caseRows(p.cases)));
  }

  function match(t, text, docs) {
    t.pendingPrompt = null;   /* a new message replaces any request that was waiting for a case */
    if (t.scope.kind === 'case') return R.caseMatch(t, text, docs);
    var q = text.toLowerCase();
    if (t.scope.kind === 'patient') return patientMatch(t, q, text);
    if (/waiting|on me\b|\bmine\b/.test(q)) return waiting(t);
    if (/\bdue\b|this week|deadline|queue/.test(q)) return due(t);
    var who = named(q);
    if (who) return patientNamed(t, who, text, q);
    if (CASE_ACT.test(q)) return whichCase(t, D.openCases().map(function (c) { return c.id; }), text, 'all patients');
    return globalSearch(t, text);
  }

  ASO.runs.match = match;
  ASO.runs.contextSet = contextSet;
})(window);
