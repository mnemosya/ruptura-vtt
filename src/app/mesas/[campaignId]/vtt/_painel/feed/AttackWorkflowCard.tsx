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

import { useEffect, useState } from "react";
import { Crosshair, Loader2, ShieldHalf, Swords } from "lucide-react";
import { CartaoBase } from "../ui/CartaoBase";
import { BarraAlvo, BotaoTecnico, Chip, Chips, FaixaResultado, Modulo, Modulos } from "../ui/primitivas";
import { RollButton } from "../../_dados3d/ResultadoRolagem";
import type { AcentoCartao, CartaoAtaque, EstadoAtaque } from "./contratos";
import { cabecalhoDe } from "./CabecalhoPersonagem";

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

/** Faixa de margem (`resolveMarginBand`) → rótulo da barra do alvo. */
const ROTULO_FAIXA: Record<string, string> = { miss: "Errou", limited: "Acerto limitado · −1 dano", standard: "Acerto", critical: "Crítico · +1 dado" };
const ROTULO_REGIAO: Record<string, string> = { cabeca: "Cabeça", tronco: "Tronco", bracos: "Braços", pernas: "Pernas" };
/** Defesas da regra "Ações defensivas" — id, perícia e atributo iguais aos de `ataquePainel.ts`. */
export const DEFESAS_CARTAO = [
  { id: "esquivar", nome: "Esquivar", pericia: "Reflexos", atributo: "corpo" },
  { id: "aparar", nome: "Aparar", pericia: "Luta", atributo: "corpo" },
  { id: "bloquear", nome: "Bloquear", pericia: "Reflexos", atributo: "corpo" },
  { id: "resistir_vigor", nome: "Resistir", pericia: "Vigor", atributo: "corpo" },
  { id: "resistir_mobilidade", nome: "Resistir", pericia: "Mobilidade", atributo: "corpo" },
] as const;
export type IdDefesa = (typeof DEFESAS_CARTAO)[number]["id"];
export type EscolhaDefesa = { defesa: IdDefesa } | { total: number };

/** O que a faixa de margem faz — dito ao atacante na hora de escolher. */
const EFEITO_FAIXA: Record<string, string> = {
  limited: "Margem curta: só o tronco, com −1 no dano.",
  standard: "Acerto: tronco, braços ou pernas.",
  critical: "Crítico: qualquer região, com +1 dado de dano.",
};

/** Prévia do "Aplicar dano" (mesma conta do servidor). */
export interface PreviaDanoCartao {
  dano: number;
  /** Soma dos dados e o ajuste da margem (−1 na margem curta, +1 dado no crítico). */
  danoRolado: number | null;
  ajusteMargem: number | null;
  regiao: string | null;
  bloqueou: boolean;
  armadura: string | null;
  protecao: { tipo: "mit" | "pd"; antes: number; depois: number; max: number } | null;
  mitigado: number;
  danoFinal: number;
  pvAntes: number;
  pvDepois: number;
}


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
  onPreverDano,
  podeDefender = false,
  podeInformarDefesa = false,
  podeEscolherRegiao = false,
  onDefender,
  onEscolherRegiao,
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
  /** Ataque contestado: quem controla o alvo (ou o narrador) rola a defesa aqui. */
  podeDefender?: boolean;
  /** Só o narrador: informar o total da defesa em vez de rolar. */
  podeInformarDefesa?: boolean;
  /** Quem atacou (ou o narrador): escolher a região que a margem libera e rolar o dano. */
  podeEscolherRegiao?: boolean;
  /** `forca` = a carga do botão (0–1), a mesma do rolador de dados. */
  onDefender?: (escolha: EscolhaDefesa, forca?: number) => void;
  onEscolherRegiao?: (regiao: string, forca: number) => void;
  /** Narrador: o que "Aplicar dano" vai fazer, antes de aplicar. */
  onPreverDano?: () => Promise<PreviaDanoCartao | null>;
}) {
  const [totalDefesa, setTotalDefesa] = useState("");
  const [regiao, setRegiao] = useState<string | null>(null);
  const [defesa, setDefesa] = useState<IdDefesa | null>(null);
  const [previa, setPrevia] = useState<PreviaDanoCartao | null>(null);
  const aguardandoAplicacao = cartao.estado === "aguardando_aplicacao" && podeAplicar && cartao.dano != null;
  useEffect(() => {
    if (!aguardandoAplicacao || !onPreverDano) { setPrevia(null); return; }
    let vivo = true;
    onPreverDano().then((r) => { if (vivo) setPrevia(r); }).catch(() => {});
    return () => { vivo = false; };
    // A prévia é refeita quando o cartão muda de passo (id novo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aguardandoAplicacao, cartao.id]);
  const critico = cartao.faixaMargem === "critical";
  const formulaDano = cartao.danoFormula ? `${cartao.danoFormula}${critico ? ` +1d${/d(\d+)/.exec(cartao.danoFormula)?.[1] ?? ""}` : ""}` : null;
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
      cabecalho={cabecalhoDe(cartao.autoria, hora, cartao.criadoEm)}
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
              valor={cartao.pvAntes != null && cartao.pvDepois != null
                ? `${cartao.pvAntes} → ${cartao.pvDepois}`
                : cartao.dano != null ? `${cartao.dano} de dano` : undefined}
              acento="ok"
              icone={<Swords />}
              testId="painel-feed-ataque-resolvido"
            />
          ) : errou ? null : cartao.estado === "aguardando_defesa" && (podeDefender || podeInformarDefesa) ? (
            <div className="pn-ataque-passo" data-testid="painel-feed-defesa">
              {podeDefender && (
                <>
                  <span className="pn-ataque-passo-rot">{cartao.alvo ? `${cartao.alvo} se defende` : "Defesa"}</span>
                  {/* Quatro defesas em 2 colunas; "Resistir" é um botão só e,
                      escolhido, abre a perícia (Vigor ou Mobilidade). */}
                  <div className="pn-ataque-grade" role="radiogroup" aria-label="Defesa">
                    {DEFESAS_CARTAO.filter((d) => d.id !== "resistir_mobilidade").map((d) => {
                      const resistir = d.id === "resistir_vigor";
                      const ativo = resistir ? !!defesa?.startsWith("resistir") : defesa === d.id;
                      return (
                        <button key={d.id} type="button" role="radio" aria-checked={ativo} className="pn-ataque-regiao pn-ataque-regiao--defesa"
                          data-ativo={ativo || undefined} title={resistir ? "Vigor ou Mobilidade" : d.pericia}
                          onClick={() => setDefesa(resistir ? (defesa?.startsWith("resistir") ? defesa : "resistir_vigor") : d.id)}
                          data-testid={`painel-feed-defesa-${resistir ? "resistir" : d.id}`}>
                          {d.nome}
                        </button>
                      );
                    })}
                  </div>
                  {defesa?.startsWith("resistir") && (
                    <div className="pn-ataque-grade" role="radiogroup" aria-label="Perícia de Resistir">
                      {DEFESAS_CARTAO.filter((d) => d.id.startsWith("resistir")).map((d) => (
                        <button key={d.id} type="button" role="radio" aria-checked={defesa === d.id} className="pn-ataque-regiao pn-ataque-regiao--defesa pn-ataque-regiao--sub"
                          data-ativo={defesa === d.id || undefined} onClick={() => setDefesa(d.id)} data-testid={`painel-feed-defesa-${d.id}`}>
                          {d.pericia}
                        </button>
                      ))}
                    </div>
                  )}
                  <RollButton label={aplicando ? "Rolando…" : defesa ? "Segure para rolar a defesa" : "Escolha a defesa"}
                    disabled={!defesa || aplicando} onRoll={(forca) => defesa && onDefender?.({ defesa }, forca)} />
                </>
              )}
              {podeInformarDefesa && (
                <form className="pn-ataque-passo-total" onSubmit={(e) => { e.preventDefault(); const t = Number(totalDefesa); if (totalDefesa !== "" && Number.isFinite(t)) onDefender?.({ total: Math.trunc(t) }); }}>
                  <label>
                    <span className="pn-ataque-passo-rot">{podeDefender ? "ou informe o total" : "Total da defesa"}</span>
                    <input type="number" inputMode="numeric" value={totalDefesa} onChange={(e) => setTotalDefesa(e.target.value)} aria-label="Total da defesa" />
                  </label>
                  <BotaoTecnico acento="am" ocupado={aplicando} desabilitado={totalDefesa === ""} tipo="submit">Usar total</BotaoTecnico>
                </form>
              )}
            </div>
          ) : cartao.contestado && cartao.estado === "aguardando_dano" && podeEscolherRegiao ? (
            /* O atacante: a margem diz ONDE pode acertar; ele escolhe e rola o dano. */
            <div className="pn-ataque-passo" data-testid="painel-feed-regiao">
              <span className="pn-ataque-passo-rot">{EFEITO_FAIXA[cartao.faixaMargem ?? ""] ?? "Escolha onde o golpe acerta."}</span>
              <div className="pn-ataque-grade" role="radiogroup" aria-label="Região atingida">
                {cartao.regioesPermitidas.map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={regiao === r} className="pn-ataque-regiao" data-ativo={regiao === r || undefined}
                    onClick={() => setRegiao(r)} data-testid={`painel-feed-regiao-${r}`}>
                    {ROTULO_REGIAO[r] ?? r}
                  </button>
                ))}
              </div>
              <RollButton label={aplicando ? "Rolando…" : regiao ? `Rolar dano${formulaDano ? ` · ${formulaDano}` : ""}` : "Escolha a região"}
                disabled={!regiao || aplicando} onRoll={(forca) => regiao && onEscolherRegiao?.(regiao, forca)} />
            </div>
          ) : aguardandoAplicacao ? (
            /* Narrador: a conta inteira antes de confirmar. */
            <div className="pn-ataque-passo" data-testid="painel-feed-previa-dano">
              {previa ? (
                <dl className="pn-ataque-previa">
                  <div><dt>Dano</dt><dd>{previa.danoRolado != null && previa.ajusteMargem
                    ? `${previa.danoRolado} ${previa.ajusteMargem > 0 ? "+" : "−"} ${Math.abs(previa.ajusteMargem)} (${previa.ajusteMargem > 0 ? "crítico" : "margem curta"}) = ${previa.dano}`
                    : previa.dano}</dd></div>
                  <div><dt>{previa.bloqueou ? "Bloqueio" : `Região · ${ROTULO_REGIAO[previa.regiao ?? ""] ?? "—"}`}</dt>
                    <dd>{previa.armadura
                      ? `${previa.armadura}${previa.protecao ? ` · ${previa.protecao.tipo.toUpperCase()} ${previa.protecao.antes}→${previa.protecao.depois}` : ""}`
                      : previa.bloqueou ? "sem escudo" : "sem armadura"}</dd></div>
                  {previa.mitigado > 0 && <div><dt>Absorvido</dt><dd>−{previa.mitigado}</dd></div>}
                  <div className="pn-ataque-previa-total"><dt>No PV</dt><dd>{previa.danoFinal} · PV {previa.pvAntes} → {previa.pvDepois}</dd></div>
                </dl>
              ) : <span className="pn-ataque-passo-rot">Calculando o dano…</span>}
              <BotaoTecnico
                primario
                acento="perigo"
                onClick={onAplicarDano}
                ocupado={aplicando}
                icone={aplicando ? <Loader2 className="rv-spin" /> : <Swords />}
                testId="painel-feed-aplicar-dano"
              >
                {aplicando ? "Aplicando…" : previa ? `Aplicar ${previa.danoFinal} de dano` : "Aplicar dano"}
              </BotaoTecnico>
            </div>
          ) : podeAplicar && cartao.dano != null ? (
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
            <BotaoTecnico primario acento="am" desabilitado titulo={cartao.contestado ? "Aguardando a outra parte." : "Esta etapa é resolvida pelo Console/HUD do personagem."}>
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
      <Modulos colunas={2}>
        <Modulo
          rotulo="Ataque"
          valor={cartao.totalAtaque ?? "—"}
          icone={<Crosshair />}
          acento={cartao.magica ? "mana" : "cy"}
          destaque
          testId="painel-feed-ataque-total"
        />
        <Modulo rotulo={cartao.defesaNome ?? "Defesa"} valor={cartao.totalDefesa ?? "—"} icone={<ShieldHalf />} acento="neutro" destaque />
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
                ? `${ROTULO_FAIXA[cartao.faixaMargem] ?? cartao.faixaMargem}${cartao.margem != null ? ` · margem ${cartao.margem}` : ""}${cartao.regiao ? ` · ${ROTULO_REGIAO[cartao.regiao] ?? cartao.regiao}` : ""}`
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
