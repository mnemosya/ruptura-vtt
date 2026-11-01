import { normalizarComando } from "./comandoPericia";
import type { EtapaComando, OpcaoComando } from "./comandoConteudo";

/** A mesma ordem exigida pela conjuração no servidor: custo, depois escolhas. */
export function etapaPendente(opcao: OpcaoComando, argumento: string): {
  etapa: EtapaComando;
  anteriores: string[];
  busca: string;
} | null {
  let resto = normalizarComando(argumento.trim()).replace(/\s+/g, " ");
  const anteriores: string[] = [];
  for (const etapa of opcao.etapas ?? []) {
    const exata = [...etapa.opcoes].sort((a, b) => b.codigo.length - a.codigo.length)
      .find((o) => resto === normalizarComando(o.codigo) || resto.startsWith(`${normalizarComando(o.codigo)} `));
    if (exata) {
      anteriores.push(exata.codigo);
      resto = resto.slice(exata.codigo.length).trim();
      continue;
    }
    const livre = etapa.valorLivre;
    if (livre) {
      const match = new RegExp(`^${livre.prefixo} (\\d+)(?: |$)`).exec(resto);
      const valor = match ? Number(match[1]) : null;
      if (match && valor !== null && Number.isSafeInteger(valor) && valor >= livre.min && (livre.max === null || valor <= livre.max)) {
        anteriores.push(`${livre.prefixo} ${valor}`);
        resto = resto.slice(match[0].length).trim();
        continue;
      }
    }
    return { etapa, anteriores, busca: resto };
  }
  if (resto && opcao.etapas?.length) return { etapa: opcao.etapas.at(-1)!, anteriores: anteriores.slice(0, -1), busca: resto };
  return null;
}
