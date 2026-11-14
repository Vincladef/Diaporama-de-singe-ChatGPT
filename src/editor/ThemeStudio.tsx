import {useMemo,useState} from "react";
import {getSlideTheme,SLIDE_THEMES,type SlideTheme} from "./slideThemes";

type Props={currentTheme?:string;slideCount:number;busy?:boolean;onClose:()=>void;
  onApply:(themeId:string,scope:"slide"|"deck")=>void};
const categories=["Tous","Clairs","Colorés","Sombres","Éditoriaux"] as const;
export function ThemeStudio({currentTheme,slideCount,busy,onClose,onApply}:Props){
  const [category,setCategory]=useState<(typeof categories)[number]>("Tous");
  const [search,setSearch]=useState("");
  const [picked,setPicked]=useState(currentTheme??"blanc");
  const [scope,setScope]=useState<"slide"|"deck">("slide");
  const themes=useMemo(()=>SLIDE_THEMES.filter(theme=>
    (category==="Tous"||theme.category===category)&&
    (theme.name+" "+theme.description).toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr"))),[category,search]);
  const active=getSlideTheme(picked);
  return <div className="studio-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="studio-dialog theme-studio" role="dialog" aria-modal="true" aria-label="Bibliothèque de thèmes">
      <header className="studio-header"><div><strong>Arrière-plan et thèmes</strong>
        <span>24 thèmes ; le contenu existant reste modifiable</span></div>
        <button className="studio-close" onClick={onClose} aria-label="Fermer">×</button>
      </header>
      <div className="theme-studio-controls">
        <div className="theme-filters" aria-label="Catégories">
          {categories.map(cat=><button key={cat} className={category===cat?"selected":""}
            onClick={()=>setCategory(cat)} aria-pressed={category===cat}>{cat}</button>)}
        </div>
        <input type="search" placeholder="Rechercher un style…" aria-label="Rechercher un thème"
          value={search} onChange={event=>setSearch(event.target.value)}/>
      </div>
      <div className="theme-grid" role="group" aria-label="Choisir un thème">
        {themes.map((theme:SlideTheme)=><button key={theme.id} className={"theme-tile"+(picked===theme.id?" selected":"")}
          aria-pressed={picked===theme.id} onClick={()=>setPicked(theme.id)}>
          <div className="theme-preview" style={{background:theme.background,color:theme.foreground,fontFamily:theme.font}}>
            <div className="theme-preview-heading" style={{borderColor:theme.accent}}><strong>Un titre</strong><span>Une idée à partager</span></div>
            <i style={{background:theme.accent}}/>
          </div>
          <span className="theme-tile-title">{theme.name}{picked===theme.id?" ✓":""}</span>
          <small>{theme.description}</small>
        </button>)}
        {!themes.length&&<div className="studio-empty">Aucun thème correspondant.</div>}
      </div>
      <footer className="theme-studio-footer">
        <div className="theme-apply-scope"><strong>{active?.name??"Thème"}</strong>
          <label><input type="radio" name="theme-scope" checked={scope==="slide"}
            onChange={()=>setScope("slide")}/> Cette diapositive</label>
          <label><input type="radio" name="theme-scope" checked={scope==="deck"}
            onChange={()=>setScope("deck")}/> Les {slideCount} diapositives</label>
        </div>
        <button className="primary" disabled={busy||!active} onClick={()=>onApply(picked,scope)}>
          {busy?"Application…":"Appliquer le thème"}
        </button>
      </footer>
    </section>
  </div>;
}
