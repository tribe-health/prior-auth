/* ASO patient chat · what differs from case to case.
   · the one question the agent may put to the surgeon, and what each answer does
   · what an attached document changes (a criterion moves only when a document
     is filed, never because of something the surgeon said)
   · staff requests, the payer's answer, the peer-to-peer and an appeal
   · the prompts offered after each answer
   An answer from the surgeon is recorded as the surgeon's statement. It is
   never turned into chart evidence. Outcomes are read from a filed document
   or recorded by the surgeon; the agent does not predict them. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var D = ASO.data;
  var S = ASO.stream;
  var R = ASO.runs;

  function caseOf(t) { return D.cases[t.caseId]; }
  function now() { return D.today + ' ' + ASO.clock(); }
  function met(c) { return c.order.filter(function (id) { return c.criteria[id].state === 'met'; }).length; }

  /* ── prompts offered for the context in view ────────────────────── */
  var CASE_PROMPTS = {
    intake: ['Catch me up', 'Which policy applies?', 'What’s blocking?'],
    evidence: ['Catch me up', 'What’s missing?', 'Ask staff for records'],
    policy_review: ['Catch me up', 'What’s blocking?', 'Draft the letter'],
    awaiting_gate: ['Draft the letter', 'Show the evidence', 'Catch me up'],
    drafting: ['Open the letter', 'What’s blocking?', 'Catch me up'],
    ready: ['Open the packet', 'Open the letter', 'Catch me up'],
    submitted: ['Check payer status', 'Open the receipt', 'Catch me up'],
    peer_review: ['Prep peer-to-peer', 'What did the denial cite?', 'Catch me up'],
    approved: ['Open the determination', 'Show the evidence', 'Catch me up'],
    denied: ['What would an appeal need?', 'Open the brief', 'Catch me up']
  };
  function promptsFor(t) {
    if (!t || t.scope.kind === 'global') return ['What’s due this week?', 'What’s waiting on me?', 'Who is missing a lab result?'];
    if (t.scope.kind === 'patient') return ['Summarize the chart', 'List the cases', 'Open a new case'];
    var c = caseOf(t);
    var list = CASE_PROMPTS[D.statusOf(c)] || CASE_PROMPTS.policy_review;
    if (D.statusOf(c) === 'drafting' && !c.letter.version) list = ['Draft the letter', 'Show the evidence', 'Catch me up'];
    return list;
  }

  /* ── the opening line of a catch-up, by where the case stands ───── */
  function brief(c) {
    var payer = D.payerName(c);
    var st = D.statusOf(c);
    var untouched = c.id === 'PA-2026-0431' && c.conflicts.side && !c.conflicts.side.resolved && c.criteria.pt.state !== 'met' && !c.gates.affirmed;
    if (untouched) {
      return { reads: [
        { name: 'read_document', args: { doc: 'EXAM-0924', pages: 'p.1–3' }, result: 'Pain 7/10, functional limits, operative plan' },
        { name: 'read_document', args: { doc: 'RAD-1341-A', pages: 'p.1' }, result: 'Right L5 root contact at L4–L5' },
        { name: 'read_document', args: { doc: 'LAB-0926', pages: 'p.1' }, result: 'Cotinine negative' }
      ], text: 'Three documents were filed since your consult on September 24: your signed exam note, the radiologist’s addendum and the cotinine result. The criteria now stand at ' + D.tallyText(c).replace(/ · /g, ', ') + '.' };
    }
    var text = {
      intake: 'This case is at intake. No payer policy is confirmed yet, so there are no criteria to check.',
      evidence: 'Evidence is still being assembled. ' + met(c) + ' of ' + c.order.length + ' criteria have a source in the chart.',
      policy_review: 'Here is where this case stands against the policy.',
      awaiting_gate: 'Every criterion I can check is met from the chart. The four gates are waiting on you.',
      drafting: c.letter.version ? 'The gates are affirmed and letter v' + c.letter.version + ' is drafted. It is waiting for your signature.' : 'The gates are affirmed. I can draft when you ask.',
      ready: 'Letter v' + c.letter.version + ' is signed. The packet is ready, and submitting it is yours.',
      submitted: c.submission ? 'Submitted on ' + c.submission.at + ', confirmation ' + c.submission.ref + '. ' +
        (c.detDoc && D.docs[c.detDoc].unfiled ? 'A determination letter arrived today and is not filed. Attach it with + and I will read it.' : 'No determination is on file yet.') : '',
      peer_review: payer + ' did not approve this request, citing ' + D.openCriteria(c).map(function (k) { return k.sec; }).join(', ') + '. The peer-to-peer is on ' + (c.peer ? c.peer.when : '') + '.',
      approved: (c.closed ? 'This case is closed. ' : '') + 'Approved on ' + c.outcomeAt + '. Its documents stay in the patient’s chart for any later case.',
      denied: 'The denial was upheld on ' + c.outcomeAt + '. The case stays open only if you appeal.'
    }[st];
    return { reads: [], text: text };
  }

  /* ── the one open question ──────────────────────────────────────── */
  function openQuestion(c) {
    if (c.outcome) return null;
    if (c.conflicts.side && !c.conflicts.side.resolved) return 'side';
    if (c.phase === 'intake') return c.answers.policy ? null : 'policy';
    if (c.policyDoc === 'HUM-0528-012' && c.criteria.cons && c.criteria.cons.state !== 'met' && !c.answers.prior_care) return 'prior_care';
    if (c.peer && !c.answers.pt_stop) return 'pt_stop';
    return null;
  }

  var NOTE = 'Clinical reasoning, optional. Recorded as your statement.';
  function questionSurface(key, c) {
    var p = D.patientOf(c);
    var pol = D.policyFor(c);
    var def = {
      side: { ask: 'She reported new left calf symptoms on September 24. Does that change the operative plan?',
        basis: 'The plan and codes are right-sided L4–L5. If the plan changes, every criterion is checked again.',
        doc: 'EXAM-0924', page: 2, noteLabel: NOTE,
        options: [{ value: 'unchanged', label: 'Plan unchanged: right L4–L5' }, { value: 'revise', label: 'I am revising the plan' }] },
      policy: { ask: 'Which payer policy governs this case?',
        basis: pol ? 'The closest policy in the library for ' + D.payerName(c) + ' is ' + pol.name + ', on ' + pol.topic + '. I matched it on the payer alone, so nothing is checked until you confirm it.'
          : 'No policy in the library matches this payer.',
        doc: pol ? pol.doc : null, page: 1,
        options: (pol ? [{ value: 'confirm', label: 'Use ' + pol.name }] : []).concat([{ value: 'staff', label: 'Not the right policy: ask staff to match it' }]) },
      prior_care: { ask: 'Has ' + p.first + ' had supervised therapy or injections anywhere that is not in this chart?',
        basis: 'The policy asks for 12 weeks of conservative care. The referral says there has been none so far. If care happened elsewhere, staff can request the records.',
        doc: 'REF-0920', page: 1, noteLabel: NOTE,
        options: [{ value: 'elsewhere', label: 'Yes, at another clinic: request the records' }, { value: 'none', label: 'No, none so far' }] },
      pt_stop: { ask: 'Why did supervised therapy stop at 4 weeks?',
        basis: 'The reviewer will ask. Your answer goes into the brief as your statement. It does not change §1(b).',
        doc: 'PT-0828', page: 2, noteLabel: NOTE,
        options: [{ value: 'deficit', label: 'A worsening foot drop made further therapy unsafe' }, { value: 'other', label: 'Another reason, explained in my note' }] }
    }[key];
    def.id = key;
    def.component = 'ChoiceQuestion';
    def.answer = { path: '/answer' };
    return R.surface([{ id: 'root', component: 'Column', children: [key] }, def], { answer: null });
  }

  function staffSurface(items) {
    return R.surface([
      { id: 'root', component: 'Column', children: ['req'] },
      { id: 'req', component: 'StaffRequest', to: D.coordinator.name, role: D.coordinator.role, items: items, status: { path: '/status' } }
    ], { status: { sent: false } });
  }
  function staffItems(c) {
    if (c.staffItems) return c.staffItems;
    return c.order.map(function (id) { return c.criteria[id]; })
      .filter(function (k) { return k.state !== 'met' && /staff/i.test(k.owner || ''); })
      .map(function (k) { return 'Obtain a source for ' + k.sec + ' ' + k.name + ' and file it to the chart.'; });
  }
  function statement(id, title, text) {
    return { op: 'add', path: '/statements/' + id, value: { title: title, text: text, at: D.today } };
  }

  /* ── answers ────────────────────────────────────────────────────── */
  var ANSWER = {
    side: function (t, c, x) {
      if (x.value !== 'unchanged') {
        return R.end(S.builder(t.id).text('A revised plan means every criterion is checked again against the new operation and codes. Tell me the revised procedure and I will open it as a new case, so this one keeps its record. Until then the question stays open.'));
      }
      var said = 'The patient reported new left calf symptoms on 2026-09-24. The operative plan is unchanged: right L4–L5.' + (x.note ? ' ' + x.note : '');
      var b = S.builder(t.id)
        .step('Recording surgeon statement', [{ name: 'record_statement', args: { 'case': c.id, author: D.user.name }, result: 'Saved as a surgeon statement, ' + D.today }])
        .state([
          { op: 'replace', path: '/conflicts/side/resolved', value: true },
          { op: 'replace', path: '/conflicts/side/statement', value: said },
          statement('side', 'Surgeon statement: left calf', said)
        ])
        .text('Recorded as your statement, dated today. In the letter it is attributed to you, not to the chart.');
      b.text(c.criteria.pt.state !== 'met'
        ? 'Two things are still open. The PT weeks are one short, and Northgate’s records came in by fax this morning but are not filed: attach them with + and I will read them. There is also no HbA1c result on file. That one is for staff.'
        : 'One thing is still open: there is no HbA1c result on file. That one is for staff.');
      if (!c.staffRequest.sent) b.surface(staffSurface(staffItems(c)));
      return R.end(b);
    },

    policy: function (t, c, x) {
      var pol = D.policyFor(c);
      if (x.value !== 'confirm' || !pol) {
        return R.end(S.builder(t.id)
          .state([{ op: 'add', path: '/answers/policy', value: 'staff' }])
          .text('Left unconfirmed. Nothing is checked until a policy is confirmed, so the case stays at intake. This is what I would ask ' + D.coordinator.first + ' for.')
          .surface(staffSurface(['Match the payer policy for “' + c.title + '” and bring it back for the surgeon to confirm.'])));
      }
      var set = D.criteriaFromPolicy(c);
      var n = set.order.length;
      var have = set.order.filter(function (id) { return set.criteria[id].state === 'met'; }).length;
      var missing = set.order.map(function (id) { return set.criteria[id]; }).filter(function (k) { return k.state !== 'met'; });
      var b = S.builder(t.id)
        .step('Matching criteria to the chart', [
          { name: 'load_policy', args: { policy: pol.name }, result: R.plural(n, 'criterion') },
          { name: 'match_policy_criteria', args: { 'case': c.id }, result: have + ' of ' + n + ' supported by filed documents', ms: 720 }
        ])
        .state([
          { op: 'add', path: '/answers/policy', value: 'confirm' },
          { op: 'replace', path: '/policy', value: pol.name }, { op: 'replace', path: '/policyEff', value: pol.eff },
          { op: 'replace', path: '/policyDoc', value: pol.doc },
          { op: 'replace', path: '/criteria', value: set.criteria }, { op: 'replace', path: '/order', value: set.order },
          { op: 'replace', path: '/phase', value: missing.length ? 'evidence' : null }
        ])
        .text('Confirmed by you. ' + pol.name + ' sets ' + n + ' criteria. ' +
          (have ? have + (have === 1 ? ' already has' : ' already have') + ' a source, because the chart belongs to the patient and earlier cases filed those documents. ' : '') +
          (missing.length ? missing.length + (missing.length === 1 ? ' still needs' : ' still need') + ' a document.' : 'Every one has a source.'))
        .custom('aso.surface', { kind: 'report' });
      if (missing.length) {
        b.surface(staffSurface(missing.map(function (k) { return 'Obtain a source for ' + k.sec + ' ' + k.name + ' and file it to the chart.'; })));
      }
      return R.end(b);
    },

    prior_care: function (t, c, x) {
      var b = S.builder(t.id).step('Recording surgeon statement', [{ name: 'record_statement', args: { 'case': c.id, author: D.user.name }, result: 'Saved as a surgeon statement, ' + D.today }]);
      var tail = x.note ? ' ' + x.note : '';
      if (x.value === 'elsewhere') {
        return R.end(b.state([
          { op: 'add', path: '/answers/prior_care', value: 'elsewhere' },
          { op: 'replace', path: '/nextNote', value: 'Staff: obtain the outside therapy records' },
          statement('prior_care', 'Surgeon statement: prior care', 'Conservative care was given at another clinic. Records are being requested.' + tail)
        ])
          .text('Recorded as your statement. It does not change §3.3: that criterion stays VOID until the records themselves are on file. This is the request I would send.')
          .surface(staffSurface(['Request therapy and injection records from the outside clinic and file them to the chart.'])));
      }
      return R.end(b.state([
        { op: 'add', path: '/answers/prior_care', value: 'none' },
        { op: 'replace', path: '/nextNote', value: 'Start conservative care, or draft with §3.3 not asserted' },
        statement('prior_care', 'Surgeon statement: prior care', 'No supervised therapy or injections to date.' + tail)
      ])
        .text('Recorded as your statement. Then §3.3 cannot be met today. The policy asks for 12 weeks unless bladder or bowel dysfunction or progressive weakness is documented, and the exam note of September 29 records neither.')
        .surface(R.docsSurface([{ doc: 'HUM-0528-012', page: 4 }, { doc: 'EXAM-0929', page: 1 }]))
        .text('There are two honest paths and the choice is yours: start supervised conservative care and come back to this case, or go ahead now with §3.3 listed as not asserted. I will not word around it.'));
    },

    pt_stop: function (t, c, x) {
      var said = (x.value === 'deficit' ? 'Supervised therapy was stopped at 4 weeks because a worsening left foot drop made further therapy unsafe.' : 'Supervised therapy was stopped at 4 weeks.') + (x.note ? ' ' + x.note : '');
      return S.builder(t.id)
        .step('Recording surgeon statement', [{ name: 'record_statement', args: { 'case': c.id, author: D.user.name }, result: 'Saved as a surgeon statement, ' + D.today }])
        .state([
          { op: 'add', path: '/answers/pt_stop', value: x.value },
          statement('pt_stop', 'Surgeon statement: why therapy stopped', said),
          { op: 'replace', path: '/briefAt', value: now() }
        ])
        .text('Recorded as your statement, dated today. It goes into the brief in your name. It does not change §1(b): the record still shows 4 of 6 weeks, and that criterion stays GAP whatever the reviewer decides.')
        .custom('aso.host', { action: 'record_card', kind: 'brief' })
        .text('After the call, record the outcome below. That is yours to record; I will not guess it.')
        .interrupt({ id: 'p2p_outcome', reason: 'surgeon_records_outcome' });
    }
  };

  function onAnswer(t, a) {
    var x = a.context;
    var c = caseOf(t);
    if (!c || !ANSWER[x.question]) { ASO.composer.hint('That question belongs to another case. Set that case as the context first.'); return; }
    var open = openQuestion(c) === x.question || (x.question === 'policy' && c.phase === 'intake');
    var keepOpen = x.question === 'side' && x.value !== 'unchanged';
    if (!keepOpen) ASO.a2ui.patch(a.surfaceId, '/answer', { label: x.label, note: x.note, at: ASO.clock() });
    if (!open) return;   /* a second copy of an answered question only locks; it never records twice */
    ASO.thread.addUser(t, x.label + (x.note ? '\n' + x.note : ''));
    ASO.thread.run(t, ANSWER[x.question](t, c, x));
  }

  /* ── staff ──────────────────────────────────────────────────────── */
  function staff(t) {
    var c = caseOf(t);
    var b = S.builder(t.id);
    if (c.staffRequest.sent) {
      return R.end(b.text('A request went to ' + D.coordinator.name + ' on ' + c.staffRequest.at + '. Opening it. Nothing changes on the criteria until a document is filed.')
        .custom('aso.host', { action: 'open_record', kind: 'request' }));
    }
    var items = staffItems(c);
    if (!items.length) return R.end(b.text('Nothing on this case needs staff right now.').surface(R.nextSurface(R.sentence(D.nextOf(c)))));
    return R.end(b.text('This is what I would ask ' + D.coordinator.first + ' for. Send it if you agree.').surface(staffSurface(items)));
  }

  function staffSent(t, x) {
    var c = caseOf(t);
    var a1c = c.criteria.a1c && c.criteria.a1c.state !== 'met';
    return R.end(S.builder(t.id)
      .state([{ op: 'replace', path: '/staffRequest', value: { sent: true, at: now(), items: x.items || [] } }])
      .text('Sent to ' + D.coordinator.first + '. ' + (a1c
        ? '§4.2(c) HbA1c stays VOID until a result is on file. If you draft before then, the letter lists it as not asserted.'
        : 'Nothing changes on the criteria until a document is filed, and I will say so when one arrives.')));
  }

  /* ── attached documents: the only way a criterion moves ─────────── */
  var INGEST = [
    { ok: function (c, d) { return d.id === 'NGPT-0424' && c.id === 'PA-2026-0431' && c.criteria.pt.state !== 'met'; },
      run: function (t, c, d) {
        var b = S.builder(t.id)
          .step('Reading Northgate Physical Therapy records', [
            { name: 'file_document', args: { doc: d.id }, result: '4 pages hashed, filed and embedded' },
            { name: 'read_document', args: { doc: d.id, pages: 'p.1–4' }, result: '6 sessions, 2026-04-06 to 04-24' },
            { name: 'match_policy_criteria', args: { section: '§4.1(b)' }, result: '8 documented weeks, 6 required', ms: 700 }
          ])
          .state([
            { op: 'replace', path: '/criteria/pt/state', value: 'met' },
            { op: 'replace', path: '/criteria/pt/evidence', value: '8 weeks: 2026-02-11 to 03-18, and 2026-04-06 to 04-24.' },
            { op: 'add', path: '/criteria/pt/cites', value: [{ doc: 'PT-0318', page: 1 }, { doc: 'NGPT-0424', page: 1 }] }
          ])
          .text('Northgate documents 6 supervised in-person sessions from April 6 to April 24: three weeks. With the February to March ledger that is 8 documented weeks in the last 12 months, so §4.1(b) is met from the records, not from what she told you.');
        if (c.letter.version) return R.end(b.text('Letter v' + c.letter.version + ' was written before this arrived and does not cite it. A second version is not part of this prototype.'));
        return R.end(openQuestion(c) ? R.ask(b, c) : b.custom('aso.surface', { kind: 'next' }));
      } },
    { ok: function (c, d) { return c.criteria.img && c.criteria.img.fixDoc === d.id && c.criteria.img.state !== 'met'; },
      run: function (t, c, d) {
        var b = S.builder(t.id)
          .step('Reading the outside MRI report', [
            { name: 'file_document', args: { doc: d.id }, result: d.pages + ' pages hashed, filed and embedded' },
            { name: 'read_document', args: { doc: d.id, pages: 'p.1–2' }, result: 'Severe central stenosis, L3–L4 and L4–L5' },
            { name: 'match_policy_criteria', args: { section: c.criteria.img.sec }, result: 'Stenosis at both operative levels', ms: 700 }
          ])
          .state([
            { op: 'replace', path: '/criteria/img/state', value: 'met' },
            { op: 'replace', path: '/criteria/img/evidence', value: 'Outside MRI of 2026-08-14: severe central stenosis at L3–L4 and L4–L5.' },
            { op: 'replace', path: '/criteria/img/doc', value: d.id }, { op: 'replace', path: '/criteria/img/page', value: 2 },
            { op: 'remove', path: '/criteria/img/cite' }, { op: 'replace', path: '/phase', value: null }
          ])
          .text('The report shows severe central canal stenosis at L3–L4 and L4–L5, the levels in your plan, so ' + c.criteria.img.sec + ' is met from the record. That leaves conservative care, where the chart has nothing.');
        return R.end(openQuestion(c) ? R.ask(b, c) : b.custom('aso.surface', { kind: 'next' }));
      } },
    { ok: function (c, d) { return c.detDoc === d.id && !!c.submission && !c.outcome; },
      run: function (t, c, d) {
        var approved = /^Approved/.test(d.text[1]);
        var b = S.builder(t.id)
          .step('Reading the determination letter', [
            { name: 'file_document', args: { doc: d.id }, result: d.pages + (d.pages === 1 ? ' page' : ' pages') + ' hashed, filed and embedded' },
            { name: 'read_document', args: { doc: d.id, pages: 'p.1' }, result: approved ? 'Approved, with an authorization number' : 'Not approved' }
          ]);
        if (!approved) return R.end(b.text('The letter does not approve the request. It says: ' + d.text[1]).surface(R.docsSurface([d.id])));
        return R.end(b.state([
          { op: 'replace', path: '/outcome', value: 'approved' }, { op: 'replace', path: '/outcomeAt', value: D.today },
          { op: 'replace', path: '/due', value: null }
        ])
          .text(D.payerName(c) + ' approved the request. I am reading this from the letter, which is now filed against the case: ' + d.text[1].replace(/ Synthetic\.$/, ''))
          .surface(R.docsSurface([d.id])));
      } }
  ];

  function ingest(t, d) {
    var c = caseOf(t);
    var hit = INGEST.filter(function (x) { return x.ok(c, d); })[0];
    if (hit) return hit.run(t, c, d);
    return R.end(S.builder(t.id)
      .step('Filing to the patient chart', [
        { name: 'file_document', args: { doc: d.id }, result: d.pages + ' pages hashed, filed and embedded' },
        { name: 'match_policy_criteria', args: { 'case': c.id }, result: 'No criterion changed', ms: 640 }
      ])
      .text('Filed ' + d.id + ' to the chart, so any case for this patient can cite it. I read it against this case and it does not change a criterion here.')
      .surface(R.docsSurface([d.id])));
  }

  /* ── policy, payer, determination ───────────────────────────────── */
  function policy(t) {
    var c = caseOf(t);
    var b = S.builder(t.id);
    if (c.phase === 'intake' || !c.policyDoc) {
      return R.end(b.text('No policy is confirmed on this case yet.').surface(questionSurface('policy', c)));
    }
    var d = D.docs[c.policyDoc];
    return R.end(b.step('Reading the payer policy', [{ name: 'load_policy', args: { policy: c.policy }, result: d.pages + ' pages, ' + c.order.length + ' criteria matched' }])
      .text(D.payerName(c) + ' ' + c.policy + ', ' + c.policyEff + '. These are the sections the criteria come from.')
      .surface(R.docsSurface(Object.keys(d.text).map(function (pg) { return { doc: c.policyDoc, page: Number(pg) }; }))));
  }

  function payerStatus(t) {
    var c = caseOf(t);
    var b = S.builder(t.id);
    if (!c.submission) return R.end(b.text('Nothing has been submitted on this case, so there is no payer status to check.').surface(R.nextSurface(R.sentence(D.nextOf(c)))));
    var waiting = c.detDoc && D.docs[c.detDoc].unfiled;
    b.step('Checking the payer portal', [
      { name: 'check_portal_status', args: { ref: c.submission.ref }, result: c.outcome ? 'Determination on file' : (waiting ? 'Determination posted today' : (c.peer ? 'Not approved. Peer-to-peer scheduled' : 'In review. No determination posted')), ms: 900 }
    ]);
    if (c.outcome) b.text('The portal shows this case as ' + D.statusLabelOf(c).toLowerCase() + '.');
    else if (waiting) b.text('The portal shows a determination posted today. The letter is in the inbox but not filed. Attach it with + and I will read it. I won’t report what it says until it is in the chart.');
    else if (c.peer) b.text('The portal shows the request as not approved, with a peer-to-peer on ' + c.peer.when + '.');
    else b.text('Still in review with ' + D.payerName(c) + '. Confirmation ' + c.submission.ref + ', received ' + c.submission.at + '. Nothing new has been posted, and I have no basis to say which way it will go.');
    return R.end(b.custom('aso.host', { action: 'record_card', kind: 'receipt' }));
  }

  function determination(t) {
    var c = caseOf(t);
    var d = c.detDoc ? D.docs[c.detDoc] : null;
    var b = S.builder(t.id);
    if (d && d.unfiled) return R.end(b.text('A determination letter from ' + D.payerName(c) + ' arrived today and is not filed. Attach it with + and I will read it. I won’t report what it says until it is in the chart.'));
    if (!d) {
      if (c.peer && c.peer.outcome) return R.end(b.text('There is no written determination yet. What is on file is your record of the peer-to-peer.').custom('aso.host', { action: 'open_record', kind: 'outcome' }));
      return R.end(b.text('No determination is on file for this case. ' + (c.submission ? 'It was submitted on ' + c.submission.at + '.' : 'It has not been submitted.')));
    }
    var page = Number(Object.keys(d.text)[0]);
    return R.end(b.step('Reading the determination letter', [{ name: 'read_document', args: { doc: c.detDoc, pages: 'p.' + page }, result: d.title + ', ' + d.date }])
      .text('The letter of ' + d.date + ' says: ' + d.text[page].replace(/ Synthetic\.$/, ''))
      .surface(R.docsSurface([{ doc: c.detDoc, page: page }])));
  }

  /* ── peer-to-peer and appeal ────────────────────────────────────── */
  function cites(k) { return k.cites && k.cites.length ? k.cites : (k.doc ? [{ doc: k.doc, page: k.page }] : []); }
  function briefPoints(c) {
    var pts = [];
    var ks = c.order.map(function (id) { return c.criteria[id]; });
    ks.filter(function (k) { return k.state !== 'met'; }).forEach(function (k) {
      pts.push({ text: 'Name the gap before the reviewer does. ' + k.sec + ': ' + k.evidence, cites: cites(k).concat(c.detDoc ? [{ doc: c.detDoc, page: 1 }] : []) });
    });
    if (c.policyDoc === 'CP-0303') {
      pts.push({ text: 'Policy §2 sets §1(b) aside when a progressive motor deficit is documented. The therapist recorded a worsening foot drop, and dorsiflexion was 4/5 on September 2.',
        cites: [{ doc: 'CP-0303', page: 3 }, { doc: 'PT-0828', page: 2 }, { doc: 'EXAM-0902', page: 1 }] });
    }
    ks.filter(function (k) { return k.state === 'met' && k.claim; }).forEach(function (k) { pts.push({ text: k.sec + ' ' + k.claim, cites: cites(k) }); });
    return pts;
  }

  function p2p(t) {
    var c = caseOf(t);
    var payer = D.payerName(c);
    var b = S.builder(t.id);
    if (!c.peer) {
      return R.end(b.text(c.outcome ? 'This case is ' + D.statusLabelOf(c).toLowerCase() + ', so there is no peer-to-peer to prepare.'
        : 'No denial is on file, so there is no peer-to-peer to prepare. If ' + payer + ' declines and offers one, I will build the talking points from the cited criteria.'));
    }
    b.step('Preparing the peer-to-peer', [
      { name: 'read_document', args: { doc: c.detDoc, pages: 'p.1' }, result: 'Denial cites ' + D.openCriteria(c).map(function (k) { return k.sec; }).join(', ') },
      { name: 'load_policy', args: { policy: c.policy }, result: 'Criteria and exceptions read' },
      { name: 'collect_claims', args: { 'case': c.id }, result: met(c) + ' with sources', ms: 700 }
    ])
      .text((c.peer.outcome ? 'The call is done. This is the brief you took into it.' : 'The call with the ' + c.peer.reviewer + ' is on ' + c.peer.when + '. These are the points in the order I would raise them, each with its source.'))
      .surface(R.surface([
        { id: 'root', component: 'Column', children: ['s-pts', 's-not'] },
        { id: 's-pts', component: 'Section', title: 'Talking points', children: ['pts'] },
        { id: 'pts', component: 'PointList', items: { path: '/points' } },
        { id: 's-not', component: 'Section', title: 'What I will not say for you', children: ['not'] },
        { id: 'not', component: 'Text', text: 'Whether the deficit is progressive is your clinical judgment. The unmet criterion stays as the record shows it, whatever the reviewer decides, and I have no basis for the odds.' }
      ], { points: briefPoints(c) }));
    if (c.peer.outcome) return R.end(b);
    if (!c.answers.pt_stop) return R.end(R.ask(b, c));
    return b.custom('aso.host', { action: 'record_card', kind: 'brief' })
      .text('After the call, record the outcome below. That is yours to record; I will not guess it.')
      .interrupt({ id: 'p2p_outcome', reason: 'surgeon_records_outcome' });
  }

  function appealBody(b, c) {
    b.surface(R.surface([
      { id: 'root', component: 'Column', children: ['s-need'] },
      { id: 's-need', component: 'Section', title: 'What an appeal needs', children: ['need'] },
      { id: 'need', component: 'BlockerList', items: { path: '/items' } }
    ], { items: [
      { text: 'New evidence on the criterion the denial cites, or a written argument that the policy exception applies.', owner: 'Surgeon' },
      { text: 'A second letter version that cites your peer-to-peer statement.', owner: 'Surgeon' },
      { text: 'The appeal deadline from the denial letter, on the calendar.', owner: 'Staff' }
    ] })).text('Drafting the appeal letter itself is not part of this prototype.');
    if (!c.staffRequest.sent) b.surface(staffSurface(['Confirm the appeal deadline in the denial letter and put it on the calendar.']));
    return R.end(b);
  }
  function appeal(t) {
    var c = caseOf(t);
    var b = S.builder(t.id);
    if (c.outcome !== 'denied') {
      return R.end(b.text(c.peer ? 'There is nothing to appeal yet. The peer-to-peer on ' + c.peer.when + ' comes first.' : 'There is no upheld denial on this case, so there is nothing to appeal.'));
    }
    return appealBody(b.text('An appeal is a written argument with its own deadline. From the record, this is what it would need.'), c);
  }

  function afterOutcome(t) {
    var c = caseOf(t);
    var b = S.builder(t.id).step('Recording the call outcome', [{ name: 'record_outcome', args: { 'case': c.id, author: D.user.name }, result: 'Saved as the surgeon’s record, ' + D.today }]);
    if (c.outcome === 'approved') {
      return R.end(b.text('Recorded: the reviewer overturned the denial, and the case is marked approved as of today on your word. That is your record of the call, not a payer document. When the written determination arrives, attach it with + and I will file it against the case.'));
    }
    return appealBody(b.text('Recorded: the denial was upheld. The case stays open only if you appeal, and that decision is yours.'), c);
  }

  ASO.flows = {
    promptsFor: promptsFor, brief: brief, openQuestion: openQuestion, questionSurface: questionSurface, onAnswer: onAnswer,
    staff: staff, staffSent: staffSent, ingest: ingest, policy: policy, payerStatus: payerStatus, determination: determination,
    p2p: p2p, briefPoints: briefPoints, appeal: appeal, afterOutcome: afterOutcome
  };
})(window);
