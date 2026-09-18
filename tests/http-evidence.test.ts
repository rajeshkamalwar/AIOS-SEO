import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { Ledger,type Principal,type HttpFixtureResult,type Capture,sweepOrphans } from '../packages/persistence/index.js';
import { LocalBlobs } from '../packages/evidence/index.js';
import { migrate } from '../packages/persistence/migrate.js';
import { base,validate,hash } from '../packages/contracts/index.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_http_evidence_test'};
let admin:pg.Pool,runtime:pg.Pool,ledger:Ledger,blobs:LocalBlobs,site:string,otherSite:string;
const p:Principal={tenantId:randomUUID(),userId:randomUUID()},other:Principal={tenantId:randomUUID(),userId:randomUUID()};
const body=Buffer.from('<h1>Fixture response</h1>');
const capture=()=>({attemptId:randomUUID(),capturedAt:new Date(Date.now()-1000).toISOString()});
const result=():HttpFixtureResult=>({url:'https://receipt.example/',method:'GET',status_code:404,headers:[{name:'content-type',value:'text/html; charset=utf-8'}],final_url:'https://receipt.example/',truncated:false,error:null});
async function fixture(type:string,changes:Record<string,unknown>){
 const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes};validate(base+'domain.schema.json#/$defs/'+type,row);
 const table=({Tenant:'tenant',User:'app_user',Membership:'membership'} as Record<string,string>)[type];
 const entries=Object.entries(row).filter(([k])=>!['provenance_ids','site_scope_ids'].includes(k));
 await admin.query(`INSERT INTO aios.${table} (${entries.map(([k])=>k).join(',')}) VALUES(${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));
}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_http_evidence_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);runtime=new pg.Pool({...cfg,user:'aios_runtime',max:2});
 for(const person of [p,other]){await fixture('Tenant',{id:person.tenantId});await fixture('User',{id:person.userId,subject:person.userId});await fixture('Membership',{id:randomUUID(),tenant_id:person.tenantId,user_id:person.userId});}
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'http-evidence-blobs'),'local-synthetic-v1');ledger=new Ledger(runtime,blobs,'local-synthetic-v1');
 site=await ledger.registerSite(p,'https://receipt.example/');otherSite=await ledger.registerSite(other,'https://receipt.example/');
});
after(async()=>{await runtime?.end();await admin?.end();});
test('N1 HTTP fixture atomically retains actual body and canonical receipt with exact context digest',async()=>{
 const accepted=await ledger.acceptHttpFixture(p,site,capture(),result(),body);
 assert.deepEqual(await ledger.artifact(p,site,accepted.bodyEvidenceId!),body);
 const bytes=await ledger.artifact(p,site,accepted.receiptEvidenceId),receipt=JSON.parse(bytes.toString());
 validate(base+'http-receipt.schema.json',receipt);assert.equal(receipt.status_code,404);assert.equal(receipt.body_evidence_id,accepted.bodyEvidenceId);
 const observation=await ledger.observation(p,site,accepted.observationId);assert.equal(observation.context_hash,hash(bytes));assert.equal(observation.state,'observed');
 assert.deepEqual(observation.evidence_ids,[accepted.bodyEvidenceId,accepted.receiptEvidenceId]);
 const rows=(await admin.query('SELECT id,sha256,bytes,knowledge_seq FROM aios.evidence WHERE id=ANY($1::uuid[])',[[accepted.bodyEvidenceId,accepted.receiptEvidenceId]])).rows;
 assert.equal(rows.find(r=>r.id===accepted.bodyEvidenceId).sha256,hash(body));assert.ok(rows.every(r=>Number(r.knowledge_seq)===observation.knowledge_seq));
 assert.ok((await ledger.pending(p,site)).some(e=>(e.payload as Record<string,unknown>).observation_id===accepted.observationId));
});
test('N1 HTTP fixture retry is idempotent and changed receipt or bytes conflicts',async()=>{
 const c=capture(),r=result();const [a,b]=await Promise.all([ledger.acceptHttpFixture(p,site,c,r,body),ledger.acceptHttpFixture(p,site,c,r,body)]);assert.deepEqual(a,b);
 await assert.rejects(ledger.acceptHttpFixture(p,site,c,{...r,status_code:200},body),/conflict/);
 await assert.rejects(ledger.acceptHttpFixture(p,site,c,r,Buffer.from('changed')),/conflict/);
 const rows=await admin.query('SELECT * FROM aios.observation WHERE tenant_id=$1 AND attempt_id=$2',[p.tenantId,c.attemptId]);assert.equal(rows.rowCount,1);
});
test('N1 HTTP fixture records transport failure without invented status or body',async()=>{
 const r={...result(),status_code:null,headers:[],error:{code:'timeout',retryable:true,detail:'fixture timeout',evidence_ids:[]}};
 const a=await ledger.acceptHttpFixture(p,site,capture(),r,null);assert.equal(a.bodyEvidenceId,null);
 const receipt=JSON.parse((await ledger.artifact(p,site,a.receiptEvidenceId)).toString());assert.equal(receipt.status_code,null);assert.equal(receipt.body_evidence_id,null);
 assert.equal((await ledger.observation(p,site,a.observationId)).state,'failed');
 await assert.rejects(ledger.acceptHttpFixture(p,site,capture(),{...r,error:null},null),/schema_invalid/);
 await assert.rejects(ledger.acceptHttpFixture(p,site,capture(),r,body),/schema_invalid/);
 await assert.rejects(ledger.acceptHttpFixture(p,site,capture(),{...r,error:{...r.error,evidence_ids:[randomUUID()]}},null),/schema_invalid/);
});
test('N1 HTTP fixture preserves truncation and metadata-only unsupported MIME',async()=>{
 const a=await ledger.acceptHttpFixture(p,site,capture(),{...result(),truncated:true},body);
 assert.equal((await ledger.observation(p,site,a.observationId)).state,'partial');
 const r={...result(),headers:[{name:'content-type',value:'application/pdf'}]};
 const b=await ledger.acceptHttpFixture(p,site,capture(),r,null);assert.equal(b.bodyEvidenceId,null);
 await assert.rejects(ledger.acceptHttpFixture(p,site,capture(),r,body),/schema_invalid/);
 await assert.rejects(ledger.acceptHttpFixture(p,site,capture(),{...result(),truncated:true},null),/schema_invalid/);
});
test('N1 HTTP fixture rejects scope escape, unsafe URLs, secret headers and supplied evidence identities',async()=>{
 await assert.rejects(ledger.acceptHttpFixture(p,otherSite,capture(),result(),body),/scope_denied/);
 await assert.rejects(ledger.acceptHttpFixture(p,site,capture(),{...result(),final_url:'https://other.example/'},body),/scope_denied/);
 await assert.rejects(ledger.acceptHttpFixture(p,site,capture(),{...result(),url:'https://receipt.example/?token=x'},body),/credential_query/);
 await assert.rejects(ledger.acceptHttpFixture(p,site,capture(),{...result(),headers:[{name:'set-cookie',value:'secret'}]},body),/schema_invalid/);
 await assert.rejects(ledger.acceptHttpFixture(p,site,capture(),{...result(),body_evidence_id:randomUUID()} as HttpFixtureResult,body),/schema_invalid/);
});
test('N1 HTTP fixture failed transaction leaves no accepted records and orphan artifacts remain sweepable',async()=>{
 const before=(await admin.query('SELECT count(*) FROM aios.evidence')).rows[0].count,c={...capture(),capturedAt:'2099-01-01T00:00:00.000Z'};
 await assert.rejects(ledger.acceptHttpFixture(p,site,c,result(),body),/future_observation/);
 assert.equal((await admin.query('SELECT count(*) FROM aios.evidence')).rows[0].count,before);
 assert.equal((await admin.query('SELECT * FROM aios.http_fixture_acceptance WHERE attempt_id=$1',[c.attemptId])).rowCount,0);
 assert.equal((await admin.query('SELECT * FROM aios.observation WHERE attempt_id=$1',[c.attemptId])).rowCount,0);
 assert.ok(await sweepOrphans(admin,blobs)>=2);
});
test('N1 HTTP fixture and legacy capture share the attempt identity namespace',async()=>{
 const c=capture();await ledger.acceptHttpFixture(p,site,c,result(),body);
 await assert.rejects(ledger.accept(p,site,{...c,sourceUri:result().final_url,mimeType:'text/html',contextHash:hash(body)},body),/conflict/);
 const legacy=capture();await ledger.accept(p,site,{...legacy,sourceUri:result().final_url,mimeType:'text/html',contextHash:hash(body)},body);
 await assert.rejects(ledger.acceptHttpFixture(p,site,legacy,result(),body),/conflict/);
});
test('N1 HTTP fixture receipt relation is scoped, immutable and survives reconnect',async()=>{
 const a=await ledger.acceptHttpFixture(p,site,capture(),result(),body);await runtime.end();runtime=new pg.Pool({...cfg,user:'aios_runtime'});ledger=new Ledger(runtime,blobs,'local-synthetic-v1');
 assert.deepEqual(await ledger.artifact(p,site,a.bodyEvidenceId!),body);
 assert.equal((await runtime.query('SELECT * FROM aios.http_fixture_acceptance')).rowCount,0);
 await assert.rejects(runtime.query('UPDATE aios.http_fixture_acceptance SET input_hash=$1',['a'.repeat(64)]),/permission denied/);
 await assert.rejects(ledger.artifact(other,otherSite,a.receiptEvidenceId),/not_found/);
});

import { createServer } from 'node:http';
import { collectPublicHop } from '../packages/perception/collector.js';
import { requestPinned } from '../packages/perception/transport.js';
import { robotsState,pageAllowed } from '../packages/perception/robots-admission.js';
import { parseSitemap } from '../packages/perception/sitemap.js';

test('N1 loopback observation composes robots, sitemap, one-hop collection and persisted exact receipts',async t=>{
 const requests:string[]=[];
 const server=createServer((req,res)=>{
  requests.push(req.url!);
  if(req.url==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});res.end('User-agent: *\nDisallow: /private\n');}
  else if(req.url==='/sitemap.xml'){res.writeHead(200,{'content-type':'application/xml'});res.end('<urlset><url><loc>https://receipt.example/services</loc></url><url><loc>https://receipt.example/private</loc></url></urlset>');}
  else {res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<title>Local fixture services</title>');}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();return new Promise<void>(resolve=>server.close(()=>resolve()));});
 const address=server.address();assert.ok(address&&typeof address!=='string');
 const observations:string[]=[],evidence:string[]=[];
 const fetchFixture=async(path:string)=>{
  const url='https://receipt.example'+path;
  const response=await collectPublicHop(url,{
   lookupAll:async()=>[{address:'93.184.216.34',family:4}],
   // Explicit synthetic mapping. This never connects to receipt.example or
   // establishes production egress safety; the Node stream handling is real.
   transport:async(source,_address,limits)=>requestPinned(new URL(`http://fixture.invalid:${address.port}${source.pathname}`),{address:'127.0.0.1',family:4},limits),
  });
  const accepted=await ledger.acceptHttpFixture(p,site,capture(),{
   url,method:'GET',status_code:response.status,headers:Object.entries(response.headers).map(([name,value])=>({name,value})),
   final_url:response.finalUrl,truncated:response.truncated,error:null,
  },response.body);
  observations.push(accepted.observationId);evidence.push(accepted.receiptEvidenceId);
  if(accepted.bodyEvidenceId){evidence.push(accepted.bodyEvidenceId);assert.deepEqual(await ledger.artifact(p,site,accepted.bodyEvidenceId),response.body);}
  return response;
 };
 const policy=robotsState(await fetchFixture('/robots.txt'));
 assert.equal(policy.state,'known');
 assert.equal(pageAllowed(policy,'https://receipt.example/sitemap.xml'),true);
 const sitemap=await fetchFixture('/sitemap.xml');
 const members=parseSitemap(sitemap.body!,'https://receipt.example/');
 for(const url of members.urls)if(pageAllowed(policy,url))await fetchFixture(new URL(url).pathname);
 assert.deepEqual(requests,['/robots.txt','/sitemap.xml','/services']);
 const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),evidence,observations);
 await runtime.end();runtime=new pg.Pool({...cfg,user:'aios_runtime'});ledger=new Ledger(runtime,blobs,'local-synthetic-v1');
 assert.deepEqual(new Set((await ledger.bundle(p,site,bundle)).observation_ids as string[]),new Set(observations));
 for(const id of evidence)assert.ok((await ledger.artifact(p,site,id)).length>0);
});

async function retainedState(){return (await admin.query(`SELECT
 (SELECT count(*) FROM aios.evidence) evidence,
 (SELECT count(*) FROM aios.observation) observations,
 (SELECT count(*) FROM aios.acceptance) legacy,
 (SELECT count(*) FROM aios.http_fixture_acceptance) http,
 (SELECT count(*) FROM aios.outbox) events,
 (SELECT seq FROM aios.knowledge_clock WHERE tenant_id=$1) seq`,[p.tenantId])).rows[0];}
async function noRetention(call:()=>Promise<unknown>){
 const before=await retainedState(),put=blobs.put;let uploads=0;
 blobs.put=async function(key,bytes){uploads++;return put.call(this,key,bytes);};
 try{await assert.rejects(call(),/unreviewed_fixture/);assert.equal(uploads,0);assert.deepEqual(await retainedState(),before);}finally{blobs.put=put;}
}
test('Reviewed fixture gate rejects arbitrary raw secrets before upload, clock or accepted records',async()=>{
 const values=[
  '<form><input value="FORM_SECRET"><textarea>TEXTAREA_SECRET</textarea></form>',
  '<!-- COMMENT_SECRET --><h1>Fixture response</h1>',
  '<input value="" value="IGNORED_DUPLICATE_SECRET">',
  '<script>const key="JS_STRING_SECRET";</script><h1>Fixture response</h1>',
  '<a href="https://receipt.example/?token=URL_SECRET">safe text</a>',
  '<h1>Unreviewed arbitrary text without a secret-pattern match</h1>',
 ];
 for(const text of values){const bytes=Buffer.from(text);
  await noRetention(()=>ledger.acceptHttpFixture(p,site,capture(),result(),bytes));
  await noRetention(()=>ledger.accept(p,site,{...capture(),sourceUri:result().url,mimeType:'text/html',contextHash:hash(bytes)},bytes));
 }
 const json=Buffer.from('{"title":"Fixture","token":"JSON_SECRET"}');
 await noRetention(()=>ledger.accept(p,site,{...capture(),sourceUri:result().url,mimeType:'application/json',contextHash:hash(json)},json));
});
test('Reviewed fixture metadata gate rejects secrets in allowed header fields and error detail before upload',async()=>{
 for(const header of [
  {name:'etag',value:'"HEADER_SECRET"'},
  {name:'x-robots-tag',value:'noindex, secret: HEADER_SECRET'},
  {name:'content-type',value:'text/html; arbitrary=HEADER_SECRET'},
  {name:'last-modified',value:'HEADER_SECRET'},
 ])await noRetention(()=>ledger.acceptHttpFixture(p,site,capture(),{...result(),headers:header.name==='content-type'?[header]:[...result().headers,header]},body));
 const failure={...result(),status_code:null,headers:[],error:{code:'timeout',retryable:true,detail:'Timeout with account EMAIL_SECRET and token ERROR_SECRET',evidence_ids:[]}};
 await noRetention(()=>ledger.acceptHttpFixture(p,site,capture(),failure,null));
});
test('Reviewed unchanged fixture bytes retain none-v1 identity and exact digest instead of redaction',async()=>{
 const a=await ledger.acceptHttpFixture(p,site,capture(),result(),body);
 assert.deepEqual(await ledger.artifact(p,site,a.bodyEvidenceId!),body);
 const e=(await admin.query('SELECT sha256,bytes,redaction_version FROM aios.evidence WHERE id=$1',[a.bodyEvidenceId])).rows[0];
 assert.deepEqual(e,{sha256:hash(body),bytes:String(body.length),redaction_version:'none-v1'});
});
test('HTTP caller mutation during admission cannot replace reviewed body or receipt metadata',async()=>{
 const pool=new pg.Pool({...cfg,user:'aios_runtime',max:1}),connection=await pool.connect();
 const gate=new Ledger(pool,blobs,'local-synthetic-v1'),bytes=Buffer.from(body),r=result(),c=capture();
 const accepted=gate.acceptHttpFixture(p,site,c,r,bytes);
 bytes.fill(120);r.headers[0]!.value='text/html; arbitrary=MUTATED_SECRET';r.error={code:'timeout',retryable:true,detail:'MUTATED_SECRET',evidence_ids:[]};c.capturedAt='2099-01-01T00:00:00.000Z';
 connection.release();
 try{const a=await accepted;assert.deepEqual(await ledger.artifact(p,site,a.bodyEvidenceId!),body);const receipt=JSON.parse((await ledger.artifact(p,site,a.receiptEvidenceId)).toString());assert.deepEqual(receipt.headers,result().headers);assert.equal(receipt.error,null);}finally{await pool.end();}
});
test('Legacy caller mutation during admission cannot replace reviewed capture context or raw bytes',async()=>{
 const pool=new pg.Pool({...cfg,user:'aios_runtime',max:1}),connection=await pool.connect();
 const gate=new Ledger(pool,blobs,'local-synthetic-v1'),bytes=Buffer.from(body);const c:Capture={...capture(),sourceUri:result().url,mimeType:'text/html',contextHash:hash(body)};
 const accepted=gate.accept(p,site,c,bytes);
 bytes.fill(120);c.mimeType='application/json';c.sourceUri='https://receipt.example/?token=MUTATED_SECRET';c.capturedAt='2099-01-01T00:00:00.000Z';c.contextHash='b'.repeat(64);
 connection.release();
 try{const a=await accepted;assert.deepEqual(await ledger.artifact(p,site,a.evidenceId),body);const e=(await admin.query('SELECT source_uri,mime_type FROM aios.evidence WHERE id=$1',[a.evidenceId])).rows[0];assert.deepEqual(e,{source_uri:result().url,mime_type:'text/html'});assert.equal((await ledger.observation(p,site,a.observationId)).context_hash,hash(body));}finally{await pool.end();}
});
test('Legacy site and capture paths cannot persist credential or action URLs',async()=>{
 const before=await retainedState(),sites=(await admin.query('SELECT count(*) FROM aios.site')).rows[0].count;const put=blobs.put;let uploads=0;
 blobs.put=async function(key,bytes){uploads++;return put.call(this,key,bytes);};
 try{
  for(const sourceUri of ['https://receipt.example/?token=URL_SECRET','https://receipt.example/login','https://receipt.example/logout']){
   await assert.rejects(ledger.registerSite(p,sourceUri),/credential_query|action|policy_blocked/);
   await assert.rejects(ledger.accept(p,site,{...capture(),sourceUri,mimeType:'text/html',contextHash:hash(body)},body),/credential_query|action|policy_blocked/);
  }
  assert.equal(uploads,0);assert.equal((await admin.query('SELECT count(*) FROM aios.site')).rows[0].count,sites);assert.deepEqual(await retainedState(),before);
 }finally{blobs.put=put;}
});
test('Expert artifact reads reject historically retained unreviewed bytes without deleting or relabeling them',async()=>{
 const a=await ledger.acceptHttpFixture(p,site,capture(),result(),body),id=a.bodyEvidenceId!;
 const unsafe=Buffer.from('<form><input value="HISTORICAL_SECRET"></form>'),key=blobs.key(p.tenantId,site,id);await writeFile(join(process.env.AIOS_TEST_ROOT!,'http-evidence-blobs',key.replaceAll('/','_')),unsafe);
 const owner=await admin.connect();try{await owner.query('BEGIN');await owner.query("SET LOCAL session_replication_role='replica'");await owner.query('UPDATE aios.evidence SET artifact_key=$2,sha256=$3,bytes=$4 WHERE id=$1',[id,key,hash(unsafe),unsafe.length]);await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}finally{owner.release();}
 await assert.rejects(ledger.artifact(p,site,id),/unreviewed_fixture/);
 const retained=(await admin.query('SELECT artifact_key,sha256,redaction_version,state FROM aios.evidence WHERE id=$1',[id])).rows[0];assert.deepEqual(retained,{artifact_key:key,sha256:hash(unsafe),redaction_version:'none-v1',state:'available'});assert.deepEqual(await blobs.read(key,hash(unsafe),unsafe.length),unsafe);
});
test('Legacy JSON cannot self-classify as a generated HTTP receipt without the trusted acceptance relation',async()=>{
 const a=await ledger.accept(p,site,{...capture(),sourceUri:result().url,mimeType:'text/html',contextHash:hash(body)},body);
 const forged=Buffer.from(JSON.stringify({...result(),body_evidence_id:null})),key=blobs.key(p.tenantId,site,a.evidenceId);await writeFile(join(process.env.AIOS_TEST_ROOT!,'http-evidence-blobs',key.replaceAll('/','_')),forged);
 const owner=await admin.connect();try{await owner.query('BEGIN');await owner.query("SET LOCAL session_replication_role='replica'");await owner.query("UPDATE aios.evidence SET artifact_key=$2,sha256=$3,bytes=$4,mime_type='application/json' WHERE id=$1",[a.evidenceId,key,hash(forged),forged.length]);await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}finally{owner.release();}
 await assert.rejects(ledger.artifact(p,site,a.evidenceId),/unreviewed_fixture/);assert.equal((await admin.query('SELECT redaction_version FROM aios.evidence WHERE id=$1',[a.evidenceId])).rows[0].redaction_version,'none-v1');
});
test('Legacy opaque receipt metadata blocks both paired raw-body and generated-receipt reads',async()=>{
 const a=await ledger.acceptHttpFixture(p,site,capture(),result(),body),id=a.receiptEvidenceId;
 const forged=Buffer.from(JSON.stringify({...result(),headers:[...result().headers,{name:'etag',value:'"HISTORICAL_HEADER_SECRET"'}],body_evidence_id:a.bodyEvidenceId}));
 const key=blobs.key(p.tenantId,site,id);await writeFile(join(process.env.AIOS_TEST_ROOT!,'http-evidence-blobs',key.replaceAll('/','_')),forged);
 const owner=await admin.connect();try{await owner.query('BEGIN');await owner.query("SET LOCAL session_replication_role='replica'");await owner.query('UPDATE aios.evidence SET sha256=$2,bytes=$3 WHERE id=$1',[id,hash(forged),forged.length]);await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}finally{owner.release();}
 for(const evidenceId of [a.bodyEvidenceId!,id])await assert.rejects(ledger.artifact(p,site,evidenceId),/unreviewed_fixture/);
 const raw=(await admin.query('SELECT sha256,redaction_version,state FROM aios.evidence WHERE id=$1',[a.bodyEvidenceId])).rows[0];assert.deepEqual(raw,{sha256:hash(body),redaction_version:'none-v1',state:'available'});
});
test('Ignored duplicate JSON fields in a legacy generated receipt cannot bypass raw-byte review',async()=>{
 const a=await ledger.acceptHttpFixture(p,site,capture(),result(),body),id=a.receiptEvidenceId;
 const original=await ledger.artifact(p,site,id),forged=Buffer.from('{"url":"IGNORED_DUPLICATE_SECRET",'+original.toString().slice(1));
 assert.deepEqual(JSON.parse(forged.toString()),JSON.parse(original.toString()));
 const key=blobs.key(p.tenantId,site,id);await writeFile(join(process.env.AIOS_TEST_ROOT!,'http-evidence-blobs',key.replaceAll('/','_')),forged);
 const owner=await admin.connect();try{await owner.query('BEGIN');await owner.query("SET LOCAL session_replication_role='replica'");await owner.query('UPDATE aios.evidence SET sha256=$2,bytes=$3 WHERE id=$1',[id,hash(forged),forged.length]);await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}finally{owner.release();}
 for(const evidenceId of [a.bodyEvidenceId!,id])await assert.rejects(ledger.artifact(p,site,evidenceId),/unreviewed_fixture/);
 assert.deepEqual(await blobs.read(key,hash(forged),forged.length),forged);
});
