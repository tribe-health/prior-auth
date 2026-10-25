/* ASO patient chat · allowlisted A2UI-shaped surface renderer.
   The assistant never sends HTML. It sends messages (createSurface,
   updateComponents, updateDataModel) describing a flat list of components
   from one catalog, plus a data model the components bind to by path.
   Only the components and actions named here render. Anything else, and
   in particular any affirmation, signing or submission control, is refused
   in place: those belong to the host (see host-controls.js). */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var h = ASO.h;
  var CATALOG = 'aso.workbench/v1';
  var ACTIONS = { answer_question: 1, send_staff_request: 1, open_source: 1, set_context: 1, run_prompt: 1 };
  var surfaces = {};

  function get(data, path) {
    if (!path || path === '/') return data;
    return path.split('/').slice(1).reduce(function (o, k) { return o == null ? undefined : o[k]; }, data);
  }
  function set(data, path, value) {
    if (!path || path === '/') return value;
    var keys = path.split('/').slice(1);
    var o = data;
    for (var i = 0; i < keys.length - 1; i += 1) {
      if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
    return data;
  }
  /* a prop is either a literal or a { path } binding into the data model */
  function val(s, v) {
    var bound = v && typeof v === 'object' && !Array.isArray(v) && typeof v.path === 'string' && Object.keys(v).length === 1;
    return bound ? get(s.data, v.path) : v;
  }
  function emit(s, name, context) {
    if (!ACTIONS[name]) return;
    if (ASO.thread) ASO.thread.onUserAction({ name: name, surfaceId: s.id, context: context || {} });
  }
  function refusal(what) {
    return h('p', { class: 'refused', role: 'note' }, [
      ASO.icon('lock', 'od-fixed'),
      h('span', { text: 'Refused: ' + what + ' is not on the surface allowlist.' })
    ]);
  }
  function cite(s, doc, page, fallback) {
    if (!doc || !ASO.data.docs[doc]) return h('span', { class: 'cite cite-none', text: fallback || 'no source' });
    var label = doc + (page ? ' p.' + page : '');
    return h('button', {
      class: 'cite', type: 'button', 'aria-label': 'Open source ' + label,
      onclick: function () { emit(s, 'open_source', { doc: doc, page: page }); }
    }, label);
  }
  function actionButton(s, action, cls) {
    if (!action || !ACTIONS[action.name]) return refusal('the action “' + (action && action.name) + '”');
    return h('button', {
      class: 'btn ' + (cls || 'primary'), type: 'button',
      onclick: function () { emit(s, action.name, action.context); }
    }, action.label);
  }

  var C = {};

  C.Column = function (s, c) { return h('div', { class: 'a-col' }, kids(s, c)); };
  C.Row = function (s, c) { return h('div', { class: 'a-row' }, kids(s, c)); };
  C.Section = function (s, c) {
    return h('section', { class: 'a-sec' }, [h('h3', { class: 'a-sec-h', text: c.title })].concat(kids(s, c)));
  };
  C.Text = function (s, c) {
    var t = val(s, c.text);
    return h('p', { class: 'a-text a-' + (c.variant || 'body'), text: t == null ? '' : String(t) });
  };
  C.Citation = function (s, c) { return cite(s, val(s, c.doc), val(s, c.page), c.fallback); };
  C.Button = function (s, c) { return actionButton(s, c.action, c.variant); };

  C.CaseHeader = function (s, c) {
    var v = val(s, c.value) || {};
    var rows = [['Patient', v.patient], ['Case', v.id], ['Procedure', v.procedure], ['Codes', v.codes],
      ['Payer', v.payer], ['Policy', v.policy], ['Status', v.status]];
    return h('dl', { class: 'a-facts' }, rows.filter(function (r) { return !!r[1]; }).map(function (r) {
      return h('div', { class: 'a-fact' }, [h('dt', { text: r[0] }), h('dd', { text: r[1] })]);
    }));
  };

  C.CriteriaList = function (s, c) {
    var items = val(s, c.items) || [];
    if (!items.length) return h('p', { class: 'a-empty', text: 'No policy criteria are matched to this case yet.' });
    return h('ul', { class: 'a-crit' }, items.map(function (k) {
      var list = k.cites && k.cites.length ? k.cites : [{ doc: k.doc, page: k.page }];
      return h('li', { class: 'a-crit-row' }, [
        h('div', null, ASO.stateChip(k.state)),
        h('div', { class: 'od-field od-fill' }, [
          h('span', { class: 'a-crit-name' }, [h('span', { class: 'sec od-nowrap', text: k.sec }), ' ', k.name]),
          h('span', { class: 'a-crit-ev', text: k.evidence }),
          h('span', { class: 'a-cites od-cluster' }, list.map(function (x) { return cite(s, x.doc, x.page, k.cite); }))
        ])
      ]);
    }));
  };

  C.ConflictList = function (s, c) {
    var items = val(s, c.items) || [];
    if (!items.length) return h('p', { class: 'a-empty', text: 'None on file.' });
    return h('ul', { class: 'a-list' }, items.map(function (x) {
      return h('li', { class: 'a-item' }, [
        h('span', { class: 'a-item-h od-cluster' }, [
          h('span', { class: 'a-kind', text: x.kind }),
          h('span', { class: 'a-owner', text: x.resolved ? 'Clarified by surgeon' : 'Open' })
        ]),
        h('span', { class: 'a-item-t', text: x.text }),
        x.statement ? h('span', { class: 'a-stmt', text: 'Surgeon statement: ' + x.statement }) : null,
        h('span', { class: 'a-cites od-cluster' }, [cite(s, x.doc, x.page)])
      ]);
    }));
  };

  C.BlockerList = function (s, c) {
    var items = val(s, c.items) || [];
    if (!items.length) return h('p', { class: 'a-empty', text: 'No open blockers.' });
    return h('ul', { class: 'a-list' }, items.map(function (b) {
      return h('li', { class: 'a-item' }, [
        h('span', { class: 'a-item-t', text: b.text }),
        h('span', { class: 'a-item-h od-cluster' }, [h('span', { class: 'a-owner', text: b.owner })])
      ]);
    }));
  };

  C.NextMove = function (s, c) {
    var action = c.action ? h('div', { class: 'a-actions od-cluster' }, [actionButton(s, c.action)]) : null;
    return h('div', { class: 'a-item' }, [h('p', { class: 'a-next', text: String(val(s, c.text) || '') }), action]);
  };

  /* The coach asks one question at a time and records the answer as the
     surgeon's own statement. Once answered, the surface locks. */
  C.ChoiceQuestion = function (s, c) {
    var ans = val(s, c.answer);
    var name = s.id + '-' + c.id;
    var box = h('div', { class: 'a-q' });
    box.appendChild(h('p', { class: 'a-q-ask', id: name + '-ask', text: c.ask }));
    if (c.basis) box.appendChild(h('p', { class: 'a-q-basis', text: c.basis }));
    if (c.doc) box.appendChild(h('p', { class: 'a-cites od-cluster' }, [cite(s, c.doc, c.page)]));
    if (ans) {
      box.appendChild(h('p', { class: 'a-q-done' }, [
        ASO.icon('check', 'od-fixed'),
        h('span', { text: 'Recorded at ' + ans.at + ': ' + ans.label + (ans.note ? ' “' + ans.note + '”' : '') })
      ]));
      return box;
    }
    var fs = h('fieldset', { class: 'a-q-opts', 'aria-labelledby': name + '-ask' });
    (c.options || []).forEach(function (o, i) {
      var id = name + '-' + i;
      fs.appendChild(h('label', { class: 'a-q-opt od-row', for: id }, [
        h('input', { type: 'radio', name: name, id: id, value: o.value }),
        h('span', { class: 'od-fill', text: o.label })
      ]));
    });
    box.appendChild(fs);
    var note = null;
    if (c.noteLabel) {
      var nid = name + '-note';
      note = h('textarea', { id: nid, rows: '2', class: 'a-q-note' });
      box.appendChild(h('div', { class: 'od-field' }, [h('label', { for: nid, class: 'a-q-label', text: c.noteLabel }), note]));
    }
    var err = h('p', { class: 'a-q-err', role: 'alert', hidden: true, text: 'Choose one answer before recording.' });
    box.appendChild(err);
    box.appendChild(h('div', { class: 'a-actions od-cluster' }, [
      h('button', {
        class: 'btn primary', type: 'button',
        onclick: function () {
          var sel = fs.querySelector('input:checked');
          if (!sel) {
            err.hidden = false;
            var firstOpt = fs.querySelector('input');
            if (firstOpt) firstOpt.focus();
            return;
          }
          err.hidden = true;
          var opt = (c.options || []).filter(function (o) { return o.value === sel.value; })[0];
          emit(s, 'answer_question', { question: c.id, value: sel.value, label: opt.label, note: note ? note.value.trim() : '' });
        }
      }, 'Record my answer')
    ]));
    return box;
  };

  C.StaffRequest = function (s, c) {
    var status = val(s, c.status) || {};
    var to = val(s, c.to);
    var foot = status.sent
      ? h('p', { class: 'a-sent' }, [ASO.icon('check', 'od-fixed'), h('span', { text: 'Sent to ' + to + ' at ' + status.at })])
      : h('div', { class: 'a-actions od-cluster' }, [actionButton(s, { name: 'send_staff_request', label: 'Send to ' + to, context: { to: to, items: val(s, c.items) || [] } })]);
    return h('div', { class: 'a-q' }, [
      h('p', { class: 'a-q-ask', text: 'Request for ' + to }),
      h('p', { class: 'a-q-basis', text: c.role }),
      h('ul', { class: 'a-req-items' }, (val(s, c.items) || []).map(function (t) { return h('li', { text: t }); })),
      foot
    ]);
  };

  /* Each row puts the conversation in the context of one patient, or one of
     that patient's cases. This is how a chat that started with every patient
     in scope narrows to one. */
  C.ContextList = function (s, c) {
    var items = val(s, c.items) || [];
    if (!items.length) return h('p', { class: 'a-empty a-pad', text: 'Nothing matches.' });
    return h('ul', { class: 'a-ctx' }, items.map(function (it) {
      return h('li', null, h('button', {
        class: 'q-row', type: 'button',
        onclick: function () { emit(s, 'set_context', { patientId: it.patientId, caseId: it.caseId || null }); }
      }, [
        h('span', { class: 'od-field' }, [
          h('span', { class: 'q-name', text: it.title }),
          h('span', { class: 'q-title od-clamp-2', text: it.sub })
        ]),
        h('span', { class: 'od-field' }, [
          it.meta ? h('span', { class: 'q-due' + (it.soon ? ' soon' : ''), text: it.meta }) : null,
          h('span', { class: 'ctx-go', text: it.caseId ? 'Set case context' : 'Set patient context' })
        ])
      ]));
    }));
  };

  C.DocumentList = function (s, c) {
    var items = val(s, c.items) || [];
    if (!items.length) return h('p', { class: 'a-empty a-pad', text: 'No documents on file.' });
    return h('ul', { class: 'a-docs' }, items.map(function (d) {
      return h('li', { class: 'doc-row' }, [
        h('span', null, cite(s, d.doc, d.page)),
        h('span', { class: 'od-field' }, [
          h('span', { class: 'doc-title', text: d.title }),
          h('span', { class: 'doc-sub', text: d.sub })
        ])
      ]);
    }));
  };

  /* Points with their sources: a peer-to-peer brief, or any list of claims. */
  C.PointList = function (s, c) {
    var items = val(s, c.items) || [];
    if (!items.length) return h('p', { class: 'a-empty', text: 'Nothing to list.' });
    return h('ol', { class: 'a-list a-points' }, items.map(function (p) {
      return h('li', { class: 'a-item' }, [
        h('span', { class: 'a-item-t', text: p.text }),
        (p.cites || []).length ? h('span', { class: 'a-cites od-cluster' }, p.cites.map(function (x) { return cite(s, x.doc, x.page); })) : null
      ]);
    }));
  };

  /* What to ask next. Each one sends its prompt as the surgeon's next message. */
  C.Suggestions = function (s, c) {
    var items = val(s, c.items) || [];
    return h('div', { class: 'a-sugg od-cluster', role: 'group', 'aria-label': 'Suggested next prompts' }, items.map(function (it) {
      return h('button', {
        class: 'chip', type: 'button',
        onclick: function () { emit(s, 'run_prompt', { prompt: it.prompt }); }
      }, it.label);
    }));
  };

  function node(s, id) {
    var c = s.components[id];
    if (!c) return refusal('the component “' + id + '”');
    var fn = C[c.component];
    if (!fn) return refusal('“' + c.component + '”');
    return fn(s, c);
  }
  function kids(s, c) { return (c.children || []).map(function (id) { return node(s, id); }); }

  function render(s) {
    ASO.fill(s.el, s.catalog === CATALOG ? node(s, 'root') : refusal('the catalog “' + s.catalog + '”'));
  }

  /* Apply a batch of A2UI messages. New surfaces mount into `mount`. */
  function apply(messages, mount) {
    var touched = {};
    messages.forEach(function (m) {
      var s;
      if (m.createSurface) {
        s = { id: m.createSurface.surfaceId, catalog: m.createSurface.catalogId, components: {}, data: {} };
        s.el = h('div', { class: 'surface', 'data-surface': s.id });
        surfaces[s.id] = s;
        if (mount) mount.appendChild(s.el);
        touched[s.id] = 1;
      } else if (m.updateComponents) {
        s = surfaces[m.updateComponents.surfaceId];
        if (!s) return;
        m.updateComponents.components.forEach(function (c) { s.components[c.id] = c; });
        touched[s.id] = 1;
      } else if (m.updateDataModel) {
        s = surfaces[m.updateDataModel.surfaceId];
        if (!s) return;
        s.data = set(s.data, m.updateDataModel.path, m.updateDataModel.value);
        touched[s.id] = 1;
      } else if (m.deleteSurface) {
        s = surfaces[m.deleteSurface.surfaceId];
        if (!s) return;
        s.el.remove();
        delete surfaces[s.id];
        delete touched[s.id];
      }
    });
    Object.keys(touched).forEach(function (id) { if (surfaces[id]) render(surfaces[id]); });
  }

  function patch(surfaceId, path, value) {
    apply([{ updateDataModel: { surfaceId: surfaceId, path: path, value: value } }], null);
  }

  ASO.a2ui = { apply: apply, patch: patch, catalog: CATALOG, components: Object.keys(C) };
})(window);
