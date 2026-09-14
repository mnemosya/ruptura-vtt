"use client";

/**
 * REPETIDOS — a mesma peça, resolvida N vezes.
 *
 * O produto tem SEIS vocabulários rodando em paralelo, cada um com
 * prefixo e folha próprios: `rv-` (VTT/chassi/auth), `rc-` (Console),
 * `rm-` (Mesa), `ra-`/`ra2-` (App) e `pn-` (painel do VTT). Nenhum
 * deles é errado sozinho — o problema é que ninguém vê os quatro ao
 * mesmo tempo, e por isso a quinta versão do botão sempre parece
 * razoável na hora de escrever.
 *
 * Estas abas existem pra mostrar as variantes LADO A LADO, com a folha
 * de produção de cada uma. Não é proposta de unificação: é o retrato
 * que deixa decidir o que unificar primeiro.
 *
 * DUAS FORMAS DE MONTAR, e o motivo importa:
 *
 *   · `rv-`/`pn-`/`rc-` desenham direto, porque as folhas deles já
 *     estão na galeria e são escopadas por raiz (`.rv-mesa`,
 *     `.rv-painel`, `.rc-console`).
 *   · `rm-`, `ra-` e as de autenticação vão em IFRAME, cada uma numa
 *     rota que carrega só a folha dela (`especime/*`).
 *
 * O iframe não é capricho: uma tentativa anterior importou `mesa.css`,
 * `app.css` e `auth.css` na mesma página, e a galeria inteira desmontou
 * — `.rv-seg-btn` é `flex: 1`, `.auth-submit-btn` é `width: 100%`, e
 * auth.css ancora decoração em `position: fixed`. Essas folhas não são
 * bibliotecas de componente: são donas de página. Pôr quatro donas no
 * mesmo documento não compara nada, só quebra.
 */

import {
  ChevronDown, ChevronLeft, ChevronRight, Crosshair, Eye, Lock, LogOut, Menu, Minus,
  PanelLeftClose, Pencil, Plus, RotateCcw, Send, Shield, User, X,
} from "lucide-react";
import type { ReactNode } from "react";

/* ── moldura ─────────────────────────────────────────────────────── */

/** Um espécime: a classe, onde ela mora, e a peça montada na raiz certa. */
function Especime({ classe, folha, raiz, nota, children }: {
  classe: string;
  folha: string;
  /** Raiz que carrega os tokens desta família. */
  raiz: string;
  nota?: string;
  children: ReactNode;
}) {
  return (
    <div className="gal-esp">
      <div className="gal-esp-cab">
        <code className="gal-esp-classe">.{classe}</code>
        <code className="gal-esp-folha">{folha}</code>
      </div>
      <div className={`gal-esp-palco ${raiz}`}>{children}</div>
      {nota && <p className="gal-esp-nota">{nota}</p>}
    </div>
  );
}

/**
 * Espécime que roda isolado: a folha dele é dona de um documento
 * próprio. A altura é fixa por família porque o iframe não sabe
 * medir-se sozinho sem script de dentro — e um script de medição aqui
 * seria mais máquina que o problema pede.
 */
function EspecimeIsolado({ classe, folha, sistema, familia, altura = 90, nota }: {
  classe: string; folha: string; sistema: "mesa" | "app" | "auth"; familia: string; altura?: number; nota?: string;
}) {
  return (
    <div className="gal-esp">
      <div className="gal-esp-cab">
        <code className="gal-esp-classe">.{classe}</code>
        <code className="gal-esp-folha">{folha}</code>
      </div>
      <iframe
        className="gal-esp-frame"
        style={{ height: altura }}
        src={`/dev/estilos/especime/${sistema}?familia=${familia}`}
        title={`Espécime ${classe}`}
        loading="lazy"
      />
      {nota && <p className="gal-esp-nota">{nota}</p>}
    </div>
  );
}

function Fileira({ titulo, contagem, children }: { titulo: string; contagem: string; children: ReactNode }) {
  return (
    <section className="gal-rep-secao">
      <div className="gal-rep-cab">
        <h3>{titulo}</h3>
        <span>{contagem}</span>
      </div>
      <div className="gal-rep-grade">{children}</div>
    </section>
  );
}

/* ── botões ──────────────────────────────────────────────────────── */

/**
 * INVENTÁRIO COMPLETO dos botões, levantado pelo USO.
 *
 * Contado pela classe que cada `<button>` de fato aplica — não por nome
 * de classe com "btn" dentro, que foi como eu levantei da primeira vez
 * e perdi metade (as janelas de ferramenta inteiras, entre outras).
 *
 * Os 309 botões SEM className nenhuma não estão aqui, por definição:
 * são desenhados inline ou não desenhados. Eles são mais da metade dos
 * 556, e o maior número desta página.
 */
type Sistema = "rv" | "pn" | "rc" | "rm" | "ra" | "auth";

interface Botao {
  c: string;
  n: number;
  sis: Sistema;
  folha: string;
  /**
   * O QUE A PEÇA É, em português. Sem isto a página não serve: uma
   * versão anterior usava o nome da classe como conteúdo do botão, e o
   * resultado era uma grade de "btn", "ferr-btn", "area-item-acao" —
   * irreconhecível, e ainda quebrava os botões só de ícone, que
   * recebiam um texto que nunca foram feitos pra segurar.
   */
  papel: string;
  /** O texto REAL que o botão mostra no produto. Ausente = só de ícone. */
  rotulo?: string;
  /**
   * Filhos que a regra exige. Terceira armadilha do mesmo tipo: a
   * tipografia do segmentado vive em `.rv-fp-seg-nome`, não no botão —
   * montado sem o filho, o espécime saía em Inter e eu quase
   * "consertei" um CSS que estava certo.
   */
  filhos?: { classe: string; txt: string }[];
  /** Ícone real, para os que não têm texto. */
  icone?: keyof typeof ICONES;
  /**
   * Classe do ANCESTRAL exigido pela regra CSS.
   *
   * Sem isto o espécime mente. Foi o que aconteceu com
   * `rv-fp-primaria`: a regra dela vive em `.rv-fp-rodape
   * .rv-fp-primaria`, e montada solta ela caía no `.rv-btn` genérico —
   * uma caixa cinza que eu cheguei a diagnosticar como bug do produto,
   * quando o bug era do meu palco. No produto, todos os usos estão
   * dentro do rodapé, e ela desenha certo.
   */
  pai?: string;
  nota?: string;
}

const ICONES = {
  ChevronDown, ChevronLeft, ChevronRight, Crosshair, Eye, Lock, LogOut, Menu, Minus,
  PanelLeftClose, Pencil, Plus, RotateCcw, Send, Shield, User, X,
};

const BOTOES: Botao[] = [
  { c: "rv-btn", n: 40, sis: "rv", folha: "globals.css", papel: "Botão genérico do VTT", rotulo: "Voltar para editar", nota: "Declara UMA linha (transition: filter). Quem usa desenha no próprio arquivo." },
  { c: "rv-ferr-btn", n: 7, sis: "rv", folha: "vtt.css", papel: "Ícone do trilho de ferramentas", icone: "Menu" },
  { c: "rv-fp-seg-btn", filhos: [{ classe: "rv-fp-seg-nome", txt: "Pincel" }, { classe: "rv-fp-seg-sub", txt: "1 célula" }], pai: "rv-fp-tamanhos", n: 5, sis: "rv", folha: "vtt.css", papel: "Segmentado dentro da janela", rotulo: "Instantânea" },
  { c: "rv-area-item-acao", n: 5, sis: "rv", folha: "—", papel: "Ação na linha da lista de áreas", rotulo: "Localizar", nota: "SEM REGRA CSS: cinco usos, nenhuma declaração. Desenha como botão cru do navegador." },
  { c: "rv-modal-fechar", n: 3, sis: "rv", folha: "vtt-chassi.css", papel: "Fechar modal", icone: "X" },
  { c: "rv-fp-secundaria", pai: "rv-fp-rodape", n: 3, sis: "rv", folha: "vtt.css", papel: "Ação secundária do rodapé da janela", rotulo: "Restaurar padrão", icone: "RotateCcw" },
  { c: "rv-fp-fechar", n: 3, sis: "rv", folha: "vtt-chassi.css", papel: "Fechar janela de ferramenta", icone: "X", nota: "Mesma regra e mesmo comentário de pn-jan-btn." },
  { c: "rv-pn-retry", n: 3, sis: "rv", folha: "painel.css", papel: "Refazer leitura que falhou", rotulo: "Tentar de novo" },
  { c: "rv-pn-voltar", n: 3, sis: "rv", folha: "painel.css", papel: "Voltar do detalhe para a lista", rotulo: "Voltar", icone: "ChevronLeft" },
  { c: "rv-rodadas-massa-btn", n: 3, sis: "rv", folha: "vtt.css", papel: "Seleção em massa de participantes", rotulo: "Todos" },
  { c: "rv-camadas-btn", n: 2, sis: "rv", folha: "vtt.css", papel: "Trancar/destrancar camada", icone: "Lock" },
  { c: "rv-area-secao-cab", n: 2, sis: "rv", folha: "vtt.css", papel: "Cabeçalho dobrável de seção", rotulo: "Aparência", icone: "ChevronDown" },
  { c: "rv-area-acao-flutuante", n: 2, sis: "rv", folha: "vtt.css", papel: "Confirmar a área desenhada, sobre o mapa", rotulo: "Manter" },
  { c: "rv-hud-toggle", n: 1, sis: "rv", folha: "vtt.css", papel: "Recolher o HUD do token", icone: "ChevronDown" },
  { c: "rv-segmentado-item", pai: "rv-janela-token", n: 1, sis: "rv", folha: "vtt.css", papel: "Item de segmentado (tamanho do token)", rotulo: "Médio" },
  { c: "rv-fp-discreta", n: 1, sis: "rv", folha: "vtt.css", papel: "Ação discreta — nunca compete com a primária", rotulo: "Desmarcar" },
  { c: "rv-fp-primaria", pai: "rv-fp-rodape", n: 1, sis: "rv", folha: "vtt.css", papel: "Ação primária: ocupa a linha inteira", rotulo: "Salvar cena" },
  { c: "rv-fp-preset", n: 1, sis: "rv", folha: "vtt.css", papel: "Preset de objeto tático", rotulo: "Muro" },
  { c: "rv-fp-cor", n: 1, sis: "rv", folha: "vtt.css", papel: "Amostra de cor (o botão é a cor)" },
  { c: "rv-menu-item", n: 1, sis: "rv", folha: "vtt.css", papel: "Item do menu contextual do mapa", rotulo: "Criar token" },
  { c: "rv-sub-btn", n: 1, sis: "rv", folha: "vtt.css", papel: "Botão da barra de submenu", rotulo: "Instantânea" },
  { c: "rv-area-tipo", filhos: [{ classe: "rv-area-glifo", txt: "◎" }, { classe: "rv-area-nome", txt: "Esfera" }], n: 1, sis: "rv", folha: "vtt.css", papel: "Tipo de área de efeito", rotulo: "Esfera" },
  { c: "rv-area-cor", n: 1, sis: "rv", folha: "vtt.css", papel: "Amostra de cor da área" },
  { c: "rv-area-item-nome", n: 1, sis: "rv", folha: "vtt.css", papel: "Nome clicável na lista de áreas", rotulo: "Cone de Compressão" },
  { c: "rv-area-edicao-rapida-btn", n: 1, sis: "rv", folha: "vtt.css", papel: "Editar área, flutuando sobre o mapa", icone: "Pencil" },
  { c: "rv-aba", n: 1, sis: "rv", folha: "vtt-chassi.css", papel: "Aba do chassi", rotulo: "Chat" },
  { c: "rv-painel-fechar", n: 1, sis: "rv", folha: "painel.css", papel: "Recolher o painel lateral", icone: "X" },
  { c: "rv-pn-chat-novas", n: 1, sis: "rv", folha: "painel.css", papel: "Aviso flutuante sobre o feed", rotulo: "Novas mensagens", icone: "ChevronDown" },
  { c: "rv-pn-chip", n: 1, sis: "rv", folha: "painel.css", papel: "Chip clicável na lista", rotulo: "Arcana" },
  { c: "rv-pn-busca-limpar", n: 1, sis: "rv", folha: "painel.css", papel: "Limpar a busca", icone: "X" },
  { c: "rv-pn-grupo-btn", n: 1, sis: "rv", folha: "painel.css", papel: "Cabeçalho de grupo dobrável", rotulo: "Antagonistas", icone: "ChevronRight" },
  { c: "rv-rodadas-modo", n: 1, sis: "rv", folha: "vtt.css", papel: "Modo da trilha de turnos", rotulo: "Combate" },
  { c: "rv-rodadas-lado", n: 1, sis: "rv", folha: "vtt.css", papel: "Lado (facção) do participante", rotulo: "PJ" },
  { c: "rv-rodadas-encerrar", n: 1, sis: "rv", folha: "vtt.css", papel: "Ação destrutiva da janela de Rodadas", rotulo: "Encerrar combate" },
  { c: "rv-rodadas-avanca", n: 1, sis: "rv", folha: "vtt.css", papel: "Passar para a próxima janela de turno", rotulo: "Avançar janela" },
  { c: "rv-ator-retrato", pai: "rv-faccao rv-faccao--pj", n: 1, sis: "rv", folha: "vtt.css", papel: "Retrato no trilho — seleciona e centraliza", rotulo: "MV" },
  { c: "rv-ator-agir", pai: "rv-faccao rv-faccao--pn", n: 1, sis: "rv", folha: "vtt.css", papel: "Assumir o turno do participante", rotulo: "Agir" },
  { c: "pn-btn", n: 1, sis: "pn", folha: "painel.css", papel: "Botão técnico do painel", rotulo: "Aplicar dano", nota: "O ÚNICO com componente React: BotaoTecnico." },
  { c: "pn-jan-btn", n: 3, sis: "pn", folha: "vtt-chassi.css", papel: "Fechar janela interna", icone: "X" },
  { c: "pn-chipbtn", n: 3, sis: "pn", folha: "painel.css", papel: "Chip clicável do composer", rotulo: "Mesa" },
  { c: "pn-jan-dock", n: 1, sis: "pn", folha: "painel.css", papel: "Atalho para reabrir janela minimizada", rotulo: "Console" },
  { c: "pn-menu-item", n: 1, sis: "pn", folha: "painel.css", papel: "Item do menu ancorado", rotulo: "Abrir ficha" },
  { c: "pn-cartao-expandir", n: 1, sis: "pn", folha: "painel.css", papel: "Abrir os detalhes de um card do feed", rotulo: "[ + ]" },
  { c: "pn-composer-enviar", pai: "rv-pn-chat", n: 1, sis: "pn", folha: "painel.css", papel: "Enviar mensagem", icone: "Send" },
  { c: "rc-ghost", n: 9, sis: "rc", folha: "console.css", papel: "Botão discreto do Console", rotulo: "Tentar de novo", nota: "“Botão discreto reutilizável”, diz a folha — é o BotaoTecnico do Console, sem componente." },
  { c: "rc-aux-item", n: 6, sis: "rc", folha: "console.css", papel: "Item do menu auxiliar", rotulo: "Descansar" },
  { c: "rc-winbtn", n: 5, sis: "rc", folha: "console.css", papel: "Minimizar/fechar a janela do Console", icone: "Minus" },
  { c: "rc-eq-inner", n: 3, sis: "rc", folha: "console.css", papel: "Equipar item do inventário", rotulo: "Equipar", icone: "Plus" },
  { c: "rc-nres-btn", n: 2, sis: "rc", folha: "console.css", papel: "Passo de recurso (PV, PE, Mana)", icone: "Minus" },
  { c: "rc-modo-chip", n: 2, sis: "rc", folha: "console.css", papel: "Chip de modo/atalho", rotulo: "Ver no mapa", icone: "Crosshair" },
  { c: "rc-passo-btn", n: 2, sis: "rc", folha: "console.css", papel: "Passo genérico", rotulo: "−" },
  { c: "rc-npr-btn", n: 2, sis: "rc", folha: "console.css", papel: "Passo de proteção", icone: "Minus" },
  { c: "rc-pin-x", n: 1, sis: "rc", folha: "console.css", papel: "Remover item fixado", icone: "X" },
  { c: "rc-ncond-abrir", n: 1, sis: "rc", folha: "console.css", papel: "Abrir detalhe da condição", rotulo: "Sangrando" },
  { c: "rc-ncond-x", n: 1, sis: "rc", folha: "console.css", papel: "Remover condição", icone: "X" },
  { c: "rc-ncond-add", n: 1, sis: "rc", folha: "console.css", papel: "Adicionar condição", rotulo: "Adicionar", icone: "Plus" },
  { c: "rc-eq-pipbtn", n: 1, sis: "rc", folha: "console.css", papel: "Pip de equipamento", rotulo: "◆" },
  { c: "rc-skill", n: 1, sis: "rc", folha: "console.css", papel: "Perícia — clicar rola", rotulo: "Luta" },
  { c: "rc-nres-eye", n: 1, sis: "rc", folha: "vtt.css", papel: "Tornar recurso público/privado", icone: "Eye" },
  { c: "rc-ncol-pip", n: 1, sis: "rc", folha: "console.css", papel: "Pip de segmento de colapso", rotulo: "◆" },
  { c: "rc-ncol-estabilizar", n: 1, sis: "rc", folha: "console.css", papel: "Estabilizar o colapso", rotulo: "Estabilizar" },
  { c: "rc-npr-pip", n: 1, sis: "rc", folha: "console.css", papel: "Pip de proteção", rotulo: "◆" },
  { c: "rc-npr-defesa", n: 1, sis: "rc", folha: "console.css", papel: "Rolar defesa — ocupa a largura inteira", rotulo: "Defender", icone: "Shield" },
  { c: "rc-nric-pip", n: 1, sis: "rc", folha: "console.css", papel: "Pip de integridade", rotulo: "◆" },
  { c: "rc-nric-attr", n: 1, sis: "rc", folha: "console.css", papel: "Atributo — clicar rola", rotulo: "Corpo" },
  { c: "rc-nsob-pip", n: 1, sis: "rc", folha: "console.css", papel: "Pip de surto de sobrecarga", rotulo: "◆" },
  { c: "rm-btn", n: 25, sis: "rm", folha: "mesa.css", papel: "Botão genérico da Mesa", rotulo: "Recarregar mesa" },
  { c: "rm-session-tab", n: 2, sis: "rm", folha: "mesa.css", papel: "Aba de sessão", rotulo: "Sessão" },
  { c: "rm-turndock-acao", n: 1, sis: "rm", folha: "mesa.css", papel: "Ação do dock de turnos", rotulo: "Encerrar rodada" },
  { c: "rm-session-tentar-de-novo", n: 1, sis: "rm", folha: "—", papel: "Refazer leitura que falhou", rotulo: "Tentar de novo", nota: "SEM REGRA CSS." },
  { c: "rm-session-log-novas", n: 1, sis: "rm", folha: "mesa.css", papel: "Aviso de log novo", rotulo: "Novas entradas" },
  { c: "rm-session-roster-atualizar", n: 1, sis: "rm", folha: "mesa.css", papel: "Reler a lista de participantes", rotulo: "Atualizar" },
  { c: "rm-sync-alerta-acao", n: 1, sis: "rm", folha: "mesa.css", papel: "Ação do alerta de sincronização", rotulo: "Reconectar" },
  { c: "rm-drawer-toggle", n: 1, sis: "rm", folha: "mesa.css", papel: "Abrir/fechar o drawer", rotulo: "Painel" },
  { c: "rm-drawer-backdrop", n: 1, sis: "rm", folha: "mesa.css", papel: "Fundo clicável que fecha o drawer", rotulo: "" },
  { c: "ra-btn", n: 7, sis: "ra", folha: "app.css", papel: "Botão genérico do App", rotulo: "Tentar novamente" },
  { c: "ra-iconbtn", n: 2, sis: "ra", folha: "app.css", papel: "Fechar", icone: "X" },
  { c: "ra-switch", n: 2, sis: "ra", folha: "app.css", papel: "Interruptor", rotulo: "" },
  { c: "ra-menu-item", n: 1, sis: "ra", folha: "app.css", papel: "Item de menu", rotulo: "Sair", icone: "LogOut" },
  { c: "ra-comp-row", n: 1, sis: "ra", folha: "app.css", papel: "Linha clicável de lista", rotulo: "Personagem" },
  { c: "ra-linkbtn", n: 1, sis: "ra", folha: "app.css", papel: "Botão com cara de link", rotulo: "Ver tudo" },
  { c: "ra2-secondary", n: 1, sis: "ra", folha: "app.css", papel: "Ação secundária", rotulo: "Criar campanha", icone: "Plus" },
  { c: "ra2-collapse-btn", n: 1, sis: "ra", folha: "app.css", papel: "Recolher a navegação", rotulo: "Recolher", icone: "PanelLeftClose" },
  { c: "ra2-nav-item", n: 1, sis: "ra", folha: "app.css", papel: "Item do trilho de navegação", rotulo: "Sair", icone: "LogOut" },
  { c: "ra2-menu-btn", n: 1, sis: "ra", folha: "app.css", papel: "Abrir o menu (mobile)", icone: "Menu" },
  { c: "ra2-profile", n: 1, sis: "ra", folha: "app.css", papel: "Perfil na topbar", rotulo: "Gabi", icone: "User" },
  { c: "auth-submit-btn", n: 1, sis: "auth", folha: "auth.css", papel: "Submit do login — largura cheia", rotulo: "Entrar" },
  { c: "rv-seg-btn", n: 2, sis: "auth", folha: "auth.css", papel: "Segmentado do login (flex: 1)", rotulo: "Entrar", nota: "ÓRFÃ: desenha, e nenhum .tsx a chama." },
  { c: "rv-submit", n: 1, sis: "auth", folha: "auth.css", papel: "Submit genérico de formulário", rotulo: "Enviar" },
  { c: "rv-toggle-btn", n: 1, sis: "auth", folha: "auth.css", papel: "Mostrar/esconder senha", icone: "Eye" },
  { c: "rv-recover-btn", n: 1, sis: "auth", folha: "auth.css", papel: "Link de recuperação", rotulo: "Recuperar senha" },
];

const RAIZ: Record<Sistema, string> = {
  rv: "rv-mesa", pn: "rv-painel", rc: "rc-window-wrap",
  rm: "rm-root", ra: "ra-root", auth: "rv-mesa",
};

/** rm-, ra- e auth precisam de documento próprio; o resto desenha aqui. */
const ISOLADOS: Sistema[] = ["rm", "ra", "auth"];

const NOME_SISTEMA: Record<Sistema, string> = {
  rv: "rv- · VTT, chassi e ferramentas",
  pn: "pn- · painel do VTT",
  rc: "rc- · Console do Personagem",
  rm: "rm- · Mesa (documento isolado)",
  ra: "ra- / ra2- · App (documento isolado)",
  auth: "auth · login (documento isolado)",
};

/** Rótulo curto — o que distingue a classe, sem o prefixo do sistema. */
function rotuloCurto(c: string) {
  return c.replace(/^(rv|rc|rm|ra2|ra|pn|auth)-/, "") || c;
}

/** Conteúdo REAL do botão: o texto do produto, ou o ícone. */
function Conteudo({ b }: { b: Botao }) {
  if (b.filhos) {
    return <>{b.filhos.map((f) => <span key={f.classe} className={f.classe}>{f.txt}</span>)}</>;
  }
  if (b.icone) {
    const Icone = ICONES[b.icone];
    return <Icone size={14} aria-hidden="true" />;
  }
  return <>{b.rotulo}</>;
}

function CelulaInline({ b }: { b: Botao }) {
  return (
    <div className="gal-cel">
      <div className={`gal-cel-palco ${RAIZ[b.sis]}`}>
        {b.pai
          ? <div className={b.pai}><button type="button" className={b.c}><Conteudo b={b} /></button></div>
          : <button type="button" className={b.c}><Conteudo b={b} /></button>}
      </div>
      <strong className="gal-cel-papel">{b.papel}</strong>
      <code>.{b.c}</code>
      <span>{b.n}× · {b.folha}{b.nota ? <b> · !</b> : null}</span>
      {b.nota && <em className="gal-cel-nota">{b.nota}</em>}
    </div>
  );
}

export function RepetidosBotoes() {
  const sistemas: Sistema[] = ["rv", "pn", "rc", "rm", "ra", "auth"];
  return (
    <>
      <p className="gal-rep-lede">
        <strong>556</strong> elementos <code>&lt;button&gt;</code> no app. Contando pela classe que
        cada um de fato aplica — e não por nome de classe com “btn” dentro —, são as{" "}
        <strong>{BOTOES.length}</strong> classes abaixo, <strong>todas</strong> montadas. Mais{" "}
        <strong>309 botões sem className nenhuma</strong> (65 arquivos), desenhados inline: são mais
        da metade do total e, por definição, não têm o que listar.
      </p>
      <p className="gal-rep-lede">
        Duas classes têm uso e <strong>nenhuma regra CSS</strong> —{" "}
        <code>rv-area-item-acao</code> (5 usos) e <code>rm-session-tentar-de-novo</code>. Elas
        aparecem aqui como o navegador as desenha, que é como a mesa as desenha.
      </p>

      {sistemas.map((sis) => {
        const doSistema = BOTOES.filter((b) => b.sis === sis);
        const isolado = ISOLADOS.includes(sis);
        return (
          <Fileira key={sis} titulo={NOME_SISTEMA[sis]} contagem={`${doSistema.length} classes`}>
            {isolado ? (
              <div className="gal-esp gal-esp--largo">
                <iframe
                  className="gal-esp-frame"
                  style={{ height: 40 + Math.ceil(doSistema.length / 3) * 96 }}
                  src={`/dev/estilos/especime/${sis === "ra" ? "app" : sis === "rm" ? "mesa" : "auth"}?itens=${encodeURIComponent(doSistema.map((b) => `${b.c}|${b.rotulo ?? ""}|${b.papel}`).join("~"))}`}
                  title={`Espécimes ${sis}`}
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="gal-celas">
                {doSistema.map((b) => <CelulaInline key={b.c} b={b} />)}
              </div>
            )}
          </Fileira>
        );
      })}
    </>
  );
}

/* ── chips ───────────────────────────────────────────────────────── */

export function RepetidosChips() {
  return (
    <>
      <p className="gal-rep-lede">
        <strong>36</strong> classes de chip, tag e badge. Um componente compartilhado — o{" "}
        <code>Chip</code> do painel do VTT.
      </p>
      <Fileira titulo="Chip, tag, badge" contagem="6 de 36">
        <Especime classe="pn-chip" folha="_painel/painel.css" raiz="rv-painel" nota="Tem componente: Chip/Chips.">
          <div className="gal-esp-linha">
            <span className="pn-chip" data-acento="cy">cy</span>
            <span className="pn-chip" data-acento="am">am</span>
            <span className="pn-chip" data-acento="perigo">perigo</span>
          </div>
        </Especime>
        <EspecimeIsolado classe="rm-badge" folha="_design/mesa.css" sistema="mesa" familia="chips" altura={70} />
        <EspecimeIsolado classe="ra-tag" folha="_design/app.css" sistema="app" familia="chips" altura={70} />
        <EspecimeIsolado classe="rv-badge" folha="_design/auth.css" sistema="auth" familia="chips" altura={70} />
        <Especime classe="rc-ncond-tag" folha="_design/console.css" raiz="rc-window-wrap">
          <div className="gal-esp-linha"><span className="rc-ncond-tag">Sangrando</span></div>
        </Especime>
        <Especime classe="rc-skill-tag" folha="_design/console.css" raiz="rc-window-wrap">
          <div className="gal-esp-linha"><span className="rc-skill-tag">Luta</span></div>
        </Especime>
      </Fileira>
    </>
  );
}

/* ── campos ──────────────────────────────────────────────────────── */

export function RepetidosCampos() {
  return (
    <>
      <p className="gal-rep-lede">
        O pior caso do inventário: <strong>30</strong> classes, <strong>533</strong> elementos{" "}
        <code>&lt;input&gt;</code>/<code>&lt;select&gt;</code>/<code>&lt;textarea&gt;</code> crus e{" "}
        <strong>nenhum</strong> componente compartilhado. Todo formulário do produto redesenha campo do zero.
      </p>
      <Fileira titulo="Campo de texto e seleção" contagem="6 de 30">
        <EspecimeIsolado classe="rv-input" folha="_design/auth.css" sistema="auth" familia="campos" altura={80} />
        <EspecimeIsolado classe="rm-input · rm-select" folha="_design/mesa.css" sistema="mesa" familia="campos" altura={90} />
        <EspecimeIsolado classe="ra-input · ra-select" folha="_design/app.css" sistema="app" familia="campos" altura={90} />
        <Especime classe="rc-dock-input" folha="_design/console.css" raiz="rc-window-wrap">
          <input className="rc-dock-input" defaultValue="Texto" />
        </Especime>
        <Especime classe="rv-pn-select" folha="_painel/painel.css" raiz="rv-painel">
          <select className="rv-pn-select" defaultValue="a"><option value="a">Opção</option></select>
        </Especime>
        <Especime classe="rv-pn-busca-input" folha="_painel/painel.css" raiz="rv-painel">
          <input className="rv-pn-busca-input" placeholder="Buscar…" />
        </Especime>
      </Fileira>
    </>
  );
}

/* ── estados ─────────────────────────────────────────────────────── */

export function RepetidosEstados() {
  return (
    <>
      <p className="gal-rep-lede">
        <strong>33</strong> classes de vazio, erro e carregando. Um conjunto compartilhado —{" "}
        <code>Estados.tsx</code>, e só dentro do painel do VTT.
      </p>
      <Fileira titulo="Vazio e erro" contagem="5 de 33">
        <Especime classe="rv-pn-estado" folha="_painel/painel.css" raiz="rv-painel" nota="Tem componente: EstadoVazio / EstadoErro / EstadoCarregando.">
          <p className="rv-pn-estado rv-pn-estado--vazio">Nenhuma mensagem ainda.</p>
        </Especime>
        <EspecimeIsolado classe="rm-vazio · rm-erro" folha="_design/mesa.css" sistema="mesa" familia="estados" altura={100} />
        <EspecimeIsolado classe="ra-empty" folha="_design/app.css" sistema="app" familia="estados" altura={170} />
        <Especime classe="rc-vazio · rc-tab-vazio" folha="_design/console.css" raiz="rc-window-wrap">
          <p className="rc-vazio">Sem condições ativas.</p>
        </Especime>
        <Especime classe="rv-fp-erro" folha="vtt.css" raiz="rv-mesa">
          <p className="rv-fp-erro">O servidor recusou a operação.</p>
        </Especime>
      </Fileira>
    </>
  );
}

/* ── abas ────────────────────────────────────────────────────────── */

export function RepetidosAbas() {
  return (
    <>
      <p className="gal-rep-lede">
        <strong>28</strong> classes de aba, em três desenhos que convivem: o trilho do Console, as
        abas do painel do VTT e as abas de sessão da Mesa.
      </p>
      <Fileira titulo="Aba" contagem="4 de 28">
        <Especime classe="rv-pn-aba" folha="_painel/painel.css" raiz="rv-painel" nota="Tem componente: PainelAbas.">
          <div className="gal-esp-linha">
            <button type="button" className="rv-pn-aba" aria-selected="true">Chat</button>
            <button type="button" className="rv-pn-aba">Bando</button>
          </div>
        </Especime>
        <Especime classe="rc-tabrail-btn" folha="_design/console.css" raiz="rc-window-wrap">
          <div className="gal-esp-linha">
            <button type="button" className="rc-tabrail-btn" aria-selected="true">Ficha</button>
            <button type="button" className="rc-tabrail-btn">Perícias</button>
          </div>
        </Especime>
        <EspecimeIsolado classe="rm-session-tab" folha="_design/mesa.css" sistema="mesa" familia="abas" altura={80} />
        <Especime classe="rv-aba" folha="vtt-chassi.css" raiz="rv-mesa">
          <div className="gal-esp-linha">
            <button type="button" className="rv-aba" aria-selected="true">Aba</button>
            <button type="button" className="rv-aba">Outra</button>
          </div>
        </Especime>
      </Fileira>
    </>
  );
}
