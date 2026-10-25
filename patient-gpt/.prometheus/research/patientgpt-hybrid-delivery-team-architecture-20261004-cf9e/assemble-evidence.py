import json,re,pathlib,hashlib,datetime
P=pathlib.Path(__file__).resolve().parent
D=P.parent.parent/'team-research'
S=P/'sources'; S.mkdir(exist_ok=True)
def write(p,v): p.write_text(json.dumps(v,indent=2)+'\n')
registry=[]; byurl={}; counter=0
for domain in ['storage-identity','uar','ui-platforms']:
 data=json.loads((D/(domain+'-sources.json')).read_text()); data=data.get('sources',[]) if isinstance(data,dict) else data
 for original in data:
  s=dict(original); url=s.get('url') or pathlib.Path(s['path']).as_uri()
  alias=domain+':'+s['id']
  if url in byurl:
   byurl[url]['aliases'].append(alias); continue
  s.update(id='src-'+str(len(registry)+1).zfill(3),aliases=[alias],url=url,entity_id=None,claims=[{'text':s['evidenceSummary'],'critical':False}],chunk_ids=[],retrieval_owner=domain)
  if 'path' in s:
   path=pathlib.Path(s['path'])
   if path.exists():
    raw=path.read_text(); lines=raw.splitlines(); spec=s.get('lines','')
    if not spec:
     match=re.search(r'[Ll]ines? ([0-9][0-9,\- ]*)',s['evidenceSummary']); spec=match.group(1) if match else ''
    selected=[]
    if spec:
     for a,b in re.findall(r'(\d+)(?:-(\d+))?',spec):
      first=int(a); last=int(b or a)
      selected.extend(f'{i}: {lines[i-1]}' for i in range(first,min(last,len(lines))+1))
    else:
     selected=[f'{i+1}: {line}' for i,line in enumerate(lines[:180])]
    text='LOCAL SOURCE EXCERPT, read from filesystem; line numbers preserved.\n'+'\n'.join(selected)
    s.update(retrieval_status='local-source-read',snapshot_sha256=hashlib.sha256(raw.encode()).hexdigest(),excerpt_selection=spec or 'first 180 lines; claim coverage may be incomplete')
   else:
    text='RETRIEVAL BLOCKED: local path absent. '+s['evidenceSummary'];s['retrieval_status']='blocked'
  else:
   text='DOSSIER SUMMARY ONLY; not a raw fetched page. The research worker recorded official documentation retrieval; this assembly did not refetch it.\n'+s['evidenceSummary'];s['retrieval_status']='dossier-summary-only'
   if 'failed' in s['id'] or 'not accessible' in text: s['retrieval_status']='blocked'
  for start in range(0,len(text),5000):
   counter+=1; cid=f'chunk-{counter:04d}';s['chunk_ids'].append(cid)
   write(S/(cid+'.json'),dict(url=url,chunk_id=cid,text=text[start:start+5000],content_type='local-source-excerpt' if 'path' in s else 'worker-documentation-summary',source_id=s['id'],retrieval_status=s['retrieval_status'],observed_at=s['observedAt'],token_count_estimate=(len(text[start:start+5000])+2)//3))
  byurl[url]=s;registry.append(s)
write(S/'url-list.json',dict(source_urls=list(byurl),search_metadata=[dict(url=s['url'],source_id=s['id'],method='worker dossier source inventory',owner=s['retrieval_owner']) for s in registry],total_found=sum(len(s['aliases']) for s in registry),filtered_count=0,note='Source discovery already performed by three workers using local source inspection and Context7/official web docs. No fabricated Firecrawl/Tavily search.'))
write(S/'registry.json',dict(sources=registry,indexing='disk-only; no external memory writes',assembly_note='Local source excerpts freshly read. Official web content represented only by explicitly labeled worker summaries.'))
print(f'{len(registry)} sources; {counter} chunks; no checkpoint edits')
