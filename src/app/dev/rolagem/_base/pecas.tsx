"use client";

/**
 * PEÇAS DE RESULTADO DOS PROTÓTIPOS — cópias alteradas de
 * `_dados3d/ResultadoRolagem.tsx` (`FaixaChassi`/`FaixaResultado`,
 * `FichaDado`) e de `_painel/feed/RollCard.tsx` (desenho de teste).
 *
 * Mudanças em relação ao real (o que o porte precisaria levar):
 *   · a conta é a do Notion — "d10 + atributo + perícia + mod", não
 *     "maior de Nd8 + perícia + mod";
 *   · a MARGEM aparece com sinal, na falha também (–4), ao lado do título;
 *     o cartão real só mostrava margem no sucesso;
 *   · seis rótulos do capítulo ("Falha Padrão", e não "Falha");
 *   · a paleta das faixas vem da proposta (a A tira o âmbar das
 *     limitadas); o resto do desenho é o mesmo.
 *
 * `CartaoBase` (casca dos cards do chat) é o REAL, importado sem mudança.
 */

import type { ComponentType, CSSProperties, ReactNode, SVGProps } from "react";
import { Dices } from "lucide-react";
import { CartaoBase } from "../../../mesas/[campaignId]/vtt/_painel/ui/CartaoBase";
import { Check, Cross, Dice, DoubleCheck, Half, Warn } from "../../../mesas/[campaignId]/vtt/_dados3d/icones";
import { MONO, OXANIUM, TEKO, INK_DIM, INK_FAINT } from "../../../mesas/[campaignId]/vtt/_dados3d/ResultadoRolagem";
import { FAIXAS, type Faixa, type Resolucao } from "./regra";
import { resolucao, type Rolagem } from "./estado";

export { MONO, OXANIUM, TEKO, INK_DIM, INK_FAINT };

type Icone = ComponentType<SVGProps<SVGSVGElement>>;

export interface CorFaixa {
  hex: string;
  soft: string;
  /** `data-acento` do cartão no chat (espinha). */
  acento: string;
  Icone: Icone;
}

export type Paleta = Record<Faixa, CorFaixa>;

/** A paleta de HOJE (`RESULTS` em `ResultadoRolagem.tsx`). */
export const PALETA_ATUAL: Paleta = {
  sucesso_critico: { hex: "#4fae82", soft: "rgba(79,174,130,0.09)", acento: "ok", Icone: DoubleCheck },
  sucesso_padrao: { hex: "#00d4ff", soft: "rgba(0,212,255,0.09)", acento: "cy", Icone: Check },
  sucesso_limitado: { hex: "#ff8a1f", soft: "rgba(255,138,31,0.09)", acento: "am", Icone: Half },
  falha_limitada: { hex: "#ff8a1f", soft: "rgba(255,138,31,0.09)", acento: "am", Icone: Warn },
  falha_padrao: { hex: "#d15068", soft: "rgba(209,80,104,0.09)", acento: "perigo", Icone: Cross },
  falha_critica: { hex: "#d15068", soft: "rgba(209,80,104,0.09)", acento: "perigo", Icone: Cross },
};

export const SEM_FAIXA: CorFaixa = { hex: "#6f83a3", soft: "rgba(111,131,163,0.07)", acento: "neutro", Icone: Dice };
/** Contestado empatado em que o oponente iniciou: perde, sem faixa definida no capítulo. */
const EMPATE_PERDIDO: CorFaixa = { hex: "#d15068", soft: "rgba(209,80,104,0.09)", acento: "perigo", Icone: Cross };

export function corDaLeitura(res: Resolucao | null, paleta: Paleta): CorFaixa {
  if (!res) return SEM_FAIXA;
  if (res.faixa) return paleta[res.faixa];
  if (res.empate === "oponente") return EMPATE_PERDIDO;
  return SEM_FAIXA;
}

export function rotuloDaLeitura(res: Resolucao | null): string {
  if (!res) return "—";
  if (res.faixa) return FAIXAS[res.faixa].rotulo;
  if (res.empate === "oponente") return "Falha · empate";
  return "Sem CD definida";
}

/** Margem com sinal tipográfico: +1, 0, −4. */
export function margemTexto(m: number): string {
  return m > 0 ? `+${m}` : m < 0 ? `−${Math.abs(m)}` : "0";
}

/** "cd 12" ou "× 11" (contestado) ou "sem cd". */
export function alvoTexto(r: Rolagem): string {
  const a = r.teste.alvo;
  return a.tipo === "cd" ? `cd ${a.cd}` : a.tipo === "contestado" ? `× ${a.oponente}` : "sem cd";
}

function Parcela({ children }: { children: ReactNode }) {
  return <span style={{ whiteSpace: "nowrap" }}>{children}</span>;
}
function seg(v: string, c: string) {
  return <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: c }}>{v}</span>;
}

/**
 * FAIXA DE RESULTADO (janela) — o chassi real (`FaixaChassi`): número
 * grande, ícone + veredito, conta em mono. Margem com sinal ao lado do
 * veredito. `testId` marca o total.
 */
export function FaixaTeste({ r, res, paleta, nota, testId, compacta = false, style }: {
  r: Rolagem; res: Resolucao | null; paleta: Paleta; nota?: ReactNode; testId?: string; compacta?: boolean; style?: CSSProperties;
}) {
  const cor = corDaLeitura(res, paleta);
  const t = r.teste;
  return (
    <div className="rp-faixa" data-faixa={res?.faixa ?? "sem"} style={{ display: "flex", alignItems: "center", gap: 14, padding: compacta ? "9px 12px" : "11px 13px", border: `1px solid ${cor.hex}44`, background: cor.soft, ...style }}>
      <div className="rp-faixa-total" data-testid={testId} style={{ flex: "none", minWidth: 30, fontFamily: TEKO, fontSize: compacta ? 40 : 46, fontWeight: 600, lineHeight: 0.75, color: cor.hex, fontVariantNumeric: "tabular-nums" }}>
        {res?.total ?? "—"}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <cor.Icone width={17} height={17} style={{ color: cor.hex, flexShrink: 0 }} />
          <span style={{ fontFamily: OXANIUM, fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", lineHeight: 1, color: cor.hex, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {rotuloDaLeitura(res)}
          </span>
          {res?.margem != null && (
            <span style={{ marginLeft: "auto", flex: "none", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: cor.hex }}>{margemTexto(res.margem)}</span>
          )}
        </div>
        <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2, fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: INK_FAINT }}>
          <Parcela>d10 {seg(String(res?.dado ?? "—"), cor.hex)}</Parcela>
          <Parcela>+ {t.atributo.nome.toLowerCase()} {seg(`+${t.atributo.valor}`, cor.hex)}</Parcela>
          {t.pericia ? <Parcela>+ {t.pericia.nome.toLowerCase()} {seg(`+${t.pericia.valor}`, cor.hex)}</Parcela> : <Parcela>· sem perícia</Parcela>}
          {t.modificador !== 0 && <Parcela>+ mod {seg(t.modificador > 0 ? `+${t.modificador}` : `−${Math.abs(t.modificador)}`, cor.hex)}</Parcela>}
          {t.alvo.tipo === "cd" && <Parcela>· cd {seg(String(t.alvo.cd), cor.hex)}</Parcela>}
          {t.alvo.tipo === "contestado" && <Parcela>· vs {seg(String(t.alvo.oponente), cor.hex)}</Parcela>}
        </div>
        {nota}
      </div>
    </div>
  );
}

/**
 * FICHA DE DADO (board "Chat Log") — o número num quadrinho; o que
 * VALEU acende na cor do veredito. `marca` é o sinal da natureza do
 * dado (cada proposta desenha o seu); `riscada` = o dado que deixou de
 * valer depois da troca.
 */
export function Ficha({ valor, aceso, cor, marca, riscada = false, rotulo, apagada = false, tamanho = 20, style }: {
  valor: number | null | undefined; aceso: boolean; cor: string; marca?: ReactNode; riscada?: boolean; rotulo?: string;
  apagada?: boolean; tamanho?: number; style?: CSSProperties;
}) {
  return (
    <span className="rp-ficha" data-aceso={aceso || undefined} data-riscada={riscada || undefined} aria-label={rotulo}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, minWidth: tamanho, height: tamanho, padding: "0 5px", boxSizing: "border-box",
        border: `1px solid ${aceso ? cor : "rgba(127,149,179,.3)"}`,
        background: aceso ? `color-mix(in srgb, ${cor} 20%, transparent)` : "rgba(127,149,179,.06)",
        color: aceso ? cor : INK_DIM, fontFamily: MONO, fontSize: 11, fontWeight: 700, lineHeight: 1,
        opacity: apagada ? 0.5 : 1, textDecoration: riscada ? "line-through" : undefined, ...style,
      }}>
      {marca}
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{valor ?? ""}</span>
    </span>
  );
}

/** Pílula tracejada de modificador (board "Chat Log"). */
export function Pilula({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: "inline-grid", placeItems: "center", height: 20, padding: "0 6px", border: "1px dashed rgba(127,149,179,.35)", fontFamily: MONO, fontSize: 10, fontWeight: 700, color: INK_DIM, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export function pilulasDe(r: Rolagem): string[] {
  const t = r.teste;
  const p = [`+${t.atributo.valor} ${t.atributo.nome.toLowerCase()}`];
  if (t.pericia) p.push(`+${t.pericia.valor} ${t.pericia.nome.toLowerCase()}`);
  if (t.modificador) p.push(`${t.modificador > 0 ? "+" : "−"}${Math.abs(t.modificador)} mod`);
  return p;
}

/**
 * Número grande + veredito + "margem · alvo" — a linha de abertura do
 * cartão de teste no chat (board "Chat Log").
 */
export function LinhaVeredito({ res, paleta, r, antes }: { res: Resolucao | null; paleta: Paleta; r: Rolagem; antes?: ReactNode }) {
  const cor = corDaLeitura(res, paleta);
  const sub = [res?.margem != null ? `margem ${margemTexto(res.margem)}` : null, alvoTexto(r)].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span className="rp-total-cartao" data-testid="cartao-total" style={{ flex: "none", fontFamily: TEKO, fontSize: 44, fontWeight: 600, lineHeight: 0.75, color: cor.hex, fontVariantNumeric: "tabular-nums" }}>{res?.total ?? "—"}</span>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: OXANIUM, fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: cor.hex }}>
          <cor.Icone width={13} height={13} style={{ flexShrink: 0 }} />
          {rotuloDaLeitura(res)}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: INK_FAINT }}>{sub}</span>
        {antes}
      </div>
    </div>
  );
}

/** Avatar redondo FORA do card (board "Chat Log"), sigla no lugar do retrato. */
export function AvatarCartao({ sigla }: { sigla: string }) {
  return <span className="pn-av" style={{ ["--fg-a" as string]: "var(--rv-cy)" }} aria-hidden="true">{sigla}</span>;
}

export function horaCurta(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Casca do cartão de TESTE — o `CartaoBase` real com a meta do board:
 * "NOME · perícia", hora, avatar fora. O corpo é de cada proposta.
 */
export function CartaoTeste({ r, paleta, acento, children, testId = "cartao-rolagem", atributos }: {
  r: Rolagem; paleta: Paleta; acento?: string; children: ReactNode; testId?: string; atributos?: Record<string, string>;
}) {
  const res = resolucao(r);
  const cor = corDaLeitura(res, paleta);
  const t = r.teste;
  return (
    <CartaoBase
      tipo={t.pericia ? "TESTE DE PERÍCIA" : "TESTE DE ATRIBUTO"}
      icone={<Dices />}
      acento={(acento ?? cor.acento) as "cy"}
      autor={`${t.nome} · ${t.pericia ? t.pericia.nome.toLowerCase() : t.atributo.nome.toLowerCase()}`}
      hora={horaCurta(r.criadaEm)}
      horaISO={new Date(r.criadaEm).toISOString()}
      cabecalho={<AvatarCartao sigla={t.sigla} />}
      semSubtitulo
      testId={testId}
      atributos={{ "data-kind": "rolagem", "data-desenho": "teste", "data-rolagem": r.id, ...atributos }}
    >
      {children}
    </CartaoBase>
  );
}
