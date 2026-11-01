"use client";

/**
 * COMPOSER — a barra de escrita, fixa no rodapé interno do Chat e
 * SEMPRE inteiramente visível.
 *
 * Padrão visual do Console: superfície técnica escura, borda ciano só
 * ao focar, botão de envio QUADRADO (não uma bolha), e a linha de
 * autoria/visibilidade como CHIPS — `FALAR COMO: MARA VENN` e
 * `VISIBILIDADE: TODOS` — cada um abrindo um menu compacto ancorado,
 * nunca um `<select>` nativo.
 *
 * A textarea cresce até ~4 linhas e então rola por dentro; o composer
 * não muda de altura além disso, que é o que garante o feed nunca ser
 * empurrado para fora do viewport.
 *
 * Enter envia, Shift+Enter quebra linha, Seta-pra-cima recupera a
 * última mensagem enviada SÓ com o campo vazio (para não brigar com a
 * edição normal).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Dices, Eye, ImagePlus, Loader2, Lock, Radio, ShieldAlert, Sparkles, User, X, Zap } from "lucide-react";

/**
 * Seta de enviar — exportada do Figma (Button - Enviar, nó 467:5993),
 * não o `Send` do lucide: o desenho é a mesma geometria, mas PREENCHIDA,
 * e o lucide só tem a versão de contorno. Desenhada inline (e não pela
 * URL do asset) porque os links do Figma expiram em ~7 dias.
 * `currentColor` deixa o estado (normal/desabilitado) morar no CSS.
 */
function SetaEnviar() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.1665 1.778C2.11404 1.75239 2.05507 1.74318 1.9973 1.75157C1.93952 1.75997 1.88562 1.78557 1.84261 1.82505C1.7996 1.86454 1.76949 1.91606 1.75619 1.97291C1.7429 2.02976 1.74704 2.08929 1.76808 2.14375L3.4265 6.59283C3.52431 6.85547 3.52431 7.14453 3.4265 7.40717L1.76867 11.8563C1.74773 11.9106 1.74364 11.9701 1.75693 12.0268C1.77022 12.0836 1.80026 12.135 1.84317 12.1745C1.88607 12.2139 1.93985 12.2395 1.99751 12.248C2.05518 12.2565 2.11406 12.2474 2.1665 12.222L12.6665 7.26367C12.7164 7.24005 12.7587 7.20272 12.7882 7.15604C12.8178 7.10937 12.8335 7.05525 12.8335 7C12.8335 6.94475 12.8178 6.89064 12.7882 6.84396C12.7587 6.79728 12.7164 6.75996 12.6665 6.73633L2.1665 1.778Z"
        fill="currentColor"
      />
    </svg>
  );
}
import { MenuAncorado, type ItemMenu } from "../ui/MenuAncorado";
import type { TableLogVisibility } from "../../../../../../lib/table";
import type { FichaRolagem } from "../acoes/rolagemPainel";
import { lerComandoPericia, normalizarComando, type PericiaComando } from "./comandoPericia";
import { lerComandoConteudo, type OpcaoComando } from "./comandoConteudo";
import { ATTR_ICONS } from "../../../../../ficha/_console/attrIcons";
import { IconeVertente } from "../../../../../_design/IconeVertente";
import { iconeDaAcao } from "../../../../../ficha/_console/panels/iconeAcao";
import { completarIdentidadeComando } from "./identidadeComando";
import { etapaPendente } from "./etapasComando";
import { lerComandoSobrecarga } from "./comandoSobrecarga";
import { ABAS_COMANDO_FICHA, lerComandoFicha } from "./comandoFicha";
import { ABAS, type AbaId } from "../../../../../ficha/_console/tabs";
import { SURTOS_SOBRECARGA } from "../../../../../../lib/rulesetV12/ruptura";

type SugestaoComando = { id: string; rotulo: string; detalhe: string; completar: string; tipo?: "s" | "f"; aba?: AbaId; marca?: string; acento?: string; custo?: { pa?: string; mana?: string; extra?: string }; identidade?: OpcaoComando["identidade"] | { familia: "p"; atributo: string }; valorPericia?: number; ajuda?: string };
const COR_ATRIBUTO: Record<string, string> = { corpo: "#11d43b", mente: "#7e50f1", animo: "#00d4ff" };
const COR_CENA: Record<string, string> = { combate: "#ff8a1f", investigacao: "#c578d9", trama: "#00d4ff" };
const COR_GRUPO: Record<string, string> = {
  movimento: "#4d9fff", ofensiva: "#ff5a4e", defensiva: "#3ddc97", postura: "#ffd23f", diversa: "#a3b1c2", livre: "#7ee8fa",
  investigacao: "#c578d9", comando: "#00d4ff", protocolo_ofensiva: "#6ff0ff", protocolo_trilha: "#2aa8c4",
};
const COR_VERTENTE: Record<string, string> = {
  cinetica: "#e0455f", energetica: "#f07a1f", material: "#f5a200", biotica: "#3ccf6e", sinaptica: "#35c7d8", cognitiva: "#8b5cf6",
};
const rotuloAtributo = (id: string) => normalizarComando(id) === "animo" ? "ÂNIMO" : id.toLocaleUpperCase("pt-BR");
function identidadeDe(o: OpcaoComando): Pick<SugestaoComando, "acento" | "marca"> {
  if (o.identidade?.familia === "a") return { acento: COR_GRUPO[o.identidade.grupo] ?? COR_CENA[o.identidade.cena] ?? "#ff8a1f", marca: o.identidade.grupo.slice(0, 3).toUpperCase() };
  if (o.identidade?.familia === "m") return { acento: COR_VERTENTE[o.identidade.vertente] ?? "#35c7d8", marca: o.identidade.vertente.slice(0, 3).toUpperCase() };
  return { acento: "#35c7d8", marca: "•" };
}
function iconeSugestao(s: SugestaoComando) {
  if (s.tipo === "s") return <Zap size={17} strokeWidth={1.7} />;
  if (s.tipo === "f") { const Icone = ABAS.find((a) => a.id === s.aba)?.Icon ?? User; return <Icone size={17} strokeWidth={1.7} />; }
  if (s.identidade?.familia === "p") {
    const Icone = ATTR_ICONS[s.identidade.atributo as keyof typeof ATTR_ICONS];
    return Icone ? <Icone /> : <Dices size={15} />;
  }
  if (s.identidade?.familia === "m") return <IconeVertente vertente={s.identidade.vertente} tam={17} cor={s.acento ?? "#35c7d8"} />;
  if (s.identidade?.familia === "a") {
    const Icone = iconeDaAcao(s.identidade.slug ?? s.id.split(":").at(-1) ?? "", s.identidade.classe);
    return <Icone size={17} strokeWidth={1.6} />;
  }
  return s.marca ?? <Sparkles size={15} />;
}
function custoDaEscolha(o: OpcaoComando, argumento: string): SugestaoComando["custo"] {
  const chave = Object.keys(o.custosPorComplemento ?? {}).find((k) => normalizarComando(k) === normalizarComando(argumento));
  return chave ? { ...o.custo, ...o.custosPorComplemento?.[chave] } : o.custo;
}
function parteDoCusto(texto: string, recurso: "pa" | "mana" | "extra") {
  if (texto === "PA —") return { valor: "—", unidade: "PA" };
  if (texto === "Mana variável") return { valor: "VAR.", unidade: "MANA" };
  const m = /^(.+?)\s+(PA|Mana|Reação|RAM|Sobrecarga)$/i.exec(texto);
  return m ? { valor: m[1], unidade: m[2].toUpperCase() } : { valor: texto, unidade: recurso === "extra" ? "" : recurso.toUpperCase() };
}

export interface IdentidadeComposer {
  /** `null` = falar como Narrador (narrador) ou como a própria conta (jogador). */
  characterId: string | null;
  nome: string;
  modo: "personagem" | "narrador" | "conta";
}

export function Composer({
  papel,
  identidade,
  identidadesDisponiveis,
  escolhaIdentidade,
  onEscolherIdentidade,
  visibilidade,
  onEscolherVisibilidade,
  texto,
  onTexto,
  enviando,
  erro,
  onEnviar,
  onLimparErro,
  ultimaEnviada,
  anexo = null,
  onAnexar,
  onRemoverAnexo,
  pericias = [], acoes = [], magias = [], fichaPericias = null, carregandoFicha = false,
}: {
  papel: "narrator" | "player";
  identidade: IdentidadeComposer;
  identidadesDisponiveis: readonly { id: string; nome: string }[];
  /** `null` = automático; `"narrador"`/`"conta"` = sem personagem; senão, characterId. */
  escolhaIdentidade: string | null;
  onEscolherIdentidade: (v: string | null) => void;
  visibilidade: TableLogVisibility;
  onEscolherVisibilidade: (v: TableLogVisibility) => void;
  texto: string;
  onTexto: (v: string) => void;
  enviando: boolean;
  erro: string | null;
  onEnviar: () => void;
  onLimparErro: () => void;
  ultimaEnviada: string | null;
  /** Imagem anexada, ainda local — sobe só no envio. */
  anexo?: { arquivo: File; previewUrl: string } | null;
  /** Abre o modal de envio; com arquivo (colado), já no enquadramento. */
  onAnexar?: (arquivo?: File) => void;
  onRemoverAnexo?: () => void;
  pericias?: readonly PericiaComando[];
  acoes?: readonly OpcaoComando[];
  magias?: readonly OpcaoComando[];
  fichaPericias?: FichaRolagem | null;
  carregandoFicha?: boolean;
}) {
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const sugestoesRef = useRef<HTMLDivElement>(null);
  const btnAutoriaRef = useRef<HTMLButtonElement>(null);
  const btnVisRef = useRef<HTMLButtonElement>(null);
  const [menuAutoria, setMenuAutoria] = useState(false);
  const [menuVis, setMenuVis] = useState(false);
  const [sugestaoAtiva, setSugestaoAtiva] = useState(0);
  const [sugestaoNavegada, setSugestaoNavegada] = useState(false);
  const [sugestoesFechadas, setSugestoesFechadas] = useState(false);
  const [campoFocado, setCampoFocado] = useState(false);

  const entradaNormalizada = normalizarComando(texto.trimStart());
  const leituraPericia = lerComandoPericia(texto, pericias);
  const leituraSobrecarga = lerComandoSobrecarga(texto);
  const leituraFicha = lerComandoFicha(texto);
  const acoesVisuais = useMemo(() => acoes.map((o) => completarIdentidadeComando(o, "a")), [acoes]);
  const magiasVisuais = useMemo(() => magias.map((o) => completarIdentidadeComando(o, "m")), [magias]);
  const leituraConteudo = lerComandoConteudo(texto, acoesVisuais, magiasVisuais);
  const opcaoCompleta = leituraConteudo.tipo === "ok" ? (leituraConteudo.familia === "a" ? acoesVisuais : magiasVisuais).find((o) => o.id === leituraConteudo.id) : null;
  const etapaMagia = leituraConteudo.tipo === "ok" && leituraConteudo.familia === "m" && opcaoCompleta
    ? etapaPendente(opcaoCompleta, leituraConteudo.argumento) : null;
  const familia = /^\/(p|a|m|r|s|f)(?:\s|$)/.exec(entradaNormalizada)?.[1] ?? null;
  const busca = familia ? entradaNormalizada.slice(2).trim().replace(/^sobrecarga\s+/, "") : "";
  const naRaiz = entradaNormalizada.startsWith("/") && !familia && !entradaNormalizada.slice(1).includes(" ");
  const raizBusca = naRaiz ? entradaNormalizada.slice(1) : "";
  const familias: SugestaoComando[] = [
    { id: "familia-p", rotulo: "/p", detalhe: "PERÍCIAS", completar: "/p ", marca: "P", acento: "#00d4ff" },
    { id: "familia-a", rotulo: "/a", detalhe: "AÇÕES", completar: "/a ", marca: "A", acento: "#ff8a1f" },
    { id: "familia-m", rotulo: "/m", detalhe: "MAGIAS", completar: "/m ", marca: "M", acento: "#8b5cf6" },
    { id: "familia-r", rotulo: "/r", detalhe: "ROLAR DADOS", completar: "/r ", marca: "R", acento: "#35c7d8" },
    { id: "familia-s", rotulo: "/s", detalhe: "SOBRECARGA", completar: "/s ", marca: "S", acento: "#ff8a1f" },
    { id: "familia-f", rotulo: "/f", detalhe: "ABRIR FICHA", completar: "/f", marca: "F", acento: "#35c7d8" },
  ];
  const periciasFiltradas = leituraPericia.tipo === "ok" ? [] : familia === "p" && busca
    ? pericias.filter((p) => normalizarComando(p.nome).includes(busca) || normalizarComando(p.id).includes(busca))
    : familia === "p" ? pericias : [];
  const periciaSelecionada = leituraPericia.tipo === "ok" ? pericias.find((p) => p.id === leituraPericia.comando.periciaId) : null;
  const fichaPericiaSelecionada = leituraPericia.tipo === "ok" ? fichaPericias?.pericias.find((p) => p.id === leituraPericia.comando.periciaId) : null;
  const atributoPrincipal = fichaPericiaSelecionada?.atributoPrimario || periciaSelecionada?.atributoPrimario || "";
  const alternativos = fichaPericiaSelecionada?.atributosAlternativos ?? periciaSelecionada?.atributosAlternativos ?? [];
  const atributosSugeridos = [...new Set([atributoPrincipal, ...alternativos.map((a) => a.atributo), "corpo", "mente", "animo"]
    .filter(Boolean).map((a) => normalizarComando(a)))].map((a) => a === "animo" ? "ânimo" : a);
  const argumentos = leituraPericia.tipo === "ok" && texto.endsWith(" ")
    ? [...atributosSugeridos, "+", "-", "cd"].filter((s) => {
        const c = leituraPericia.comando;
        if (["corpo", "mente", "ânimo"].includes(s)) return !c.atributoId;
        if (s.startsWith("cd")) return c.cd === null;
        return c.modificador === 0;
      })
    : [];
  const sugerirComplementos = leituraConteudo.tipo === "ok" && opcaoCompleta && !etapaMagia && (texto.endsWith(" ") || leituraConteudo.argumento.length > 0);
  const opcoesEtapa = etapaMagia?.etapa.opcoes.filter((o) => !etapaMagia.busca || normalizarComando(o.codigo).includes(etapaMagia.busca) || normalizarComando(o.nome).includes(etapaMagia.busca)) ?? [];
  const sugestoes: SugestaoComando[] = [
    ...(naRaiz ? familias.filter((f) => f.rotulo.slice(1).startsWith(raizBusca)) : []),
    ...(familia === "f" ? ABAS_COMANDO_FICHA.filter((a) => !busca || normalizarComando(a.label).includes(busca) || normalizarComando(a.id).includes(busca))
      .map((a) => ({ id: `ficha-${a.id}`, rotulo: a.label, detalhe: a.id === "personagem" ? "VISÃO PRINCIPAL" : "ABA DA FICHA",
        completar: a.id === "personagem" ? "/f" : `/f ${a.label.toLocaleLowerCase("pt-BR")}`, tipo: "f" as const, aba: a.id, acento: "#35c7d8" })) : []),
    ...(familia === "s" && leituraSobrecarga.tipo !== "erro" ? SURTOS_SOBRECARGA
      .filter((s) => !busca || busca === "sobrecarga" || normalizarComando(s.nome).includes(busca))
      .flatMap((s) => Array.from({ length: s.custo.max - s.custo.min + 1 }, (_, i) => {
        const pontos = s.custo.min + i;
        return { id: `surto-${s.nome}-${pontos}`, rotulo: s.custo.max > 1 ? `${s.nome} · ${pontos}` : s.nome,
          detalhe: s.efeito, completar: `/s ${s.nome.replace(/^Surto de /, "").toLocaleLowerCase("pt-BR")}${s.custo.max > 1 ? ` ${pontos}` : ""}`,
          tipo: "s" as const, marca: "S", acento: "#ff8a1f", custo: { extra: `${pontos} Sobrecarga` } };
      })) : []),
    ...periciasFiltradas.map((p) => {
      const f = fichaPericias?.pericias.find((x) => x.id === p.id);
      const atributo = f?.atributoPrimario || p.atributoPrimario || "";
      const alternativosDaPericia = f?.atributosAlternativos ?? p.atributosAlternativos ?? [];
      return { id: `p-${p.id}`, rotulo: p.nome,
        detalhe: `${atributo ? rotuloAtributo(atributo) : "PERÍCIA"}${alternativosDaPericia.length ? ` · ALT. ${alternativosDaPericia.map((a) => rotuloAtributo(a.atributo)).join(" / ")}` : ""}`,
        ajuda: alternativosDaPericia.map((a) => `${rotuloAtributo(a.atributo)}: ${a.contexto}`).join("\n") || undefined,
        valorPericia: f?.valor,
        completar: `/p ${p.nome} `, marca: atributo.slice(0, 3).toUpperCase() || "P", acento: COR_ATRIBUTO[atributo] ?? "#35c7d8", identidade: { familia: "p" as const, atributo } };
    }),
    ...((familia === "a" || familia === "m") && !sugerirComplementos && leituraConteudo.tipo !== "ok" ? (familia === "a" ? acoesVisuais : magiasVisuais)
      .filter((o) => !busca || normalizarComando(o.nome).includes(busca) || normalizarComando(o.id).includes(busca))
      .map((o) => ({ id: `${familia}-${o.id}`, rotulo: o.nome, detalhe: o.detalhe,
        completar: `/${familia} ${(familia === "a" ? acoesVisuais : magiasVisuais).filter((x) => normalizarComando(x.nome) === normalizarComando(o.nome)).length > 1 ? o.id : o.nome}`,
        custo: o.custo, identidade: o.identidade, ...identidadeDe(o) })) : []),
    ...(etapaMagia && opcaoCompleta ? (opcoesEtapa.length ? opcoesEtapa : etapaMagia.etapa.opcoes)
      .map((o) => ({ id: `etapa-${o.codigo}`, rotulo: o.nome, detalhe: o.detalhe ?? etapaMagia.etapa.rotulo,
        completar: `/m ${opcaoCompleta.nome} ${[...etapaMagia.anteriores, o.codigo].join(" ")}${(opcaoCompleta.etapas?.length ?? 0) > etapaMagia.anteriores.length + 1 ? " " : ""}`,
        custo: { ...opcaoCompleta.custo, ...o.custo }, identidade: opcaoCompleta.identidade, ...identidadeDe(opcaoCompleta) })) : []),
    ...(sugerirComplementos && leituraConteudo.tipo === "ok" ? (opcaoCompleta.complementos ?? [])
      .filter((c) => !leituraConteudo.argumento || normalizarComando(c).startsWith(normalizarComando(leituraConteudo.argumento)))
      .map((c) => ({ id: `complemento-${c}`, rotulo: c, detalhe: leituraConteudo.familia === "a" ? "FORMA OU PERÍCIA" : "ESCOLHA DE MAGIA",
        completar: `/${leituraConteudo.familia} ${opcaoCompleta.nome} ${c}`, custo: custoDaEscolha(opcaoCompleta, c), identidade: opcaoCompleta.identidade, ...identidadeDe(opcaoCompleta) })) : []),
    ...argumentos.map((a) => ({ id: `arg-${a}`, rotulo: a === "cd" ? "CD …" : a === "+" ? "+ …" : a === "-" ? "− …" : a,
      detalhe: a === "cd" ? "DIFICULDADE" : a === "+" ? "BÔNUS" : a === "-" ? "PENALIDADE"
        : normalizarComando(a) === normalizarComando(atributoPrincipal) ? "ATRIBUTO PRINCIPAL"
        : alternativos.some((alt) => normalizarComando(alt.atributo) === normalizarComando(a)) ? "ATRIBUTO ALTERNATIVO" : "OUTRO ATRIBUTO",
      ajuda: alternativos.find((alt) => normalizarComando(alt.atributo) === normalizarComando(a))?.contexto,
      completar: `${texto}${a}${a === "cd" ? " " : ""}`,
      marca: a === "cd" ? "CD" : a.startsWith("+") || a.startsWith("-") ? "±" : a.slice(0, 3).toUpperCase(), acento: COR_ATRIBUTO[normalizarComando(a)] ?? "#35c7d8" })),
  ];
  const mostrarSugestoes = campoFocado && !sugestoesFechadas && !anexo && entradaNormalizada.startsWith("/") && sugestoes.length > 0;
  const periciaPrevia = leituraPericia.tipo === "ok" ? fichaPericias?.pericias.find((p) => p.id === leituraPericia.comando.periciaId) : null;
  const atributoPadrao = leituraPericia.tipo === "ok" ? periciaPrevia?.atributoPrimario ?? pericias.find((p) => p.id === leituraPericia.comando.periciaId)?.atributoPrimario : null;
  const atributoPrevia = leituraPericia.tipo === "ok" ? leituraPericia.comando.atributoId ?? atributoPadrao : null;
  const mostrarPainel = campoFocado && !sugestoesFechadas && !anexo && (mostrarSugestoes || leituraPericia.tipo === "ok" || leituraConteudo.tipo === "ok");
  const escolherSugestao = (indice: number) => {
    const escolhida = sugestoes[indice];
    if (!escolhida) return;
    onTexto(escolhida.completar);
    setSugestaoAtiva(0);
    setSugestaoNavegada(false);
    campoRef.current?.focus();
  };
  useEffect(() => {
    if (!mostrarSugestoes) return;
    const lista = sugestoesRef.current;
    const item = lista?.querySelector<HTMLElement>(`#pn-sugestao-${sugestaoAtiva}`);
    if (!lista || !item) return;
    const acima = item.offsetTop - lista.scrollTop;
    if (acima < 0) lista.scrollTop = item.offsetTop;
    else if (acima + item.offsetHeight > lista.clientHeight) lista.scrollTop = item.offsetTop + item.offsetHeight - lista.clientHeight;
  }, [mostrarSugestoes, sugestaoAtiva]);

  // Autoexpansão até o teto do CSS (~4 linhas); depois disso rola por
  // dentro. Medir antes da pintura evita o "pulo" de um frame.
  useLayoutEffect(() => {
    const el = campoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [texto]);

  const aoTeclar = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape" && mostrarSugestoes) { e.preventDefault(); setSugestoesFechadas(true); return; }
      if (mostrarSugestoes && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        setSugestaoAtiva((n) => (n + (e.key === "ArrowDown" ? 1 : -1) + sugestoes.length) % sugestoes.length);
        setSugestaoNavegada(true);
        return;
      }
      if (e.key === "Tab" && mostrarSugestoes && sugestoes[sugestaoAtiva]) {
        e.preventDefault();
        escolherSugestao(sugestaoAtiva);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (etapaMagia) { if (mostrarSugestoes && sugestoes[sugestaoAtiva]) escolherSugestao(sugestaoAtiva); return; }
        if (mostrarSugestoes && (leituraSobrecarga.tipo === "parcial" || leituraFicha.tipo === "parcial" || leituraFicha.tipo !== "ok" && leituraSobrecarga.tipo !== "ok" && leituraPericia.tipo !== "ok" && leituraConteudo.tipo !== "ok" || sugestaoNavegada) && sugestoes[sugestaoAtiva]) { escolherSugestao(sugestaoAtiva); return; }
        onEnviar();
        return;
      }
      if (e.key === "ArrowUp" && texto === "" && ultimaEnviada) {
        e.preventDefault();
        onTexto(ultimaEnviada);
      }
    },
    [onEnviar, texto, ultimaEnviada, onTexto, mostrarSugestoes, etapaMagia, leituraSobrecarga.tipo, leituraFicha.tipo, leituraPericia.tipo, leituraConteudo.tipo, sugestoes, sugestaoAtiva, sugestaoNavegada],
  );

  useEffect(() => {
    if (erro && texto === "") onLimparErro();
  }, [erro, texto, onLimparErro]);

  const itensAutoria: ItemMenu[] = [
    {
      id: "__auto__",
      rotulo: `Automático (${identidade.nome})`,
      descricao: "Segue o token selecionado no mapa quando ele tem um personagem que você controla.",
      selecionado: escolhaIdentidade === null,
      onSelecionar: () => onEscolherIdentidade(null),
      grupoAntes: "Falar como",
    },
    ...(papel === "narrator"
      ? [
          {
            id: "narrador",
            rotulo: "Narrador",
            icone: <Radio size={13} />,
            selecionado: escolhaIdentidade === "narrador",
            onSelecionar: () => onEscolherIdentidade("narrador"),
          } satisfies ItemMenu,
        ]
      : [
          {
            id: "conta",
            rotulo: identidade.modo === "conta" ? identidade.nome : "Minha conta",
            icone: <User size={13} />,
            selecionado: escolhaIdentidade === "conta",
            onSelecionar: () => onEscolherIdentidade("conta"),
          } satisfies ItemMenu,
        ]),
    ...identidadesDisponiveis.map((p, i) => ({
      id: p.id,
      rotulo: p.nome,
      selecionado: escolhaIdentidade === p.id,
      onSelecionar: () => onEscolherIdentidade(p.id),
      ...(i === 0 ? { grupoAntes: "Personagens" } : {}),
    })),
  ];

  /** `private` é autor + narrador — nunca "só eu". */
  const ROTULO_VIS: Record<TableLogVisibility, string> = {
    public: "Todos",
    private: papel === "player" ? "Somente Narrador" : "Reservada",
    gm: "Narrador",
  };
  const itensVis: ItemMenu[] = (papel === "narrator" ? (["public", "gm", "private"] as const) : (["public", "private"] as const)).map(
    (v, i) => ({
      id: v,
      rotulo: ROTULO_VIS[v],
      icone: v === "public" ? <Eye size={13} /> : v === "gm" ? <ShieldAlert size={13} /> : <Lock size={13} />,
      descricao:
        v === "public"
          ? "Todo mundo na mesa vê."
          : v === "gm"
            ? "Só o Narrador vê."
            : papel === "player"
              ? "Só você e o Narrador veem."
              : "Só você vê.",
      selecionado: visibilidade === v,
      onSelecionar: () => onEscolherVisibilidade(v),
      ...(i === 0 ? { grupoAntes: "Visibilidade" } : {}),
    }),
  );

  const podeEnviar = (texto.trim().length > 0 || !!anexo) && !enviando && !etapaMagia && leituraSobrecarga.tipo !== "parcial";

  return (
    <form
      className="pn-composer"
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar();
      }}
      data-testid="painel-composer"
    >
      <div className="pn-composer-chips">
        <button
          ref={btnAutoriaRef}
          type="button"
          className="pn-chipbtn"
          data-acento={identidade.modo === "personagem" ? "cy" : identidade.modo === "narrador" ? "am" : "neutro"}
          aria-haspopup="menu"
          aria-expanded={menuAutoria}
          onClick={() => setMenuAutoria((v) => !v)}
          data-testid="painel-composer-autoria"
        >
          Falar como
          <span className="pn-chipbtn-val">{identidade.nome}</span>
          <ChevronDown aria-hidden="true" />
        </button>

        <button
          ref={btnVisRef}
          type="button"
          className="pn-chipbtn"
          data-acento={visibilidade === "public" ? "neutro" : visibilidade === "gm" ? "am" : "cy"}
          aria-haspopup="menu"
          aria-expanded={menuVis}
          onClick={() => setMenuVis((v) => !v)}
          data-testid="painel-composer-visibilidade"
        >
          {visibilidade === "public" ? <Eye aria-hidden="true" /> : visibilidade === "gm" ? <ShieldAlert aria-hidden="true" /> : <Lock aria-hidden="true" />}
          <span className="pn-chipbtn-val">{ROTULO_VIS[visibilidade]}</span>
          <ChevronDown aria-hidden="true" />
        </button>

        {onAnexar && (
          <>
            {/* Mesmo chip dos outros dois, só com ícone. O nome vai em
                texto escondido, não em `aria-label`: com `aria-label` +
                svg a regra global o trata como botão de ícone e tira o
                chanfro que os chips vizinhos têm. */}
            <button
              type="button"
              className="pn-chipbtn pn-chipbtn--icone"
              data-acento="neutro"
              onClick={() => onAnexar()}
              title="Anexar imagem"
              disabled={enviando}
              data-testid="painel-chat-anexar"
            >
              <ImagePlus aria-hidden="true" />
              <span className="rv-sr-only">Anexar imagem</span>
            </button>
          </>
        )}

      </div>

      {erro && (
        <p className="rv-pn-estado rv-pn-estado--erro" role="alert" style={{ margin: 0 }} data-testid="painel-composer-erro">
          <span className="rv-pn-estado-texto">{erro}</span>
          <button type="button" className="rv-pn-retry" onClick={onEnviar}>
            Tentar de novo
          </button>
        </p>
      )}

      {anexo && (
        <div className="pn-composer-anexo" data-testid="painel-composer-anexo">
          <img className="pn-composer-anexo-img" src={anexo.previewUrl} alt="" />
          <span className="pn-composer-anexo-nome" title={anexo.arquivo.name}>{anexo.arquivo.name}</span>
          <button
            type="button"
            className="pn-composer-anexo-remover"
            onClick={onRemoverAnexo}
            aria-label="Remover imagem"
            disabled={enviando}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="pn-composer-linha">
        <div className="pn-composer-campo">
          <label className="rv-sr-only" htmlFor="pn-composer-input">
            Mensagem para a mesa
          </label>
          <textarea
            id="pn-composer-input"
            ref={campoRef}
            className="pn-composer-input"
            rows={1}
            value={texto}
            onChange={(e) => { onTexto(e.target.value); setSugestoesFechadas(false); setSugestaoAtiva(0); setSugestaoNavegada(false); }}
            onKeyDown={aoTeclar}
            onFocus={() => setCampoFocado(true)}
            onBlur={() => setCampoFocado(false)}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={mostrarSugestoes}
            aria-controls={mostrarSugestoes ? "pn-composer-sugestoes" : undefined}
            aria-activedescendant={mostrarSugestoes ? `pn-sugestao-${sugestaoAtiva}` : undefined}
            onPaste={onAnexar ? (e) => {
              // Colar uma imagem (print, cópia do navegador) anexa em vez de colar texto.
              const arquivo = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
              if (!arquivo) return;
              e.preventDefault();
              onAnexar(arquivo);
            } : undefined}
            placeholder={anexo ? "Legenda (opcional)…" : "Mensagem ou /p, /a, /m, /r, /s, /f…"}
            data-testid="painel-chat-input"
          />
        </div>
        <button
          type="submit"
          className="pn-composer-enviar"
          disabled={!podeEnviar}
          aria-label="Enviar mensagem"
          aria-busy={enviando || undefined}
          data-testid="painel-chat-enviar"
        >
          {enviando ? <Loader2 size={14} className="rv-spin" /> : <SetaEnviar />}
        </button>
      </div>

      {mostrarPainel && (
        <div ref={sugestoesRef} className="pn-comando-sugestoes" data-testid="painel-chat-sugestoes">
          <div className="pn-comando-cab"><span className="pn-comando-cab-titulo">{etapaMagia?.etapa.rotulo ?? (argumentos.length ? "COMPLETAR ROLAGEM" : familia === "p" ? "PERÍCIAS" : familia === "a" ? "AÇÕES" : familia === "m" ? "MAGIAS" : familia === "s" ? "SURTOS DE SOBRECARGA" : familia === "f" ? "ABRIR FICHA" : "COMANDOS")}</span><span>↑↓ NAVEGAR · TAB ESCOLHER · ESC FECHAR</span></div>
          {sugestoes.length > 0 && <div id="pn-composer-sugestoes" role="listbox" aria-label="Sugestões de comando">
            {sugestoes.map((s, i) => (
              <button key={s.id} id={`pn-sugestao-${i}`} type="button" role="option" aria-selected={i === sugestaoAtiva}
                className="pn-comando-opcao" data-ativo={i === sugestaoAtiva || undefined} data-tipo={s.tipo ?? s.identidade?.familia} title={s.ajuda} style={{ ["--pn-item-accent" as string]: s.acento ?? "#35c7d8" }}
                onMouseDown={(e) => e.preventDefault()} onClick={() => escolherSugestao(i)}>
                <span className="pn-comando-opcao-marca" aria-hidden="true">{iconeSugestao(s)}</span>
                <span className="pn-comando-opcao-info"><span className="pn-comando-opcao-nome">{s.rotulo}</span><span className="pn-comando-opcao-detalhe">{s.detalhe}</span></span>
                {s.valorPericia !== undefined && <span className="pn-comando-opcao-valor-pericia" aria-label={`Valor da perícia: ${s.valorPericia}`}><b>{s.valorPericia}</b><small>PERÍCIA</small></span>}
                {(s.custo?.pa || s.custo?.mana || s.custo?.extra) && <span className="pn-comando-opcao-custos" aria-label={[s.custo.pa, s.custo.mana, s.custo.extra].filter(Boolean).join(", ")}>
                  {(["mana", "pa", "extra"] as const).map((recurso) => {
                    const valor = s.custo?.[recurso];
                    if (!valor) return null;
                    const parte = parteDoCusto(valor, recurso);
                    return <span key={recurso} className="pn-comando-opcao-custo" data-recurso={recurso}><b>{parte.valor}</b><small>{parte.unidade}</small></span>;
                  })}
                </span>}
              </button>
            ))}
          </div>}
          {carregandoFicha && <div className="pn-comando-status">Carregando ficha…</div>}
          {!carregandoFicha && !identidade.characterId && leituraPericia.tipo === "ok" && <div className="pn-comando-status">Escolha um personagem em Falar como para rolar.</div>}
          {leituraPericia.tipo === "ok" && (
            <div className="pn-comando-previa" role="status">
              <span>ROLAGEM</span><strong>{periciaPrevia?.nome ?? pericias.find((p) => p.id === leituraPericia.comando.periciaId)?.nome ?? "Perícia"}</strong>
              <em>{atributoPrevia ? rotuloAtributo(atributoPrevia) : "ATRIBUTO"}</em><em>{leituraPericia.comando.modificador >= 0 ? "+" : ""}{leituraPericia.comando.modificador}</em><em>{leituraPericia.comando.cd == null ? "SEM CD" : `CD ${leituraPericia.comando.cd}`}</em>
            </div>
          )}
          {leituraConteudo.tipo === "ok" && opcaoCompleta && (
            <div className="pn-comando-previa" role="status">
              <span>{leituraConteudo.familia === "a" ? "AÇÃO" : "MAGIA"}</span><strong>{opcaoCompleta.nome}</strong>
              <em>{custoDaEscolha(opcaoCompleta, leituraConteudo.argumento)?.pa ?? "PA —"}</em>
              {custoDaEscolha(opcaoCompleta, leituraConteudo.argumento)?.mana && <em>{custoDaEscolha(opcaoCompleta, leituraConteudo.argumento)?.mana}</em>}
              {custoDaEscolha(opcaoCompleta, leituraConteudo.argumento)?.extra && <em>{custoDaEscolha(opcaoCompleta, leituraConteudo.argumento)?.extra}</em>}
            </div>
          )}
        </div>
      )}

      <MenuAncorado
        ancora={btnAutoriaRef.current}
        aberto={menuAutoria}
        onFechar={() => setMenuAutoria(false)}
        itens={itensAutoria}
        rotulo="Falar como"
        testId="painel-composer-menu-autoria"
      />
      <MenuAncorado
        ancora={btnVisRef.current}
        aberto={menuVis}
        onFechar={() => setMenuVis(false)}
        itens={itensVis}
        rotulo="Visibilidade"
        testId="painel-composer-menu-visibilidade"
      />
    </form>
  );
}
