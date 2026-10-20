"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FlaskConical, Sparkle, Sword, X, Zap } from "lucide-react";
import type { CategoriaAcaoToken } from "../_dominio/targets";

// Roda tática: cinco fatias em volta do token, na escala do mapa
// (hex de 26px, token médio ~43px). Fechar fica embaixo e as outras se
// abrem em leque simétrico. As fatias têm vão PARALELO de 8px — o vão
// angular abria em cunha pra fora. O ponteiro gira sempre pelo caminho
// mais curto.
type Fatia = CategoriaAcaoToken | "acoes" | "fechar";
const ANGULO: Record<Fatia, number> = { atacar: 324, conjurar: 36, acoes: 108, fechar: 180, item: 252 };
const MEIA = 36, R_FORA = 112, R_DENTRO = 34, VAO = 4, R_ROTULO = 73;
const rad = (g: number) => (g * Math.PI) / 180;
/** Ponto no círculo de raio `r`, na reta da borda `borda` deslocada `VAO` px pra dentro da fatia. */
function ponto(r: number, borda: number, sentido: 1 | -1) {
  const u = [Math.sin(rad(borda)), -Math.cos(rad(borda))], n = [sentido * Math.cos(rad(borda)), sentido * Math.sin(rad(borda))];
  const k = Math.sqrt(r * r - VAO * VAO);
  return `${(k * u[0] + VAO * n[0]).toFixed(1)} ${(k * u[1] + VAO * n[1]).toFixed(1)}`;
}
function fatia(a: number) {
  const ini = a - MEIA, fim = a + MEIA;
  return `M ${ponto(R_FORA, ini, 1)} A ${R_FORA} ${R_FORA} 0 0 1 ${ponto(R_FORA, fim, -1)} L ${ponto(R_DENTRO, fim, -1)} A ${R_DENTRO} ${R_DENTRO} 0 0 0 ${ponto(R_DENTRO, ini, 1)} Z`;
}
const FATIAS = (Object.keys(ANGULO) as Fatia[]).map((id) => ({ id, d: fatia(ANGULO[id]) }));
const lugar = (id: Fatia) => ({ left: +(R_ROTULO * Math.sin(rad(ANGULO[id]))).toFixed(1), top: +(-R_ROTULO * Math.cos(rad(ANGULO[id]))).toFixed(1) });

export function AcoesRapidasToken({tokenId,nome,onEscolher,onAbrirAcoes,onFechar}:{
  tokenId:string;nome:string;onEscolher:(categoria:CategoriaAcaoToken)=>void;onAbrirAcoes:()=>void;onFechar:()=>void;
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
  const acao=(id:CategoriaAcaoToken|"acoes",rotulo:string,tecla:string,icone:React.ReactNode)=>(
    <button type="button" className={`rv-token-actions__${id}`} style={lugar(id)} data-on={ativa?.id===id||undefined} aria-label={rotulo} aria-keyshortcuts={`Shift+${tecla}`}
      onPointerEnter={()=>apontar(id)} onFocus={()=>apontar(id)} onClick={()=>id==="acoes"?onAbrirAcoes():onEscolher(id)}>
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
    {acao("acoes","Ações","R",<Zap size={18} aria-hidden="true"/>)}
    <button type="button" className="rv-token-actions__fechar" style={lugar("fechar")} data-on={ativa?.id==="fechar"||undefined} aria-label="Fechar" aria-keyshortcuts="Escape"
      onPointerEnter={()=>apontar("fechar")} onFocus={()=>apontar("fechar")} onClick={onFechar}>
      <X size={16} aria-hidden="true"/><span>Fechar</span><kbd>Esc</kbd>
    </button>
  </div>,document.body);
}
