/**
 * Mercado (aditivo §5.1) — loja, compra de itens e envio para
 * personagem/bando. Essa lógica já existe inteira dentro da ficha
 * (aba Inventário → "Loja do Mercado Noturno", InventoryTab.tsx) e
 * opera sobre o inventário/carteira de UM personagem por vez — não
 * duplicada aqui.
 *
 * Esta página é só o ponto de entrada a partir do menu da campanha:
 * com vários personagens, mostra um seletor; com um só ou nenhum,
 * mostra esse estado já resolvido na tela, com uma ação explícita.
 *
 * SEM auto-redirect de servidor pro caso de 1 personagem só (correção
 * #13 do plano da Fase 4 — mesma decisão de Personagens): a versão
 * anterior tinha `redirect()` quando `personagens.length === 1`,
 * navegando pra fora da campanha sem clique nenhum. `CharacterPickerList`
 * já funciona igual com 1 ou vários itens — a lista de 1 card com
 * "Abrir Mercado" já É "o personagem mostrado com uma ação explícita".
 */
import Link from "next/link";
import { resolveCampaignAccess } from "../../../../lib/campaign/access";
import { listCharactersForNarratorCampaign, listControlledCharacters } from "../../../../lib/character/storage";
import type { CharacterRecord } from "../../../../lib/character";
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
      ? await listCharactersForNarratorCampaign(campaignId)
      : await listControlledCharacters(campaignId);
    personagens = personagens.filter((c) => !c.archived_at);
  } catch {
    personagens = [];
  }

  return (
    <main className="rm-page" style={{ maxWidth: 640 }}>
      <h1 className="rm-page-title" style={{ marginBottom: 8 }}>Mercado</h1>
      <p className="rm-faint" style={{ marginBottom: 20 }}>
        A loja é operada pela ficha de cada personagem. Escolha um personagem para abrir o Mercado.
      </p>

      {personagens.length === 0 ? (
        <div className="rm-empty">
          <p style={{ margin: 0 }}>
            {isNarrator ? "Nenhum personagem nesta campanha ainda." : "Você ainda não controla um personagem nesta campanha."}
          </p>
          <Link href={`/mesas/${campaignId}/personagens/novo`} className="rm-btn rm-btn-primary rv-focusable" style={{ marginTop: 12 }}>
            Criar personagem
          </Link>
        </div>
      ) : (
        <CharacterPickerList campaignId={campaignId} personagens={personagens} tab="inventario" actionLabel="Abrir Mercado" />
      )}
    </main>
  );
}
