import sniff from 'html-encoding-sniffer';
import { MIMEType } from 'node:util';

export type DecodedDocument =
 | {state:'decoded';text:string;encoding:string;decoderVersion:'html-sniff-6/node24-v1'}
 | {state:'parse_failed';reason:string}
 | {state:'not_applicable';reason:'unsupported_mime'};

// Returns text for inert parsing only. Evidence hashes and byte locators must
// continue to reference original stored bytes, never this transcoded string.
export function decodeDocument(bytes:Uint8Array,contentType:string):DecodedDocument {
 if(bytes.byteLength>5242880)return {state:'parse_failed',reason:'decoded_budget'};
 let mime:MIMEType;
 try {mime=new MIMEType(contentType);}catch{return {state:'parse_failed',reason:'invalid_content_type'};}
 if(!['text/html','application/xhtml+xml'].includes(mime.essence))return {state:'not_applicable',reason:'unsupported_mime'};
 if((contentType.match(/;\s*charset\s*=/gi)??[]).length>1)return {state:'parse_failed',reason:'ambiguous_charset'};
 const declared=mime.params.get('charset');
 try {
  if(declared!==null)new TextDecoder(declared,{fatal:true}); // An invalid explicit declaration never silently becomes a different charset.
  const options={...(declared===null?{}:{transportLayerEncodingLabel:declared}),xml:mime.essence==='application/xhtml+xml'};
  const encoding=sniff(bytes,options);
  const decoder=new TextDecoder(encoding,{fatal:true});
  return {state:'decoded',text:decoder.decode(bytes),encoding:decoder.encoding,decoderVersion:'html-sniff-6/node24-v1'};
 } catch{return {state:'parse_failed',reason:'unsupported_or_invalid_encoding'};}
}
