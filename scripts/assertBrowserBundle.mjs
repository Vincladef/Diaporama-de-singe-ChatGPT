import {readdir,readFile} from "node:fs/promises";
import {join} from "node:path";

const directory="dist/assets";
const assets=(await readdir(directory)).filter(name=>name.endsWith(".js"));
if(!assets.length)throw Error("Missing browser JavaScript bundles in "+directory);
const bad=[];
for(const file of assets){
 const source=await readFile(join(directory,file),"utf8");
 // The ELK Node entry includes a bare "web-worker" import that native browser ESM
 // cannot resolve. Detect this during CI, not after publishing an empty page.
 const unresolved=/(?:^|[;\n])\s*import\s+(?:[^;\n]*?\s+from\s*)?["']web-worker["']/m;
 if(unresolved.test(source)||/from\s*["']web-worker["']/.test(source)){
   bad.push(file);
 }
}
if(bad.length)throw Error("Browser ESM contains unresolved bare web-worker import: "+bad.join(", "));
console.log("BROWSER_BUNDLE_OK: "+assets.length+" JavaScript asset(s), no bare web-worker import");
