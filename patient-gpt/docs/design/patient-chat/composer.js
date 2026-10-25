/* ASO patient chat · the composer.
   One input box for every scope. Its placeholder, suggested prompts and
   attach menu follow the conversation in context: all patients, one patient,
   or one case, where the prompts also follow the case's state. It sits inside the page on wide home, patient
   and case context views, and docks at the bottom on phones and in chats. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var h = ASO.h;
  var D = ASO.data;

  var el = {};
  var pending = [];      /* documents attached to the next message */
  var rec = null;
  var wide = g.matchMedia('(min-width: 768px)');

  function kind() {
    var t = ASO.thread.current();
    return t ? t.scope.kind : 'global';
  }

  function hint(text) {
    el.hint.textContent = text || '';
    el.hint.hidden = !text;
  }

  function grow() {
    el.input.style.height = 'auto';
    el.input.style.height = Math.min(el.input.scrollHeight, 200) + 'px';
  }

  function sync() {
    var t = ASO.thread.current();
    var busy = !!(t && t.busy);
    ASO.fill(el.send, ASO.icon(busy ? 'stop' : 'up'));
    el.send.setAttribute('aria-label', busy ? 'Stop the assistant' : 'Send message');
    el.send.disabled = !busy && !el.input.value.trim() && !pending.length;
    el.chips.hidden = busy || !el.chips.firstChild;
  }

  function renderTray() {
    ASO.fill(el.tray, pending.map(function (d) {
      return h('li', { class: 'doc-chip od-row' }, [
        ASO.icon('doc', 'od-fixed'),
        h('span', { class: 'od-truncate', text: d.title }),
        h('button', {
          class: 'icon-btn od-fixed', type: 'button', 'aria-label': 'Remove ' + d.title,
          onclick: function () {
            pending = pending.filter(function (x) { return x !== d; });
            renderTray();
            sync();
            el.input.focus();
          }
        }, ASO.icon('x'))
      ]);
    }));
  }

  function renderChips() {
    ASO.fill(el.chips, ASO.flows.promptsFor(ASO.thread.current()).map(function (label) {
      return h('button', { class: 'chip', type: 'button', onclick: function () { ASO.thread.submit(label, []); } }, label);
    }));
  }

  function clear() {
    el.input.value = '';
    pending = [];
    renderTray();
    grow();
    sync();
  }

  /* documents are filed into a case, so attaching needs a case in context */
  function attachItems() {
    var t = ASO.thread.current();
    if (!t || t.scope.kind !== 'case') return [{ note: 'Set a case as the context to attach a chart document.' }];
    var p = D.patient(t.patientId);
    var inbox = p.inbox.map(function (id) { return D.docs[id]; }).filter(function (d) { return pending.indexOf(d) < 0; });
    var items = [{ heading: 'Unfiled for ' + p.name }];
    if (!inbox.length) items.push({ note: 'Nothing is waiting to be filed.' });
    inbox.forEach(function (d) {
      items.push({
        icon: 'doc', label: d.title, sub: d.received + ' · ' + d.pages + ' pages',
        onSelect: function () {
          pending.push(d);
          renderTray();
          sync();
          el.input.focus();
        }
      });
    });
    if (t.caseId === 'PA-2026-0431') {
      /* published copies link to the consult capture prototype at its own permanent address */
      var hosted = /\/ip[fn]s\//.test(location.pathname);
      items.push({ icon: 'ext', label: 'Open consult capture', sub: 'Voice-coached visit, September 24', target: '_blank',
        href: hosted ? 'https://ipfs.prometheusags.ai/ipns/k51qzi5uqu5dkaspanc9zhe05rev8fs7w54vg5sqpr71uxfbn3fcl02odrbwep/' : 'consult-capture-htmx.html' });
    }
    return items;
  }

  function send() {
    var text = el.input.value.trim();
    var docs = pending.slice();
    var t = ASO.thread.current();
    if (!text && !docs.length) return;
    if (t && t.busy) { hint('The assistant is still working. Stop it or wait, then send.'); return; }
    clear();
    ASO.thread.submit(text || 'Read this and update the criteria.', docs);
  }

  /* real dictation where the browser offers it; a plain message where it does not */
  function toggleMic() {
    var SR = g.SpeechRecognition || g.webkitSpeechRecognition;
    if (rec) { rec.stop(); return; }
    if (!SR) { hint('Dictation needs a browser with speech recognition. Type your message instead.'); return; }
    try {
      var base = el.input.value;
      rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.onresult = function (e) {
        var s = '';
        for (var i = 0; i < e.results.length; i += 1) s += e.results[i][0].transcript;
        el.input.value = (base ? base + ' ' : '') + s;
        grow();
        sync();
      };
      rec.onerror = function () { hint('The microphone is not available here. Type your message instead.'); };
      rec.onend = function () {
        rec = null;
        el.mic.setAttribute('aria-pressed', 'false');
        if (el.hint.textContent.indexOf('Listening') === 0) hint('');
      };
      rec.start();
      el.mic.setAttribute('aria-pressed', 'true');
      hint('Listening. Press the microphone again to stop.');
    } catch (err) {
      rec = null;
      hint('The microphone is not available here. Type your message instead.');
    }
  }

  function place() {
    var slot = document.querySelector('[data-composer-slot]');
    var target = slot && wide.matches ? slot : el.dock;
    if (el.wrap.parentNode !== target) target.appendChild(el.wrap);
    el.dock.hidden = el.wrap.parentNode !== el.dock;
  }

  /* called whenever the conversation in context, or its scope, changes */
  function refresh() {
    var t = ASO.thread.current();
    var k = kind();
    pending = [];
    hint('');
    el.input.placeholder = k === 'case' ? 'Message about ' + t.caseId
      : k === 'patient' ? 'Ask about ' + D.patient(t.patientId).first + '’s chart, or open a new case'
        : 'Ask about any patient or case';
    renderTray();
    renderChips();
    place();
    sync();
  }

  function init() {
    el.dock = document.getElementById('dock');
    el.wrap = document.getElementById('composer-wrap');
    el.form = document.getElementById('composer');
    el.input = document.getElementById('prompt');
    el.send = document.getElementById('send-btn');
    el.mic = document.getElementById('mic-btn');
    el.attach = document.getElementById('attach-btn');
    el.chips = document.getElementById('chips');
    el.tray = document.getElementById('tray');
    el.hint = document.getElementById('composer-hint');

    el.form.addEventListener('submit', function (e) {
      var t = ASO.thread.current();
      e.preventDefault();
      if (t && t.busy) ASO.thread.stop(t);
      else send();
    });
    el.input.addEventListener('input', function () { grow(); sync(); });
    el.input.addEventListener('keydown', function (e) {
      var t = ASO.thread.current();
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      if (!(t && t.busy)) send();
    });
    el.mic.addEventListener('click', toggleMic);
    el.attach.addEventListener('click', function () {
      ASO.menu(el.attach, attachItems(), { place: 'above-start', label: 'Attach' });
    });
    if (wide.addEventListener) wide.addEventListener('change', place);
  }

  ASO.composer = {
    init: init, refresh: refresh, sync: sync, hint: hint, chips: function () { renderChips(); sync(); },
    focus: function () { el.input.focus(); }
  };
})(window);
