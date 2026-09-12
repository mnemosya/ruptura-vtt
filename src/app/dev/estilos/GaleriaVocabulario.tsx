"use client";

/**
 * VOCABULÁRIO DO PAINEL — as peças pequenas de que todo o resto é feito.
 *
 * São as primitivas (`_painel/ui/primitivas.tsx`), os estados de aba
 * (`_painel/Estados.tsx`), as linhas de diretório (`_painel/Diretorio.tsx`)
 * e as sobreposições (`ui/Dialogo`, `ui/MenuAncorado`, `ui/JanelaInterna`).
 *
 * Elas não aparecem sozinhas em lugar nenhum da mesa — vivem DENTRO de
 * cards, abas e janelas —, e é justamente por isso que precisam de uma
 * vitrine: quando um `Chip` muda de altura, quem paga são as oito telas
 * que o usam, e não existe um lugar onde esse efeito seja visível antes
 * de acontecer na mesa.
 *
 * Aqui cada peça aparece em TODAS as variações que ela oferece, não
 * numa só: um acento por vez não prova nada sobre a escala de acentos.
 */

import { useState, type ReactNode } from "react";
import { AlertTriangle, Flame, Package, Shield, Sparkles, Target, Zap } from "lucide-react";
import {
  Acoes, BarraAlvo, BarraRecurso, BotaoTecnico, Caption, Chip, Chips, Label,
  Modulo, Modulos, PainelTecnico, Pip, SecaoDossie, FaixaResultado,
  type Acento,
} from "../../mesas/[campaignId]/vtt/_painel/ui/primitivas";
import {
  EstadoCarregando, EstadoConectando, EstadoErro, EstadoIndisponivel, EstadoVazio,
} from "../../mesas/[campaignId]/vtt/_painel/Estados";
import {
  BotaoAba, BuscaDiretorio, CabecalhoGrupo, LinhaDiretorio, RodapeAcoes,
} from "../../mesas/[campaignId]/vtt/_painel/Diretorio";
import { DialogoConfirmar, DialogoTexto } from "../../mesas/[campaignId]/vtt/_painel/ui/Dialogo";
import { MenuAncorado } from "../../mesas/[campaignId]/vtt/_painel/ui/MenuAncorado";
import { JanelaInterna } from "../../mesas/[campaignId]/vtt/_painel/ui/JanelaInterna";

const SEM_EFEITO = () => {};

/** Os seis acentos, na ordem em que a régua os usa. */
export const ACENTOS: Acento[] = ["cy", "ok", "am", "magenta", "perigo", "mana"];

/**
 * Bancada de uma peça: um rótulo curto e a peça montada ao lado.
 *
 * Sem moldura de card: estas peças são pequenas e o que interessa é
 * comparar uma linha com a de baixo, não emoldurar cada uma.
 */
export function Bancada({ nome, nota, children }: { nome: string; nota?: string; children: ReactNode }) {
  return (
    <div className="gal-bancada">
      <div className="gal-bancada-cab">
        <code>{nome}</code>
        {nota && <span>{nota}</span>}
      </div>
      <div className="gal-bancada-corpo">{children}</div>
    </div>
  );
}

/* ── primitivas ──────────────────────────────────────────────────── */

export function VitrinePrimitivas() {
  return (
    <div className="rv-painel gal-vitrine">
      <Bancada nome="Caption" nota="selo de seção, um por acento">
        <div className="gal-linha">{ACENTOS.map((a) => <Caption key={a} acento={a}>{a}</Caption>)}</div>
      </Bancada>

      <Bancada nome="Label" nota="metadado mono">
        <div className="gal-linha">{ACENTOS.map((a) => <Label key={a} acento={a}>Alcance</Label>)}</div>
      </Bancada>

      <Bancada nome="Chip · Chips" nota="tag, categoria, estado">
        <Chips>
          {ACENTOS.map((a) => <Chip key={a} acento={a}>{a}</Chip>)}
          <Chip acento="neutro" icone={<Sparkles />}>com ícone</Chip>
          <Chip acento="am" titulo="Aparece como title no hover">com título</Chip>
        </Chips>
      </Bancada>

      <Bancada nome="Modulo · Modulos" nota="a peça central dos cards mecânicos: 2, 3 e 4 colunas">
        <Modulos colunas={4}>
          <Modulo rotulo="Corpo" valor="4" sub="1d8" acento="cy" />
          <Modulo rotulo="Luta" valor="+2" acento="cy" />
          <Modulo rotulo="MOD" valor="+0" acento="neutro" />
          <Modulo rotulo="CD" valor="10" acento="perigo" />
        </Modulos>
        <Modulos colunas={3}>
          <Modulo rotulo="Dano" valor="17" acento="perigo" destaque icone={<Flame />} />
          <Modulo rotulo="Mitigação" valor="2" acento="ok" icone={<Shield />} />
          <Modulo rotulo="Mana" valor="2" acento="mana" icone={<Zap />} />
        </Modulos>
        <Modulos colunas={2}>
          <Modulo rotulo="PV" valor="12 → 20" sub="+8" acento="ok" />
          <Modulo rotulo="Segmento" valor="2" sub="/3" acento="perigo" />
        </Modulos>
      </Bancada>

      <Bancada nome="FaixaResultado" nota="fecha uma resolução; o texto nunca depende só da cor">
        <div className="gal-empilha">
          <FaixaResultado rotulo="Acerto" valor="14" acento="ok" icone={<Target />} />
          <FaixaResultado rotulo="Falha" valor="4" acento="perigo" icone={<AlertTriangle />} />
          <FaixaResultado rotulo="Resultado" valor="9" acento="cy" />
          <FaixaResultado rotulo="Pulso ao chegar" valor="21" acento="mana" pulso />
        </div>
      </Bancada>

      <Bancada nome="BarraAlvo" nota="nome à esquerda, resultado à direita">
        <div className="gal-empilha">
          <BarraAlvo nome="Gravenight" resultado="Acerto vs 6" acento="perigo" />
          <BarraAlvo nome="Sentinela da Doca" resultado={<Target size={11} />} acento="neutro" />
        </div>
      </Bancada>

      <Bancada nome="BotaoTecnico · Acoes" nota="primário ocupa a largura; os demais são compactos">
        <div className="gal-empilha">
          <Acoes>
            <BotaoTecnico acento="cy" icone={<Package />}>Compacto</BotaoTecnico>
            <BotaoTecnico acento="perigo">Perigo</BotaoTecnico>
            <BotaoTecnico acento="neutro" desabilitado>Desabilitado</BotaoTecnico>
            <BotaoTecnico acento="ok" ocupado>Ocupado</BotaoTecnico>
          </Acoes>
          <BotaoTecnico acento="perigo" primario icone={<Flame />}>Aplicar dano</BotaoTecnico>
        </div>
      </Bancada>

      <Bancada nome="BarraRecurso" nota="células discretas, nunca barra de progresso contínua">
        <div className="gal-empilha">
          <BarraRecurso rotulo="PA" atual={3} total={4} acento="cy" />
          <BarraRecurso rotulo="Mana" atual={2} total={6} acento="mana" />
          <BarraRecurso rotulo="PV" atual={0} total={8} acento="perigo" />
        </div>
      </Bancada>

      <Bancada nome="Pip" nota="indicador luminoso: ligado e desligado">
        <div className="gal-linha">
          {ACENTOS.map((a) => <Pip key={a} acento={a} ligado />)}
          <Pip acento="cy" />
        </div>
      </Bancada>

      <Bancada nome="PainelTecnico" nota="canto cortado, borda 1px">
        <PainelTecnico>
          <p className="pn-texto">Módulo interno de card — descrição, detalhe, tabela.</p>
        </PainelTecnico>
      </Bancada>

      <Bancada nome="SecaoDossie" nota="cabeçalho numerado das abas de detalhe">
        <SecaoDossie n="01" titulo="Atributos">
          <p className="pn-texto">Conteúdo da seção.</p>
        </SecaoDossie>
      </Bancada>
    </div>
  );
}

/* ── estados de aba ──────────────────────────────────────────────── */

export function VitrineEstados() {
  return (
    <div className="rv-painel gal-vitrine">
      <Bancada nome="EstadoCarregando"><EstadoCarregando /></Bancada>
      <Bancada nome="EstadoConectando"><EstadoConectando /></Bancada>
      <Bancada nome="EstadoVazio"><EstadoVazio>Nenhuma mensagem nesta mesa ainda.</EstadoVazio></Bancada>
      <Bancada nome="EstadoIndisponivel"><EstadoIndisponivel>Tempo real indisponível — recarregue a página.</EstadoIndisponivel></Bancada>
      <Bancada nome="EstadoErro" nota="com e sem a ação de tentar de novo">
        <div className="gal-empilha">
          <EstadoErro mensagem="Falha ao carregar o compêndio da mesa." onTentarDeNovo={SEM_EFEITO} />
          <EstadoErro mensagem="Falha ao carregar o compêndio da mesa." />
        </div>
      </Bancada>
    </div>
  );
}

/* ── diretório ───────────────────────────────────────────────────── */

export function VitrineDiretorio() {
  const [busca, setBusca] = useState("");
  return (
    <div className="rv-painel gal-vitrine">
      <Bancada nome="BuscaDiretorio">
        <BuscaDiretorio valor={busca} onMudar={setBusca} rotulo="Buscar personagem" placeholder="Buscar personagem…" />
      </Bancada>

      <Bancada nome="CabecalhoGrupo · LinhaDiretorio" nota="linha comum, selecionada, aninhada e alvo de solta">
        <div className="rv-pn-lista-moldura">
          <CabecalhoGrupo rotulo="Personagens" contagem={3} />
          <ul className="rv-pn-lista">
            <LinhaDiretorio face="MV" nome="Mara Venn" subtitulo="Batedora · Nível 3" marca="PV 20/20" onAbrir={SEM_EFEITO} />
            <LinhaDiretorio face="CV" nome="Corvo" subtitulo="Executor · Nível 2" marca="PV 5/26" selecionado onAbrir={SEM_EFEITO} acento="var(--rv-ok)" />
            <LinhaDiretorio face="SV" nome="Siv" subtitulo="Sináptico · Nível 3" rodape="Ruptura pendente" onAbrir={SEM_EFEITO} acento="var(--rv-ar)" />
            <LinhaDiretorio face="#2" nome="Sentinela da Doca" nivel={1} subtitulo="PN" onAbrir={SEM_EFEITO} />
            <LinhaDiretorio face="📦" nome="Solte aqui" alvoDeSolta onAbrir={SEM_EFEITO} />
          </ul>
        </div>
      </Bancada>

      <Bancada nome="RodapeAcoes · BotaoAba" nota="a barra fixa no pé da aba">
        <RodapeAcoes>
          <BotaoAba onClick={SEM_EFEITO}>Atualizar</BotaoAba>
          <BotaoAba onClick={SEM_EFEITO} primario>Criar personagem</BotaoAba>
          <BotaoAba onClick={SEM_EFEITO} desabilitado titulo="Só o narrador pode">Bloqueado</BotaoAba>
        </RodapeAcoes>
      </Bancada>
    </div>
  );
}

/* ── sobreposições ───────────────────────────────────────────────── */

/**
 * Diálogos, menu e janela interna são MODAIS: existem sobre a mesa, não
 * dentro de uma coluna. Aqui cada um abre por um botão em vez de vir
 * aberto — é o estado de abertura que se quer conferir, e um modal
 * permanentemente aberto no meio da galeria esconderia os de baixo.
 */
export function VitrineSobreposicoes() {
  const [qual, setQual] = useState<null | "texto" | "confirmar" | "janela">(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);

  return (
    <div className="rv-painel gal-vitrine">
      <Bancada nome="DialogoTexto" nota="entrada curta, com marcação opcional">
        <BotaoTecnico acento="cy" onClick={() => setQual("texto")}>Abrir</BotaoTecnico>
        <DialogoTexto
          aberto={qual === "texto"}
          titulo="Novo token"
          rotulo="Nome"
          valorInicial="Sentinela da Doca"
          placeholder="Nome do token"
          marcacao={{ rotulo: "É um PN", inicial: true }}
          onConfirmar={() => setQual(null)}
          onCancelar={() => setQual(null)}
        />
      </Bancada>

      <Bancada nome="DialogoConfirmar" nota="acento perigo para o que não volta atrás">
        <BotaoTecnico acento="perigo" onClick={() => setQual("confirmar")}>Abrir</BotaoTecnico>
        <DialogoConfirmar
          aberto={qual === "confirmar"}
          titulo="Encerrar a cena"
          mensagem="Efeitos de cena expiram e a Ruptura pendente é cobrada. Não dá pra desfazer."
          rotuloConfirmar="Encerrar"
          acento="perigo"
          onConfirmar={() => setQual(null)}
          onCancelar={() => setQual(null)}
        />
      </Bancada>

      <Bancada nome="MenuAncorado" nota="popover próprio, nunca um select nativo">
        <button
          type="button"
          className="pn-btn"
          data-acento="cy"
          onClick={(e) => setMenu(menu ? null : e.currentTarget)}
        >
          Abrir menu
        </button>
        <MenuAncorado
          ancora={menu}
          aberto={!!menu}
          onFechar={() => setMenu(null)}
          rotulo="Ações do token"
          itens={[
            { id: "focar", rotulo: "Centralizar no mapa", grupoAntes: "Mapa", onSelecionar: () => setMenu(null) },
            { id: "ficha", rotulo: "Abrir ficha", descricao: "Console do personagem", selecionado: true, onSelecionar: () => setMenu(null) },
            { id: "remover", rotulo: "Remover da cena", desabilitado: true, onSelecionar: () => setMenu(null) },
          ]}
        />
      </Bancada>

      <Bancada nome="JanelaInterna" nota="a casca das janelas do painel (Console, admin)">
        <BotaoTecnico acento="cy" onClick={() => setQual("janela")}>Abrir</BotaoTecnico>
        <JanelaInterna
          aberta={qual === "janela"}
          titulo="Jogadores e convites"
          subtitulo="Mesa Teste · 3 participantes"
          onFechar={() => setQual(null)}
        >
          <p className="pn-texto">Conteúdo da janela interna.</p>
        </JanelaInterna>
      </Bancada>
    </div>
  );
}
