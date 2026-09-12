-- ═══════════════════════════════════════════════════════════════════
-- 0108 — A biblioteca de imagens precisa dizer PARA QUE cada arquivo
-- está sendo usado.
--
-- `read_vtt_campaign_images` (0099) devolvia todo asset `ready` da
-- campanha sem distinção nenhuma. Na prática isso mistura três coisas
-- que a pessoa pensa como separadas: mapas e peças de cena, retratos de
-- token e avatares de ficha. O seletor de imagens da cena listava
-- avatares de personagem lado a lado com mapas — e nada na tela dizia
-- qual era qual.
--
-- A tabela de assets NÃO tem (e não deve ter) uma coluna de
-- "finalidade": o mesmo arquivo pode legitimamente ser avatar de um
-- personagem e tile de uma cena, e é justamente a deduplicação por
-- `sha256` que torna isso barato. A finalidade não é propriedade do
-- arquivo — é dos USOS. Então a projeção passa a contar os usos.
--
-- Contagem, e não booleano: "em 3 cenas" é informação de verdade na
-- hora de decidir se dá para apagar. E `0/0/0` é um caso real — asset
-- recém-enviado cuja colocação falhou, ou que perdeu o último uso —,
-- por isso ele continua aparecendo em vez de sumir.
-- ═══════════════════════════════════════════════════════════════════

create or replace function read_vtt_campaign_images(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'Sem acesso.' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'width_px', a.width_px, 'height_px', a.height_px,
      'bytes', a.bytes, 'created_at', a.created_at,
      -- Usos por tipo. Subconsultas escalares e não joins: um asset em
      -- duas cenas E em três tokens multiplicaria as linhas num join,
      -- e a contagem sairia errada nos dois lados.
      'usos_cena', (
        select count(*) from vtt_scene_images si where si.image_id = a.id
      ),
      'usos_retrato', (
        select count(*) from vtt_tokens t where t.retrato_image_id = a.id
      ),
      'usos_avatar', (
        select count(*) from characters c where c.avatar_image_id = a.id
      )
    ) order by a.created_at desc)
    from vtt_image_assets a
    where a.campaign_id = p_campaign_id and a.estado = 'ready'
  ), '[]'::jsonb);
end;
$$;

revoke all on function read_vtt_campaign_images(uuid) from public, anon;
grant execute on function read_vtt_campaign_images(uuid) to authenticated;
