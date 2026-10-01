"use client";

/**
 * FICHA DO BANDO (RUPTURA v1.2, capítulo 10) — seção "Ficha" da aba Bando.
 *
 * Todos os participantes leem e editam (decisão de 01/10/2026). Cada ação
 * passa pelo motor puro (`lib/rulesetV12/crew.ts`), que aplica os limites do
 * capítulo, e grava o estado inteiro com revisão otimista. Se outra janela
 * gravou antes, a ficha relê e avisa — nunca sobrescreve.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  addCoverV12,
  addExposureV12,
  adjustCashV12,
  alertStageV12,
  crewRankingV12,
  dismissSpecialistV12,
  exposureStageV12,
  improveUpgradeV12,
  installUpgradeV12,
  lowerAlertV12,
  moveHeadquartersV12,
  neutralizePistaV12,
  newCrewStateV12,
  payIntervalV12,
  qgStatsV12,
  raiseAlertV12,
  recruitSpecialistV12,
  resolveOperationCobaltoV12,
  type CrewResult,
  type CrewStateV12,
} from "../../../../../lib/rulesetV12";
import { lerFichaBandoAction, salvarFichaBandoAction, type FichaBandoPainel } from "./acoes/bandoFichaPainel";
import { EstadoCarregando, EstadoErro } from "./Estados";
import { BotaoTecnico, SecaoDossie } from "./ui/primitivas";
import { Select } from "../_dados3d/ResultadoRolagem";

type Identidade = Pick<CrewStateV12, "nome" | "simbolo" | "principio" | "contato_inicial" | "inimigo_ou_divida">;
const CAMPOS_IDENTIDADE: Array<{ id: keyof Identidade; rotulo: string }> = [
  { id: "nome", rotulo: "Nome" },
  { id: "simbolo", rotulo: "Símbolo" },
  { id: "principio", rotulo: "Princípio" },
  { id: "contato_inicial", rotulo: "Contato inicial" },
  { id: "inimigo_ou_divida", rotulo: "Inimigo ou dívida" },
];
const aretz = (n: number) => `Ⱥ ${n.toLocaleString("pt-BR")}`;

function Campo({ rotulo, valor, onMudar, onConfirmar, testId, placeholder }: {
  rotulo: string; valor: string; onMudar: (v: string) => void; onConfirmar?: () => void; testId?: string; placeholder?: string;
}) {
  return (
    <label className="rv-pn-campo">
      <span>{rotulo}</span>
      <input
        className="rv-pn-input"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => onMudar(e.target.value)}
        onBlur={onConfirmar}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onConfirmar?.(); } }}
        data-testid={testId}
      />
    </label>
  );
}

function Linha({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>{children}</div>;
}

export function BandoFicha({ campaignId, visivel }: { campaignId: string; visivel: boolean }) {
  const [dados, setDados] = useState<FichaBandoPainel | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Rascunhos locais dos formulários.
  const [identidade, setIdentidade] = useState<Identidade>({ nome: "", simbolo: "", principio: "", contato_inicial: "", inimigo_ou_divida: "" });
  const [base, setBase] = useState<"nenhum" | "parcial" | "cumprido">("cumprido");
  const [ajuste, setAjuste] = useState<"" | "repercussao" | "quebra_publica" | "traicao_confirmada">("");
  const [pistas, setPistas] = useState(["", ""]);
  const [causaAlerta, setCausaAlerta] = useState("");
  const [melhoria, setMelhoria] = useState("");
  const [novoQg, setNovoQg] = useState("");
  const [qgComprometido, setQgComprometido] = useState(false);
  const [especialista, setEspecialista] = useState("");
  const [nomeEspecialista, setNomeEspecialista] = useState("");
  const [cobertura, setCobertura] = useState("documento_avulso");
  const [descCobertura, setDescCobertura] = useState("");
  const [valorCaixa, setValorCaixa] = useState("");

  const carregar = useCallback(async () => {
    setErroLeitura(null);
    const r = await lerFichaBandoAction(campaignId);
    if (!r.ok || !r.dados) { setErroLeitura(r.erro ?? "Falha ao carregar a ficha do bando."); return; }
    setDados(r.dados);
    if (r.dados.registro) {
      const s = r.dados.registro.state;
      setIdentidade({ nome: s.nome, simbolo: s.simbolo, principio: s.principio, contato_inicial: s.contato_inicial, inimigo_ou_divida: s.inimigo_ou_divida });
    }
  }, [campaignId]);

  useEffect(() => { if (visivel) void carregar(); }, [visivel, carregar]);
  useEffect(() => {
    if (!visivel) return;
    const aoFocar = () => void carregar();
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
  }, [visivel, carregar]);

  const catalogo = dados?.catalogo;
  const registro = dados?.registro ?? null;
  const estado = registro?.state ?? null;

  async function gravar(proximo: CrewStateV12, mensagem?: string) {
    setOcupado(true);
    setAviso(null);
    const r = await salvarFichaBandoAction(campaignId, proximo, registro?.revision ?? 0);
    setOcupado(false);
    if (!r.ok || !r.dados) { setAviso(r.erro ?? "Falha ao salvar."); return false; }
    if ("conflito" in r.dados) {
      setAviso("Outra pessoa alterou o bando agora há pouco. A ficha foi recarregada; refaça a ação se ainda fizer sentido.");
      await carregar();
      return false;
    }
    setDados((d) => (d ? { ...d, registro: { state: proximo, revision: (r.dados as { revisao: number }).revisao } } : d));
    if (mensagem) setAviso(mensagem);
    return true;
  }

  async function aplicar(resultado: CrewResult<CrewStateV12>, mensagem?: string) {
    if (!resultado.ok) { setAviso(resultado.error); return false; }
    return gravar(resultado.value, mensagem);
  }

  const stats = useMemo(() => (estado && catalogo ? qgStatsV12(estado, catalogo) : null), [estado, catalogo]);
  const ranking = estado && catalogo ? crewRankingV12(estado.cobalto, catalogo) : "F";
  const rankingInfo = catalogo?.rankings.find((r) => r.ranking === ranking);
  const proximo = catalogo?.rankings.find((r) => r.cobalto > (estado?.cobalto ?? 0));

  if (erroLeitura) return <EstadoErro mensagem={erroLeitura} onTentarDeNovo={carregar} testId="painel-bando-ficha-erro" />;
  if (!dados || !catalogo) return <EstadoCarregando testId="painel-bando-ficha-carregando" />;

  // ── Fundar o bando ────────────────────────────────────────────────
  if (!estado) {
    return (
      <div className="rv-pn-scroll" data-testid="painel-bando-ficha-fundar" style={{ padding: "4px 2px" }}>
        <SecaoDossie n="01" titulo="Fundar o bando">
          <p className="rv-pn-detalhe-sub" style={{ margin: "0 0 4px" }}>
            O bando é opcional. Ele começa no Ranking F, com 0 Cobalto, Exposição e Alerta Imperial em 0, num Refúgio Improvisado.
          </p>
          {CAMPOS_IDENTIDADE.map((c) => (
            <Campo key={c.id} rotulo={c.rotulo} valor={identidade[c.id]} onMudar={(v) => setIdentidade((s) => ({ ...s, [c.id]: v }))} testId={`painel-bando-fundar-${c.id}`} />
          ))}
          <Linha>
            <BotaoTecnico
              primario
              acento="am"
              ocupado={ocupado}
              desabilitado={!identidade.nome.trim()}
              onClick={() => void gravar(newCrewStateV12({
                nome: identidade.nome.trim(), simbolo: identidade.simbolo.trim(), principio: identidade.principio.trim(),
                contato_inicial: identidade.contato_inicial.trim(), inimigo_ou_divida: identidade.inimigo_ou_divida.trim(),
              }), "Bando fundado.")}
              testId="painel-bando-fundar"
            >
              Fundar bando
            </BotaoTecnico>
          </Linha>
          {aviso && <p role="status" className="rv-pn-detalhe-sub" data-testid="painel-bando-aviso">{aviso}</p>}
        </SecaoDossie>
      </div>
    );
  }

  const tipoQg = catalogo.qgs.find((q) => q.slug === estado.qg.slug);
  const melhoriasLivres = catalogo.melhorias.filter((m) => !estado.qg.melhorias.some((x) => x.slug === m.slug));
  const exposicao = estado.exposicao_pistas.length;
  const custosCobertura = Object.fromEntries(catalogo.coberturas.map((c) => [c.slug, c.custo]));

  return (
    <div className="rv-pn-scroll" data-testid="painel-bando-ficha" style={{ padding: "4px 2px" }}>
      <div className="rv-fg-statgrid" style={{ "--rv-fg-cols": 4, marginBottom: 10 } as React.CSSProperties}>
        <div className="rv-fg-statcell" data-testid="painel-bando-ranking"><b>{ranking}</b><span>{rankingInfo?.titulo ?? "Ranking"}</span></div>
        <div className="rv-fg-statcell"><b>{estado.cobalto}</b><span>Cobalto{proximo ? ` · ${proximo.ranking} em ${proximo.cobalto}` : ""}</span></div>
        <div className="rv-fg-statcell"><b>{exposicao}/6</b><span>Exposição · {exposureStageV12(exposicao)}</span></div>
        <div className="rv-fg-statcell"><b>{estado.alerta}/5</b><span>Alerta · {alertStageV12(estado.alerta)}</span></div>
      </div>

      {aviso && <p role="status" className="rv-pn-detalhe-sub" style={{ margin: "0 0 10px" }} data-testid="painel-bando-aviso">{aviso}</p>}

      <SecaoDossie n="01" titulo="Identidade">
        {CAMPOS_IDENTIDADE.map((c) => (
          <Campo
            key={c.id}
            rotulo={c.rotulo}
            valor={identidade[c.id]}
            onMudar={(v) => setIdentidade((s) => ({ ...s, [c.id]: v }))}
            onConfirmar={() => {
              const v = identidade[c.id].trim();
              if (v === estado[c.id]) return;
              if (c.id === "nome" && !v) { setIdentidade((s) => ({ ...s, nome: estado.nome })); setAviso("O bando precisa de um nome."); return; }
              void gravar({ ...estado, [c.id]: v });
            }}
            testId={`painel-bando-${c.id}`}
          />
        ))}
      </SecaoDossie>

      <SecaoDossie n="02" titulo="Lista Cobalto">
        {rankingInfo && <p className="rv-pn-detalhe-sub" style={{ margin: 0 }}>{rankingInfo.beneficio}</p>}
        <Linha>
          <Select label="Resultado da operação" value={base} onChange={(v) => setBase(v as typeof base)} options={[
            { id: "nenhum", rotulo: "Nenhum objetivo (0)" }, { id: "parcial", rotulo: "Parcial / objetivo próprio (+1)" }, { id: "cumprido", rotulo: "Objetivo cumprido (+2)" },
          ]} testId="painel-bando-base" />
          <Select label="Ajuste (no máximo um)" value={ajuste} onChange={(v) => setAjuste(v as typeof ajuste)} options={[
            { id: "", rotulo: "Sem ajuste" }, { id: "repercussao", rotulo: "Repercussão (+1)" }, { id: "quebra_publica", rotulo: "Quebra pública (−1)" }, { id: "traicao_confirmada", rotulo: "Traição confirmada (−2)" },
          ]} testId="painel-bando-ajuste" />
          <BotaoTecnico acento="am" ocupado={ocupado} testId="painel-bando-operacao" onClick={() => {
            const r = resolveOperationCobaltoV12(estado.cobalto, base, ajuste || undefined);
            void gravar({ ...estado, cobalto: r.cobalto }, `Operação registrada: Cobalto ${r.variacao >= 0 ? "+" : ""}${r.variacao} (agora ${r.cobalto}).`);
          }}>
            Registrar operação
          </BotaoTecnico>
        </Linha>
      </SecaoDossie>

      <SecaoDossie n="03" titulo={`QG · ${tipoQg?.nome ?? estado.qg.slug}`}>
        {stats && (
          <div className="rv-fg-statgrid" style={{ "--rv-fg-cols": 3 } as React.CSSProperties}>
            <div className="rv-fg-statcell"><b>{stats.usados}/{stats.capacidade}</b><span>Capacidade</span></div>
            <div className="rv-fg-statcell"><b>{stats.seguranca}</b><span>Segurança (máx. 3)</span></div>
            <div className="rv-fg-statcell"><b>{aretz(estado.caixa)}</b><span>Caixa</span></div>
          </div>
        )}
        {estado.qg.melhorias.map((m) => {
          const def = catalogo.melhorias.find((x) => x.slug === m.slug);
          return (
            <Linha key={m.slug}>
              <span style={{ flex: 1 }}>{def?.nome ?? m.slug}{m.aprimorada ? " (aprimorada)" : ""} · {def?.transferencia === "portatil" ? "portátil" : "fixa"}</span>
              {!m.aprimorada && def && (
                <BotaoTecnico ocupado={ocupado} onClick={() => void aplicar(improveUpgradeV12(estado, m.slug, catalogo), `${def.nome} aprimorada.`)}>
                  Aprimorar ({aretz(def.aprimoramento)})
                </BotaoTecnico>
              )}
            </Linha>
          );
        })}
        {melhoriasLivres.length > 0 && (
          <Linha>
            <Select label="Nova melhoria" value={melhoria} onChange={setMelhoria} options={[
              { id: "", rotulo: "Escolher…" },
              ...melhoriasLivres.map((m) => ({ id: m.slug, rotulo: `${m.nome} · ${m.ranking_minimo} · ${aretz(m.custo)}` })),
            ]} testId="painel-bando-melhoria" />
            <BotaoTecnico ocupado={ocupado} desabilitado={!melhoria} testId="painel-bando-instalar" onClick={() => void aplicar(installUpgradeV12(estado, melhoria, catalogo), "Melhoria instalada.").then((ok) => ok && setMelhoria(""))}>
              Instalar
            </BotaoTecnico>
          </Linha>
        )}
        <Linha>
          <Select label="Trocar de QG" value={novoQg} onChange={setNovoQg} options={[
            { id: "", rotulo: "Escolher…" },
            ...catalogo.qgs.filter((q) => q.slug !== estado.qg.slug).map((q) => ({ id: q.slug, rotulo: `${q.nome} · ${q.ranking_minimo} · ${aretz(q.custo)}` })),
          ]} testId="painel-bando-novo-qg" />
          <label className="rv-pn-check"><input type="checkbox" checked={qgComprometido} onChange={(e) => setQgComprometido(e.target.checked)} /> QG atual comprometido</label>
          <BotaoTecnico ocupado={ocupado} desabilitado={!novoQg} testId="painel-bando-mudar-qg" onClick={() => void aplicar(moveHeadquartersV12(estado, novoQg, catalogo, { comprometido: qgComprometido }), "QG trocado. A Exposição voltou a 0.").then((ok) => ok && setNovoQg(""))}>
            Mudar
          </BotaoTecnico>
        </Linha>
      </SecaoDossie>

      <SecaoDossie n="04" titulo={`Exposição · ${exposureStageV12(exposicao)}`}>
        {estado.exposicao_pistas.length === 0 && <p className="rv-pn-detalhe-sub" style={{ margin: 0 }}>Nenhuma pista leva ao QG.</p>}
        {estado.exposicao_pistas.map((p, i) => (
          <Linha key={`${p.origem}-${i}`}>
            <span style={{ flex: 1 }}>{i + 1}. {p.origem}</span>
            <BotaoTecnico ocupado={ocupado} onClick={() => void aplicar(neutralizePistaV12(estado, i), "Pista neutralizada.")}>Neutralizar</BotaoTecnico>
          </Linha>
        ))}
        <Linha>
          <Campo rotulo="Pista nova" valor={pistas[0]} onMudar={(v) => setPistas([v, pistas[1]])} placeholder="o que permite localizar o QG" testId="painel-bando-pista-1" />
          <Campo rotulo="Segunda pista (independente)" valor={pistas[1]} onMudar={(v) => setPistas([pistas[0], v])} testId="painel-bando-pista-2" />
          <BotaoTecnico ocupado={ocupado} desabilitado={!pistas[0].trim() && !pistas[1].trim()} testId="painel-bando-registrar-pistas" onClick={() => {
            const novas = pistas.filter((p) => p.trim());
            void aplicar(addExposureV12(estado, novas, new Date().toISOString()), "Exposição registrada.").then((ok) => ok && setPistas(["", ""]));
          }}>
            Registrar
          </BotaoTecnico>
        </Linha>
      </SecaoDossie>

      <SecaoDossie n="05" titulo={`Alerta Imperial · ${alertStageV12(estado.alerta)}`}>
        <Linha>
          <BotaoTecnico ocupado={ocupado} desabilitado={estado.alerta >= 5} onClick={() => void aplicar(raiseAlertV12(estado, 1))}>+1</BotaoTecnico>
          <BotaoTecnico ocupado={ocupado} desabilitado={estado.alerta >= 4} onClick={() => void aplicar(raiseAlertV12(estado, 2))}>+2 (causa grave e independente)</BotaoTecnico>
        </Linha>
        <Linha>
          <Campo rotulo="Causa da redução" valor={causaAlerta} onMudar={setCausaAlerta} placeholder="ex.: investigação redirecionada" testId="painel-bando-causa-alerta" />
          <BotaoTecnico ocupado={ocupado} desabilitado={estado.alerta === 0 || !causaAlerta.trim()} testId="painel-bando-reduzir-alerta" onClick={() => void aplicar(lowerAlertV12(estado, causaAlerta), "Alerta reduzido.").then((ok) => ok && setCausaAlerta(""))}>
            −1
          </BotaoTecnico>
        </Linha>
        <Campo
          rotulo="Identidades conhecidas e investigação ativa"
          valor={estado.alerta_notas}
          onMudar={(v) => setDados((d) => (d && d.registro ? { ...d, registro: { ...d.registro, state: { ...d.registro.state, alerta_notas: v } } } : d))}
          onConfirmar={() => void gravar(estado)}
          testId="painel-bando-alerta-notas"
        />
      </SecaoDossie>

      <SecaoDossie n="06" titulo="Especialistas">
        {estado.especialistas.length === 0 && <p className="rv-pn-detalhe-sub" style={{ margin: 0 }}>Nenhum especialista contratado.</p>}
        {estado.especialistas.map((e, i) => {
          const def = catalogo.especialistas.find((x) => x.slug === e.slug);
          return (
            <Linha key={`${e.slug}-${i}`}>
              <span style={{ flex: 1 }}>{e.nome ? `${e.nome} · ` : ""}{def?.nome ?? e.slug} · salário {aretz(def?.salario ?? 0)}{e.intervalos_sem_salario > 0 ? " · sem salário (indisponível)" : ""}</span>
              <BotaoTecnico ocupado={ocupado} onClick={() => void aplicar(dismissSpecialistV12(estado, i), "Contrato encerrado.")}>Dispensar</BotaoTecnico>
            </Linha>
          );
        })}
        <Linha>
          <Select label="Recrutar" value={especialista} onChange={setEspecialista} options={[
            { id: "", rotulo: "Escolher…" },
            ...catalogo.especialistas.map((e) => ({ id: e.slug, rotulo: `${e.nome} · ${e.ranking_minimo} · ${aretz(e.recrutamento)} / ${aretz(e.salario)}` })),
          ]} testId="painel-bando-especialista" />
          <Campo rotulo="Nome (opcional)" valor={nomeEspecialista} onMudar={setNomeEspecialista} />
          <BotaoTecnico ocupado={ocupado} desabilitado={!especialista} testId="painel-bando-recrutar" onClick={() => void aplicar(recruitSpecialistV12(estado, especialista, catalogo, nomeEspecialista), "Especialista recrutado.").then((ok) => { if (ok) { setEspecialista(""); setNomeEspecialista(""); } })}>
            Recrutar
          </BotaoTecnico>
        </Linha>
        {estado.especialistas.length > 0 && (
          <Linha>
            <BotaoTecnico ocupado={ocupado} testId="painel-bando-pagar" onClick={() => {
              const r = payIntervalV12(estado, catalogo);
              const partes = [`Pagos ${aretz(r.pagos)}`];
              if (r.semSalario.length) partes.push(`sem salário: ${r.semSalario.join(", ")}`);
              if (r.encerrados.length) partes.push(`contrato encerrado: ${r.encerrados.join(", ")}`);
              void gravar(r.estado, `${partes.join("; ")}.`);
            }}>
              Pagar a retaguarda (intervalo)
            </BotaoTecnico>
          </Linha>
        )}
      </SecaoDossie>

      <SecaoDossie n="07" titulo="Coberturas">
        {estado.coberturas.map((c, i) => (
          <Linha key={`${c.slug}-${i}`}>
            <span style={{ flex: 1, opacity: c.comprometida ? 0.55 : 1 }}>
              {catalogo.coberturas.find((x) => x.slug === c.slug)?.nome ?? c.slug} · {c.descricao}{c.comprometida ? " · comprometida" : ""}
            </span>
            {!c.comprometida && (
              <BotaoTecnico ocupado={ocupado} onClick={() => void gravar({ ...estado, coberturas: estado.coberturas.map((x, j) => (j === i ? { ...x, comprometida: true } : x)) })}>
                Comprometida
              </BotaoTecnico>
            )}
          </Linha>
        ))}
        <Linha>
          <Select label="Nova cobertura" value={cobertura} onChange={setCobertura} options={catalogo.coberturas.map((c) => ({ id: c.slug, rotulo: `${c.nome} · ${aretz(c.custo)}` }))} testId="painel-bando-cobertura" />
          <Campo rotulo="Identidade ou finalidade" valor={descCobertura} onMudar={setDescCobertura} testId="painel-bando-cobertura-desc" />
          <BotaoTecnico ocupado={ocupado} desabilitado={!descCobertura.trim()} testId="painel-bando-criar-cobertura" onClick={() => void aplicar(addCoverV12(estado, cobertura, descCobertura, custosCobertura), "Cobertura criada.").then((ok) => ok && setDescCobertura(""))}>
            Criar
          </BotaoTecnico>
        </Linha>
      </SecaoDossie>

      <SecaoDossie n="08" titulo={`Caixa coletivo · ${aretz(estado.caixa)}`}>
        <Linha>
          <Campo rotulo="Valor (Ⱥ)" valor={valorCaixa} onMudar={(v) => setValorCaixa(v.replace(/[^\d]/g, ""))} testId="painel-bando-caixa-valor" />
          <BotaoTecnico ocupado={ocupado} desabilitado={!valorCaixa} testId="painel-bando-caixa-entrar" onClick={() => void aplicar(adjustCashV12(estado, Number(valorCaixa))).then((ok) => ok && setValorCaixa(""))}>Depositar</BotaoTecnico>
          <BotaoTecnico ocupado={ocupado} desabilitado={!valorCaixa} testId="painel-bando-caixa-sair" onClick={() => void aplicar(adjustCashV12(estado, -Number(valorCaixa))).then((ok) => ok && setValorCaixa(""))}>Retirar</BotaoTecnico>
          <BotaoTecnico onClick={() => void carregar()} icone={<RefreshCw size={13} />}>Atualizar</BotaoTecnico>
        </Linha>
      </SecaoDossie>
    </div>
  );
}
