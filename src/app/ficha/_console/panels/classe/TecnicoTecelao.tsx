"use client";

import { useState } from "react";
import type { ClassPlayState } from "../../../../../lib/character/classManagement";
import { unidade, type ComandoTrama, type DocaTrama, type TecnicoAcao } from "../../../../../lib/character/tecnicoTela";
import { Painel } from "./painelClasse";
import type { ModSub } from "./tecnicoSub";

const Svg = ({ d, tam = 24, traco = 1.8 }: { d: string; tam?: number; traco?: number }) =>
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

const ICONES = {
  conexao: "M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0M12 12v8",
  paralelo: "M7 4v16M17 4v16M4 8h6M14 16h6",
  bypass: "M4 17l6-6-6-6M12 19h8",
  espelho: "M12 3v18M8 7l-4 5 4 5M16 7l4 5-4 5",
  comando: "M4 6h16M4 12h10M4 18h6M17 15l3 3-3 3",
};
const DOCAS: { id: DocaTrama; nome: string; curta: string; rotulo: string; d: string }[] = [
  { id: "avatar", nome: "Junto ao avatar", curta: "NO ESPAÇO DO AVATAR", rotulo: "JUNTO AO AVATAR", d: "M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8M5 20a7 7 0 0 1 14 0" },
  { id: "acesso", nome: "Ponto de Acesso", curta: "ACOPLADA · ADJACENTE", rotulo: "ACOPLADA A UM PONTO DE ACESSO", d: "M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0ZM12 18v4" },
  { id: "no", nome: "Nó", curta: "ACOPLADA · ADJACENTE", rotulo: "ACOPLADA A UM NÓ", d: "M12 3 20 7.5v9L12 21 4 16.5v-9ZM12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4" },
  { id: "bloqueio", nome: "Bloqueio", curta: "ACOPLADA · ADJACENTE", rotulo: "ACOPLADA A UM BLOQUEIO", d: "M3 6h18v12H3ZM3 12h18M9 6v6M15 12v6" },
];
const COMANDOS: { id: ComandoTrama; nome: string; custo: string; curta: string; docas: DocaTrama[]; d: string }[] = [
  { id: "sistema", nome: "Controlar Sistema", custo: "2 PA · 2 RAM", curta: "PORTÕES, CÂMERAS, MÁQUINAS", docas: ["no"], d: "M4 5h16v11H4ZM8 20h8M12 16v4" },
  { id: "unidade", nome: "Controlar Unidade", custo: "2 PA · 2 RAM", curta: "ORDENS SEM RAM · 1 PA CADA", docas: ["no"], d: "M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4M3 5h6M15 5h6M6 5v3l4 3M18 5v3l-4 3M10 14l-3 5M14 14l3 5" },
  { id: "travar", nome: "Travar Acesso", custo: "2 PA · 1 RAM", curta: "BARREIRA EM NÓ OU BLOQUEIO", docas: ["no", "bloqueio"], d: "M5 11h14v10H5ZM8 11V7a4 4 0 0 1 8 0v4" },
];
const DICAS = {
  conexao: "Toque ao se conectar ou desconectar da Trama. Na primeira conexão da cena, o Olho de Botão revela os elementos dos próximos 2 níveis a partir do Ponto de Acesso, como em Sondar, sem PA nem RAM.",
  paralelo: "Conectado e com uma Unidade ativa na Trama: +1 PA no início do seu primeiro turno da rodada, só para um Protocolo ou Comando, que pode sair por uma Unidade. Toque para marcar; toque de novo para desmarcar.",
  bypass: "Uma vez por cena, ao executar um Comando por meio de uma Unidade, dispense o teste: sucesso limitado com margem 0. Custos normais; não vale para Apagar Rastros nem Modificar Assinatura. Toque para marcar; toque de novo para desmarcar.",
  espelho: "Uma vez por rodada, ao executar um Protocolo de Trama ou Comando por uma Unidade, repita a ação por outra Unidade ativa em alvo diferente e compatível. Sem PA; a RAM é paga normalmente. Toque para marcar; toque de novo para desmarcar.",
  comando: "Controle Distribuído: Controlar Sistema, Controlar Unidade ou Travar Acesso executado pela Unidade acoplada ao alvo fica sustentado indefinidamente, mesmo que você se desconecte. Cada Unidade sustenta um Comando; termina se ela ficar Inativa, for recolhida ou perder a conexão com o alvo. Toque para escolher.",
  migrar: "Migração de Processo: uma vez por rodada, por 1 PA, transfira seu avatar para a posição desta Unidade na Trama, sem Avançar e ignorando espaços, níveis e Bloqueios no caminho. Toque de novo para desmarcar.",
};

/** Tecelão (TC1): Unidades na Trama dentro do módulo; o que só vale na Trama aparece só conectado. */
export function useTecelao({ st, rank, j, rotuloU, passoU, acao, marcar, locked }: {
  st: ClassPlayState; rank: (r: string) => boolean; j: number; rotuloU: string; passoU: string;
  acao: (a: TecnicoAcao, passo: string, pa?: number) => void; marcar: (chave: string, passo: string, pa?: number) => void; locked: boolean;
}): ModSub {
  const [painel, setPainel] = useState<null | "trama" | "comando">(null);
  const [docaRasc, setDocaRasc] = useState<DocaTrama | null>(null);
  const [cmdRasc, setCmdRasc] = useState<ComandoTrama | null>(null);

  const t = st.tecnico ?? {}, conectado = !!t.conectado;
  const u = unidade(st, j), naTrama = !!u && !!t.trama?.[j], pos = t.trama?.[j];
  const doca = DOCAS.find(x => x.id === pos?.doca), cmd = COMANDOS.find(x => x.id === pos?.comando);
  const comUnidade = Object.entries(t.trama ?? {}).some(([k]) => { const x = unidade(st, Number(k)); return !!x && (x.value ?? 0) > 0; });
  const uso = (k: string) => !!st.uses[k];
  const paraleloOk = conectado && comUnidade;

  const chips = [{ chave: "conexao", icone: ICONES.conexao, rotulo: "CONEXÃO", valor: conectado ? "NA TRAMA" : "FORA DA TRAMA", usado: !conectado, dica: DICAS.conexao,
    clicar: () => acao({ op: "conectar", conectado: !conectado }, conectado ? "Desconectado da Trama" : uso("scene:olho") ? "Conectado à Trama" : "Conectado · Olho de Botão: 2 níveis") }];
  if (conectado) {
    chips.push({ chave: "paralelo", icone: ICONES.paralelo, rotulo: "PROCESSAMENTO PARALELO", valor: !comUnidade ? "SEM UNIDADE NA TRAMA" : uso("round:paralelo") ? "USADO NA RODADA" : "+1 PA", usado: !paraleloOk || uso("round:paralelo"), dica: DICAS.paralelo,
      clicar: () => marcar("round:paralelo", uso("round:paralelo") ? "PA de Processamento Paralelo desmarcado" : "PA de Processamento Paralelo", uso("round:paralelo") ? 1 : -1) });
    if (rank("C")) chips.push({ chave: "bypass", icone: ICONES.bypass, rotulo: "BYPASS", valor: uso("scene:bypass") ? "USADO NA CENA" : "1× POR CENA", usado: uso("scene:bypass"), dica: DICAS.bypass,
      clicar: () => marcar("scene:bypass", uso("scene:bypass") ? "Bypass desmarcado" : "Bypass") });
  }

  const chipsUnidade = [];
  if (naTrama && rank("C") && (conectado || cmd)) chipsUnidade.push({ chave: "comando", icone: ICONES.comando, rotulo: "COMANDO", valor: cmd ? cmd.nome.toUpperCase() : "SUSTENTAR", usado: !cmd, dica: DICAS.comando,
    clicar: () => { setCmdRasc(pos?.comando ?? null); setPainel("comando"); } });
  if (naTrama && rank("A") && conectado) chipsUnidade.push({ chave: "espelho", icone: ICONES.espelho, rotulo: "ESPELHADOS", valor: uso("round:espelhar") ? "USADO NA RODADA" : "1× POR RODADA", usado: uso("round:espelhar"), dica: DICAS.espelho,
    clicar: () => marcar("round:espelhar", uso("round:espelhar") ? "Processos Espelhados desmarcado" : "Processos Espelhados") });

  const abrirTrama = () => { setDocaRasc(pos?.doca ?? null); setPainel("trama"); };
  const acoesInstalada = naTrama && rank("A") && conectado
    ? <button type="button" className="te-link ca-tem-dica" data-tom={uso("round:migrar") ? undefined : "claro"} disabled={locked} onClick={() => marcar("round:migrar", uso("round:migrar") ? "Migração desmarcada" : `Avatar migrado · ${rotuloU}`, uso("round:migrar") ? -1 : 1)}>{uso("round:migrar") ? "AVATAR MIGRADO NA RODADA" : "MIGRAR AVATAR · 1 PA"}<span className="ca-dica" data-pos="cima" role="tooltip">{DICAS.migrar}</span></button> : null;
  const acoesGuardada = conectado ? <button type="button" className="te-uso" disabled={locked} onClick={() => { setDocaRasc(null); setPainel("trama"); }}>INSTALAR NA TRAMA · 1 PA</button> : null;

  const painelView = painel === "trama" ? <Painel baixo titulo={`NA TRAMA · ${rotuloU}`} fechar={() => setPainel(null)}>
    <div className="te-folha">
      <p className="te-intro">{naTrama ? "Corrija onde a Unidade está. Trocar de elemento na Trama é recolher e instalar de novo (1 PA cada)." : "Com você conectado, a Unidade fica junto ao seu avatar ou acoplada a um Ponto de Acesso, Nó ou Bloqueio adjacente. Recolher na Trama vale a qualquer distância."}</p>
      <span className="te-rotulo">POSIÇÃO NA TRAMA</span>
      <div className="tc-opcoes" data-col="2">{DOCAS.map(x => <button key={x.id} type="button" className="te-resposta" aria-pressed={docaRasc === x.id} onClick={() => setDocaRasc(x.id)}>
        <span><svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" strokeWidth="2.4" /></svg><Svg d={x.d} tam={17} traco={2} /></span>
        <span><strong>{x.nome}</strong><small>{x.curta}</small></span>
      </button>)}</div>
      <button type="button" className="te-primario" disabled={locked || !docaRasc} onClick={() => { if (!docaRasc) return; const d = DOCAS.find(x => x.id === docaRasc)!; acao({ op: "trama", unidade: j, doca: docaRasc }, naTrama ? `${passoU}Na Trama: ${d.nome}` : `${passoU}Instalada na Trama`, naTrama ? 0 : 1); setPainel(null); }}>{naTrama ? "SALVAR" : "INSTALAR · 1 PA"}</button>
    </div>
  </Painel> : painel === "comando" ? <Painel baixo titulo={`COMANDO SUSTENTADO · ${rotuloU}`} fechar={() => setPainel(null)}>
    <div className="te-folha">
      <p className="te-intro">Executado pela Unidade acoplada ao alvo, o Comando fica sustentado, mesmo que você se desconecte.</p>
      <span className="te-rotulo">COMANDO</span>
      <div className="tc-opcoes" data-col="3">{COMANDOS.map(x => { const ok = !!doca && x.docas.includes(doca.id);
        return <button key={x.id} type="button" className="te-resposta" aria-pressed={cmdRasc === x.id} disabled={!ok} onClick={() => setCmdRasc(x.id)}>
          <span><svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" strokeWidth="2.4" /></svg><Svg d={x.d} tam={17} traco={2} /></span>
          <span><strong>{x.nome}</strong><em>{x.custo}</em><small>{x.curta}</small></span>
        </button>; })}</div>
      <div className="te-folha-fim">
        {cmd && <button type="button" className="te-link" disabled={locked} onClick={() => { acao({ op: "comando", unidade: j, comando: null }, `${passoU}${cmd.nome} encerrado`); setPainel(null); }}>ENCERRAR COMANDO</button>}
        <button type="button" className="te-primario" disabled={locked || !cmdRasc || cmdRasc === pos?.comando} onClick={() => { if (!cmdRasc) return; acao({ op: "comando", unidade: j, comando: cmdRasc }, `${passoU}Sustentando ${COMANDOS.find(x => x.id === cmdRasc)!.nome}`, 2); setPainel(null); }}>SUSTENTAR</button>
      </div>
    </div>
  </Painel> : null;

  return {
    chips, chipsUnidade, acoesInstalada, acoesGuardada, painel: painelView,
    forma: naTrama && doca ? { texto: `NA TRAMA · ${doca.rotulo}`, clicar: abrirTrama } : null,
    anel: naTrama,
  };
}
