import type { SlideDocument, SlideElement } from "../domain/slide";

/**
 * Optional quick directions for the user. These preserve text, imagery and notes
 * and never impose templates on the rendering engine.
 * The MCP can also supply fully custom designs through create_variants.
 */
export interface ProposedVariant {
  name:string;
  description:string;
  document:SlideDocument;
}
const px=(value:unknown,defaultValue:number)=>{
  if(typeof value==="number")return value;
  if(typeof value==="string"&&/^\d+(\.\d+)?px?$/.test(value.trim()))return parseFloat(value);
  return defaultValue;
};
const safe=(doc:SlideDocument)=>structuredClone(doc);
const root=(e:SlideElement)=>!e.parentId;
function style(e:SlideElement,patch:Record<string,string|number>):SlideElement{
  return {...e,styles:{...e.styles,...patch}};
}
const firstText=(elements:SlideElement[])=>elements.find(e=>root(e)&&e.type==="text"&&(e.text??"").trim());
function setBackground(css:string,color:string,textColor:string,extra:string):string{
  return css+"\n/* Variation graphique : modifications non destructives */\n"+
    "html,body{background:"+color+" !important;color:"+textColor+";}\n"+extra;
}
function proposalFor(
  original:SlideDocument,
  name:string,
  description:string,
  change:(doc:SlideDocument)=>void,
  cssExtra:string,
  background:string,
  color:string,
):ProposedVariant{
  const doc=safe(original);
  change(doc);
  if(doc.mode!=="structured"&&doc.freeform){
    doc.freeform={
      html:doc.freeform.html,
      css:setBackground(doc.freeform.css,background,color,cssExtra),
    };
  }else if(doc.mode==="structured"&&doc.elements.length===0) {
    doc.mode="freeform";
    doc.freeform={html:"",css:setBackground("",background,color,cssExtra)};
  }else if(doc.mode==="structured") {
    // Structured-only slides need a background without inserting decorative nodes.
    doc.mode="hybrid";
    doc.freeform={html:"",css:"html,body{background:"+background+";}"};
  }
  return {name,description,document:doc};
}
export function proposeGraphicVariants(current:SlideDocument,count:3|4|5|6=3):ProposedVariant[]{
  const {width:W,height:H}=current.canvas;
  const hasFreeform=!!current.freeform?.html?.trim();
  const options:ProposedVariant[]=[];

  options.push(proposalFor(current,"Photographie immersive",
    "Image dominante, composition aérée et typographie ample.",doc=>{
      const image=doc.elements.find(e=>root(e)&&e.type==="image");
      if(image){
        doc.elements=doc.elements.map(e=>{
          if(e.id===image.id)return style(e,{left:"0px",top:"0px",width:W+"px",height:H+"px",objectFit:"cover"});
          if(e.type==="text"&&root(e))return style(e,{left:Math.round(W*.075)+"px",top:Math.round(H*.24)+"px",
            width:Math.round(W*.78)+"px",fontSize:Math.round(H*.105)+"px",
            color:"#FFFFFF",textShadow:"0 3px 32px rgba(0,0,0,.65)"});
          return e;
        });
        doc.elements=[image,...doc.elements.filter(e=>e.id!==image.id)];
      }else{
        doc.elements=doc.elements.map(e=>e.type==="text"&&root(e)?
          style(e,{left:Math.round(W*.08)+"px",width:Math.round(W*.82)+"px",
            color:"#F6F3ED",fontSize:Math.round(H*.12)+"px"}):e);
      }
    },
    "body{font-family:Georgia,serif !important}h1,h2{font-size:clamp(68px,7.5vw,180px);line-height:1.04;letter-spacing:-.035em}p{line-height:1.5}",
    "linear-gradient(125deg,#182936,#465c65)","#F7F4EB"));

  options.push(proposalFor(current,"Éditorial clair",
    "Contraste doux, composition asymétrique et images intégrées.",doc=>{
      const img=doc.elements.find(e=>root(e)&&e.type==="image");
      const title=firstText(doc.elements);
      doc.elements=doc.elements.map(e=>{
        if(img&&e.id===img.id)return style(e,{left:Math.round(W*.55)+"px",top:"0px",
          width:Math.round(W*.45)+"px",height:H+"px",objectFit:"cover"});
        if(title&&e.id===title.id)return style(e,{left:Math.round(W*.065)+"px",top:Math.round(H*.16)+"px",
          width:Math.round(W*.46)+"px",fontSize:Math.round(H*.095)+"px",color:"#182D25",fontFamily:"Georgia,serif"});
        if(e.type==="text"&&root(e))return style(e,{left:Math.round(W*.065)+"px",width:Math.round(W*.43)+"px",color:"#324C3D"});
        return e;
      });
    },
    "body{font-family:Georgia,serif !important}h1,h2{color:#162E25 !important;letter-spacing:-.03em}p{color:#34483b}img{object-fit:cover}",
    "#F4F0E7","#1B3427"));

  options.push(proposalFor(current,"Typographie manifeste",
    "Titre monumental, aplats contrastés, hiérarchie marquée.",doc=>{
      const img=doc.elements.find(e=>root(e)&&e.type==="image");
      const title=firstText(doc.elements);
      doc.elements=doc.elements.map(e=>{
        if(img&&e.id===img.id)return style(e,{left:Math.round(W*.52)+"px",top:Math.round(H*.42)+"px",
          width:Math.round(W*.45)+"px",height:Math.round(H*.52)+"px",objectFit:"cover"});
        if(title&&e.id===title.id)return style(e,{left:Math.round(W*.06)+"px",top:Math.round(H*.08)+"px",
          width:Math.round(W*.89)+"px",fontSize:Math.round(H*.14)+"px",fontWeight:"bold",
          fontFamily:"Arial, sans-serif",color:"#F6F0CD"});
        if(e.type==="text"&&root(e))return style(e,{left:Math.round(W*.065)+"px",
          color:"#EADFD2",fontSize:Math.round(H*.06)+"px"});
        return e;
      });
    },
    "body{font-family:Arial,sans-serif !important}h1,h2{font-weight:800 !important;text-transform:uppercase;letter-spacing:-.04em;line-height:.96}img{object-fit:cover}",
    "#202A3B","#F8EBCB"));


  options.push(proposalFor(current,"Atlas scientifique",
    "Blanc de laboratoire, repères fins et hiérarchie analytique.",doc=>{
      const title=firstText(doc.elements);
      doc.elements=doc.elements.map(e=>{
        if(title&&e.id===title.id)return style(e,{left:Math.round(W*.07)+"px",top:Math.round(H*.14)+"px",
          width:Math.round(W*.82)+"px",fontSize:Math.round(H*.102)+"px",
          color:"#152A35",fontFamily:"Arial, Helvetica, sans-serif",fontWeight:700});
        if(e.type==="image"&&root(e))return style(e,{left:Math.round(W*.55)+"px",top:Math.round(H*.44)+"px",
          width:Math.round(W*.38)+"px",height:Math.round(H*.43)+"px",objectFit:"cover"});
        if(e.type==="text"&&root(e))return style(e,{color:"#2C444B",fontFamily:"Arial, Helvetica, sans-serif"});
        return e;
      });
    },
    "body{font-family:Arial,sans-serif !important}h1,h2{color:#152A35 !important;letter-spacing:-.025em}"+
    "section,article{border-color:#BDCDD4}p{line-height:1.38}",
    "#F3F7F7","#152A35"));

  options.push(proposalFor(current,"Papier d'archives",
    "Éditorial historique, ivoire et encre ; photographie sobre.",doc=>{
      const title=firstText(doc.elements);
      doc.elements=doc.elements.map(e=>{
        if(title&&e.id===title.id)return style(e,{left:Math.round(W*.08)+"px",top:Math.round(H*.13)+"px",
          width:Math.round(W*.76)+"px",fontSize:Math.round(H*.115)+"px",
          fontFamily:"Georgia,serif",color:"#3D3027",fontWeight:600});
        if(e.type==="image"&&root(e))return style(e,{left:Math.round(W*.59)+"px",
          top:Math.round(H*.41)+"px",width:Math.round(W*.34)+"px",height:Math.round(H*.48)+"px",
          objectFit:"cover",filter:"grayscale(70%) contrast(108%)"});
        if(e.type==="text"&&root(e))return style(e,{color:"#514536",fontFamily:"Georgia,serif"});
        return e;
      });
    },
    "body{font-family:Georgia,serif !important}h1,h2{color:#3D3027 !important;line-height:1.08}"+
    "p{line-height:1.5}img{filter:grayscale(.65)}",
    "#EFE6D5","#3D3027"));

  options.push(proposalFor(current,"Nocturne cinématographique",
    "Contraste profond, photographie enveloppante et titres réservés.",doc=>{
      const image=doc.elements.find(e=>root(e)&&e.type==="image");
      doc.elements=doc.elements.map(e=>{
        if(image&&e.id===image.id)return style(e,{left:"0px",top:"0px",width:W+"px",height:H+"px",
          objectFit:"cover",filter:"brightness(58%) contrast(115%)"});
        if(e.type==="text"&&root(e))return style(e,{left:Math.round(W*.09)+"px",
          width:Math.round(W*.78)+"px",color:"#F2F0E9",
          fontFamily:"Arial, Helvetica, sans-serif",fontWeight:600});
        return e;
      });
      if(image)doc.elements=[doc.elements.find(e=>e.id===image.id)!,...doc.elements.filter(e=>e.id!==image.id)];
    },
    "body{font-family:Arial,sans-serif !important}h1,h2{color:#F2F0E9 !important;letter-spacing:-.03em}"+
    "p{color:#D7DBE2;line-height:1.4}",
    "#111A27","#F2F0E9"));

  // Do not rewrite raw HTML or invent text; where it exists all proposals remain freely editable.
  if(hasFreeform)for(const proposal of options)proposal.description+=" HTML original conservé.";
  return options.slice(0,count);
}
