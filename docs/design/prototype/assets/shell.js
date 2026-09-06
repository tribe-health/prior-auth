/* ═══════════════════════════════════════════════════════════════════════
   Advanced Spine & Orthopedics · Surgery Authorization Workbench
   Shared shell: application mark, workflow rail, theme persistence.

   Every screen includes this once and calls ASO.shell({ step, case }).
   The rail is generated rather than pasted so the gate state (which steps
   are reachable) has one source of truth instead of eight copies.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var THEME_KEY = 'aso-theme';
  var CASE_KEY = 'aso-case-state';

  /* ── storage with a memory fallback ───────────────────────────────
     localStorage throws in private mode, in some embedded webviews, and
     inside data: URLs. Without a fallback, writeSession() fails silently
     and requireSession() bounces the user straight back to the login —
     an unbreakable loop with no error shown. Degrading to memory keeps
     the app usable for the page load; state simply does not persist. */
  var memStore = {};
  var canPersist = (function () {
    try {
      localStorage.setItem('aso-probe', '1');
      localStorage.removeItem('aso-probe');
      return true;
    } catch (e) { return false; }
  })();

  function store(key, value) {
    if (arguments.length === 1) {
      if (!canPersist) return key in memStore ? memStore[key] : null;
      try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    if (value === null) {
      delete memStore[key];
      if (canPersist) { try { localStorage.removeItem(key); } catch (e) {} }
      return;
    }
    memStore[key] = value;
    if (canPersist) { try { localStorage.setItem(key, value); } catch (e) {} }
  }

  /* ── theme ───────────────────────────────────────────────────────── */
  function readTheme() { return store(THEME_KEY) || 'light'; }
  function applyTheme(mode) {
    document.documentElement.classList.toggle('dark', mode === 'dark');
    store(THEME_KEY, mode);
    var btn = document.querySelector('[data-theme-toggle]');
    if (btn) {
      btn.textContent = mode === 'dark' ? 'Light' : 'Dark';
      btn.setAttribute('aria-label', 'Switch to ' + (mode === 'dark' ? 'light' : 'dark') + ' appearance');
    }
  }
  function toggleTheme() { applyTheme(readTheme() === 'dark' ? 'light' : 'dark'); }

  /* Applied before first paint by an inline call in each <head>. */
  function primeTheme() {
    if (readTheme() === 'dark') document.documentElement.classList.add('dark');
  }

  function persistent() { return canPersist; }

  /* ── shared case state ────────────────────────────────────────────
     Persists the surgeon-gate decision so the letter screen can tell
     the truth about whether drafting was actually unlocked. */
  var DEFAULT_STATE = {
    policyConfirmed: false,
    sectionConfirmed: false,
    pathway: null,
    planConfirmed: false,
    signatureApplied: false,
    /* Surgeon clinical annotations — see the annotation store below. */
    annotations: []
  };
  function readState() {
    try {
      var raw = store(CASE_KEY);
      if (!raw) return Object.assign({}, DEFAULT_STATE);
      return Object.assign({}, DEFAULT_STATE, JSON.parse(raw));
    } catch (e) { return Object.assign({}, DEFAULT_STATE); }
  }
  function writeState(patch) {
    var next = Object.assign(readState(), patch);
    store(CASE_KEY, JSON.stringify(next));
    return next;
  }
  /* True only when the surgeon has actually affirmed all four. The
     surgeon gate itself uses this, so the real decision stays real. */
  function gateAffirmed(s) {
    s = s || readState();
    return !!(s.policyConfirmed && s.sectionConfirmed && s.pathway && s.planConfirmed);
  }

  /* ── prototype preview ────────────────────────────────────────────
     Downstream screens (letter, packet, receipt, peer-to-peer) ask
     gateCleared() to decide whether to render content or a "blocked
     upstream" placeholder. In a prototype that hides four screens
     behind a form, so viewing is allowed by default: the screens show
     their real content with a banner saying the gate has not actually
     been affirmed yet.

     Set ASO.setPreview(false) to see the true gated behaviour. */
  var PREVIEW_KEY = 'aso-preview';

  function previewUnlocked() {
    return store(PREVIEW_KEY) !== 'off';
  }
  function setPreview(on) {
    store(PREVIEW_KEY, on ? 'on' : 'off');
  }

  function gateCleared(s) {
    return gateAffirmed(s) || previewUnlocked();
  }

  /* ── surgeon annotation store ─────────────────────────────────────
     An annotation is the ONE mechanism by which a claim enters the
     letter without a chart document behind it. That makes its
     provenance class load-bearing, not cosmetic:

       chart      — a fact extracted from a dated source document.
       surgeon    — the treating physician's clinical judgment or a
                    statement of radiologic//surgical principle. It is
                    attributed to him by name in the letter and is
                    NEVER rendered as though a document said it.

     `include` is deliberately separate from the annotation's existence.
     The surgeon may record a point for the record, for a peer-to-peer,
     or for an appeal without putting it in this letter. Recording a
     thought and arguing it are different acts. */
  var ANNOTATION_TARGETS = {
    'mri-contradiction': 'MRI impression vs. CT myelogram',
    'pt-duration':       'Supervised therapy duration',
    'nicotine':          'Nicotine status',
    'hba1c':             'HbA1c',
    'translation':       'Segmental translation measurement',
    'facetectomy':       'Planned facetectomy extent'
  };

  function readAnnotations() {
    var a = readState().annotations;
    return Array.isArray(a) ? a : [];
  }

  function saveAnnotation(rec) {
    var all = readAnnotations();
    var next;
    if (rec.id) {
      next = all.map(function (a) { return a.id === rec.id ? Object.assign({}, a, rec) : a; });
      if (!all.some(function (a) { return a.id === rec.id; })) next = all.concat([rec]);
    } else {
      rec.id = 'ann-' + Date.now().toString(36);
      rec.created = new Date().toISOString().slice(0, 10);
      next = all.concat([rec]);
    }
    writeState({ annotations: next });
    return rec;
  }

  function deleteAnnotation(id) {
    writeState({ annotations: readAnnotations().filter(function (a) { return a.id !== id; }) });
  }

  function annotationsFor(target) {
    return readAnnotations().filter(function (a) { return a.target === target; });
  }

  /* Annotations the surgeon actually elected to argue in the letter. */
  function includedAnnotations() {
    return readAnnotations().filter(function (a) { return a.include; });
  }

  /* ── session & roles ──────────────────────────────────────────────
     Three roles, not two. Admin/user is too coarse for this product:
     the surgeon gate and the electronic signature are clinical acts
     that an administrator must NOT be able to perform, however much
     system access they otherwise hold. Separating "can configure the
     system" from "can affirm a medical decision" is a safety boundary,
     not an org-chart convenience.

       admin    — practice configuration, EMR connections, users,
                  audit. CANNOT affirm a gate or sign a letter.
       surgeon  — clinical authority. Affirms the gate, annotates
                  evidence, signs letters, takes peer-to-peers.
       staff    — coordinators, schedulers, billers. Prepares
                  everything and submits; affirms nothing clinical. */
  var SESSION_KEY = 'aso-session';

  var ROLES = {
    admin: {
      label: 'Administrator',
      person: 'Dana Whitfield',
      initials: 'DW',
      email: 'dwhitfield@asodocs.com',
      can: { configure: true, affirmGate: false, sign: false, submit: true, annotate: false }
    },
    surgeon: {
      label: 'Surgeon',
      person: 'Kevin B. James, MD',
      initials: 'KJ',
      email: 'kjames@asodocs.com',
      can: { configure: false, affirmGate: true, sign: true, submit: true, annotate: true }
    },
    staff: {
      label: 'Staff',
      person: 'Marisol Okonkwo',
      initials: 'MO',
      email: 'mokonkwo@asodocs.com',
      can: { configure: false, affirmGate: false, sign: false, submit: true, annotate: false }
    }
  };

  function readSession() {
    try {
      var raw = store(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeSession(sess) {
    store(SESSION_KEY, JSON.stringify(sess));
    return sess;
  }
  /* Ending a session also clears the case work. A prototype persona is a
     fresh pair of eyes: inheriting the previous user's gate affirmation,
     private annotations and applied signature makes the next persona's
     view a lie — a coordinator would open a letter the surgeon signed
     and see it as their own. */
  function signOut() {
    store(SESSION_KEY, null);
    store(CASE_KEY, null);
  }
  function currentRole() {
    var s = readSession();
    return (s && ROLES[s.role]) ? s.role : null;
  }
  function profile() {
    var r = currentRole();
    return r ? Object.assign({ role: r }, ROLES[r]) : null;
  }
  function can(action) {
    var p = profile();
    return !!(p && p.can && p.can[action]);
  }

  /* Screens that require a session redirect here. Depth-aware so it
     works from both the root and screens/. */
  /* ── session resolution ───────────────────────────────────────────
     This is a PROTOTYPE, so no screen is ever behind a locked door.
     Every page is directly openable and every link is clickable; the
     login exists to CHOOSE a persona, not to withhold the site map.

     Resolution order:
       1. ?role=… in the URL — deep-linkable, good for demo links.
       2. An existing session from the login picker.
       3. A default persona, so a cold open lands in a working app
          rather than bouncing to a sign-in wall.

     In production this function would do the opposite: no session
     means redirect. That branch is deliberately not shipped here
     because it makes the prototype impossible to click through. */
  var PROTOTYPE_DEFAULT_ROLE = 'surgeon';

  function requireSession(depth) {
    try {
      var q = (window.location.search || '').match(/[?&]role=(admin|surgeon|staff)\b/);
      if (q) writeSession({ role: q[1], signedInAt: new Date().toISOString() });
    } catch (e) { /* noop */ }

    if (currentRole()) return true;

    /* No session — adopt the default persona rather than redirecting. */
    writeSession({
      role: PROTOTYPE_DEFAULT_ROLE,
      signedInAt: new Date().toISOString(),
      practice: 'Advanced Spine & Orthopedics · Southlake',
      assumed: true
    });
    return true;
  }

  /* ── EMR connections ──────────────────────────────────────────────
     Connections belong to a PRACTICE, not a user. A surgeon who
     operates at an affiliated hospital or a partner office reads
     charts in that site's EMR, so one physician legitimately spans
     several systems — and the same human patient can therefore exist
     in more than one of them under different MRNs. The app models
     that duplication explicitly ("needs reconciliation") rather than
     silently merging records or showing the case twice. */
  var CONNECTIONS = [
    {
      id: 'advancedmd-southlake',
      vendor: 'AdvancedMD',
      abbr: 'aMD',
      practice: 'Advanced Spine & Orthopedics · Southlake',
      role: 'Primary practice',
      protocol: 'FHIR R4 · SMART Backend Services',
      auth: 'OAuth 2.0 client credentials · JWT assertion',
      status: 'connected',
      lastSync: '2026-09-04 06:12',
      cadence: 'Every 15 minutes',
      cases: 4,
      caps: { read: true, docs: true, write: false, sched: true, subscribe: true }
    },
    {
      id: 'epic-methodist',
      vendor: 'Epic',
      abbr: 'EPC',
      practice: 'Methodist Southlake Hospital',
      role: 'Affiliated facility · surgical privileges',
      protocol: 'FHIR R4 · SMART on FHIR',
      auth: 'OAuth 2.0 authorization code · per-clinician',
      status: 'degraded',
      lastSync: '2026-09-03 21:47',
      cadence: 'Every 30 minutes',
      cases: 2,
      caps: { read: true, docs: true, write: false, sched: false, subscribe: false },
      note: 'Clinician token expires in 3 days. Epic requires an interactive re-consent; a background refresh cannot renew it.'
    },
    {
      id: 'athena-northpoint',
      vendor: 'athenahealth',
      abbr: 'ATH',
      practice: 'Northpoint Orthopedic Partners',
      role: 'Partner office · Tuesday clinic',
      protocol: 'FHIR R4 (US Core 6.1)',
      auth: 'OAuth 2.0 client credentials',
      status: 'connected',
      lastSync: '2026-09-04 05:58',
      cadence: 'Hourly',
      cases: 1,
      caps: { read: true, docs: false, write: false, sched: false, subscribe: false },
      note: 'DocumentReference is not exposed by this tenant. Imaging reports and PT notes must be attached manually.'
    },
    {
      id: 'nextgen-legacy',
      vendor: 'NextGen',
      abbr: 'NXG',
      practice: 'Legacy archive · pre-2024 records',
      role: 'Read-only archive',
      protocol: 'HL7 v2.5.1 · MLLP over VPN',
      auth: 'Mutual TLS · site certificate',
      status: 'down',
      lastSync: '2026-08-27 03:10',
      cadence: 'Nightly',
      cases: 0,
      caps: { read: true, docs: true, write: false, sched: false, subscribe: false },
      note: 'VPN tunnel has been down for 8 days. No cases are being pulled. This is an archive, so it does not block active work.'
    }
  ];

  function connections() { return CONNECTIONS.slice(); }
  function connection(id) {
    return CONNECTIONS.filter(function (c) { return c.id === id; })[0] || null;
  }

  /* ── application mark · two counter-tapered sweeps, −13°, +18y ────
     Reproduced from the brand guide's construction spec. The ember
     sweep is the lower one; the order is fixed. */
  var MARK = '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g transform="rotate(-13 256 256) translate(0 18)">' +
    '<path d="M80 250C172 186 300 154 432 162C306 126 176 148 80 208C64 218 64 240 80 250Z" fill="var(--graphite)"/>' +
    '<path d="M80 308C176 266 306 234 432 240C448 250 448 274 432 284C306 278 176 312 80 330C66 324 66 314 80 308Z" fill="var(--ember)"/>' +
    '</g></svg>';

  /* Horizontal wordmark lockup — letterhead and document headers only. */
  var WORDMARK = '<svg viewBox="0 0 430 128" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Advanced Spine and Orthopedics">' +
    '<text x="12" y="70" font-family="Mulish, sans-serif" font-size="58" font-weight="600" letter-spacing="2" textLength="404" lengthAdjust="spacing" fill="#6E6F71">ADVANCED</text>' +
    '<path d="M10 74 C 76 34, 192 24, 288 36 C 348 44, 390 55, 420 65 C 388 51, 346 37, 286 29 C 190 17, 72 33, 10 66 Z" fill="#DF7C35"/>' +
    '<text x="14" y="112" font-family="Mulish, sans-serif" font-size="33" textLength="400" lengthAdjust="spacing" fill="#231F20">Spine &amp; Orthopedics</text>' +
    '</svg>';

  /* ── workflow steps · the gate is step 06 ─────────────────────────
     `gated: true` means the step is unreachable until the surgeon has
     confirmed policy, section, pathway and operative plan. */
  var STEPS = [
    { id: 'dashboard', ix: '01', label: 'Case dashboard',    href: 'index.html' },
    { id: 'intake',    ix: '02', label: 'Intake checklist',  href: 'screens/intake-checklist.html' },
    { id: 'evidence',  ix: '03', label: 'Evidence timeline', href: 'screens/evidence-timeline.html' },
    { id: 'policy',    ix: '04', label: 'Policy panel',      href: 'screens/policy-panel.html' },
    { id: 'pathway',   ix: '05', label: 'Pathway comparison', href: 'screens/pathway-comparison.html' },
    { id: 'gate',      ix: '06', label: 'Surgeon gate',      href: 'screens/surgeon-gate.html' },
    { id: 'letter',    ix: '07', label: 'Letter & QA',       href: 'screens/letter-composer.html', gated: true },
    { id: 'packet',    ix: '08', label: 'Submission packet', href: 'screens/submission-packet.html', gated: true },
    /* Post-submission accountability. These answer the second question
       the addenda pose: can we prove the payer had the evidence? */
    { id: 'receipt',   ix: '09', label: 'Receipt & custody', href: 'screens/receipt-verification.html', gated: true },
    { id: 'p2p',       ix: '10', label: 'Peer-to-peer',      href: 'screens/peer-to-peer.html', gated: true }
  ];

  function prefixed(href, depth) {
    if (depth !== 'nested') return href;
    return href.indexOf('screens/') === 0 ? href.slice('screens/'.length) : '../' + href;
  }

  /* ── site map ─────────────────────────────────────────────────────
     Every screen, grouped, with a per-role note. Roles differ in what
     they can DO on a screen, so the note explains the difference rather
     than removing the link — a reviewer needs to see the whole product
     from each persona's seat. */
  var SITE_MAP = [
    {
      group: 'Cases',
      screens: [
        { href: 'index.html',                        label: 'Case dashboard',
          note: { surgeon: 'Your queue — two cases await your affirmation',
                  staff:   'Practice queue — two are blocked on a surgeon',
                  admin:   'All cases across four connected systems' } },
        { href: 'screens/intake-checklist.html',     label: 'Intake checklist',
          note: { surgeon: 'What the chart is missing',
                  staff:   'You own most of these requests',
                  admin:   'Read-only' } },
        { href: 'screens/evidence-timeline.html',    label: 'Evidence timeline',
          note: { surgeon: 'Annotate contradictions in your own voice',
                  staff:   'Read the evidence; annotation is clinical',
                  admin:   'Read-only' } },
        { href: 'screens/policy-panel.html',         label: 'Policy panel',
          note: { surgeon: 'Confirm the controlling criteria',
                  staff:   'Obtain criteria the payer has not published',
                  admin:   'Read-only' } },
        { href: 'screens/pathway-comparison.html',   label: 'Pathway comparison',
          note: { surgeon: 'Three theories, ranked — you choose',
                  staff:   'Read the ranking; the choice is the surgeon\'s',
                  admin:   'Read-only' } },
        { href: 'screens/surgeon-gate.html',         label: 'Surgeon gate',
          note: { surgeon: 'Four confirmations only you can make',
                  staff:   'Visible, not affirmable',
                  admin:   'Visible, not affirmable' } }
      ]
    },
    {
      group: 'Letter & submission',
      screens: [
        { href: 'screens/letter-composer.html',      label: 'Letter & QA',
          note: { surgeon: 'Approve and apply your signature',
                  staff:   'Read the draft; signing is the surgeon\'s',
                  admin:   'Read-only' } },
        { href: 'screens/submission-packet.html',    label: 'Submission packet',
          note: { surgeon: 'Attachment checklist',
                  staff:   'You submit this to the payer',
                  admin:   'Read-only' } },
        { href: 'screens/receipt-verification.html', label: 'Receipt & custody',
          note: { surgeon: 'Proof of what the payer received',
                  staff:   'You chase disputed items',
                  admin:   'Read-only' } },
        { href: 'screens/peer-to-peer.html',         label: 'Peer-to-peer',
          note: { surgeon: 'You take the call',
                  staff:   'Prepare the preflight',
                  admin:   'Read-only' } }
      ]
    },
    {
      group: 'Settings & admin',
      screens: [
        { href: 'screens/settings-integrations.html', label: 'EMR connections',
          note: { surgeon: 'See which systems feed your cases',
                  staff:   'See which systems feed the queue',
                  admin:   'Add, configure and reconnect systems' } },
        { href: 'screens/settings-profile.html',      label: 'Profile & signature',
          note: { surgeon: 'Your stored signature',
                  staff:   'No signature — not applicable to your role',
                  admin:   'No signature — not applicable to your role' } },
        { href: 'screens/admin-console.html',         label: 'Admin console',
          note: { surgeon: 'Readable; changes need an administrator',
                  staff:   'Readable; changes need an administrator',
                  admin:   'Users, roles and the audit log' } },
        { href: 'screens/how-this-works.html',        label: 'How this works',
          note: { surgeon: 'The theory: three evidence states, the gate, provenance',
                  staff:   'The theory: three evidence states, the gate, provenance',
                  admin:   'The theory: three evidence states, the gate, provenance' } },
        { href: 'screens/architecture.html',          label: 'Technology',
          note: { surgeon: 'The runtime stack, and what is shipped versus planned',
                  staff:   'The runtime stack, and what is shipped versus planned',
                  admin:   'The runtime stack, and what is shipped versus planned' } },
        { href: 'screens/build-playbook.html',        label: 'Build playbook',
          note: { surgeon: 'How web, desktop and mobile get built from one architecture',
                  staff:   'How web, desktop and mobile get built from one architecture',
                  admin:   'How web, desktop and mobile get built from one architecture' } },
        { href: 'screens/data-model.html',            label: 'Data model',
          note: { surgeon: 'How the record is structured and what it guarantees',
                  staff:   'How the record is structured and what it guarantees',
                  admin:   'Schema design, roles, and the rules the database enforces' } },
        { href: 'screens/sitemap.html',               label: 'Sitemap',
          note: { surgeon: 'Reference view of the whole product',
                  staff:   'Reference view of the whole product',
                  admin:   'Reference view of the whole product' } }
      ]
    }
  ];

  function siteMap() { return SITE_MAP; }

  /* ── icons · monoline, 20px grid, stroke-based ────────────────────
     Inline rather than an icon font so they inherit currentColor and
     stay crisp at the two sizes the shell uses. */
  var ICON = {
    cases:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16v13H4z"/><path d="M9 7V5h6v2"/><path d="M4 12h16"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>',
    admin:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9.5 12l1.8 1.8 3.2-3.4"/></svg>',
    search:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
    steps:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    back:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    signout:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 17l5-5-5-5"/><path d="M20 12H9"/><path d="M12 3H5v18h7"/></svg>',
    sun:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    user:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg>'
  };

  /* ── global destinations ──────────────────────────────────────────
     The product level. Admin is role-gated: staff and surgeons never
     see a door they cannot open. */
  var GLOBAL_NAV = [
    { id: 'cases',    label: 'Cases',    icon: 'cases',    href: 'index.html',            badge: 6 },
    { id: 'settings', label: 'Settings', icon: 'settings', href: 'screens/settings-integrations.html' },
    { id: 'admin',    label: 'Admin',    icon: 'admin',    href: 'screens/admin-console.html', requires: 'configure' }
  ];

  /* Prototype: every destination is navigable. Role controls the
     CONTENTS of a screen (what you may affirm, sign, configure), never
     whether the screen can be opened — otherwise the site map is only
     partly walkable and reviewers think links are broken. */
  function visibleGlobalNav() {
    return GLOBAL_NAV.slice();
  }

  function renderGlobalNav(opts) {
    var depth = opts.depth || 'root';
    var section = opts.section || 'cases';
    var p = profile();

    var items = visibleGlobalNav().map(function (n) {
      var cur = n.id === section ? ' aria-current="page"' : '';
      var badge = n.badge ? '<span class="gnav-badge">' + n.badge + '</span>' : '';
      return '<a class="gnav-item" href="' + prefixed(n.href, depth) + '"' + cur +
        ' aria-label="' + n.label + '">' + ICON[n.icon] + badge +
        '<span class="gnav-tip">' + n.label + '</span></a>';
    }).join('');

    return '<span class="gnav-mark">' + MARK + '</span>' +
      '<nav style="display:flex;flex-direction:column;gap:8px" aria-label="Sections">' + items + '</nav>' +
      '<div class="gnav-spacer"></div>' +
      '<button class="gnav-item" data-theme-toggle-icon aria-label="Toggle appearance">' +
        ICON.sun + '<span class="gnav-tip">Appearance</span></button>' +
      '<button class="gnav-item" data-user-menu aria-label="Account" aria-haspopup="true" aria-expanded="false" style="width:auto;height:auto;padding:5px">' +
        '<span class="gnav-avatar">' + (p ? p.initials : '?') + '</span>' +
      '</button>';
  }

  /* User popover — identity, role, and the sign-out door. */
  function renderUserMenu(depth) {
    var p = profile();
    if (!p) return '';
    return '<div class="menu" id="user-menu" role="menu">' +
      '<div class="menu-head">' +
        '<div class="mh-n">' + p.person + '</div>' +
        '<div class="mh-e">' + p.email + '</div>' +
        '<div style="margin-top:7px"><span class="role-badge ' + p.role + '">' + p.label + '</span></div>' +
      '</div>' +
      '<div class="menu-sep"></div>' +
      '<a href="' + prefixed('screens/settings-profile.html', depth) + '" role="menuitem">' + ICON.user + 'Profile &amp; signature</a>' +
      '<a href="' + prefixed('screens/settings-integrations.html', depth) + '" role="menuitem">' + ICON.settings + 'Settings</a>' +
      '<div class="menu-sep"></div>' +
      '<button data-sign-out role="menuitem">' + ICON.signout + 'Sign out</button>' +
    '</div>';
  }

  /* Mobile bottom tabs. Five max; Workflow is a sheet, not a page. */
  function renderTabBar(opts) {
    var depth = opts.depth || 'root';
    var section = opts.section || 'cases';
    var hasCtx = !!opts.step;

    var tabs = visibleGlobalNav().map(function (n) {
      var cur = n.id === section ? ' aria-current="page"' : '';
      var badge = n.badge ? '<span class="tab-badge">' + n.badge + '</span>' : '';
      return '<a class="tab" href="' + prefixed(n.href, depth) + '"' + cur + '>' +
        ICON[n.icon] + badge + '<span>' + n.label + '</span></a>';
    });

    if (hasCtx) {
      tabs.splice(1, 0, '<button class="tab" data-open-drawer>' + ICON.steps + '<span>Workflow</span></button>');
    }
    return '<div class="tabbar-inner">' + tabs.join('') + '</div>';
  }

  function renderTopbar(opts) {
    var p = profile();
    return '<div class="topbar-l">' +
        (opts.step
          ? '<button class="icon-btn" data-open-drawer aria-label="Workflow steps">' + ICON.steps + '</button>'
          : '<span class="tb-mark">' + MARK + '</span>') +
        '<span class="tb-title">' + (opts.title || 'Cases') + '</span>' +
      '</div>' +
      '<div class="topbar-r">' +
        '<button class="icon-btn" data-theme-toggle-icon aria-label="Toggle appearance">' + ICON.sun + '</button>' +
        '<button class="icon-btn" data-user-menu aria-label="Account" aria-haspopup="true" aria-expanded="false">' +
          '<span class="gnav-avatar" style="width:28px;height:28px;font-size:.62rem">' + (p ? p.initials : '?') + '</span>' +
        '</button>' +
      '</div>';
  }

  /* ── contextual panel · case workflow ─────────────────────────────
     This is the SECOND navigation level: where am I inside this case.
     It only renders when a screen declares a step, so Settings and
     Admin get the wider two-column frame instead. */
  function renderContext(opts) {
    var depth = opts.depth || 'root';
    var current = opts.step;
    if (!current) return '';

    var state = readState();
    /* Badge from the REAL affirmation, not the preview override: the rail
       must not claim the gate is done when it is not. The link stays
       clickable either way, so the screen is still reachable. */
    var affirmed = gateAffirmed(state);
    var c = opts.caseInfo || {};

    var links = STEPS.map(function (s) {
      var locked = s.gated && !affirmed;
      var cur = s.id === current ? ' aria-current="page"' : '';
      var lockNote = locked
        ? '<span class="lk" title="Gate not yet affirmed — viewable in prototype">NOT AFFIRMED</span>'
        : '';
      return '<a class="step' + (locked ? ' locked' : '') + '" href="' + prefixed(s.href, depth) + '"' + cur + '>' +
        '<span class="ix">' + s.ix + '</span>' +
        '<span class="row-between" style="gap:6px"><span>' + s.label + '</span>' + lockNote + '</span>' +
        '</a>';
    }).join('');

    return '' +
      '<div class="ctx-head">' +
        '<a class="meta" href="' + prefixed('index.html', depth) + '" style="display:inline-flex;align-items:center;gap:5px">' +
          ICON.back + 'All cases</a>' +
      '</div>' +
      (c.patient ? '<div class="rail-case">' +
        '<p class="eyebrow" style="margin-bottom:4px">Active case</p>' +
        '<span class="who">' + c.patient + '</span>' +
        '<span class="dt">' + (c.caseId || '') + '</span>' +
        '<span class="dt">' + (c.payer || '') + '</span>' +
        (c.source ? '<span class="dt" style="margin-top:5px;color:var(--cool)">via ' + c.source + '</span>' : '') +
        '</div>' : '') +
      '<nav class="rail-group" aria-label="Authorization workflow">' +
        '<p class="eyebrow">Workflow</p>' + links +
      '</nav>' +
      '<div class="rail-foot">' +
        (c.deadline ? '<div class="callout" style="padding:10px 12px">' +
          '<div class="lbl" style="margin-bottom:2px">Decision due</div>' +
          '<span class="num" style="font-size:.8rem;color:var(--fg)">' + c.deadline + '</span>' +
        '</div>' : '') +
      '</div>';
  }

  /* ── signed-in identity bar ───────────────────────────────────────
     Answers "who am I right now, and what can I do" on every screen.
     The capability line is role-specific because that is the thing a
     person clicking through as three personas actually needs to see. */
  var ROLE_SUMMARY = {
    admin:   'Configures the practice. Cannot affirm a gate or sign a letter.',
    surgeon: 'Clinical authority. Affirms gates, annotates evidence, signs letters.',
    staff:   'Prepares and submits cases. Affirms nothing clinical.'
  };

  function renderSiteMap(role, depth) {
    function esc(t) {
      return String(t).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    var ix = 0;
    return '<p class="eyebrow" style="margin-bottom:var(--sp-3)">Every screen you can open</p>' +
      '<div class="g3" style="align-items:start">' +
      SITE_MAP.map(function (g) {
        return '<div class="smap-group" style="margin-top:0">' +
          '<p class="eyebrow">' + esc(g.group) + '</p>' +
          g.screens.map(function (sc) {
            ix += 1;
            return '<a class="smap-item" href="' + prefixed(sc.href, depth) + '">' +
              '<span class="sm-ix">' + String(ix < 10 ? '0' + ix : ix) + '</span>' +
              '<span><span class="sm-l">' + esc(sc.label) + '</span>' +
              '<span class="sm-n">' + esc((sc.note && sc.note[role]) || '') + '</span></span>' +
            '</a>';
          }).join('') +
        '</div>';
      }).join('') +
      '</div>';
  }

  function renderWhoami(depth) {
    var p = profile();
    if (!p) return '';
    return '<div class="whoami" data-od-id="whoami">' +
      '<span class="wa-av">' + p.initials + '</span>' +
      '<span>' +
        '<span class="wa-n">' + p.person + '</span>' +
        '<span class="wa-c"> · ' + (ROLE_SUMMARY[p.role] || '') + '</span>' +
      '</span>' +
      '<span class="wa-r">' +
        '<span class="role-badge ' + p.role + '">' + p.label + '</span>' +
        '<button class="btn btn-quiet btn-sm" data-toggle-sitemap aria-expanded="false">All screens</button>' +
        '<a class="btn btn-quiet btn-sm" href="' + prefixed('screens/login.html', depth) + '" data-switch-user>Switch user</a>' +
      '</span>' +
    '</div>' +
    '<div class="acc" id="site-map-panel"><div class="acc-in">' +
      '<div class="panel" style="margin-bottom:var(--sp-5)">' +
        renderSiteMap(p.role, depth) +
      '</div>' +
    '</div></div>';
  }

  /* ── mount ────────────────────────────────────────────────────────
     Renders BOTH navigation levels plus the mobile chrome, then wires
     the drawer, the user menu and the theme toggles. One call per
     screen; every screen gets identical chrome for free. */
  function shell(opts) {
    opts = opts || {};
    var depth = opts.depth || 'root';

    /* Auth boundary. A screen that names a section is behind the login. */
    if (opts.requireAuth !== false && !requireSession(depth)) return;

    var gnav = document.querySelector('[data-gnav]');
    if (gnav) gnav.innerHTML = renderGlobalNav(opts);

    var ctx = document.querySelector('[data-ctx]');
    if (ctx) ctx.innerHTML = renderContext(opts);

    /* The drawer mirrors the contextual panel for tablet/mobile, so
       there is one source of truth for workflow state. */
    var drawer = document.querySelector('[data-drawer]');
    if (drawer && opts.step) drawer.innerHTML = renderContext(opts);

    var who = document.querySelector('[data-whoami]');
    if (who) {
      who.innerHTML = renderWhoami(depth);

      /* Downstream screens shown by preview must say so. Without this a
         reviewer could read a rendered letter as evidence the gate was
         affirmed, which is exactly the confusion the gate exists to
         prevent. */
      if (opts.gatedScreen && !gateAffirmed() && previewUnlocked()) {
        var note = document.createElement('div');
        note.className = 'denied';
        note.style.marginBottom = 'var(--sp-5)';
        note.innerHTML =
          '<div class="lbl">Preview · the surgeon gate has not been affirmed</div>' +
          '<p>This screen is shown so the whole flow can be walked. In the ' +
          'real product it stays empty until the surgeon confirms the policy, ' +
          'section, pathway and operative plan — ' +
          '<a href="' + prefixed('screens/surgeon-gate.html', depth) +
          '" style="color:var(--accent)">affirm the gate</a> to see it arrive honestly.</p>';
        who.appendChild(note);
      }
    }

    var topbar = document.querySelector('[data-topbar]');
    if (topbar) topbar.innerHTML = renderTopbar(opts);

    var tabbar = document.querySelector('[data-tabbar]');
    if (tabbar) tabbar.innerHTML = renderTabBar(opts);

    /* User menu is appended once to <body> and positioned on open. */
    if (!document.getElementById('user-menu')) {
      var holder = document.createElement('div');
      holder.innerHTML = renderUserMenu(depth);
      if (holder.firstChild) document.body.appendChild(holder.firstChild);
    }

    applyTheme(readTheme());
    bindChrome(depth);
  }

  function bindChrome(depth) {
    var menu = document.getElementById('user-menu');
    var scrim = document.querySelector('[data-scrim]');
    var drawer = document.querySelector('[data-drawer]');

    function closeMenu() {
      if (!menu) return;
      menu.classList.remove('open');
      document.querySelectorAll('[data-user-menu]').forEach(function (b) {
        b.setAttribute('aria-expanded', 'false');
      });
    }
    function closeDrawer() {
      if (drawer) drawer.classList.remove('open');
      if (scrim) scrim.classList.remove('open');
      document.body.style.overflow = '';
    }

    document.addEventListener('click', function (ev) {
      /* theme — both the icon form and any legacy text button */
      if (ev.target.closest('[data-theme-toggle-icon], [data-theme-toggle]')) {
        ev.preventDefault();
        toggleTheme();
        return;
      }

      /* user menu */
      var trigger = ev.target.closest('[data-user-menu]');
      if (trigger && menu) {
        ev.preventDefault();
        var open = menu.classList.toggle('open');
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          var r = trigger.getBoundingClientRect();
          /* Anchor to the trigger, then clamp inside the viewport so the
             menu never hangs off-screen on a narrow window. */
          var top = r.bottom + 8;
          var left = r.left;
          menu.style.visibility = 'hidden';
          menu.style.top = top + window.pageYOffset + 'px';
          menu.style.left = left + 'px';
          var mw = menu.offsetWidth, mh = menu.offsetHeight;
          if (left + mw > window.innerWidth - 12) left = window.innerWidth - mw - 12;
          if (r.left > window.innerWidth / 2) left = Math.max(12, r.right - mw);
          if (top + mh > window.innerHeight - 12) top = Math.max(12, r.top - mh - 8);
          menu.style.top = top + window.pageYOffset + 'px';
          menu.style.left = Math.max(12, left) + 'px';
          menu.style.visibility = '';
        }
        return;
      }
      if (menu && menu.classList.contains('open') && !ev.target.closest('#user-menu')) closeMenu();

      /* sign out */
      if (ev.target.closest('[data-switch-user]')) {
        /* Clear first — otherwise requireSession() sees a live session on
           the login screen and redirects straight back into the app. */
        signOut();
        return;
      }

      if (ev.target.closest('[data-sign-out]')) {
        ev.preventDefault();
        signOut();
        window.location.href = depth === 'nested' ? 'login.html' : 'screens/login.html';
        return;
      }

      /* site map */
      var smt = ev.target.closest('[data-toggle-sitemap]');
      if (smt) {
        ev.preventDefault();
        var panel = document.getElementById('site-map-panel');
        if (panel) {
          var open = panel.classList.toggle('open');
          smt.setAttribute('aria-expanded', open ? 'true' : 'false');
          smt.textContent = open ? 'Hide screens' : 'All screens';
        }
        return;
      }

      /* workflow drawer */
      if (ev.target.closest('[data-open-drawer]')) {
        ev.preventDefault();
        if (drawer) drawer.classList.add('open');
        if (scrim) scrim.classList.add('open');
        document.body.style.overflow = 'hidden';
        return;
      }
      if (ev.target.closest('[data-close-drawer]') || ev.target.hasAttribute('data-scrim')) {
        closeDrawer();
      }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { closeMenu(); closeDrawer(); }
    });

    /* Leaving mobile width with the drawer open would strand the scrim
       over a layout that no longer has a drawer. */
    var mq = window.matchMedia('(min-width: 1100px)');
    var onChange = function (e) { if (e.matches) closeDrawer(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ── accordion helper ─────────────────────────────────────────────── */
  function bindDisclosure(root) {
    (root || document).querySelectorAll('[data-disclose]').forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute('data-disclose'));
      if (!panel) return;
      btn.setAttribute('aria-expanded', panel.classList.contains('open') ? 'true' : 'false');
      btn.setAttribute('aria-controls', panel.id);
      btn.addEventListener('click', function () {
        var open = panel.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        var cap = btn.querySelector('[data-disclose-label]');
        if (cap) cap.textContent = open ? (btn.dataset.labelOpen || 'Hide') : (btn.dataset.labelClosed || 'Show');
      });
    });
  }

  global.ASO = {
    primeTheme: primeTheme,
    persistent: persistent,
    shell: shell,
    ICON: ICON,
    ROLES: ROLES,
    readSession: readSession,
    writeSession: writeSession,
    signOut: signOut,
    currentRole: currentRole,
    profile: profile,
    can: can,
    requireSession: requireSession,
    siteMap: siteMap,
    connections: connections,
    connection: connection,
    readState: readState,
    writeState: writeState,
    gateCleared: gateCleared,
    gateAffirmed: gateAffirmed,
    previewUnlocked: previewUnlocked,
    setPreview: setPreview,
    bindDisclosure: bindDisclosure,
    readAnnotations: readAnnotations,
    saveAnnotation: saveAnnotation,
    deleteAnnotation: deleteAnnotation,
    annotationsFor: annotationsFor,
    includedAnnotations: includedAnnotations,
    ANNOTATION_TARGETS: ANNOTATION_TARGETS,
    MARK: MARK,
    WORDMARK: WORDMARK,
    STEPS: STEPS
  };
})(window);
