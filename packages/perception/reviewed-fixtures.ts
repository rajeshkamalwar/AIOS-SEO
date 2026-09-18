/** Closed synthetic corpus, not a sanitizer or approval for customer data.
 * Matching never rewrites bytes. New cases require a code-reviewed catalog change.
 */
const fail = (): never => { throw new Error('unreviewed_fixture'); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hosts = new Set(('other-deadline different-replay scope scope-second scope-delete hostile-publication allowed denied orange second receipt jobs foreign-jobs frontier accounting alias bytes caps crash direct-accounting elsewhere fences hard-cap immutable-charge legacy-invocation no-terminal process-abort process-cancel process-delayed-binding process-environment process-error process-hang process-normal process-unknown revocation shared sql-gates supervised tenant-cap unbound-cancel unknown-bytes isolated-abort isolated-admission isolated-docker isolated-forged isolated-hostile isolated-normal isolated-overflow isolated-redirect isolated-revoked isolated-uncertain isolated-cancel-beforestart isolated-cancel-beforerequest').split(' '));
const paths = new Set(['/', '/robots.txt', '/sitemap.xml', '/leaf.xml', '/arbitrary.xml', '/child.xml', '/denied.xml', '/one.xml', '/two.xml', '/three.xml', '/unrelated.xml', '/services', '/private', '/a', '/b', '/child', '/page', '/forbidden', '/first', '/second', '/third', '/linked', '/unrelated', '/more']);
for(let i=0;i<20;i++) paths.add(`/d${i}.xml`);
for(let i=1;i<=20;i++) paths.add(`/doc${i}.xml`);
function fixtureUrl(value: unknown): URL {
 if(typeof value!=='string'||value.length>256) return fail();
 let u:URL;try{u=new URL(value);}catch{return fail();}
 const label=u.hostname.slice(0,-8);
 if(u.protocol!=='https:'||!u.hostname.endsWith('.example')||(!uuid.test(label)&&!hosts.has(label))||u.username||u.password||u.port||u.search||u.hash||u.href!==value||!paths.has(u.pathname))return fail();
 return u;
}
/** Same closed synthetic URL envelope for generated scope receipts. */
export function assertReviewedFixtureUrl(value:string):void { fixtureUrl(value); }
function record(value:unknown,keys:readonly string[]): Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return fail();
 const own=Reflect.ownKeys(value);if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))return fail();
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(!d||!('value' in d))return fail();}
 return value as Record<string,unknown>;
}
function array(value:unknown,max:number):unknown[] {
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max)return fail();
 const keys=Reflect.ownKeys(value);
 if(keys.length!==value.length+1||keys.some(k=>typeof k!== 'string'||(k!=='length'&&!/^(0|[1-9][0-9]*)$/.test(k))))return fail();
 for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!('value' in d))return fail();}
 return value;
}
const html = [
 'fixture','changed','later correction','foreign','unrelated','<h1>Fixture response</h1>',
 ...['Fixture','Fixture render','Retained fixture','Service','Indexed service','Descendant service','Linked','Local fixture services','Fixture service unavailable'].map(t=>`<title>${t}</title>`),
 '<title>Partial','<html><title>XML</title></html>',
 '<html xmlns="http://www.w3.org/1999/xhtml"><a href="/new">n</a></html>',
 '<a href="/linked">Service</a>','<a href="/new">n</a>',
 '<base href="/directory/"><link rel="canonical" href="/canonical"><a href="child">c</a>',
 '<main><a href="/more">More</a><a href="/private">Private</a></main>',
 '<html><head><link rel="canonical" href="/not-a-link"></head><body><a href="/child">🧠</a><a href="/private">private</a><a href="https://other.example/out">out</a><a href="/logout">action</a><script>"<a href=/fake>"</script></body></html>',
 '<html><head><title>Useful fixture</title></head><body><main>Public business text</main><form><input value=""><textarea></textarea></form><input form="outside" value=""><a href="https://outside.example/">safe label</a></body></html>',
 '<!doctype html><html><head><title>Orange Plumbing</title><link rel="canonical" href="https://orange.example/"></head><body><main><h1>Orange Plumbing</h1><p>We repair household pipes in Nagpur.</p><a href="/services">Plumbing services</a><a href="/contact">Contact</a></main></body></html>\n',
 Array.from({length:25},(_,i)=>`<a href="/q?v=${i}">q</a>`).join('')+Array.from({length:30},(_,i)=>`<a href="/z${i}">z</a>`).join(''),
].map(s=>Buffer.from(s));
html.push(Buffer.from('<title>Caf\xe9</title>','latin1'));
const robots = ['User-agent: *\n','User-agent: *\nAllow: /\n','User-agent: *\nDisallow: /private\n','User-agent: *\nDisallow: /denied\n','User-agent: *\nDisallow: /$\n','User-agent: *\nDisallow: /\n','#'.repeat(512001)];
const leafPaths = ['/', '/services','/private','/a','/b','/child','/page','/forbidden','/first','/second','/third'];
for(let i=0;i<20;i++)leafPaths.push(`/p${i}`);
for(let i=1;i<=20;i++)leafPaths.push(`/doc${i}`);
function xmlCorpus(origin:string):string[]{
 const leaf=(ps:readonly string[])=>'<urlset>'+ps.map(p=>`<url><loc>${origin}${p}</loc></url>`).join('')+'</urlset>';
 const index=(ps:readonly string[])=>'<sitemapindex>'+ps.map(p=>`<sitemap><loc>${origin}${p}</loc></sitemap>`).join('')+'</sitemapindex>';
 return ['<urlset/>',leaf([]),...leafPaths.map(p=>leaf([p])),leaf(['/services','/private','/b','/a']),leaf(['/services','/private']),leaf(['/private','/services']),
 leaf(Array.from({length:490},(_,i)=>`/p${i}`)),
 leaf([...Array.from({length:25},(_,i)=>`/q?v=${i}`),...Array.from({length:520},(_,i)=>`/p${String(i).padStart(4,'0')}`),'/ordered?a=1&amp;b=2','/ordered?b=2&amp;a=1']),
 ...[['/child.xml','/denied.xml'],['/child.xml'],['/one.xml'],['/two.xml'],['/three.xml','/sitemap.xml'],['/leaf.xml'],Array.from({length:20},(_,i)=>`/d${i}.xml`)].map(index)];
}
export function assertReviewedRawFixture(input:{mimeType:string;sourceUri:string;bytes:Uint8Array}):void {
 const r=record(input,['mimeType','sourceUri','bytes']),url=fixtureUrl(r.sourceUri);
 if(!(r.bytes instanceof Uint8Array)||r.bytes.byteLength>5*1024*1024)return fail();
 const bytes=Buffer.from(r.bytes),mime=r.mimeType;
 if((mime==='text/html'||mime==='application/xhtml+xml')&&html.some(b=>b.equals(bytes)))return;
 if(mime==='text/plain'&&url.pathname==='/robots.txt'){
  const values=[...robots,'User-agent: *\n'+Array.from({length:20},(_,i)=>`Sitemap: ${url.origin}/doc${i+1}.xml`).join('\n')+'\n'];
  if(values.some(s=>Buffer.from(s).equals(bytes)))return;
 }
 if((mime==='application/xml'||mime==='text/xml')&&url.pathname.endsWith('.xml')&&xmlCorpus(url.origin).some(s=>Buffer.from(s).equals(bytes)))return;
 return fail();
}
const contentTypes=new Set(['text/html','text/html; charset=utf-8','text/html; charset=windows-1252','application/xhtml+xml','application/xml','text/xml','text/plain','application/pdf']);
export function assertReviewedHttpFixtureMetadata(input:unknown):void {
 const r=record(input,['url','method','status_code','headers','final_url','truncated','error']);
 fixtureUrl(r.url);fixtureUrl(r.final_url);
 if(r.url!==r.final_url||!['GET','HEAD'].includes(r.method as string)||typeof r.truncated!=='boolean'||(r.status_code!==null&&(!Number.isInteger(r.status_code)||Number(r.status_code)<100||Number(r.status_code)>599)))return fail();
 const headers=array(r.headers,4);
 const names=new Set();
 for(const raw of headers){const h=record(raw,['name','value']);if(names.has(h.name))return fail();names.add(h.name);
  if(h.name==='content-type'&&typeof h.value==='string'&&contentTypes.has(h.value))continue;
  // Numeric transport length is bounded metadata, not an arbitrary opaque token.
  if(h.name==='content-length'&&typeof h.value==='string'&&/^(0|[1-9][0-9]{0,7})$/.test(h.value)&&Number(h.value)<=5*1024*1024)continue;
  return fail();
 }
 if(r.error!==null){const e=record(r.error,['code','retryable','detail','evidence_ids']);const known=[['timeout',true,'fixture timeout'],['source_unavailable',true,'fixture transport failed'],['cancelled',false,'fixture aborted'],['parse_failed',false,'fixture content encoding unsupported']];if(!known.some(([code,retryable,detail])=>e.code===code&&e.retryable===retryable&&e.detail===detail)||array(e.evidence_ids,0).length!==0)return fail();}
}
