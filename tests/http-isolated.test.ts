import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID,generateKeyPairSync,sign } from 'node:crypto';
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync,spawnSync } from 'node:child_process';
import { createServer,type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { migrate } from '../packages/persistence/migrate.js';
import { Ledger,type Principal } from '../packages/persistence/index.js';
import { LocalBlobs } from '../packages/evidence/index.js';
import { Registry } from '../packages/skills/index.js';
import { Jobs,type Lease } from '../packages/jobs/index.js';
import { HttpLane } from '../packages/jobs/http-lane.js';
import { HttpSupervisor } from '../packages/jobs/http-supervisor.js';
import { IsolatedHttpFixtureSupervisor } from '../packages/jobs/isolated-http-fixture-supervisor.js';
import { DockerHttpFixtureEngine,type HttpFixtureEngine } from '../packages/jobs/docker-http-fixture.js';
import { DeletionLedger } from '../packages/policy/deletion.js';
import { canonical,manifestHash,hash } from '../packages/contracts/index.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_http_isolated_test'};
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool,supervisorPool:pg.Pool;
let ledger:Ledger,commands:Jobs,worker:Jobs,registry:Registry,deletions:DeletionLedger,lane:HttpLane,supervisor:HttpSupervisor,digest:string;
async function fixture(type:string,changes:Record<string,unknown>){
 const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes};
 const table=({Tenant:'tenant',User:'app_user',Membership:'membership'} as Record<string,string>)[type];
 const entries=Object.entries(row).filter(([k])=>!['provenance_ids','site_scope_ids'].includes(k));
 await admin.query(`INSERT INTO aios.${table} (${entries.map(([k])=>k).join(',')}) VALUES(${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));
}
async function run(origin:string,requests=750){
 const p:Principal={tenantId:randomUUID(),userId:randomUUID()};
 await fixture('Tenant',{id:p.tenantId});await fixture('User',{id:p.userId,subject:p.userId});await fixture('Membership',{id:randomUUID(),tenant_id:p.tenantId,user_id:p.userId});
 for(const kind of ['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'])await admin.query('INSERT INTO control.tenant_cap VALUES($1,$2,10000)',[p.tenantId,kind]);
 const fixtureOrigin='https://'+new URL(origin).hostname.replace(/\.$/,'');
 const site=await ledger.registerSite(p,fixtureOrigin+'/');
 const evidence=await ledger.accept(p,site,{attemptId:randomUUID(),sourceUri:fixtureOrigin+'/',capturedAt:new Date(Date.now()-1000).toISOString(),mimeType:'text/html',contextHash:manifestHash({fixture:true})},Buffer.from('fixture'));
 const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[evidence.evidenceId],[evidence.observationId]);
 // Fixture profile admission intentionally excludes HTTP/trailing-dot spelling; seed
 // canonical url-v1 Site variants with test-owner authority to exercise accounting only.
 if(fixtureOrigin!==origin)await admin.query('UPDATE aios.site SET submitted_url=$2,normalized_origin=$3,origins=$4 WHERE id=$1',[site,origin+'/',origin,[origin]]);
 const id=await commands.submit(p,site,randomUUID(),{http_requests:requests,render_requests:0,render_pages:0,model_calls:0,tokens:0,cost_microusd:0,deadline:new Date(Date.now()+600000).toISOString()});
 const next=async()=>{await commands.enqueue(p,site,id,bundle,digest,randomUUID());const l=await worker.claim();assert.ok(l);return l;};
 return {p,site,id,next};
}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_http_isolated_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator','aios_http_supervisor'])await admin.query(`ALTER ROLE ${role} LOGIN`);
 runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});supervisor=new HttpSupervisor(supervisorPool);
 ledger=new Ledger(runtime,await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'http-isolated-blobs'),'local-synthetic-v1'),'local-synthetic-v1');
 deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'http-isolated-deletions'));
 commands=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions);registry=new Registry(operator);lane=new HttpLane(scheduler,deletions);
 await admin.query("UPDATE control.health SET verified_until=clock_timestamp()+interval '1 hour',restore_ready=true");
 const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID();
 await admin.query('INSERT INTO control.authority_key VALUES($1,$2,true)',[reviewer,keys.publicKey.export({type:'spki',format:'pem'})]);
 const manifest=JSON.parse(await readFile('spec/examples/skill-reliability-gate.json','utf8'));
 manifest.last_verified=new Date().toISOString();manifest.freshness_deadline=new Date(Date.now()+3600000).toISOString();
 const approval={author:randomUUID(),reviewer,manifest_digest:manifestHash(manifest),evaluation_digest:manifestHash({fixture:true}),approved_at:new Date().toISOString(),scope:'local-synthetic-v1' as const,dependencies:[]};
 digest=await registry.approve(manifest,approval,sign(null,Buffer.from(canonical(approval)),keys.privateKey).toString('base64'));
});
after(async()=>{for(const pool of [runtime,scheduler,operator,supervisorPool,admin])await pool?.end();});
async function localFixture(handler:RequestListener){
 const server=createServer(handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {port:(server.address() as AddressInfo).port,close:async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
/** Trusted engine double proves broker/accounting behavior, never actual container isolation. */
function fakeEngine(options:{beforeStart?:()=>Promise<void>;beforeRequest?:()=>Promise<void>;repeat?:boolean;forge?:boolean;cleanupFails?:boolean}={}):HttpFixtureEngine{
 return {
  async create(){return {id:hash(Buffer.from(randomUUID())),imageDigest:'a'.repeat(64)};},
  async start(_container,control){
   await options.beforeStart?.();await control.beforeStart();await options.beforeRequest?.();
   const metadata=await control.onRequest(control.signal??new AbortController().signal);
   if(options.repeat)await assert.rejects(control.onRequest(control.signal??new AbortController().signal),/request|protocol|already|budget|invocation/);
   const value=options.forge?{...metadata,retainedBodySha256:'b'.repeat(64)}:metadata;
   return {stdout:Buffer.from(JSON.stringify({kind:'fetch'})+'\n'+JSON.stringify({kind:'result',metadata:value})+'\n'),state:'exited'};
  },
  async cleanup(){if(options.cleanupFails)throw new Error('container_state_uncertain');return {finishedAt:new Date().toISOString(),termination:'exited',exitCode:0};}
 };
}
async function stored(origin:string){return (await admin.query('SELECT r.*,o.in_flight FROM aios.http_reservation r JOIN control.http_origin o ON o.origin=r.origin WHERE r.origin=$1',[origin])).rows[0];}
async function counts(){return (await admin.query('SELECT (SELECT count(*) FROM aios.evidence) evidence,(SELECT count(*) FROM aios.page_snapshot) snapshots,(SELECT count(*) FROM aios.http_terminal_receipt) terminals')).rows[0];}
test('Isolated broker makes one governed fixture hop and retains metadata only with unknown byte settlement',async t=>{
 const origin='https://isolated-normal.example',r=await run(origin),lease=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const body=Buffer.from('User-agent: *\nDisallow: /private-fixture\n');let hits=0;
 const server=await localFixture((req,res)=>{hits++;assert.equal(req.method,'GET');assert.equal(req.url,'/robots.txt');assert.equal(req.headers.cookie,undefined);assert.equal(req.headers.authorization,undefined);res.writeHead(200,{'content-type':'text/plain'});res.end(body);});t.after(server.close);
 const before=await counts(),result=await new IsolatedHttpFixtureSupervisor(lane,supervisor,fakeEngine()).collect(lease,{url:origin+'/robots.txt',fixturePort:server.port,maxDecodedBytes:1000});
 assert.equal(result.state,'completed');assert.equal(hits,1);assert.deepEqual(result.result,{status:200,truncated:false,retainedBodyBytes:body.length,retainedBodySha256:hash(body)});assert.ok(!JSON.stringify(result).includes('/private-fixture'));
 const row=await stored(origin);assert.equal(row.actual_bytes,null);assert.equal(row.reserved_bytes,'1000');assert.ok(row.settled_at);assert.equal(row.in_flight,0);assert.equal((await counts()).evidence,before.evidence);assert.equal((await counts()).snapshots,before.snapshots);
 await lane.settle(lease,result.reservation.reservationId,result.terminalReceiptId);assert.equal((await stored(origin)).in_flight,0);
});
test('One-hop broker does not follow redirects or forward fixture headers',async t=>{
 const origin='https://isolated-redirect.example',r=await run(origin),lease=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));let sentinel=0,hits=0;
 const destination=await localFixture((_,res)=>{sentinel++;res.end('forbidden');});t.after(destination.close);
 const server=await localFixture((_,res)=>{hits++;res.writeHead(302,{location:`http://127.0.0.1:${destination.port}/secret`,'set-cookie':'credential=SECRET'});res.end('redirect body');});t.after(server.close);
 const result=await new IsolatedHttpFixtureSupervisor(lane,supervisor,fakeEngine()).collect(lease,{url:origin+'/robots.txt',fixturePort:server.port,maxDecodedBytes:1000});
 assert.equal(hits,1);assert.equal(sentinel,0);assert.equal(result.result?.status,302);assert.equal(result.result?.retainedBodyBytes,0);assert.equal(result.result?.retainedBodySha256,null);assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('Broker overflow is bounded and worker repeated fetch cannot allocate an uncharged second hop',async t=>{
 const origin='https://isolated-overflow.example',r=await run(origin),lease=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));let hits=0;
 const server=await localFixture((_,res)=>{hits++;res.writeHead(200,{'content-type':'text/plain'});res.end('x'.repeat(10000));});t.after(server.close);
 const result=await new IsolatedHttpFixtureSupervisor(lane,supervisor,fakeEngine({repeat:true})).collect(lease,{url:origin+'/robots.txt',fixturePort:server.port,maxDecodedBytes:32});
 assert.equal(hits,1);assert.ok(result.result===null||result.result.truncated);if(result.result)assert.ok(result.result.retainedBodyBytes<=32);assert.equal((await stored(origin)).reserved_bytes,'32');
});
test('Forged worker metadata cannot become a successful broker result',async t=>{
 const origin='https://isolated-forged.example',r=await run(origin),lease=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const server=await localFixture((_,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.end('hello');});t.after(server.close);
 const result=await new IsolatedHttpFixtureSupervisor(lane,supervisor,fakeEngine({forge:true})).collect(lease,{url:origin+'/robots.txt',fixturePort:server.port,maxDecodedBytes:1000});assert.equal(result.state,'failed');assert.equal(result.result,null);assert.equal((await stored(origin)).in_flight,0);
});
test('Current cancellation before GO and before broker socket both prevent fixture access',async t=>{
 for(const phase of ['beforeStart','beforeRequest'] as const){
  const origin=`https://isolated-cancel-${phase.toLowerCase()}.example`,r=await run(origin),lease=await r.next();let hits=0;
  const server=await localFixture((_,res)=>{hits++;res.end('must not request');});t.after(server.close);
  const engine=fakeEngine({[phase]:async()=>commands.cancel(r.p,r.site,r.id)});
  const pending=new IsolatedHttpFixtureSupervisor(lane,supervisor,engine).collect(lease,{url:origin+'/robots.txt',fixturePort:server.port,maxDecodedBytes:1000});
  if(phase==='beforeStart'){const result=await pending;assert.equal(result.state,'failed');assert.equal((await stored(origin)).in_flight,0);}else{await assert.rejects(pending,/broker_termination_unverified/);assert.equal((await stored(origin)).in_flight,1);}
  assert.equal(hits,0);
 }
});
test('Uncertain independent container cleanup cannot author terminal proof or release capacity',async t=>{
 const origin='https://isolated-uncertain.example',r=await run(origin),lease=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const server=await localFixture((_,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.end('hello');});t.after(server.close);const before=await counts();
 await assert.rejects(new IsolatedHttpFixtureSupervisor(lane,supervisor,fakeEngine({cleanupFails:true})).collect(lease,{url:origin+'/robots.txt',fixturePort:server.port,maxDecodedBytes:1000}),/container_state_uncertain|termination_unconfirmed/);
 const row=await stored(origin);assert.equal(row.settled_at,null);assert.equal(row.in_flight,1);assert.equal((await counts()).terminals,before.terminals);
});
test('Public URLs, non-robots paths and aborted input fail before reservation or engine creation',async()=>{
 const origin='https://isolated-admission.example',r=await run(origin),lease=await r.next();let creates=0;const engine=fakeEngine(),create=engine.create;engine.create=async()=>{creates++;return create();};const producer=new IsolatedHttpFixtureSupervisor(lane,supervisor,engine);
 for(const url of ['https://example.com/robots.txt',origin+'/page',origin+'/robots.txt?key=secret'])await assert.rejects(producer.collect(lease,{url,fixturePort:12345,maxDecodedBytes:1000}),/fixture_only|credential|query|invalid/);
 await assert.rejects(producer.collect(lease,{url:origin+'/robots.txt',fixturePort:12345,maxDecodedBytes:1000},{signal:AbortSignal.abort()}),/aborted/);assert.equal(creates,0);assert.equal(await stored(origin),undefined);await commands.cancel(r.p,r.site,r.id);
});
test('Abort during broker response closes the socket before accounting settlement',async t=>{
 const origin='https://isolated-abort.example',r=await run(origin),lease=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));const controller=new AbortController();let hits=0;let socketClosed:()=>void=()=>{};
 const closed=new Promise<void>(resolve=>{socketClosed=resolve;});
 const server=await localFixture(req=>{hits++;req.socket.once('close',socketClosed);controller.abort();});t.after(server.close);
 const result=await new IsolatedHttpFixtureSupervisor(lane,supervisor,fakeEngine()).collect(lease,{url:origin+'/robots.txt',fixturePort:server.port,maxDecodedBytes:1000},{signal:controller.signal});
 assert.equal(result.state,'aborted');assert.equal(result.result,null);assert.equal(hits,1);await Promise.race([closed,new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new Error('socket_not_closed')),1000);timer.unref();})]);assert.equal((await stored(origin)).in_flight,0);
});
if(process.env.AIOS_TEST_HTTP_ISOLATED==='1')test('Actual network-none HTTP container requests one host-mediated fixture hop and is independently removed',async t=>{
 const prefix=process.env.AIOS_DOCKER_CONTEXT?['--context',process.env.AIOS_DOCKER_CONTEXT]:[];
 const imageDigest=execFileSync('docker',[...prefix,'image','inspect','aios-seo-http-fixture','--format','{{.Id}}'],{encoding:'utf8'}).trim().replace(/^sha256:/,'');
 const engine=new DockerHttpFixtureEngine({imageDigest,...(process.env.AIOS_DOCKER_CONTEXT?{dockerContext:process.env.AIOS_DOCKER_CONTEXT}:{})});
 const origin='https://isolated-docker.example',r=await run(origin),lease=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));let hits=0;const body=Buffer.from('User-agent: *\nDisallow: /fixture-secret\n');
 const server=await localFixture((req,res)=>{hits++;assert.equal(req.url,'/robots.txt');res.writeHead(200,{'content-type':'text/plain'});res.end(body);});t.after(server.close);
 const result=await new IsolatedHttpFixtureSupervisor(lane,supervisor,engine).collect(lease,{url:origin+'/robots.txt',fixturePort:server.port,maxDecodedBytes:1000});
 assert.equal(result.state,'completed');assert.equal(result.result?.retainedBodySha256,hash(body));assert.equal(result.result?.retainedBodyBytes,body.length);assert.equal(hits,1);assert.equal((await stored(origin)).in_flight,0);assert.ok(!JSON.stringify(result).includes('fixture-secret'));
 const removed=spawnSync('docker',[...prefix,'container','inspect',result.containerId],{encoding:'utf8'});assert.notEqual(removed.status,0);assert.match(removed.stderr,/No such (?:container|object)/i);
});
if(process.env.AIOS_TEST_HTTP_ISOLATED==='1')test('Hostile fixed worker cannot bypass network or filesystem isolation and duplicate fetch never creates another hop',async t=>{
 const prefix=process.env.AIOS_DOCKER_CONTEXT?['--context',process.env.AIOS_DOCKER_CONTEXT]:[];
 const origin='https://isolated-hostile.example',r=await run(origin),lease=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));let hits=0;
 const server=await localFixture((_,res)=>{hits++;res.writeHead(200,{'content-type':'text/plain'});res.end('allowed broker hop');});t.after(server.close);
 const context=await mkdtemp(join(process.env.AIOS_TEST_ROOT!,'hostile-http-'));t.after(()=>rm(context,{recursive:true,force:true}));
 await writeFile(join(context,'Dockerfile'),await readFile('workers/http-fixture/Dockerfile'));
 // Controlled hostile fixture. A fetch is emitted only after all probes deny access.
 const source=`import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {connect} from 'node:net';
import {Resolver} from 'node:dns/promises';
import {networkInterfaces} from 'node:os';
assert.notEqual(process.getuid(),0);
const interfaces=networkInterfaces();assert.deepEqual(Object.keys(interfaces),['lo']);
assert.ok(interfaces.lo.length>0);assert.ok(interfaces.lo.every(address=>address.internal));
assert.equal(process.env.AIOS_HTTP_SECRET,undefined);
assert.equal(process.env.DATABASE_URL,undefined);
const status=await readFile('/proc/self/status','utf8');
assert.match(status,/Seccomp:\\s+2/);assert.match(status,/NoNewPrivs:\\s+1/);assert.match(status,/CapEff:\\s+0+\\s/);
await assert.rejects(access('/var/run/docker.sock'));
await assert.rejects(writeFile('/opt/aios-http/forbidden','not writable'));
async function denied(host){await new Promise((resolve,reject)=>{const socket=connect({host,port:${server.port}});socket.setTimeout(750);socket.once('connect',()=>{socket.destroy();reject(new Error('unexpected direct network'));});socket.once('error',()=>resolve());socket.once('timeout',()=>{socket.destroy();resolve();});});}
await denied('127.0.0.1');await denied('::1');await denied('169.254.169.254');await denied('192.0.2.1');await denied('192.168.5.2');
const resolver=new Resolver({timeout:250,tries:1});resolver.setServers(['192.168.5.2']);await assert.rejects(resolver.resolve4('fixture.invalid'));
process.stdin.once('data',()=>{process.stdout.write('{"kind":"fetch"}\\n');process.stdin.pause();});
process.stdout.write('{"kind":"fetch"}\\n');`;
 await writeFile(join(context,'worker.mjs'),source);
 const tag='aios-seo-http-hostile:'+randomUUID();
 execFileSync('docker',[...prefix,'build','-t',tag,context],{stdio:'pipe',timeout:60000});t.after(()=>{spawnSync('docker',[...prefix,'image','rm',tag],{stdio:'pipe'});});
 const imageDigest=execFileSync('docker',[...prefix,'image','inspect',tag,'--format','{{.Id}}'],{encoding:'utf8'}).trim().replace(/^sha256:/,'');
 const engine=new DockerHttpFixtureEngine({imageDigest,...(process.env.AIOS_DOCKER_CONTEXT?{dockerContext:process.env.AIOS_DOCKER_CONTEXT}:{})});
 const previous=process.env.AIOS_HTTP_SECRET;process.env.AIOS_HTTP_SECRET='host-secret-never-in-worker';
 try{
  const result=await new IsolatedHttpFixtureSupervisor(lane,supervisor,engine).collect(lease,{url:origin+'/robots.txt',fixturePort:server.port,maxDecodedBytes:1000});
  assert.equal(hits,1,'all hostile probes passed before the only broker hop');assert.equal(result.state,'failed');assert.equal(result.result,null);assert.equal((await stored(origin)).in_flight,0);
  const removed=spawnSync('docker',[...prefix,'container','inspect',result.containerId],{encoding:'utf8'});assert.notEqual(removed.status,0);assert.match(removed.stderr,/No such (?:container|object)/i);
 }finally{if(previous===undefined)delete process.env.AIOS_HTTP_SECRET;else process.env.AIOS_HTTP_SECRET=previous;}
});
test('Release revocation after container start but before broker request prevents opening a socket',async t=>{
 const origin='https://isolated-revoked.example',r=await run(origin),lease=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));let hits=0;
 const server=await localFixture((_,res)=>{hits++;res.end('must not request');});t.after(server.close);
 await assert.rejects(new IsolatedHttpFixtureSupervisor(lane,supervisor,fakeEngine({beforeRequest:async()=>{await registry.change(digest,'revoked','fixture');}})).collect(lease,{url:origin+'/robots.txt',fixturePort:server.port,maxDecodedBytes:1000}),/broker_termination_unverified/);assert.equal(hits,0);assert.equal((await stored(origin)).in_flight,1);
});
