"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSupabaseClient } from "../../../../../lib/supabase/browserClient";
import { definirTargetAction, lerTargetsAction } from "../_painel/acoes/targetsPainel";
import { targetsVisiveis, type TargetVtt } from "../_dominio/targets";

export function useTargets(campaignId:string,sceneId:string|null,userId:string|null,visiveis:ReadonlySet<string>) {
  const [registros,setRegistros]=useState<TargetVtt[]>([]);
  const [erro,setErro]=useState<string|null>(null);
  const [erroCanal,setErroCanal]=useState<string|null>(null);
  const [agora,setAgora]=useState(Date.now);
  const registrosRef=useRef(registros);
  const fila=useRef(Promise.resolve());
  const aplicar=useCallback((dados:TargetVtt[])=>{registrosRef.current=dados;setRegistros(dados);},[]);
  const cenaRef=useRef(sceneId);cenaRef.current=sceneId;
  const leitura=useRef(0), ocupado=useRef(false);
  const atualizar=useCallback(async(renovar=false)=>{
    if(!sceneId||ocupado.current)return;
    const seq=++leitura.current;
    const r=await lerTargetsAction(sceneId,renovar);
    if(cenaRef.current!==sceneId||seq!==leitura.current)return;
    if(r.ok){aplicar(r.dados??[]);setErro(null);}else setErro(r.erro??"Alvos sem sincronização.");
  },[sceneId,aplicar]);
  useEffect(()=>{
    aplicar([]);setErro(null);setErroCanal(null);
    if(!sceneId||!userId)return;
    void atualizar();
    let vivo=true;
    const client=getBrowserSupabaseClient();
    const channel=client?.channel(`campaign:${campaignId}:scene:${sceneId}:vtt:targets`,{config:{private:true}})
      .on("broadcast",{event:"targets_changed"},()=>void atualizar())
      .subscribe(status=>{if(!vivo)return;if(status==="SUBSCRIBED"){setErroCanal(null);void atualizar();}else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")setErroCanal("Alvos reconectando; atualização periódica ativa.");});
    // Lease permite remover alvos de clientes desconectados sem depender de unload.
    const timer=setInterval(()=>void atualizar(true),30000);
    const foco=()=>void atualizar(true);window.addEventListener("focus",foco);
    return()=>{vivo=false;++leitura.current;clearInterval(timer);window.removeEventListener("focus",foco);if(channel)void client?.removeChannel(channel);};
  },[campaignId,sceneId,userId,atualizar,aplicar]);
  useEffect(()=>{
    const proxima=Math.min(...registros.map(t=>Date.parse(t.expiresAt)).filter(t=>t>agora));
    if(!Number.isFinite(proxima))return;
    const timer=setTimeout(()=>setAgora(Date.now()),Math.max(0,proxima-Date.now())+1);
    return()=>clearTimeout(timer);
  },[registros,agora]);
  const validos=useMemo(()=>targetsVisiveis(registros,visiveis,agora),[registros,visiveis,agora]);
  const meus=useMemo(()=>validos.filter(t=>t.autorId===userId).map(t=>t.tokenId),[validos,userId]);
  const todos=useMemo(()=>[...new Set(validos.map(t=>t.tokenId))],[validos]);
  const alternar=useCallback((tokenId:string)=>{
    // Serializa cliques rápidos sem descartá-los ou usar uma seleção antiga.
    fila.current=fila.current.then(async()=>{
      if(!sceneId||!userId||cenaRef.current!==sceneId)return;
      ocupado.current=true;++leitura.current;
      try {
        const marcado=registrosRef.current.some(t=>t.tokenId===tokenId&&t.autorId===userId&&Date.parse(t.expiresAt)>Date.now());
        const r=await definirTargetAction(sceneId,tokenId,!marcado);
        if(cenaRef.current!==sceneId)return;
        if(r.ok){aplicar(r.dados??[]);setErro(null);}else setErro(r.erro??"Falha ao marcar alvo.");
      } catch { if(cenaRef.current===sceneId)setErro("Falha ao marcar alvo. Tente novamente."); }
      finally { ocupado.current=false; }
    });
    return fila.current;
  },[sceneId,userId,aplicar]);
  return {todos,meus,registros:validos,alternar,erro:erro??erroCanal};
}
