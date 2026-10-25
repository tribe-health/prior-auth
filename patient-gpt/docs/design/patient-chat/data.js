/* ASO patient chat · synthetic practice data.
   Every patient, document, policy and identifier here is invented for the
   prototype. Renata Kaminski and PA-2026-0431 continue the consult-capture
   prototype. Model: a patient owns the chart; a case is one authorization.
   Every case carries the same working record (gates, letter, staff request,
   submission, outcome), so its state, next move and blockers are always
   derived from that record and can never disagree. Chart and policy
   documents live in data-docs.js. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};

  var D = ASO.data = {
    today: '2026-10-02',
    user: { name: 'Dr. K. James', sign: 'K. James, MD', initials: 'KJ', role: 'Surgeon' },
    coordinator: { name: 'Maya Ortiz', first: 'Maya', role: 'Prior authorization coordinator' },

    patients: [
      { id: 'kaminski', name: 'Renata Kaminski', first: 'Renata', dob: '1971-03-14', mrn: 'ASO-104482',
        payer: 'BCBS TX · PPO', member: 'ZGP 8841 20317', cases: ['PA-2026-0431', 'PA-2026-0212'], inbox: ['NGPT-0424'] },
      { id: 'delgado', name: 'Marcus Delgado', first: 'Marcus', dob: '1964-11-02', mrn: 'ASO-101937',
        payer: 'Aetna · Open Access', member: 'W 2290 41865', cases: ['PA-2026-0447'], inbox: [] },
      { id: 'brennan', name: 'Odalys Brennan', first: 'Odalys', dob: '1983-06-27', mrn: 'ASO-106210',
        payer: 'Cigna · OAP', member: 'U 7731 09254', cases: ['PA-2026-0419'], inbox: [] },
      { id: 'vasquez', name: 'Theo Vasquez', first: 'Theo', dob: '1958-01-19', mrn: 'ASO-099804',
        payer: 'Humana · Gold Plus HMO', member: 'H 5512 63380', cases: ['PA-2026-0452'], inbox: ['OMRI-0814'] },
      { id: 'raman', name: 'Priya Raman', first: 'Priya', dob: '1976-09-08', mrn: 'ASO-103355',
        payer: 'BCBS TX · PPO', member: 'ZGP 6120 77491', cases: ['PA-2026-0398'], inbox: ['DET-1002'] }
    ],

    /* the payer policy library used when a new case is opened */
    policies: {
      'BCBS TX': { name: 'SURG-2026-014 rev. 4', doc: 'SURG-2026-014', eff: 'effective 2026-07-01', topic: 'lumbar spinal fusion', like: 'PA-2026-0431' },
      Aetna: { name: 'CPB 0743', doc: 'CPB-0743', eff: 'effective 2026-01-15', topic: 'cervical spinal fusion', like: 'PA-2026-0447' },
      Cigna: { name: 'CP 0303', doc: 'CP-0303', eff: 'effective 2026-03-01', topic: 'lumbar discectomy', like: 'PA-2026-0419' },
      Humana: { name: 'HUM-0528-012', doc: 'HUM-0528-012', eff: 'effective 2026-02-01', topic: 'lumbar laminectomy', like: 'PA-2026-0452' }
    },

    cases: {
      'PA-2026-0431': {
        id: 'PA-2026-0431', patientId: 'kaminski',
        title: 'L4–L5 decompression and fusion',
        procedure: 'Right L4–L5 decompression with instrumented fusion',
        codes: '63047 · 22633 · 22853', payer: 'BCBS TX · PPO',
        policy: 'SURG-2026-014 rev. 4', policyEff: 'effective 2026-07-01', policyDoc: 'SURG-2026-014',
        due: '2026-10-06', dueKind: 'Submit by',
        order: ['pain', 'pt', 'func', 'img', 'nic', 'a1c'],
        criteria: {
          pain: { sec: '§4.1(a)', name: 'Radicular pain above 5/10', state: 'met',
            evidence: '7/10 on 2026-09-24, 8/10 at night. Earlier reading: 5/10 on 2026-07-22.', doc: 'EXAM-0924', page: 1,
            claim: 'Ms. Kaminski reports right leg radicular pain of 7/10, rising to 8/10 at night.' },
          pt: { sec: '§4.1(b)', name: '6 weeks supervised PT in the last 12 months', state: 'gap',
            evidence: '9 sessions, 2026-02-11 to 03-18: 5 weeks.', doc: 'PT-0318', page: 1,
            blocker: '5 of 6 required weeks documented. Northgate’s records arrived by fax today and are not filed.', owner: 'Surgeon or staff',
            fixDoc: 'NGPT-0424', fix: 'Attach the Northgate fax with +',
            claim: 'She completed 8 weeks of supervised, in-person physical therapy in the last 12 months without improvement.' },
          func: { sec: '§4.1(c)', name: 'Functional impairment documented', state: 'met',
            evidence: 'Sits about 20 minutes, stops at mailbox distance, missed 6 shifts since August 2026.', doc: 'EXAM-0924', page: 2,
            claim: 'She tolerates sitting for about 20 minutes, stops walking at mailbox distance and has missed 6 work shifts since August 2026.' },
          img: { sec: '§4.1(d)', name: 'Imaging matches level and side', state: 'met',
            evidence: 'Addendum of 2026-07-25: right L4–L5 lateral recess stenosis contacting the right L5 root.', doc: 'RAD-1341-A', page: 1,
            claim: 'Imaging shows right L4–L5 lateral recess stenosis contacting the traversing right L5 root, matching the level and side of the planned operation.' },
          nic: { sec: '§4.2(c)', name: 'Nicotine abstinence documented', state: 'met',
            evidence: 'Serum cotinine negative on 2026-09-26.', doc: 'LAB-0926', page: 1,
            claim: 'Serum cotinine on 2026-09-26 was negative.' },
          a1c: { sec: '§4.2(c)', name: 'HbA1c below 8.0% within 90 days', state: 'void', deferred: true,
            evidence: 'No HbA1c result on file since 2025. Ordered 2026-09-24.', cite: 'no source',
            blocker: 'No HbA1c result on file. Ordered 2026-09-24.', owner: 'Staff' }
        },
        conflicts: {
          side: { kind: 'Clinical clarification needed',
            text: 'The plan is a right-sided L4–L5 operation. On 2026-09-24 she reported new left calf symptoms over the past month.',
            doc: 'EXAM-0924', page: 2, resolved: false, statement: null,
            next: 'Answer the left-calf question',
            blocker: 'Left calf symptoms reported on 2026-09-24 are not reconciled with the right-sided plan.',
            gateWhy: 'Answer the left-calf question first. A changed plan changes this gate.' }
        },
        gateDefs: [
          { name: 'Policy', what: 'BCBS TX SURG-2026-014 rev. 4, effective 2026-07-01', doc: 'SURG-2026-014', page: 1 },
          { name: 'Governing section', what: '§4.1 lumbar decompression with fusion, and §4.2(c) fusion risk factors', doc: 'SURG-2026-014', page: 6 },
          { name: 'Pathway', what: 'Decompression with instrumented fusion, not decompression alone', doc: 'EXAM-0924', page: 3 },
          { name: 'Operative plan', what: 'Right L4–L5 decompression with instrumented fusion · CPT 63047 · 22633 · 22853', doc: 'EXAM-0924', page: 3, needs: 'side' }
        ],
        staffItems: ['Obtain the HbA1c result ordered on 2026-09-24 and file it to the chart.']
      },
      'PA-2026-0212': {
        id: 'PA-2026-0212', patientId: 'kaminski', closed: true,
        title: 'L4–L5 epidural steroid injection',
        procedure: 'Right L4–L5 transforaminal epidural steroid injection',
        codes: '64483', payer: 'BCBS TX · PPO', policy: 'INJ-2025-031 rev. 2', policyEff: 'effective 2025-11-01', policyDoc: 'INJ-2025-031',
        due: null,
        order: ['rad', 'cons'],
        criteria: {
          rad: { sec: '§2.1', name: 'Radicular pain in a dermatomal pattern', state: 'met', evidence: 'Right L5 distribution documented on 2026-02-18.', doc: 'PAIN-0218', page: 1,
            claim: 'Ms. Kaminski has right leg radicular pain in an L5 distribution.' },
          cons: { sec: '§2.2', name: '4 weeks of conservative care', state: 'met', evidence: 'Medication and home exercise from 2026-01-12, supervised PT from 2026-02-11.', doc: 'PAIN-0218', page: 2,
            claim: 'She has had more than 4 weeks of conservative care: medication and a home exercise program since 2026-01-12, and supervised physical therapy since 2026-02-11.' }
        },
        gates: { affirmed: true, at: '2026-02-24 10:48' },
        letter: { version: 1, signed: true, signedAt: '2026-02-24 11:05', date: '2026-02-24', content: null },
        submission: { at: '2026-02-25 09:30', ref: 'TX-PA-88102277' },
        outcome: 'approved', outcomeAt: '2026-03-02', detDoc: 'DET-0302'
      },
      'PA-2026-0447': {
        id: 'PA-2026-0447', patientId: 'delgado',
        title: 'C5–C6 ACDF', procedure: 'C5–C6 anterior cervical discectomy and fusion',
        codes: '22551 · 22853', payer: 'Aetna · Open Access', policy: 'CPB 0743', policyEff: 'effective 2026-01-15', policyDoc: 'CPB-0743',
        due: '2026-10-03', dueKind: 'Submit by',
        order: ['rad', 'cons', 'img'],
        criteria: {
          rad: { sec: '§A.1', name: 'Cervical radiculopathy with motor deficit', state: 'met', evidence: 'Right C6 weakness 4/5 on 2026-09-18.', doc: 'EXAM-0918', page: 1,
            claim: 'Mr. Delgado has right C6 radiculopathy with wrist extension and biceps strength of 4/5.' },
          cons: { sec: '§A.2', name: '6 weeks of conservative care', state: 'met', evidence: 'PT and one epidural, 2026-06-02 to 08-11.', doc: 'PT-0811', page: 1,
            claim: 'He completed 10 weeks of supervised physical therapy and one cervical epidural steroid injection without lasting relief.' },
          img: { sec: '§A.3', name: 'Imaging matches level and side', state: 'met', evidence: 'MRI 2026-08-20: right C5–C6 foraminal stenosis.', doc: 'RAD-1502', page: 2,
            claim: 'MRI of 2026-08-20 shows right C5–C6 foraminal stenosis contacting the exiting right C6 root, matching the planned level and side.' }
        },
        gateDefs: [
          { name: 'Policy', what: 'Aetna CPB 0743, effective 2026-01-15', doc: 'CPB-0743', page: 1 },
          { name: 'Governing section', what: '§A anterior cervical discectomy and fusion for radiculopathy', doc: 'CPB-0743', page: 3 },
          { name: 'Pathway', what: 'Fusion, not disc arthroplasty', doc: 'EXAM-0918', page: 2 },
          { name: 'Operative plan', what: 'C5–C6 anterior cervical discectomy and fusion · CPT 22551 · 22853', doc: 'EXAM-0918', page: 2 }
        ]
      },
      'PA-2026-0419': {
        id: 'PA-2026-0419', patientId: 'brennan',
        title: 'L5–S1 microdiscectomy', procedure: 'Left L5–S1 microdiscectomy',
        codes: '63030', payer: 'Cigna · OAP', policy: 'CP 0303', policyEff: 'effective 2026-03-01', policyDoc: 'CP-0303',
        due: '2026-10-05', dueKind: 'Peer-to-peer',
        order: ['rad', 'cons', 'img'],
        criteria: {
          rad: { sec: '§1(a)', name: 'Radicular pain with positive straight leg raise', state: 'met', evidence: 'Left SLR positive at 40° on 2026-09-02.', doc: 'EXAM-0902', page: 1,
            claim: 'Ms. Brennan has left leg radicular pain with a positive straight leg raise at 40 degrees.' },
          cons: { sec: '§1(b)', name: '6 weeks of conservative care', state: 'gap', evidence: '4 weeks of PT documented, stopped for worsening foot drop.', doc: 'PT-0828', page: 2,
            blocker: '4 of 6 weeks documented. The denial cites this criterion.', owner: 'Surgeon' },
          img: { sec: '§1(c)', name: 'Imaging matches level and side', state: 'met', evidence: 'MRI 2026-08-30: left L5–S1 extrusion.', doc: 'RAD-1466', page: 1,
            claim: 'MRI of 2026-08-30 shows a left paracentral L5–S1 extrusion displacing the traversing left S1 root.' }
        },
        gates: { affirmed: true, at: '2026-09-17 09:12' },
        letter: { version: 1, signed: true, signedAt: '2026-09-17 09:40', date: '2026-09-17', content: null },
        submission: { at: '2026-09-18 10:05', ref: 'CG-PA-55120987' },
        peer: { when: 'October 5 at 14:30', reviewer: 'Cigna medical director' }, detDoc: 'DEN-0926'
      },
      'PA-2026-0452': {
        id: 'PA-2026-0452', patientId: 'vasquez', phase: 'evidence',
        title: 'L3–L5 laminectomy', procedure: 'L3–L5 lumbar laminectomy',
        codes: '63047 · 63048', payer: 'Humana · Gold Plus HMO', policy: 'HUM-0528-012', policyEff: 'effective 2026-02-01', policyDoc: 'HUM-0528-012',
        due: '2026-10-09', dueKind: 'Submit by',
        order: ['claud', 'img', 'cons'],
        criteria: {
          claud: { sec: '§3.1', name: 'Neurogenic claudication documented', state: 'met', evidence: 'Walks one block before leg heaviness, relieved by sitting.', doc: 'EXAM-0929', page: 1,
            claim: 'Mr. Vasquez walks about one block before both legs feel heavy, relieved by sitting or leaning forward.' },
          img: { sec: '§3.2', name: 'Imaging shows central stenosis', state: 'void', evidence: 'Outside MRI named in the referral is not in the file.', cite: 'no source',
            blocker: 'The outside MRI report arrived by fax today and is not filed.', owner: 'Staff',
            fixDoc: 'OMRI-0814', fix: 'Attach the outside MRI report with +',
            claim: 'An outside MRI of 2026-08-14 shows severe central canal stenosis at L3–L4 and L4–L5.' },
          cons: { sec: '§3.3', name: '12 weeks of conservative care', state: 'void', evidence: 'No therapy or injection records on file.', cite: 'no source',
            blocker: 'No conservative care records on file.', owner: 'Surgeon' }
        },
        nextNote: 'Answer the question on prior conservative care',
        staffItems: ['Ask the referring office whether any therapy or injection records exist, and request them if so.']
      },
      'PA-2026-0398': {
        id: 'PA-2026-0398', patientId: 'raman',
        title: 'C6–C7 disc arthroplasty', procedure: 'C6–C7 cervical disc arthroplasty',
        codes: '22856', payer: 'BCBS TX · PPO', policy: 'SURG-2026-009 rev. 2', policyEff: 'effective 2026-04-01', policyDoc: 'SURG-2026-009',
        due: '2026-10-12', dueKind: 'Follow up by',
        order: ['rad', 'cons', 'img'],
        criteria: {
          rad: { sec: '§3.1(a)', name: 'Single-level cervical radiculopathy', state: 'met', evidence: 'Left C7 distribution, triceps 4/5.', doc: 'EXAM-0915', page: 1,
            claim: 'Ms. Raman has single-level left C7 radiculopathy with triceps strength of 4/5.' },
          cons: { sec: '§3.1(b)', name: '6 weeks of conservative care', state: 'met', evidence: 'PT 2026-07-07 to 08-25.', doc: 'PT-0825', page: 1,
            claim: 'She completed 7 weeks of supervised physical therapy without lasting relief.' },
          img: { sec: '§3.1(c)', name: 'Imaging matches level and side', state: 'met', evidence: 'MRI 2026-09-01: left C6–C7 herniation.', doc: 'RAD-1480', page: 1,
            claim: 'MRI of 2026-09-01 shows a left C6–C7 disc herniation contacting the exiting left C7 root.' }
        },
        gates: { affirmed: true, at: '2026-09-29 16:02' },
        letter: { version: 1, signed: true, signedAt: '2026-09-29 16:20', date: '2026-09-29', content: null },
        submission: { at: '2026-09-30 14:12', ref: 'TX-PA-88390114' }, detDoc: 'DET-1002'
      }
    }
  };

  /* every case carries the same working record */
  function prep(c) {
    c.conflicts = c.conflicts || {};
    c.gates = c.gates || { affirmed: false, at: null };
    c.letter = c.letter || { version: 0, signed: false, signedAt: null, date: null, content: null };
    c.staffRequest = c.staffRequest || { sent: false, at: null };
    c.submission = c.submission || null;
    c.answers = c.answers || {};
    c.statements = c.statements || {};
    return c;
  }
  Object.keys(D.cases).forEach(function (id) { prep(D.cases[id]); });

  D.patient = function (id) {
    return D.patients.filter(function (p) { return p.id === id; })[0] || null;
  };
  D.patientOf = function (c) { return D.patient(c.patientId); };
  D.payerName = function (c) { return c.payer.split(' · ')[0]; };

  D.tally = function (c) {
    var t = { met: 0, gap: 0, 'void': 0 };
    c.order.forEach(function (id) { t[c.criteria[id].state] += 1; });
    return t;
  };
  D.tallyText = function (c) {
    var t = D.tally(c);
    return t.met + ' met · ' + t.gap + ' gap · ' + t['void'] + ' void';
  };

  D.openCases = function () {
    return Object.keys(D.cases).map(function (id) { return D.cases[id]; })
      .filter(function (c) { return !c.closed && !c.outcome; })
      .sort(function (a, b) { return (a.due || '9999').localeCompare(b.due || '9999'); });
  };
  D.nearestDue = function (p) {
    var dues = p.cases.map(function (id) { return D.cases[id]; })
      .filter(function (c) { return !c.closed && c.due; })
      .map(function (c) { return c.due; }).sort();
    return dues[0] || null;
  };
  D.filedDocs = function (patientId) {
    return Object.keys(D.docs).filter(function (id) { return D.docs[id].patientId === patientId && !D.docs[id].unfiled; })
      .sort(function (a, b) { return D.docs[b].date.localeCompare(D.docs[a].date); });
  };

  /* ── what is open on a case ─────────────────────────────────────── */
  D.openConflict = function (c) {
    var id = Object.keys(c.conflicts).filter(function (k) { return !c.conflicts[k].resolved; })[0];
    return id ? c.conflicts[id] : null;
  };
  /* criteria that are not met and not knowingly left for later */
  D.openCriteria = function (c) {
    return c.order.map(function (id) { return c.criteria[id]; })
      .filter(function (k) { return k.state !== 'met' && !k.deferred; });
  };
  function unfiled(docId) { return !!(docId && D.docs[docId] && D.docs[docId].unfiled); }

  /* ── case state machine: the product's case_statuses table, in order ── */
  D.STAGES = [
    { key: 'intake', label: 'Intake' },
    { key: 'evidence', label: 'Evidence assembly' },
    { key: 'policy_review', label: 'Policy review' },
    { key: 'awaiting_gate', label: 'Awaiting surgeon' },
    { key: 'drafting', label: 'Drafting' },
    { key: 'ready', label: 'Ready to submit' },
    { key: 'submitted', label: 'Submitted' },
    { key: 'peer_review', label: 'Peer-to-peer' }
  ];
  D.OUTCOMES = { approved: 'Approved', denied: 'Denied', withdrawn: 'Withdrawn' };

  /* Status is read off the working record, so the indicator moves as any case is worked. */
  D.statusOf = function (c) {
    if (c.outcome) return c.outcome;
    if (c.peer) return 'peer_review';
    if (c.submission) return 'submitted';
    if (c.letter.signed) return 'ready';
    if (c.gates.affirmed) return 'drafting';
    if (c.phase) return c.phase;
    if (D.openConflict(c) || D.openCriteria(c).length) return 'policy_review';
    return 'awaiting_gate';
  };
  D.stageInfo = function (c) {
    var key = D.statusOf(c);
    if (D.OUTCOMES[key]) {
      return { key: key, label: D.OUTCOMES[key], terminal: true, index: -1,
        filled: key === 'approved' ? D.STAGES.length : (key === 'denied' ? 7 : 0) };
    }
    var at = 0;
    D.STAGES.forEach(function (st, n) { if (st.key === key) at = n; });
    return { key: key, label: D.STAGES[at].label, terminal: false, index: at, filled: at };
  };

  D.nextOf = function (c) {
    if (c.outcome === 'approved') return c.closed ? 'Closed. The records stay in the chart for later cases' : 'Approved. Schedule the procedure';
    if (c.outcome === 'denied') return 'Decide on an appeal';
    if (c.peer) return c.answers.pt_stop ? 'Record the outcome after the call on ' + c.peer.when : 'Review talking points before the call';
    if (c.submission) return unfiled(c.detDoc) ? 'File the determination letter with +' : 'Awaiting determination from ' + D.payerName(c);
    if (c.letter.signed) return 'Submit the packet';
    if (c.letter.version) return 'Review and sign letter v' + c.letter.version;
    if (c.phase === 'intake') return 'Confirm the payer policy';
    var conf = D.openConflict(c);
    if (conf) return conf.next;
    var open = D.openCriteria(c);
    var fix = open.filter(function (k) { return unfiled(k.fixDoc); })[0];
    if (fix) return fix.fix;
    if (open.length && c.nextNote) return c.nextNote;
    if (c.phase === 'evidence') return 'Staff: obtain the missing records';
    if (!c.gates.affirmed) return 'Affirm the four gates';
    return 'Draft the letter';
  };

  D.blockersOf = function (c) {
    var out = [];
    if (c.outcome === 'denied') return [{ text: 'The denial was upheld on peer-to-peer review.', owner: 'Surgeon' }];
    if (c.outcome) return out;
    if (c.phase === 'intake') out.push({ text: 'No payer policy is confirmed for this procedure yet.', owner: 'Surgeon' });
    Object.keys(c.conflicts).forEach(function (id) {
      var x = c.conflicts[id];
      if (!x.resolved) out.push({ text: x.blocker || x.text, owner: 'Surgeon' });
    });
    c.order.forEach(function (id) {
      var k = c.criteria[id];
      if (k.state !== 'met') out.push({ text: k.sec + ': ' + (k.blocker || k.evidence), owner: k.owner || 'Staff' });
    });
    if (c.submission && unfiled(c.detDoc)) out.push({ text: 'A determination letter arrived today and is not filed.', owner: 'Surgeon or staff' });
    if (!c.submission && !c.phase && c.order.length && !c.gates.affirmed) out.push({ text: 'Four drafting gates are not affirmed.', owner: 'Surgeon' });
    return out;
  };

  D.statusLabelOf = function (c) {
    if (c.outcome === 'approved') return 'Approved ' + c.outcomeAt;
    if (c.outcome === 'denied') return 'Denial upheld ' + c.outcomeAt;
    if (c.peer) return 'Peer-to-peer scheduled';
    if (c.submission) return 'Submitted ' + c.submission.at.slice(0, 10);
    return D.stageInfo(c).label;
  };
  D.ownerOf = function (c) {
    if (c.outcome) return 'none';
    if (c.peer) return 'surgeon';
    if (c.submission) return unfiled(c.detDoc) ? 'surgeon' : 'payer';
    if (c.phase === 'evidence' && !D.openConflict(c) && !c.nextNote) return 'staff';
    return 'surgeon';
  };

  D.sync = function () {
    Object.keys(D.cases).forEach(function (id) {
      var c = D.cases[id];
      c.next = D.nextOf(c);
      c.owner = D.ownerOf(c);
      c.statusLabel = D.statusLabelOf(c);
    });
  };

  /* ── opening a case: intake, then the policy is confirmed by the surgeon ── */
  D.policyFor = function (c) { return D.policies[D.payerName(c)] || null; };

  var nextNo = 458;
  D.createCase = function (patientId, text) {
    var p = D.patient(patientId);
    var id = 'PA-2026-0' + nextNo;
    nextNo += 1;
    var title = text.replace(/\s+/g, ' ').trim().slice(0, 90);
    D.cases[id] = prep({
      id: id, patientId: patientId, fresh: true, phase: 'intake',
      title: title, procedure: title, codes: null, payer: p.payer, policy: null, policyEff: null, policyDoc: null,
      due: null, order: [], criteria: {}
    });
    p.cases.unshift(id);
    D.sync();
    return D.cases[id];
  };

  /* The confirmed policy's criteria, checked against documents already in the
     patient's chart: a criterion is met only where a filed document supports it. */
  D.criteriaFromPolicy = function (c) {
    var pol = D.policyFor(c);
    var like = pol ? D.cases[pol.like] : null;
    var order = [];
    var criteria = {};
    if (!like) return { order: order, criteria: criteria };
    like.order.forEach(function (kid) {
      var k = like.criteria[kid];
      var d = k.doc ? D.docs[k.doc] : null;
      var carried = k.state === 'met' && d && d.patientId === c.patientId && !d.unfiled;
      order.push(kid);
      criteria[kid] = carried
        ? { sec: k.sec, name: k.name, state: 'met', evidence: k.evidence, doc: k.doc, page: k.page, claim: k.claim }
        : { sec: k.sec, name: k.name, state: 'void', evidence: 'No document in the chart addresses this yet.', cite: 'no source', owner: 'Staff' };
    });
    return { order: order, criteria: criteria };
  };
})(window);
