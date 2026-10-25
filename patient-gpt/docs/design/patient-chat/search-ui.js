/* ASO patient chat · search dialog.
   The dialog over the simulated vector index in search.js. Results are
   grouped per case; choosing one puts the chat in that context and, for a
   chart passage, opens the source beside it. */
(function (g) {
  'use strict';
  var ASO = g.ASO = g.ASO || {};
  var h = ASO.h;
  var dlg, input, list, status;

  function openHit(hit) {
    dlg.close();
    if (hit.convId) { ASO.shell.go('#/chat/' + hit.convId); return; }
    ASO.shell.go(hit.caseId ? '#/c/' + hit.caseId : '#/p/' + hit.patientId);
    if (hit.doc) ASO.host.openSource(hit.doc, hit.page);
  }

  function render() {
    var q = input.value.trim();
    var st = ASO.search.stats();
    status.textContent = 'Vector search over ' + st.passages + ' embedded passages in ' + st.cases + ' cases. Embeddings are simulated in this prototype.';
    if (!q) {
      ASO.fill(list, h('li', { class: 'search-empty', text: 'Describe what you are looking for: a symptom, a finding, a document, a payer or a case number. Matches do not need the same words.' }));
      return;
    }
    var groups = ASO.search.group(ASO.search.query(q, { limit: 12 }));
    if (!groups.length) {
      ASO.fill(list, h('li', { class: 'search-empty', text: 'No embedded passage is close to “' + q + '”. Try other words for the same idea.' }));
      return;
    }
    ASO.fill(list, groups.map(function (grp) {
      return h('li', { class: 'search-group' }, [
        h('p', { class: 'search-group-h' }, [grp.title + ' ', h('span', { class: 'search-group-sub', text: grp.sub })]),
        h('ul', { class: 'search-group' }, grp.hits.map(function (hit) {
          return h('li', null, h('button', { class: 'search-item od-row', type: 'button', onclick: function () { openHit(hit); } }, [
            h('span', { class: 'search-kind od-fixed', text: hit.kind }),
            h('span', { class: 'od-field od-fill' }, [
              h('span', { class: 'search-label', text: hit.kind === 'Chat' ? hit.title + ' · ' + hit.label : hit.label }),
              h('span', { class: 'search-text od-clamp-2', text: hit.show })
            ]),
            h('span', { class: 'search-score od-fixed od-nowrap', 'aria-label': 'Similarity ' + hit.score.toFixed(2), text: hit.score.toFixed(2) })
          ]));
        }))
      ]);
    }));
  }

  function open() {
    if (dlg.open || typeof dlg.showModal !== 'function') return;
    ASO.shell.closeDrawer();
    input.value = '';
    render();
    dlg.showModal();
    input.focus();
  }

  function init() {
    dlg = document.getElementById('search');
    input = document.getElementById('search-input');
    list = document.getElementById('search-results');
    status = document.getElementById('search-status');

    document.getElementById('open-search').addEventListener('click', open);
    document.getElementById('search-close').addEventListener('click', function () { dlg.close(); });
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      var firstHit = list.querySelector('.search-item');
      if (!firstHit) return;
      if (e.key === 'Enter') { e.preventDefault(); firstHit.click(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); firstHit.focus(); }
    });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open(); }
    });
  }

  ASO.searchUI = { init: init, open: open };
})(window);
