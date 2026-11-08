/**
 * Accepts a genuine HTTPS image URL or a Google Images imgres link exposing
 * an explicit imgurl parameter. Never scrapes or pretends to enumerate Google results.
 */
export function directImageUrl(input:string):string{
  const value=input.trim();
  if(!value||value.length>3500)throw new Error("Adresse d'image vide ou trop longue.");
  let url:URL;
  try{url=new URL(value);}catch{throw new Error("Collez une adresse HTTPS valide.");}
  if(url.protocol!=="https:")throw new Error("L'image doit utiliser HTTPS.");
  const google=/(^|\.)google\.[a-z.]+$/.test(url.hostname) || url.hostname==="images.google.com";
  if(google){
    const embedded=url.searchParams.get("imgurl");
    if(embedded){
      if(embedded===value)throw new Error("Cette URL ne pointe pas vers un fichier image.");
      return directImageUrl(embedded);
    }
    throw new Error("Ce lien ouvre une page Google, pas une image. Dans Google Images, faites clic droit puis « Copier l'adresse de l'image ».");
  }
  if(/^(?:www\.)?bing\.com$/.test(url.hostname)&&url.pathname.startsWith("/images/search"))
    throw new Error("Copiez l'adresse directe de la photo et non celle des résultats.");
  if(url.username||url.password)throw new Error("Les URL contenant des identifiants ne sont pas acceptées.");
  return url.toString();
}
