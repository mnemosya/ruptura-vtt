-- =====================================================================
-- 0125 — Um token fora da grade pode VOLTAR pra ela
--
-- Redimensionar a grade de uma cena deixa pra trás quem estava na
-- faixa removida: o token continua existindo, desenhado fora do mapa,
-- sem nunca ter sido movido pra lá. E ficava PRESO — `move_vtt_token`
-- exige que TODA célula da rota caia dentro da cena, inclusive a
-- primeira, que é a posição atual do token. Ou seja: a única posição
-- de onde ele poderia partir era justamente a que a função recusava.
-- Nenhum gesto trazia ele de volta; nem arrastar, nem teclado.
--
-- A exceção aqui é de MÃO ÚNICA, e é só isso:
--
--   • se a posição ATUAL do token já está (parcialmente) fora da
--     cena, a rota pode atravessar o lado de fora;
--   • assim que a rota alcança uma posição inteiramente DENTRO, a
--     borda volta a valer — sair de novo no mesmo movimento é recusado;
--   • o DESTINO precisa, sempre, caber inteiro dentro da cena.
--
-- Quem já está dentro continua sob a regra de sempre, sem uma vírgula
-- de folga: não dá pra usar isto pra sair da grade, só pra entrar.
-- Colisão com outro token, permissão, trava, revisão e adjacência da
-- rota seguem exatamente como estavam.
--
-- Espelha `toleraForaDaGrade` em `_dominio/arrastoToken.ts` (o cliente
-- deixa o arrasto acontecer; aqui é quem de fato decide).
-- =====================================================================

begin;

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
  -- Volta pra grade (migration 0125): a posição ATUAL do token já está
  -- fora da cena? Só neste caso a rota ganha a tolerância — e só até
  -- ela entrar (`v_entrou`).
  v_origem_fora boolean := false;
  v_entrou boolean := false;
  v_passo_fora boolean;
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

  -- A pegada ATUAL do token cabe inteira na cena? Calculada ANTES do
  -- laço, a partir da posição persistida — nunca do que o cliente
  -- mandou, que é exatamente o que não pode ser fonte desta decisão.
  for v_cell in select * from vtt_pegada_celulas(v_token.tamanho, v_token.orientacao, v_token.pegada_personalizada, v_token.q, v_token.r) loop
    if v_cell.r < 0 or v_cell.r >= v_scene.altura then
      v_origem_fora := true;
    else
      v_q_min := -(v_cell.r / 2);
      if v_cell.q < v_q_min or v_cell.q >= v_q_min + v_scene.largura then
        v_origem_fora := true;
      end if;
    end if;
  end loop;

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

    v_passo_fora := false;

    for v_cell in select * from vtt_pegada_celulas(v_token.tamanho, v_token.orientacao, v_token.pegada_personalizada, v_q, v_r) loop
      if v_cell.r < 0 or v_cell.r >= v_scene.altura then
        v_passo_fora := true;
      else
        v_q_min := -(v_cell.r / 2);
        if v_cell.q < v_q_min or v_cell.q >= v_q_min + v_scene.largura then
          v_passo_fora := true;
        end if;
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

    if v_passo_fora then
      -- Fora da cena só passa enquanto a tolerância de volta pra grade
      -- estiver valendo: origem já fora E a rota ainda não entrou.
      if not v_origem_fora or v_entrou then
        raise exception 'Rota sai dos limites da cena.' using errcode = 'invalid_parameter_value';
      end if;
      if i = v_n - 1 then
        raise exception 'O movimento precisa terminar dentro da cena.' using errcode = 'invalid_parameter_value';
      end if;
    else
      -- Entrou: daqui pra frente a borda vale como sempre.
      v_entrou := true;
    end if;

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
$function$;

commit;
