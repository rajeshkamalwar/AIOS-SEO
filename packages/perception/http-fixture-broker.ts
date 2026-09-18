import type {HttpFixtureResult} from '../persistence/index.js';
import {normalizeUrl} from './url.js';
import {runFixtureBrokerTransport} from './http-fixture-broker-core.js';
export interface HttpFixtureBrokerInput {url:string;fixturePort:number;maxDecodedBytes:number;timeoutMs?:number}
export interface HttpFixtureBrokerReceipt {
 result:{status:number;truncated:boolean;retainedBodyBytes:number;retainedBodySha256:string|null}|null;
 error:string|null;closedAt:string;
}
export interface HttpFixturePrivateCapture {observedAt:string;result:HttpFixtureResult;body:Buffer|null}
/** One host-owned local fixture request, never a worker-selected destination or
 * production transport. Returns no response body/headers; closure is measured
 * from Node request/socket events, never inferred from destroy() or a timer. */
export async function runHttpFixtureBroker(input:HttpFixtureBrokerInput,options:{signal?:AbortSignal;beforeRequest:()=>Promise<void>}):Promise<HttpFixtureBrokerReceipt>{
 return (await runHttpFixtureBrokerCaptured(input,options)).receipt;
}
/** Internal trusted host handoff only. Never send capture to the worker, queue,
 * public operational result or caller-selected callback. Physical transport is
 * fixed loopback; the receipt URL is the synthetic logical scope, not live proof. */
export async function runHttpFixtureBrokerCaptured(input:HttpFixtureBrokerInput,options:{signal?:AbortSignal;beforeRequest:()=>Promise<void>}):Promise<{receipt:HttpFixtureBrokerReceipt;capture:HttpFixturePrivateCapture}>{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['url','fixturePort','maxDecodedBytes','timeoutMs'].includes(k))||typeof input.url!=='string'||!Number.isSafeInteger(input.fixturePort)||input.fixturePort<1||input.fixturePort>65535||!Number.isSafeInteger(input.maxDecodedBytes)||input.maxDecodedBytes<1||input.maxDecodedBytes>5242880||!Number.isSafeInteger(input.timeoutMs??20000)||(input.timeoutMs??20000)<1||(input.timeoutMs??20000)>20000||!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['signal','beforeRequest'].includes(k))||typeof options.beforeRequest!=='function')throw new Error('invalid_input');
 const normalized=normalizeUrl(input.url),logical=new URL(input.url);
 if(normalized.excluded||normalized.url!==input.url||!logical.hostname.endsWith('.example')||!['http:','https:'].includes(logical.protocol)||logical.pathname!=='/robots.txt'||logical.search)throw new Error('fixture_only');
 return runFixtureBrokerTransport({url:logical.href,fixturePort:input.fixturePort,maxDecodedBytes:input.maxDecodedBytes,timeoutMs:input.timeoutMs??20000},options);
}
