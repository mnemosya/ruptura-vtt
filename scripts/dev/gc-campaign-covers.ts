/** Remove capas sem referência após uma criação falha ou exclusão de campanha. */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários.");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let foldersOffset = 0;
let removed = 0;
while (true) {
  const { data: folders, error } = await admin.storage.from("campaign-covers").list("", { limit: 100, offset: foldersOffset });
  if (error) throw error;
  if (!folders?.length) break;
  for (const folder of folders) {
    if (folder.id) continue;
    let offset = 0;
    while (true) {
      const { data: files, error: listError } = await admin.storage.from("campaign-covers").list(folder.name, { limit: 100, offset });
      if (listError) throw listError;
      if (!files?.length) break;
      const { data: campaign, error: readError } = await admin.from("campaigns")
        .select("cover_path").eq("id", folder.name).maybeSingle();
      if (readError) throw readError;
      const stale = files.filter((file) =>
        `${folder.name}/${file.name}` !== campaign?.cover_path &&
        !!file.created_at && Date.now() - new Date(file.created_at).getTime() > 60 * 60 * 1000,
      );
      if (stale.length) {
        const { error: removeError } = await admin.storage.from("campaign-covers").remove(stale.map((file) => `${folder.name}/${file.name}`));
        if (removeError) throw removeError;
        removed += stale.length;
      }
      offset += files.length - stale.length;
      if (files.length < 100) break;
    }
  }
  foldersOffset += folders.length;
  if (folders.length < 100) break;
}
console.log(`Capas órfãs removidas: ${removed}`);
