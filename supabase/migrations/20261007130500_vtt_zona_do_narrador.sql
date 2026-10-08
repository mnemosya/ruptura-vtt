-- =====================================================================
-- TOK-03 — Zona do narrador.
--
-- Uma área `personalizada` (polígono) marcada como `zona_narrador`:
-- token que o NARRADOR põe ou move para dentro dela passa a ser
-- visível só para ele (`vtt_tokens.visivel = false`, TOK-02).
--
-- ── Decisões ─────────────────────────────────────────────────────────
--
--   · Região do mapa, por cena, quantas quiser. Reusa `vtt_areas` —
--     desenho, edição, realtime e RLS já existem.
--   · Só polígono: o teste "célula dentro" é feito no banco, e
--     ponto-em-polígono em coordenada axial é exato (axial → mundo é
--     afim, preserva pertinência). Os outros formatos exigiriam portar
--     a geometria de `areaEfeito.ts` para SQL.
--   · A zona é sempre invisível para jogador (check abaixo): com
--     `visivel = false` e criador = narrador, a policy de `vtt_areas`
--     já não a entrega a ninguém além do dono.
--   · Entrar oculta; SAIR NÃO REVELA. Revelar automático é o caminho
--     para mostrar algo sem querer; revelar continua um gesto explícito.
--   · Só escrita do NARRADOR dispara. Se o jogador arrastasse o próprio
--     personagem para dentro, o token sumiria da tela dele — e a zona
--     invisível seria denunciada.
--   · O gatilho é BEFORE: posição e ocultação saem na MESMA linha, no
--     mesmo `tokens_changed`. Não existe instante em que o jogador
--     receba o token já dentro da zona e ainda visível.
--   · Só dispara quando a POSIÇÃO muda (ou na criação). O narrador pode
--     revelar um token que está dentro da zona sem ser desfeito.
-- =====================================================================

begin;

alter table public.vtt_areas
  add column if not exists zona_narrador boolean not null default false;

alter table public.vtt_areas
  drop constraint if exists vtt_areas_zona_narrador_forma;
alter table public.vtt_areas
  add constraint vtt_areas_zona_narrador_forma
  check (not zona_narrador or (tipo = 'personalizada' and not visivel));

comment on column public.vtt_areas.zona_narrador is
  'TOK-03: token posto/movido pelo narrador dentro deste polígono fica visivel=false. Sempre invisível para jogadores.';

create index if not exists vtt_areas_zona_narrador_idx
  on public.vtt_areas (scene_id) where zona_narrador;

-- Ponto-em-polígono (ray casting) sobre [{q,r}, …] axial.
create or replace function public.vtt_poligono_contem(p_pontos jsonb, p_q numeric, p_r numeric)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  n integer;
  i integer;
  j integer;
  qi numeric; ri numeric; qj numeric; rj numeric;
  dentro boolean := false;
begin
  if p_pontos is null or p_q is null or p_r is null or jsonb_typeof(p_pontos) <> 'array' then
    return false;
  end if;
  n := jsonb_array_length(p_pontos);
  if n < 3 then return false; end if;
  j := n - 1;
  for i in 0 .. n - 1 loop
    qi := (p_pontos -> i ->> 'q')::numeric; ri := (p_pontos -> i ->> 'r')::numeric;
    qj := (p_pontos -> j ->> 'q')::numeric; rj := (p_pontos -> j ->> 'r')::numeric;
    if ((ri > p_r) <> (rj > p_r))
       and (p_q < (qj - qi) * (p_r - ri) / (rj - ri) + qi) then
      dentro := not dentro;
    end if;
    j := i;
  end loop;
  return dentro;
end;
$$;

create or replace function public.vtt_celula_em_zona_narrador(p_scene_id uuid, p_q numeric, p_r numeric)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from vtt_areas a
    where a.scene_id = p_scene_id
      and a.zona_narrador
      and vtt_poligono_contem(a.pontos, p_q, p_r)
  );
$$;

revoke all on function public.vtt_poligono_contem(jsonb, numeric, numeric) from public, anon;
revoke all on function public.vtt_celula_em_zona_narrador(uuid, numeric, numeric) from public, anon, authenticated;

create or replace function public.vtt_tokens_aplica_zona_narrador()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.visivel
     and auth.uid() is not null
     and is_campaign_owner(new.campaign_id)
     and (
       tg_op = 'INSERT'
       or new.q is distinct from old.q
       or new.r is distinct from old.r
       or new.scene_id is distinct from old.scene_id
     )
     and vtt_celula_em_zona_narrador(new.scene_id, new.q, new.r)
  then
    new.visivel := false;
  end if;
  return new;
end;
$$;

drop trigger if exists vtt_tokens_zona_narrador on public.vtt_tokens;
create trigger vtt_tokens_zona_narrador
  before insert or update on public.vtt_tokens
  for each row execute function public.vtt_tokens_aplica_zona_narrador();

-- Liga/desliga a zona. Idempotente.
create or replace function public.set_vtt_area_zona_narrador(
  p_area_id uuid,
  p_ativa boolean,
  p_expected_revision integer
)
returns setof public.vtt_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_area vtt_areas;
begin
  select * into v_area from vtt_areas where id = p_area_id for update;
  if v_area.id is null or not is_campaign_owner(v_area.campaign_id) then
    raise exception 'Só o narrador pode marcar uma zona do narrador.' using errcode = '42501';
  end if;
  if v_area.tipo <> 'personalizada' then
    raise exception 'Zona do narrador só vale para Área personalizada.' using errcode = '22023';
  end if;
  if v_area.revision <> p_expected_revision then
    raise exception 'A área mudou desde que você abriu. Recarregue e tente de novo.' using errcode = '40001';
  end if;

  update vtt_areas
     set zona_narrador = p_ativa,
         visivel = case when p_ativa then false else visivel end,
         revision = revision + 1,
         updated_at = now()
   where id = p_area_id
  returning * into v_area;

  -- Os tokens que já estão dentro são ocultados pelo gatilho abaixo.
  return next v_area;
end;
$$;

-- Ligar a zona, ou redesenhar o polígono de uma zona, oculta o que
-- ficou dentro — a mesma regra de "entrar", aplicada de uma vez.
create or replace function public.vtt_areas_aplica_zona_narrador()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.zona_narrador
     and (tg_op = 'INSERT' or not old.zona_narrador or new.pontos is distinct from old.pontos)
  then
    update vtt_tokens t
       set visivel = false, revision = t.revision + 1, updated_at = now()
     where t.scene_id = new.scene_id
       and t.visivel
       and vtt_poligono_contem(new.pontos, t.q, t.r);
  end if;
  return null;
end;
$$;

drop trigger if exists vtt_areas_zona_narrador on public.vtt_areas;
create trigger vtt_areas_zona_narrador
  after insert or update on public.vtt_areas
  for each row execute function public.vtt_areas_aplica_zona_narrador();

revoke all on function public.set_vtt_area_zona_narrador(uuid, boolean, integer) from public, anon;
grant execute on function public.set_vtt_area_zona_narrador(uuid, boolean, integer) to authenticated;

commit;
