import {parentPort,workerData} from 'node:worker_threads';
import {projectRenderDomPrivacy} from './render-privacy.js';
if(parentPort){try{parentPort.postMessage(projectRenderDomPrivacy(workerData));}catch{parentPort.postMessage({state:'not_retainable',reason:'parse_failed'});}}
