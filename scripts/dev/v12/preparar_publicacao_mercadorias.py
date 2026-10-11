"""Gera uma transação revisável; executar o SQL é uma etapa separada e autorizada."""
import json, hashlib
from pathlib import Path
root=Path('content/v12/revisao-2026-10-10-atualizada')
before=json.loads((root/'publicado-antes.json').read_text())
rows=json.loads((root/'catalogo-candidato.json').read_text())['registros']
by_key={(r['content_type'],r['slug']):r for r in before}
prop_template=next(r for r in before if r['content_type']=='property')
properties=[]
for slug,name,description in [
 ('congelamento','Congelamento','Em um sucesso crítico, o Andar do alvo é reduzido à metade, arredondado para baixo, até o fim do próximo turno dele.'),
 ('ofuscamento','Ofuscamento','Em um sucesso crítico, o alvo fica Ofuscado até o fim do próximo turno dele.'),
 ('disrupcao','Disrupção','Em um sucesso crítico, escolha um escalpo, arma de energia, equipamento ou função tecnológica utilizada pelo alvo. O componente escolhido fica inativo até o fim do próximo turno dele. Contra drones, robôs ou veículos, o alvo perde 1 PA no próximo turno em vez disso.')]:
 p={'id':slug,'slug':slug,'nome':name,'categoria':'propriedade_arma','categoria_label':'Propriedade de Arma','status':'published','versao':'1.2.0','tags':['arma','ofensiva','critico'],'gatilhos':['sucesso_critico'],'margem_minima':'sucesso_critico','descricao_curta':description,'descricao_longa':description,'aplica_em':['energia'],'parametrica':False,'parametros':[],'payload_automacao':{'uso_manual':True,'efeitos':[]},'fonte_notion':{'paginaNotionId':'9690a136355283c59bd8813acc4e4935'}}
 properties.append({'content_type':'property','slug':slug,'payload':p})
rows+=properties
(root/'propriedades-atualizadas.json').write_text(json.dumps(properties,ensure_ascii=False,indent=2)+'\n')
retire=['armas_retornavel','armas_armas_de_fogo_serpentina','armas_armas_de_fogo_ricochete']
for slug in retire:
 old=by_key['rune',slug];p={**old['payload'],'status':'archived'}
 rows.append({'content_type':'rune','slug':slug,'payload':p})
assert len({(r['content_type'],r['slug']) for r in rows})==len(rows)
for r in rows:
 old=by_key.get((r['content_type'],r['slug']))
 template=old or (prop_template if r['content_type']=='property' else next(x for x in before if x['content_type']==r['content_type']))
 r['id']=old['id'] if old else r['content_type']+':'+r['slug']
 r['source_pack_id']=template['source_pack_id'];r['source_pack_version']=template['source_pack_version']
 r['version']=r['payload'].get('versao',template.get('version'))
 r['payload_hash']=hashlib.sha256(json.dumps(r['payload'],ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
# Nenhuma decisão pendente automatizada e nenhum item de personagem faz parte da transação.
assert not any(r['payload'].get('payload_automacao',{}).get('efeitos') for r in rows if r['content_type']=='rune' and r['payload']['nome']=='Pente Fantasma')
existing=[by_key[r['content_type'],r['slug']] for r in rows if (r['content_type'],r['slug']) in by_key]
expected=[{'id':r['id'],'updated_at':r['updated_at'],'status':r['status']} for r in existing]
def literal(v): return "'"+json.dumps(v,ensure_ascii=False,separators=(',',':')).replace("'","''")+"'::jsonb"
sql='''begin;
create temporary table market_update_stage on commit drop as
select * from jsonb_to_recordset(RECORDS) as x(id text,content_type text,slug text,payload jsonb,payload_hash text,source_pack_id text,source_pack_version text,version text);
create temporary table market_update_expected on commit drop as
select * from jsonb_to_recordset(EXPECTED) as x(id text,updated_at timestamptz,status text);
-- Trava apenas os registros deste catálogo antes de conferir a cópia de segurança.
do $$ begin perform id from content_documents where id in (select id from market_update_stage) for update; end $$;
do $$ begin
 if exists(select 1 from market_update_expected e left join content_documents d on d.id=e.id where d.id is null or d.updated_at<>e.updated_at or d.status<>e.status) then
  raise exception 'Catálogo modificado desde a cópia de segurança; nenhuma alteração aplicada';
 end if;
 if exists(select 1 from market_update_stage s join content_documents d using(id) left join market_update_expected e using(id) where e.id is null) then
  raise exception 'Nova identidade já existe; nenhuma alteração aplicada';
 end if;
end $$;
insert into content_changelog(document_id,content_type,change_type,pack_id,pack_version,payload_before,payload_after)
select s.id,s.content_type::content_type,case when d.id is null then 'created' else 'updated' end,s.source_pack_id,s.source_pack_version,d.payload,s.payload
from market_update_stage s left join content_documents d using(id) where d.payload is distinct from s.payload;
insert into content_documents(id,content_type,slug,nome,categoria,subtipo,status,version,source_pack_id,source_pack_version,payload,payload_hash)
select id,content_type::content_type,slug,payload->>'nome',payload->>'categoria',payload->>'subtipo',payload->>'status',version,source_pack_id,source_pack_version,payload,payload_hash from market_update_stage
on conflict(id) do update set nome=excluded.nome,categoria=excluded.categoria,subtipo=excluded.subtipo,status=excluded.status,version=excluded.version,source_pack_id=excluded.source_pack_id,source_pack_version=excluded.source_pack_version,payload=excluded.payload,payload_hash=excluded.payload_hash,updated_at=now()
where content_documents.payload is distinct from excluded.payload;
select content_type,status,count(*) from content_documents where id in(select id from market_update_stage) group by content_type,status order by content_type,status;
commit;
'''.replace('RECORDS',literal(rows)).replace('EXPECTED',literal(expected))
(root/'publicacao.sql').write_text(sql)
(root/'publicacao-manifesto.json').write_text(json.dumps({'registros':len(rows),'atualizados_ou_criados':len(rows)-3,'runas_arquivadas':retire,'personagens_alterados':0,'otimismo_por_updated_at':True},ensure_ascii=False,indent=2)+'\n')
print('Transação preparada:',len(rows),'registros,',len(existing),'identidades existentes protegidas.')
