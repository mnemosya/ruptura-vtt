"use client";

/**
 * COMBATE, EFEITOS E PENDÊNCIAS — os cards que dão ritmo ao feed.
 *
 *   · `CombatDivider`      — faixa compacta que atravessa o feed
 *                            (`RODADA 03 // TURNOS RÁPIDOS`). Nunca um
 *                            card grande: mudança de turno é ritmo, não
 *                            evento a ser lido em detalhe.
 *   · `TurnResolutionCard` — UM card por resolução (fim de rodada/cena)
 *                            com tabela compacta de ator/efeito/
 *                            resultado/restante, exatamente como a
 *                            referência. É o que agrupa o que seriam
 *                            dez linhas soltas.
 *   · `EffectApplicationCard` — aplicação/remoção/expiração/dano de um
 *                            efeito. Lê `familia` para decidir O QUE
 *                            mostrar: uma CONDIÇÃO abre intensidade,
 *                            dano por rodada e como sair dela; um EFEITO
 *                            TEMPORÁRIO abre só a duração. São perguntas
 *                            diferentes, e o design de origem desenha as
 *                            duas como cards distintos.
 *   · `PendingCheckCard`   — teste pendente, âmbar, com o que falta.
 */

import { AlertTriangle, CircleDot, Flame, Heart, ShieldOff, Sparkles, TimerReset } from "lucide-react";
import { CartaoBase } from "../ui/CartaoBase";
import { Chip, Chips, FaixaResultado, Modulo, Modulos, PainelTecnico } from "../ui/primitivas";
import type { CartaoDivisor, CartaoEfeito, CartaoPendencia, CartaoResolucao } from "./contratos";
import { acentoDoCartao } from "./contratos";

export function CombatDivider({ cartao }: { cartao: CartaoDivisor }) {
  return (
    <div className="pn-divisor" data-acento={cartao.acento} role="separator" aria-label={cartao.texto} data-testid="painel-feed-divisor">
      <span className="pn-divisor-txt">{cartao.texto}</span>
    </div>
  );
}

export function TurnResolutionCard({
  cartao,
  hora,
  expandido,
  onAlternar,
  visibilidade,
}: {
  cartao: CartaoResolucao;
  hora: string;
  expandido: boolean;
  onAlternar: () => void;
  visibilidade?: React.ReactNode;
}) {
  const temLinhas = cartao.linhas.length > 0;
  return (
    <CartaoBase
      tipo="Resolução"
      nome={cartao.titulo}
      icone={<TimerReset />}
      acento="cy"
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      expandido={expandido}
      onAlternarExpandido={temLinhas ? onAlternar : undefined}
      rotuloDetalhes="Efeitos"
      testId="painel-feed-resolucao"
      atributos={{ "data-kind": "resolucao" }}
    >
      {temLinhas ? (
        <PainelTecnico>
          <table className="pn-tabela" data-testid="painel-feed-resolucao-tabela">
            <thead>
              <tr>
                <th scope="col">Ator</th>
                <th scope="col">Efeito</th>
                <th scope="col">Restante</th>
              </tr>
            </thead>
            <tbody>
              {(expandido ? cartao.linhas : cartao.linhas.slice(0, 4)).map((l, i) => (
                <tr key={i} data-encerrado={l.encerrado ? "true" : undefined}>
                  <td>{l.ator}</td>
                  <td>
                    {l.efeito}
                    {l.resultado && <span className="rv-pn-aviso"> · {l.resultado}</span>}
                  </td>
                  <td data-num="true">{l.restante || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!expandido && cartao.linhas.length > 4 && (
            <p className="rv-pn-aviso" style={{ marginTop: 4 }}>
              +{cartao.linhas.length - 4} linha(s)
            </p>
          )}
        </PainelTecnico>
      ) : (
        <p className="pn-texto">Nenhum efeito exigiu resolução.</p>
      )}
    </CartaoBase>
  );
}

function iconeDoEfeito(cartao: CartaoEfeito) {
  if (cartao.acao === "cura") return <Heart />;
  if (cartao.acao === "dano") return <Flame />;
  if (cartao.acao === "removido" || cartao.acao === "expirado") return <ShieldOff />;
  if (cartao.acao === "resistido") return <CircleDot />;
  return <Sparkles />;
}

const ROTULO_ACAO: Record<CartaoEfeito["acao"], string> = {
  aplicado: "Efeito aplicado",
  removido: "Efeito removido",
  expirado: "Efeito expirado",
  resistido: "Efeito resistido",
  dano: "Dano de efeito",
  cura: "Cura",
};

export function EffectApplicationCard({
  cartao,
  hora,
  expandido,
  onAlternar,
  visibilidade,
}: {
  cartao: CartaoEfeito;
  hora: string;
  expandido: boolean;
  onAlternar: () => void;
  visibilidade?: React.ReactNode;
}) {
  const acento = acentoDoCartao(cartao);
  const encerrado = cartao.acao === "removido" || cartao.acao === "expirado";
  const ehCondicao = cartao.familia === "condicao";
  const temDetalhes = !!cartao.descricao || !!cartao.cura;
  return (
    <CartaoBase
      tipo={ROTULO_ACAO[cartao.acao]}
      nome={cartao.nome}
      icone={iconeDoEfeito(cartao)}
      acento={acento}
      autor={cartao.alvo ?? cartao.autoria.nome}
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      expandido={expandido}
      onAlternarExpandido={temDetalhes ? onAlternar : undefined}
      rotuloDetalhes={ehCondicao ? "Condição" : "Descrição"}
      detalhes={
        temDetalhes ? (
          <PainelTecnico>
            {cartao.descricao && <p className="pn-texto">{cartao.descricao}</p>}
            {cartao.cura && <p className="pn-texto"><strong>Cura:</strong> {cartao.cura}</p>}
          </PainelTecnico>
        ) : undefined
      }
      testId="painel-feed-efeito"
      atributos={{ "data-kind": "efeito", "data-acao": cartao.acao, "data-familia": cartao.familia }}
    >
      <Chips>
        {cartao.fonte && <Chip acento="neutro">Fonte: {cartao.fonte}</Chip>}
        {/* Intensidade é da CONDIÇÃO; duração é do EFEITO TEMPORÁRIO.
            Mostrar os dois campos sempre deixava metade vazia. */}
        {ehCondicao && cartao.intensidade != null && (
          <Chip acento={encerrado ? "neutro" : "perigo"}>Intensidade {cartao.intensidade}</Chip>
        )}
        {cartao.duracao && <Chip acento={encerrado ? "neutro" : "am"}>{cartao.duracao}</Chip>}
      </Chips>
      {ehCondicao && cartao.danoPorRodada && !cartao.delta && (
        <Modulos colunas={2}>
          <Modulo rotulo="Dano / rodada" valor={cartao.danoPorRodada} acento="perigo" testId="painel-feed-efeito-porrodada" />
        </Modulos>
      )}
      {cartao.delta && (
        <FaixaResultado
          rotulo={cartao.delta.rotulo}
          valor={cartao.delta.valor}
          acento={cartao.delta.acento}
          icone={cartao.delta.acento === "ok" ? <Heart /> : <Flame />}
          testId="painel-feed-efeito-delta"
        />
      )}
    </CartaoBase>
  );
}

export function PendingCheckCard({
  cartao,
  hora,
  visibilidade,
}: {
  cartao: CartaoPendencia;
  hora: string;
  visibilidade?: React.ReactNode;
}) {
  return (
    <CartaoBase
      tipo="Pendência"
      nome={cartao.titulo}
      icone={<AlertTriangle />}
      acento={cartao.resolvida ? "ok" : "am"}
      autor={cartao.alvo ?? undefined}
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      estado={
        <Chip acento={cartao.resolvida ? "ok" : "am"} testId="painel-feed-pendencia-estado">
          {cartao.resolvida ? "Resolvida" : "Aguardando resolução"}
        </Chip>
      }
      testId="painel-feed-pendencia"
      atributos={{ "data-kind": "pendencia" }}
    >
      <p className="pn-texto">{cartao.descricao}</p>
      {cartao.resultado && <FaixaResultado rotulo={cartao.resultado} acento="ok" />}
    </CartaoBase>
  );
}
