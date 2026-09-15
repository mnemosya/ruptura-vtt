"use client";

/**
 * CONSOLE DO PERSONAGEM dentro do VTT.
 *
 * Substitui o `router.push("/ficha?...")` do painel. Mapa, cena,
 * câmera, seleção e painel continuam montados; a URL não muda; fechar
 * devolve o estado exato de antes.
 *
 * O Console NÃO foi redesenhado — é o mesmo `CharacterSheetClient`,
 * com a mesma folha `console.css` e a MESMA janela flutuante
 * (`ConsoleWindow`, que já traz cabeçalho "CONSOLE DO PERSONAGEM",
 * minimizar, maximizar e fechar). Quem se aproximou dele foi o painel.
 *
 * Por isso o Console pronto NÃO é embrulhado em `JanelaInterna`: ele já
 * É a janela. `JanelaInterna` só aparece enquanto carrega (o shell
 * imediato) e no estado de erro, com a mesma moldura visual, para a
 * transição ser coerente. `ConsoleCloseProvider` redefine o que
 * "fechar" significa — aqui, devolver o VTT intacto, sem `router.back()`
 * e sem navegação nenhuma.
 *
 * PERFORMANCE (a abertura era lenta porque `CharacterSheetView` fazia
 * onze `await` em série):
 *
 *   1. SHELL IMEDIATO — a janela abre no mesmo quadro, com esqueleto de
 *      geometria próxima do conteúdo final (identidade, vitais,
 *      perícias), nunca tela branca nem spinner central solitário.
 *   2. ESSENCIAL PRIMEIRO — `abrirConsoleAction` traz personagem +
 *      regras e responde rápido.
 *   3. CATÁLOGOS EM PARALELO — `carregarCatalogosConsoleAction` chama
 *      `carregarDadosConsole`, que dispara os onze juntos.
 *   4. CACHE POR CAMPANHA — `cacheCatalogos` guarda a PROMESSA, então
 *      abrir o segundo personagem da mesma mesa não paga de novo, e
 *      duas aberturas simultâneas compartilham a mesma ida.
 *   5. BUNDLE LAZY — `CharacterSheetClient` é enorme e só é baixado
 *      quando alguém abre um personagem de verdade.
 *   6. PRELOAD — `precarregarConsole` roda no hover/foco da linha do
 *      diretório E, uma vez, quando o próprio VTT termina de montar
 *      (em ocioso). O hover sozinho não bastava: quem abre a ficha pelo
 *      menu de um token, por um atalho ou com um clique direto nunca
 *      passava por ele, e pagava a abertura fria inteira — medido em
 *      ~1,8 s contra ~0,2 s com tudo aquecido.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { JanelaInterna } from "../ui/JanelaInterna";
import { ConsoleCloseProvider } from "../../../../../ficha/_console/ConsoleCloseContext";
import { useConsoleDaMesa } from "../../../_shell/ConsoleDaMesa";
import { EstadoErro } from "../Estados";
import {
  abrirConsoleAction,
  carregarCatalogosConsoleAction,
  type AberturaConsole,
} from "../acoes/consolePainel";
import type { DadosConsole } from "../../../../../../lib/console/dadosConsole";

/**
 * `CharacterSheetClient` puxa a ficha inteira (abas, motores, ícones).
 * Fora do bundle inicial do VTT: quem só abre o mapa nunca baixa isso.
 * `ssr: false` porque o Console é client-only de qualquer forma.
 */
const CharacterSheetClient = dynamic(() => import("../../../../../dev/character-sheet/CharacterSheetClient"), {
  ssr: false,
  loading: () => <EsqueletoConsole />,
});

/**
 * Cache de catálogos POR CAMPANHA, guardando a PROMESSA (não o
 * resultado): duas aberturas simultâneas compartilham a mesma
 * requisição em vez de disparar duas. Vive enquanto a aba viver.
 */
const cacheCatalogos = new Map<string, Promise<DadosConsole | null>>();

function buscarCatalogos(campaignId: string): Promise<DadosConsole | null> {
  const emCache = cacheCatalogos.get(campaignId);
  if (emCache) return emCache;
  const p = carregarCatalogosConsoleAction(campaignId)
    .then((r) => (r.ok && r.dados ? r.dados : null))
    .catch(() => null);
  cacheCatalogos.set(campaignId, p);
  return p;
}

/**
 * Aquecimento — chamado no hover/foco de uma linha do diretório. O
 * clique depois costuma encontrar catálogos e bundle prontos.
 */
export function precarregarConsole(campaignId: string): void {
  void buscarCatalogos(campaignId);
  void import("../../../../../dev/character-sheet/CharacterSheetClient");
}

/** Esqueleto com a geometria do Console — nunca um spinner solto. */
function EsqueletoConsole() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="painel-console-esqueleto" aria-busy="true">
      <div style={{ display: "flex", gap: 12 }}>
        <div className="pn-skel" data-brilho="true" style={{ width: 96, height: 96, flex: "none" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <div className="pn-skel" data-brilho="true" style={{ height: 22, width: "60%" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="pn-skel" data-brilho="true" style={{ height: 54 }} />
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="pn-skel" data-brilho="true" style={{ height: 26 }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="pn-skel" data-brilho="true" style={{ height: 40 }} />
        ))}
      </div>
      <span className="rv-sr-only" role="status">Carregando o Console do Personagem…</span>
    </div>
  );
}

/**
 * A aba pedida, se ela existir de verdade — string de fora nunca vira
 * `TabId` no grito. A lista é COPIADA (e não importada de
 * `dev/character-sheet/components/CharacterSheetTabs`) de propósito:
 * aquele módulo arrasta a árvore inteira do console de desenvolvimento
 * pra dentro do pacote da mesa, e o preço é alto pra uma validação de
 * quinze strings. A ficha valida de novo do lado dela.
 */
const ABAS_DA_FICHA = [
  "geral", "atributos", "pericias", "recursos", "condicoes", "talentos", "magias",
  "inventario", "biblioteca", "acoes", "rolagens", "log", "mesa", "personagens", "debug",
] as const;

function abaValida(aba: string | null | undefined): string | undefined {
  if (!aba) return undefined;
  return (ABAS_DA_FICHA as readonly string[]).includes(aba) ? aba : undefined;
}

export function ConsoleNoVtt({
  campaignId,
  characterId,
  abaInicial,
  onFechar,
}: {
  campaignId: string;
  /** `null` = janela fechada. */
  characterId: string | null;
  /** Em qual aba a ficha abre — ver `ApiConsoleDaMesa.abrir`. */
  abaInicial?: string | null;
  onFechar: () => void;
}) {
  const consoleDaMesa = useConsoleDaMesa();
  const [abertura, setAbertura] = useState<AberturaConsole | null>(null);
  const [catalogos, setCatalogos] = useState<DadosConsole | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** Id já carregado — evita refazer tudo quando o mesmo personagem é reaberto. */
  const carregadoRef = useRef<string | null>(null);

  const carregar = useCallback(
    async (id: string) => {
      setErro(null);
      const r = await abrirConsoleAction(campaignId, id);
      if (!r.ok || !r.dados) {
        setErro(r.erro ?? "Falha ao abrir o Console.");
        return;
      }
      setAbertura(r.dados);
      carregadoRef.current = id;
      const cat = await buscarCatalogos(campaignId);
      if (cat) setCatalogos(cat);
    },
    [campaignId],
  );

  useEffect(() => {
    if (!characterId) return;
    // Reabrir o MESMO personagem reaproveita o que já está em memória —
    // a janela volta instantânea.
    if (carregadoRef.current === characterId && abertura) return;
    void carregar(characterId);
  }, [characterId, carregar, abertura]);

  if (!characterId) return null;

  const pronto = abertura && catalogos && !catalogos.erroFatal;

  // "Ver no mapa" precisa das DUAS pontas: um mapa montado (só o VTT
  // registra a câmera) e o personagem posicionado na cena. Faltando
  // qualquer uma, a ação não é oferecida.
  const focar = consoleDaMesa?.focarNoMapa ?? null;
  const tokenNaCena = abertura?.tokenNaCena ?? null;
  const verNoMapa = focar && tokenNaCena ? () => focar(tokenNaCena) : null;

  // Console pronto: ele monta a PRÓPRIA janela (`ConsoleWindow`). Só o
  // significado de "fechar" é redefinido.
  if (pronto) {
    return (
      <ConsoleCloseProvider onClose={onFechar} ancorado verNoMapa={verNoMapa}>
        {/* `data-janela-turno` diz em que janela do combate da MESA a
            ficha acredita estar — "fora" quando não há combate. Mesmo
            papel do `data-character-id` ao lado: é estado real da
            integração, exposto onde dá pra conferir. */}
        <div
          data-testid="painel-console"
          data-character-id={characterId}
          data-janela-turno={abertura.janelaDeTurno ?? "fora"}
        >
          <CharacterSheetClient
            regras={catalogos.regras}
            usandoFallback={catalogos.usandoFallback}
            personagensIniciais={[abertura.personagem]}
            mesasIniciais={[]}
            condicoesDisponiveis={catalogos.condicoesDisponiveis}
            condicoesParaAcoes={catalogos.condicoesParaAcoes}
            conditionContents={catalogos.conditionContents}
            combatActionsIniciais={catalogos.combatActions}
            combatActionsError={catalogos.combatActionsError}
            reactionRules={catalogos.reactionRules}
            talentsIniciais={catalogos.talents}
            talentsError={catalogos.talentsError}
            itemsIniciais={catalogos.items}
            itemsError={catalogos.itemsError}
            spellsIniciais={catalogos.spells}
            spellsError={catalogos.spellsError}
            propertiesIniciais={catalogos.properties}
            propertiesError={catalogos.propertiesError}
            runesIniciais={catalogos.runes}
            runesError={catalogos.runesError}
            escalposIniciais={catalogos.escalpos}
            escalposError={catalogos.escalposError}
            companionModelsIniciais={catalogos.companionModels}
            companionModelsError={catalogos.companionModelsError}
            initialTab={abaValida(abaInicial) as never}
            initialCampaignId={campaignId}
            initialCharacterId={characterId}
            janelaDeTurno={abertura.janelaDeTurno}
            mode="product"
          />
        </div>
      </ConsoleCloseProvider>
    );
  }

  // Shell imediato: a janela existe no mesmo quadro do clique, com
  // esqueleto de geometria próxima do conteúdo final.
  return (
    <JanelaInterna
      aberta
      titulo="Console do Personagem"
      subtitulo={abertura?.personagem.name}
      largura={980}
      altura={720}
      onFechar={onFechar}
      testId="painel-console-shell"
    >
      {erro ? (
        <EstadoErro mensagem={erro} onTentarDeNovo={() => characterId && carregar(characterId)} testId="painel-console-erro" />
      ) : (
        <EsqueletoConsole />
      )}
    </JanelaInterna>
  );
}
