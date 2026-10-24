"use client";

import { useState } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import type { ConsoleApi } from "../../types";
import { classResource, readClassPlay, reached, type ClassCommand, type ResultadoNegociacao } from "../../../../../lib/character/classManagement";
import { CabecalhoModulo } from "../CabecalhoModulo";
import { oxanium } from "../../../../_design/oxanium";
import face from "../../../../../../content/v12/db_classe_face_v1_2.json";
import { ListaHabilidades, Painel, type Caracteristica } from "./painelClasse";
import "./ancoraRede.css";
import "./combatenteAnel.css";
import "./faceReserva.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

type Api = Pick<ConsoleApi, "character" | "somenteLeitura"> & Partial<Pick<ConsoleApi, "classe" | "glossario">>;
type Livro = { nome: string; caracteristicas: Record<string, Caracteristica[]> };

const classe = face.classes[0] as unknown as Livro;
const subclasses = face.subclasses as unknown as (Livro & { slug: string })[];

const Svg = ({ d, tam = 24, traco = 1.8 }: { d: string; tam?: number; traco?: number }) =>
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
type PosDica = "cima" | "cima-esq" | "cima-dir" | "baixo-esq" | "baixo-dir";
const Dica = ({ texto, pos }: { texto: string; pos: PosDica }) => <span className="ca-dica" data-pos={pos} role="tooltip">{texto}</span>;

/** As oito Manobras Sociais, com o texto do livro para a dica. */
const MANOBRAS = [
  { nome: "Arrancar", d: "M12 4v10M8 10l4 4 4-4M5 20h14", regra: "O alvo revela uma informação curta que pretendia esconder ou confirma algo que tentava evitar." },
  { nome: "Comprometer", d: "M5 12.5 9.5 17 19 7", regra: "O alvo assume uma promessa, posição, acordo ou responsabilidade explícita." },
  { nome: "Desviar", d: "M4 19c0-6.5 4.5-11 11-11h5M16 4l4 4-4 4", regra: "Você muda o centro da conversa, afastando a atenção de uma pessoa, assunto ou acontecimento." },
  { nome: "Expor", d: "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12ZM12 9.2a2.8 2.8 0 1 0 0 5.6a2.8 2.8 0 1 0 0-5.6", regra: "Você revela uma contradição, hesitação, mentira ou fragilidade perceptível no discurso do alvo." },
  { nome: "Hesitar", d: "M9 5v14M15 5v14", regra: "O alvo posterga uma decisão imediata, desde que esperar seja uma possibilidade razoável." },
  { nome: "Isolar", d: "M8 5.5a3 3 0 1 1 0 6a3 3 0 1 1 0-6M3 20c0-3 2.2-5.2 5-5.2s5 2.2 5 5.2M18 4v16", regra: "Você separa socialmente o alvo de parte de seus apoiadores ou consegue uma oportunidade para falar com alguém em particular." },
  { nome: "Provocar", d: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8", regra: "O alvo direciona sua atenção ou sua reação imediata para você." },
  { nome: "Viabilizar", d: "M3 12h12M11 8l4 4-4 4M18 5h3v14h-3", regra: "Você cria uma abertura para um aliado. O próximo Teste de Interação realizado por ele contra o mesmo alvo recebe +1 de vantagem." },
];

const ICONES = {
  classe: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  mobilizar: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  persona: "M12 3 20 12 12 21 4 12Z",
  garimpo: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M21 21l-4.35-4.35M11 8v6M8 11h6",
  negocio: "M3 7h18l-2 12H5L3 7ZM8 7V5a4 4 0 0 1 8 0v2",
  ouvidos: "M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1v-6h3ZM3 19a2 2 0 0 0 2 2h1v-6H3Z",
  porta: "M13 4h3a2 2 0 0 1 2 2v14M2 20h3M13 20h9M10 12v.01M13 4.6v16.8L5 19.5V5.4Z",
};

const RESULTADOS: [ResultadoNegociacao, string][] = [["falha", "FALHA"], ["limitado", "LIMITADO"], ["padrao", "PADRÃO"], ["critico", "CRÍTICO"]];
const TEXTO_COMPRA: Record<ResultadoNegociacao, string> = {
  falha: "Nenhum acordo nesta busca.",
  limitado: "Encontrou, mas com condição desfavorável: preço maior, entrega demorada, procedência arriscada, quantidade menor ou um favor a mais.",
  padrao: "Encontrou pelo valor justo, num prazo razoável.",
  critico: "Encontrou, e com condição favorável: entrega discreta, prazo menor, procedência confiável ou alternativa melhor pelo mesmo preço.",
};
const aretz = (v: number) => `Ⱥ ${v.toLocaleString("pt-BR")}`;
const rolarD8 = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 8);

type Persona = { imagem: string; meio: string; espera: string };
const lerPersona = (texto?: string): Persona => { try { return { imagem: "", meio: "", espera: "", ...JSON.parse(texto ?? "{}") }; } catch { return { imagem: "", meio: "", espera: "" }; } };

type Chip = { chave: string; icone: string; rotulo: string; valor: string; usado: boolean; vazio?: boolean; dica: string; clicar: () => void };

export function FaceReserva({ api, rank, subclassId }: { api: Api; rank: string; subclassId?: string }) {
  const [painel, setPainel] = useState<null | "habilidades" | "persona" | "negocio">(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [editNeg, setEditNeg] = useState<number | null>(null);
  const [visao, setVisao] = useState<"confianca" | "negociacao">("confianca");
  const [prepNeg, setPrepNeg] = useState<{ tipo: "comprar" | "vender"; horas: number }>({ tipo: "vender", horas: 2 });
  const [resultadoNeg, setResultadoNeg] = useState<ResultadoNegociacao | null>(null);
  const [valorNeg, setValorNeg] = useState("");
  const [rascunho, setRascunho] = useState<Persona | null>(null);

  const st = readClassPlay(api.character);
  const res = classResource(api.character);
  const send = api.classe?.executar;
  const locked = !!api.somenteLeitura || !send;
  const at = (r: string) => reached(rank, r);
  const sub = subclasses.find(item => item.slug === subclassId);
  const temSub = !!sub && at("E");
  const enviar = (cmd: ClassCommand) => { if (!locked) send?.(cmd); };
  const topoPilha = st.pilha?.[st.pilha.length - 1]?.nome;
  const desfazer = () => { setEditando(null); setEditNeg(null); enviar({ type: "desfazerCombate" }); };

  /* ── Reserva de Confiança ── */
  const reserva = st.dice;
  const vagas = Array.from({ length: res.max }, (_, j) => reserva[j] ?? null);
  const proxima = reserva.length < res.max ? reserva.length : -1;
  const tocarVaga = (j: number) => {
    const alvo = vagas[j] == null && proxima >= 0 ? proxima : j;
    setEditando(editando === alvo ? null : alvo);
  };
  const definir = (v: number) => {
    if (editando == null) return;
    if (vagas[editando] !== v) enviar({ type: "setDie", index: editando, value: v });
    setEditando(null);
  };
  const tirar = () => { if (editando != null && vagas[editando] != null) enviar({ type: "setDie", index: editando, value: null }); setEditando(null); };
  const fimReserva = at("B") ? "ATÉ O FIM DA OPERAÇÃO" : "ATÉ O FIM DA CENA";

  /** Gemas da Reserva. "confianca": vagas com rótulo 01, 02…; "neg" e "folha": dados da Negociação, sem rótulo. */
  const gemas = (valores: (number | null)[], aberta: number | null, tocar: (j: number) => void, rotulo: (j: number) => string, tipo: "confianca" | "neg" | "folha" = "confianca") => {
    const neg = tipo !== "confianca";
    return <div className="fr-gemas" data-neg={tipo === "neg" || undefined} data-folha={tipo === "folha" || undefined}>{valores.map((v, j) => {
      const vazia = v == null, ed = aberta === j, prox = vazia && j === proxima;
      const brilho = ed ? `drop-shadow(0 0 ${neg ? 12 : 14}px var(--ca-halo))` : vazia ? "none" : `drop-shadow(0 0 ${neg ? 6 : 8}px var(--ca-halo))`;
      return <button key={j} type="button" className="fr-gema" data-vazia={vazia} data-proxima={prox || undefined} aria-pressed={ed} disabled={locked}
        aria-label={vazia ? `${rotulo(j)}: vazia. Tocar para guardar um valor` : `${rotulo(j)}: ${v}. Tocar para mudar${neg ? " o valor" : " ou tirar"}`} onClick={() => tocar(j)}>
        <span>
          <svg viewBox="0 0 48 50" width="100%" height="100%" fill={ed ? "var(--ca-medio)" : vazia ? "transparent" : "var(--ca-fundo)"} stroke={ed ? "#fff" : vazia ? (prox ? "#4b6a7d" : "#2c4556") : "var(--ca)"} strokeWidth={neg ? 1.8 : 1.6} strokeDasharray={vazia && !ed ? "2.5 2.5" : undefined} strokeLinejoin="round"
            style={{ filter: brilho }} aria-hidden="true">
            <path d="M24 2 46 24 24 46 2 24Z" />{!vazia && <path d="M2 24 24 11l22 13-22 13Z" fill="none" strokeWidth=".8" opacity={neg ? .55 : .7} />}
          </svg>
          <strong>{vazia ? "+" : v}</strong>
        </span>
        {!neg && <small>0{j + 1}</small>}
      </button>;
    })}</div>;
  };

  const valores = (atual: number | null | undefined, escolher: (v: number) => void) =>
    [1, 2, 3, 4, 5, 6, 7, 8].map(v => <button key={v} type="button" className="fr-valor" aria-pressed={v === atual} aria-label={`D8 com valor ${v}`} onClick={() => escolher(v)}>{v}</button>);
  const linkDesfazer = topoPilha ? <button type="button" className="fr-link" disabled={locked} onClick={desfazer}>DESFAZER · {topoPilha.toUpperCase()}</button> : null;
  /** Linha de valor dos dados da Negociação (aba e folha). */
  const escolhaNeg = (n: NonNullable<typeof st.negociacao>) => <div className="fr-escolha" data-neg="true">
    {editNeg != null && <>
      <span>VALOR DO D8</span>
      {valores(n.dados[editNeg], v => { if (n.dados[editNeg] !== v) enviar({ type: "negociacao", op: "dado", index: editNeg, valor: v }); setEditNeg(null); })}
    </>}
  </div>;

  /* ── Mercador: Intermediação ── */
  const neg = st.negociacao;
  const mente = Math.max(1, api.character.atributos.mente ?? 1);
  const teto = at("A") ? 8000 : at("C") ? 4000 : 2000;
  const pct: Record<ResultadoNegociacao, number> = at("C") ? { falha: 0, limitado: 100, padrao: 125, critico: 150 } : { falha: 0, limitado: 75, padrao: 100, critico: 125 };
  const vendido = st.uses["operation:vendido"] ?? 0;
  const compraFeita = !!st.uses["operation:compra"], vendaHoje = !!st.uses["day:venda"];
  const nDados = Math.min(prepNeg.horas, mente);
  const abrirNeg = () => { setResultadoNeg(null); setValorNeg(""); enviar({ type: "negociacao", op: "abrir", tipo: prepNeg.tipo, horas: prepNeg.horas, dados: Array.from({ length: nDados }, rolarD8) }); };
  const concluirNeg = () => {
    if (!resultadoNeg) return;
    enviar({ type: "negociacao", op: "concluir", resultado: resultadoNeg, valor: Number(valorNeg) || undefined });
    setResultadoNeg(null); setValorNeg(""); setPainel(null);
  };
  const textoNeg = !neg || !resultadoNeg ? "" : neg.tipo === "comprar" ? TEXTO_COMPRA[resultadoNeg]
    : resultadoNeg === "falha" ? "Nenhum acordo. As mercadorias ficam com você; nova tentativa a partir de amanhã."
    : Number(valorNeg) > 0 ? `Recebe ${aretz(Math.floor(Number(valorNeg) * pct[resultadoNeg] / 100))} · ${pct[resultadoNeg]}% do valor justo.` : `Vende por ${pct[resultadoNeg]}% do valor justo.`;
  const podeConcluir = !!neg && !!resultadoNeg && (neg.tipo === "comprar" || resultadoNeg === "falha" || Number(valorNeg) > 0);

  const notaHoras = `1d8 por hora, até ${mente} d8 (Mente ${mente}).`;
  const tiposNeg = <div className="fr-tipos">
    {([["comprar", "Comprar", compraFeita ? "COMPRA DA OPERAÇÃO FEITA" : "1 POR OPERAÇÃO", compraFeita], ["vender", "Vender", vendaHoje ? "TENTATIVA DE HOJE FEITA" : `1 POR DIA · RESTAM ${aretz(Math.max(0, teto - vendido))}`, vendaHoje]] as const).map(([id, nome, status, usado]) =>
      <button key={id} type="button" className="fr-opcao" aria-pressed={prepNeg.tipo === id} data-usado={usado || undefined} disabled={locked} onClick={() => setPrepNeg(p => ({ ...p, tipo: id }))}><strong>{nome}</strong><small>{status}</small></button>)}
  </div>;
  const horasNeg = [1, 2, 3].map(h => <button key={h} type="button" className="fr-opcao" aria-pressed={prepNeg.horas === h} disabled={locked} onClick={() => setPrepNeg(p => ({ ...p, horas: h }))}>{h} H</button>);
  const rolarTexto = `ROLAR ${nDados}D8`;

  /* ── Chips da subclasse (padrão do Combatente: uso marca e desmarca no toque) ── */
  const usoChip = (chave: string, icone: string, rotulo: string, livre: string, feito: string, dica: string, passo: string, limite = 1): Chip => {
    const n = st.uses[chave] ?? 0;
    const valor = limite > 1 ? (n === 0 ? `${limite}× POR CENA` : n < limite ? `${n} DE ${limite} NA CENA` : feito) : n ? feito : livre;
    return { chave, icone, rotulo, valor, usado: n >= limite, dica: `${dica} Toque para marcar; toque de novo para desmarcar.`, clicar: () => enviar({ type: "marcarUso", chave, passo, limite }) };
  };
  const persona = lerPersona(st.selections.persona);
  const chips: Chip[] = [];
  if (temSub && subclassId === "icone") {
    chips.push(usoChip("scene:mobilizar", ICONES.mobilizar, "MOBILIZAR", "1× POR CENA", "PEDIDO FEITO NA CENA",
      "Peça ajuda ao seu Público. Pedidos simples, da sua Persona e sem custo ou risco saem sem teste; os que exigem tempo, recursos limitados, exposição ou vão contra a preferência do Público pedem um Teste de Interação.", "Pedido ao Público", at("C") ? 2 : 1));
    chips.push({ chave: "persona", icone: ICONES.persona, rotulo: "PERSONA", valor: (persona.imagem || "DEFINIR").toUpperCase(), usado: false, vazio: !persona.imagem,
      dica: persona.imagem ? `${[persona.meio, persona.espera].filter(Boolean).join(" · ")}. Toque para editar.` : "Defina a imagem pela qual você é conhecido, onde ela circula e o que seu Público espera.",
      clicar: () => { setRascunho(persona); setPainel("persona"); } });
  } else if (temSub && subclassId === "mercador") {
    chips.push(usoChip("operation:garimpo", ICONES.garimpo, "DESCONTO 20%", "1× POR OPERAÇÃO", "USADO NA OPERAÇÃO",
      "Garimpo de Rua: você sempre sabe como chegar ao próximo Mercado Noturno e identifica o que examina. Uma vez por operação, reduza em 20% o preço de uma mercadoria ou serviço comprado lá.", "Desconto do Garimpo"));
    chips.push({ chave: "negocio", icone: ICONES.negocio, rotulo: neg ? "NEGOCIAÇÃO ABERTA" : "VENDAS", valor: neg ? `${neg.tipo === "vender" ? "VENDA" : "COMPRA"} · ${neg.dados.length}D8` : `${aretz(vendido)} / ${teto.toLocaleString("pt-BR")}`, usado: false,
      dica: neg ? "Uma negociação está aberta. Toque para registrar o resultado." : `Compra: ${compraFeita ? "feita nesta operação" : "1 por operação"}. Venda: ${vendaHoje ? "tentativa de hoje feita" : "1 tentativa por dia"}. Teto de vendas: ${aretz(teto)} em valor justo por operação. Toque para negociar.`,
      clicar: () => setPainel("negocio") });
  } else if (temSub && subclassId === "rato_de_rua") {
    chips.push(usoChip("scene:ouvidos", ICONES.ouvidos, "OUVIDOS NO CHÃO", "1× POR CENA", "USADO · +1 NO 1º TESTE",
      "Dez minutos observando e conversando com quem vive ali: escolha até duas perguntas sobre o território e o Narrador responde com um rumor, indício, nome ou local. O primeiro Teste de Interação que seguir uma dessas pistas recebe +1 de vantagem.", "Ouvidos no Chão"));
    chips.push(usoChip("scene:porta", ICONES.porta, "PORTA ENTREABERTA", "1× POR CENA", "USADA NA CENA",
      "Encontre em 10 minutos alguém disposto a negociar abrigo, passagem, atendimento clandestino, um encontro, um espaço discreto ou transporte na região. Ajuda simples sai sem teste; com recurso limitado, exposição, ilegalidade ou perigo, faça um Teste de Interação.", "Porta Entreaberta"));
  }
  const chipView = (c: Chip, i: number) =>
    <button key={c.chave} type="button" className="ca-chip ca-tem-dica" data-usado={c.usado || undefined} data-vazio={c.vazio || undefined} disabled={locked} onClick={c.clicar}>
      <Svg d={c.icone} tam={14} traco={2} />{c.rotulo}<b>· {c.valor}</b>
      <Dica texto={c.dica} pos={i === 0 ? "baixo-esq" : "baixo-dir"} />
    </button>;

  const mercador = temSub && subclassId === "mercador";
  const rotulo = temSub ? `${sub!.nome.toUpperCase()} · ${rank}` : `RANKING ${rank}`;

  const blocoReserva = <section className="fr-reserva" aria-label="Reserva de Confiança">
    <div className="fr-titulo">
      <span className="ca-tem-dica" tabIndex={0}>RESERVA DE CONFIANÇA<Dica pos="cima" texto="Depois de rolar os d8 de um Teste de Interação e antes do resultado, uma vez por teste: guarde um d8 rolado numa vaga vazia, ou troque um d8 do teste por um guardado. Os valores não mudam." /></span>
      <small>{fimReserva}</small>
    </div>
    {gemas(vagas, editando, tocarVaga, j => `Vaga ${j + 1} da Reserva`)}
    <div className="fr-escolha">
      {editando != null ? <>
        {valores(vagas[editando], definir)}
        {vagas[editando] != null && <button type="button" className="fr-link" data-remover="true" onClick={tirar}>REMOVER</button>}
        <button type="button" className="fr-link" data-tom="neutro" onClick={() => setEditando(null)}>CANCELAR</button>
      </> : linkDesfazer}
    </div>
  </section>;

  const blocoNegociacao = <section className="fr-reserva" data-neg="true" aria-label="Reserva de Negociação">
    {neg ? <>
      <button type="button" className="fr-resultado-link" onClick={() => setPainel("negocio")}>{neg.tipo === "vender" ? "VENDA" : "COMPRA"} · <b>RESULTADO ›</b></button>
      {gemas(neg.dados, editNeg, j => setEditNeg(editNeg === j ? null : j), j => `Dado ${j + 1} da Reserva de Negociação`, "neg")}
      {escolhaNeg(neg)}
    </> : <>
      <div className="fr-nova">{tiposNeg}</div>
      <div className="fr-horas">
        <span>HORAS</span>
        {horasNeg}
        <button type="button" className="fr-primario" disabled={locked} onClick={abrirNeg}>{rolarTexto}</button>
      </div>
      <span className="fr-nota">{notaHoras}</span>
    </>}
  </section>;

  return <section className={`rc-eq-outer ar-raiz ca-raiz fr-raiz ${oxanium.variable} ${plex.variable}`} aria-label="Classe Face">
    <div className="rc-eq-card-outer rc-inv-moldura">
    <CabecalhoModulo id="ID://CLASSE" mod="MOD.CLASS // 10" />
    <div className="ar-tela">
    <div className="ar-rolagem">
      <header className="ar-cab">
        <h2>FACE</h2>
        <span>{rotulo}</span>
        <span className="ca-legenda" aria-hidden="true"><span><i />GUARDAR OU TROCAR · 1× POR TESTE</span></span>
      </header>
      {chips.length > 0 && <div className="ca-chips">{chips.map(chipView)}</div>}

      <div className="fr-palco" data-abas={mercador || undefined}>
        {mercador && <div className="fr-abas" role="tablist" aria-label="Reserva">
          {([["confianca", "CONFIANÇA"], ["negociacao", "NEGOCIAÇÃO"]] as const).map(([id, nome]) =>
            <button key={id} type="button" role="tab" aria-selected={visao === id} onClick={() => { setVisao(id); setEditando(null); setEditNeg(null); }}>{nome}</button>)}
        </div>}
        {mercador && visao === "negociacao" ? blocoNegociacao : blocoReserva}

        <section className="fr-manobras" aria-label="Manobras Sociais">
          <span>MANOBRAS SOCIAIS</span>
          <div>{MANOBRAS.map((m, k) =>
            <span key={m.nome} className="fr-manobra ca-tem-dica" tabIndex={0}>
              <span>
                <svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" fill="var(--ca-fundo)" stroke="var(--ca)" strokeWidth="2.4" /></svg>
                <Svg d={m.d} tam={17} traco={2} />
              </span>
              <strong>{m.nome}</strong>
              <Dica texto={m.regra} pos={k % 4 === 0 ? "cima-esq" : k % 4 === 3 ? "cima-dir" : "cima"} />
            </span>)}</div>
        </section>
      </div>
    </div>

    <footer className="ar-rodape">
      <button type="button" disabled={locked || !reserva.length} onClick={() => { setEditando(null); enviar({ type: "esvaziarReserva" }); }}>ESVAZIAR RESERVA</button>
      <button type="button" onClick={() => setPainel("habilidades")}>HABILIDADES ›</button>
    </footer>

    {painel === "habilidades" && <Painel titulo="HABILIDADES" fechar={() => setPainel(null)}>
      <ListaHabilidades classe={classe} sub={temSub ? sub : undefined} rank={rank} glossario={api.glossario} iconeClasse={<Svg d={ICONES.classe} tam={16} />} />
    </Painel>}

    {painel === "persona" && rascunho && <Painel baixo titulo="PERSONA PÚBLICA" fechar={() => setPainel(null)}>
      <div className="fr-folha">
        <p className="fr-intro">A imagem pela qual você é conhecido, onde ela circula e o que seu Público espera de você. Dentro desse meio, um pequeno grupo já forma seu Público.</p>
        <div className="fr-campos">
          <label className="fr-campo"><span>COMO VOCÊ É CONHECIDO</span><input type="text" maxLength={60} disabled={locked} placeholder="Ex.: a cantora dos túneis, o pregador da Malha" value={rascunho.imagem} onChange={e => setRascunho({ ...rascunho, imagem: e.target.value })} /></label>
          <label className="fr-campo"><span>ONDE SUA PERSONA CIRCULA</span><input type="text" maxLength={80} disabled={locked} placeholder="Comunidade, circuito ou ambiente social" value={rascunho.meio} onChange={e => setRascunho({ ...rascunho, meio: e.target.value })} /></label>
          <label className="fr-campo"><span>O QUE SEU PÚBLICO ESPERA</span><input type="text" maxLength={80} disabled={locked} placeholder="Coragem, irreverência, competência, luxo, tradição…" value={rascunho.espera} onChange={e => setRascunho({ ...rascunho, espera: e.target.value })} /></label>
          <button type="button" className="fr-primario" disabled={locked || !rascunho.imagem.trim()} onClick={() => {
            enviar({ type: "select", key: "persona", value: JSON.stringify({ imagem: rascunho.imagem.trim(), meio: rascunho.meio.trim(), espera: rascunho.espera.trim() }) });
            setPainel(null);
          }}>SALVAR PERSONA</button>
        </div>
      </div>
    </Painel>}

    {painel === "negocio" && <Painel baixo titulo="INTERMEDIAÇÃO" fechar={() => setPainel(null)}>
      <div className="fr-folha">
        {neg ? <>
          <span className="fr-rotulo-sec">RESERVA DE NEGOCIAÇÃO · {neg.tipo === "vender" ? "VENDA" : "COMPRA"}</span>
          <p className="fr-intro" data-curta="true">Só desta transação. No Teste de Interação, troque dados com ela como na Reserva de Confiança: toque no dado que saiu e escolha o que entrou.</p>
          {gemas(neg.dados, editNeg, j => setEditNeg(editNeg === j ? null : j), j => `Dado ${j + 1} da Reserva de Negociação`, "folha")}
          {escolhaNeg(neg)}
          <span className="fr-rotulo-sec">COMO FOI O TESTE?</span>
          <div className="fr-resultados" role="radiogroup" aria-label="Resultado da negociação">
            {RESULTADOS.map(([id, nome]) => <button key={id} type="button" role="radio" className="fr-opcao" data-falha={id === "falha" || undefined} aria-checked={resultadoNeg === id} disabled={locked} onClick={() => setResultadoNeg(id)}>{nome}</button>)}
          </div>
          {neg.tipo === "vender" && <label className="fr-campo" data-valor="true">VALOR JUSTO DO LOTE · Ⱥ<input type="text" inputMode="numeric" disabled={locked} placeholder="Valor justo, em aretz" value={valorNeg} onChange={e => setValorNeg(e.target.value.replace(/\D/g, ""))} /></label>}
          {textoNeg && <p className="fr-texto-resultado" data-falha={resultadoNeg === "falha" || undefined}>{textoNeg}</p>}
          <div className="fr-fim">
            <button type="button" className="fr-link" data-tom="neutro" disabled={locked} onClick={() => { setResultadoNeg(null); setValorNeg(""); setEditNeg(null); enviar({ type: "negociacao", op: "desistir" }); }}>DESISTIR DA NEGOCIAÇÃO</button>
            <button type="button" className="fr-primario" disabled={locked || !podeConcluir} onClick={concluirNeg}>{neg.tipo === "vender" ? "CONCLUIR VENDA" : "CONCLUIR COMPRA"}</button>
          </div>
        </> : <>
          <p className="fr-intro">Procure um fornecedor ou um comprador com seus contatos. Cada hora dedicada rola 1d8 para uma Reserva de Negociação só desta transação.</p>
          <span className="fr-rotulo-sec">O QUE VAI NEGOCIAR</span>
          {tiposNeg}
          <span className="fr-rotulo-sec">HORAS COM SEUS CONTATOS</span>
          <div className="fr-horas">{horasNeg}<small>{notaHoras}</small></div>
          <button type="button" className="fr-primario" data-rolar="true" disabled={locked} onClick={abrirNeg}>{rolarTexto}</button>
        </>}
      </div>
    </Painel>}
    </div>
    </div>
  </section>;
}
