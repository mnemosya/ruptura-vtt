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
  return new Response(data.stream(), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=300" } });
}
