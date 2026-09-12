"use client";

/**
 * ATAQUE — card de WORKFLOW: o mesmo card evolui de estado em estado,
 * nunca uma linha nova por etapa.
 *
 * Anatomia da referência anexada:
 *   · cabeçalho com a arma, o atacante e as tags;
 *   · linha de CUSTOS (PA, munição, Mana) — é por isso que
 *     `action_used`/`ammunition` não têm card próprio;
 *   · a linha principal "ATAQUE × DEFESA", com os dois totais lado a
 *     lado e o módulo de DANO destacado;
 *   · a grade de módulos de dados usados nos dois lados;
 *   · a barra de ALVO com a faixa de margem;
 *   · o botão primário de largura útil — a ação evidente do momento.
 *
 * A ação primária muda com o estado (`ROLAR ATAQUE` → `ROLAR DEFESA` →
 * `ROLAR DANO` → `APLICAR DANO` → `DANO APLICADO`). Só APLICAR DANO
 * está ligada a uma operação de escrita hoje; as etapas de rolagem
 * continuam saindo dos motores existentes (Console/HUD), e o card
 * mostra o estado real em vez de oferecer um botão que não faria nada.
 *
 * A aplicação de dano é server-side, autorizada, persistente e
 * IDEMPOTENTE (ver `acoes/combatePainel.ts` e a migration 0091): dois
 * cliques rápidos aplicam uma vez só.
 */

import { Crosshair, Loader2, ShieldHalf, Swords } from "lucide-react";
import { CartaoBase } from "../ui/CartaoBase";
import { BarraAlvo, BotaoTecnico, Chip, Chips, FaixaResultado, Modulo, Modulos } from "../ui/primitivas";
import type { AcentoCartao, CartaoAtaque, EstadoAtaque } from "./contratos";

const ROTULO_ESTADO: Record<EstadoAtaque, string> = {
  declarado: "Declarado",
  aguardando_alvo: "Aguardando alvo",
  aguardando_ataque: "Aguardando ataque",
  aguardando_defesa: "Aguardando defesa",
  aguardando_dano: "Aguardando dano",
  aguardando_aplicacao: "Aguardando aplicação",
  resolvido: "Resolvido",
  errou: "Errou",
  cancelado: "Cancelado",
};

const ACENTO_ESTADO: Record<EstadoAtaque, AcentoCartao> = {
  declarado: "cy",
  aguardando_alvo: "am",
  aguardando_ataque: "am",
  aguardando_defesa: "am",
  aguardando_dano: "am",
  aguardando_aplicacao: "am",
  resolvido: "ok",
  errou: "neutro",
  cancelado: "neutro",
};

export function AttackWorkflowCard({
  cartao,
  hora,
  expandido,
  onAlternar,
  visibilidade,
  podeAplicar,
  aplicando,
  erro,
  onAplicarDano,
  onFocarAlvo,
}: {
  cartao: CartaoAtaque;
  hora: string;
  expandido: boolean;
  onAlternar: () => void;
  visibilidade?: React.ReactNode;
  /** Autorização REAL vem do servidor; isto só decide se o botão aparece. */
  podeAplicar: boolean;
  aplicando: boolean;
  erro: string | null;
  onAplicarDano: () => void;
  /** Centraliza a câmera no token alvo — a única ação do painel autorizada a mexer na cena, e explicitamente rotulada. */
  onFocarAlvo?: (tokenId: string) => void;
}) {
  const acento: AcentoCartao = cartao.magica ? "mana" : cartao.acertou === false ? "neutro" : "perigo";
  const resolvido = cartao.estado === "resolvido";
  const errou = cartao.acertou === false;

  const temDetalhe = cartao.modulosAtaque.length > 0 || cartao.modulosDefesa.length > 0 || cartao.mitigacao != null;

  return (
    <CartaoBase
      tipo={cartao.magica ? "Ataque mágico" : "Ataque"}
      nome={cartao.nome}
      icone={<Swords />}
      acento={acento}
      autor={cartao.atacante}
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      estado={
        <>
          <Chip acento={ACENTO_ESTADO[cartao.estado]} testId="painel-feed-ataque-estado">
            {ROTULO_ESTADO[cartao.estado]}
          </Chip>
          {cartao.custos.map((c, i) => (
            <Chip key={i} acento={c.acento ?? "neutro"}>
              {c.rotulo} {c.valor}
            </Chip>
          ))}
        </>
      }
      expandido={expandido}
      onAlternarExpandido={temDetalhe ? onAlternar : undefined}
      rotuloDetalhes="Dados"
      detalhes={
        temDetalhe ? (
          <>
            {cartao.modulosAtaque.length > 0 && (
              <Modulos colunas={cartao.modulosAtaque.length >= 3 ? 3 : 2}>
                {cartao.modulosAtaque.map((m, i) => (
                  <Modulo key={`a${i}`} rotulo={m.rotulo} valor={m.valor} acento="cy" />
                ))}
              </Modulos>
            )}
            {cartao.modulosDefesa.length > 0 && (
              <Modulos colunas={cartao.modulosDefesa.length >= 3 ? 3 : 2}>
                {cartao.modulosDefesa.map((m, i) => (
                  <Modulo key={`d${i}`} rotulo={m.rotulo} valor={m.valor} acento="neutro" icone={i === 0 ? <ShieldHalf /> : undefined} />
                ))}
              </Modulos>
            )}
            {(cartao.mitigacao != null || cartao.regiao) && (
              <dl className="pn-dl">
                {cartao.regiao && (
                  <div className="pn-dl-linha">
                    <dt>Região</dt>
                    <dd>{cartao.regiao}</dd>
                  </div>
                )}
                {cartao.mitigacao != null && (
                  <div className="pn-dl-linha">
                    <dt>Mitigação</dt>
                    <dd>{cartao.mitigacao}</dd>
                  </div>
                )}
              </dl>
            )}
          </>
        ) : undefined
      }
      acoes={
        <>
          {erro && (
            <p className="rv-pn-estado rv-pn-estado--erro" role="alert" style={{ margin: 0 }} data-testid="painel-feed-ataque-erro">
              <span className="rv-pn-estado-texto">{erro}</span>
            </p>
          )}
          {resolvido ? (
            <FaixaResultado
              rotulo="Dano aplicado"
              valor={cartao.pvAntes != null && cartao.pvDepois != null ? `${cartao.pvAntes} → ${cartao.pvDepois}` : undefined}
              acento="ok"
              icone={<Swords />}
              testId="painel-feed-ataque-resolvido"
            />
          ) : errou ? null : podeAplicar && cartao.dano != null ? (
            <BotaoTecnico
              primario
              acento="perigo"
              onClick={onAplicarDano}
              ocupado={aplicando}
              icone={aplicando ? <Loader2 className="rv-spin" /> : <Swords />}
              testId="painel-feed-aplicar-dano"
            >
              {aplicando ? "Aplicando…" : "Aplicar dano"}
            </BotaoTecnico>
          ) : (
            <BotaoTecnico primario acento="am" desabilitado titulo="Esta etapa é resolvida pelo Console/HUD do personagem.">
              {ROTULO_ESTADO[cartao.estado]}
            </BotaoTecnico>
          )}
        </>
      }
      testId="painel-feed-ataque"
      atributos={{ "data-kind": "ataque", "data-workflow": cartao.workflowId, "data-estado": cartao.estado }}
    >
      {cartao.tags.length > 0 && (
        <Chips>
          {cartao.tags.slice(0, 6).map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </Chips>
      )}

      {/* Linha principal: ATAQUE × DEFESA + DANO. */}
      <Modulos colunas={cartao.dano != null ? 3 : 2}>
        <Modulo
          rotulo="Ataque"
          valor={cartao.totalAtaque ?? "—"}
          icone={<Crosshair />}
          acento={cartao.magica ? "mana" : "cy"}
          destaque
          testId="painel-feed-ataque-total"
        />
        <Modulo rotulo="Defesa" valor={cartao.totalDefesa ?? "—"} icone={<ShieldHalf />} acento="neutro" destaque />
        {cartao.dano != null && (
          <Modulo
            rotulo={cartao.danoTipo ? `Dano ${cartao.danoTipo}` : "Dano"}
            valor={cartao.dano}
            icone={<Swords />}
            acento="perigo"
            destaque
            testId="painel-feed-ataque-dano"
          />
        )}
      </Modulos>

      {cartao.alvo && (
        <BarraAlvo
          nome={cartao.alvo}
          acento={errou ? "neutro" : "ok"}
          resultado={
            cartao.acertou === false
              ? "Errou"
              : cartao.faixaMargem
                ? cartao.faixaMargem
                : cartao.margem != null
                  ? `Acerto vs ${cartao.margem}`
                  : "Acerto"
          }
          acoes={
            cartao.alvoTokenId && onFocarAlvo ? (
              <BotaoTecnico
                acento="cy"
                onClick={() => onFocarAlvo(cartao.alvoTokenId!)}
                titulo="Centralizar a câmera no alvo"
                ariaLabel="Centralizar a câmera no alvo"
                icone={<Crosshair />}
                testId="painel-feed-focar-alvo"
              />
            ) : undefined
          }
          testId="painel-feed-ataque-alvo"
        />
      )}
    </CartaoBase>
  );
}
