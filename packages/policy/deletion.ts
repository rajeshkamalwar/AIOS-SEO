import { constants } from 'node:fs';
import { mkdir, open, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { uuid } from '../contracts/index.js';
/** Root is independently retained outside database backups. Permanent local tombstones only. */
export class DeletionLedger {
 private constructor(private root:string){}
 static async open(root:string) {
  await mkdir(root,{recursive:true,mode:0o700});
  const s=await lstat(root);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw new Error('unsafe_deletion_ledger');
  return new DeletionLedger(root);
 }
 private path(tenant:string,site:string){uuid(tenant);uuid(site);return join(this.root,tenant+'_'+site);}
 async contains(tenant:string,site:string){
  try{await lstat(this.path(tenant,site));return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}
 }
 async record(tenant:string,site:string) {
  let f;
  try{f=await open(this.path(tenant,site),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
  catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')return;throw e;}
  try{await f.writeFile('deleted\n');await f.sync();}finally{await f.close();}
  const directory=await open(this.root,constants.O_RDONLY);try{await directory.sync();}finally{await directory.close();}
 }
}
