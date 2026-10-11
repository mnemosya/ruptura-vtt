import { getScopedTableClient } from "../../../../../../lib/auth/scopedClient";
import { linhaParaTokenVtt } from "../../../../../../lib/vtt/sceneStorage";
import { pegadaEfetiva, projetarPegada } from "../../_dominio/pegada";
import { hexDistancia } from "../../_mapa/hex";
export async function distanciaTokens(sceneId:string, actorId:string,targetId:string):Promise<number|null> {
  const client=await getScopedTableClient();
  const {data,error}=await client.rpc("read_vtt_scene_tokens",{p_scene_id:sceneId});
  if(error || !Array.isArray(data)) return null;
  const tokens=data.map(t=>linhaParaTokenVtt(t as Record<string,unknown>));
  const a=tokens.find(t=>t.id===actorId), b=tokens.find(t=>t.id===targetId);
  if(!a||!b)return null;
  const positions=(t:typeof a)=>projetarPegada(t,pegadaEfetiva({categoria:t.tamanho,orientacao:t.orientacao,pegadaPersonalizada:t.pegadaPersonalizada}));
  return Math.min(...positions(a).flatMap(p=>positions(b).map(q=>hexDistancia(p,q))));
}
