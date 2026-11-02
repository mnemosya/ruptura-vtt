"use client";

/**
 * ROLAGEM — dois desenhos, porque são duas coisas.
 *
 * TESTE (atributo/perícia): a MESMA leitura da ferramenta de rolar
 * dados — a fileira de d8 já parados, com o que valeu aceso, e a faixa
 * de classificação (`_dados3d/ResultadoRolagem`). É de propósito que
 * este card não desenha a sua própria versão disso: a ferramenta, o
 * Console do Personagem e o Chat mostram um resultado do mesmo jeito,
 * ou a mesa aprende três leituras pro mesmo evento.
 *
 * BANDEJA LIVRE: continua na grade de módulos técnicos. Ali não existe
 * "maior dado" nem classificação — os dados são somados, e a faixa de
 * teste diria "maior 7 · sem perícia" sobre uma conta que não é essa.
 *
 * No desenho de teste NÃO há bloco recolhível: os dados individuais
 * eram o que se escondia atrás do `[ + ]`, e agora estão à mostra. Os
 * modificadores nomeados viram a nota da faixa, logo abaixo da conta —
 * visíveis, não guardados.
 *
 * Nenhuma rolagem acontece aqui: este componente só DESENHA o que os
 * motores de rolagem do projeto já gravaram no log.
 */

import { Dices, Target } from "lucide-react";
import { CartaoBase } from "../ui/CartaoBase";
import { BarraAlvo } from "../ui/primitivas";
import { DadosLivres, DadosRolados, FaixaSoma, MONO, TEKO, OXANIUM, INK_DIM, INK_FAINT, ACCENTS, RESULTS } from "../../_dados3d/ResultadoRolagem";
import type { CartaoRolagem } from "./contratos";
import { acentoDoCartao } from "./contratos";
import { cabecalhoDe } from "./CabecalhoPersonagem";

/** Modificadores nomeados, na linha extra que a faixa reserva pra isso. */
function NotaDeModificadores({ modificadores }: { modificadores: CartaoRolagem["modificadores"] }) {
  if (modificadores.length === 0) return null;
  return (
    <div
      data-testid="painel-feed-modificadores"
      style={{ marginTop: 4, fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: ACCENTS.arcane.hex }}
    >
      {modificadores.map((m) => `${m.nome} ${m.valor >= 0 ? `+${m.valor}` : m.valor}`).join(" · ")}
    </div>
  );
}

export function RollCard({
  cartao,
  hora,
  visibilidade,
}: {
  cartao: CartaoRolagem;
  hora: string;
  visibilidade?: React.ReactNode;
}) {
  const acento = acentoDoCartao(cartao);
  const teste = cartao.teste;
  const cabecalho = cabecalhoDe(cartao.autoria);

  /* ── desenho de TESTE (estrutura do board "Chat Log") ──
     meta "NOME · perícia" → número grande + veredito + margem·CD → fichas
     dos dados + pílulas de modificador. Sem título, sem subtítulo, sem
     caixa em volta do resultado. */
  if (teste) {
    const res = teste.classificacao ? RESULTS[teste.classificacao] : null;
    const acc = res?.accent ?? ACCENTS.slate;
    const total = cartao.total ?? teste.maiorDado + teste.periciaValor + teste.modificador;
    const margem = teste.cd != null && total >= teste.cd ? total - teste.cd : null;
    const sub = [margem != null ? `margem +${margem}` : null, teste.cd != null ? `cd ${teste.cd}` : "sem cd"]
      .filter(Boolean).join(" · ");
    const pilulas: string[] = [];
    if (teste.pericia && teste.periciaValor) pilulas.push(`${teste.periciaValor >= 0 ? "+" : ""}${teste.periciaValor} ${teste.pericia.toLowerCase()}`);
    if (teste.modificador) pilulas.push(`${teste.modificador >= 0 ? "+" : ""}${teste.modificador} mod`);
    for (const m of cartao.modificadores) pilulas.push(`${m.valor >= 0 ? "+" : ""}${m.valor} ${m.nome.toLowerCase()}`);
    return (
      <CartaoBase
        tipo={cartao.tipoTeste}
        icone={<Dices />}
        acento={acento}
        autor={`${cartao.autoria.nome} · ${cartao.nome}`}
        hora={hora}
        horaISO={cartao.criadoEm}
        cabecalho={cabecalho}
        visibilidade={visibilidade}
        semSubtitulo
        testId="painel-feed-rolagem"
        atributos={{ "data-kind": "rolagem", "data-desenho": "teste" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="rup-countpop" data-testid="painel-feed-resultado" style={{ flex: "none", fontFamily: TEKO, fontSize: 44, fontWeight: 600, lineHeight: 0.75, color: acc.hex }}>{total}</span>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: OXANIUM, fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: acc.hex }}>
              {res ? <res.Icon width={13} height={13} style={{ flexShrink: 0 }} /> : <Dices width={13} height={13} style={{ flexShrink: 0 }} />}
              {res ? res.label : "Sem CD definida"}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: INK_FAINT }}>{sub}</span>
          </div>
        </div>
        {cartao.dados.length > 0 && (
          <div data-testid="painel-feed-dados" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {/* O dado que valeu acende na cor do veredito. */}
            <DadosRolados dados={cartao.dados} maiorDado={teste.maiorDado} acento={res?.accent} />
            {pilulas.map((p, i) => (
              <span key={i} style={{ display: "inline-grid", placeItems: "center", height: 20, padding: "0 6px", border: "1px dashed rgba(127,149,179,.35)", fontFamily: MONO, fontSize: 10, fontWeight: 700, color: INK_DIM }}>{p}</span>
            ))}
          </div>
        )}
        {cartao.alvo && <BarraAlvo nome={cartao.alvo} resultado={<Target size={11} />} acento="neutro" />}
      </CartaoBase>
    );
  }

  /* ── desenho de BANDEJA LIVRE ── */
  /* A MESMA leitura da aba Livre da ferramenta: a fileira com a peça
     certa pra cada face e a faixa da soma (`FaixaSoma`, extraída de
     `RoladorDados` justamente pra isso). Antes daqui saía uma grade de
     módulos técnicos — "MOD +2" numa caixinha — que não existia em
     lugar nenhum além deste card.

     Registros ANTIGOS (antes do payload guardar `termos`) não sabem as
     faces de cada dado: nesses, a fileira não aparece e fica só a
     faixa, que é o que o payload garante. */
  const termos = cartao.termos;
  const base = cartao.maior != null && cartao.modo !== "sum"
    ? cartao.maior
    : termos.length > 0
      ? termos.reduce((t, d) => t + d.valor, 0)
      : cartao.dados.reduce((t, d) => t + d, 0);
  const modificador = cartao.modulos.find((m) => m.rotulo === "MOD");
  const modNumero = modificador ? Number.parseInt(modificador.valor.replace("−", "-"), 10) : 0;
  const total = cartao.total ?? base + (Number.isFinite(modNumero) ? modNumero : 0);
  const cd = cartao.modulos.find((m) => m.rotulo === "ND");
  const cdNumero = cd ? Number.parseInt(cd.valor, 10) : null;

  return (
    <CartaoBase
      tipo={cartao.tipoTeste}
      nome={cartao.nome}
      icone={<Dices />}
      acento={acento}
      autor={cartao.autoria.nome}
      hora={hora}
      horaISO={cartao.criadoEm}
      cabecalho={cabecalho}
      visibilidade={visibilidade}
      testId="painel-feed-rolagem"
      atributos={{ "data-kind": "rolagem", "data-desenho": "livre" }}
    >
      {termos.length > 0 && (
        <div data-testid="painel-feed-dados">
          {/* Os dados seguem o VEREDITO, como no card de teste: com CD
              eles saem na cor da faixa (ciano no sucesso, vermelho na
              falha); sem CD, no arcano da rolagem em repouso. Dado
              aceso numa cor e faixa em outra é o olho lendo duas
              respostas pra mesma pergunta. */}
          <DadosLivres
            termos={termos}
            maior={cartao.modo !== "sum" ? cartao.maior : null}
            acento={cartao.sucesso == null ? undefined : cartao.sucesso ? ACCENTS.cyan : ACCENTS.danger}
            size={40}
            landed
          />
        </div>
      )}

      <FaixaSoma
        base={base}
        modificador={Number.isFinite(modNumero) ? modNumero : 0}
        total={total}
        cd={Number.isFinite(cdNumero as number) ? cdNumero : null}
        modo={cartao.modo}
        testId="painel-feed-resultado"
      />

      <NotaDeModificadores modificadores={cartao.modificadores} />

      {cartao.alvo && <BarraAlvo nome={cartao.alvo} resultado={<Target size={11} />} acento="neutro" />}
    </CartaoBase>
  );
}
