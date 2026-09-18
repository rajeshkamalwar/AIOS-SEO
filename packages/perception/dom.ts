import { parse, type DefaultTreeAdapterTypes as Tree, type Token } from 'parse5';
import { MIMEType } from 'node:util';
import { hash, uuid } from '../contracts/index.js';
import { decodeDocument } from './decoding.js';

const parserVersion='parse5@8.0.1/aios-html-extract-v1' as const;
// Primary contracts: https://parse5.js.org/interfaces/parse5.ParserOptions.html
// and https://html.spec.whatwg.org/multipage/semantics.html#the-base-element.
const htmlNamespace='http://www.w3.org/1999/xhtml';
export interface HtmlSource {
 evidenceId:string; sha256:string; responseUrl:string; contentType:string;
 truncated:boolean; policyLimited:boolean;
}
export interface RawSource {
 evidence_id:string; sha256:string; locator:`bytes:${number}:${number}`; parser_version:typeof parserVersion;
}
export interface LocatedValue {value:string|null;source:RawSource}
export interface LocatedUrl extends LocatedValue {resolved:string|null}
export type HtmlExtraction =
 | {state:'not_extracted';reason:string}
 | {state:'extracted';parserVersion:typeof parserVersion;encoding:string;source:HtmlSource;
    titles:LocatedValue[];canonicals:LocatedUrl[];bases:LocatedUrl[];
    namedMeta:{name:LocatedValue;content:LocatedValue}[];anchors:LocatedUrl[];
    mainText:{selection:'explicit_main'|'body_fallback';segments:LocatedValue[];text:string;visibility:'not_observed'};
    coverage:'partial'|'complete_input';absenceClaimsAllowed:false;parseErrorCount:number;
    limitations:readonly string[]};

// parse5 offsets address UTF-16 indices in the decoded string. This map keeps
// byte locators tied to immutable input bytes, including original BOM/CRLF.
function byteOffsets(bytes:Buffer,text:string,encoding:string):Int32Array|null {
 const offsets=new Int32Array(text.length+1).fill(-1);
 let prefix=0;
 if(encoding==='utf-8'&&bytes.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])))prefix=3;
 if((encoding==='utf-16le'||encoding==='utf-16be')&&((bytes[0]===0xff&&bytes[1]===0xfe)||(bytes[0]===0xfe&&bytes[1]===0xff)))prefix=2;
 if(!['utf-8','utf-16le','utf-16be','windows-1252'].includes(encoding))return null;
 let byte=prefix;
 for(let index=0;index<text.length;){
  offsets[index]=byte;
  const cp=text.codePointAt(index)!,width=cp>0xffff?2:1;
  byte+=encoding==='utf-8'?Buffer.byteLength(String.fromCodePoint(cp),'utf8'):encoding==='windows-1252'?1:width*2;
  index+=width;
 }
 offsets[text.length]=byte;
 return byte===bytes.length?offsets:null;
}
function element(node:Tree.Node):node is Tree.Element {return 'tagName' in node;}
function attribute(node:Tree.Element,name:string):string|null {return node.attrs.find(a=>a.name===name&&a.namespace===undefined)?.value??null;}
function resolve(value:string|null,base:string):string|null {
 if(value===null)return null;
 try{return new URL(value,base).href;}catch{return null;}
}
const inert=new Set(['script','style','template','noscript','iframe','object','form','input','textarea','select','button']);

/** Inert raw-source extraction, not a visibility check, crawler admission or SEO assessment. */
export function extractHtml(bytes:Uint8Array,source:HtmlSource):HtmlExtraction {
 uuid(source.evidenceId);
 if(typeof source.truncated!=='boolean'||typeof source.policyLimited!=='boolean')throw new Error('schema_invalid');
 const data=Buffer.from(bytes);
 if(data.length>5242880)return {state:'not_extracted',reason:'input_budget'};
 if(hash(data)!==source.sha256)throw new Error('artifact_integrity_failed');
 let response:URL,mime:MIMEType;
 try{response=new URL(source.responseUrl);mime=new MIMEType(source.contentType);}catch{return {state:'not_extracted',reason:'invalid_source_context'};}
 if(!['http:','https:'].includes(response.protocol)||response.username||response.password)return {state:'not_extracted',reason:'invalid_source_context'};
 // XHTML has XML parsing/case/namespace semantics; never silently parse it as HTML.
 if(mime.essence!=='text/html')return {state:'not_extracted',reason:mime.essence==='application/xhtml+xml'?'xml_parser_required':'unsupported_mime'};
 const decoded=decodeDocument(data,source.contentType);
 if(decoded.state!=='decoded')return {state:'not_extracted',reason:decoded.reason};
 const offsets=byteOffsets(data,decoded.text,decoded.encoding);
 if(!offsets)return {state:'not_extracted',reason:'locator_encoding_unsupported'};
 let parseErrorCount=0;
 // Input bytes are bounded, but parse5 allocates its tree before our node cap.
 // Live use must run under an independently isolated CPU/memory budget.
 const document=parse(decoded.text,{sourceCodeLocationInfo:true,scriptingEnabled:true,onParseError:()=>{parseErrorCount++;}});
 const ref=(location:Token.Location|undefined|null):RawSource|null=>{
  if(!location)return null;
  const start=offsets[location.startOffset],end=offsets[location.endOffset];
  if(start===undefined||end===undefined||start<0||end<start||end>data.length)throw new Error('invalid_parser_locator');
  return {evidence_id:source.evidenceId,sha256:source.sha256,locator:`bytes:${start}:${end}`,parser_version:parserVersion};
 };
 const attr=(node:Tree.Element,name:string):LocatedValue|null=>{
  const loc=node.sourceCodeLocation,value=attribute(node,name);
  const provenance=ref(value===null?loc?.startTag:loc?.attrs?.[name]);
  return provenance?{value,source:provenance}:null;
 };
 const elements:Tree.Element[]=[],texts:{node:Tree.TextNode;main:boolean}[]=[];
 const stack:{node:Tree.Node;blocked:boolean;body:boolean;main:boolean}[]=[{node:document,blocked:false,body:false,main:false}];
 let visited=0,hasMain=false;
 while(stack.length){
  const entry=stack.pop()!;let {node,blocked,body,main}=entry;
  if(++visited>100000)return {state:'not_extracted',reason:'node_budget'};
  if(element(node)){
   // Text exclusion must not hide connected HTML metadata descendants.
   // parse5 template content is a separate fragment, not childNodes.
   blocked=blocked||node.namespaceURI!==htmlNamespace||inert.has(node.tagName);
   if(node.tagName==='body')body=true;
   blocked=blocked||attribute(node,'hidden')!==null||attribute(node,'aria-hidden')?.toLowerCase()==='true';
   if(node.namespaceURI===htmlNamespace)elements.push(node);
   if(!blocked&&node.tagName==='main'){main=true;hasMain=true;}
  }
  if(!blocked&&node.nodeName==='#text'&&'value' in node&&body)texts.push({node:node as Tree.TextNode,main});
  if('childNodes' in node)for(let i=node.childNodes.length-1;i>=0;i--)stack.push({node:node.childNodes[i]!,blocked,body,main});
 }
 const titles:LocatedValue[]=[],canonicals:LocatedUrl[]=[],bases:LocatedUrl[]=[],anchors:LocatedUrl[]=[],namedMeta:{name:LocatedValue;content:LocatedValue}[]=[];
 const baseElement=elements.find(n=>n.tagName==='base'&&attribute(n,'href')!==null);
 const declaredBase=baseElement?resolve(attribute(baseElement,'href'),response.href):null;
 // HTML's frozen-base algorithm ignores data/javascript bases. The raw
 // declaration below remains evidence even when it cannot set document base.
 const documentBase=declaredBase&&!['data:','javascript:'].includes(new URL(declaredBase).protocol)?declaredBase:response.href;
 for(const node of elements){
  if(node.tagName==='title'){
   const provenance=ref(node.sourceCodeLocation);
   if(provenance)titles.push({value:node.childNodes.filter((n):n is Tree.TextNode=>n.nodeName==='#text'&&'value' in n).map(n=>n.value).join(''),source:provenance});
  }
  if(node.tagName==='base'){
   const field=attr(node,'href');if(field)bases.push({...field,resolved:resolve(field.value,response.href)});
  }
  if(node.tagName==='link'&&(attribute(node,'rel')??'').toLowerCase().split(/[\t\n\f\r ]+/).includes('canonical')){
   const field=attr(node,'href');if(field)canonicals.push({...field,resolved:resolve(field.value,documentBase)});
  }
  if(node.tagName==='a'){
   const field=attr(node,'href');if(field)anchors.push({...field,resolved:resolve(field.value,documentBase)});
  }
  if(node.tagName==='meta'&&attribute(node,'name')!==null){
   const name=attr(node,'name'),content=attr(node,'content');if(name&&content)namedMeta.push({name,content});
  }
  if(titles.length+canonicals.length+bases.length+anchors.length+namedMeta.length>5000)return {state:'not_extracted',reason:'extraction_budget'};
 }
 const segments:LocatedValue[]=[];
 for(const item of texts){
  if(hasMain&&!item.main)continue;
  const provenance=ref(item.node.sourceCodeLocation);
  if(provenance&&item.node.value.trim())segments.push({value:item.node.value,source:provenance});
  if(segments.length>5000)return {state:'not_extracted',reason:'extraction_budget'};
 }
 return {state:'extracted',parserVersion,encoding:decoded.encoding,source:{...source},titles,canonicals,bases,namedMeta,anchors,
  mainText:{selection:hasMain?'explicit_main':'body_fallback',segments,text:segments.map(s=>s.value).join(' ').replace(/\s+/g,' ').trim(),visibility:'not_observed'},
  coverage:source.truncated||source.policyLimited?'partial':'complete_input',absenceClaimsAllowed:false,parseErrorCount,
  limitations:['static_text_candidates_only','computed_css_visibility_not_observed','scripts_styles_forms_templates_and_declared_hidden_subtrees_excluded','base_and_link_values_are_observations_not_fetch_authority','url_resolution_without_csp_or_browser_navigation_context','live_parser_requires_isolated_resource_budget','no_raw_render_comparison_or_defect_classification']};
}
