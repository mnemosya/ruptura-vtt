"use client";

/**
 * Cabeçalho da ficha (Fase 5, aditivo §9.4/§10/§16.7) — envolve a
 * ficha por FORA, sem tocar em `CharacterSheetClient.tsx`. Entrega:
 *
 *   - campanha e papel identificáveis (aditivo §9 princípio 8);
 *   - retorno fácil para Personagens (§9.4, §16.7);
 *   - seletor de personagem persistente e fácil de encontrar (§10.2) —
 *     narrador troca entre qualquer ficha da campanha, jogador troca
 *     entre os que controla.
 *
 * A troca acontece por NAVEGAÇÃO (nova URL `?characterId=...`), nunca
 * por estado interno trocado dentro do componente já montado da ficha
 * — "não implementar ainda troca interna de personagem" é
 * explicitamente Fase 5+1. Por isso este componente não importa nada
 * de `CharacterSheetClient.tsx`.
 *
 * Classes `.rc-fichaheader*` em `console.css` (Fase 6, auditoria
 * pós-fechamento) — não `rm-*`: este arquivo é `/ficha`, área fora da
 * reestrutura de campanha, e renderiza ACIMA de `CharacterSheetView`,
 * fora do `.rc-window-wrap` que escopa os tokens `--cy`/`--rc-*` do
 * Console. Paleta própria, sem depender desse escopo — por isso os
 * valores das classes são literais, não `var(--rc-*)`. O import do
 * arquivo CSS aqui é redundante com o de `ConsoleWindow.tsx`
 * (deduplicado pelo bundler) — deliberado: este componente não deve
 * depender de UM IRMÃO específico na árvore já ter importado a folha.
 *
 * PORTAL pro `document.body` (auditoria pós-Fase-6, segunda rodada) —
 * dois problemas reais, um deles maior do que o relatado:
 *
 *   1. (o relatado) Aberto via modal (`@modal/(...)ficha`), o header
 *      caía no fluxo normal de documento — `src/app/mesas/layout.tsx`
 *      renderiza `{modal}` como IRMÃO comum de `{children}`
 *      (`<>{children}{modal}</>`), sem overlay/fixed/portal próprio, e
 *      só a JANELA do Console escapa disso sozinha via
 *      `createPortal(..., document.body)` (`ConsoleWindow.tsx`). Sem
 *      portal aqui também, o header ficava empurrado pra baixo de TODO
 *      o conteúdo da página de origem (Personagens) — na prática fora
 *      da área visível.
 *   2. (achado ao investigar o 1º, mais grave) MESMO na rota DIRETA
 *      `/ficha` — onde o header já ficava corretamente em y=0 — ele
 *      nunca foi clicável de verdade: `.rc-backdrop` (`console.css`,
 *      `position: fixed; inset: 0; z-index: 500`) cobre a tela inteira
 *      por CIMA de qualquer elemento estático (o `<header>` sem
 *      z-index próprio), então cliques em "← Personagens" ou no
 *      seletor de personagem eram capturados pelo backdrop, não pelo
 *      header — confirmado com um clique de verdade (Playwright),
 *      não só inspeção visual (que mostrava o texto, porque o backdrop
 *      é semi-transparente com blur, mascarando que o clique nunca
 *      chegava lá). Pré-existente desde que o backdrop foi introduzido
 *      — nenhum script desta sessão jamais tinha clicado nesses dois
 *      elementos antes de agora.
 *
 * Portal + `position: fixed` (`.rc-fichaheader` em `console.css`) com
 * `z-index: 510` — acima do backdrop (500) e da janela (501), abaixo
 * dos modais auxiliares do Console (520, que devem continuar podendo
 * bloquear o header enquanto abertos) — resolve os dois de uma vez: a
 * posição fica sempre relativa ao VIEWPORT (nunca ao fluxo de quem
 * estiver por baixo, modal ou não) e a pilha de empilhamento sempre
 * acima do backdrop/janela, nos dois pontos de entrada, com o MESMO
 * código. `src/app/mesas/layout.tsx` (compartilhado por toda
 * `/mesas`) e `src/app/ficha/page.tsx` (rota direta) continuam
 * intocados — o fix inteiro vive neste arquivo + `console.css`.
 *
 * `montado` (client-only, `useEffect`): SSR não tem `document` — gerar
 * o portal antes do primeiro efeito do cliente causaria um mismatch de
 * hidratação. Mesmo padrão já usado pro `sessionMountId` do provider
 * da campanha (Fase 3) pro mesmo motivo. Custo: o header aparece um
 * tick depois do resto da página, nunca antes — aceitável pra um
 * elemento que não é conteúdo crítico (a ficha em si carrega
 * independente dele).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CharacterRecord } from "../../lib/character";
import type { CampaignRole } from "../../lib/campaign/access";
import "../_design/console.css";

export function FichaHeader({
  campaignId,
  campaignName,
  role,
  currentCharacterId,
  personagens,
}: {
  campaignId: string;
  campaignName: string;
  role: CampaignRole;
  /** null quando o personagem da URL não foi encontrado/autorizado — o seletor ainda ajuda a sair desse estado. */
  currentCharacterId: string | null;
  personagens: CharacterRecord[];
}) {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  // O personagem da URL pode não existir na lista (removido, controle
  // revogado, id inválido) — nesse caso o <select> não deve fingir que
  // outro personagem qualquer está "selecionado" (o navegador cairia na
  // primeira opção por padrão); mostra o placeholder em vez disso.
  const currentIsListed = !!currentCharacterId && personagens.some((c) => c.id === currentCharacterId);

  function handleSwitch(characterId: string) {
    if (!characterId || characterId === currentCharacterId) return;
    // `replace`, não `push` (auditoria pós-portal, achado real): o
    // seletor troca QUAL ficha ocupa a tela atual, não abre uma ficha
    // nova em cima da anterior — empilhar entradas de histórico fazia
    // "Fechar console" (`router.back()`, 1 passo só) desfazer a última
    // TROCA em vez de fechar o modal, sempre que houve pelo menos uma
    // troca antes de fechar (o próprio fluxo que o seletor existe pra
    // oferecer). Mesmo raciocínio vale pra `/ficha` direta: trocar de
    // personagem substitui a ficha atual, então o botão Voltar do
    // navegador leva pra onde o usuário estava ANTES de abrir a ficha,
    // não para uma versão anterior dela.
    router.replace(`/ficha?campaignId=${campaignId}&characterId=${characterId}`);
  }

  const conteudo = (
    <header className="rc-fichaheader">
      <div className="rc-fichaheader-crumbs">
        <Link href={`/mesas/${campaignId}/vtt`} data-testid="ficha-voltar-personagens" className="rc-fichaheader-voltar rv-focusable">
          ← Personagens
        </Link>
        <span className="rc-fichaheader-sep">/</span>
        <span className="rc-fichaheader-nome" title={campaignName}>{campaignName}</span>
        <span className={`rc-fichaheader-badge rc-fichaheader-badge--${role === "narrator" ? "narrator" : "player"}`}>
          {role === "narrator" ? "Narrador" : "Jogador"}
        </span>
      </div>

      {personagens.length > 0 && (
        <label className="rc-fichaheader-seletor">
          <span className="rc-fichaheader-seletor-rotulo">Personagem</span>
          <select
            data-testid="ficha-seletor-personagem"
            value={currentIsListed ? currentCharacterId! : ""}
            onChange={(e) => handleSwitch(e.target.value)}
            className="rc-fichaheader-select rv-focusable"
            aria-label="Trocar de personagem"
          >
            {!currentIsListed && <option value="">— selecionar —</option>}
            {personagens.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}
    </header>
  );

  if (!montado) return null;
  return createPortal(conteudo, document.body);
}
