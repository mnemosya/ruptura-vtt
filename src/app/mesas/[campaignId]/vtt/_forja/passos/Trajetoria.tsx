"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import type { CatalogosCriacaoV12, OpcaoTrajetoriaV12 } from "../../_acoes/criacaoV12Actions";
import { ANTECEDENTE_PERSONALIZADO_ID, isCustomTraitIdV12, somaPontosV12, type DraftEscolhaV12, type DraftForjaV12, type DraftV12 } from "../../../../../../lib/rulesetV12";
import { Mono, Panel, Rich } from "../ui";
import { CATEGORIAS_TRACO, type SetDraft } from "../tipos";

const pad = (i: number) => String(i + 1).padStart(2, "0");

/**
 * Regra da v1.2: Qualidades somam EXATAMENTE 3 pontos; Complicações, AO
 * MENOS 2 (mais, só por acordo do grupo, então não há teto aqui).
 */
const QUALIDADES = 3;
const COMPLICACOES_MINIMO = 2;
type Tipo = "qualidades" | "complicacoes";

function Cabecalho({ kicker, title, right }: { kicker: string; title: string; right?: ReactNode }) {
  return (
    <div className="fj-cabecalho">
      <div><Mono tom="cy">{kicker}</Mono><h2 className="fj-cabecalho__titulo">{title}</h2></div>
      {right}
    </div>
  );
}
export { Cabecalho };

/* ---------------- Antecedente: índice vertical + registro selecionado ---------------- */

/** A descrição publicada repete a frase de Familiaridade no fim; ela já tem caixa própria. */
const semFamiliaridade = (descricao: string, familiaridade: string) => (familiaridade ? descricao.replace(familiaridade, "").trim() : descricao);

export function Antecedente({ d, set, catalogos }: { d: DraftV12; set: SetDraft; catalogos: CatalogosCriacaoV12 }) {
  const lista = catalogos.antecedentes;
  // Ver e vincular são coisas diferentes: clicar na lista só abre o
  // registro; o botão "Vincular antecedente" é que grava a escolha.
  // Nada vem vinculado; sem escolha, abre no primeiro registro (Acadêmico) só para leitura.
  const [vendo, setVendo] = useState<string>(d.antecedenteId || lista[0]?.slug || ANTECEDENTE_PERSONALIZADO_ID);
  const idx = lista.findIndex((x) => x.slug === vendo);
  const cur = idx >= 0 ? lista[idx] : undefined;
  const custom = vendo === ANTECEDENTE_PERSONALIZADO_ID;
  const linked = !!cur && d.antecedenteId === cur.slug;
  const customLinked = d.antecedenteId === ANTECEDENTE_PERSONALIZADO_ID;
  const customData = d.antecedentePersonalizado ?? { titulo: "", descricao: "", familiaridade: "" };
  const updateCustom = (field: keyof typeof customData, value: string) => set({ antecedentePersonalizado: { ...customData, [field]: value } });
  const customReady = Object.values(customData).every((value) => value.trim());
  return (
    <div className="fj-passo">
      <Cabecalho kicker="Trajetória · 02" title="Antecedente" right={<Mono>{lista.length + 1} registros</Mono>} />
      <div className="fj-mestre-detalhe">
        <div className="fj-borda fj-ch fj-mestre-detalhe__lista">
          <div className="fj-ch fj-vidro fj-sem-barra fj-indice-lista">
            {lista.map((bg, i) => {
              const on = bg.slug === d.antecedenteId;
              return (
                <button type="button" key={bg.slug} onClick={() => setVendo(bg.slug)} aria-current={bg.slug === cur?.slug ? "true" : undefined} className={`fj-indice-lista__item ${on ? "fj-indice-lista__item--on" : ""} ${bg.slug === cur?.slug ? "fj-indice-lista__item--vendo" : ""}`}>
                  <span className="fj-indice-lista__n">{pad(i)}</span>
                  <span className="fj-indice-lista__nome">{bg.nome}</span>
                  {on && <span className="fj-losango fj-losango--sm fj-losango--ambar fj-indice-lista__marca" />}
                </button>
              );
            })}
            <button type="button" onClick={() => setVendo(ANTECEDENTE_PERSONALIZADO_ID)} aria-current={custom ? "true" : undefined} className={`fj-indice-lista__item fj-indice-lista__item--custom ${customLinked ? "fj-indice-lista__item--on" : ""} ${custom ? "fj-indice-lista__item--vendo" : ""}`}>
              <span className="fj-indice-lista__n">{pad(lista.length)}</span>
              <span className="fj-indice-lista__nome">Personalizado</span>
              <span className="fj-indice-lista__mais" aria-hidden="true">＋</span>
            </button>
          </div>
        </div>
        {custom ? (
          <div className={`${customLinked ? "fj-borda-ambar" : "fj-borda"} fj-ch fj-mestre-detalhe__registro`}>
            <div className="fj-ch fj-vidro fj-sem-barra fj-registro fj-registro--custom">
              <div className="fj-registro__linha"><Mono tom="am">ANT-{pad(lista.length)} · AUTORAL</Mono><span className="fj-registro__fio" /><Mono tom={customLinked ? "am" : undefined}>{customLinked ? "✓ Vinculado" : "Seu registro"}</Mono></div>
              <h3 className="fj-registro__titulo">Crie seu antecedente</h3>
              <p className="fj-registro__custom-intro">Conte de onde seu personagem veio e qual familiaridade essa experiência lhe deu.</p>
              <div className="fj-registro__custom-campos">
                <label className="fj-registro__custom-campo"><Mono tom="cy">Título</Mono><input value={customData.titulo} onChange={(e) => updateCustom("titulo", e.target.value)} maxLength={120} placeholder="Ex.: Cartógrafo clandestino" /></label>
                <label className="fj-registro__custom-campo"><Mono tom="cy">Descrição</Mono><textarea value={customData.descricao} onChange={(e) => updateCustom("descricao", e.target.value)} maxLength={2000} rows={5} placeholder="Que vida esse personagem levava? Que marcas ela deixou?" /></label>
                <label className="fj-registro__custom-campo"><Mono tom="cy">Familiaridade</Mono><textarea value={customData.familiaridade} onChange={(e) => updateCustom("familiaridade", e.target.value)} maxLength={2000} rows={3} placeholder="O que ele conhece ou sabe fazer por causa desse passado?" /></label>
              </div>
              <div className="fj-registro__acoes">
                {customLinked
                  ? <button type="button" onClick={() => set({ antecedenteId: "" })} className="fj-ch fj-botao-fantasma">Desvincular</button>
                  : <button type="button" disabled={!customReady} onClick={() => set({ antecedenteId: ANTECEDENTE_PERSONALIZADO_ID })} className="fj-ch fj-botao-vincular" data-testid="forja-vincular-antecedente-personalizado">Vincular antecedente</button>}
              </div>
            </div>
          </div>
        ) : !cur ? (
          <div className="fj-borda fj-ch fj-mestre-detalhe__registro">
            <div className="fj-ch fj-vidro fj-registro fj-registro--vazio">
              <Mono tom="cy">Nenhum antecedente vinculado</Mono>
              <p>Escolha um antecedente na lista para ler o registro e vinculá-lo.</p>
            </div>
          </div>
        ) : (
        <div className={`${linked ? "fj-borda-ambar" : "fj-borda"} fj-ch fj-mestre-detalhe__registro`}>
          <div key={cur.slug} className="fj-ch fj-vidro fj-boot fj-sem-barra fj-registro">
            <span className="fj-registro__marca-dagua">{pad(idx)}</span>
            <div className="fj-registro__linha">
              <Mono tom="am">ANT-{pad(idx)}</Mono>
              <span className="fj-registro__fio" />
              <Mono tom={linked ? "am" : undefined}>{linked ? "✓ Vinculado" : "Não vinculado"}</Mono>
            </div>
            <h3 className="fj-registro__titulo fj-glow">{cur.nome}</h3>
            <div className="fj-registro__texto">{semFamiliaridade(cur.descricao, cur.familiaridade).split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</div>
            {cur.familiaridade && (
              <div className="fj-registro__caixa">
                <Mono tom="cy">Familiaridade</Mono>
                <p>{cur.familiaridade}</p>
              </div>
            )}
            <div className="fj-registro__acoes">
              {linked
                ? <button type="button" onClick={() => set({ antecedenteId: "" })} className="fj-ch fj-botao-fantasma">Desvincular</button>
                : <button type="button" onClick={() => set({ antecedenteId: cur.slug })} className="fj-ch fj-botao-vincular" data-testid="forja-vincular-antecedente">Vincular antecedente</button>}
            </div>
            <div className="fj-registro__trilho" aria-hidden="true">
              {lista.map((x, i) => <span key={x.slug} className={`fj-registro__passo ${i === idx ? "fj-registro__passo--atual" : i < idx ? "fj-registro__passo--antes" : ""}`} />)}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

/**
 * Painel lateral do Antecedente: a história de como virou refratário, o
 * codinome e, recolhidos, os detalhes que ficam entre jogador e narrador.
 * Nada aqui é obrigatório.
 */
export function OrigemNarrativa({ d, set, forja, setForja }: { d: DraftV12; set: SetDraft; forja: DraftForjaV12; setForja: (p: Partial<DraftForjaV12>) => void }) {
  return (
    <div className="fj-pilha">
      <Panel title="Como se tornou refratário">
        <label className="fj-sr" htmlFor="fj-origem">Como se tornou refratário</label>
        <textarea id="fj-origem" rows={6} value={forja.relato} onChange={(e) => setForja({ relato: e.target.value })} placeholder="ex: Meu exame nunca chegou aos registros oficiais. Minha mãe trabalhava no setor responsável e apagou tudo antes que alguém pudesse me encaminhar. Desde então, vivo com um nome que não é meu." className="fj-area-livre" />
        <div className="fj-rpi">
          <label htmlFor="fj-rpi-codinome"><Mono>Codinome</Mono></label>
          <input id="fj-rpi-codinome" value={d.codinome} onChange={(e) => set({ codinome: e.target.value.toUpperCase() })} className="fj-rpi__input" />
        </div>
      </Panel>

      <Panel title="Detalhes para o narrador">
          <div className="fj-detalhes__corpo">
            <p className="fj-detalhes__aviso">Estes campos são opcionais. Você também pode passar essas informações ao narrador em uma conversa ou em um documento separado.</p>
            <Grupo titulo="Antecedente">
              <CampoCurto rotulo="Meio" valor={d.antecedente.meio} onChange={(v) => set({ antecedente: { ...d.antecedente, meio: v } })} />
              <CampoCurto rotulo="Papel" valor={d.antecedente.papel} onChange={(v) => set({ antecedente: { ...d.antecedente, papel: v } })} />
              <CampoCurto rotulo="Relação atual" valor={d.antecedente.relacao_atual} onChange={(v) => set({ antecedente: { ...d.antecedente, relacao_atual: v } })} />
            </Grupo>
            <Grupo titulo="Tornando-se refratário">
              <CampoCurto rotulo="Estopim" valor={d.refratario.estopim} onChange={(v) => set({ refratario: { ...d.refratario, estopim: v } })} />
              <CampoCurto rotulo="Primeiros passos" valor={d.refratario.primeiros_passos} onChange={(v) => set({ refratario: { ...d.refratario, primeiros_passos: v } })} />
              <CampoCurto rotulo="Consequência" valor={d.refratario.consequencia} onChange={(v) => set({ refratario: { ...d.refratario, consequencia: v } })} />
            </Grupo>
            <Grupo titulo="RPI Forjado">
              <CampoCurto rotulo="Nome registrado" valor={d.rpi.nome_registrado} onChange={(v) => set({ rpi: { ...d.rpi, nome_registrado: v } })} />
              <CampoCurto rotulo="Ocupação declarada" valor={d.rpi.ocupacao_declarada} onChange={(v) => set({ rpi: { ...d.rpi, ocupacao_declarada: v } })} />
              <CampoCurto rotulo="Como o RPI chegou às suas mãos" valor={d.rpi.origem} onChange={(v) => set({ rpi: { ...d.rpi, origem: v } })} />
            </Grupo>
          </div>
      </Panel>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <fieldset className="fj-detalhes__grupo"><legend><Mono tom="cy">{titulo}</Mono></legend>{children}</fieldset>;
}

const AJUDA_CAMPOS = {
  "Meio": "Qual lugar, instituição, organização ou comunidade específica marcou a vida do personagem?",
  "Papel": "O que ele fazia ou como encontrava seu lugar nesse meio?",
  "Relação atual": "Como esse meio recebe o personagem hoje? Ele ainda pertence a ele, afastou-se ou deixou algo sem desfecho?",
  "Estopim": "Que acontecimento o levou a usar magia sem autorização ou a romper com o controle imperial?",
  "Primeiros passos": "Como aprendeu a sobreviver e circular entre refratários? Quem o ajudou, ensinou, explorou ou perseguiu?",
  "Consequência": "O que perdeu, abandonou ou colocou em risco ao seguir esse caminho?",
  "Nome registrado": "Qual nome civil consta no RPI Forjado de Nível 1?",
  "Ocupação declarada": "Qual atividade ou profissão aparece nessa identidade forjada?",
  "Como o RPI chegou às suas mãos": "Você recebeu, comprou, herdou ou construiu o RPI? Como conseguiu essa identidade?",
} as const;

function CampoCurto({ rotulo, valor, onChange }: { rotulo: keyof typeof AJUDA_CAMPOS; valor: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="fj-campo fj-campo--com-ajuda">
      <div className="fj-campo__rotulo">
        <label htmlFor={id}><Mono pequeno>{rotulo}</Mono></label>
        <button type="button" className="fj-campo__ajuda" aria-label={`Ajuda sobre ${rotulo}`} aria-describedby={`${id}-ajuda`}>?</button>
        <span id={`${id}-ajuda`} className="fj-campo__tooltip" role="tooltip">{AJUDA_CAMPOS[rotulo]}</span>
      </div>
      <input id={id} value={valor} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-ajuda`} className="fj-campo__input fj-campo__input--curto" />
    </div>
  );
}

/* ---------------- Qualidades & Complicações ---------------- */

function Pips({ n, max, tipo }: { n: number; max: number; tipo: Tipo }) {
  return (
    <span className="fj-pips" aria-label={`${n} de ${max} pontos`}>
      {Array.from({ length: Math.max(max, n) }).map((_, i) => <span key={i} className={`fj-pips__pip ${i < n ? `fj-pips__pip--${tipo}` : ""} ${i >= max ? "fj-pips__pip--extra" : ""}`} />)}
    </span>
  );
}

const ROTULO: Record<Tipo, string> = { qualidades: "Qualidades", complicacoes: "Complicações" };
const NOVO_TRACO = "novo_personalizado";
const nomeCategoria = (id?: string) => CATEGORIAS_TRACO.find((c) => c.id === id)?.nome ?? "Outras";

/** Linhas de custo ("Por 1 ponto…") ganham caixa própria. */
const estiloLinha = (x: string) => (/^(Por|Use) \**\d/.test(x) ? "fj-traco__custo" : "");
const prefixoCampanha = /^(?:\*\*)?Na campanha:(?:\*\*)?\s*/i;

export function Tracos({ d, set, catalogos }: { d: DraftV12; set: SetDraft; catalogos: CatalogosCriacaoV12 }) {
  const [tipo, setTipo] = useState<Tipo>("qualidades");
  const abaComplicacoes = useRef<HTMLButtonElement>(null);
  const [viewId, setViewId] = useState<Record<Tipo, string>>({ qualidades: catalogos.qualidades[0]?.slug ?? "", complicacoes: catalogos.complicacoes[0]?.slug ?? "" });
  const [lvl, setLvl] = useState<number | null>(null);
  const [novo, setNovo] = useState<Record<Tipo, { titulo: string; descricao: string; pontos: 1 | 2 }>>({
    qualidades: { titulo: "", descricao: "", pontos: 1 },
    complicacoes: { titulo: "", descricao: "", pontos: 1 },
  });
  const list: OpcaoTrajetoriaV12[] = catalogos[tipo];
  const escolhas: DraftEscolhaV12[] = d[tipo];
  const cur = list.find((x) => x.slug === viewId[tipo]) ?? list[0];
  const customSelected = escolhas.find((e) => isCustomTraitIdV12(e.id) && e.id === viewId[tipo]);
  const customMode = viewId[tipo] === NOVO_TRACO || !!customSelected || !cur;
  const customData = customSelected ?? novo[tipo];

  const spent = somaPontosV12(escolhas);
  const minhas = escolhas.filter((e) => e.id === cur?.slug);
  // Não repetível: no máximo uma; o custo dela pode ser ajustado. Repetível: cada compra é uma linha.
  const ownCost = cur && !cur.repetivel ? minhas[0]?.pontos : undefined;
  const level = lvl ?? ownCost ?? cur?.custos[0] ?? 1;
  const room = tipo === "qualidades" ? QUALIDADES - spent + (ownCost ?? 0) : Infinity;
  const view = (id: string) => { setViewId({ ...viewId, [tipo]: id }); setLvl(null); };
  const gravar = (lista: DraftEscolhaV12[]) => {
    const completouQualidades = tipo === "qualidades" && spent < QUALIDADES && somaPontosV12(lista) === QUALIDADES;
    set({ [tipo]: lista } as Partial<DraftV12>);
    setLvl(null);
    if (completouQualidades) {
      setTipo("complicacoes");
      abaComplicacoes.current?.focus();
    }
  };
  const updateCustom = (patch: Partial<{ titulo: string; descricao: string; pontos: 1 | 2 }>) => {
    if (customSelected) gravar(escolhas.map((e) => e.id === customSelected.id ? { ...e, ...patch } : e));
    else setNovo((atual) => ({ ...atual, [tipo]: { ...atual[tipo], ...patch } }));
  };
  const customRoom = tipo === "qualidades" ? QUALIDADES - spent + (customSelected?.pontos ?? 0) : Infinity;
  const addCustom = () => {
    if (!customData.titulo?.trim() || !customData.descricao?.trim() || customData.pontos > customRoom) return;
    const id = `personalizado_${crypto.randomUUID().replaceAll("-", "")}`;
    gravar([...escolhas, { id, pontos: customData.pontos, titulo: customData.titulo.trim(), descricao: customData.descricao.trim() }]);
    setNovo((atual) => ({ ...atual, [tipo]: { titulo: "", descricao: "", pontos: 1 } }));
    view(id);
  };
  const adquirir = () => {
    if (!cur) return;
    const pontos = level as 1 | 2;
    if (cur.repetivel) gravar([...escolhas, { id: cur.slug, pontos }]);
    else gravar([...escolhas.filter((e) => e.id !== cur.slug), { id: cur.slug, pontos }]);
  };
  const remover = () => {
    if (!cur) return;
    // Repetível: tira a última compra; não repetível: tira a única.
    const i = escolhas.map((e) => e.id).lastIndexOf(cur.slug);
    if (i >= 0) gravar(escolhas.filter((_, j) => j !== i));
  };
  const categorias = [...CATEGORIAS_TRACO.map((c) => c.id), ...new Set(list.map((x) => x.categoria ?? "").filter((c) => !CATEGORIAS_TRACO.some((k) => k.id === c)))];
  const textoAdquirir = level > room ? "Sem pontos" : ownCost ? `Ajustar para ${level} pt` : minhas.length && cur?.repetivel ? "Adquirir outra" : "Adquirir";

  return (
    <div className="fj-passo" data-tipo={tipo}>
      <Cabecalho kicker="Trajetória · 03" title="Qualidades & Complicações" />
      {/* O seletor ocupa a largura toda e carrega o orçamento de cada lado
          (os pips), no lugar do contador que repetia os dois nomes acima. */}
      <div className="fj-segmentado fj-segmentado--largo" role="tablist" aria-label="Qualidades ou Complicações">
        {(["qualidades", "complicacoes"] as const).map((k) => (
          <button type="button" role="tab" aria-selected={tipo === k} key={k} ref={k === "complicacoes" ? abaComplicacoes : undefined} onClick={() => { setTipo(k); setLvl(null); }} title={`${catalogos[k].length} opções`} className={`fj-segmentado__op fj-segmentado__op--${k} ${tipo === k ? "fj-segmentado__op--on" : ""}`}>
            {ROTULO[k]}
            <Pips n={somaPontosV12(d[k])} max={k === "qualidades" ? QUALIDADES : COMPLICACOES_MINIMO} tipo={k} />
          </button>
        ))}
      </div>
      <div className="fj-mestre-detalhe fj-mestre-detalhe--tracos">
        <div className="fj-tracos__coluna">
          <div className={`${tipo === "complicacoes" ? "fj-borda-ambar" : "fj-borda"} fj-ch fj-tracos__lista`}>
            <div key={tipo} className="fj-ch fj-vidro fj-sem-barra fj-tracos__rolagem">
              {categorias.map((cat) => {
                const items = list.filter((x) => (x.categoria ?? "") === cat);
                if (!items.length) return null;
                return (
                  <div key={cat}>
                    <div className="fj-tracos__categoria"><Mono pequeno>{nomeCategoria(cat)}</Mono><span className="fj-tracos__categoria-fio" /></div>
                    {items.map((t) => {
                      const doTipo = escolhas.filter((e) => e.id === t.slug);
                      const on = doTipo.length > 0, viewing = t.slug === viewId[tipo];
                      return (
                        <button type="button" key={t.slug} onClick={() => view(t.slug)} className={`fj-tracos__item ${viewing ? "fj-tracos__item--vendo" : ""}`}>
                          <span className="fj-tracos__item-nome">
                            <span className={`fj-losango fj-losango--sm ${on ? "fj-losango--tipo" : "fj-losango--vazio"}`} />
                            <span className={on ? "fj-tracos__nome--on" : ""}>{t.nome}{doTipo.length > 1 ? ` ×${doTipo.length}` : ""}</span>
                          </span>
                          <CustoTag t={t} on={on ? somaPontosV12(doTipo) : undefined} />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              <button type="button" onClick={() => view(NOVO_TRACO)} className={`fj-tracos__item fj-tracos__item--custom ${viewId[tipo] === NOVO_TRACO ? "fj-tracos__item--vendo" : ""}`}>
                <span className="fj-tracos__item-nome"><span className="fj-losango fj-losango--sm fj-losango--vazio" /><span className="fj-indice-lista__nome">Personalizado</span></span>
                <span className="fj-tracos__mais" aria-hidden="true" />
              </button>
              {escolhas.filter((e) => isCustomTraitIdV12(e.id)).map((e) => (
                <button type="button" key={e.id} onClick={() => view(e.id)} className={`fj-tracos__item fj-tracos__item--custom-salvo ${viewId[tipo] === e.id ? "fj-tracos__item--vendo" : ""}`}>
                  <span className="fj-tracos__item-nome"><span className="fj-losango fj-losango--sm fj-losango--tipo" /><span className="fj-tracos__nome--on">{e.titulo?.trim() || "Sem título"}</span></span>
                  <Mono tom={tipo === "qualidades" ? "cy" : "am"}>{e.pontos} pt</Mono>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`${tipo === "complicacoes" ? "fj-borda-ambar" : "fj-borda"} fj-ch fj-mestre-detalhe__registro`}>
          {customMode ? <div key={tipo + (customSelected?.id ?? NOVO_TRACO)} className="fj-ch fj-vidro fj-boot fj-sem-barra fj-registro fj-registro--traco fj-registro--traco-custom">
            <div className="fj-registro__linha"><Mono className="fj-tom-tipo">{tipo === "qualidades" ? "QUALIDADE" : "COMPLICAÇÃO"} · AUTORAL</Mono><span className="fj-registro__fio fj-registro__fio--cy" /><Mono className={customSelected ? "fj-tom-tipo" : ""}>{customSelected ? "✓ Adquirida" : "Novo registro"}</Mono></div>
            <h3 className="fj-registro__titulo fj-registro__titulo--menor">{customSelected ? "Seu traço" : `Crie ${tipo === "qualidades" ? "uma qualidade" : "uma complicação"}`}</h3>
            <p className="fj-registro__custom-intro">Defina com o narrador um efeito claro, seus limites e quando entra em cena. O custo é de 1 ou 2 pontos.</p>
            <div className="fj-registro__custom-campos">
              <label className="fj-registro__custom-campo"><Mono className="fj-tom-tipo">Título</Mono><input maxLength={120} value={customData.titulo ?? ""} onChange={(e) => updateCustom({ titulo: e.target.value })} placeholder={tipo === "qualidades" ? "Ex.: Acesso à rede ferroviária" : "Ex.: Procurado pela corporação"} /></label>
              <label className="fj-registro__custom-campo"><Mono className="fj-tom-tipo">Descrição</Mono><textarea maxLength={2000} rows={5} value={customData.descricao ?? ""} onChange={(e) => updateCustom({ descricao: e.target.value })} placeholder={tipo === "qualidades" ? "O que a qualidade garante? Quando funciona e qual é o limite?" : "Quem exerce a pressão? O que quer, quando aparece e qual é o limite?"} /></label>
            </div>
            <div className="fj-traco__acoes">
              <div className="fj-traco__custos"><Mono>Custo</Mono><span className="fj-custo-seg" role="radiogroup" aria-label="Custo personalizado">{([1, 2] as const).map((c) => <button type="button" role="radio" aria-checked={customData.pontos === c} disabled={c > customRoom} key={c} onClick={() => updateCustom({ pontos: c })} className={`fj-custo-seg__op ${customData.pontos === c ? "fj-custo-seg__op--on" : ""}`}>{c} pt</button>)}</span></div>
              <div className="fj-traco__botoes">
                {customSelected ? <button type="button" onClick={() => { gravar(escolhas.filter((e) => e.id !== customSelected.id)); view(NOVO_TRACO); }} className="fj-ch fj-botao-fantasma">Remover</button> : <button type="button" disabled={!customData.titulo?.trim() || !customData.descricao?.trim() || customData.pontos > customRoom} onClick={addCustom} className="fj-ch fj-botao-tipo">Adicionar</button>}
              </div>
            </div>
          </div> : cur && <div key={tipo + cur.slug} className="fj-ch fj-vidro fj-boot fj-sem-barra fj-registro fj-registro--traco">
            <div className="fj-registro__linha">
              <Mono className="fj-tom-tipo">{tipo === "qualidades" ? "Qualidade" : "Complicação"} · {nomeCategoria(cur.categoria)}</Mono>
              <span className="fj-registro__fio fj-registro__fio--cy" />
              <Mono className={minhas.length ? "fj-tom-tipo" : ""}>
                {minhas.length ? `✓ Adquirida${minhas.length > 1 ? ` ×${minhas.length}` : ""} · ${somaPontosV12(minhas)} pt` : cur.repetivel ? "Disponível · repetível" : "Disponível"}
              </Mono>
            </div>
            <h3 className="fj-registro__titulo fj-registro__titulo--menor fj-glow">{cur.nome}</h3>
            <div className="fj-traco__texto">
              {cur.descricao.split("\n\n").map((x, i) => prefixoCampanha.test(x)
                ? <div key={i} className="fj-traco__campanha"><h4 className="fj-traco__campanha-titulo">Na campanha</h4><Rich text={x.replace(prefixoCampanha, "")} /></div>
                : <Rich key={i} text={x} className={estiloLinha(x)} />)}
            </div>
            <div className="fj-traco__acoes">
              <div className="fj-traco__custos">
                <Mono>Custo</Mono>
                <span className="fj-custo-seg" role="radiogroup" aria-label="Custo">
                  {cur.custos.map((c) => (
                    <button type="button" role="radio" aria-checked={level === c} key={c} disabled={cur.custos.length < 2} onClick={() => setLvl(c)} className={`fj-custo-seg__op ${level === c ? "fj-custo-seg__op--on" : ""}`}>{c} pt</button>
                  ))}
                </span>
              </div>
              <div className="fj-traco__botoes">
                {minhas.length > 0 && <button type="button" onClick={remover} className="fj-ch fj-botao-fantasma">{cur.repetivel && minhas.length > 1 ? "Remover uma" : "Remover"}</button>}
                {(cur.repetivel || ownCost !== level) && (
                  <button type="button" disabled={level > room} onClick={adquirir} className="fj-ch fj-botao-tipo">{textoAdquirir}</button>
                )}
              </div>
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}

function CustoTag({ t, on }: { t: OpcaoTrajetoriaV12; on?: number }) {
  const n = on ?? Math.max(...t.custos);
  return (
    <span className="fj-custo">
      {t.custos.length > 1 && on === undefined && <span className="fj-custo__faixa">1–2</span>}
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className={`fj-losango fj-losango--xs ${on !== undefined ? "fj-losango--tipo" : i < t.custos[0] ? "fj-losango--cheio" : "fj-losango--contorno"}`} />
      ))}
    </span>
  );
}

/** Painel lateral dos Traços: o que já foi adquirido e a regra de cada lado. */
export function FichaTracos({ d, set, catalogos }: { d: DraftV12; set: SetDraft; catalogos: CatalogosCriacaoV12 }) {
  const drop = (k: Tipo, i: number) => set({ [k]: d[k].filter((_, j) => j !== i) } as Partial<DraftV12>);
  return (
    <div className="fj-pilha">
      {(["qualidades", "complicacoes"] as const).map((k) => {
        const lista = d[k], soma = somaPontosV12(lista), q = k === "qualidades";
        const nome = (e: DraftEscolhaV12) => catalogos[k].find((x) => x.slug === e.id)?.nome ?? e.titulo?.trim() ?? e.id;
        const placar = q ? `${QUALIDADES - soma}` : soma >= COMPLICACOES_MINIMO ? "✓" : `${COMPLICACOES_MINIMO - soma}`;
        return (
          <Panel key={k} ambar={!q} title={ROTULO[k]} right={<span className={`fj-ficha-tracos__sobra ${q ? "" : "fj-ficha-tracos__sobra--escuro"}`}>{placar}</span>}>
            <div className="fj-ficha-tracos__topo" data-tipo={k}>
              <Mono>{q ? "Somam exatamente 3" : "Somam ao menos 2"}</Mono>
              <Pips n={soma} max={q ? QUALIDADES : COMPLICACOES_MINIMO} tipo={k} />
            </div>
            {lista.length ? lista.map((e, i) => (
              <div key={`${e.id}-${i}`} className="fj-ficha-tracos__linha">
                <span className="fj-ficha-tracos__nome">{nome(e)}</span>
                <span className="fj-ficha-tracos__dir">
                  <Mono tom={q ? "cy" : "am"}>{e.pontos} pt</Mono>
                  <button type="button" onClick={() => drop(k, i)} className="fj-ficha-tracos__remover" aria-label={`Remover ${nome(e)}`}>✕</button>
                </span>
              </div>
            )) : <p className="fj-ficha-tracos__vazio">Nenhum registro adquirido.</p>}
            {!q && soma > COMPLICACOES_MINIMO && <p className="fj-ficha-tracos__nota">Complicações além de 2 pontos só com acordo do grupo.</p>}
          </Panel>
        );
      })}
    </div>
  );
}
