import {normalizeUrl} from './url.js';
import {assertReviewedFixtureUrl} from './reviewed-fixtures.js';
import {runFixtureBrokerTransport} from './http-fixture-broker-core.js';
import type {HttpFixtureBrokerReceipt} from './http-fixture-broker.js';
export interface HttpSeedFixtureBrokerInput {url:string;fixturePort:number;maxDecodedBytes:5242880;timeoutMs:20000}
/** Trusted governed producer supplies the admitted seed; the worker cannot select
 * a URL. This adapter only maps that exact local fixture path to loopback. It
 * grants no independent source/robots authority and never follows redirects. */
export async function runHttpSeedFixtureBroker(input:HttpSeedFixtureBrokerInput,options:{signal?:AbortSignal;beforeRequest:()=>Promise<void>}):Promise<HttpFixtureBrokerReceipt>{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['url','fixturePort','maxDecodedBytes','timeoutMs'].includes(k))||typeof input.url!=='string'||!Number.isSafeInteger(input.fixturePort)||input.fixturePort<1||input.fixturePort>65535||input.maxDecodedBytes!==5242880||input.timeoutMs!==20000||!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['signal','beforeRequest'].includes(k))||typeof options.beforeRequest!=='function')throw new Error('invalid_input');
 const {url,fixturePort,maxDecodedBytes,timeoutMs}=input,normalized=normalizeUrl(url),logical=new URL(url);
 if(normalized.excluded||normalized.url!==url||!logical.hostname.endsWith('.example')||logical.search||logical.hash)throw new Error('fixture_only');
 assertReviewedFixtureUrl(url);
 return (await runFixtureBrokerTransport({url,fixturePort,maxDecodedBytes,timeoutMs},options)).receipt;
}
