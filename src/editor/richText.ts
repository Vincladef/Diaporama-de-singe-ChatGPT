import type { SlideElement } from "../domain/slide.ts";

export type TextSelectionRange={id:string;start:number;end:number};
type Run=NonNullable<SlideElement["textRuns"]>[number];
function canonicalRuns(el:SlideElement):Run[]{
  const text=el.text??"";
  if(el.textRuns?.length&&el.textRuns.map(run=>run.text).join("")===text)
    return el.textRuns.map(run=>({text:run.text,styles:{...run.styles}}));
  return [{text,styles:{}}];
}
function merge(runs:Run[]):Run[]{
  const result:Run[]=[];
  for(const run of runs){
    if(!run.text)continue;
    const last=result.at(-1);
    if(last&&JSON.stringify(last.styles)===JSON.stringify(run.styles))last.text+=run.text;
    else result.push({text:run.text,styles:{...run.styles}});
  }
  return result;
}
function segments(runs:Run[],start:number,end:number):Run[]{
  const out:Run[]=[];let pos=0;
  for(const run of runs){
    const from=pos,to=pos+run.text.length;pos=to;
    if(to<=start||from>=end)continue;
    const left=Math.max(start,from),right=Math.min(to,end);
    if(right>left)out.push({text:run.text.slice(left-from,right-from),styles:{...run.styles}});
  }
  return out;
}
export function applyTextRange(el:SlideElement,start:number,end:number,property:string,value:string):SlideElement{
  const text=el.text??"";
  if(el.type!=="text"&&el.type!=="shape")return el;
  const from=Math.max(0,Math.min(text.length,Math.trunc(start)));
  const to=Math.max(from,Math.min(text.length,Math.trunc(end)));
  if(from===to)return el;
  const runs=canonicalRuns(el),pieces:Run[]=[];let pos=0;
  for(const run of runs){
    const begin=pos,finish=pos+run.text.length;pos=finish;
    const cutPoints=[begin,...[from,to].filter(x=>x>begin&&x<finish),finish];
    for(let i=0;i<cutPoints.length-1;i++){
      const a=cutPoints[i]!,b=cutPoints[i+1]!;
      pieces.push({text:run.text.slice(a-begin,b-begin),
        styles:a>=from&&b<=to?{...run.styles,[property]:value}:{...run.styles}});
    }
  }
  return {...el,textRuns:merge(pieces)};
}
export function updateTextContent(el:SlideElement,nextText:string):SlideElement{
  const prev=el.text??"";
  if(prev===nextText)return el;
  if(!el.textRuns?.length)return {...el,text:nextText};
  let prefix=0;
  while(prefix<prev.length&&prefix<nextText.length&&prev[prefix]===nextText[prefix])prefix++;
  let suffix=0;
  while(suffix<prev.length-prefix&&suffix<nextText.length-prefix&&
    prev[prev.length-1-suffix]===nextText[nextText.length-1-suffix])suffix++;
  const oldRuns=canonicalRuns(el),head=segments(oldRuns,0,prefix);
  const tail=segments(oldRuns,prev.length-suffix,prev.length);
  const inserted=nextText.slice(prefix,nextText.length-suffix);
  const inherit=(head.at(-1)??tail[0])?.styles??{};
  const middle=inserted?[{text:inserted,styles:{...inherit}}]:[];
  return {...el,text:nextText,textRuns:merge([...head,...middle,...tail])};
}
