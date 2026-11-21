import { useState } from "react";

const GRAYS=["#000000","#202124","#444746","#5f6368","#80868b","#9aa0a6","#bdc1c6","#dadce0","#f1f3f4","#ffffff"];
const HUES=[
  ["#f4cccc","#ea9999","#e06666","#cc0000","#990000"],
  ["#fce5cd","#f9cb9c","#f6b26b","#e69138","#b45f06"],
  ["#fff2cc","#ffe599","#ffd966","#f1c232","#bf9000"],
  ["#d9ead3","#b6d7a8","#93c47d","#6aa84f","#38761d"],
  ["#d0e0e3","#a2c4c9","#76a5af","#45818e","#134f5c"],
  ["#cfe2f3","#9fc5e8","#6fa8dc","#3d85c6","#0b5394"],
  ["#c9daf8","#a4c2f4","#6d9eeb","#3c78d8","#1155cc"],
  ["#d9d2e9","#b4a7d6","#8e7cc3","#674ea7","#351c75"],
  ["#ead1dc","#d5a6bd","#c27ba0","#a64d79","#741b47"],
];
let recentColors:string[]=[];
type Props={label:string;value:string;onChange:(value:string)=>void;
  title:string;allowTransparent?:boolean};
export function ColorPalette({label,value,onChange,title,allowTransparent=false}:Props){
  const [recent,setRecent]=useState(recentColors);
  const pick=(color:string)=>{
    recentColors=[color,...recentColors.filter(c=>c!==color)].slice(0,10);
    setRecent(recentColors);onChange(color);
  };
  const selected=/^#[0-9a-f]{6}$/i.test(value)?value:"#202124";
  const swatch=(color:string)=><button type="button" key={color}
    className={"singe-palette-swatch"+(value.toLowerCase()===color.toLowerCase()?" is-current":"")}
    aria-label={"Couleur "+color} title={color} style={{background:color}}
    onPointerDown={e=>e.preventDefault()}
    onClick={e=>{e.stopPropagation();pick(color);e.currentTarget.closest("details")?.removeAttribute("open");}}/>;
  return <details className="singe-palette">
    <summary aria-label={title} title={title}>
      <span className="singe-palette-symbol">{label}</span>
      <span className="singe-palette-indicator" style={{background:value==="transparent"?
        "repeating-linear-gradient(45deg,#ccc 0 3px,#fff 3px 6px)":selected}}/>
      <span className="singe-palette-chevron">⌄</span>
    </summary>
    <div className="singe-palette-popup" role="group" aria-label={"Palette : "+title}>
      <strong>Couleurs du thème</strong>
      <div className="singe-palette-row">{["#202124","#ffffff","#1a73e8","#d93025","#188038","#f9ab00","#9334e6"].map(swatch)}</div>
      <strong>Nuances</strong>
      <div className="singe-palette-row singe-palette-grays">{GRAYS.map(swatch)}</div>
      <div className="singe-palette-matrix">{HUES.map((line,i)=>
        <div key={i} className="singe-palette-row">{line.map(swatch)}</div>)}</div>
      {!!recent.length&&<><strong>Couleurs récentes</strong><div className="singe-palette-row">{recent.map(swatch)}</div></>}
      {allowTransparent&&<button className="singe-palette-clear" onClick={e=>{
        e.stopPropagation();pick("transparent");e.currentTarget.closest("details")?.removeAttribute("open");
      }}>Aucun remplissage / transparent</button>}
      <label className="singe-palette-custom">Couleur personnalisée
        <input type="color" aria-label={"Personnaliser "+title} value={selected}
          onChange={e=>pick(e.target.value)}/>
      </label>
    </div>
  </details>;
}
