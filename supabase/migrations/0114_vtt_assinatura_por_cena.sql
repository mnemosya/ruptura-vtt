-- =====================================================================
-- 0114 — Assinar imagem também é uma pergunta sobre CENA
--
-- Último resíduo da auditoria 0112/0113. `vtt_asset_assinavel_para` é
-- quem decide se o servidor emite URL assinada de um arquivo. Uma das
-- razões que ela aceitava era:
--
--     a imagem está colocada e visível em ALGUMA cena da campanha
--
-- que, com uma cena por campanha, era a frase certa. Com catálogo, ela
-- passa a incluir as cenas que o narrador está preparando.
--
-- Na prática a porta estava estreita: depois da 0112, ninguém consegue
-- mais DESCOBRIR o `image_id` de uma cena que não pode ver
-- (`read_vtt_scene_images` recusa). Mas "você precisaria adivinhar um
-- UUID" é uma tranca feita de dificuldade, não de regra — e o custo de
-- trocar por uma regra é a linha abaixo.
--
-- As outras razões da função (retrato de token visível, avatar de ficha
-- legível) já eram escopadas pelo que a pessoa enxerga, e ficam intactas.
-- =====================================================================

begin;

CREATE OR REPLACE FUNCTION public.vtt_asset_assinavel_para(p_asset_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from vtt_image_assets a
    where a.id = p_asset_id
      and a.estado = 'ready'
      and (
        is_campaign_owner(a.campaign_id, p_user_id)
        or (
          is_campaign_member(a.campaign_id, p_user_id)
          and (
            exists (
              select 1 from vtt_scene_images si
              where si.image_id = a.id
                and si.visivel
                and vtt_pode_ver_cena(si.scene_id, p_user_id)
                and vtt_camada_cena_visivel(
                      si.scene_id,
                      case when si.papel = 'fundo' then 'imagemFundo' else 'tiles' end)
            )
            -- Retrato próprio de um token que esta pessoa enxerga.
            or exists (
              select 1 from vtt_tokens t
              where t.retrato_image_id = a.id
                and vtt_token_visivel_para(t.id, p_user_id)
            )
            -- Avatar de ficha que esta pessoa pode ler (a própria, ou a
            -- de quem ela controla, ou qualquer uma se for narrador).
            or exists (
              select 1 from characters c
              where c.avatar_image_id = a.id
                and can_read_character(c.id, p_user_id)
            )
            -- Avatar HERDADO por um token visível: ver o token é ver a
            -- cara dele.
            or exists (
              select 1 from vtt_tokens t
              join characters c on c.id = t.character_id
              where c.avatar_image_id = a.id
                and t.retrato_image_id is null
                and t.retrato_url is null
                and vtt_token_visivel_para(t.id, p_user_id)
            )
          )
        )
      )
  );
$function$;

commit;
