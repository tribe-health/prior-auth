/* ASO patient chat · AG-UI-shaped event stream (simulated).
   A run is a list of { at, ev } where `at` is a millisecond offset and `ev`
   uses AG-UI event names: RUN_STARTED, STEP_STARTED / STEP_FINISHED,
   TOOL_CALL_START / ARGS / END / RESULT, TEXT_MESSAGE_START / CONTENT / END,
   STATE_DELTA (JSON Patch), CUSTOM and RUN_FINISHED. An interrupt is a
   RUN_FINISHED with outcome "interrupt": the agent pauses and the host
   decides what to draw. Playback is timestamp-based, not tick-counted, so a
   backgrounded tab catches up instead of drifting. Pure: no DOM here. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};

  function builder(threadId) {
    var runId = ASO.uid('run');
    var t = 0;
    var evs = [];

    function push(ev, dt) {
      t += dt || 0;
      evs.push({ at: t, ev: ev });
    }

    push({ type: 'RUN_STARTED', threadId: threadId, runId: runId });

    var api = {
      /* tools: [{ name, args, result, ms }] */
      step: function (name, tools) {
        push({ type: 'STEP_STARTED', stepName: name }, 160);
        (tools || []).forEach(function (tc) {
          var id = ASO.uid('tc');
          push({ type: 'TOOL_CALL_START', toolCallId: id, toolCallName: tc.name }, 120);
          push({ type: 'TOOL_CALL_ARGS', toolCallId: id, delta: JSON.stringify(tc.args || {}) }, 60);
          push({ type: 'TOOL_CALL_END', toolCallId: id }, 20);
          push({ type: 'TOOL_CALL_RESULT', toolCallId: id, content: tc.result }, tc.ms || 560);
        });
        push({ type: 'STEP_FINISHED', stepName: name }, 80);
        return api;
      },
      text: function (str) {
        var id = ASO.uid('msg');
        push({ type: 'TEXT_MESSAGE_START', messageId: id, role: 'assistant' }, 220);
        (str.match(/\S+\s*/g) || []).forEach(function (chunk) {
          push({ type: 'TEXT_MESSAGE_CONTENT', messageId: id, delta: chunk }, 28);
        });
        push({ type: 'TEXT_MESSAGE_END', messageId: id }, 20);
        return api;
      },
      /* A2UI messages travel as one CUSTOM event */
      surface: function (messages) {
        push({ type: 'CUSTOM', name: 'a2ui', value: messages }, 260);
        return api;
      },
      custom: function (name, value) {
        push({ type: 'CUSTOM', name: name, value: value }, 200);
        return api;
      },
      /* shared state changes as JSON Patch operations */
      state: function (ops) {
        push({ type: 'STATE_DELTA', delta: ops }, 240);
        return api;
      },
      finish: function () {
        push({ type: 'RUN_FINISHED', threadId: threadId, runId: runId, outcome: 'success' }, 140);
        return evs;
      },
      interrupt: function (payload) {
        push({ type: 'RUN_FINISHED', threadId: threadId, runId: runId, outcome: 'interrupt', interrupt: payload }, 140);
        return evs;
      }
    };
    return api;
  }

  /* Deliver events on their timestamps. Returns a handle with stop(). */
  function play(events, onEvent) {
    var start = performance.now();
    var i = 0;
    var timer = null;
    var stopped = false;

    function tick() {
      if (stopped) return;
      var now = performance.now() - start;
      while (i < events.length && events[i].at <= now) {
        onEvent(events[i].ev);
        i += 1;
        if (stopped) return;
      }
      if (i >= events.length) return;
      timer = setTimeout(tick, Math.max(0, events[i].at - (performance.now() - start)));
    }

    tick();
    return {
      stop: function () {
        stopped = true;
        if (timer) clearTimeout(timer);
      }
    };
  }

  /* Deliver everything at once: seeded history and reduced-motion playback. */
  function flush(events, onEvent) {
    events.forEach(function (e) { onEvent(e.ev); });
  }

  /* Minimal JSON Patch: add, replace, remove on object paths. */
  function applyPatch(root, ops) {
    ops.forEach(function (op) {
      var keys = op.path.split('/').slice(1).map(function (k) {
        return k.replace(/~1/g, '/').replace(/~0/g, '~');
      });
      var last = keys.pop();
      var o = root;
      keys.forEach(function (k) {
        if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
        o = o[k];
      });
      if (op.op === 'remove') delete o[last];
      else o[last] = op.value;
    });
    return root;
  }

  ASO.stream = { builder: builder, play: play, flush: flush, applyPatch: applyPatch };
})(window);
