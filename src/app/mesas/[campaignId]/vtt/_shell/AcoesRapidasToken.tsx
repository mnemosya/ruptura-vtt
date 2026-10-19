"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FlaskConical, Sparkle, Sword, X } from "lucide-react";
import type { CategoriaAcaoToken } from "../_dominio/targets";

// Roda tática: quatro fatias em volta do token, na escala do mapa
// (hex de 26px, token médio ~43px). As fatias têm vão PARALELO de 8px
// — o vão angular abria em cunha pra fora. O ponteiro gira sempre pelo
// caminho mais curto (Atacar → Usar item vai direto pra esquerda).
type Fatia = CategoriaAcaoToken | "fechar";
const ANGULO: Record<Fatia, number> = { atacar: 0, conjurar: 90, fechar: 180, item: 270 } as Record<Fatia, number>;
const FATIAS: { id: Fatia; d: string }[] = [
  { id: "atacar", d: "M -76.3 -82 A 112 112 0 0 1 76.3 -82 L 21 -26.7 A 34 34 0 0 0 -21 -26.7 Z" },
  { id: "conjurar", d: "M 82 -76.3 A 112 112 0 0 1 82 76.3 L 26.7 21 A 34 34 0 0 0 26.7 -21 Z" },
  { id: "fechar", d: "M 76.3 82 A 112 112 0 0 1 -76.3 82 L -21 26.7 A 34 34 0 0 0 21 26.7 Z" },
  { id: "item", d: "M -82 76.3 A 112 112 0 0 1 -82 -76.3 L -26.7 -21 A 34 34 0 0 0 -26.7 21 Z" },
];

export function AcoesRapidasToken({tokenId,nome,onEscolher,onFechar}:{
  tokenId:string;nome:string;onEscolher:(categoria:CategoriaAcaoToken)=>void;onFechar:()=>void;
}) {
  const [pos,setPos]=useState<{x:number;y:number}|null>(null);
  const [ativa,setAtiva]=useState<{id:Fatia;ang:number}|null>(null);
  useEffect(()=>{
    let frame=0;
    const atualizar=()=>{
      const token=document.querySelector(`[data-token-id="${CSS.escape(tokenId)}"] [data-token-disco]`)
        ??document.querySelector(`[data-token-id="${CSS.escape(tokenId)}"]`);
      if(!token){onFechar();return;}
      const r=token.getBoundingClientRect();
      const x=Math.max(130,Math.min(innerWidth-130,r.x+r.width/2));
      const y=Math.max(130,Math.min(innerHeight-130,r.y+r.height/2));
      setPos(p=>p?.x===x&&p.y===y?p:{x,y});frame=requestAnimationFrame(atualizar);
    };
    atualizar();
    const teclas=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();onFechar();}};
    const fora=(e:PointerEvent)=>{if(!(e.target as Element).closest('.rv-token-actions'))onFechar();};
    window.addEventListener('keydown',teclas);window.addEventListener('pointerdown',fora);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('keydown',teclas);window.removeEventListener('pointerdown',fora);};
  },[tokenId,onFechar]);
  // Foco no GRUPO, não no primeiro botão: focar "Atacar" o fazia abrir
  // já aceso, como se a escolha estivesse feita. O Tab entra nos botões
  // a partir daqui e o Esc segue fechando.
  useEffect(()=>{if(pos)document.querySelector<HTMLDivElement>('.rv-token-actions')?.focus({preventScroll:true});},[!!pos]);
  if(!pos)return null;
  const apontar=(id:Fatia)=>setAtiva(a=>{
    if(a?.id===id)return a;
    const atual=a?.ang??ANGULO[id];
    return {id,ang:atual+((ANGULO[id]-atual)%360+540)%360-180};
  });
  const acao=(id:CategoriaAcaoToken,rotulo:string,tecla:string,icone:React.ReactNode)=>(
    <button type="button" className={`rv-token-actions__${id}`} data-on={ativa?.id===id||undefined} aria-label={rotulo} aria-keyshortcuts={`Shift+${tecla}`}
      onPointerEnter={()=>apontar(id)} onFocus={()=>apontar(id)} onClick={()=>onEscolher(id)}>
      {icone}<span>{rotulo}</span><kbd>⇧ {tecla}</kbd>
    </button>
  );
  return createPortal(<div className="rv-token-actions rc-cursor-scope" role="group" tabIndex={-1} aria-label={`Ações de ${nome}`} style={{left:pos.x,top:pos.y,outline:"none"}} data-testid="token-acoes-radial">
    <svg className="rv-token-actions__roda" viewBox="-140 -140 280 280" aria-hidden="true">
      <circle r="122" className="rv-token-actions__orbita"/>
      {FATIAS.map(f=><path key={f.id} d={f.d} data-fatia={f.id} data-on={ativa?.id===f.id||undefined}/>)}
      <g className="rv-token-actions__ponteiro" data-visivel={!!ativa||undefined} data-sair={ativa?.id==="fechar"||undefined} style={{transform:`rotate(${ativa?.ang??0}deg)`}}>
        <path d="M 0 -32 L -4.5 -26 L 4.5 -26 Z"/>
      </g>
    </svg>
    {acao("atacar","Atacar","Q",<Sword size={18} aria-hidden="true"/>)}
    {acao("conjurar","Conjurar","W",<Sparkle size={18} aria-hidden="true"/>)}
    {acao("item","Usar item","E",<FlaskConical size={18} aria-hidden="true"/>)}
    <button type="button" className="rv-token-actions__fechar" data-on={ativa?.id==="fechar"||undefined} aria-label="Fechar" aria-keyshortcuts="Escape"
      onPointerEnter={()=>apontar("fechar")} onFocus={()=>apontar("fechar")} onClick={onFechar}>
      <X size={16} aria-hidden="true"/><span>Fechar</span><kbd>Esc</kbd>
    </button>
  </div>,document.body);
}
