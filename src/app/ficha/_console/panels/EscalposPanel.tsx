"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { formatTechnicalContentField, type TechnicalContentItem } from "../../../../lib/content";
import type { InstalledEscalpo } from "../../../../lib/character";
import type { ConsoleApi } from "../types";
import { TextoComRegras } from "../TextoComRegras";
import { CabecalhoModulo } from "./CabecalhoModulo";
import { ConfirmModal } from "./AuxModals";

const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const moeda = (n: number) => `Ⱥ ${n.toLocaleString("pt-BR")}`;
function custoIntegridade(item?: TechnicalContentItem): number | null {
  const valor = item?.raw.custo_integridade;
  return typeof valor === "number" && Number.isFinite(valor) ? Math.abs(valor) : null;
}

type Registro = { id: string; nome: string; modelo?: TechnicalContentItem; instancia?: InstalledEscalpo };

/** Dossiê de leitura dos registros reais. Os estados da prévia não são dados da ficha. */
export function EscalposPanel({ api }: { api: ConsoleApi }) {
  const [aba, setAba] = useState<"instalados" | "catalogo">("instalados");
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ tipo: "instalar" | "remover"; id: string; nome: string } | null>(null);
  const { catalogo, erro } = api.escalpos;
  const instalados = api.character.escalpos_instalados ?? [];
  const publicados = catalogo.filter(e => e.status === "published");
  const porSlug = new Map(publicados.map(e => [e.slug, e]));
  const registros: Registro[] = aba === "instalados"
    ? instalados.map(i => ({ id: i.id, nome: i.nomeCustomizado || porSlug.get(i.contentId)?.nome || i.contentId, modelo: porSlug.get(i.contentId), instancia: i }))
    : publicados.map(e => ({ id: e.slug, nome: e.nome, modelo: e }));
  const visiveis = registros.filter(e => normalizar(`${e.nome} ${e.modelo?.categoriaLabel ?? e.modelo?.categoria ?? ""}`).includes(normalizar(busca)));
  const registro = visiveis.find(e => e.id === selecionado) ?? visiveis[0];
  const custos = instalados.map(i => custoIntegridade(porSlug.get(i.contentId)));
  const total = custos.reduce<number>((s, n) => s + (n ?? 0), 0);
  const totalConhecido = !erro && custos.every(n => n != null);
  const escolherAba = (value: typeof aba) => { setAba(value); setSelecionado(null); setBusca(""); };

  return <section className="rc-eq-outer" aria-label="Escalpos">
    <div className="rc-eq-card-outer rc-inv-moldura">
      <CabecalhoModulo id="ID://ESCALPOS" mod="MOD.BIO // 03" />
      <div className="rc-inv rc-esc" data-testid="console-escalpos">
        <div className="rc-inv-abas" role="group" aria-label="Escalpos instalados ou catálogo">
          <button type="button" className="rc-inv-aba" data-ativo={aba === "instalados" || undefined} aria-pressed={aba === "instalados"} onClick={() => escolherAba("instalados")}>Instalados <span className="rc-inv-aba-n">{instalados.length}</span></button>
          <button type="button" className="rc-inv-aba" data-ativo={aba === "catalogo" || undefined} aria-pressed={aba === "catalogo"} onClick={() => escolherAba("catalogo")}>Catálogo <span className="rc-inv-aba-n">{erro ? "—" : publicados.length}</span></button>
        </div>
        <div className="rc-esc-resumo"><span>Custo de Integridade <strong>{totalConhecido ? (total ? `−${total}` : "0") : "Não informado"}</strong></span><span>{instalados.length} instalado{instalados.length === 1 ? "" : "s"}</span></div>
        {erro && <div className="rc-esc-alerta" role="alert"><strong>Catálogo indisponível</strong><span>Não foi possível carregar os detalhes. Seus registros instalados continuam preservados.</span></div>}
        <div className="rc-inv-corpo">
          <div className="rc-inv-lista">
            <div className="rc-inv-busca-linha"><label className="rc-inv-busca"><Search size={14} aria-hidden="true" /><input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar escalpo..." aria-label="Buscar escalpo" /></label></div>
            <div className="rc-inv-rolo"><div className="rc-inv-grade rc-esc-grade">
              {visiveis.map(e => {
                const custo = custoIntegridade(e.modelo);
                return <button type="button" className="rc-inv-card rc-esc-card" key={e.id} aria-pressed={registro?.id === e.id} onClick={() => setSelecionado(e.id)}>
                  <span className="rc-inv-card-face"><span className="rc-inv-card-nome"><small>{e.modelo?.categoriaLabel ?? e.modelo?.categoria ?? "Categoria não informada"}</small>{e.nome}</span><span className="rc-inv-card-footer"><span className="rc-inv-card-cat">{e.instancia ? "Instalado" : e.modelo?.raridadeLabel ?? e.modelo?.raridade ?? "Catálogo"}</span><span className="rc-inv-qtd">{custo == null ? "—" : custo ? `−${custo}` : "0"}<small> INT</small></span></span></span>
                </button>;
              })}
              {!visiveis.length && <div className="rc-esc-vazio"><strong>{busca ? "Nenhum escalpo encontrado" : aba === "instalados" ? "Nenhum escalpo instalado" : erro ? "Catálogo indisponível" : "Nenhum escalpo publicado"}</strong><p>{busca ? "Tente outro nome ou categoria." : aba === "instalados" ? "Os implantes aparecerão aqui após o registro da instalação." : "Os modelos publicados aparecerão aqui quando estiverem disponíveis."}</p>{aba === "instalados" && !busca && <button type="button" className="rc-inv-btn" onClick={() => escolherAba("catalogo")}>Consultar catálogo</button>}</div>}
            </div></div>
          </div>
          <div className="rc-inv-detalhe">
            {registro ? <DetalheEscalpo key={`${aba}:${registro.id}`} registro={registro} api={api} onInstalar={() => setConfirmacao({ tipo: "instalar", id: registro.modelo!.slug, nome: registro.nome })} onRemover={() => setConfirmacao({ tipo: "remover", id: registro.instancia!.id, nome: registro.nome })} /> : <div className="rc-esc-vazio"><span className="rc-esc-vazio-id">ID://DOSSIÊ</span><strong>Selecione um escalpo</strong><p>Consulte os detalhes, requisitos e informações da instalação.</p></div>}
          </div>
        </div>
      </div>
    </div>
    {confirmacao && <ConfirmModal titulo={confirmacao.tipo === "instalar" ? "Registrar instalação?" : "Remover escalpo?"} mensagem={confirmacao.tipo === "instalar" ? `Registrar ${confirmacao.nome} como instalado após o procedimento com o biomecânico? Este registro não realiza uma compra.` : `Remover ${confirmacao.nome} dos escalpos instalados? Seus modificadores automáticos deixarão de ser aplicados.`} onFechar={() => setConfirmacao(null)} onConfirmar={() => {
      if (confirmacao.tipo === "instalar") { api.escalpos.instalar(confirmacao.id); escolherAba("instalados"); }
      else api.escalpos.remover(confirmacao.id);
      setConfirmacao(null);
    }} />}
  </section>;
}

function DetalheEscalpo({ registro, api, onInstalar, onRemover }: { registro: Registro; api: ConsoleApi; onInstalar: () => void; onRemover: () => void }) {
  const { modelo, instancia } = registro;
  const custo = custoIntegridade(modelo);
  const requisitos = formatTechnicalContentField(modelo?.requisitos);
  return <div className="rc-inv-det rc-esc-det">
    <div className="rc-esc-conteudo">
      <div className="rc-inv-det-cab"><div className="rc-inv-det-titulo"><span className="rc-esc-kicker">{modelo?.categoriaLabel ?? modelo?.categoria ?? "ESCALPO"}</span><h3>{registro.nome}</h3><div className="rc-inv-etiquetas">{(modelo?.raridadeLabel ?? modelo?.raridade) && <span className="rc-inv-etiqueta">{modelo?.raridadeLabel ?? modelo?.raridade}</span>}<span className="rc-inv-etiqueta">{instancia ? "Instalado" : "Catálogo"}</span></div></div></div>
      {instancia && <div className="rc-esc-estado"><span className="rc-esc-estado-marca">—</span><div><strong>Condição não registrada</strong><p>O registro de instalação não informa Desgaste, inatividade temporária ou usos disponíveis.</p></div></div>}
      {modelo ? <>
        {modelo.descricaoCurta && <TextoComRegras texto={modelo.descricaoCurta} glossario={api.glossario} className="rc-inv-det-desc" />}
        <div className="rc-esc-metricas"><div><span>Custo de Integridade</span><strong>{custo == null ? "Não informado" : custo ? `−${custo}` : "0"}</strong></div><div><span>Preço base</span><strong>{modelo.preco == null ? "Não informado" : moeda(modelo.preco)}</strong></div></div>
        {modelo.descricaoLonga && modelo.descricaoLonga !== modelo.descricaoCurta && <div className="rc-inv-efeito"><TextoComRegras texto={modelo.descricaoLonga} glossario={api.glossario} className="rc-inv-efeito-corpo rc-inv-det-desc" /></div>}
        {requisitos && <dl className="rc-inv-linhas"><div className="rc-inv-linha"><dt>Requisitos</dt><dd>{requisitos}</dd></div></dl>}
        <section className="rc-esc-modulos" aria-label="Módulos"><h4>Módulos</h4><p>Os módulos vinculados e os espaços deste escalpo ainda não estão informados.</p></section>
      </> : <div className="rc-esc-alerta"><strong>Detalhes indisponíveis</strong><span>O modelo não está disponível no catálogo. O registro instalado foi preservado.</span></div>}
      {instancia?.notas && <section className="rc-esc-modulos"><h4>Notas da instalação</h4><p>{instancia.notas}</p></section>}
      {instancia && api.escalpos.comEfeitoAutomatico.has(instancia.id) && <p className="rc-esc-efeito">Modificador passivo aplicado nas rolagens.</p>}
    </div>
    {/* Só leitura: registrar e remover instalação são ações — o rodapé sai. */}
    {!api.somenteLeitura && <div className="rc-inv-det-rodape rc-esc-rodape">{instancia ? <button type="button" className="rc-inv-btn rc-inv-btn--perigo" onClick={onRemover}>Remover registro de instalação</button> : modelo && <button type="button" className="rc-inv-btn" onClick={onInstalar}>Registrar instalação</button>}</div>}
  </div>;
}
