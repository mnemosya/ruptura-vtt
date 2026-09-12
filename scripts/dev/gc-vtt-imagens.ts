/**
 * Coleta de lixo das imagens do VTT.
 *
 * Existe porque banco e Storage NÃO compartilham transação. Em vez de
 * apagar nos dois lugares e torcer para as duas pontas passarem, o
 * banco marca e este script remove — o que falhar continua marcado e a
 * próxima passada tenta de novo. Rodar duas vezes seguidas não faz mal
 * nenhum; é essa a propriedade que importa.
 *
 * Quatro frentes, nesta ordem:
 *   1. reservas vencidas (devolve quota E remove o objeto físico que um
 *      `PUT` já concluído possa ter deixado — sem isso, bytes pendentes
 *      passariam da quota contabilizada);
 *   2. arquivos que nenhum uso referencia;
 *   3. o que já estava marcado e não foi removido antes;
 *   4. objetos no bucket sem linha nenhuma no banco.
 *
 * Uso:
 *   npx tsx scripts/dev/gc-vtt-imagens.ts [--carencia-horas=1]
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY: é a única parte
 * do sistema que remove arquivo, e remover é privilégio de servidor.
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { coletarLixoCom } from "../../src/lib/vtt/imageGc";

loadDotenv({ path: ".env.local" });

function carenciaHoras(): number {
  const arg = process.argv.find((a) => a.startsWith("--carencia-horas="));
  if (!arg) return 1;
  const valor = Number(arg.split("=")[1]);
  if (!Number.isFinite(valor) || valor < 0) {
    console.error("--carencia-horas precisa ser um número >= 0.");
    process.exit(1);
  }
  return valor;
}

async function main(): Promise<void> {
  // A carência protege o fluxo em andamento: um arquivo recém-promovido
  // pode estar entre o upload e a criação do uso.
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para coletar.");
    process.exit(1);
  }
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const r = await coletarLixoCom(client, carenciaHoras());
  console.log(`reservas vencidas ........ ${r.reservasVencidas}`);
  console.log(`arquivos sem uso ......... ${r.semUso}`);
  console.log(`removidos do Storage ..... ${r.removidos}`);
  console.log(`órfãos no bucket ......... ${r.orfaosNoBucket}`);
  console.log(`falhas (tenta de novo) ... ${r.falhas}`);

  // Falha de remoção NÃO é erro de execução: o estado continua
  // consistente e a próxima passada resolve. Sair com 1 aqui faria um
  // agendador tratar operação normal como incidente.
  if (r.falhas > 0) console.log("\nalgumas remoções falharam — seguem marcadas para a próxima passada");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
