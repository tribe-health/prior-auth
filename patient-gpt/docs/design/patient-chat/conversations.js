/* ASO patient chat · conversations and their scope.
   A conversation is scoped the way ChatGPT scopes a chat to a project:
     global  · no patient selected, every patient in scope
     patient · the whole chart, across every case
     case    · one authorization
   Opening a context gives an empty draft. The first message commits it to
   that scope's history. Setting context from inside a conversation moves the
   same conversation to the new scope. Seeded history is synthetic. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var h = ASO.h;
  var D = ASO.data;

  var all = {};
  var drafts = {};
  var counter = 100;

  function normalize(scope) {
    if (scope.kind === 'case') {
      var c = D.cases[scope.caseId];
      return { kind: 'case', caseId: c.id, patientId: c.patientId };
    }
    if (scope.kind === 'patient') return { kind: 'patient', patientId: scope.patientId, caseId: null };
    return { kind: 'global', patientId: null, caseId: null };
  }

  function key(s) {
    return s.kind === 'case' ? 'c:' + s.caseId : s.kind === 'patient' ? 'p:' + s.patientId : 'global';
  }

  function make(scope, id) {
    var s = normalize(scope);
    var c = {
      id: id || ASO.uid('chat'), scope: s, caseId: s.caseId, patientId: s.patientId,
      title: 'New chat', when: 'Today', order: 0, draft: true,
      el: h('div', { class: 'thread' }), busy: false, player: null, agent: null,
      text: '', muted: false, seed: null, awaiting: null
    };
    all[c.id] = c;
    return c;
  }

  /* one reusable empty conversation per context, until something is sent */
  function draftFor(scope) {
    var k = key(normalize(scope));
    if (!drafts[k] || !drafts[k].draft) drafts[k] = make(scope);
    return drafts[k];
  }

  function titleFrom(text) {
    var t = String(text).replace(/\s+/g, ' ').trim().replace(/[?.!]+$/, '');
    if (t.length > 52) t = t.slice(0, 52).replace(/\s+\S*$/, '');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'New chat';
  }

  function touch(c) {
    counter += 1;
    c.order = counter;
    c.when = 'Today';
  }

  function commit(c, text) {
    if (!c.draft) return;
    c.draft = false;
    c.title = titleFrom(text);
    touch(c);
  }

  function rescope(c, scope) {
    var s = normalize(scope);
    c.scope = s;
    c.caseId = s.caseId;
    c.patientId = s.patientId;
    c.awaiting = null;
  }

  function committed() {
    return Object.keys(all).map(function (id) { return all[id]; }).filter(function (c) { return !c.draft; });
  }

  function list(kind, id) {
    return committed().filter(function (c) {
      if (c.scope.kind !== kind) return false;
      if (kind === 'patient') return c.scope.patientId === id;
      if (kind === 'case') return c.scope.caseId === id;
      return true;
    }).sort(function (a, b) { return b.order - a.order; });
  }

  /* seeded transcripts are drawn the first time a history row is opened */
  function ensure(c) {
    if (!c.seed) return c;
    var build = c.seed;
    c.seed = null;
    c.muted = true;
    build(c);
    c.muted = false;
    return c;
  }

  function seed(id, scope, title, when, order, turns) {
    var c = make(scope, id);
    c.draft = false;
    c.title = title;
    c.when = when;
    c.order = order;
    c.text = title + '. ' + turns.map(function (t) { return t.user + ' ' + (t.says || []).join(' '); }).join(' ');
    c.seed = function (conv) {
      ASO.thread.divider(conv, when);
      turns.forEach(function (turn) {
        ASO.thread.addUser(conv, turn.user);
        var b = ASO.stream.builder(conv.id);
        (turn.says || []).forEach(function (line) { b.text(line); });
        if (turn.surface) b.surface(turn.surface());
        ASO.thread.run(conv, b.finish(), { instant: true });
      });
    };
  }

  /* ── synthetic history at each scope ────────────────────────────── */
  seed('h-g1', { kind: 'global' }, 'What is due this week', 'Sep 29', 12, [{
    user: 'What is due this week?',
    says: ['Open cases, nearest deadline first. Choose one to continue inside that case.'],
    surface: function () { return ASO.runs.dueSurface(); }
  }]);
  seed('h-g2', { kind: 'global' }, 'Which BCBS cases are open', 'Sep 25', 8, [{
    user: 'Which BCBS cases are open?',
    says: ['Two BCBS TX cases are open: Renata Kaminski’s fusion, which is not submitted, and Priya Raman’s arthroplasty, submitted on September 30.'],
    surface: function () { return ASO.runs.caseRows(['PA-2026-0431', 'PA-2026-0398']); }
  }]);
  seed('h-p1', { kind: 'patient', patientId: 'kaminski' }, 'Has she had injections before', 'Sep 22', 6, [{
    user: 'Has she had injections before?',
    says: ['One is on file: a right L4–L5 transforaminal epidural steroid injection on March 10, authorized under PA-2026-0212. The follow-up note records about two weeks of relief, then a return to baseline.'],
    surface: function () { return ASO.runs.docsSurface(['ESI-0310']); }
  }]);
  seed('h-c1', { kind: 'case', caseId: 'PA-2026-0431' }, 'What is still open after the consult', 'Sep 24', 7, [{
    user: 'What is still open after the consult?',
    says: ['Consult capture closed. Three things you could not settle in the room: the July MRI addendum, an HbA1c from the last 90 days, and Northgate’s PT records. The labs are ordered and staff has both record requests.']
  }]);
  seed('h-c2', { kind: 'case', caseId: 'PA-2026-0431' }, 'Which policy governs this', 'Sep 22', 5, [{
    user: 'Which policy governs this?',
    says: ['BCBS TX medical policy SURG-2026-014 rev. 4, effective July 1. Section 4.1 sets the four criteria for decompression with fusion, and section 4.2(c) adds the fusion risk factors.'],
    surface: function () { return ASO.runs.docsSurface(['SURG-2026-014']); }
  }]);
  seed('h-c3', { kind: 'case', caseId: 'PA-2026-0419' }, 'What did the denial cite', 'Sep 30', 13, [{
    user: 'What did the denial cite?',
    says: ['The denial cites §1(b): 4 of 6 weeks of conservative care documented. Therapy stopped for a worsening foot drop, and the PT notes record that.']
  }]);
  seed('h-c4', { kind: 'case', caseId: 'PA-2026-0398' }, 'Was the packet received', 'Sep 30', 14, [{
    user: 'Was the packet received?',
    says: ['The packet was submitted on September 30 and the receipt acknowledges 4 of 4 items. No determination was on file that day.'],
    surface: function () { return ASO.runs.docsSurface(['SUB-0930']); }
  }]);
  seed('h-c5', { kind: 'case', caseId: 'PA-2026-0212' }, 'Was the injection approved', 'Mar 2', 3, [{
    user: 'Was the injection approved?',
    says: ['Approved on March 2. The injection was done on March 10, and the procedure note stays in the chart for any later case.'],
    surface: function () { return ASO.runs.docsSurface(['ESI-0310']); }
  }]);
  seed('h-c6', { kind: 'case', caseId: 'PA-2026-0447' }, 'Is this ready for my gates', 'Oct 1', 15, [{
    user: 'Is this ready for my gates?',
    says: ['All three criteria are met from the chart: the motor deficit, ten weeks of supervised therapy with one epidural, and imaging at the right level and side. The four gates are waiting on you.'],
    surface: function () { return ASO.runs.docsSurface(['EXAM-0918', 'PT-0811', { doc: 'RAD-1502', page: 2 }]); }
  }]);
  seed('h-c7', { kind: 'case', caseId: 'PA-2026-0452' }, 'Where is the outside MRI', 'Sep 30', 10, [{
    user: 'Where is the outside MRI?',
    says: ['Not in the file. The referral says one was done in August but the report was not enclosed, so the imaging criterion is VOID. Staff has the request.'],
    surface: function () { return ASO.runs.docsSurface(['REF-0920']); }
  }]);

  /* patient-level history: questions that span the whole chart, not one case */
  seed('h-p2', { kind: 'patient', patientId: 'delgado' }, 'Any nicotine use on file', 'Sep 19', 9, [{
    user: 'Any nicotine use on file?',
    says: ['The exam note of September 18 records non-smoker. No lab result in the chart addresses it.'],
    surface: function () { return ASO.runs.docsSurface([{ doc: 'EXAM-0918', page: 2 }]); }
  }]);
  seed('h-p3', { kind: 'patient', patientId: 'brennan' }, 'What conservative care is documented', 'Sep 28', 11, [{
    user: 'What conservative care is documented?',
    says: ['Eight supervised PT sessions over four weeks from July 28. Therapy stopped on August 28 for a worsening left foot drop. Nothing else is on file.'],
    surface: function () { return ASO.runs.docsSurface(['PT-0828', { doc: 'PT-0828', page: 2 }]); }
  }]);
  seed('h-p4', { kind: 'patient', patientId: 'vasquez' }, 'What is missing from the chart', 'Oct 1', 16, [{
    user: 'What is missing from the chart?',
    says: ['Two things: the outside lumbar MRI named in the referral, and any therapy or injection records. The referral itself says there has been no therapy or injection so far.'],
    surface: function () { return ASO.runs.docsSurface(['REF-0920']); }
  }]);
  seed('h-p5', { kind: 'patient', patientId: 'raman' }, 'What does the chart hold', 'Sep 16', 4, [{
    user: 'What does the chart hold?',
    says: ['Three clinical documents: the September 15 exam note, the PT ledger and the cervical MRI.'],
    surface: function () { return ASO.runs.docsSurface(['EXAM-0915', 'PT-0825', 'RAD-1480']); }
  }]);

  ASO.convos = {
    get: function (id) { return all[id] || null; },
    draftFor: draftFor, commit: commit, touch: touch, rescope: rescope,
    list: list, committed: committed, ensure: ensure
  };
})(window);
