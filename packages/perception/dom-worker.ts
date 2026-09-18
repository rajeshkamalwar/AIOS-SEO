import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import { extractHtml, type HtmlSource } from './dom.js';

// Trusted inert parser entry point. Page bytes are data; never imported/evaluated.
// This V8 worker is not an OS security boundary and must not execute page JS.
if(isMainThread||!parentPort)throw new Error('parser_worker_required');
try{
 const input=workerData as {bytes:Uint8Array;source:HtmlSource};
 parentPort.postMessage({kind:'result',value:extractHtml(input.bytes,input.source)});
}catch(error){
 const code=error instanceof Error&&['artifact_integrity_failed','schema_invalid'].includes(error.message)?error.message:'parser_budget';
 parentPort.postMessage({kind:'error',code});
}finally{parentPort.close();}
