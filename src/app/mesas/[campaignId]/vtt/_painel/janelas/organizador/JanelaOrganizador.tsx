"use client";

/**
 * ORGANIZADOR DA CAMPANHA (CONT-03) — sessões, anotações, handouts,
 * NPCs e lugares.
 *
 * NÃO é a janela "Conteúdo da campanha": aquela é o editor TÉCNICO de
 * regras (biblioteca, homebrew, override, diff de três vias), e as duas
 * dividiam um nome sem ter nada em comum. Ficaram separadas, com nomes
 * que dizem o que cada uma faz.
 *
 * Forma: lista com filtros e detalhe ao lado. Sem pastas e sem árvore —
 * a taxonomia de CONT-01 não tem hierarquia, e desenhar uma obrigaria a
 * inventar um pai para cada item. O que organiza são os cinco tipos e
 * as etiquetas livres.
 *
 * Nada aqui decide quem vê o quê: a leitura já chega filtrada pela RLS
 * (`narrativa_pode_ver`, 0142). Esta janela é do narrador, que vê tudo
 * — inclusive rascunho — e por isso a etiqueta de visibilidade precisa
 * ser explícita em cada linha: aqui nada some, e sem o selo não se
 * distingue o que a mesa já viu do que ainda é segredo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Eye, EyeOff, FileText, Link2, Plus, Search, Trash2, Undo2 } from "lucide-react";
import { JanelaInterna } from "../../ui/JanelaInterna";
import { DialogoConfirmar } from "../../ui/Dialogo";
import { BotaoTecnico, Caption, Chips } from "../../ui/primitivas";
import { EstadoCarregando, EstadoErro } from "../../Estados";
import {
  createNarrativeEntry, deleteNarrativeEntry, linkNarrativeEntries, listNarrativeEntries,
  setNarrativeEstado, setNarrativeVisibility, updateNarrativeEntry,
  type NarrativeEntry, type NarrativeEstado, type NarrativeTipo,
} from "../../../../../../../lib/campaign/narrativeActions";
import { ESTADOS, TIPOS, rotuloDoTipo, tituloVisivel } from "./tipos";
import { DetalheDaEntrada } from "./DetalheDaEntrada";

/**
 * Chip de FILTRO. O `Chip` das primitivas é um `<span>` de exibição, sem
 * clique nem estado — usá-lo aqui daria uma coisa que parece botão e
 * não responde a teclado.
 */
function ChipFiltro({ ativo, onClick, acento = "cy", children, testId }: {
  ativo: boolean; onClick: () => void; acento?: "cy" | "am"; children: React.ReactNode; testId?: string;
}) {
  return (
    <button type="button" className="rv-org-chip" data-ativo={ativo || undefined} data-acento={acento}
      aria-pressed={ativo} onClick={onClick} data-testid={testId}>
      {children}
    </button>
  );
}

export function JanelaOrganizador({ campaignId, onFechar }: { campaignId: string; onFechar: () => void }) {
  const [entradas, setEntradas] = useState<NarrativeEntry[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [tipo, setTipo] = useState<NarrativeTipo | null>(null);
  const [estado, setEstado] = useState<NarrativeEstado | null>(null);
  const [etiqueta, setEtiqueta] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aExcluir, setAExcluir] = useState<NarrativeEntry | null>(null);

  /**
   * Devolve o erro em vez de gravá-lo: `agir` recarrega DEPOIS de agir,
   * e se `carregar` limpasse o estado de erro por conta própria, a falha
   * da ação sumiria da tela antes de alguém ler. Foi exatamente isso que
   * escondeu o primeiro defeito desta janela.
   */
  const carregar = useCallback(async (): Promise<string | null> => {
    const r = await listNarrativeEntries(campaignId);
    setEntradas(r.entries);
    return r.error ?? null;
  }, [campaignId]);
  const recarregar = useCallback(async () => { setErro(await carregar()); }, [carregar]);
  useEffect(() => { void recarregar(); }, [recarregar]);

  /**
   * Os filtros são aplicados aqui, e não refazendo a consulta a cada
   * tecla: a lista de uma campanha cabe na memória, e ir ao servidor a
   * cada letra tornaria a busca mais lenta do que ler.
   */
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (entradas ?? []).filter((e) => {
      if (tipo && e.tipo !== tipo) return false;
      if (estado && e.estado !== estado) return false;
      if (etiqueta && !e.etiquetas.includes(etiqueta)) return false;
      if (termo && !`${e.titulo ?? ""} ${e.corpo ?? ""}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [entradas, tipo, estado, etiqueta, busca]);

  const etiquetasUsadas = useMemo(
    () => Array.from(new Set((entradas ?? []).flatMap((e) => e.etiquetas))).sort(),
    [entradas],
  );
  const atual = (entradas ?? []).find((e) => e.id === selecionada) ?? null;

  /**
   * A operação devolve a mensagem de falha, ou null. O erro é gravado
   * DEPOIS do recarregamento, senão a lista nova apagaria o aviso.
   */
  async function agir(operacao: () => Promise<string | null>) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const falha = await operacao();
      const falhaAoLer = await carregar();
      setErro(falha ?? falhaAoLer);
    } finally { setOcupado(false); }
  }

  async function criar(t: NarrativeTipo) {
    await agir(async () => {
      const r = await createNarrativeEntry(campaignId, {
        tipo: t,
        // Handout nasce sem título de propósito — é o único tipo que
        // pode ficar assim, e forçar um placeholder aqui obrigaria a
        // apagar texto que ninguém escreveu.
        titulo: t === "handout" ? null : `${rotuloDoTipo(t)} sem título`,
      });
      if (!r.ok) return r.error;
      setSelecionada(r.data.id);
      setEstado(null);
      return null;
    });
  }

  return (
    <JanelaInterna
      aberta titulo="Organizador da campanha"
      subtitulo="Sessões, anotações, handouts, NPCs e lugares"
      largura={980} altura={620} onFechar={onFechar} testId="painel-janela-organizador"
    >
      {erro && <EstadoErro mensagem={erro} onTentarDeNovo={recarregar} testId="organizador-erro" />}
      {entradas === null ? <EstadoCarregando /> : (
        <div className="rv-org">
          <div className="rv-org-lista">
            <div className="rv-org-criar">
              <Caption>Criar</Caption>
              <Chips>
                {TIPOS.map((t) => (
                  <BotaoTecnico key={t.id} onClick={() => void criar(t.id)} desabilitado={ocupado}
                    icone={<Plus size={12} />} testId={`organizador-criar-${t.id}`}>{t.rotulo}</BotaoTecnico>
                ))}
              </Chips>
            </div>

            <div className="rv-org-filtros">
              <label className="rv-org-busca">
                <Search size={13} aria-hidden="true" />
                <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por título ou texto" aria-label="Buscar no organizador"
                  data-testid="organizador-busca" />
              </label>
              <Chips>
                <ChipFiltro ativo={tipo === null} onClick={() => setTipo(null)} testId="organizador-filtro-todos">Todos</ChipFiltro>
                {TIPOS.map((t) => (
                  <ChipFiltro key={t.id} ativo={tipo === t.id} onClick={() => setTipo(tipo === t.id ? null : t.id)}
                    testId={`organizador-filtro-${t.id}`}>{t.plural}</ChipFiltro>
                ))}
              </Chips>
              <Chips>
                {ESTADOS.map((e) => (
                  <ChipFiltro key={e.id} ativo={estado === e.id} acento={e.id === "rascunho" ? "am" : "cy"}
                    onClick={() => setEstado(estado === e.id ? null : e.id)}
                    testId={`organizador-estado-${e.id}`}>{e.rotulo}</ChipFiltro>
                ))}
              </Chips>
              {etiquetasUsadas.length > 0 && (
                <Chips>
                  {etiquetasUsadas.map((t) => (
                    <ChipFiltro key={t} ativo={etiqueta === t} onClick={() => setEtiqueta(etiqueta === t ? null : t)}>#{t}</ChipFiltro>
                  ))}
                </Chips>
              )}
            </div>

            <ul className="rv-org-itens" data-testid="organizador-itens">
              {visiveis.length === 0 && (
                <li className="rv-org-vazio">
                  {(entradas.length === 0)
                    ? "Nada por aqui ainda. Crie a primeira entrada acima."
                    : "Nenhuma entrada corresponde a estes filtros."}
                </li>
              )}
              {visiveis.map((e) => (
                <li key={e.id}>
                  <button type="button"
                    className={`rv-org-item${selecionada === e.id ? " rv-org-item--sel" : ""}`}
                    onClick={() => setSelecionada(e.id)} data-testid="organizador-item"
                    aria-current={selecionada === e.id}>
                    <span className="rv-org-item-tipo">{rotuloDoTipo(e.tipo)}</span>
                    <span className="rv-org-item-titulo">{tituloVisivel(e)}</span>
                    {/* O selo de estado é obrigatório aqui: o narrador vê
                        rascunho e publicado na mesma lista, e sem ele não
                        dá para saber o que a mesa já leu. */}
                    <span className="rv-org-selo" data-estado={e.estado}>
                      {e.estado === "rascunho" ? <EyeOff size={11} aria-hidden="true" />
                        : e.estado === "arquivado" ? <Archive size={11} aria-hidden="true" />
                        : <Eye size={11} aria-hidden="true" />}
                      {ESTADOS.find((x) => x.id === e.estado)?.rotulo}
                    </span>
                    {e.etiquetas.length > 0 && (
                      <span className="rv-org-item-etiquetas">{e.etiquetas.map((t) => `#${t}`).join(" ")}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rv-org-detalhe">
            {atual ? (
              <DetalheDaEntrada
                key={atual.id}
                campaignId={campaignId} entrada={atual} todas={entradas} ocupado={ocupado}
                onSalvar={(campos) => agir(async () => {
                  const r = await updateNarrativeEntry(campaignId, atual.id, campos);
                  return r.ok ? null : r.error;
                })}
                onEstado={(novo) => agir(async () => {
                  const r = await setNarrativeEstado(campaignId, atual.id, novo);
                  return r.ok ? null : r.error;
                })}
                onVisibilidade={(ids) => agir(async () => {
                  const r = await setNarrativeVisibility(campaignId, atual.id, ids);
                  return r.ok ? null : r.error;
                })}
                onRelacionar={(outro, ligar) => agir(async () => {
                  const r = await linkNarrativeEntries(campaignId, atual.id, outro, ligar);
                  return r.ok ? null : r.error;
                })}
                onExcluir={() => setAExcluir(atual)}
              />
            ) : (
              <p className="rv-org-nenhuma">
                <FileText size={15} aria-hidden="true" />
                Escolha uma entrada à esquerda, ou crie uma nova.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Excluir é diferente de arquivar, e o texto diz a diferença —
          senão "arquivar" vira o botão que ninguém usa por medo. */}
      <DialogoConfirmar
        aberto={aExcluir !== null}
        titulo="Excluir esta entrada?"
        mensagem={<>
          <strong>{aExcluir ? tituloVisivel(aExcluir) : ""}</strong> e suas relações somem para sempre.
          Isto não é arquivar: arquivada, a entrada sai das listas e pode voltar.
        </>}
        rotuloConfirmar="Excluir"
        onCancelar={() => setAExcluir(null)}
        onConfirmar={() => {
          const alvo = aExcluir;
          setAExcluir(null);
          if (!alvo) return;
          void agir(async () => {
            const r = await deleteNarrativeEntry(campaignId, alvo.id);
            if (r.ok) setSelecionada(null);
            return r.ok ? null : r.error;
          });
        }}
        testId="organizador-confirmar-exclusao"
      />
    </JanelaInterna>
  );
}
