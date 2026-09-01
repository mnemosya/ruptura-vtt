-- =====================================================================
-- 0068 — RPCs de semeadura da cena (narrador)
--
-- Achado por um browser check de ponta a ponta real (não pelas 25
-- checagens de `check-vtt-autorizacao.ts`, que usam o client de SERVICE
-- ROLE pra montar fixtures — bypassa GRANT e RLS por completo, então
-- nunca exercitou o caminho real de "narrador abre a mesa pela primeira
-- vez"): `garantirCenaSemente` (`_acoes/sceneActions.ts`) faz
-- `client.from("vtt_scenes").insert(...)` e depois
-- `client.from("vtt_tokens").insert(...)` usando o client ESCOPADO
-- (RLS como o usuário logado) — e a 0065 nunca concedeu `insert` em
-- NENHUMA das duas tabelas pra `authenticated`, só `select`
-- (`vtt_scenes`) e `select, update` (`vtt_tokens`, e o `update` foi
-- revogado na 0066). Toda primeira carga de narrador falhava com
-- "permission denied for table vtt_scenes" — travando a tela em
-- "carregando" pra sempre (a `VttClient.tsx` correspondente ganhou um
-- `.catch()` nesta mesma leva de correções pra nunca mais travar
-- silenciosamente, mas a causa raiz é de GRANT/RLS, não de React).
--
-- Correção, no mesmo espírito da 0066 (RPCs `SECURITY DEFINER` estreitas
-- em vez de GRANT amplo de escrita): duas funções, cada uma checando
-- `is_campaign_owner` no CORPO (não só RLS) e devolvendo a linha criada
-- OU a já existente (idempotência real — corrida de duas abas abrindo a
-- mesa ao mesmo tempo não duplica cena nem tokens).
-- =====================================================================

create or replace function seed_vtt_scene(
  p_campaign_id uuid,
  p_nome text,
  p_local text,
  p_resumo text,
  p_largura integer,
  p_altura integer
) returns vtt_scenes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existente vtt_scenes;
  v_nova vtt_scenes;
begin
  if not is_campaign_owner(p_campaign_id, auth.uid()) then
    raise exception 'Só o narrador pode semear a cena inicial.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_existente from vtt_scenes
    where campaign_id = p_campaign_id and ativa = true
    order by created_at asc limit 1;
  if found then
    return v_existente;
  end if;

  insert into vtt_scenes (campaign_id, nome, local, resumo, largura, altura)
    values (p_campaign_id, p_nome, p_local, p_resumo, p_largura, p_altura)
    returning * into v_nova;
  return v_nova;
end;
$$;

comment on function seed_vtt_scene is
  'Cria (ou devolve, se já existir) a cena ativa da campanha — narrador-only, idempotente. Contorna a ausência deliberada de GRANT insert em vtt_scenes pra authenticated.';

-- `setof` porque semeia VÁRIOS tokens de uma vez (o elenco inteiro da
-- cena de demonstração) — uma chamada, não N.
create or replace function seed_vtt_tokens(
  p_scene_id uuid,
  p_campaign_id uuid,
  p_tokens jsonb
) returns setof vtt_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ja_existe boolean;
begin
  if not is_campaign_owner(p_campaign_id, auth.uid()) then
    raise exception 'Só o narrador pode semear tokens.' using errcode = 'insufficient_privilege';
  end if;

  select exists(select 1 from vtt_tokens where scene_id = p_scene_id) into v_ja_existe;
  if v_ja_existe then
    return query select * from vtt_tokens where scene_id = p_scene_id;
    return;
  end if;

  return query
    insert into vtt_tokens (scene_id, campaign_id, character_id, nome, sigla, lado, vertente, q, r, tamanho)
    select
      p_scene_id, p_campaign_id, null,
      t->>'nome', t->>'sigla', t->>'lado', t->>'vertente',
      (t->>'q')::integer, (t->>'r')::integer, t->>'tamanho'
    from jsonb_array_elements(p_tokens) as t
    returning *;
end;
$$;

comment on function seed_vtt_tokens is
  'Semeia o elenco de tokens de uma cena recém-criada — narrador-only, idempotente (não duplica se a cena já tem tokens). Contorna a ausência deliberada de GRANT insert em vtt_tokens pra authenticated.';
