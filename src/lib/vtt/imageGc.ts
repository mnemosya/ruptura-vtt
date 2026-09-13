/**
 * Coleta de lixo das imagens — SEM `server-only` de propósito.
 *
 * O resto do caminho de imagens é server-only porque roda dentro do
 * Next e nunca pode escorregar para o bundle do cliente. A coleta é
 * diferente: além de rodar pelo serviço, ela precisa rodar por script
 * (`scripts/dev/gc-vtt-imagens.ts`, chamável por agendador), e
 * `server-only` lança fora do contexto de request.
 *
 * A proteção não se perde: nada aqui cria cliente nenhum. O
 * `SupabaseClient` chega por parâmetro, e só quem tem a service role
 * consegue passar um que funcione — a autoridade continua sendo a
 * chave, não o import.
 *
 * A ordem — banco marca, Storage remove — é o que torna a passada
 * repetível: o que falhar continua marcado para a próxima.
 */

import { type SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_IMAGENS_VTT = "vtt-imagens";

export interface ResultadoColeta {
  reservasVencidas: number;
  semUso: number;
  removidos: number;
  falhas: number;
  orfaosNoBucket: number;
}

/** Remove um objeto; `true` também quando ele já não estava lá. */
async function removerObjeto(client: SupabaseClient, storagePath: string): Promise<boolean> {
  const { error } = await client.storage.from(BUCKET_IMAGENS_VTT).remove([storagePath]);
  return !error;
}

export async function coletarLixoCom(
  client: SupabaseClient,
  carenciaHoras = 1,
): Promise<ResultadoColeta> {
  const resultado: ResultadoColeta = {
    reservasVencidas: 0, semUso: 0, removidos: 0, falhas: 0, orfaosNoBucket: 0,
  };

  // 1. Reservas vencidas: devolve quota e marca o pendente. Inclui o
  //    objeto físico de um `PUT` que chegou a concluir — sem isto,
  //    bytes físicos pendentes passariam da quota contabilizada.
  const vencidas = await client.rpc("limpar_reservas_vencidas");
  if (!vencidas.error && Array.isArray(vencidas.data)) {
    resultado.reservasVencidas = vencidas.data.length;
  }

  // 2. Arquivos prontos que nenhum uso referencia. A carência protege o
  //    fluxo em andamento (upload feito, uso ainda não criado).
  const semUso = await client.rpc("vtt_coletar_imagens_sem_uso", {
    p_carencia: `${carenciaHoras} hours`,
  });
  if (!semUso.error && Array.isArray(semUso.data)) {
    resultado.semUso = semUso.data.length;
  }

  // 3. Tudo que está marcado — inclusive o que uma passada anterior não
  //    conseguiu apagar. A linha só some depois que o objeto sumiu.
  const pendentes = await client.rpc("vtt_imagens_pendentes_de_remocao");
  if (!pendentes.error && Array.isArray(pendentes.data)) {
    for (const linha of pendentes.data as { storage_path: string }[]) {
      const caminho = linha.storage_path;
      if (await removerObjeto(client, caminho)) {
        // A confirmação é a metade que fecha a conta: ela apaga a linha
        // e DEVOLVE os bytes (0103). Sem conferir o erro, um objeto que
        // saiu do bucket e uma confirmação recusada eram contados como
        // sucesso — a quota ficava presa a um arquivo que não existe
        // mais, e o número dizia que tudo correu bem.
        const confirmacao = await client.rpc("vtt_confirmar_remocao_imagem", {
          p_storage_path: caminho,
        });
        if (confirmacao.error) resultado.falhas += 1;
        else resultado.removidos += 1;
      } else {
        resultado.falhas += 1;
      }
    }
  }

  // 4. Objetos no bucket sem linha nenhuma: resto de `PUT` cuja reserva
  //    morreu antes de qualquer registro sobreviver.
  const { data: pastas } = await client.storage.from(BUCKET_IMAGENS_VTT).list("", { limit: 1000 });
  for (const pasta of pastas ?? []) {
    const { data: arquivos } = await client.storage
      .from(BUCKET_IMAGENS_VTT)
      .list(pasta.name, { limit: 1000 });
    for (const arquivo of arquivos ?? []) {
      const caminho = `${pasta.name}/${arquivo.name}`;
      const { data: linha } = await client
        .from("vtt_image_assets")
        .select("id")
        .eq("storage_path", caminho)
        .maybeSingle();
      if (linha) continue;
      if (await removerObjeto(client, caminho)) resultado.orfaosNoBucket += 1;
      else resultado.falhas += 1;
    }
  }

  return resultado;
}
