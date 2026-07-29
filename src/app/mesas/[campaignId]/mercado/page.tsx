/**
 * Mercado (aditivo §5.1) — loja, compra de itens e envio para
 * personagem/bando. Essa lógica já existe inteira dentro da ficha
 * (aba Inventário → "Loja do Mercado Noturno", InventoryTab.tsx) e
 * opera sobre o inventário/carteira de UM personagem por vez — não
 * duplicada aqui.
 *
 * Esta página é só o ponto de entrada a partir do menu da campanha:
 * com um personagem só, abre direto nele (aditivo §10.1, "sistema
 * escolhe automaticamente quando só existe uma opção válida"); com
 * vários, mostra um seletor; sem nenhum, orienta a próxima ação.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveCampaignAccess } from "../../../../lib/campaign/access";
import { listCharactersForNarratorCampaign, listControlledCharacters } from "../../../../lib/character/storage";
import type { CharacterRecord } from "../../../../lib/character";
import { btnPrimary, emptyState, pageContainer, text } from "../_shell/theme";
import { CharacterPickerList } from "../_shell/CharacterPickerList";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function MercadoPage({ params }: PageProps) {
  const { campaignId } = await params;
  const access = await resolveCampaignAccess(campaignId);
  if (access.kind !== "ok") return null;

  const isNarrator = access.role === "narrator";
  let personagens: CharacterRecord[] = [];
  try {
    personagens = isNarrator
      ? (await listCharactersForNarratorCampaign(campaignId)).filter((c) => !c.archived_at)
      : await listControlledCharacters(campaignId);
  } catch {
    personagens = [];
  }

  if (personagens.length === 1) {
    redirect(`/ficha?campaignId=${campaignId}&characterId=${personagens[0].id}&tab=inventario`);
  }

  return (
    <main style={pageContainer(640)}>
      <h1 style={{ ...text.h1, marginBottom: 8 }}>Mercado</h1>
      <p style={{ ...text.faint, marginBottom: 20 }}>
        A loja é operada pela ficha de cada personagem. Escolha um personagem para abrir o Mercado.
      </p>

      {personagens.length === 0 ? (
        <div style={emptyState}>
          <p style={{ margin: 0 }}>
            {isNarrator ? "Nenhum personagem nesta campanha ainda." : "Você ainda não controla um personagem nesta campanha."}
          </p>
          <Link href={`/mesas/${campaignId}/personagens/novo`} className="rv-btn rv-focusable" style={{ ...btnPrimary, display: "inline-block", textDecoration: "none", marginTop: 12 }}>
            Criar personagem
          </Link>
        </div>
      ) : (
        <CharacterPickerList campaignId={campaignId} personagens={personagens} tab="inventario" actionLabel="Abrir Mercado" />
      )}
    </main>
  );
}
