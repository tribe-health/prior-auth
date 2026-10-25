/* ASO patient chat · synthetic chart and policy documents.
   Chart documents belong to a patient, so any of that patient's cases can
   cite them. `text` holds the pages that carry a cited passage. An unfiled
   document sits in the patient's inbox until it is attached to a case.
   Policy documents belong to the payer policy library. All invented. */
(function (g) {
  'use strict';
  var D = g.ASO.data;

  D.docs = {
    /* Renata Kaminski */
    'EXAM-0924': { patientId: 'kaminski', caseId: 'PA-2026-0431', title: 'Office visit note', date: '2026-09-24', pages: 3, hash: 'sha256 9f2c…a41e',
      text: {
        1: 'Right leg radicular pain rated 7/10 today and 8/10 at night. Prior rating 5/10 on 2026-07-22.',
        2: 'Sitting tolerance about 20 minutes. Stops walking at mailbox distance. Missed 6 work shifts since August 2026. Reports intermittent left calf symptoms for about one month.',
        3: 'Plan: right L4–L5 decompression with instrumented fusion. Orders: HbA1c, serum cotinine. Request Northgate PT records and the 2026-07-25 MRI addendum.'
      } },
    'PAIN-0912': { patientId: 'kaminski', caseId: 'PA-2026-0431', title: 'Pain clinic follow-up', date: '2026-07-22', pages: 2, hash: 'sha256 41d0…7c9b',
      text: { 1: 'VAS 5/10, right L5 distribution. No change since the March injection wore off.' } },
    'PT-0318': { patientId: 'kaminski', caseId: 'PA-2026-0212', title: 'Lakeview Physical Therapy ledger', date: '2026-03-18', pages: 2, hash: 'sha256 c7a3…02f5',
      text: { 1: '9 supervised in-person sessions, 2026-02-11 through 2026-03-18. Discharged without improvement in leg pain.' } },
    'ESI-0310': { patientId: 'kaminski', caseId: 'PA-2026-0212', title: 'Procedure note: right L4–L5 transforaminal ESI', date: '2026-03-10', pages: 2, hash: 'sha256 5be8…d310',
      text: {
        1: 'Right L4–L5 transforaminal epidural steroid injection performed under fluoroscopy.',
        2: 'Follow-up 2026-03-31: relief for about two weeks, then return to baseline.'
      } },
    'DET-0302': { patientId: 'kaminski', caseId: 'PA-2026-0212', title: 'BCBS TX determination letter', date: '2026-03-02', pages: 1, hash: 'sha256 18c4…b7e2',
      text: { 1: 'Approved. Authorization A-2026-340118 for right L4–L5 transforaminal epidural steroid injection, CPT 64483. Valid 2026-03-02 through 2026-05-31. Synthetic.' } },
    'PAIN-0218': { patientId: 'kaminski', caseId: 'PA-2026-0212', title: 'Pain clinic consult', date: '2026-02-18', pages: 2, hash: 'sha256 6d2b…49f1',
      text: {
        1: 'Right leg pain in an L5 dermatomal distribution, VAS 6/10. Straight leg raise positive on the right.',
        2: 'Conservative care to date: naproxen and a home exercise program since 2026-01-12. Supervised physical therapy started 2026-02-11.'
      } },
    'RAD-1341': { patientId: 'kaminski', caseId: 'PA-2026-0431', title: 'MRI lumbar spine without contrast', date: '2026-07-18', pages: 2, hash: 'sha256 0aa9…e6c2',
      text: { 2: 'Impression: L4–L5 disc-osteophyte complex with right lateral recess narrowing. No definite nerve root impingement.' } },
    'RAD-1341-A': { patientId: 'kaminski', caseId: 'PA-2026-0431', title: 'Radiologist addendum to RAD-1341', date: '2026-07-25', pages: 1, hash: 'sha256 d2f4…918a',
      text: { 1: 'On review with the CT myelogram of 2026-07-21: right L4–L5 lateral recess stenosis with contact and posterior displacement of the traversing right L5 root.' } },
    'LAB-0926': { patientId: 'kaminski', caseId: 'PA-2026-0431', title: 'Serum cotinine', date: '2026-09-26', pages: 1, hash: 'sha256 77e1…b04d',
      text: { 1: 'Cotinine: negative (below the 10 ng/mL reporting threshold).' } },
    'NGPT-0424': { patientId: 'kaminski', caseId: null, unfiled: true, received: 'Fax received today 08:14',
      title: 'Northgate Physical Therapy records', date: '2026-04-24', pages: 4, hash: 'sha256 3c56…f7a0',
      text: {
        1: '6 supervised in-person sessions, 2026-04-06 through 2026-04-24, twice weekly.',
        2: 'Discharge summary: no change in right leg pain or sitting tolerance.'
      } },

    /* Marcus Delgado */
    'EXAM-0918': { patientId: 'delgado', caseId: 'PA-2026-0447', title: 'Office visit note', date: '2026-09-18', pages: 2, hash: 'sha256 6a1f…c0d2',
      text: {
        1: 'Right C6 radiculopathy with pain radiating to the thumb. Wrist extension and biceps 4/5 on the right.',
        2: 'Plan: C5–C6 anterior cervical discectomy and fusion. Non-smoker.'
      } },
    'PT-0811': { patientId: 'delgado', caseId: 'PA-2026-0447', title: 'Physical therapy and injection record', date: '2026-08-11', pages: 2, hash: 'sha256 b93e…17a4',
      text: { 1: 'Supervised physical therapy 2026-06-02 through 2026-08-11, 10 weeks. One cervical epidural steroid injection on 2026-07-14 with brief relief.' } },
    'RAD-1502': { patientId: 'delgado', caseId: 'PA-2026-0447', title: 'MRI cervical spine without contrast', date: '2026-08-20', pages: 2, hash: 'sha256 2d77…9e51',
      text: { 2: 'Impression: right C5–C6 foraminal stenosis with uncovertebral hypertrophy, contacting the exiting right C6 root.' } },

    /* Odalys Brennan */
    'EXAM-0902': { patientId: 'brennan', caseId: 'PA-2026-0419', title: 'Office visit note', date: '2026-09-02', pages: 2, hash: 'sha256 f04c…3b68',
      text: { 1: 'Left leg radicular pain to the lateral foot. Straight leg raise positive at 40 degrees on the left. Ankle dorsiflexion 4/5.' } },
    'PT-0828': { patientId: 'brennan', caseId: 'PA-2026-0419', title: 'Physical therapy notes', date: '2026-08-28', pages: 2, hash: 'sha256 8c25…a7f0',
      text: {
        1: '8 supervised sessions, 2026-07-28 through 2026-08-22: 4 weeks.',
        2: 'Therapy stopped on 2026-08-28 for worsening left foot drop. Referred back to the surgeon.'
      } },
    'RAD-1466': { patientId: 'brennan', caseId: 'PA-2026-0419', title: 'MRI lumbar spine without contrast', date: '2026-08-30', pages: 2, hash: 'sha256 51ab…6d93',
      text: { 1: 'Impression: left paracentral L5–S1 disc extrusion displacing the traversing left S1 root.' } },
    'DEN-0926': { patientId: 'brennan', caseId: 'PA-2026-0419', title: 'Cigna determination letter', date: '2026-09-26', pages: 2, hash: 'sha256 e7d1…40bc',
      text: { 1: 'Request not approved. Criterion §1(b): 6 weeks of conservative care not documented; 4 weeks on file. A peer-to-peer review may be requested.' } },

    /* Theo Vasquez */
    'EXAM-0929': { patientId: 'vasquez', caseId: 'PA-2026-0452', title: 'Office visit note', date: '2026-09-29', pages: 2, hash: 'sha256 0c8e…f215',
      text: { 1: 'Walks about one block before both legs feel heavy, relieved by sitting or leaning forward. No bladder or bowel change.' } },
    'REF-0920': { patientId: 'vasquez', caseId: 'PA-2026-0452', title: 'Primary care referral', date: '2026-09-20', pages: 1, hash: 'sha256 a46b…5e09',
      text: { 1: 'Referred for lumbar stenosis. An outside lumbar MRI was done in August; the report is not enclosed. No physical therapy or injections so far.' } },
    'OMRI-0814': { patientId: 'vasquez', caseId: null, unfiled: true, received: 'Fax received today 09:40',
      title: 'Outside MRI lumbar spine report', date: '2026-08-14', pages: 2, hash: 'sha256 4e90…c3a8',
      text: {
        1: 'MRI lumbar spine without contrast, Riverbend Imaging, 2026-08-14.',
        2: 'Impression: severe central canal stenosis at L3–L4 and L4–L5 with crowding of the cauda equina. Moderate facet hypertrophy.'
      } },

    /* Priya Raman */
    'EXAM-0915': { patientId: 'raman', caseId: 'PA-2026-0398', title: 'Office visit note', date: '2026-09-15', pages: 2, hash: 'sha256 39f7…8ac1',
      text: { 1: 'Left arm pain in a C7 distribution. Triceps 4/5 on the left. Single-level disease.' } },
    'PT-0825': { patientId: 'raman', caseId: 'PA-2026-0398', title: 'Physical therapy ledger', date: '2026-08-25', pages: 1, hash: 'sha256 d510…72ee',
      text: { 1: 'Supervised physical therapy 2026-07-07 through 2026-08-25, 7 weeks, without lasting relief.' } },
    'RAD-1480': { patientId: 'raman', caseId: 'PA-2026-0398', title: 'MRI cervical spine without contrast', date: '2026-09-01', pages: 2, hash: 'sha256 7be2…19d6',
      text: { 1: 'Impression: left C6–C7 disc herniation contacting the exiting left C7 root.' } },
    'SUB-0930': { patientId: 'raman', caseId: 'PA-2026-0398', title: 'Submission receipt', date: '2026-09-30', pages: 1, hash: 'sha256 c1a9…e3f4',
      text: { 1: 'Packet received 2026-09-30 14:12. 4 of 4 items acknowledged. Confirmation TX-PA-88390114 (synthetic).' } },
    'DET-1002': { patientId: 'raman', caseId: null, unfiled: true, received: 'Portal message received today 07:52',
      title: 'BCBS TX determination letter', date: '2026-10-02', pages: 1, hash: 'sha256 b2d6…51c9',
      text: { 1: 'Approved. Authorization A-2026-771204 for C6–C7 cervical disc arthroplasty, CPT 22856. Valid 2026-10-02 through 2026-12-31. Synthetic.' } },

    /* payer policy library */
    'SURG-2026-014': { patientId: null, caseId: null, policy: true, title: 'BCBS TX medical policy SURG-2026-014 rev. 4 · Lumbar spinal fusion', date: '2026-07-01', pages: 12, hash: 'sha256 e81b…4d27',
      text: {
        1: 'Medical policy SURG-2026-014, revision 4. Lumbar spinal fusion. Effective 2026-07-01. Synthetic policy written for this prototype.',
        6: '§4.1 Lumbar decompression with fusion is considered medically necessary when all of the following are documented: (a) radicular pain rated above 5 of 10; (b) at least 6 weeks of supervised physical therapy within the last 12 months; (c) functional impairment; (d) imaging that matches the symptomatic level and side.',
        7: '§4.2(c) For instrumented fusion, the record documents nicotine abstinence and an HbA1c below 8.0% within the last 90 days.'
      } },
    'SURG-2026-009': { patientId: null, caseId: null, policy: true, title: 'BCBS TX medical policy SURG-2026-009 rev. 2 · Cervical disc arthroplasty', date: '2026-04-01', pages: 9, hash: 'sha256 73aa…0c1e',
      text: {
        1: 'Medical policy SURG-2026-009, revision 2. Cervical disc arthroplasty. Effective 2026-04-01. Synthetic policy written for this prototype.',
        5: '§3.1 Single-level cervical disc arthroplasty is considered medically necessary when all are documented: (a) single-level cervical radiculopathy; (b) at least 6 weeks of conservative care; (c) imaging that matches the symptomatic level and side.'
      } },
    'INJ-2025-031': { patientId: null, caseId: null, policy: true, title: 'BCBS TX medical policy INJ-2025-031 rev. 2 · Epidural steroid injection', date: '2025-11-01', pages: 6, hash: 'sha256 95e3…ad70',
      text: {
        1: 'Medical policy INJ-2025-031, revision 2. Epidural steroid injection. Effective 2025-11-01. Synthetic policy written for this prototype.',
        2: '§2 A lumbar epidural steroid injection is considered medically necessary when the record documents: (2.1) radicular pain in a dermatomal pattern; (2.2) at least 4 weeks of conservative care.'
      } },
    'CPB-0743': { patientId: null, caseId: null, policy: true, title: 'Aetna clinical policy bulletin 0743 · Cervical spinal fusion', date: '2026-01-15', pages: 10, hash: 'sha256 2f18…d6b4',
      text: {
        1: 'Clinical policy bulletin 0743. Cervical spinal fusion. Effective 2026-01-15. Synthetic policy written for this prototype.',
        3: '§A Anterior cervical discectomy and fusion is considered medically necessary when all are documented: (1) cervical radiculopathy with a motor deficit; (2) at least 6 weeks of conservative care; (3) imaging that matches the symptomatic level and side.'
      } },
    'CP-0303': { patientId: null, caseId: null, policy: true, title: 'Cigna coverage policy 0303 · Lumbar discectomy', date: '2026-03-01', pages: 8, hash: 'sha256 c05d…7e92',
      text: {
        1: 'Coverage policy 0303. Lumbar discectomy. Effective 2026-03-01. Synthetic policy written for this prototype.',
        2: '§1 Lumbar microdiscectomy is considered medically necessary when all are documented: (a) radicular pain with a positive straight leg raise; (b) at least 6 weeks of conservative care; (c) imaging that matches the symptomatic level and side.',
        3: '§2 The conservative care requirement in §1(b) does not apply when a progressive motor deficit is documented.'
      } },
    'HUM-0528-012': { patientId: null, caseId: null, policy: true, title: 'Humana medical coverage policy HUM-0528-012 · Lumbar laminectomy', date: '2026-02-01', pages: 11, hash: 'sha256 8b47…f03c',
      text: {
        1: 'Medical coverage policy HUM-0528-012. Lumbar laminectomy. Effective 2026-02-01. Synthetic policy written for this prototype.',
        4: '§3 Lumbar laminectomy for stenosis is considered medically necessary when all are documented: (3.1) neurogenic claudication; (3.2) imaging showing central stenosis at the operative levels; (3.3) at least 12 weeks of conservative care, unless bladder or bowel dysfunction or progressive weakness is documented.'
      } }
  };

  D.sync();
})(window);
