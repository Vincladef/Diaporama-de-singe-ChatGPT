import JSZip from "jszip";

/** Build a self-contained HTML page while keeping author code out of the editor origin.
 * No external JS or network-dependent code is fetched by the importer.
 */
export type WebSource = { html: string; entry: string; warnings: string[] };
const MAX_INPUT=45_000_000;
const MAX_ARCHIVE=65_000_000;
const MAX_ENTRY=8_000_000;
const MAX_RESOURCES=900_000;
const MIME:Record<string,string>={
  png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",
  svg:"image/svg+xml",avif:"image/avif",woff:"font/woff",woff2:"font/woff2",
  ttf:"font/ttf",otf:"font/otf",mp3:"audio/mpeg",wav:"audio/wav",
  ogg:"audio/ogg",mp4:"video/mp4",webm:"video/webm",ico:"image/x-icon",
};

export function archiveBudget(zip:JSZip):void{
  let count=0,total=0;
  for(const entry of Object.values(zip.files)){
    if(entry.dir)continue;
    if(++count>300)throw Error("L'archive HTML contient trop de fichiers (maximum 300).");
    const size=(entry as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize;
    if(typeof size!=="number"||!Number.isFinite(size)||size<0)
      throw Error("Taille décompressée non vérifiable dans l'archive.");
    if(size>MAX_ENTRY)throw Error("Une ressource de l'archive dépasse 8 Mo.");
    total+=size;
    if(total>MAX_ARCHIVE)throw Error("L'archive décompressée dépasse 65 Mo.");
  }
}

function absolute(value:string):boolean{
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value.trim());
}
export function localPath(origin:string,relative:string):string|null{
  const path=relative.trim().split(/[?#]/)[0]??"";
  if(!path||absolute(relative)||path.includes("\\")||/%2f|%5c/i.test(path))return null;
  let decoded:string;
  try{decoded=decodeURIComponent(path);}catch{return null;}
  if(decoded.includes("\\")||decoded.includes("?")||decoded.includes("#"))return null;
  const segments=decoded.startsWith("/")?[]:origin.split("/").slice(0,-1);
  for(const segment of decoded.split("/")){
    if(!segment||segment===".")continue;
    if(segment===".."){if(!segments.length)return null;segments.pop();continue;}
    segments.push(segment);
  }
  return segments.join("/");
}

/** A single HTML file also benefits from the isolated runtime, even without a ZIP. */
export async function prepareWebSource(file:File):Promise<WebSource>{
  if(file.size>MAX_INPUT)throw Error("Fichier trop volumineux (45 Mo maximum).");
  if(/\.html?$/i.test(file.name))
    return {html:await file.text(),entry:file.name,warnings:[]};
  if(!/\.zip$/i.test(file.name))throw Error("Choisissez un fichier HTML ou une archive ZIP.");
  const zip=await JSZip.loadAsync(await file.arrayBuffer(),{checkCRC32:true});
  archiveBudget(zip);
  const names=Object.keys(zip.files).filter(p=>!zip.files[p]!.dir&&/\.html?$/i.test(p)&&
    !p.split("/").some(part=>part==="__MACOSX"||part.startsWith(".")));
  if(!names.length)throw Error("Aucun fichier HTML trouvé dans cette archive.");
  const entry=[...names].sort((a,b)=>{
    const score=(p:string)=>(/(^|\/)index\.html?$/i.test(p)?0:100)+p.split("/").length*10+p.length;
    return score(a)-score(b);
  })[0]!;
  const warnings:string[]=[];
  if(names.length>1)warnings.push("Le point d'entrée "+entry+" est utilisé. Les autres pages HTML ne deviennent pas des diapositives séparées.");
  const html=await zip.file(entry)!.async("string");
  if(html.length>900_000)throw Error("Le fichier HTML principal dépasse 900 000 caractères.");
  if(typeof DOMParser==="undefined")throw Error("L'import HTML nécessite un navigateur.");
  const dom=new DOMParser().parseFromString(html,"text/html");
  const resourceCache=new Map<string,string>();
  let resourceBytes=0;
  async function asset(raw:string,origin:string):Promise<string>{
    const path=localPath(origin,raw);
    if(!path)return raw;
    const ext=path.split(".").pop()?.toLowerCase()??"";
    const mime=MIME[ext];
    const member=zip.file(path);
    if(!member||!mime){
      warnings.push("Ressource locale non intégrée : "+raw.slice(0,120));
      return raw;
    }
    const cached=resourceCache.get(path);
    if(cached)return cached;
    const size=(member as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize??0;
    resourceBytes+=Math.ceil(size*4/3);
    if(resourceBytes>MAX_RESOURCES)
      throw Error("Les médias HTML intégrés dépassent 900 Ko. Allégez les ressources ou utilisez des URL HTTPS.");
    const url="data:"+mime+";base64,"+await member.async("base64");
    resourceCache.set(path,url);
    return url;
  }
  async function replaceAsync(input:string,pattern:RegExp,fn:(match:RegExpExecArray)=>Promise<string>){
    let out="",start=0,hit:RegExpExecArray|null;
    pattern.lastIndex=0;
    while((hit=pattern.exec(input))!==null){
      out+=input.slice(start,hit.index)+await fn(hit);start=hit.index+hit[0].length;
      if(hit[0].length===0)pattern.lastIndex++;
    }
    return out+input.slice(start);
  }
  async function cssRewrite(css:string,from:string,depth=0):Promise<string>{
    if(depth>4)throw Error("Trop de niveaux d'import CSS.");
    css=await replaceAsync(css,/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?\s*;/gi,async m=>{
      const path=localPath(from,m[1]!);
      const ref=path&&zip.file(path);
      if(!ref||!path.endsWith(".css")){
        warnings.push("Feuille CSS non intégrée : "+m[1]);return "";
      }
      return cssRewrite(await ref.async("string"),path,depth+1);
    });
    return replaceAsync(css,/url\(\s*(["']?)([^"')]+)\1\s*\)/gi,async m=>
      "url(\""+(await asset(m[2]!,from)).replace(/"/g,"%22")+"\")");
  }
  for(const node of [...dom.querySelectorAll('link[rel~="stylesheet"]')]){
    const link=node as HTMLLinkElement;
    const path=localPath(entry,link.getAttribute("href")??"");
    const member=path&&zip.file(path);
    if(!member||!path.endsWith(".css")){
      warnings.push("Feuille CSS externe indisponible : "+(link.getAttribute("href")??""));
      link.remove();continue;
    }
    const style=dom.createElement("style");
    style.textContent=await cssRewrite(await member.async("string"),path);
    link.replaceWith(style);
  }
  for(const style of [...dom.querySelectorAll("style")]){
    style.textContent=await cssRewrite(style.textContent??"",entry);
  }
  for(const node of [...dom.querySelectorAll("[style]")]){
    const value=node.getAttribute("style");
    if(value)node.setAttribute("style",await cssRewrite(value,entry));
  }
  for(const script of [...dom.querySelectorAll("script[src]")]){
    const raw=script.getAttribute("src")??"";
    const path=localPath(entry,raw);
    const member=path&&zip.file(path);
    if(!member||!path.endsWith(".js")){
      warnings.push("Script externe non intégré : "+raw.slice(0,120));
      script.remove();continue;
    }
    script.removeAttribute("src");
    script.textContent=await member.async("string");
    if(script.type==="module")
      warnings.push("Un module JavaScript peut contenir des imports dynamiques qui ne fonctionnent pas hors ligne.");
  }
  for(const node of [...dom.querySelectorAll("img[src],source[src],audio[src],video[src],video[poster],link[rel~='icon'][href]")]){
    for(const attr of ["src","poster","href"]){
      const value=node.getAttribute(attr);if(!value)continue;
      node.setAttribute(attr,await asset(value,entry));
    }
  }
  for(const node of [...dom.querySelectorAll("[srcset]")]){
    const srcset=node.getAttribute("srcset")??"";
    const pieces=srcset.split(",");const resolved:string[]=[];
    for(const part of pieces){
      const match=part.trim().match(/^(\S+)(\s+.*)?$/);
      if(match)resolved.push((await asset(match[1]!,entry))+(match[2]??""));
    }
    node.setAttribute("srcset",resolved.join(", "));
  }
  dom.querySelectorAll("base,meta[http-equiv='Content-Security-Policy']").forEach(el=>el.remove());
  const csp=dom.createElement("meta");
  csp.setAttribute("http-equiv","Content-Security-Policy");
  csp.setAttribute("content","default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https:; img-src data: https:; font-src data: https:; media-src data: blob: https:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'");
  dom.head.prepend(csp);
  return {html:"<!doctype html>\n"+dom.documentElement.outerHTML,entry,warnings:[...new Set(warnings)]};
}
