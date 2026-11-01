import { ABAS, type AbaId } from "../../../../../ficha/_console/tabs";
import { normalizarComando } from "./comandoPericia";

export const ABAS_COMANDO_FICHA = [{ id: "personagem" as AbaId, label: "Ficha" }, ...ABAS.map(({ id, label }) => ({ id, label }))];

export function lerComandoFicha(entrada: string): { tipo: "texto" | "parcial" } | { tipo: "erro"; erro: string } | { tipo: "ok"; aba: AbaId } {
  const texto = entrada.trim();
  if (!/^\/f(?:\s|$)/i.test(texto)) return { tipo: "texto" };
  const argumento = normalizarComando(texto.slice(2).trim());
  if (!argumento) return { tipo: "ok", aba: "personagem" };
  const aba = ABAS_COMANDO_FICHA.find((a) => normalizarComando(a.label) === argumento || normalizarComando(a.id) === argumento || argumento === "inventario" && a.id === "mochila");
  if (aba) return { tipo: "ok", aba: aba.id };
  return ABAS_COMANDO_FICHA.some((a) => normalizarComando(a.label).startsWith(argumento))
    ? { tipo: "parcial" } : { tipo: "erro", erro: "Aba da ficha desconhecida. Escolha uma opção da lista." };
}
