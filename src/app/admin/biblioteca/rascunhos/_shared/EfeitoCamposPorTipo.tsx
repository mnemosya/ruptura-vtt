"use client";

import type { OpcoesDeRegras } from "../../../../../lib/contentSchema/characterRuleOptions";
import {
  FAIXAS_RESULTADO_TESTE,
  RECURSOS_ALTERAR,
  TIPOS_EFEITO_FILHO,
  MOMENTOS_CONSUMO,
  DURACOES_EFEITO_TEMPORARIO,
  POLITICAS_REAPLICACAO,
  TIPOS_ACAO_ADICIONAL,
  MAX_MODIFICADORES_EFEITO_TEMPORARIO,
  OPERACOES_MODIFICAR_INSTANCIA,
  DESTINOS_CONCEDER_ITEM,
  COMPORTAMENTOS_PILHA_CONSUMIR,
  OPERACOES_ALTERAR_PRECO,
  OPERACOES_DISPONIBILIDADE,
  formatarFormulaCura,
  formatarFormulaDano,
  novoResultadoTeste,
  type CamposAcaoReacaoAdicional,
  type CamposAlterarDanoRecebido,
  type CamposAlterarDisponibilidade,
  type CamposAlterarPreco,
  type CamposAlterarRecurso,
  type CamposAplicarCondicao,
  type CamposConcederItem,
  type CamposConsumirItem,
  type CamposCura,
  type CamposDano,
  type CamposEfeitoTemporario,
  type CamposModificarInstancia,
  type CamposModificarMargem,
  type CamposModificarTeste,
  type CamposRemoverCondicao,
  type CamposTesteResistencia,
  type EfeitoEditavel,
  type FaixaResultadoTeste,
  type ModificadorSimplesEfeitoTemporario,
  type ResultadoTeste,
} from "../../../../../lib/contentSchema/effectDraftTypes";
import { inputStyle, labelStyle } from "./formStyles";
import { StringListEditor } from "./StringListEditor";
import { EffectsEditorSection } from "./EffectsEditorSection";

const FACES_DADO = [4, 6, 8, 10, 12, 20, 100];

function numeroOuIndefinido(valor: string): number | undefined {
  if (valor.trim() === "") return undefined;
  const n = Number(valor);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * Único ponto que sabe "qual UI renderizar para qual tipo de efeito" —
 * um switch só, nunca duplicado em outro arquivo. Cada `case` é curto
 * porque delega ao controle "amigável" (quantidade + dado + modificador)
 * em vez de pedir uma fórmula digitada.
 *
 * Todo campo usado pelo browser check tem `data-testid` estável e
 * único DENTRO do card do efeito (a busca no script sempre escopa pelo
 * card via `data-effect-id` antes de procurar esses testids) — nunca
 * depende de rótulo parcial nem de texto de opção.
 */
export function EfeitoCamposPorTipo({
  efeito,
  onChangeCampos,
  opcoes,
  condicoesDisponiveis,
}: {
  efeito: EfeitoEditavel;
  onChangeCampos: (patch: Record<string, unknown>) => void;
  opcoes: OpcoesDeRegras;
  condicoesDisponiveis: { slug: string; nome: string }[];
}) {
  switch (efeito.tipo) {
    case "dano":
      return <CamposDanoFields campos={efeito.campos} onChange={onChangeCampos} opcoes={opcoes} />;
    case "cura":
      return <CamposCuraFields campos={efeito.campos} onChange={onChangeCampos} />;
    case "aplicar_condicao":
      return <CamposAplicarCondicaoFields campos={efeito.campos} onChange={onChangeCampos} condicoesDisponiveis={condicoesDisponiveis} />;
    case "remover_condicao":
      return <CamposRemoverCondicaoFields campos={efeito.campos} onChange={onChangeCampos} condicoesDisponiveis={condicoesDisponiveis} />;
    case "modificar_teste":
      return <CamposModificarTesteFields campos={efeito.campos} onChange={onChangeCampos} opcoes={opcoes} />;
    case "alterar_recurso":
      return <CamposAlterarRecursoFields campos={efeito.campos} onChange={onChangeCampos} />;
    case "modificar_margem":
      return <CamposModificarMargemFields campos={efeito.campos} onChange={onChangeCampos} opcoes={opcoes} />;
    case "alterar_dano_recebido":
      return <CamposAlterarDanoRecebidoFields campos={efeito.campos} onChange={onChangeCampos} opcoes={opcoes} />;
    case "teste_resistencia":
      return <CamposTesteResistenciaFields campos={efeito.campos} onChange={onChangeCampos} opcoes={opcoes} condicoesDisponiveis={condicoesDisponiveis} />;
    case "efeito_temporario":
      return <CamposEfeitoTemporarioFields campos={efeito.campos} onChange={onChangeCampos} opcoes={opcoes} />;
    case "acao_reacao_adicional":
      return <CamposAcaoReacaoAdicionalFields campos={efeito.campos} onChange={onChangeCampos} />;
    case "modificar_instancia":
      return <CamposModificarInstanciaFields campos={efeito.campos} onChange={onChangeCampos} />;
    case "conceder_item":
      return <CamposConcederItemFields campos={efeito.campos} onChange={onChangeCampos} />;
    case "consumir_item":
      return <CamposConsumirItemFields campos={efeito.campos} onChange={onChangeCampos} />;
    case "alterar_preco":
      return <CamposAlterarPrecoFields campos={efeito.campos} onChange={onChangeCampos} />;
    case "alterar_disponibilidade":
      return <CamposAlterarDisponibilidadeFields campos={efeito.campos} onChange={onChangeCampos} />;
  }
}

function CamposDanoFields({ campos, onChange, opcoes }: { campos: CamposDano; onChange: (p: Partial<CamposDano>) => void; opcoes: OpcoesDeRegras }) {
  const tipoDanoInfo = opcoes.tiposDano.find((t) => t.id === campos.tipoDano);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
        <label style={labelStyle}>
          Fórmula
          <select
            data-testid="dano-tipo-formula"
            value={campos.tipoFormula}
            onChange={(e) => onChange({ tipoFormula: e.target.value as CamposDano["tipoFormula"] })}
            style={inputStyle}
          >
            <option value="fixo">Valor fixo</option>
            <option value="dados">Dados</option>
            <option value="dados_com_modificador">Dados + modificador</option>
          </select>
        </label>
        {campos.tipoFormula === "fixo" ? (
          <label style={labelStyle}>
            Valor fixo
            <input
              data-testid="dano-valor-fixo"
              type="number"
              min={0}
              value={campos.valorFixo ?? ""}
              onChange={(e) => onChange({ valorFixo: numeroOuIndefinido(e.target.value) })}
              style={{ ...inputStyle, width: 90 }}
            />
          </label>
        ) : (
          <>
            <label style={labelStyle}>
              Quantidade
              <input
                data-testid="dano-quantidade"
                type="number"
                min={1}
                value={campos.quantidadeDados ?? ""}
                onChange={(e) => onChange({ quantidadeDados: numeroOuIndefinido(e.target.value) })}
                style={{ ...inputStyle, width: 80 }}
              />
            </label>
            <label style={labelStyle}>
              Dado
              <select
                data-testid="dano-faces"
                aria-label="Faces do dado"
                value={campos.faces ?? ""}
                onChange={(e) => onChange({ faces: numeroOuIndefinido(e.target.value) })}
                style={{ ...inputStyle, width: 90 }}
              >
                <option value="">—</option>
                {FACES_DADO.map((f) => (
                  <option key={f} value={f}>
                    d{f}
                  </option>
                ))}
              </select>
            </label>
            {campos.tipoFormula === "dados_com_modificador" && (
              <label style={labelStyle}>
                Modificador
                <input
                  data-testid="dano-modificador"
                  type="number"
                  value={campos.modificador ?? ""}
                  onChange={(e) => onChange({ modificador: numeroOuIndefinido(e.target.value) })}
                  style={{ ...inputStyle, width: 80 }}
                />
              </label>
            )}
          </>
        )}
        <span style={{ fontSize: 13, color: "#7d7d8a" }}>= {formatarFormulaDano(campos)}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={labelStyle}>
          Tipo de dano *
          <select data-testid="dano-tipo-dano" value={campos.tipoDano} onChange={(e) => onChange({ tipoDano: e.target.value, subtipoDano: undefined })} style={inputStyle}>
            <option value="">—</option>
            {opcoes.tiposDano.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        {tipoDanoInfo && tipoDanoInfo.subtipos.length > 0 && (
          <label style={labelStyle}>
            Subtipo de dano
            <select data-testid="dano-subtipo-dano" value={campos.subtipoDano ?? ""} onChange={(e) => onChange({ subtipoDano: e.target.value || undefined })} style={inputStyle}>
              <option value="">—</option>
              {tipoDanoInfo.subtipos.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        <label style={labelStyle}>
          Dano principal ou adicional
          <select
            data-testid="dano-principal-adicional"
            value={campos.danoPrincipalOuAdicional}
            onChange={(e) => onChange({ danoPrincipalOuAdicional: e.target.value as CamposDano["danoPrincipalOuAdicional"] })}
            style={inputStyle}
          >
            <option value="principal">Principal</option>
            <option value="adicional">Adicional</option>
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input data-testid="dano-ignora-mit" type="checkbox" checked={campos.ignoraMit} onChange={(e) => onChange({ ignoraMit: e.target.checked })} /> Ignora MIT
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input data-testid="dano-ignora-pd" type="checkbox" checked={campos.ignoraPd} onChange={(e) => onChange({ ignoraPd: e.target.checked })} /> Ignora PD
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input data-testid="dano-metade-sucesso" type="checkbox" checked={campos.metadeEmSucesso} onChange={(e) => onChange({ metadeEmSucesso: e.target.checked })} /> Metade em sucesso
        </label>
      </div>
    </div>
  );
}

function CamposCuraFields({ campos, onChange }: { campos: CamposCura; onChange: (p: Partial<CamposCura>) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={labelStyle}>
        Fórmula
        <select data-testid="cura-tipo-formula" value={campos.tipoFormula} onChange={(e) => onChange({ tipoFormula: e.target.value as CamposCura["tipoFormula"] })} style={inputStyle}>
          <option value="fixo">Valor fixo</option>
          <option value="dados">Dados</option>
        </select>
      </label>
      {campos.tipoFormula === "fixo" ? (
        <label style={labelStyle}>
          Valor fixo
          <input
            data-testid="cura-valor-fixo"
            type="number"
            min={0}
            value={campos.valorFixo ?? ""}
            onChange={(e) => onChange({ valorFixo: numeroOuIndefinido(e.target.value) })}
            style={{ ...inputStyle, width: 90 }}
          />
        </label>
      ) : (
        <>
          <label style={labelStyle}>
            Quantidade
            <input
              data-testid="cura-quantidade"
              type="number"
              min={1}
              value={campos.quantidadeDados ?? ""}
              onChange={(e) => onChange({ quantidadeDados: numeroOuIndefinido(e.target.value) })}
              style={{ ...inputStyle, width: 80 }}
            />
          </label>
          <label style={labelStyle}>
            Dado
            <select
              data-testid="cura-faces"
              aria-label="Faces do dado"
              value={campos.faces ?? ""}
              onChange={(e) => onChange({ faces: numeroOuIndefinido(e.target.value) })}
              style={{ ...inputStyle, width: 90 }}
            >
              <option value="">—</option>
              {FACES_DADO.map((f) => (
                <option key={f} value={f}>
                  d{f}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <span style={{ fontSize: 13, color: "#7d7d8a" }}>= {formatarFormulaCura(campos)}</span>
      <label style={labelStyle}>
        Recurso *
        <select data-testid="cura-recurso" value={campos.recurso} onChange={(e) => onChange({ recurso: e.target.value as CamposCura["recurso"] })} style={inputStyle}>
          <option value="pv">PV</option>
          <option value="pe">PE</option>
          <option value="mana">Mana</option>
          <option value="integridade">Integridade</option>
          <option value="pd">PD</option>
        </select>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="cura-limitar-maximo" type="checkbox" checked={campos.limitarAoMaximo} onChange={(e) => onChange({ limitarAoMaximo: e.target.checked })} /> Limitar ao máximo
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="cura-valor-temporario" type="checkbox" checked={campos.permitirValorTemporario} onChange={(e) => onChange({ permitirValorTemporario: e.target.checked })} /> Permitir
        valor temporário
      </label>
    </div>
  );
}

function CamposAplicarCondicaoFields({
  campos,
  onChange,
  condicoesDisponiveis,
}: {
  campos: CamposAplicarCondicao;
  onChange: (p: Partial<CamposAplicarCondicao>) => void;
  condicoesDisponiveis: { slug: string; nome: string }[];
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={labelStyle}>
        Condição (referência da Biblioteca) *
        <select data-testid="aplicar-condicao-slug" value={campos.condicaoSlug} onChange={(e) => onChange({ condicaoSlug: e.target.value })} style={{ ...inputStyle, minWidth: 200 }}>
          <option value="">—</option>
          {condicoesDisponiveis.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Intensidade/pilhas
        <input
          data-testid="aplicar-condicao-intensidade"
          type="number"
          min={1}
          value={campos.intensidadeOuPilhas ?? ""}
          onChange={(e) => onChange({ intensidadeOuPilhas: numeroOuIndefinido(e.target.value) })}
          style={{ ...inputStyle, width: 90 }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="aplicar-condicao-acumulavel" type="checkbox" checked={campos.acumulavel} onChange={(e) => onChange({ acumulavel: e.target.checked })} /> Acumulável
      </label>
      {campos.acumulavel && (
        <label style={labelStyle}>
          Máximo de pilhas
          <input
            data-testid="aplicar-condicao-max-pilhas"
            type="number"
            min={1}
            value={campos.maximoDePilhas ?? ""}
            onChange={(e) => onChange({ maximoDePilhas: numeroOuIndefinido(e.target.value) })}
            style={{ ...inputStyle, width: 90 }}
          />
        </label>
      )}
      <label style={labelStyle}>
        Autoria
        <select data-testid="aplicar-condicao-autoria" value={campos.autoria} onChange={(e) => onChange({ autoria: e.target.value as CamposAplicarCondicao["autoria"] })} style={inputStyle}>
          <option value="sem_autoria">Sem autoria</option>
          <option value="personagem_de_origem">Personagem de origem</option>
          <option value="conteudo_de_origem">Conteúdo de origem</option>
        </select>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="aplicar-condicao-confirmacao" type="checkbox" checked={campos.confirmacaoManual} onChange={(e) => onChange({ confirmacaoManual: e.target.checked })} /> Exige
        confirmação manual
      </label>
    </div>
  );
}

function CamposRemoverCondicaoFields({
  campos,
  onChange,
  condicoesDisponiveis,
}: {
  campos: CamposRemoverCondicao;
  onChange: (p: Partial<CamposRemoverCondicao>) => void;
  condicoesDisponiveis: { slug: string; nome: string }[];
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={labelStyle}>
        Condição específica
        <select
          data-testid="remover-condicao-slug"
          value={campos.condicaoSlug ?? ""}
          onChange={(e) => onChange({ condicaoSlug: e.target.value || undefined })}
          disabled={campos.removerTodas}
          style={{ ...inputStyle, minWidth: 200 }}
        >
          <option value="">—</option>
          {condicoesDisponiveis.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="remover-condicao-selecao-manual" type="checkbox" checked={campos.selecaoManual} onChange={(e) => onChange({ selecaoManual: e.target.checked })} /> Seleção manual
        no momento
      </label>
      <label style={labelStyle}>
        Quantidade removida
        <input
          data-testid="remover-condicao-quantidade"
          type="number"
          min={1}
          value={campos.quantidadeRemovida ?? ""}
          onChange={(e) => onChange({ quantidadeRemovida: numeroOuIndefinido(e.target.value) })}
          style={{ ...inputStyle, width: 90 }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input
          data-testid="remover-condicao-todas"
          type="checkbox"
          checked={campos.removerTodas}
          onChange={(e) => onChange({ removerTodas: e.target.checked, condicaoSlug: e.target.checked ? undefined : campos.condicaoSlug })}
        />{" "}
        Remover todas
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input
          data-testid="remover-condicao-bloquear"
          type="checkbox"
          checked={campos.bloquearSemCondicaoCompativel}
          onChange={(e) => onChange({ bloquearSemCondicaoCompativel: e.target.checked })}
        />{" "}
        Bloquear sem condição compatível
      </label>
      <div style={{ minWidth: 240 }}>
        <StringListEditor
          label="Lista de condições possíveis"
          valores={campos.condicoesPossiveis}
          onChange={(condicoesPossiveis) => onChange({ condicoesPossiveis })}
          placeholder="slug da condição"
          testId="remover-condicao-lista-possiveis"
        />
      </div>
    </div>
  );
}

function CamposModificarTesteFields({ campos, onChange, opcoes }: { campos: CamposModificarTeste; onChange: (p: Partial<CamposModificarTeste>) => void; opcoes: OpcoesDeRegras }) {
  const exigeValor = campos.modo === "bonus" || campos.modo === "penalidade";
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
        <label style={labelStyle}>
          Modo
          <select data-testid="modificar-teste-modo" value={campos.modo} onChange={(e) => onChange({ modo: e.target.value as CamposModificarTeste["modo"] })} style={inputStyle}>
            <option value="bonus">Bônus</option>
            <option value="penalidade">Penalidade</option>
            <option value="vantagem">Vantagem</option>
            <option value="desvantagem">Desvantagem</option>
          </select>
        </label>
        {exigeValor && (
          <label style={labelStyle}>
            Valor *
            <input
              data-testid="modificar-teste-valor"
              type="number"
              value={campos.valor ?? ""}
              onChange={(e) => onChange({ valor: numeroOuIndefinido(e.target.value) })}
              style={{ ...inputStyle, width: 90 }}
            />
          </label>
        )}
        <label style={labelStyle}>
          Atributo
          <select data-testid="modificar-teste-atributo" value={campos.atributo ?? ""} onChange={(e) => onChange({ atributo: e.target.value || undefined })} style={inputStyle}>
            <option value="">—</option>
            {opcoes.atributos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Perícia
          <select data-testid="modificar-teste-pericia" value={campos.pericia ?? ""} onChange={(e) => onChange({ pericia: e.target.value || undefined })} style={inputStyle}>
            <option value="">—</option>
            {opcoes.pericias.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Ação
          <input data-testid="modificar-teste-acao" value={campos.acao ?? ""} onChange={(e) => onChange({ acao: e.target.value || undefined })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Defesa
          <input data-testid="modificar-teste-defesa" value={campos.defesa ?? ""} onChange={(e) => onChange({ defesa: e.target.value || undefined })} style={inputStyle} />
        </label>
      </div>

      <StringListEditor label="Tags alvo" valores={campos.tags} onChange={(tags) => onChange({ tags })} placeholder="ex.: luta" testId="modificar-teste-tags" />

      <div style={{ display: "flex", gap: 14, fontSize: 13, marginTop: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input data-testid="modificar-teste-acumulavel" type="checkbox" checked={campos.acumulavel} onChange={(e) => onChange({ acumulavel: e.target.checked })} /> Acumulável
        </label>
        {campos.acumulavel && (
          <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 6 }}>
            Máximo
            <input
              data-testid="modificar-teste-maximo"
              type="number"
              min={1}
              value={campos.maximo ?? ""}
              onChange={(e) => onChange({ maximo: numeroOuIndefinido(e.target.value) })}
              style={{ ...inputStyle, width: 70 }}
            />
          </label>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            data-testid="modificar-teste-consumir"
            type="checkbox"
            checked={campos.consumirNoProximoTeste}
            onChange={(e) => onChange({ consumirNoProximoTeste: e.target.checked })}
          />{" "}
          Consumir no próximo teste
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            data-testid="modificar-teste-confirmacao-contexto"
            type="checkbox"
            checked={campos.confirmacaoDeContexto}
            onChange={(e) => onChange({ confirmacaoDeContexto: e.target.checked })}
          />{" "}
          Confirmação de contexto
        </label>
      </div>
    </div>
  );
}

function CamposAlterarRecursoFields({ campos, onChange }: { campos: CamposAlterarRecurso; onChange: (p: Partial<CamposAlterarRecurso>) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={labelStyle}>
        Recurso
        <select data-testid="alterar-recurso-recurso" value={campos.recurso} onChange={(e) => onChange({ recurso: e.target.value as CamposAlterarRecurso["recurso"] })} style={inputStyle}>
          {RECURSOS_ALTERAR.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Operação
        <select data-testid="alterar-recurso-operacao" value={campos.operacao} onChange={(e) => onChange({ operacao: e.target.value as CamposAlterarRecurso["operacao"] })} style={inputStyle}>
          <option value="somar">Somar</option>
          <option value="reduzir">Reduzir</option>
          <option value="definir">Definir</option>
          <option value="conceder_temporariamente">Conceder temporariamente</option>
        </select>
      </label>
      <label style={labelStyle}>
        Valor fixo
        <input
          data-testid="alterar-recurso-valor-fixo"
          type="number"
          value={campos.valorFixo ?? ""}
          onChange={(e) => onChange({ valorFixo: numeroOuIndefinido(e.target.value) })}
          style={{ ...inputStyle, width: 90 }}
        />
      </label>
      <label style={labelStyle}>
        Fórmula (alternativa ao valor fixo)
        <input data-testid="alterar-recurso-formula" value={campos.formula ?? ""} onChange={(e) => onChange({ formula: e.target.value || undefined })} style={{ ...inputStyle, width: 120 }} />
      </label>
      <label style={labelStyle}>
        Mínimo
        <input
          data-testid="alterar-recurso-minimo"
          type="number"
          value={campos.minimo ?? ""}
          onChange={(e) => onChange({ minimo: numeroOuIndefinido(e.target.value) })}
          style={{ ...inputStyle, width: 80 }}
        />
      </label>
      <label style={labelStyle}>
        Máximo
        <input
          data-testid="alterar-recurso-maximo"
          type="number"
          value={campos.maximo ?? ""}
          onChange={(e) => onChange({ maximo: numeroOuIndefinido(e.target.value) })}
          style={{ ...inputStyle, width: 80 }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input
          data-testid="alterar-recurso-bloquear"
          type="checkbox"
          checked={campos.bloquearPorInsuficiencia}
          onChange={(e) => onChange({ bloquearPorInsuficiencia: e.target.checked })}
        />{" "}
        Bloquear por insuficiência
      </label>
      {campos.operacao === "reduzir" && (
        <>
          <label style={labelStyle}>
            Momento do consumo
            <select
              data-testid="alterar-recurso-momento-consumo"
              value={campos.momentoConsumo ?? ""}
              onChange={(e) => onChange({ momentoConsumo: (e.target.value || undefined) as CamposAlterarRecurso["momentoConsumo"] })}
              style={inputStyle}
            >
              <option value="">—</option>
              {MOMENTOS_CONSUMO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              data-testid="alterar-recurso-refund"
              type="checkbox"
              checked={campos.refundEmCancelamento ?? false}
              onChange={(e) => onChange({ refundEmCancelamento: e.target.checked })}
            />{" "}
            Refund se a operação for cancelada depois do consumo
          </label>
        </>
      )}
    </div>
  );
}

const FAIXA_LABEL: Record<FaixaResultadoTeste, string> = {
  falha_critica: "Falha crítica",
  falha: "Falha",
  falha_limitada: "Falha limitada",
  sucesso_limitado: "Sucesso limitado",
  sucesso_padrao: "Sucesso",
  sucesso_critico: "Sucesso crítico",
  manual: "Resultado manual (mesa decide)",
};

function CamposModificarMargemFields({ campos, onChange, opcoes }: { campos: CamposModificarMargem; onChange: (p: Partial<CamposModificarMargem>) => void; opcoes: OpcoesDeRegras }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={labelStyle}>
        Operação
        <select data-testid="modificar-margem-operacao" value={campos.operacao} onChange={(e) => onChange({ operacao: e.target.value as CamposModificarMargem["operacao"] })} style={inputStyle}>
          <option value="promover">Promover</option>
          <option value="rebaixar">Rebaixar</option>
          <option value="definir">Definir</option>
        </select>
      </label>
      <label style={labelStyle}>
        Faixa de origem
        <select data-testid="modificar-margem-faixa-origem" value={campos.faixaOrigem ?? ""} onChange={(e) => onChange({ faixaOrigem: (e.target.value || undefined) as FaixaResultadoTeste | undefined })} style={inputStyle}>
          <option value="">—</option>
          {FAIXAS_RESULTADO_TESTE.filter((f) => f !== "manual").map((f) => (
            <option key={f} value={f}>
              {FAIXA_LABEL[f]}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Faixa de destino
        <select data-testid="modificar-margem-faixa-destino" value={campos.faixaDestino ?? ""} onChange={(e) => onChange({ faixaDestino: (e.target.value || undefined) as FaixaResultadoTeste | undefined })} style={inputStyle}>
          <option value="">—</option>
          {FAIXAS_RESULTADO_TESTE.filter((f) => f !== "manual").map((f) => (
            <option key={f} value={f}>
              {FAIXA_LABEL[f]}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Contexto
        <select data-testid="modificar-margem-contexto" value={campos.contexto} onChange={(e) => onChange({ contexto: e.target.value as CamposModificarMargem["contexto"] })} style={inputStyle}>
          <option value="teste">Teste</option>
          <option value="ataque">Ataque</option>
          <option value="defesa">Defesa</option>
          <option value="pericia">Perícia</option>
          <option value="acao">Ação</option>
        </select>
      </label>
      <div style={{ minWidth: 220 }}>
        <StringListEditor
          label="Perícias afetadas (slugs reais)"
          valores={campos.pericias}
          onChange={(pericias) => onChange({ pericias })}
          placeholder={opcoes.pericias[0]?.id ?? "slug da perícia"}
          testId="modificar-margem-pericias"
        />
      </div>
      <label style={labelStyle}>
        Contexto real (texto — a pessoa jogadora confirma que bate antes de aplicar)
        <input data-testid="modificar-margem-contexto-texto" maxLength={300} value={campos.contextoTexto ?? ""} onChange={(e) => onChange({ contextoTexto: e.target.value || undefined })} style={{ ...inputStyle, minWidth: 220 }} />
      </label>
    </div>
  );
}

function CamposAlterarDanoRecebidoFields({ campos, onChange, opcoes }: { campos: CamposAlterarDanoRecebido; onChange: (p: Partial<CamposAlterarDanoRecebido>) => void; opcoes: OpcoesDeRegras }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={labelStyle}>
        Operação
        <select data-testid="alterar-dano-recebido-operacao" value={campos.operacao} onChange={(e) => onChange({ operacao: e.target.value as CamposAlterarDanoRecebido["operacao"] })} style={inputStyle}>
          <option value="reduzir">Reduzir</option>
          <option value="anular">Anular</option>
          <option value="multiplicar">Multiplicar</option>
        </select>
      </label>
      {campos.operacao === "reduzir" && (
        <label style={labelStyle}>
          Valor fixo *
          <input
            data-testid="alterar-dano-recebido-valor-fixo"
            type="number"
            min={0}
            value={campos.valorFixo ?? ""}
            onChange={(e) => onChange({ valorFixo: numeroOuIndefinido(e.target.value) })}
            style={{ ...inputStyle, width: 90 }}
          />
        </label>
      )}
      {campos.operacao === "multiplicar" && (
        <label style={labelStyle}>
          Multiplicador *
          <input
            data-testid="alterar-dano-recebido-multiplicador"
            type="number"
            min={0}
            step={0.1}
            value={campos.multiplicador ?? ""}
            onChange={(e) => onChange({ multiplicador: numeroOuIndefinido(e.target.value) })}
            style={{ ...inputStyle, width: 90 }}
          />
        </label>
      )}
      <label style={labelStyle}>
        Tipo de dano (opcional)
        <select data-testid="alterar-dano-recebido-tipo-dano" value={campos.tipoDano ?? ""} onChange={(e) => onChange({ tipoDano: e.target.value || undefined })} style={inputStyle}>
          <option value="">Qualquer tipo</option>
          {opcoes.tiposDano.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Momento
        <select data-testid="alterar-dano-recebido-momento" value={campos.momento} onChange={(e) => onChange({ momento: e.target.value as CamposAlterarDanoRecebido["momento"] })} style={inputStyle}>
          <option value="antes_mit">Antes de MIT</option>
          <option value="depois_mit">Depois de MIT</option>
          <option value="antes_pd">Antes de PD</option>
          <option value="depois_pd">Depois de PD</option>
          <option value="apos_defesas">Após defesas</option>
        </select>
      </label>
      <p style={{ fontSize: 12, color: "#7d7d8a", margin: 0 }}>Sem executor real ainda — sempre lembrete (ver diagnóstico).</p>
    </div>
  );
}

function CamposTesteResistenciaFields({
  campos,
  onChange,
  opcoes,
  condicoesDisponiveis,
}: {
  campos: CamposTesteResistencia;
  onChange: (p: Partial<CamposTesteResistencia>) => void;
  opcoes: OpcoesDeRegras;
  condicoesDisponiveis: { slug: string; nome: string }[];
}) {
  const faixasUsadas = new Set(campos.resultados.map((r) => r.faixa));
  const faixasDisponiveis = FAIXAS_RESULTADO_TESTE.filter((f) => !faixasUsadas.has(f));

  function atualizarResultado(id: string, patch: Partial<ResultadoTeste>) {
    onChange({ resultados: campos.resultados.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  }
  function removerResultado(id: string) {
    if (!window.confirm("Remover este resultado e todos os seus efeitos filhos?")) return;
    onChange({ resultados: renormalizarOrdemResultados(campos.resultados.filter((r) => r.id !== id)) });
  }
  function duplicarResultado(id: string) {
    const indice = campos.resultados.findIndex((r) => r.id === id);
    if (indice === -1) return;
    const proximaFaixa = faixasDisponiveis[0];
    if (!proximaFaixa) return; // sem faixa livre para a cópia — evita faixa duplicada.
    const copia: ResultadoTeste = { ...campos.resultados[indice], id: gerarIdCopiaResultado(), faixa: proximaFaixa };
    const novos = [...campos.resultados.slice(0, indice + 1), copia, ...campos.resultados.slice(indice + 1)];
    onChange({ resultados: renormalizarOrdemResultados(novos) });
  }
  function moverResultado(id: string, direcao: -1 | 1) {
    const indice = campos.resultados.findIndex((r) => r.id === id);
    const alvo = indice + direcao;
    if (indice === -1 || alvo < 0 || alvo >= campos.resultados.length) return;
    const novos = [...campos.resultados];
    [novos[indice], novos[alvo]] = [novos[alvo], novos[indice]];
    onChange({ resultados: renormalizarOrdemResultados(novos) });
  }
  function adicionarResultado() {
    const faixa = faixasDisponiveis[0];
    if (!faixa) return;
    onChange({ resultados: [...campos.resultados, novoResultadoTeste(faixa, campos.resultados.length)] });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={labelStyle}>
          Modo
          <select data-testid="teste-resistencia-modo" value={campos.modo} onChange={(e) => onChange({ modo: e.target.value as CamposTesteResistencia["modo"] })} style={inputStyle}>
            <option value="teste">Teste</option>
            <option value="resistencia">Resistência</option>
          </select>
        </label>
        <label style={labelStyle}>
          Quem testa
          <select data-testid="teste-resistencia-quem-testa" value={campos.quemTesta ?? ""} onChange={(e) => onChange({ quemTesta: (e.target.value || undefined) as CamposTesteResistencia["quemTesta"] })} style={inputStyle}>
            <option value="">—</option>
            <option value="usuario">Usuário</option>
            <option value="alvo">Alvo</option>
            <option value="atacante">Atacante</option>
            <option value="defensor">Defensor</option>
            <option value="portador">Portador</option>
            <option value="selecionado_manualmente">Selecionado manualmente</option>
          </select>
        </label>
        <label style={labelStyle}>
          Atributo
          <select data-testid="teste-resistencia-atributo" value={campos.atributo ?? ""} onChange={(e) => onChange({ atributo: e.target.value || undefined })} style={inputStyle}>
            <option value="">—</option>
            {opcoes.atributos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Perícia
          <select data-testid="teste-resistencia-pericia" value={campos.pericia ?? ""} onChange={(e) => onChange({ pericia: e.target.value || undefined })} style={inputStyle}>
            <option value="">—</option>
            {opcoes.pericias.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={labelStyle}>
          Tipo de CD
          <select
            data-testid="teste-resistencia-cd-tipo"
            value={campos.cd?.tipo ?? ""}
            onChange={(e) => {
              const tipo = e.target.value;
              if (tipo === "fixa") onChange({ cd: { tipo: "fixa", valor: 0 } });
              else if (tipo === "derivada") onChange({ cd: { tipo: "derivada", origem: "vertente" } });
              else onChange({ cd: undefined });
            }}
            style={inputStyle}
          >
            <option value="">—</option>
            <option value="fixa">Fixa</option>
            <option value="derivada">Derivada</option>
          </select>
        </label>
        {campos.cd?.tipo === "fixa" && (
          <label style={labelStyle}>
            CD *
            <input
              data-testid="teste-resistencia-cd-valor"
              type="number"
              min={1}
              value={campos.cd.valor}
              onChange={(e) => {
                const n = numeroOuIndefinido(e.target.value);
                if (n != null && n >= 0 && Number.isInteger(n)) onChange({ cd: { tipo: "fixa", valor: n } });
              }}
              style={{ ...inputStyle, width: 90 }}
            />
          </label>
        )}
        {campos.cd?.tipo === "derivada" && (
          <p data-testid="teste-resistencia-cd-formula" style={{ fontSize: 13, color: "#8fd6a0", margin: 0 }}>
            CD = 6 + nível da vertente (regra canônica — resolvida no momento da rolagem, nunca a fórmula legada &quot;5 + nivel_vertente&quot;).
          </p>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input data-testid="teste-resistencia-confirmacao" type="checkbox" checked={campos.confirmacaoManual} onChange={(e) => onChange({ confirmacaoManual: e.target.checked })} /> Exige confirmação
          manual
        </label>
      </div>

      <h5 style={{ fontSize: 13, color: "#a8a8b3", marginBottom: 6 }} data-testid="teste-resistencia-resultados-titulo">
        Resultados ({campos.resultados.length})
      </h5>
      {campos.resultados.length === 0 && (
        <p data-testid="teste-resistencia-resultados-vazio" style={{ color: "#7d7d8a", fontSize: 13 }}>
          Nenhum resultado configurado ainda.
        </p>
      )}
      {[...campos.resultados]
        .sort((a, b) => a.ordem - b.ordem)
        .map((resultado, indice) => (
          <div key={resultado.id} data-testid="teste-resistencia-resultado-card" data-resultado-id={resultado.id} data-resultado-faixa={resultado.faixa} style={{ border: "1px solid #2a2b33", borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <select
                data-testid="teste-resistencia-resultado-faixa"
                value={resultado.faixa}
                onChange={(e) => atualizarResultado(resultado.id, { faixa: e.target.value as FaixaResultadoTeste })}
                style={inputStyle}
              >
                <option value={resultado.faixa}>{FAIXA_LABEL[resultado.faixa]}</option>
                {faixasDisponiveis.map((f) => (
                  <option key={f} value={f}>
                    {FAIXA_LABEL[f]}
                  </option>
                ))}
              </select>
              <button type="button" data-testid="teste-resistencia-resultado-mover-cima" onClick={() => moverResultado(resultado.id, -1)} disabled={indice === 0} style={inputStyle}>
                ↑
              </button>
              <button
                type="button"
                data-testid="teste-resistencia-resultado-mover-baixo"
                onClick={() => moverResultado(resultado.id, 1)}
                disabled={indice === campos.resultados.length - 1}
                style={inputStyle}
              >
                ↓
              </button>
              <button type="button" data-testid="teste-resistencia-resultado-duplicar" onClick={() => duplicarResultado(resultado.id)} disabled={faixasDisponiveis.length === 0} style={inputStyle}>
                Duplicar
              </button>
              <button type="button" data-testid="teste-resistencia-resultado-remover" onClick={() => removerResultado(resultado.id)} style={{ ...inputStyle, color: "#e08a8a" }}>
                Remover
              </button>
            </div>
            <label style={{ ...labelStyle, marginBottom: 8 }}>
              Texto do resultado
              <input
                data-testid="teste-resistencia-resultado-texto"
                maxLength={500}
                value={resultado.textoResultado ?? ""}
                onChange={(e) => atualizarResultado(resultado.id, { textoResultado: e.target.value || undefined })}
                style={inputStyle}
              />
            </label>
            <EffectsEditorSection
              efeitos={resultado.efeitos}
              // `tiposPermitidos={TIPOS_EFEITO_FILHO}` garante que esta instância
              // nunca cria/mantém um "teste_resistencia" — cast seguro por construção.
              onChange={(efeitos) => atualizarResultado(resultado.id, { efeitos: efeitos as ResultadoTeste["efeitos"] })}
              opcoes={opcoes}
              condicoesDisponiveis={condicoesDisponiveis}
              escopoId={`resultado-${resultado.id}`}
              tiposPermitidos={TIPOS_EFEITO_FILHO}
            />
          </div>
        ))}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" data-testid="teste-resistencia-adicionar-resultado" onClick={adicionarResultado} disabled={faixasDisponiveis.length === 0} style={inputStyle}>
          + Adicionar resultado
        </button>
        {faixasDisponiveis.length === 0 && <span style={{ fontSize: 12, color: "#7d7d8a" }}>Todas as faixas já têm um resultado.</span>}
      </div>
    </div>
  );
}

const TIPOS_MODIFICADOR_SIMPLES = ["modificar_teste"] as const;

function CamposEfeitoTemporarioFields({ campos, onChange, opcoes }: { campos: CamposEfeitoTemporario; onChange: (p: Partial<CamposEfeitoTemporario>) => void; opcoes: OpcoesDeRegras }) {
  const atingiuLimite = campos.modificadores.length >= MAX_MODIFICADORES_EFEITO_TEMPORARIO;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
        <label style={labelStyle}>
          Duração
          <select
            data-testid="efeito-temporario-duracao-tipo"
            value={campos.duracao.tipo}
            onChange={(e) => onChange({ duracao: { tipo: e.target.value as CamposEfeitoTemporario["duracao"]["tipo"], rodadas: campos.duracao.rodadas } })}
            style={inputStyle}
          >
            {DURACOES_EFEITO_TEMPORARIO.map((d) => (
              <option key={d} value={d}>
                {d === "rounds" ? "rodadas" : d === "scene" ? "cena" : d === "rest" ? "descanso longo" : "manual"}
              </option>
            ))}
          </select>
        </label>
        {campos.duracao.tipo === "rounds" && (
          <label style={labelStyle}>
            Rodadas
            <input
              data-testid="efeito-temporario-duracao-rodadas"
              type="number"
              min={1}
              value={campos.duracao.rodadas ?? 1}
              onChange={(e) => onChange({ duracao: { tipo: "rounds", rodadas: Math.max(1, Number(e.target.value) || 1) } })}
              style={{ ...inputStyle, width: 80 }}
            />
          </label>
        )}
        <label style={labelStyle}>
          Ao reaplicar
          <select
            data-testid="efeito-temporario-politica-reaplicacao"
            value={campos.politicaReaplicacao}
            onChange={(e) => onChange({ politicaReaplicacao: e.target.value as CamposEfeitoTemporario["politicaReaplicacao"] })}
            style={inputStyle}
          >
            {POLITICAS_REAPLICACAO.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            data-testid="efeito-temporario-acumulavel"
            type="checkbox"
            checked={campos.acumulavel}
            onChange={(e) => onChange({ acumulavel: e.target.checked, maximoPilhas: e.target.checked ? (campos.maximoPilhas ?? 1) : undefined })}
          />{" "}
          Acumulável (pilhas)
        </label>
        {campos.acumulavel && (
          <>
            <label style={labelStyle}>
              Máximo de pilhas
              <input
                data-testid="efeito-temporario-max-pilhas"
                type="number"
                min={1}
                value={campos.maximoPilhas ?? 1}
                onChange={(e) => onChange({ maximoPilhas: Math.max(1, Number(e.target.value) || 1) })}
                style={{ ...inputStyle, width: 80 }}
              />
            </label>
            <label style={labelStyle}>
              Pilhas iniciais
              <input
                data-testid="efeito-temporario-pilhas-iniciais"
                type="number"
                min={1}
                value={campos.pilhasIniciais ?? 1}
                onChange={(e) => onChange({ pilhasIniciais: Math.max(1, Number(e.target.value) || 1) })}
                style={{ ...inputStyle, width: 80 }}
              />
            </label>
          </>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input data-testid="efeito-temporario-confirmacao" type="checkbox" checked={campos.confirmacaoManual} onChange={(e) => onChange({ confirmacaoManual: e.target.checked })} /> Exige
          confirmação manual
        </label>
      </div>

      <h5 style={{ fontSize: 13, color: "#a8a8b3", marginBottom: 6 }} data-testid="efeito-temporario-modificadores-titulo">
        Modificadores ({campos.modificadores.length}/{MAX_MODIFICADORES_EFEITO_TEMPORARIO})
      </h5>
      {/* `tiposPermitidos={TIPOS_MODIFICADOR_SIMPLES}` garante que esta instância só cria `modificar_teste`
          (nunca outro efeito temporário nem teste/resistência) — mesma técnica de exclusão por construção
          usada pelos filhos de resultado (ver ModificadorSimplesEfeitoTemporario). */}
      <EffectsEditorSection
        efeitos={campos.modificadores}
        onChange={(efeitos) => {
          const limitados = (efeitos as ModificadorSimplesEfeitoTemporario[]).slice(0, MAX_MODIFICADORES_EFEITO_TEMPORARIO);
          onChange({ modificadores: limitados });
        }}
        opcoes={opcoes}
        condicoesDisponiveis={[]}
        escopoId={`efeito-temporario-modificadores`}
        tiposPermitidos={TIPOS_MODIFICADOR_SIMPLES}
      />
      {atingiuLimite && <p style={{ fontSize: 12, color: "#7d7d8a" }}>Limite de {MAX_MODIFICADORES_EFEITO_TEMPORARIO} modificadores atingido.</p>}
    </div>
  );
}

function CamposAcaoReacaoAdicionalFields({ campos, onChange }: { campos: CamposAcaoReacaoAdicional; onChange: (p: Partial<CamposAcaoReacaoAdicional>) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <p style={{ width: "100%", fontSize: 12, color: "#a8a8b3", margin: "0 0 4px" }}>Nenhum executor real concede isto automaticamente ainda — sempre lembrete para o narrador.</p>
      <label style={labelStyle}>
        Tipo
        <select data-testid="acao-adicional-tipo" value={campos.tipo} onChange={(e) => onChange({ tipo: e.target.value as CamposAcaoReacaoAdicional["tipo"] })} style={inputStyle}>
          {TIPOS_ACAO_ADICIONAL.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Ação permitida
        <input data-testid="acao-adicional-acao-permitida" value={campos.acaoPermitida ?? ""} onChange={(e) => onChange({ acaoPermitida: e.target.value || undefined })} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        Quantidade
        <input
          data-testid="acao-adicional-quantidade"
          type="number"
          min={1}
          value={campos.quantidade}
          onChange={(e) => onChange({ quantidade: Math.max(1, Number(e.target.value) || 1) })}
          style={{ ...inputStyle, width: 80 }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="acao-adicional-gratuito" type="checkbox" checked={campos.gratuito} onChange={(e) => onChange({ gratuito: e.target.checked })} /> Gratuito
      </label>
      {!campos.gratuito && (
        <label style={labelStyle}>
          Custo substituído
          <input data-testid="acao-adicional-custo-substituido" value={campos.custoSubstituido ?? ""} onChange={(e) => onChange({ custoSubstituido: e.target.value || undefined })} style={inputStyle} />
        </label>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="acao-adicional-consome-reacao" type="checkbox" checked={campos.consomeReacao} onChange={(e) => onChange({ consomeReacao: e.target.checked })} /> Consome uma Reação
      </label>
      <label style={labelStyle}>
        Consome PA
        <input
          data-testid="acao-adicional-consome-pa"
          type="number"
          min={0}
          value={campos.consomePa ?? ""}
          onChange={(e) => onChange({ consomePa: numeroOuIndefinido(e.target.value) })}
          style={{ ...inputStyle, width: 80 }}
        />
      </label>
      <label style={labelStyle}>
        Janela
        <input data-testid="acao-adicional-janela" value={campos.janela ?? ""} onChange={(e) => onChange({ janela: e.target.value || undefined })} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        Penalidade
        <input data-testid="acao-adicional-penalidade" value={campos.penalidade ?? ""} onChange={(e) => onChange({ penalidade: e.target.value || undefined })} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        Limite de ações encadeadas
        <input
          data-testid="acao-adicional-limite"
          type="number"
          min={1}
          value={campos.limite ?? ""}
          onChange={(e) => onChange({ limite: numeroOuIndefinido(e.target.value) })}
          style={{ ...inputStyle, width: 80 }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="acao-adicional-confirmacao" type="checkbox" checked={campos.confirmacaoManual} onChange={(e) => onChange({ confirmacaoManual: e.target.checked })} /> Exige confirmação
        manual
      </label>
    </div>
  );
}

function CamposModificarInstanciaFields({ campos, onChange }: { campos: CamposModificarInstancia; onChange: (p: Partial<CamposModificarInstancia>) => void }) {
  const exigeValor = campos.operacao !== "reparar_mit" && campos.operacao !== "reparar_pd";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={labelStyle}>
        Operação
        <select data-testid="modificar-instancia-operacao" value={campos.operacao} onChange={(e) => onChange({ operacao: e.target.value as CamposModificarInstancia["operacao"] })} style={inputStyle}>
          {OPERACOES_MODIFICAR_INSTANCIA.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        {exigeValor ? "Valor (delta)" : "Valor a reparar (sempre positivo)"}
        <input
          data-testid="modificar-instancia-valor"
          type="number"
          min={exigeValor ? undefined : 1}
          value={campos.valor ?? ""}
          onChange={(e) => onChange({ valor: numeroOuIndefinido(e.target.value) })}
          style={{ ...inputStyle, width: 90 }}
        />
      </label>
      <label style={labelStyle}>
        Limite
        <input data-testid="modificar-instancia-limite" type="number" min={0} value={campos.limite ?? ""} onChange={(e) => onChange({ limite: numeroOuIndefinido(e.target.value) })} style={{ ...inputStyle, width: 80 }} />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="modificar-instancia-confirmacao" type="checkbox" checked={campos.confirmacaoManual} onChange={(e) => onChange({ confirmacaoManual: e.target.checked })} /> Exige confirmação
        manual
      </label>
      <p style={{ width: "100%", fontSize: 12, color: "#a8a8b3", margin: "4px 0 0" }}>
        Executor real (setItemMitAtual/PdAtual/CargaAtual/MunicaoAtual) — a seleção da instância-alvo continua manual.
      </p>
    </div>
  );
}

function CamposConcederItemFields({ campos, onChange }: { campos: CamposConcederItem; onChange: (p: Partial<CamposConcederItem>) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <p style={{ width: "100%", fontSize: 12, color: "#a8a8b3", margin: "0 0 4px" }}>Sem executor real conectado nesta etapa — sempre lembrete.</p>
      <label style={labelStyle}>
        Item (slug da Biblioteca)
        <input data-testid="conceder-item-slug" value={campos.itemSlug} onChange={(e) => onChange({ itemSlug: e.target.value })} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        Quantidade
        <input data-testid="conceder-item-quantidade" type="number" min={1} value={campos.quantidade} onChange={(e) => onChange({ quantidade: Math.max(1, Number(e.target.value) || 1) })} style={{ ...inputStyle, width: 80 }} />
      </label>
      <label style={labelStyle}>
        Destino
        <select data-testid="conceder-item-destino" value={campos.destino} onChange={(e) => onChange({ destino: e.target.value as CamposConcederItem["destino"] })} style={inputStyle}>
          {DESTINOS_CONCEDER_ITEM.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Estado inicial
        <input value={campos.estadoInicial ?? ""} onChange={(e) => onChange({ estadoInicial: e.target.value || undefined })} style={inputStyle} placeholder="equipado | empunhado | acesso_rapido | mochila" />
      </label>
      <label style={labelStyle}>
        Cargas iniciais
        <input type="number" min={0} value={campos.cargasIniciais ?? ""} onChange={(e) => onChange({ cargasIniciais: numeroOuIndefinido(e.target.value) })} style={{ ...inputStyle, width: 90 }} />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input type="checkbox" checked={campos.permitirDuplicata} onChange={(e) => onChange({ permitirDuplicata: e.target.checked })} /> Permitir duplicata
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input type="checkbox" checked={campos.empilharQuandoCompativel} onChange={(e) => onChange({ empilharQuandoCompativel: e.target.checked })} /> Empilhar quando compatível
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="conceder-item-confirmacao" type="checkbox" checked={campos.confirmacaoManual} onChange={(e) => onChange({ confirmacaoManual: e.target.checked })} /> Exige confirmação manual
      </label>
    </div>
  );
}

function CamposConsumirItemFields({ campos, onChange }: { campos: CamposConsumirItem; onChange: (p: Partial<CamposConsumirItem>) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <p style={{ width: "100%", fontSize: 12, color: "#a8a8b3", margin: "0 0 4px" }}>Sem executor real conectado nesta etapa — sempre lembrete.</p>
      <label style={labelStyle}>
        Item (slug — vazio = própria instância)
        <input data-testid="consumir-item-slug" value={campos.itemSlug ?? ""} onChange={(e) => onChange({ itemSlug: e.target.value || undefined })} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        Quantidade
        <input data-testid="consumir-item-quantidade" type="number" min={1} value={campos.quantidade} onChange={(e) => onChange({ quantidade: Math.max(1, Number(e.target.value) || 1) })} style={{ ...inputStyle, width: 80 }} />
      </label>
      <label style={labelStyle}>
        Comportamento com pilha
        <select value={campos.comportamentoPilha} onChange={(e) => onChange({ comportamentoPilha: e.target.value as CamposConsumirItem["comportamentoPilha"] })} style={inputStyle}>
          {COMPORTAMENTOS_PILHA_CONSUMIR.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input type="checkbox" checked={campos.refund} onChange={(e) => onChange({ refund: e.target.checked })} /> Refund em cancelamento
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="consumir-item-confirmacao" type="checkbox" checked={campos.confirmacaoManual} onChange={(e) => onChange({ confirmacaoManual: e.target.checked })} /> Exige confirmação manual
      </label>
    </div>
  );
}

function CamposAlterarPrecoFields({ campos, onChange }: { campos: CamposAlterarPreco; onChange: (p: Partial<CamposAlterarPreco>) => void }) {
  const temLeitorReal = campos.operacao === "desconto_percentual" || campos.operacao === "permitir_compra_fiada";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={labelStyle}>
        Operação
        <select data-testid="alterar-preco-operacao" value={campos.operacao} onChange={(e) => onChange({ operacao: e.target.value as CamposAlterarPreco["operacao"] })} style={inputStyle}>
          {OPERACOES_ALTERAR_PRECO.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      {campos.operacao === "desconto_percentual" && (
        <label style={labelStyle}>
          Percentual
          <input data-testid="alterar-preco-percentual" type="number" min={0} max={100} value={campos.percentual ?? ""} onChange={(e) => onChange({ percentual: numeroOuIndefinido(e.target.value) })} style={{ ...inputStyle, width: 80 }} />
        </label>
      )}
      {campos.operacao === "desconto_fixo" && (
        <label style={labelStyle}>
          Valor fixo
          <input type="number" min={0} value={campos.valorFixo ?? ""} onChange={(e) => onChange({ valorFixo: numeroOuIndefinido(e.target.value) })} style={{ ...inputStyle, width: 90 }} />
        </label>
      )}
      {campos.operacao === "multiplicador" && (
        <label style={labelStyle}>
          Multiplicador
          <input type="number" min={0} value={campos.multiplicador ?? ""} onChange={(e) => onChange({ multiplicador: numeroOuIndefinido(e.target.value) })} style={{ ...inputStyle, width: 90 }} />
        </label>
      )}
      {campos.operacao === "preco_minimo" && (
        <label style={labelStyle}>
          Preço mínimo
          <input type="number" min={0} value={campos.precoMinimo ?? ""} onChange={(e) => onChange({ precoMinimo: numeroOuIndefinido(e.target.value) })} style={{ ...inputStyle, width: 90 }} />
        </label>
      )}
      {campos.operacao === "permitir_compra_fiada" && (
        <label style={labelStyle}>
          Raridade máxima
          <input data-testid="alterar-preco-raridade-maxima" value={campos.raridadeMaxima ?? "raro"} onChange={(e) => onChange({ raridadeMaxima: e.target.value || undefined })} style={inputStyle} />
        </label>
      )}
      <label style={labelStyle}>
        Limite por compra
        <input type="number" min={1} value={campos.limitePorCompra ?? ""} onChange={(e) => onChange({ limitePorCompra: numeroOuIndefinido(e.target.value) })} style={{ ...inputStyle, width: 90 }} />
      </label>
      <label style={labelStyle}>
        Contexto (texto)
        <input value={campos.contextoTexto ?? ""} onChange={(e) => onChange({ contextoTexto: e.target.value || undefined })} style={inputStyle} placeholder="ex.: Mercados Noturnos" />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="alterar-preco-confirmacao" type="checkbox" checked={campos.confirmacaoManual} onChange={(e) => onChange({ confirmacaoManual: e.target.checked })} /> Exige confirmação manual
      </label>
      {!temLeitorReal && <p style={{ width: "100%", fontSize: 12, color: "#a8a8b3", margin: "4px 0 0" }}>Esta operação não tem leitor real no conteúdo hoje — só representável no rascunho, bloqueada na publicação.</p>}
    </div>
  );
}

function CamposAlterarDisponibilidadeFields({ campos, onChange }: { campos: CamposAlterarDisponibilidade; onChange: (p: Partial<CamposAlterarDisponibilidade>) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <p style={{ width: "100%", fontSize: 12, color: "#a8a8b3", margin: "0 0 4px" }}>Nenhum estado real de estoque de campanha existe hoje — sempre lembrete.</p>
      <label style={labelStyle}>
        Operação
        <select data-testid="alterar-disponibilidade-operacao" value={campos.operacao} onChange={(e) => onChange({ operacao: e.target.value as CamposAlterarDisponibilidade["operacao"] })} style={inputStyle}>
          {OPERACOES_DISPONIBILIDADE.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      {campos.operacao === "definir_estoque" && (
        <label style={labelStyle}>
          Quantidade
          <input data-testid="alterar-disponibilidade-quantidade" type="number" min={0} value={campos.quantidade ?? ""} onChange={(e) => onChange({ quantidade: numeroOuIndefinido(e.target.value) })} style={{ ...inputStyle, width: 90 }} />
        </label>
      )}
      <label style={labelStyle}>
        Fornecedor
        <input value={campos.fornecedor ?? ""} onChange={(e) => onChange({ fornecedor: e.target.value || undefined })} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        Contexto (texto)
        <input value={campos.contextoTexto ?? ""} onChange={(e) => onChange({ contextoTexto: e.target.value || undefined })} style={inputStyle} />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input data-testid="alterar-disponibilidade-confirmacao" type="checkbox" checked={campos.confirmacaoManual} onChange={(e) => onChange({ confirmacaoManual: e.target.checked })} /> Exige confirmação manual
      </label>
    </div>
  );
}

function renormalizarOrdemResultados(resultados: ResultadoTeste[]): ResultadoTeste[] {
  return resultados.map((r, indice) => ({ ...r, ordem: indice }));
}

function gerarIdCopiaResultado(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `resultado-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
