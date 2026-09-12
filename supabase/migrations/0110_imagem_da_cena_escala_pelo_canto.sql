-- ═══════════════════════════════════════════════════════════════════
-- 0110 — Escalar uma imagem pelo CANTO move o centro junto.
--
-- `atualizar_vtt_scene_image` (0100) mexe em tudo menos na posição, e
-- `mover_vtt_scene_image` mexe só na posição. Isso bastava enquanto
-- escalar era uniforme a partir do CENTRO — o centro não mudava.
--
-- Arrastar um canto, porém, é o gesto que todo VTT tem (e o que a
-- referência pede): o canto oposto fica PARADO e a imagem cresce na
-- direção do ponteiro. Geometricamente, isso muda largura E centro ao
-- mesmo tempo.
--
-- Fazer isso com as duas RPCs existentes seria escrever DUAS vezes por
-- gesto: a segunda chamada chegaria com a revisão que a primeira
-- acabou de invalidar, e quem estivesse assistindo veria a imagem
-- crescer e só depois pular de lugar. Uma escrita, uma revisão, um
-- evento: o centro entra como parâmetro opcional aqui.
--
-- `null` continua significando "não mexa neste campo", como todos os
-- outros. E a validação de geometria roda com o centro NOVO — sangrar
-- além da grade é permitido, cobrir dezesseis mapas não, e isso não
-- pode depender de qual RPC escreveu.
-- ═══════════════════════════════════════════════════════════════════

create or replace function atualizar_vtt_scene_image(
  p_id                uuid,
  p_expected_revision integer,
  p_largura_m         numeric default null,
  p_altura_m          numeric default null,
  p_rotacao_graus     numeric default null,
  p_opacidade         numeric default null,
  p_camada            text default null,
  p_z                 integer default null,
  p_visivel           boolean default null,
  p_travado           boolean default null,
  p_limpar_altura     boolean default false,
  p_centro_q          numeric default null,
  p_centro_r          numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_si         vtt_scene_images;
  v_largura    numeric;
  v_altura     numeric;
  v_centro_q   numeric;
  v_centro_r   numeric;
begin
  select * into v_si from vtt_scene_images where id = p_id for update;
  if v_si is null then
    raise exception 'Imagem não encontrada.' using errcode = 'no_data_found';
  end if;
  perform vtt_exigir_narrador_da_cena(v_si.scene_id);
  if v_si.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já alterou esta imagem.' using errcode = 'check_violation';
  end if;

  v_largura  := coalesce(p_largura_m, v_si.largura_m);
  v_altura   := case when p_limpar_altura then null else coalesce(p_altura_m, v_si.altura_m) end;
  v_centro_q := coalesce(p_centro_q, v_si.centro_q);
  v_centro_r := coalesce(p_centro_r, v_si.centro_r);

  perform vtt_validar_geometria_imagem(v_si.scene_id, v_largura, v_altura);

  update vtt_scene_images
     set largura_m     = v_largura,
         altura_m      = v_altura,
         centro_q      = v_centro_q,
         centro_r      = v_centro_r,
         rotacao_graus = coalesce(p_rotacao_graus, rotacao_graus),
         opacidade     = coalesce(p_opacidade, opacidade),
         camada        = coalesce(p_camada, camada),
         z             = coalesce(p_z, z),
         visivel       = coalesce(p_visivel, visivel),
         travado       = coalesce(p_travado, travado),
         revision      = revision + 1,
         updated_at    = now()
   where id = p_id;

  return vtt_scene_image_json(p_id);
end;
$$;

revoke all on function atualizar_vtt_scene_image(uuid, integer, numeric, numeric, numeric, numeric, text, integer, boolean, boolean, boolean, numeric, numeric) from public, anon;
grant execute on function atualizar_vtt_scene_image(uuid, integer, numeric, numeric, numeric, numeric, text, integer, boolean, boolean, boolean, numeric, numeric) to authenticated;
