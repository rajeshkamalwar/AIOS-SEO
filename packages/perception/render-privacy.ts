import {parse,defaultTreeAdapter,type DefaultTreeAdapterTypes as Tree,type TreeAdapter} from 'parse5';
import {hash} from '../contracts/index.js';
export type RenderPrivacyProjection={state:'projected';bytes:Buffer;originalSha256:string;sha256:string;redactionVersion:'render-privacy-v1';limitations:readonly string[]}|{state:'not_retainable';reason:'invalid_encoding'|'budget_exceeded'|'parse_failed'};
export const privacyLimit=5242880;
const htmlNamespace='http://www.w3.org/1999/xhtml';
const allowed=new Set('html head body title meta link main article section div p h1 h2 h3 h4 h5 h6 nav header footer aside a span strong em b i u s small sub sup blockquote q cite code pre ul ol li dl dt dd table caption colgroup col thead tbody tfoot tr td th br hr time address figure figcaption details summary'.split(' '));
const voids=new Set(['meta','link','col','br','hr']);
const limitations=Object.freeze(['privacy_limited_projection','not_complete_dom_parity','no_arbitrary_secret_detection','url_containing_text_withheld','relative_url_attributes_withheld','query_fragment_url_attributes_withheld','nonallowlisted_subtrees_and_attributes_removed']);
const budget=()=>({state:'not_retainable',reason:'budget_exceeded'} as const);
export function validPrivacyString(value:unknown):value is string {
 if(typeof value!=='string')return false;
 for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(c>=0xdc00&&c<=0xdfff)return false;}
 return true;
}
// Deliberately over-withhold domain-like prose as well as explicit URLs. This is
// minimization, not a claim that arbitrary credentials or personal data are found.
function urlText(value:string){return /(?:[a-z][a-z0-9+.-]*:|www\.|[\p{L}\p{N}-]+\.[\p{L}]{2,}(?:\b|\/)|[/?#@]|%[a-f0-9]{2}|(?:\d{1,3}\.){3}\d{1,3})/iu.test(value);}
function attr(e:Tree.Element,key:string){return e.attrs.find(a=>a.name===key&&!a.namespace)?.value;}
function safeUrl(value:string|undefined):string|null{
 if(value===undefined||value.length>4096||/[\u0000-\u0020\u007f\\]/.test(value))return null;
 // Dropping <base> makes relative destinations ambiguous. No response URL is
 // supplied here, so retain only explicit absolute HTTP(S) destinations.
 if(!/^https?:\/\//i.test(value)||/[?#]/.test(value))return null;
 try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
  return u.href;
 }catch{return null;}
}
function escape(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
/** Pure inert projection. Call the isolated adapter for hostile input CPU/heap bounds. */
export function projectRenderDomPrivacy(dom:string):RenderPrivacyProjection{
 if(typeof dom!=='string')return {state:'not_retainable',reason:'invalid_encoding'};
 if(dom.length>privacyLimit||Buffer.byteLength(dom,'utf8')>privacyLimit)return budget();
 if(!validPrivacyString(dom))return {state:'not_retainable',reason:'invalid_encoding'};
 let nodes=0;
 const count=()=>{if(++nodes>10000)throw new RangeError('privacy_budget');};
 const depth=(parent:Tree.ParentNode)=>{let n:Tree.Node=parent,d=0;while('parentNode'in n&&n.parentNode){if(++d>128)throw new RangeError('privacy_budget');n=n.parentNode;}};
 const adapter:TreeAdapter<Tree.DefaultTreeAdapterMap>={...defaultTreeAdapter,
  createElement(...args){count();return defaultTreeAdapter.createElement(...args);},
  createCommentNode(...args){count();return defaultTreeAdapter.createCommentNode(...args);},
  insertText(...args){count();depth(args[0]);return defaultTreeAdapter.insertText(...args);},
  insertTextBefore(...args){count();depth(args[0]);return defaultTreeAdapter.insertTextBefore(...args);},
  appendChild(...args){depth(args[0]);return defaultTreeAdapter.appendChild(...args);},
  insertBefore(...args){depth(args[0]);return defaultTreeAdapter.insertBefore(...args);},
 };
 try{
  const document=parse(dom,{treeAdapter:adapter,scriptingEnabled:true});const output:string[]=[];let size=0,visited=0;
  const emit=(s:string)=>{size+=Buffer.byteLength(s,'utf8');if(size>privacyLimit)throw new RangeError('privacy_budget');output.push(s);};
  const walk=(node:Tree.Node,d:number)=>{
   if(++visited>10000||d>128)throw new RangeError('privacy_budget');
   if(node.nodeName==='#text'){const value=(node as Tree.TextNode).value;if(!urlText(value))emit(escape(value));return;}
   if(!('tagName'in node)){if('childNodes'in node)for(const child of node.childNodes)walk(child,d+1);return;}
   if(node.namespaceURI!==htmlNamespace||!allowed.has(node.tagName)||attr(node,'contenteditable')!==undefined||attr(node,'form')!==undefined||attr(node,'hidden')!==undefined||attr(node,'aria-hidden')?.toLowerCase()==='true'||/^(?:textbox|searchbox|combobox|listbox|option|spinbutton|checkbox|radio|switch|slider|button)$/.test(attr(node,'role')?.toLowerCase()??''))return;
   let attributes='';
   if(node.tagName==='meta'){
    const name=attr(node,'name')?.toLowerCase(),content=attr(node,'content');
    if(!name||!['robots','googlebot','bingbot'].includes(name)||content===undefined||content.length>1024)return;
    const directives=content.toLowerCase().split(',').map(x=>x.trim());
    if(directives.some(x=>! /^(?:all|none|index|noindex|follow|nofollow|noarchive|nocache|nosnippet|noimageindex|notranslate|indexifembedded|max-snippet:\s*-?\d+|max-video-preview:\s*-?\d+|max-image-preview:\s*(?:none|standard|large))$/.test(x)))return;
    attributes=' name="'+name+'" content="'+escape(content)+'"';
   }else if(node.tagName==='link'){
    if(attr(node,'rel')?.toLowerCase()!=='canonical')return;const href=safeUrl(attr(node,'href'));if(href===null)return;attributes=' rel="canonical" href="'+escape(href)+'"';
   }else if(node.tagName==='a'){const href=safeUrl(attr(node,'href'));if(href!==null)attributes=' href="'+escape(href)+'"';}
   emit('<'+node.tagName+attributes+'>');if(!voids.has(node.tagName)){for(const child of node.childNodes)walk(child,d+1);emit('</'+node.tagName+'>');}
  };
  emit('<!DOCTYPE html>');walk(document,0);const bytes=Buffer.from(output.join(''),'utf8');return {state:'projected',bytes,originalSha256:hash(Buffer.from(dom,'utf8')),sha256:hash(bytes),redactionVersion:'render-privacy-v1',limitations};
 }catch(error){return error instanceof RangeError?budget():{state:'not_retainable',reason:'parse_failed'};}
}
