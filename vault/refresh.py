#!/usr/bin/env python3
"""Derived control views only. Never infer maturity, test success, or gap closure."""
from pathlib import Path
import argparse,hashlib,json,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]; V=ROOT/'vault'
VIEWS=['03-CURRENT-STATE.md','04-COVERAGE-MATRIX.md','05-GAP-REGISTER.md','06-MILESTONE-TRACKER.md','08-TEST-TRACEABILITY.md']
MAT={'NOT_DEFINED','DEFINED','IMPLEMENTED','TESTED','REAL_WORLD_VERIFIED','PRODUCTION_PROVEN'}
STATES={'OPEN','FIX_IN_PROGRESS','FIXED','TESTED','VERIFIED','CLOSED'}
def records(folder):
 out=[]
 for p in sorted((V/folder).glob('*.md')):
  raw=p.read_text();assert raw.startswith('---\n'),str(p)
  header=raw.split('---\n',2)[1]; d={}
  for line in header.splitlines():
   k,value=line.split(': ',1);d[k]=json.loads(value)
  d['_path']=p;out.append(d)
 return out
def cell(value): return str(value).replace('|','/').replace('\n',' ')
def ref(path,label=None): return f'[{label or Path(path).name}](../{path})'
def refs(paths):return ', '.join(ref(p) for p in dict.fromkeys(paths)) or '—'
def note_ref(row):return f'[{row["id"]}]({row["_path"].relative_to(V).as_posix()})'
def table(headers,rows):return '| '+' | '.join(headers)+' |\n| '+' | '.join('---' for _ in headers)+' |\n'+''.join('| '+' | '.join(cell(v) for v in row)+' |\n' for row in rows)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--check',action='store_true');ap.add_argument('--base');args=ap.parse_args()
 caps,gaps,miles=records('capabilities'),records('gaps'),records('milestones');miles.sort(key=lambda x:x['order'])
 canonical=set(re.findall(r'^\| (CAP-[A-Z]+-\d\d) ',(ROOT/'docs/14-CAPABILITY-TAXONOMY.md').read_text(),re.M))
 assert len(canonical)==195 and {c['id'] for c in caps}==canonical,'Capability inventory drift'
 assert len(caps)==195 and len({c['domain'] for c in caps})==36,'Duplicate capability or domain drift'
 assert len({g['id'] for g in gaps})==len(gaps),'Duplicate gap IDs'
 for row in caps+gaps+miles:
  for key in ['specs','implementation','tests','reports']:
   for path in row.get(key,[]):assert (ROOT/path).is_file(),f'Missing {key}: {row["id"]}: {path}'
  if 'maturity' in row:assert row['maturity'] in MAT,row['id']
  for gid in row.get('gaps',[]):assert any(g['id']==gid for g in gaps),gid
 for c in caps:
  assert c['local_maturity'] in MAT and c['completion'] in {'INCOMPLETE','COMPLETE'},c['id']
  stage_order=['DEFINED','IMPLEMENTED','TESTED','REAL_WORLD_VERIFIED','PRODUCTION_PROVEN']
  if c['maturity'] in {'IMPLEMENTED','TESTED','REAL_WORLD_VERIFIED','PRODUCTION_PROVEN'}:assert c['implementation'],f'Missing implementation: {c["id"]}'
  if c['maturity'] in {'TESTED','REAL_WORLD_VERIFIED','PRODUCTION_PROVEN'}:assert c['tests'] and c['reports'],f'Missing test/report evidence: {c["id"]}'
  required=[]
  if c['maturity'] in {'REAL_WORLD_VERIFIED','PRODUCTION_PROVEN'}:required=stage_order[:stage_order.index(c['maturity'])+1]
  if c['completion']=='COMPLETE':
   assert isinstance(c.get('required_stages'),list) and c['required_stages'] and set(c['required_stages'])<=set(stage_order),f'Explicit applicable stages required: {c["id"]}'
   assert all(stage_order.index(stage)<=stage_order.index(c['maturity']) for stage in c['required_stages']),c['id']
   required=list(set(required+c['required_stages']))
   assert isinstance(c.get('completion_review'),str) and (ROOT/c['completion_review']).is_file(),f'Missing completion review artifact: {c["id"]}'
   assert all(g['status']=='CLOSED' for g in gaps if g['id'] in c['gaps'] and g['severity'] in {'CRITICAL','HIGH'} and ('affected_capabilities' not in g or c['id'] in g['affected_capabilities'])),c['id']
  for stage in required:
   proof=c.get('stage_evidence',{}).get(stage,{})
   assert isinstance(proof,dict) and proof.get('scope') and proof.get('artifacts'),f'Missing {stage} scoped proof: {c["id"]}'
   assert all((ROOT/path).is_file() for path in proof['artifacts']),f'Missing {stage} artifact: {c["id"]}'
   if stage in {'REAL_WORLD_VERIFIED','PRODUCTION_PROVEN'}:
    assert proof.get('environment')==('authorized_real' if stage=='REAL_WORLD_VERIFIED' else 'production'),c['id']
    assert isinstance(proof.get('independent_review'),str) and (ROOT/proof['independent_review']).is_file(),f'Missing independent review: {c["id"]}'
   if stage=='PRODUCTION_PROVEN':assert proof.get('window') and proof.get('denominator'),f'Missing production window/denominator: {c["id"]}'
 for g in gaps:
  assert g['status'] in STATES,g['id']
  if 'affected_capabilities' in g:assert set(g['affected_capabilities'])<=canonical,g['id']
  stages=re.findall(r'^(?:- |\| )(OPEN|FIX_IN_PROGRESS|FIXED|TESTED|VERIFIED|CLOSED)\b',g['_path'].read_text(),re.M)
  assert stages and stages[-1]==g['status'],f'Gap state/history mismatch: {g["id"]}'
  if g['status']=='CLOSED':assert (ROOT/g.get('closure_evidence','MISSING')).is_file(),g['id']
 # Every source/test/report change invalidates the generated checkpoint views;
 # the digest detects drift, not acceptance. No test result is inferred here.
 paths=[]
 for folder in ['packages','apps','workers','tests','reports','docs','spec','scripts']:
  paths += [p for p in (ROOT/folder).rglob('*') if p.is_file() and 'node_modules' not in p.parts and p.name!='validation-report.json']
 paths += [ROOT/p for p in ['AGENTS.md','README.md','package.json','package-lock.json','tsconfig.json','vault/refresh.py','vault/test_refresh.py']]
 paths += [p for p in V.glob('*.md') if p.name not in VIEWS]
 paths += list((V/'templates').glob('*.md'))
 paths += [r['_path'] for r in caps+gaps+miles]
 digest=hashlib.sha256()
 for p in sorted(paths):digest.update(str(p.relative_to(ROOT)).encode());digest.update(p.read_bytes())
 stamp='<!-- Derived record/source digest: '+digest.hexdigest()+'; regenerate with npm run vault:update. This is not a test receipt. -->\n\n'
 latest=next(m for m in reversed(miles) if m.get('normal_tests') is not None)
 counts=f"{latest['normal_tests']} normal / {latest.get('compiled_tests') or 'not recorded'} compiled / {latest.get('docker_tests') or 'not recorded'} Docker"
 state='# Current state\n\n'+stamp+f"Latest recorded execution evidence: {note_ref(latest)} — **{counts}** at reported baseline `{latest.get('baseline')}`. Source/report digest changes above do not establish new test results. Read the linked report for environment, failures and scope.\n\n"
 state+='**Product incomplete.** M1–M5 local exits are reported; N0 customer activation and N1 live integration remain open. Real PostgreSQL transactions and private local blobs, loopback HTTP, persisted fixture frontiers/snapshots and isolated offline Chromium execute. Source fixtures, injected principals, test-authored publication/evaluator records and denied external resources remain explicit limitations. No capability is real-world or production-proven by those tests.\n\n'
 state+='The owner-approved N0 deployment/data-use profile gates customer processing. It does not block reversible local implementation. [Submission deadline](gaps/GAP-025.md), [graph integrity](gaps/GAP-026.md) and [remaining API parity](gaps/GAP-028.md) retain their own lifecycle histories; none grants website-write authority.\n\n'
 state+=table(['Milestone','Recorded state','Evidence scope'],[(note_ref(m),m['status'],m['maturity']) for m in miles])
 state+='\n## GitHub snapshot and authority\n\nInspected 2026-09-18: [PR1](https://github.com/rajeshkamalwar/AIOS-SEO/pull/1) OPEN, `docs/architecture-readiness-review` → `main`, head0f3fdf9; [PR2](https://github.com/rajeshkamalwar/AIOS-SEO/pull/2) OPEN, `codex/m1-evidence-ledger` → specification branch. Baseline2b6d527 matched local/remote. Neither returned reviews or CI status checks. Subsequent checkpoint commits are in Git/PR history; this dated snapshot is not a live API. No merge or release is implied.\n\n'
 state+='## Historical statements and current interpretation\n\n- README M1-only summary was stale at vault discovery; [GAP-027](gaps/GAP-027.md) tracks its correction.\n- M1 report/doc39 stopping instructions are historical; doc38/M2 and continuous authorization supersede them.\n- Doc38 broad M3/M4/M5 exits exceed what local milestone reports actually prove. Full capability maturity stays DEFINED, with partial foundations recorded separately.\n- Doc40 reality matrix describes3cacf74; the chronological N1 report records later collector/render prerequisites. Old v2/no-index paragraphs remain history.\n- Source schema conformance is not runtime security, model quality, SEO truth or deployment proof.\n- Application paths are packages/apps/workers; no code directory exists. The existing untracked nested AIOS-SEO folder remains untouched.\n'
 cov='# Coverage matrix\n\n'+stamp+'All 36 domains / 195 canonical rows are indexed. Full-capability maturity and local prerequisite maturity are separate. **No full-capability completion is asserted.** Names are navigation labels; definitions remain in [14](../docs/14-CAPABILITY-TAXONOMY.md) and inherited contracts15/18.\n\n'
 for domain in dict.fromkeys(c['domain'] for c in caps):
  cs=[c for c in caps if c['domain']==domain];cov+=f'## {domain} — {len(cs)} capabilities\n\n'+table(['Capability','Full maturity','Local evidence scope','Completion','Persistent gaps'],[(note_ref(c)+' '+c['title'],c['maturity'],c['local_scope_kind']+' / '+c['local_maturity'],c['completion'],', '.join(f'[{g}](gaps/{g}.md)' for g in c['gaps'])) for c in cs])+'\n'
 gap='# Gap register\n\n'+stamp+'Persistent IDs are never renumbered or deleted. Lifecycle: OPEN → FIX_IN_PROGRESS → FIXED → TESTED → VERIFIED → CLOSED. Historical R/D/S design dispositions are preserved separately from runtime/production gaps; FIXED design does not certify operations. Severity applies to the named scope, not a blanket stop on all work.\n\n'+table(['ID','Gap','Severity / scope','Lifecycle','Closure requirement'],[(note_ref(g),g['title'],g['severity']+' — '+g['scope'],g['status'],g['closure_required']) for g in gaps])
 mile='# Milestone tracker\n\n'+stamp+'Milestones are verification checkpoints, not permission boundaries or proof that the product is complete. Definitions and reports remain canonical. Open owner gates block only dependent work. [Full 45-commit baseline history](10-REFERENCES.md) retains the original sequence; newer checkpoints append here.\n\n'+table(['Checkpoint','Canonical dependencies','Recorded status','Baseline','Reported tests','Evidence'],[(note_ref(m)+' '+m['title'],refs(m['specs']),m['status'],m.get('baseline') or 'not implemented',str(m.get('normal_tests') or 'not recorded')+' normal; '+str(m.get('compiled_tests') or '—')+' compiled; '+str(m.get('docker_tests') or '—')+' Docker',refs(m['reports'])) for m in miles])
 trace='# Test traceability\n\n'+stamp+'Counts below are successive snapshots, **never added together**. A referenced test is not proof of full capability acceptance. Fixture/loopback/offline browser results stay TESTED. Spec validation, production dependency audit and runtime execution establish different things.\n\n'+table(['Requirement / checkpoint','Implementation','Tests / conformance artifacts','Actual report / baseline'],[(note_ref(m),refs(m['implementation']),refs(m['tests']),refs(m['reports'])+' / '+str(m.get('baseline'))) for m in miles])
 trace+='\n## Capability and defect trace\n\nEvery [capability note](04-COVERAGE-MATRIX.md) maps its exact CAP requirement → partial implementation → tests → report → maturity → persistent gaps. Every [gap note](05-GAP-REGISTER.md) records closure criteria and history; a current-stage test cannot silently close a broader scope.\n\n'
 trace+='## Current test-file inventory\n\n'+''.join('- '+ref(str(p.relative_to(ROOT)))+'\n' for p in sorted((ROOT/'tests').glob('*.test.ts')))+'\nSeparate suites: '+refs(['scripts/test-render.mjs','spec/validate.py','scripts/test.mjs'])+'. No installed CI check or external independent review was returned at baseline.\n'
 outputs=dict(zip(VIEWS,[state,cov,gap,mile,trace]));stale=[]
 for name,body in outputs.items():
  body=body.rstrip()+"\n"
  p=V/name
  if not p.exists() or p.read_text()!=body:
   if args.check:stale.append(name)
   else:p.write_text(body)
 if stale:raise AssertionError('Stale views; run npm run vault:update: '+', '.join(stale))
 # Markdown links resolve from the note, including nested Obsidian navigation.
 for p in V.rglob('*.md'):
  for target in re.findall(r'\]\(([^)]+)\)',p.read_text()):
   if re.match(r'^[a-zA-Z]+:',target) or target.startswith('#'):continue
   assert (p.parent/target.split('#')[0]).exists(),f'Broken link {p.relative_to(ROOT)} -> {target}'
 if args.base:
  old_paths=subprocess.check_output(['git','ls-tree','-r','--name-only',args.base,'--','vault/gaps'],cwd=ROOT,text=True).splitlines()
  for old_path in old_paths:
   old=subprocess.check_output(['git','show',args.base+':'+old_path],cwd=ROOT,text=True)
   current=ROOT/old_path
   assert current.is_file(),f'Permanent gap history deleted: {old_path}'
   new=current.read_text()
   old_id=re.search(r'^id: (.+)$',old,re.M)
   assert old_id and re.search(r'^id: '+re.escape(old_id[1])+r'$',new,re.M),f'Gap ID changed: {old_path}'
   history=lambda text:re.findall(r'^(?:- |\| )(?:OPEN|FIX_IN_PROGRESS|FIXED|TESTED|VERIFIED|CLOSED)[^\n]*',text,re.M)
   before,after=history(old),history(new)
   assert after[:len(before)]==before,f'Gap history must be append-only: {old_path}'
  changed=set(subprocess.check_output(['git','diff','--name-only',args.base],cwd=ROOT,text=True).splitlines())
  if any(p.startswith(('packages/','apps/','workers/','tests/','scripts/')) or p in {'package.json','package-lock.json','tsconfig.json','vault/refresh.py','vault/test_refresh.py'} for p in changed):
   assert all('vault/'+name in changed for name in VIEWS),'Code/test checkpoint must update all five vault views'
 print(f'Vault conformance passed: {len(caps)} capabilities /36 domains, {len(gaps)} persistent gaps, {len(miles)} checkpoints; five views '+('current' if args.check else 'refreshed')+'. No maturity promotion inferred.')
if __name__=='__main__':
 try:main()
 except (AssertionError,ValueError,KeyError) as e:print(str(e),file=sys.stderr);sys.exit(1)
