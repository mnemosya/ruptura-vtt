import { SURTOS_SOBRECARGA } from "../../../../../../lib/rulesetV12/ruptura";
import { normalizarComando } from "./comandoPericia";

export type LeituraSobrecarga = { tipo: "texto" | "parcial" } | { tipo: "erro"; erro: string } | { tipo: "ok"; nome: string; pontos: number };

export function lerComandoSobrecarga(entrada: string): LeituraSobrecarga {
  const match = /^\/s(?:\s|$)/i.exec(entrada.trim());
  if (!match) return { tipo: "texto" };
  const corpo = normalizarComando(entrada.trim().slice(match[0].length).trim()).replace(/^sobrecarga\s+/, "");
  if (!corpo || corpo === "sobrecarga") return { tipo: "parcial" };
  const escolha = SURTOS_SOBRECARGA.find((s) => {
    const nome = normalizarComando(s.nome);
    const curto = nome.replace(/^surto de /, "");
    return corpo === nome || corpo === curto || corpo.startsWith(`${nome} `) || corpo.startsWith(`${curto} `);
  });
  if (!escolha) return SURTOS_SOBRECARGA.some((s) => normalizarComando(s.nome).includes(corpo)) ? { tipo: "parcial" } : { tipo: "erro", erro: "Surto de Sobrecarga indisponível." };
  const nome = normalizarComando(escolha.nome);
  const curto = nome.replace(/^surto de /, "");
  const resto = corpo.startsWith(nome) ? corpo.slice(nome.length).trim() : corpo.slice(curto.length).trim();
  if (!resto) return { tipo: "ok", nome: escolha.nome, pontos: escolha.custo.min };
  const pontos = Number(resto);
  if (!/^\d+$/.test(resto) || !Number.isSafeInteger(pontos) || pontos < escolha.custo.min || pontos > escolha.custo.max) return { tipo: "erro", erro: `${escolha.nome} aceita ${escolha.custo.min}${escolha.custo.max > escolha.custo.min ? ` a ${escolha.custo.max}` : ""} ponto(s) de Sobrecarga.` };
  return { tipo: "ok", nome: escolha.nome, pontos };
}
