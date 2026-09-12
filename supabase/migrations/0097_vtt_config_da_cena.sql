-- =====================================================================
-- 0097 — Configurações da Cena: nome, local, resumo e tamanho da grade
--
-- O botão "Configurações da cena" existia na barra do VTT SEM `onClick`
-- desde sempre: não havia janela nem caminho de escrita. `vtt_scenes`
-- tem só SELECT para `authenticated` (migration 0065), então toda
-- escrita passa por RPC — esta é a do narrador para os campos que a
-- cena de fato modela.
--
-- Fora de escopo, de propósito: escala (1 célula = 1 m é constante do
-- sistema, não configuração) e as permissões que apareciam na maquete
-- ("jogadores podem criar áreas", "bloquear movimento fora do turno") —
-- não existem no schema, e um controle que não controla nada é pior que
-- controle nenhum.
--
-- Encolher a grade NÃO apaga nada: tokens e objetos fora da nova área
-- continuam no banco. A janela avisa; o servidor não destrói.
-- =====================================================================

begin;

create or replace function public.set_vtt_scene_config(
  p_scene_id uuid,
  p_nome text,
  p_local text,
  p_resumo text,
  p_largura integer,
  p_altura integer,
  p_expected_revision integer
) returns vtt_scenes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_scene vtt_scenes;
  v_nome text;
begin
  select * into v_scene from public.vtt_scenes where id = p_scene_id for update;
  if v_scene.id is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_scene.campaign_id, auth.uid()) then
    raise exception 'Só o narrador altera a cena.' using errcode = '42501';
  end if;
  if v_scene.revision <> p_expected_revision then
    raise exception 'A cena mudou enquanto você editava.' using errcode = 'serialization_failure';
  end if;

  -- Nome em branco volta pro que estava: a cena sempre tem nome (a
  -- coluna é `not null`), e apagar o campo não é o mesmo que pedir
  -- uma cena sem nome.
  v_nome := coalesce(nullif(btrim(p_nome), ''), v_scene.nome);

  -- Faixa igual à do `check` da tabela (1..200). Recusa explícita em
  -- vez de deixar a constraint estourar com mensagem de banco.
  if p_largura is null or p_altura is null
     or p_largura not between 1 and 200 or p_altura not between 1 and 200 then
    raise exception 'Largura e altura precisam estar entre 1 e 200 células.' using errcode = 'invalid_parameter_value';
  end if;

  update public.vtt_scenes
     set nome = v_nome,
         local = nullif(btrim(coalesce(p_local, '')), ''),
         resumo = nullif(btrim(coalesce(p_resumo, '')), ''),
         largura = p_largura,
         altura = p_altura,
         revision = revision + 1
   where id = p_scene_id
  returning * into v_scene;
  return v_scene;
end;
$$;

revoke all on function public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer) from public, anon;
grant execute on function public.set_vtt_scene_config(uuid, text, text, text, integer, integer, integer) to authenticated;

commit;
