-- =====================================================================
-- Ruptura VTT — conclusão transacional e idempotente do wizard
-- Migration: 0044_character_creation_transactional
--
-- Achado da rodada de segurança/atomicidade: a conclusão do wizard
-- (`createCharacterFromWizard` + `claimOwnActiveCharacter`, chamadas
-- separadas) já era atômica DENTRO de cada chamada (um único INSERT —
-- o payload inteiro do personagem vive numa coluna jsonb só — e a RPC
-- `claim_own_active_character`, migration 0039, também atômica), mas
-- as DUAS chamadas juntas NÃO formavam uma transação única: uma falha
-- de rede exatamente entre elas deixa o personagem criado, mas nunca
-- reivindicado como ativo pelo perfil (achado já registrado como
-- pendência conhecida em checkpoints anteriores). Idempotência também
-- dependia só do índice único (migration 0041) — suficiente para
-- REJEITAR duplicata, mas não para um retry devolver o MESMO
-- personagem de forma transparente (o índice único faz a segunda
-- tentativa falhar com erro, não responder de forma idempotente).
--
-- `complete_character_creation` faz as DUAS operações (insert do
-- personagem + reivindicação do perfil) em UMA transação SQL só,
-- falhando integralmente se qualquer parte falhar (rollback nativo do
-- Postgres). Idempotência: aceita uma chave estável opcional
-- (`creation_request_id`, gravada dentro de `payload.metadados` — sem
-- coluna nova, sem sistema de draft) — uma segunda chamada com a MESMA
-- chave para o MESMO perfil/mesa devolve o personagem JÁ criado, nunca
-- insere de novo. Duplo clique (duas chamadas concorrentes, mesma
-- chave, sem nenhuma ainda ter commitado): o índice único parcial
-- (migration 0041) continua como cinto-e-suspensório — a chamada
-- perdedora, em vez de propagar o erro de unique_violation ao usuário,
-- busca e devolve o personagem que a vencedora acabou de criar
-- (resposta idempotente de verdade, não um erro 500).
--
-- Validação de orçamento (`validateCreationBudget`, TypeScript) NÃO é
-- portada para SQL nesta migration — deliberado: o motor de regras
-- (atributos/perícias/vertentes/magias/talentos/itens) é o mesmo
-- reaproveitado por toda a ficha e pela Biblioteca (Editor Universal,
-- fora do escopo desta rodada); duplicá-lo em PL/pgSQL exigiria
-- reimplementar/cruzar conteúdo publicado dentro do banco — escopo
-- maior que "rodada curta e fechada" e risco real de regra de jogo
-- divergente entre TS e SQL. Continua validado server-side na Server
-- Action (`createCharacterFromWizard`, já existente, nunca confia no
-- cliente) ANTES de chamar esta RPC. Gap residual conhecido, já
-- pré-existente e não introduzido por esta migration: um cliente que
-- ignore a Server Action e chame `complete_character_creation`
-- diretamente ainda não tem o orçamento revalidado pela própria RPC —
-- registrado no checkpoint desta rodada como achado prioritário para
-- rodada dedicada (mesma categoria dos gaps de `campaign_invites`/
-- INSERT de `table_logs` já documentados).
-- =====================================================================

begin;

create or replace function complete_character_creation(
  p_campaign_id uuid,
  p_profile_id uuid,
  p_character_payload jsonb,
  p_owner_label text default null,
  p_creation_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_profile campaign_profiles%rowtype;
  v_existing characters%rowtype;
  v_new characters%rowtype;
begin
  if v_uid is null then
    raise exception 'É necessário estar autenticado para concluir a criação do personagem.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_profile from campaign_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_profile.campaign_id is distinct from p_campaign_id then
    raise exception 'Este perfil não pertence a esta campanha.' using errcode = 'insufficient_privilege';
  end if;
  if v_profile.user_id is distinct from v_uid and not is_campaign_owner(p_campaign_id) then
    raise exception 'Você só pode concluir a criação para o PRÓPRIO perfil.' using errcode = 'insufficient_privilege';
  end if;

  -- Idempotência (retry de rede após sucesso): mesma chave, mesmo
  -- perfil/mesa já concluídos antes — devolve o personagem existente,
  -- nunca insere de novo nem duplica carteira/inventário/vínculo.
  if p_creation_request_id is not null then
    select * into v_existing
      from characters
      where profile_id = p_profile_id
        and campaign_id = p_campaign_id
        and archived_at is null
        and payload->'metadados'->>'creationRequestId' = p_creation_request_id
      limit 1;
    if found then
      return jsonb_build_object('character', to_jsonb(v_existing), 'idempotentReplay', true);
    end if;
  end if;

  begin
    insert into characters (name, owner_label, status, payload, campaign_id, profile_id, owner_id)
    values (
      coalesce(nullif(trim(both from (p_character_payload->>'nome')), ''), 'Personagem sem nome'),
      p_owner_label,
      'draft',
      p_character_payload,
      p_campaign_id,
      p_profile_id,
      v_uid
    )
    returning * into v_new;
  exception
    when unique_violation then
      -- Duplo clique (migration 0041 — índice único parcial de
      -- profile_id+campaign_id): a chamada perdedora busca e devolve o
      -- personagem que a vencedora acabou de commitar — resposta
      -- idempotente real, nunca um erro exposto ao jogador.
      select * into v_existing
        from characters
        where profile_id = p_profile_id and campaign_id = p_campaign_id and archived_at is null
        order by created_at asc
        limit 1;
      if found then
        return jsonb_build_object('character', to_jsonb(v_existing), 'idempotentReplay', true);
      end if;
      raise;
  end;

  update campaign_profiles set active_character_id = v_new.id where id = p_profile_id;

  return jsonb_build_object('character', to_jsonb(v_new), 'idempotentReplay', false);
end;
$$;

revoke all on function complete_character_creation(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function complete_character_creation(uuid, uuid, jsonb, text, text) to authenticated;

commit;
