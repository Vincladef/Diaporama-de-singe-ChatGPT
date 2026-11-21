export type LayerOrderItem={id:string;zIndex:number};
export type LayerDirection="front"|"back"|"forward"|"backward";

/** Normalize every editable foreground layer above the slide backdrop. */
export function reorderForegroundLayers(
  original:LayerOrderItem[],selectedIds:readonly string[],direction:LayerDirection,
):LayerOrderItem[]{
  const chosen=new Set(selectedIds);
  const ordered=original.map((item,index)=>({...item,index}))
    .sort((a,b)=>a.zIndex-b.zIndex||a.index-b.index);
  if(direction==="front"||direction==="back"){
    const selected=ordered.filter(item=>chosen.has(item.id));
    const other=ordered.filter(item=>!chosen.has(item.id));
    ordered.splice(0,ordered.length,...(direction==="front"?[...other,...selected]:[...selected,...other]));
  }else{
    const indices=[...ordered.keys()];
    if(direction==="forward")indices.reverse();
    for(const i of indices){
      const other=i+(direction==="forward"?1:-1);
      if(other<0||other>=ordered.length)continue;
      if(chosen.has(ordered[i]!.id)&&!chosen.has(ordered[other]!.id)){
        [ordered[i],ordered[other]]=[ordered[other]!,ordered[i]!];
      }
    }
  }
  return ordered.map((entry,index)=>({id:entry.id,zIndex:(index+1)*10}));
}
