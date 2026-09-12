-- =====================================================================
-- 0113 — O furo que a 0112 não fechou: criar área
--
-- A 0112 trocou a guarda de `pode_criar_vtt_area` e de
-- `pode_editar_vtt_area` achando que estava trocando a autorização de
-- área. Metade estava certa: `pode_editar_vtt_area` é de fato quem
-- decide editar, duplicar e apagar. `pode_criar_vtt_area` não decide
-- nada — nenhuma função a chama. Ela é citada em dois comentários do
-- código da aplicação, e foi só por isso que passou por guarda real.
--
-- Quem valida a CRIAÇÃO é `vtt_validar_area`, e ela perguntava
-- `is_campaign_member(p_campaign_id)`. O efeito prático, depois da
-- 0112: um jogador não conseguia LER a cena em preparo, mas conseguia
-- criar uma área dentro dela.
--
-- A checagem entra como TERCEIRA, depois das duas que já existiam, em
-- vez de substituir a primeira. É de propósito: `check-vtt-areas-
-- seguranca-rpc.mjs` afirma as mensagens de recusa das duas anteriores
-- ('Você não é participante desta campanha.' e 'Cena não encontrada
-- para esta campanha.'), e trocar a ordem mudaria qual mensagem sai
-- em cada caso — quebrando testes que estão certos por motivos que não
-- têm nada a ver com cena.
--
-- `pode_criar_vtt_area` fica como está: agora correta (a 0112 a
-- consertou) e ainda sem chamadores. Não é hora de apagá-la — a fase 6
-- traz permissão por cena e ela é o lugar natural. Mas fique registrado
-- que ela NÃO é a guarda de nada hoje.
-- =====================================================================

begin;

CREATE OR REPLACE FUNCTION public.vtt_validar_area(p_campaign_id uuid, p_scene_id uuid, p_tipo text, p_token_id uuid, p_pontos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not is_campaign_member(p_campaign_id) then
    raise exception 'Você não é participante desta campanha.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from vtt_scenes where id = p_scene_id and campaign_id = p_campaign_id) then
    raise exception 'Cena não encontrada para esta campanha.' using errcode = 'no_data_found';
  end if;
  -- Acrescentado pela 0113: pertencer à campanha deixou de bastar.
  if not public.vtt_pode_interagir_cena(p_scene_id) then
    raise exception 'Você não está nesta cena.' using errcode = 'insufficient_privilege';
  end if;

  if p_tipo = 'aura' then
    if p_token_id is null then
      raise exception 'Uma aura precisa de um token de origem.' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from vtt_tokens t where t.id = p_token_id and t.scene_id = p_scene_id) then
      raise exception 'O token de origem da aura não está nesta cena.' using errcode = 'no_data_found';
    end if;
    if not vtt_token_visivel_para(p_token_id) then
      raise exception 'Você não pode criar uma aura sobre um token que não consegue ver.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if p_tipo = 'parede' and not vtt_area_pontos_validos(p_pontos, 2) then
    raise exception 'Percurso de parede inválido.' using errcode = 'check_violation';
  end if;
  if p_tipo = 'personalizada' and not vtt_area_pontos_validos(p_pontos, 3) then
    raise exception 'Polígono personalizado inválido.' using errcode = 'check_violation';
  end if;
end;
$function$;

commit;
