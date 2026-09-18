import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { Ledger,type Principal,type HttpFixtureResult,sweepOrphans } from '../packages/persistence/index.js';
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
