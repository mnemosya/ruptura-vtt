#!/usr/bin/env bash
#
# Monta do ZERO o banco descartável onde o replay roda.
#
# POR QUE NÃO `supabase start`: nesta máquina o CLI não completa. O
# passo "Initialising schema" morre com SIGSEGV (exit 139), e a causa é
# o Node das imagens de serviço do Supabase não executar sob o Docker
# Desktop 29.7.2 em arm64 — reproduzível em uma linha:
#
#   docker run --rm public.ecr.aws/supabase/storage-api:v1.72.1 \
#     node -e 'console.log(1)'   # → exit 139, sem saída
#
# Não é problema das migrations deste projeto, e não é contornável
# daqui: depende da versão do Docker Desktop ou das imagens.
#
# O que este script monta, então, é o mínimo que se PARECE com um
# Supabase de verdade:
#
#   1. `supabase/postgres` puro — traz `auth`, `extensions`, `vault`,
#      `graphql` e a publicação `supabase_realtime` de graça. Esta
#      imagem roda bem (é C, não Node);
#   2. o serviço `realtime` rodado UMA vez — é Elixir, roda, e as
#      migrations dele criam `realtime.messages`, que a 0062 exige;
#   3. `replay-plataforma.sql` — o andaime para a única coisa que
#      sobrou: `storage.buckets`, que o `storage-api` criaria se
#      executasse. Ver o cabeçalho daquele arquivo.
#
# Uso:  bash scripts/dev/replay-ambiente.sh
# Depois: npm run db:replay && npm run db:verificar-replay
set -euo pipefail

DOCKER="${DOCKER:-$HOME/.docker/bin/docker}"
PG_IMAGE="public.ecr.aws/supabase/postgres:17.6.1.167"
RT_IMAGE="public.ecr.aws/supabase/realtime:v2.130.0"
JWT="super-secret-jwt-token-with-at-least-32-characters-long"

echo "→ derrubando o ambiente anterior"
"$DOCKER" rm -f rv-replay rv-realtime >/dev/null 2>&1 || true

echo "→ subindo postgres ($PG_IMAGE)"
"$DOCKER" run -d --name rv-replay \
  -e POSTGRES_PASSWORD=postgres -p 54322:5432 "$PG_IMAGE" >/dev/null
until "$DOCKER" exec rv-replay pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done

# O serviço de realtime aponta seu `search_path` para `_realtime`, que a
# imagem crua não cria (quem cria é o CLI). Sem isso o migrator dele
# morre com "no schema has been selected to create in".
"$DOCKER" exec rv-replay psql -U supabase_admin -d postgres \
  -c 'create schema if not exists _realtime;' >/dev/null

echo "→ rodando as migrations do realtime"
"$DOCKER" run -d --name rv-realtime --link rv-replay:db \
  -e PORT=4000 -e DB_HOST=db -e DB_PORT=5432 -e DB_USER=supabase_admin \
  -e DB_PASSWORD=postgres -e DB_NAME=postgres \
  -e DB_AFTER_CONNECT_QUERY='SET search_path TO _realtime' \
  -e DB_ENC_KEY=supabaserealtime \
  -e API_JWT_SECRET="$JWT" -e METRICS_JWT_SECRET="$JWT" \
  -e SECRET_KEY_BASE=EAx3IBZzcsSaaGiK6UkxSBrOe2wSbEDVwUNfxbJDfVXPGWpeVvdW1EkXB5UbYzkrvWmWbrfpzrXKdoNMkRVJvA \
  -e APP_NAME=realtime -e SEED_SELF_HOST=true -e RUN_JANITOR=false \
  -e ERL_AFLAGS='-proto_dist inet_tcp' -e DNS_NODES="''" \
  "$RT_IMAGE" >/dev/null 2>&1

until "$DOCKER" exec rv-replay psql -U supabase_admin -d postgres -tAc \
  "select to_regclass('realtime.messages')" 2>/dev/null | grep -q "realtime.messages"; do
  sleep 3
done

echo "→ aplicando o andaime de plataforma"
"$DOCKER" exec -i rv-replay psql -U supabase_admin -d postgres \
  < "$(dirname "$0")/replay-plataforma.sql" >/dev/null

echo
echo "Banco limpo em postgresql://postgres:postgres@127.0.0.1:54322/postgres"
echo "Agora:  npm run db:replay  &&  npm run db:verificar-replay"
