-- =====================================================================
-- 0094 — Movimento livre com a grade escondida: deslocamento sub-célula
--
-- Com a grade oculta a mesa joga "no olho", e o token saltando pro
-- centro do hex no soltar é justamente o que denuncia uma grade que
-- deveria não existir. Este deslocamento é o que faz ele parar ONDE
-- foi solto.
--
-- E é SÓ DESENHO. A célula que o token ocupa continua sendo `q`/`r`,
-- e é ela que terreno difícil, bloqueio, colisão de pegada, alcance,
-- área de efeito, caminho e trilha de turnos enxergam — nenhuma dessas
-- sete precisou saber que este campo existe. A alternativa (posição
-- realmente livre, sem célula) exigiria redefinir todas elas, e não é
-- o que este passo faz.
--
-- Por construção o offset nunca é grande: quem solta o token longe
-- muda de célula ÂNCORA, e o offset guarda só o resto sub-célula. O
-- clamp de ±1 aqui é a garantia de servidor pra isso — um offset
-- grande desenharia o token longe da célula que ele de fato ocupa, e
-- o cliente não é quem garante nada.
-- =====================================================================

begin;

alter table vtt_tokens
  add column if not exists offset_q numeric(6,3) not null default 0,
  add column if not exists offset_r numeric(6,3) not null default 0;

alter table vtt_tokens drop constraint if exists vtt_tokens_offset_subcelula;
alter table vtt_tokens
  add constraint vtt_tokens_offset_subcelula
  check (offset_q between -1 and 1 and offset_r between -1 and 1);

-- A assinatura ganha os dois parâmetros COM DEFAULT, então toda chamada
-- de três argumentos que já existe continua resolvendo pra cá. O resto
-- do corpo é o que estava em produção, sem uma linha alterada.
create or replace function public.move_vtt_token(
  p_token_id uuid,
  p_rota jsonb,
  p_expected_revision integer,
  p_offset_q numeric default 0,
  p_offset_r numeric default 0
)
 RETURNS vtt_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_token vtt_tokens;
  v_scene vtt_scenes;
  v_step jsonb;
  v_q integer;
  v_r integer;
  v_q_min integer;
  v_dest_q integer;
  v_dest_r integer;
  v_n integer;
  v_prev_q integer;
  v_prev_r integer;
  v_dq integer;
  v_dr integer;
  v_cell record;
begin
  select * into v_token from vtt_tokens where id = p_token_id for update;
  if v_token is null then
    raise exception 'Token não encontrado.' using errcode = 'no_data_found';
  end if;

  if not can_move_vtt_token(p_token_id) then
    raise exception 'Sem permissão para mover este token.' using errcode = 'insufficient_privilege';
  end if;

  if v_token.bloqueado and not is_campaign_owner(v_token.campaign_id) then
    raise exception 'Token travado.' using errcode = 'insufficient_privilege';
  end if;

  if v_token.revision <> p_expected_revision then
    raise exception 'Revisão desatualizada — outra pessoa já moveu este token.' using errcode = 'check_violation';
  end if;

  if not vtt_pegada_personalizada_valida(v_token.pegada_personalizada) then
    raise exception 'Pegada personalizada do token está corrompida.' using errcode = 'data_exception';
  end if;

  select * into v_scene from vtt_scenes where id = v_token.scene_id;
  if v_scene is null then
    raise exception 'Cena do token não existe mais.' using errcode = 'no_data_found';
  end if;

  v_n := jsonb_array_length(p_rota);
  if v_n < 2 then
    raise exception 'Rota precisa de origem e destino.' using errcode = 'invalid_parameter_value';
  end if;

  for i in 0 .. v_n - 1 loop
    v_step := p_rota -> i;
    v_q := (v_step ->> 'q')::integer;
    v_r := (v_step ->> 'r')::integer;

    if i = 0 then
      if v_q <> v_token.q or v_r <> v_token.r then
        raise exception 'A rota precisa começar na posição atual do token (%, %), não em (%, %).',
          v_token.q, v_token.r, v_q, v_r using errcode = 'invalid_parameter_value';
      end if;
    else
      v_dq := v_q - v_prev_q;
      v_dr := v_r - v_prev_r;
      if ((abs(v_dq) + abs(v_dr) + abs(v_dq + v_dr)) / 2) <> 1 then
        raise exception 'Rota não é contínua: (%, %) não é vizinha de (%, %).', v_q, v_r, v_prev_q, v_prev_r
          using errcode = 'invalid_parameter_value';
      end if;
    end if;
    v_prev_q := v_q;
    v_prev_r := v_r;

    for v_cell in select * from vtt_pegada_celulas(v_token.tamanho, v_token.orientacao, v_token.pegada_personalizada, v_q, v_r) loop
      if v_cell.r < 0 or v_cell.r >= v_scene.altura then
        raise exception 'Rota sai dos limites da cena.' using errcode = 'invalid_parameter_value';
      end if;
      v_q_min := -(v_cell.r / 2);
      if v_cell.q < v_q_min or v_cell.q >= v_q_min + v_scene.largura then
        raise exception 'Rota sai dos limites da cena.' using errcode = 'invalid_parameter_value';
      end if;

      if i > 0 then
        if exists (
          select 1 from vtt_tokens ot
          cross join lateral vtt_pegada_celulas(ot.tamanho, ot.orientacao, ot.pegada_personalizada, ot.q, ot.r) oc
          where ot.scene_id = v_token.scene_id and ot.id <> v_token.id
            and oc.q = v_cell.q and oc.r = v_cell.r
        ) then
          raise exception 'Posição indisponível.' using errcode = 'invalid_parameter_value';
        end if;
      end if;
    end loop;

    if i = v_n - 1 then
      v_dest_q := v_q;
      v_dest_r := v_r;
    end if;
  end loop;

  -- Deslocamento SUB-CÉLULA (migration 0094): onde o token pousa
  -- DENTRO da célula âncora. Só desenho — a célula ocupada continua
  -- sendo `q`/`r`, e é ela que terreno, colisão, alcance, área e
  -- caminho enxergam. Preso a ±1 aqui, no servidor: um offset grande
  -- desenharia o token longe da célula que ele de fato ocupa, que é
  -- uma mentira na tela, e o cliente não é quem garante isso.
  update vtt_tokens
  set q = v_dest_q, r = v_dest_r,
      offset_q = greatest(-1, least(1, coalesce(p_offset_q, 0))),
      offset_r = greatest(-1, least(1, coalesce(p_offset_r, 0))),
      revision = v_token.revision + 1, updated_at = now()
  where id = p_token_id
  returning * into v_token;

  return v_token;
end;
$function$

;

commit;
