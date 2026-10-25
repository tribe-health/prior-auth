/* ASO patient chat · simulated vector search.
   Stands in for a real embedding store. Every piece of content tied to a case
   is cut into passages: chart document pages, criteria evidence, letter
   claims and conversations. A passage is embedded as a small concept vector
   (clinical ideas, so "smoking" lands near "cotinine") plus a weak literal
   channel (so names, payers and case numbers still match). Ranking is cosine
   similarity. Deterministic and pure: no DOM, no network, no model. The
   index is rebuilt per query, so a newly filed document or a new chat is
   searchable at once. Unfiled documents are not embedded. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var D = ASO.data;

  var MIN_SCORE = 0.2;
  var LITERAL = 0.35;

  var CONCEPTS = {
    therapy: 'physical therapy pt therapist sessions session rehab rehabilitation supervised exercise conservative',
    injection: 'injection injections epidural steroid esi transforaminal shot',
    nicotine: 'nicotine cotinine smoking smoke smoker smokes tobacco vape vaping cigarette cigarettes abstinence quit',
    glucose: 'hba1c a1c diabetes diabetic glucose sugar glycemic',
    imaging: 'mri imaging ct myelogram radiology radiologist scan impression addendum stenosis herniation extrusion osteophyte',
    pain: 'pain radicular vas burning radiculopathy sciatica ache',
    'function': 'function functional sitting sits walking walk walks work shifts impairment tolerance claudication limits disability',
    surgery: 'fusion instrumented decompression laminectomy arthroplasty discectomy microdiscectomy acdf surgery surgical operation operative procedure',
    lumbar: 'lumbar l3 l4 l5 s1 back spine leg calf foot',
    cervical: 'cervical c5 c6 c7 neck arm triceps',
    policy: 'policy criteria criterion section necessary necessity coverage requirement requires required governs',
    denial: 'denial denied appeal peer reviewer determination overturn',
    submission: 'submitted submission receipt packet portal sent received',
    letter: 'letter draft drafted signed sign claim claims',
    lab: 'lab labs result results serum test blood ordered',
    weakness: 'weakness weak motor deficit drop strength',
    records: 'records record fax missing obtain outside request requested unfiled file'
  };
  var STOP = {};
  ('the a an of to and in on for is are was were with at by from this that it as be has had have not no she he her his ' +
    'their or what which who when where how does did do me my i you your any all about there than then into over per').split(' ')
    .forEach(function (w) { STOP[w] = 1; });

  var LEX = {};
  Object.keys(CONCEPTS).forEach(function (c) {
    CONCEPTS[c].split(' ').forEach(function (w) { LEX[w] = c; });
  });

  function embed(text) {
    var v = {};
    (String(text).toLowerCase().match(/[a-z0-9]+/g) || []).forEach(function (w) {
      if (STOP[w]) return;
      if (LEX[w]) v['c:' + LEX[w]] = (v['c:' + LEX[w]] || 0) + 1;
      if (w.length > 2 || /\d/.test(w)) v['w:' + w] = (v['w:' + w] || 0) + LITERAL;
    });
    Object.keys(v).forEach(function (k) { v[k] = Math.sqrt(v[k]); });
    return v;
  }

  function cosine(a, b) {
    var dot = 0, na = 0, nb = 0;
    Object.keys(a).forEach(function (k) {
      na += a[k] * a[k];
      if (b[k]) dot += a[k] * b[k];
    });
    Object.keys(b).forEach(function (k) { nb += b[k] * b[k]; });
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }

  /* which cases a chart document serves: the one that first used it, any that cite it, any governed by it */
  function casesFor(docId, d) {
    var ids = {};
    if (d.caseId) ids[d.caseId] = 1;
    Object.keys(D.cases).forEach(function (cid) {
      var c = D.cases[cid];
      if (d.policy && c.policyDoc === docId) ids[cid] = 1;
      c.order.forEach(function (kid) {
        var k = c.criteria[kid];
        if (k.doc === docId) ids[cid] = 1;
        (k.cites || []).forEach(function (x) { if (x.doc === docId) ids[cid] = 1; });
      });
    });
    return Object.keys(ids);
  }

  function passages() {
    var out = [];
    Object.keys(D.docs).forEach(function (id) {
      var d = D.docs[id];
      if (d.unfiled) return;
      casesFor(id, d).forEach(function (cid) {
        Object.keys(d.text).forEach(function (pg) {
          out.push({ kind: 'Chart', label: id + ' p.' + pg, text: d.title + '. ' + d.text[pg], show: d.text[pg],
            caseId: cid, patientId: D.cases[cid].patientId, doc: id, page: Number(pg) });
        });
      });
    });
    Object.keys(D.cases).forEach(function (cid) {
      var c = D.cases[cid];
      var p = D.patientOf(c);
      out.push({ kind: 'Case', label: cid,
        text: [p.name, c.title, c.procedure, c.payer, c.policy || '', c.statusLabel, c.codes || ''].join(' '),
        show: c.procedure + ' · ' + c.payer + ' · ' + c.statusLabel, caseId: cid, patientId: c.patientId });
      c.order.forEach(function (kid) {
        var k = c.criteria[kid];
        out.push({ kind: 'Criterion', label: k.sec + ' · ' + k.state.toUpperCase(), text: k.name + '. ' + k.evidence,
          show: k.name + '. ' + k.evidence, caseId: cid, patientId: c.patientId });
      });
      if (c.letter && c.letter.content) {
        c.letter.content.cited.forEach(function (x) {
          out.push({ kind: 'Letter', label: 'v' + c.letter.version + ' ' + x.sec, text: x.text, show: x.text, caseId: cid, patientId: c.patientId });
        });
      }
    });
    ASO.convos.committed().forEach(function (cv) {
      var body = cv.text.replace(/\s+/g, ' ').trim();
      if (!body) return;
      out.push({ kind: 'Chat', label: cv.when, text: cv.title + '. ' + body, show: body.length > 180 ? body.slice(0, 180).replace(/\s+\S*$/, '') + '…' : body,
        title: cv.title, caseId: cv.scope.caseId, patientId: cv.scope.patientId, convId: cv.id });
    });
    return out;
  }

  /* opts: { patientId, caseId, kind, limit } */
  function query(q, opts) {
    opts = opts || {};
    var qv = embed(q);
    if (!Object.keys(qv).length) return [];
    return passages().filter(function (p) {
      if (opts.caseId && p.caseId !== opts.caseId) return false;
      if (opts.patientId && p.patientId !== opts.patientId) return false;
      if (opts.kind && p.kind !== opts.kind) return false;
      return true;
    }).map(function (p) {
      p.score = cosine(qv, embed(p.text));
      return p;
    }).filter(function (p) { return p.score >= MIN_SCORE; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, opts.limit || 12);
  }

  /* results grouped per case, best group first */
  function group(hits) {
    var groups = [];
    var byKey = {};
    hits.forEach(function (hit) {
      var k = hit.caseId || (hit.patientId ? 'p:' + hit.patientId : 'global');
      if (!byKey[k]) {
        var c = hit.caseId ? D.cases[hit.caseId] : null;
        var p = hit.patientId ? D.patient(hit.patientId) : null;
        byKey[k] = {
          key: k, caseId: hit.caseId || null, patientId: hit.patientId || null,
          title: p ? p.name : 'All patients',
          sub: c ? c.id + ' · ' + c.title : (p ? 'Patient-level chats' : 'Chats with no patient selected'),
          hits: []
        };
        groups.push(byKey[k]);
      }
      byKey[k].hits.push(hit);
    });
    return groups;
  }

  function stats() {
    var ps = passages();
    var cases = {};
    ps.forEach(function (p) { if (p.caseId) cases[p.caseId] = 1; });
    return { passages: ps.length, cases: Object.keys(cases).length };
  }

  ASO.search = { query: query, group: group, stats: stats };
})(window);
