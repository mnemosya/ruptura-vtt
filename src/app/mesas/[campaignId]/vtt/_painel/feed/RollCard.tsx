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
import { DadosLivres, DadosRolados, FaixaResultado as FaixaDeTeste, FaixaSoma, MONO, ACCENTS, RESULTS } from "../../_dados3d/ResultadoRolagem";
import type { CartaoRolagem } from "./contratos";
import { acentoDoCartao } from "./contratos";

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

  /* ── desenho de TESTE ── */
  if (teste) {
    return (
      <CartaoBase
        tipo={cartao.tipoTeste}
        nome={cartao.nome}
        icone={<Dices />}
        acento={acento}
        autor={cartao.autoria.nome}
        hora={hora}
        horaISO={cartao.criadoEm}
        visibilidade={visibilidade}
        testId="painel-feed-rolagem"
        atributos={{ "data-kind": "rolagem", "data-desenho": "teste" }}
      >
        {cartao.dados.length > 0 && (
          <div data-testid="painel-feed-dados">
            {/* O dado que valeu acende na cor do VEREDITO, não no ciano
                fixo: um "5" ciano de sucesso em cima de uma faixa
                vermelha de FALHA faz o olho ler duas respostas pra
                mesma pergunta. */}
            <DadosRolados
              dados={cartao.dados}
              maiorDado={teste.maiorDado}
              size={40}
              landed
              acento={teste.classificacao ? RESULTS[teste.classificacao].accent : undefined}
            />
          </div>
        )}

        <FaixaDeTeste
          testIdTotal="painel-feed-resultado"
          r={{
            maiorDado: teste.maiorDado,
            pericia: teste.pericia,
            periciaValor: teste.periciaValor,
            modificador: teste.modificador,
            total: cartao.total ?? teste.maiorDado + teste.periciaValor + teste.modificador,
            cd: teste.cd,
            classificacao: teste.classificacao,
          }}
          nota={<NotaDeModificadores modificadores={cartao.modificadores} />}
        />

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
  const base = cartao.maior != null && cartao.modo === "high"
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
            maior={cartao.modo === "high" ? cartao.maior : null}
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
