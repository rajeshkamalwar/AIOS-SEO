// Fixed capability client: no URL, destination, headers, credentials, body,
// executable or network API crosses this protocol. OS network is independently off.
let input=Buffer.alloc(0),finished=false;
const timer=setTimeout(()=>process.exit(2),25000);
const fail=()=>{clearTimeout(timer);process.exit(2);};
process.stdin.on('error',fail);
process.stdin.on('data',chunk=>{
 if(finished||input.length+chunk.length>2048)return fail();
 input=Buffer.concat([input,chunk]);
 const end=input.indexOf(10);if(end<0)return;
 if(end!==input.length-1)return fail();
 try{
  const text=new TextDecoder('utf-8',{fatal:true}).decode(input.subarray(0,end));const message=JSON.parse(text),m=message.metadata;
  if(Object.keys(message).sort().join(',')!=='kind,metadata'||message.kind!=='response'||!m||Object.keys(m).sort().join(',')!=='retainedBodyBytes,retainedBodySha256,status,truncated'||!Number.isInteger(m.status)||m.status<100||m.status>599||typeof m.truncated!=='boolean'||!Number.isInteger(m.retainedBodyBytes)||m.retainedBodyBytes<0||m.retainedBodyBytes>5242880||!(m.retainedBodySha256===null&&m.retainedBodyBytes===0||typeof m.retainedBodySha256==='string'&&/^[a-f0-9]{64}$/.test(m.retainedBodySha256)))return fail();
  finished=true;clearTimeout(timer);process.stdout.write(JSON.stringify({kind:'result',metadata:m})+'\n');process.stdin.pause();
 }catch{fail();}
});
process.stdin.on('end',()=>{if(!finished)fail();});
process.stdout.write('{"kind":"fetch"}\n');
