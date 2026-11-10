import {lookup} from "node:dns/promises";
import {isIP} from "node:net";

/** Strict outbound-resource policy for untrusted slide HTML in a headless browser. */
export function isPublicIp(ip:string):boolean {
  const normalized=ip.replace(/^\[|\]$/g,"").toLowerCase();
  const family=isIP(normalized);
  if(family===4){
    const octets=normalized.split(".").map(Number);
    const [a,b]=octets;
    if(a===undefined||b===undefined)return false;
    return a!==0&&a!==10&&a!==127&&a!==169||false
      ? !(a===192&&(b===168||b===0||b===88)) &&
        !(a===172&&b>=16&&b<=31) &&
        !(a===100&&b>=64&&b<=127) &&
        !(a===198&&(b===18||b===19||b===51)) &&
        !(a===203&&b===0) &&
        !(a===192&&b===0) &&
        a<224
      : false;
  }
  if(family===6){
    if(normalized.includes("%"))return false;
    if(normalized==="::"||normalized==="::1")return false;
    if(normalized.startsWith("fc")||normalized.startsWith("fd")||
       /^fe[89ab]/.test(normalized)||normalized.startsWith("ff"))return false;
    if(normalized.startsWith("::ffff:")){
      const embedded=normalized.slice(7);
      return isIP(embedded)===4&&isPublicIp(embedded);
    }
    return !(normalized.startsWith("2001:db8:")||normalized==="2001:db8::");
  }
  return false;
}
export function safeResourceUrl(input:string):URL|null{
  try{
    const url=new URL(input);
    if(url.protocol!=="https:"||url.username||url.password||url.port&&url.port!=="443")return null;
    const host=url.hostname.replace(/^\[|\]$/g,"");
    if(!host||host.endsWith(".local")||host.endsWith(".internal")||
      host==="localhost"||host.endsWith(".localhost"))return null;
    if(isIP(host))return isPublicIp(host)?url:null;
    if(!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(host))return null;
    return url;
  }catch{return null;}
}
export async function canFetchVisualResource(input:string):Promise<boolean>{
  const url=safeResourceUrl(input);
  if(!url)return false;
  if(isIP(url.hostname))return isPublicIp(url.hostname);
  try{
    const matches=await lookup(url.hostname,{all:true});
    return matches.length>0&&matches.every(match=>isPublicIp(match.address));
  }catch{return false;}
}
