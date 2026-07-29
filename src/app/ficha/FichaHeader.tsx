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
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CharacterRecord } from "../../lib/character";
import type { CampaignRole } from "../../lib/campaign/access";
import { badge, color } from "../mesas/[campaignId]/_shell/theme";

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
  // O personagem da URL pode não existir na lista (removido, controle
  // revogado, id inválido) — nesse caso o <select> não deve fingir que
  // outro personagem qualquer está "selecionado" (o navegador cairia na
  // primeira opção por padrão); mostra o placeholder em vez disso.
  const currentIsListed = !!currentCharacterId && personagens.some((c) => c.id === currentCharacterId);

  function handleSwitch(characterId: string) {
    if (!characterId || characterId === currentCharacterId) return;
    router.push(`/ficha?campaignId=${campaignId}&characterId=${characterId}`);
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 20px",
        borderBottom: `1px solid ${color.borderSubtle}`,
        flexWrap: "wrap",
        background: color.bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Link
          href={`/mesas/${campaignId}/personagens`}
          data-testid="ficha-voltar-personagens"
          className="rv-focusable"
          style={{ color: color.accent, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          ← Personagens
        </Link>
        <span style={{ opacity: 0.3 }}>/</span>
        <span
          style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}
          title={campaignName}
        >
          {campaignName}
        </span>
        <span style={badge(role)}>{role === "narrator" ? "Narrador" : "Jogador"}</span>
      </div>

      {personagens.length > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span style={{ opacity: 0.6 }}>Personagem</span>
          <select
            data-testid="ficha-seletor-personagem"
            value={currentIsListed ? currentCharacterId! : ""}
            onChange={(e) => handleSwitch(e.target.value)}
            className="rv-focusable"
            aria-label="Trocar de personagem"
            style={{
              background: color.surface,
              color: "inherit",
              border: `1px solid ${color.border}`,
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              maxWidth: 220,
            }}
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
}
