-- Proteção da ficha do personagem SEM CAMPANHA.
--
-- Com campanha, o jogador só grava a ficha por update_character_sheet_payload,
-- que devolve ao valor salvo tudo o que só o avanço de Ranking pode mudar.
-- O personagem solto é gravado pelo dono direto na tabela (a RLS permite) —
-- e aí rank, atributos e perícias ficavam livres.
--
-- Este trigger aplica a MESMA regra a essa gravação direta: quando o
-- personagem está sem campanha e quem grava é o usuário (role
-- `authenticated`, não uma função SECURITY DEFINER como o avanço de
-- Ranking ou a criação), os campos protegidos voltam ao valor salvo.

begin;

create or replace function public.proteger_ficha_sem_campanha()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_campo text;
  v_old jsonb := old.payload;
  v_new jsonb := new.payload;
begin
  if current_user <> 'authenticated'
     or old.campaign_id is not null
     or new.campaign_id is not null
     or (v_old->>'schema_version') is distinct from '2'
     or v_new is null then
    return new;
  end if;

  foreach v_campo in array array['schema_version','ruleset_version','progressao','trajetoria','atributos','pericias','niveis_vertente'] loop
    if v_old ? v_campo then
      v_new := jsonb_set(v_new, array[v_campo], v_old->v_campo);
    else
      v_new := v_new - v_campo;
    end if;
  end loop;

  v_new := jsonb_set(v_new, '{magia}', coalesce(v_new->'magia', '{}'::jsonb));
  foreach v_campo in array array['vertente_primaria','niveis_vertente','escolhas_pendentes'] loop
    if (v_old->'magia') ? v_campo then
      v_new := jsonb_set(v_new, array['magia', v_campo], v_old->'magia'->v_campo);
    else
      v_new := jsonb_set(v_new, '{magia}', (v_new->'magia') - v_campo);
    end if;
  end loop;

  new.payload := v_new;
  return new;
end;
$$;

drop trigger if exists characters_proteger_sem_campanha on public.characters;
create trigger characters_proteger_sem_campanha
before update of payload on public.characters
for each row
execute function public.proteger_ficha_sem_campanha();

commit;
