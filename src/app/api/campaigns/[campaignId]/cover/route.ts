import { getCampaign } from "../../../../../lib/table/storage";
import { getAdminSupabaseClient } from "../../../../../lib/supabase/adminClient";
import { COVER_BUCKET } from "../../../../../lib/campaign/coverService";

export async function GET(_request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await context.params;
  const campaign = await getCampaign(campaignId);
  if (!campaign?.cover_path) return new Response(null, { status: 404 });
  const admin = getAdminSupabaseClient();
  if (!admin) return new Response(null, { status: 503 });
  const { data, error } = await admin.storage.from(COVER_BUCKET).download(campaign.cover_path);
  if (error || !data) return new Response(null, { status: 404 });
  // Quem pede manda `?v=<cover_path>`, e o caminho muda a cada troca de capa:
  // a mesma URL nunca serve outra imagem, então o navegador pode guardá-la de
  // vez (antes eram 5 min, e a cortina de entrada na mesa esperava o download).
  const versionada = new URL(_request.url).searchParams.has("v");
  return new Response(data.stream(), {
    headers: { "Content-Type": "image/webp", "Cache-Control": versionada ? "private, max-age=31536000, immutable" : "private, max-age=300" },
  });
}
