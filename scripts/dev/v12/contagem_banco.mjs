// Contagem de linhas do banco remoto (só leitura). Usado antes e depois de
// rodar scripts que criam fixtures, para achar sobras. Rodar: node scripts/dev/v12/contagem_banco.mjs
import pg from "pg"; import fs from "fs";

const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^"|"$/g,"")]));
const c=new pg.Client({connectionString:env.SUPABASE_DB_URL});await c.connect();
const q=async s=>Number((await c.query(s)).rows[0].n);
console.log(JSON.stringify({usuarios:await q("select count(*) n from auth.users"),campanhas:await q("select count(*) n from campaigns"),personagens:await q("select count(*) n from characters"),v1:await q("select count(*) n from characters where coalesce(payload->>'schema_version','1')<>'2'"),tokens:await q("select count(*) n from vtt_tokens"),cenas:await q("select count(*) n from vtt_scenes"),bandos:await q("select count(*) n from campaign_crews")}));
await c.end();
