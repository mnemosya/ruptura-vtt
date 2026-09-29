"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { CategoriaAcaoToken } from "../_dominio/targets";

export function AcoesRapidasToken({tokenId,nome,onEscolher,onFechar}:{
  tokenId:string;nome:string;onEscolher:(categoria:CategoriaAcaoToken)=>void;onFechar:()=>void;
}) {
  const [pos,setPos]=useState<{x:number;y:number}|null>(null);
  useEffect(()=>{
    let frame=0;
    const atualizar=()=>{
      const token=document.querySelector(`[data-token-id="${CSS.escape(tokenId)}"] [data-token-disco]`)
        ??document.querySelector(`[data-token-id="${CSS.escape(tokenId)}"]`);
      if(!token){onFechar();return;}
      const r=token.getBoundingClientRect();
      const x=Math.max(122,Math.min(innerWidth-122,r.x+r.width/2));
      const y=Math.max(122,Math.min(innerHeight-122,r.y+r.height/2));
      setPos(p=>p?.x===x&&p.y===y?p:{x,y});frame=requestAnimationFrame(atualizar);
    };
    atualizar();
    const teclas=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();onFechar();}};
    const fora=(e:PointerEvent)=>{if(!(e.target as Element).closest('.rv-token-actions'))onFechar();};
    window.addEventListener('keydown',teclas);window.addEventListener('pointerdown',fora);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('keydown',teclas);window.removeEventListener('pointerdown',fora);};
  },[tokenId,onFechar]);
  // Foco no GRUPO, não no primeiro botão: focar "Atacar" o fazia abrir
  // já aceso (ciano), como se a escolha estivesse feita. O Tab entra nos
  // botões a partir daqui e o Esc segue fechando.
  useEffect(()=>{if(pos)document.querySelector<HTMLDivElement>('.rv-token-actions')?.focus({preventScroll:true});},[!!pos]);
  if(!pos)return null;
  return createPortal(<div className="rv-token-actions rc-cursor-scope" role="group" tabIndex={-1} aria-label={`Ações de ${nome}`} style={{left:pos.x,top:pos.y,outline:"none"}} data-testid="token-acoes-radial">
    <div className="rv-token-actions__anel" aria-hidden="true"/>
    <button type="button" className="rv-token-actions__atacar" onClick={()=>onEscolher('atacar')}>Atacar</button>
    <button type="button" className="rv-token-actions__conjurar" onClick={()=>onEscolher('conjurar')}>Conjurar</button>
    <button type="button" className="rv-token-actions__item" onClick={()=>onEscolher('item')}>Usar item</button>
    <button type="button" className="rv-token-actions__fechar" onClick={onFechar} aria-label="Fechar"><X size={15} aria-hidden="true"/></button>
  </div>,document.body);
}
