"use server";
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
    return {ok:true,dados:data as ContextoAcaoToken};
  } catch { return {ok:false,erro:"Não foi possível validar o alvo."}; }
}
