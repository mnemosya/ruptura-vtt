"use client";

import type { OpcoesDeRegras } from "../../../../../lib/contentSchema/characterRuleOptions";
import {
  RECURSOS_ALTERAR,
  formatarFormulaCura,
  formatarFormulaDano,
  type CamposAlterarRecurso,
  type CamposAplicarCondicao,
  type CamposCura,
  type CamposDano,
  type CamposModificarTeste,
  type CamposRemoverCondicao,
  type EfeitoEditavel,
} from "../../../../../lib/contentSchema/effectDraftTypes";
import { inputStyle, labelStyle } from "./formStyles";
import { StringListEditor } from "./StringListEditor";

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
    </div>
  );
}
