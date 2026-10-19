"use server";
import { distanciaTokens } from "./distanciaTokens";
import { getScopedTableClient } from "../../../../../../lib/auth/scopedClient";
import { lerTargets, type ContextoAcaoToken, type TargetVtt } from "../../_dominio/targets";
import type { ResultadoPainel } from "./comum";

export async function lerTargetsAction(sceneId: string, renovar=false): Promise<ResultadoPainel<TargetVtt[]>> {
  try {
    const client=await getScopedTableClient();
    const {data,error}=await client.rpc(renovar?"renew_vtt_targets":"read_vtt_targets",{p_scene_id:sceneId});
    if(error) return {ok:false,erro:"Não foi possível sincronizar os alvos."};
    return {ok:true,dados:lerTargets(data)};
  } catch { return {ok:false,erro:"Não foi possível sincronizar os alvos."}; }
}
export async function definirTargetAction(sceneId:string,tokenId:string,selected:boolean):Promise<ResultadoPainel<TargetVtt[]>> {
  try {
    const client=await getScopedTableClient();
    const {data,error}=await client.rpc("set_vtt_target",{p_scene_id:sceneId,p_token_id:tokenId,p_selected:selected});
    if(error) return {ok:false,erro:error.code === "PGRST202" ? "Sistema de alvos indisponível. Atualize a página ou tente novamente." : error.code === "42501" ? "Você não pode marcar este token nesta cena." : "Não foi possível alterar o alvo. Tente novamente."};
    return {ok:true,dados:lerTargets(data)};
  } catch { return {ok:false,erro:"Não foi possível alterar o alvo."}; }
}
export async function contextoAcaoTokenAction(actorId:string,targetId:string|null):Promise<ResultadoPainel<ContextoAcaoToken>> {
  try {
    const client=await getScopedTableClient();
    const {data,error}=await client.rpc("read_vtt_action_context",{p_actor_id:actorId,p_target_id:targetId});
    if(error||!data) return {ok:false,erro:error?.message??"Ação indisponível."};
    const context=data as ContextoAcaoToken;
    return {ok:true,dados:{...context,distanciaMetros:context.alvoTokenId ? await distanciaTokens(context.sceneId,context.actorTokenId,context.alvoTokenId) : null}};
  } catch { return {ok:false,erro:"Não foi possível validar o alvo."}; }
}

export interface UsoItemEmAliado {
  source: { id: string; payload: unknown; updated_at: string };
  alvoNome: string; alvoCharacterId: string; itemNome: string;
  paCusto: number | null; paAntes: number; paDepois: number; quantidadeAntes: number; quantidadeDepois: number; consumido: boolean;
  mudancas: { recurso: "pv" | "pe"; dado: string; rolado: number; antes: number; depois: number }[];
  removidas: string[]; lembretes: string[];
}
/** Item de farmácia num aliado: a regra roda no banco (vtt_use_item_on_ally), que grava as duas fichas. */
export async function usarItemEmAliadoAction(actorTokenId:string,alvoTokenId:string,instanceId:string,faces:number[]|null=null):Promise<ResultadoPainel<UsoItemEmAliado>> {
  try {
    const client=await getScopedTableClient();
    const {data,error}=await client.rpc("vtt_use_item_on_ally",{p_actor_token:actorTokenId,p_target_token:alvoTokenId,p_instance_id:instanceId,p_faces:faces});
    if(error||!data) return {ok:false,erro:error?.message??"Não foi possível usar o item."};
    return {ok:true,dados:data as UsoItemEmAliado};
  } catch { return {ok:false,erro:"Não foi possível usar o item."}; }
}
