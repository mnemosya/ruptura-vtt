/**
 * A coleta de imagens não pode contar como REMOVIDO o que não foi
 * confirmado.
 *
 * `coletarLixoCom` (src/lib/vtt/imageGc.ts) faz duas coisas por
 * arquivo: tira o objeto do bucket e chama
 * `vtt_confirmar_remocao_imagem`, que apaga a linha e DEVOLVE os bytes
 * (0103). A segunda metade é a que fecha a conta.
 *
 * O defeito corrigido: o resultado dessa confirmação era descartado. Um
 * objeto que saía do bucket com a confirmação recusada era contado como
 * `removidos`, e a quota ficava presa a um arquivo que não existe mais
 * — com o número dizendo que tudo correu bem. O sintoma é o pior tipo:
 * uma campanha que trava em 1 GB com o bucket vazio, e um relatório de
 * coleta afirmando sucesso.
 *
 * Este check NÃO fala com o Supabase. Ele injeta um client-dublê em
 * `coletarLixoCom` — que já recebe o client por parâmetro — e força a
 * confirmação a falhar. É a única forma de exercitar o caminho de
 * recusa: fazer a RPC real falhar exigiria quebrar permissão no meio da
 * coleta, e aí as chamadas anteriores falhariam antes.
 *
 * Uso: npx tsx scripts/dev/check-vtt-coleta-confirmacao.ts
 */

import { coletarLixoCom } from "../../src/lib/vtt/imageGc";
import type { SupabaseClient } from "@supabase/supabase-js";

let passou = 0;
let falhou = 0;
function criterio(nome: string, ok: boolean, detalhe = "") {
  if (ok) { passou++; console.log(`  ok   ${nome}`); }
  else { falhou++; console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const CAMINHO = "campanha-teste/arquivo.webp";

/**
 * Um client mínimo, com só o que a coleta usa.
 *
 * `confirmacaoFalha` decide o comportamento da RPC que está sob teste;
 * todo o resto responde o mínimo para a coleta chegar até ela.
 */
function clienteDuble(confirmacaoFalha: boolean) {
  const chamadas: string[] = [];
  const cliente = {
    rpc: async (nome: string) => {
      chamadas.push(nome);
      if (nome === "limpar_reservas_vencidas") return { data: [], error: null };
      if (nome === "vtt_coletar_imagens_sem_uso") return { data: [], error: null };
      if (nome === "vtt_imagens_pendentes_de_remocao") {
        return { data: [{ storage_path: CAMINHO }], error: null };
      }
      if (nome === "vtt_confirmar_remocao_imagem") {
        return confirmacaoFalha
          ? { data: null, error: { message: "recusa simulada" } }
          : { data: null, error: null };
      }
      return { data: null, error: null };
    },
    storage: {
      from: () => ({
        // O objeto SAI do bucket com sucesso nos dois cenários — é
        // exatamente isso que torna a confirmação a única diferença.
        remove: async () => ({ data: [{}], error: null }),
        list: async () => ({ data: [], error: null }),
      }),
    },
  };
  return { cliente: cliente as unknown as SupabaseClient, chamadas };
}

async function main() {
  console.log("=== check-vtt-coleta-confirmacao ===\n");

  {
    const { cliente, chamadas } = clienteDuble(false);
    const r = await coletarLixoCom(cliente, 1);
    criterio("confirmação aceita → conta como removido", r.removidos === 1, `removidos=${r.removidos}`);
    criterio("e não conta falha", r.falhas === 0, `falhas=${r.falhas}`);
    criterio("a confirmação foi mesmo chamada",
      chamadas.includes("vtt_confirmar_remocao_imagem"), chamadas.join(", "));
  }

  {
    const { cliente } = clienteDuble(true);
    const r = await coletarLixoCom(cliente, 1);
    // O objeto saiu do bucket nos dois casos. A ÚNICA diferença é a
    // confirmação — então qualquer divergência aqui é ela.
    criterio("confirmação recusada → NÃO conta como removido", r.removidos === 0, `removidos=${r.removidos}`);
    criterio("e conta como falha", r.falhas === 1, `falhas=${r.falhas}`);
  }

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
