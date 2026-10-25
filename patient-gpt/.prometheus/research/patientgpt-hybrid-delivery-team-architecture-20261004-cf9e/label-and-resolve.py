import json,pathlib
P=pathlib.Path(__file__).resolve().parent
reg=json.loads((P/'sources/registry.json').read_text())['sources']; by={s['url']:s for s in reg}; aliases={a:s for s in reg for a in s['aliases']}
d=json.loads((P/'sources/credibility.json').read_text())
checked={'storage-identity:'+x for x in ['app-services','forge-db-port','forge-postgres','browser-storage','browser-bootstrap','graph-scope','browser-adoption-block','desktop-baseline','fabric-projection-port','fabric-surreal-crdt','fabric-surreal-projection','fabric-version','gate-kratos','parent-kratos','kratos-browser-proxy','patient-data-model','patient-pins','gate-deployment','forge-ci','fabric-docs']}
checked|={'uar:U1','uar:U4','uar:U5','ui-platforms:pg-contract','ui-platforms:pg-waypoint'}
for s in d['verified_sources']+d['filtered_sources']:
 r=by[s['url']]; chunks=[json.loads((P/'sources'/(c+'.json')).read_text())['text'] for c in r['chunk_ids']]
 for c in s['claims']:
  if r['retrieval_status']=='blocked': c.update(label='blocked',evidence='Recorded retrieval failed. '+r['evidenceSummary'])
  elif any(a in checked for a in r['aliases']): c.update(label='verified',evidence='Static source support only; no runtime claim. '+r.get('path','')+'; retained excerpts: '+', '.join(r['chunk_ids'])+'\n'+'\n'.join(chunks)[:1500])
  else: c.update(label='unverified',evidence='Worker dossier claim retained without exact-claim re-verification in assembly. '+('Web page not refetched; only explicitly labeled summary retained.' if r['retrieval_status']=='dossier-summary-only' else 'Local excerpt retained for reviewer inspection.'))
 s['flags'].append('source-only-no-runtime-certification')
d['assembly_limitations']=['Heuristic scores are not probabilities; file URLs have no domain-authority signal and source-code punctuation can inflate citation-depth signal. Do not rank architecture choices by these scores.','No external sycophancy detector or Feynman inference was invoked; independent review remains pending.','Filtered sources retained as low-score context, not upgraded by source location.','Verified labels mean exact static source support only.']
(P/'sources/credibility.json').write_text(json.dumps(d,indent=2)+'\n')
entries=[]
def add(id,topic,a,b,resolved,resolution):
 sa,sb=aliases[a],aliases[b]
 entries.append(dict(id=id,topic=topic,claim_a=dict(text=sa['claims'][0]['text'],source=sa['url']),claim_b=dict(text=sb['claims'][0]['text'],source=sb['url']),resolved=resolved,label='inferred' if resolved else 'blocked',resolution=resolution,strategy='direct operator scope and source-boundary reconciliation',confidence=.9 if resolved else .5))
add('contra-001','Desktop database selection','storage-identity:desktop-baseline','storage-identity:fabric-version',False,'Operator requests embedded SurrealDB 3.3.0; parent SQLite preference is not a substitute and Fabric resolves 3.1.5. Native adapter and exact version compatibility need work.')
add('contra-002','Reusable browser materializer versus blocked adoption','storage-identity:browser-bootstrap','storage-identity:browser-adoption-block',True,'Opening PGlite is distinct from approving the clinical materializer. Preserve memory gate and no silent fallback; recorded block remains.')
add('contra-003','Native session header across adapters','storage-identity:gate-kratos','storage-identity:parent-kratos',False,'Gate selects Authorization/Cookie; host sends x-session-token for native sessions. Freeze and exercise explicit credential translation before declaring parity.')
add('contra-004','A2UI complete custom catalog versus closed UAR catalog','uar:U7','uar:P1',False,'Full registered component goal remains mandatory. Define versioned component contracts and extend runtime admission and both shell registries as needed; a first increment cannot waive the final catalog.')
add('contra-005','UAR document checkpoint versus narrow executable team profile','uar:U1','uar:U4',True,'Older README only establishes document checkpoint. Newer migration describes narrow team execution with explicit unsupported fields; source availability is not installed-runtime certification.')
add('contra-006','Generic UI guidance versus incumbent product authority','ui-platforms:pg-contract','ui-platforms:hybrid-tokens',True,'Preserve prototype three fonts and existing design. Generic token advice does not override operator design authority.')
add('contra-007','CI test example versus PatientGPT local-only policy','storage-identity:forge-ci','storage-identity:patient-pins',True,'Do not copy sibling CI tests. CI can build/lint/typecheck/package; all tests wait for completed full-phase local integration.')
(P/'contradictions.json').write_text(json.dumps(dict(contradictions=entries,detection={'method':'manual source-boundary comparison','semantic_inference_model':'not invoked','limits':'Not an exhaustive semantic contradiction scan.'}),indent=2)+'\n')
# Mark factual source summaries used as headline evidence; recommendations remain inferred.
critical=['storage-identity:app-services','storage-identity:browser-adoption-block','storage-identity:desktop-baseline','storage-identity:fabric-version','uar:U1','uar:U4','uar:U5','uar:U7','uar:P1','ui-platforms:pg-contract']
(P/'critical-claims.txt').write_text('\n'.join(aliases[a]['claims'][0]['text'] for a in critical)+'\n')
print('Static labels assigned conservatively; 7 contradictions, 3 unresolved; review not invoked')
