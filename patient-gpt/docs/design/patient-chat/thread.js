/* ASO patient chat · drawing a conversation.
   A conversation (see conversations.js) consumes AG-UI-shaped events one at
   a time: steps and tool calls go into the working disclosure, streamed text
   into prose, A2UI messages into allowlisted surfaces, state deltas into the
   shared case record. Scripts live in runs.js and runs-scope.js; the input
   box lives in composer.js. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var h = ASO.h;
  var D = ASO.data;

  var current = null;     /* the conversation in context: an empty draft or an opened chat */
  var pending = null;     /* a first message waiting for its conversation to open */
  var stick = true;
  var view = null;
  var reduce = g.matchMedia('(prefers-reduced-motion: reduce)');

  function scroll(t, force) {
    if (t !== current || !t.el.isConnected) return;
    if (force || stick) {
      view.scrollTop = view.scrollHeight;
      stick = true;
    }
  }

  function say(t, text) { if (!t.muted) t.text += ' ' + text; }

  function divider(t, label) { t.el.appendChild(h('p', { class: 'day', text: label })); }

  /* drawn by the app, not the assistant: the scope of this conversation changed */
  function contextLine(t, text) {
    t.el.appendChild(h('p', { class: 'ctx-line' }, [ASO.icon('user', 'od-fixed'), h('span', { text: text })]));
    scroll(t, true);
  }

  function addUser(t, text, docs) {
    var kids = [];
    if (docs && docs.length) {
      kids.push(h('ul', { class: 'bubble-docs' }, docs.map(function (d) {
        return h('li', { class: 'doc-chip od-row' }, [ASO.icon('doc', 'od-fixed'), h('span', { class: 'od-truncate', text: d.title })]);
      })));
    }
    kids.push(h('p', { class: 'bubble', text: text }));
    t.el.appendChild(h('article', { class: 'msg user', 'aria-label': 'You' }, kids));
    say(t, text);
    scroll(t, true);
  }

  /* ── drawing one agent turn ─────────────────────────────────────── */
  function startAgent(t) {
    var a = { steps: 0, calls: 0, tools: {}, t0: performance.now(), prose: null, buf: '' };
    a.label = h('span', { class: 'steps-label', text: 'Working' });
    a.list = h('ol', { class: 'steps-list' });
    a.details = h('details', { class: 'steps', hidden: true }, [
      h('summary', { class: 'steps-sum od-row' }, [ASO.sweep(), a.label, ASO.icon('chevDown', 'steps-chev od-fixed')]),
      a.list
    ]);
    a.body = h('div', { class: 'msg-body' });
    a.el = h('article', { class: 'msg agent', 'aria-label': 'Assistant', 'aria-busy': 'true' }, [a.details, a.body]);
    t.el.appendChild(a.el);
    t.agent = a;
    scroll(t);
  }

  function argText(delta) {
    try {
      var o = JSON.parse(delta);
      return Object.keys(o).map(function (k) { return o[k]; }).join(' · ');
    } catch (err) {
      return delta;
    }
  }

  function deltaLine(prev, k) {
    return h('p', { class: 'delta' }, [
      ASO.stateChip(prev),
      ASO.icon('arrowRight', 'od-fixed'),
      h('span', { class: 'sr-only', text: 'changed to' }),
      ASO.stateChip(k.state),
      h('span', { class: 'delta-what', text: k.sec + ' ' + k.name })
    ]);
  }

  function applyDelta(t, a, ops) {
    var c = D.cases[t.caseId];
    if (!c) return;
    var before = {};
    var said = {};
    var stage = D.stageInfo(c).label;
    c.order.forEach(function (id) { before[id] = c.criteria[id].state; });
    Object.keys(c.statements).forEach(function (id) { said[id] = 1; });
    ASO.stream.applyPatch(c, ops);
    c.order.forEach(function (id) {
      if (before[id] && c.criteria[id].state !== before[id]) a.body.appendChild(deltaLine(before[id], c.criteria[id]));
    });
    Object.keys(c.statements).forEach(function (id) {
      if (!said[id]) a.body.appendChild(h('p', { class: 'delta' }, [ASO.icon('check', 'od-fixed'), h('span', { class: 'delta-what', text: 'Recorded as a surgeon statement. It is not chart evidence.' })]));
    });
    /* the case moved along the state machine: say so where it happened */
    var now = D.stageInfo(c).label;
    if (now !== stage) {
      a.body.appendChild(h('p', { class: 'delta' }, [
        h('span', { class: 'delta-what', text: 'Case state' }), h('span', { class: 'delta-from', text: stage }),
        ASO.icon('arrowRight', 'od-fixed'), h('span', { class: 'sr-only', text: 'changed to' }), h('span', { class: 'delta-to', text: now })
      ]));
    }
    ASO.host.refresh();
    ASO.shell.refreshChrome();
  }

  /* The prompts worth asking next, for the case as it now stands. Drawn as an
     allowlisted surface; the question just asked is left out. */
  function suggest(t, a) {
    var asked = String(t.lastAsk || '').toLowerCase();
    var items = ASO.flows.promptsFor(t).filter(function (l) { return l.toLowerCase() !== asked; }).slice(0, 3);
    if (items.length) ASO.a2ui.apply(ASO.runs.suggest(items), a.body);
  }

  function finish(t, ev) {
    var a = t.agent;
    var stopped = !!(ev && ev.outcome === 'stopped');
    t.busy = false;
    t.player = null;
    if (a) {
      a.el.removeAttribute('aria-busy');
      if (a.prose) { a.prose.classList.remove('streaming'); a.prose = null; }
      if (a.steps) {
        var secs = Math.round((performance.now() - a.t0) / 1000);
        var lead = stopped ? 'Stopped' : (secs >= 1 ? 'Worked for ' + secs + 's' : 'Worked');
        a.label.textContent = lead + ' · ' + a.calls + (a.calls === 1 ? ' tool call' : ' tool calls');
      }
      if (stopped) a.body.appendChild(h('p', { class: 'stopped', text: 'Stopped. Nothing after this point was applied.' }));
    }
    if (ev && ev.outcome === 'interrupt') ASO.host.onInterrupt(t, ev.interrupt);
    if (t === current) {
      ASO.composer.sync();
      if (!t.instant) ASO.announce(stopped ? 'Assistant stopped.' : 'Assistant finished.');
    }
    scroll(t);
  }

  function handle(t, ev) {
    var a = t.agent;
    switch (ev.type) {
      case 'RUN_STARTED':
        startAgent(t);
        break;
      case 'STEP_STARTED':
        a.details.hidden = false;
        a.steps += 1;
        a.toolList = h('ul', { class: 'tools' });
        a.list.appendChild(h('li', { class: 'step' }, [h('span', { class: 'step-name', text: ev.stepName }), a.toolList]));
        a.label.textContent = ev.stepName;
        break;
      case 'TOOL_CALL_START':
        a.tools[ev.toolCallId] = { args: h('span', { class: 'tool-args' }), res: h('span', { class: 'tool-res' }) };
        a.toolList.appendChild(h('li', { class: 'tool' }, [
          h('code', { class: 'tool-name', text: ev.toolCallName }), a.tools[ev.toolCallId].args, a.tools[ev.toolCallId].res
        ]));
        a.calls += 1;
        break;
      case 'TOOL_CALL_ARGS':
        a.tools[ev.toolCallId].args.textContent = argText(ev.delta);
        break;
      case 'TOOL_CALL_RESULT':
        a.tools[ev.toolCallId].res.textContent = ev.content;
        break;
      case 'TEXT_MESSAGE_START':
        a.prose = h('p', { class: 'prose streaming' });
        a.buf = '';
        a.body.appendChild(a.prose);
        break;
      case 'TEXT_MESSAGE_CONTENT':
        a.prose.appendChild(document.createTextNode(ev.delta));
        a.buf += ev.delta;
        scroll(t);
        break;
      case 'TEXT_MESSAGE_END':
        a.prose.classList.remove('streaming');
        a.prose = null;
        say(t, a.buf);
        break;
      case 'STATE_DELTA':
        applyDelta(t, a, ev.delta);
        scroll(t);
        break;
      case 'CUSTOM':
        if (ev.name === 'a2ui') ASO.a2ui.apply(ev.value, a.body);
        else if (ev.name === 'aso.host') ASO.host.onCustom(t, ev.value);
        else if (ev.name === 'aso.surface' && D.cases[t.caseId]) ASO.a2ui.apply(ASO.runs.live(ev.value.kind, D.cases[t.caseId]), a.body);
        else if (ev.name === 'aso.suggest') suggest(t, a);
        scroll(t);
        break;
      case 'RUN_FINISHED':
        finish(t, ev);
        break;
      default:
        break;
    }
  }

  function run(t, events, opts) {
    if (t.busy) return;
    t.busy = true;
    t.instant = !!((opts && opts.instant) || reduce.matches);
    if (t === current) ASO.composer.sync();
    var deliverEvent = function (ev) { handle(t, ev); };
    if (t.instant) ASO.stream.flush(events, deliverEvent);
    else t.player = ASO.stream.play(events, deliverEvent);
  }

  function stop(t) {
    if (!t || !t.busy || !t.player) return;
    t.player.stop();
    finish(t, { outcome: 'stopped' });
  }

  /* filing is a host act: the document joins the patient chart, then the agent reads it */
  function file(t, d) {
    var p = D.patient(d.patientId);
    d.unfiled = false;
    d.caseId = t.caseId;
    p.inbox = p.inbox.filter(function (id) { return D.docs[id] !== d; });
  }

  function deliver(t, text, docs) {
    ASO.composer.hint('');
    if (!t.el.firstChild || t.when !== 'Today') divider(t, 'Today');
    ASO.convos.touch(t);
    docs.forEach(function (d) { file(t, d); });
    t.lastAsk = text;
    addUser(t, text, docs);
    run(t, ASO.runs.match(t, text, docs));
    ASO.shell.refreshChrome();
  }

  /* A first message commits the draft to its scope's history, then opens it. */
  function submit(text, docs) {
    var t = current;
    if (!t) return;
    if (t.busy) { ASO.composer.hint('The assistant is still working. Stop it or wait, then send.'); return; }
    if (t.draft) {
      ASO.convos.commit(t, text);
      pending = { id: t.id, text: text, docs: docs || [] };
      ASO.shell.go('#/chat/' + t.id);
      return;
    }
    deliver(t, text, docs || []);
  }

  function setCurrent(conv) {
    current = conv;
    stick = true;
  }

  /* the conversation is now in the view: draw seeded history, send anything waiting */
  function activate(conv) {
    ASO.convos.ensure(conv);
    if (pending && pending.id === conv.id) {
      var p = pending;
      pending = null;
      deliver(conv, p.text, p.docs);
    }
    ASO.composer.sync();
    scroll(conv, true);
  }

  /* A row set patient or case context: the same conversation narrows. */
  function setContext(t, x) {
    if (t.draft) { ASO.shell.go(x.caseId ? '#/c/' + x.caseId : '#/p/' + x.patientId); return; }
    var same = x.caseId ? t.caseId === x.caseId : (t.scope.kind === 'patient' && t.patientId === x.patientId);
    if (same) { ASO.composer.hint('This conversation is already in that context.'); return; }
    ASO.convos.rescope(t, x.caseId ? { kind: 'case', caseId: x.caseId } : { kind: 'patient', patientId: x.patientId });
    var p = D.patient(t.patientId);
    var label = 'Context set to ' + p.name + (x.caseId ? ' · ' + x.caseId : ' · whole chart');
    contextLine(t, label);
    ASO.shell.refreshChrome();
    ASO.composer.refresh();
    ASO.announce(label);
    run(t, ASO.runs.contextSet(t));
  }

  /* actions raised by allowlisted surfaces */
  function onUserAction(a) {
    var t = current;
    var x = a.context;
    if (a.name === 'open_source') { ASO.host.openSource(x.doc, x.page); return; }
    if (!t) return;
    if (t.busy) { ASO.composer.hint('The assistant is still working. Try again when it finishes.'); return; }
    if (a.name === 'set_context') { setContext(t, x); return; }
    if (a.name === 'run_prompt') { submit(x.prompt, []); return; }
    if (!D.cases[t.caseId]) {
      ASO.composer.hint('That belongs to a case. Set the case as the context first.');
      return;
    }
    if (a.name === 'answer_question') { ASO.flows.onAnswer(t, a); return; }
    if (a.name === 'send_staff_request') {
      ASO.a2ui.patch(a.surfaceId, '/status', { sent: true, at: ASO.clock() });
      run(t, ASO.flows.staffSent(t, x));
    }
  }

  function init() {
    view = document.getElementById('view');
    view.addEventListener('scroll', function () {
      stick = view.scrollHeight - view.scrollTop - view.clientHeight < 120;
    });
  }

  ASO.thread = {
    init: init, divider: divider, addUser: addUser, run: run, stop: stop, scroll: scroll,
    submit: submit, setCurrent: setCurrent, activate: activate, onUserAction: onUserAction,
    current: function () { return current; }
  };
})(window);
