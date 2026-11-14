export type SlideTheme = {
  id:string; name:string; category:"Clairs"|"Colorés"|"Sombres"|"Éditoriaux";
  background:string; foreground:string; accent:string; muted:string; font:string;
  description:string;
};
export const SLIDE_THEMES:SlideTheme[]=[
  {id:"blanc",name:"Blanc essentiel",category:"Clairs",background:"#ffffff",foreground:"#17211d",accent:"#245b47",muted:"#69766f",font:"Arial, sans-serif",description:"Le blanc classique, sans décoration"},
  {id:"claire",name:"Clair contemporain",category:"Clairs",background:"#f8faf9",foreground:"#1c3630",accent:"#36816a",muted:"#75857e",font:"Inter, Arial, sans-serif",description:"Un fond blanc cassé et du vert doux"},
  {id:"neige",name:"Neige et bleu",category:"Clairs",background:"linear-gradient(145deg,#ffffff 45%,#eaf4fc 100%)",foreground:"#12263c",accent:"#267ab6",muted:"#667d92",font:"Arial, sans-serif",description:"Clarté et légèreté"},
  {id:"ivoire",name:"Ivoire",category:"Clairs",background:"#fffaf0",foreground:"#302c28",accent:"#ae8244",muted:"#796e60",font:"Georgia, serif",description:"Une élégance chaleureuse"},
  {id:"bleu-pale",name:"Brume bleue",category:"Clairs",background:"#eaf1f8",foreground:"#1b3651",accent:"#437fa7",muted:"#69829a",font:"Arial, sans-serif",description:"Calme et aérien"},
  {id:"lin",name:"Lin naturel",category:"Clairs",background:"#f1ede5",foreground:"#343a32",accent:"#75876c",muted:"#7c8277",font:"Georgia, serif",description:"Textures évoquées par une palette organique"},
  {id:"menthe",name:"Menthe",category:"Clairs",background:"linear-gradient(150deg,#f8fffb 0%,#dcf4e8 100%)",foreground:"#143d33",accent:"#2d9175",muted:"#608b7c",font:"Arial, sans-serif",description:"Fraîcheur et douceur"},
  {id:"rose",name:"Rose poudré",category:"Clairs",background:"#fcf2f0",foreground:"#4b303b",accent:"#c67889",muted:"#927b83",font:"Georgia, serif",description:"Délicat, éditorial"},
  {id:"terre",name:"Terre cuite",category:"Colorés",background:"#d77b59",foreground:"#fff9f1",accent:"#ffdeb4",muted:"#ffe8cf",font:"Georgia, serif",description:"Chaleur et caractère"},
  {id:"sauge",name:"Sauge",category:"Colorés",background:"#afc6ae",foreground:"#213d32",accent:"#3c7352",muted:"#466a58",font:"Georgia, serif",description:"Végétal et apaisant"},
  {id:"lavande",name:"Lavande",category:"Colorés",background:"linear-gradient(130deg,#e3dcfa,#c5d3f5)",foreground:"#302b5e",accent:"#684fb1",muted:"#6f679d",font:"Arial, sans-serif",description:"Pastel lumineux"},
  {id:"soleil",name:"Soleil",category:"Colorés",background:"linear-gradient(120deg,#fff4ae 0%,#ffc778 100%)",foreground:"#593715",accent:"#ba6225",muted:"#8f6244",font:"Georgia, serif",description:"Optimiste, chaleureux"},
  {id:"corail",name:"Corail",category:"Colorés",background:"#ffdad5",foreground:"#542d31",accent:"#d34c59",muted:"#9a6a70",font:"Arial, sans-serif",description:"Couleur et énergie"},
  {id:"lagon",name:"Lagon",category:"Colorés",background:"linear-gradient(145deg,#caefe7 0%,#8acacb 100%)",foreground:"#16464b",accent:"#187d86",muted:"#487e81",font:"Arial, sans-serif",description:"Aquatique et actuel"},
  {id:"ocean",name:"Bleu océan",category:"Sombres",background:"linear-gradient(145deg,#102c4b,#1e5a7d)",foreground:"#f5fbff",accent:"#8ce0ed",muted:"#c9dfef",font:"Arial, sans-serif",description:"Profondeur et contraste"},
  {id:"nuit",name:"Nuit",category:"Sombres",background:"#141c2c",foreground:"#f6f3ec",accent:"#d6bc80",muted:"#b5bfcd",font:"Georgia, serif",description:"Cinématique et sobre"},
  {id:"charbon",name:"Charbon",category:"Sombres",background:"#161817",foreground:"#ffffff",accent:"#d4f09a",muted:"#adb6af",font:"Arial, sans-serif",description:"Minimalisme noir"},
  {id:"foret",name:"Forêt",category:"Sombres",background:"linear-gradient(135deg,#092b25,#174a3c)",foreground:"#f2f6e9",accent:"#b8df9b",muted:"#bed6ca",font:"Georgia, serif",description:"Vert profond"},
  {id:"prune",name:"Prune",category:"Sombres",background:"#32213c",foreground:"#fff4f8",accent:"#f3a7c8",muted:"#d2bbd6",font:"Georgia, serif",description:"Dramatique et raffiné"},
  {id:"ardoise",name:"Ardoise",category:"Sombres",background:"#283744",foreground:"#f7f9fb",accent:"#78c9c2",muted:"#c0d2d8",font:"Arial, sans-serif",description:"Sérieux, technique"},
  {id:"journal",name:"Grand journal",category:"Éditoriaux",background:"#f7f3e9",foreground:"#231d18",accent:"#9d3128",muted:"#716a60",font:"Georgia, serif",description:"L'esprit de la presse imprimée"},
  {id:"suisse",name:"Graphisme suisse",category:"Éditoriaux",background:"#f6f5f2",foreground:"#1b1b1b",accent:"#e3483b",muted:"#666666",font:"Arial, sans-serif",description:"Une typographie affirmée"},
  {id:"academie",name:"Académie",category:"Éditoriaux",background:"#f3f0e8",foreground:"#293647",accent:"#8d6842",muted:"#65717c",font:"Georgia, serif",description:"Conférence et recherche"},
  {id:"papier-bleu",name:"Papier bleu",category:"Éditoriaux",background:"linear-gradient(90deg,#e9f2f4 0%,#f9f9f4 100%)",foreground:"#1e3946",accent:"#376b87",muted:"#6a8691",font:"Georgia, serif",description:"Pour des récits et portfolios"},
];
export const DEFAULT_SLIDE_THEME="blanc";
export function getSlideTheme(id:string|undefined):SlideTheme|undefined{
  return SLIDE_THEMES.find(theme=>theme.id===id);
}
