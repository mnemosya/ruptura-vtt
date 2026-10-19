"use client";

import { useState } from "react";
import { TextoComRegras } from "../../TextoComRegras";
import { Check, ChevronRight, Clock3, Shield, Radio, HeartPulse, Users, Wrench, Crosshair, Expand, MoveUpRight } from "lucide-react";
import type { ClassPlayState } from "../../../../../lib/character/classManagement";

type Props = { kind: string; state: ClassPlayState; readOnly: boolean; save: (key: string, value: string) => void };
type Choice = { title: string; value: string; label: string; description: string; icon?: typeof Shield };
const guides: Record<string, { eyebrow: string; title: string; choices: Choice[] }> = {
  modulations: { eyebrow: "Magia de ataque · 1 Dado de Manobra", title: "Molde sua conjuração", choices: [
    { title: "Concentrar", icon: Crosshair, value: "Mais dano", label: "Uma criatura afetada", description: "Some o resultado do Dado de Manobra ao dano causado a essa criatura. Exemplo: tirou 4 no dado → +4 de dano." },
    { title: "Expandir", icon: Expand, value: "Área maior", label: "Uma dimensão da magia", description: "Aumente uma dimensão da área em metros iguais à metade do Dado de Manobra, arredondada para baixo. Exemplo: tirou 5 → +2 m." },
    { title: "Projetar", icon: MoveUpRight, value: "Mais alcance", label: "Conjure mais longe", description: "Some o resultado do Dado de Manobra ao alcance da magia, em metros. Exemplo: tirou 4 → +4 m de alcance." },
    { title: "Conter", icon: Shield, value: "Proteção", label: "Poupe criaturas na área", description: "Escolha um número de criaturas igual à metade do Dado de Manobra, arredondada para baixo. Elas não são afetadas. Exemplo: tirou 5 → proteja 2 criaturas." },
  ] },
  bio: { eyebrow: "Bancada biomecânica", title: "Qual é o procedimento?", choices: [
    { title: "Instalar / extrair", value: "Instalar ou extrair", label: "1 hora · instrumentos apropriados", description: "Criatura voluntária, inconsciente ou imobilizada. O escalpo extraído permanece intacto." },
    { title: "Recuperar integridade", value: "Recuperar Integridade", label: "Teste de Vontade · CD 7 · +1 vantagem", description: "Após a extração, o paciente testa para recuperar a Integridade perdida com aquele escalpo." },
    { title: "Manutenção", value: "Reparar um escalpo", label: "10 minutos de manutenção", description: "Remova 1 ponto de Desgaste ou elimine um efeito técnico persistente que prejudique o escalpo." },
  ] },
  machines: { eyebrow: "Controle de máquinas", title: "Dois modos de operação", choices: [
    { title: "Controle direto", value: "Seus PA", label: "Seus atributos", description: "Você executa as ações. A máquina deixa de agir autonomamente e perde os PA que ainda possuía na rodada." },
    { title: "Operação autônoma", value: "1 PA", label: "Custo para comandar", description: "Com comando, recebe os PA da própria ficha. Sem comando, recebe 1 PA para deslocamento, proteção ou defesa. Age depois de você." },
  ] },
  weave: { eyebrow: "Presença digital", title: "Sua rede dentro da Trama", choices: [
    { title: "Posicionar", value: "Instalar na Trama", label: "Junto ao avatar ou em um sistema adjacente", description: "Instale junto ao seu avatar ou acople a um Ponto de Acesso, Nó ou Bloqueio adjacente." },
    { title: "Projetar comandos", value: "Agir pela Unidade", label: "Alcance: cada metro equivale a um espaço", description: "Execute Protocolos e Comandos a partir da Unidade, com seus atributos e os custos normais." },
    { title: "Defender / recolher", value: "Proteger a Unidade", label: "Defenda com sua Tecnomagia", description: "Dano afeta os PD da Unidade. Você pode recolhê-la independentemente da distância; inativa, seu avatar desaparece." },
  ] },
  companion: { eyebrow: "Ativação compartilhada", title: "Você age. Seu companheiro vem em seguida.", choices: [
    { title: "Com comando", value: "2 PA", label: "Você gasta 1 PA", description: "Pode pagar com a Reserva Tática. Você escolhe as ações do companheiro; ele precisa perceber suas ordens." },
    { title: "Sem comando", value: "1 PA", label: "Instinto / proteção", description: "Ele pode se aproximar de você, procurar abrigo, afastar-se de ameaça ou executar seu Instinto." },
    { title: "Ataque natural", value: "1 PA", label: "Um ataque por turno", description: "O companheiro não fragmenta seus PA. Seu turno integra a sua ativação, sem nova posição na alternância." },
  ] },
  briefing: { eyebrow: "Preparação da equipe", title: "Uma perícia. Uma segunda chance.", choices: [
    { title: "Antes da cena", value: "5 min", label: "Até seu limite de Focos", description: "Oriente os participantes. Cada aliado escolhe uma perícia relacionada ao papel que terá no plano." },
    { title: "Quando falhar", value: "+1", label: "Rerrole e use o novo resultado", description: "Uma vez na cena, em teste da perícia escolhida diretamente relacionado ao plano. Um novo briefing substitui o anterior." },
  ] },
  workshop: { eyebrow: "Bancada de equipamentos", title: "Preparar, modificar, reparar", choices: [
    { title: "Modificações", value: "10 min", label: "Instalar / remover / substituir", description: "Exige ferramentas apropriadas. Uma Modificação sua por equipamento, sem ocupar espaço de runa." },
    { title: "Fabricação", value: "50%", label: "Preço do item em materiais", description: "Um Projeto permite iniciar a fabricação. Progresso e CD dependem da raridade; possuir o Projeto não concede o item." },
    { title: "Reparo", value: "+1d6", label: "MIT / PD recuperados", description: "Ao usar um item de reparo, aplique o dado adicional uma vez. Dispensa os testes normalmente exigidos para utilizar o item." },
  ] },
};

export function ModulePlaybook({ kind, state, readOnly, save }: Props) {
  const [choice, setChoice] = useState(0);
  const [editingDie, setEditingDie] = useState<number | null>(null);
  const [dieValue, setDieValue] = useState("");
  const guide = guides[kind];
  if (guide) {
    const selected = guide.choices[choice] ?? guide.choices[0];
    const Icon = kind === "bio" ? HeartPulse : kind === "machines" || kind === "weave" ? Radio : kind === "workshop" ? Wrench : Users;
    return <section className="hc-playbook">
      <header><span>{guide.eyebrow}</span><h3>{guide.title}</h3></header>
      <div className="hc-playbook-choices" role="group" aria-label="Consultar opções">{guide.choices.map((item, index) => { const ChoiceIcon = item.icon ?? Icon; return <button key={item.title} type="button" aria-pressed={index === choice} onClick={() => setChoice(index)}><ChoiceIcon size={22} /><span>{item.title}</span><ChevronRight size={14}/></button>; })}</div>
      <div className="hc-playbook-detail" key={choice}><div className="hc-playbook-value"><strong>{selected.value}</strong><span>{selected.label}</span></div><TextoComRegras texto={selected.description} glossario={[]}/></div>
      {kind === "machines" && <p className="hc-playbook-note"><Clock3 size={14}/> Alternar entre os modos custa 1 PA. Resolva o comando e os custos pela ficha da máquina e do personagem.</p>}
    </section>;
  }
  if (kind === "therapy") {
    const successes = Math.max(0, Math.min(3, Number(state.selections.therapySuccesses) || 0));
    return <section className="hc-playbook">
      <header><span>Acompanhamento terapêutico</span><h3>Uma origem por tratamento</h3></header>
      <div className="hc-playbook-fields"><label>Paciente<input disabled={readOnly} value={state.selections.therapyPatient ?? ""} placeholder="Nome do paciente" onChange={e => save("therapyPatient", e.target.value)}/></label><label>Origem tratada<input disabled={readOnly} value={state.selections.therapyOrigin ?? ""} placeholder="Acontecimento que causou a perda" onChange={e => save("therapyOrigin", e.target.value)}/></label></div>
      <div className="hc-therapy-progress"><div><span>Sucessos terapêuticos</span><div className="hc-therapy-pips">{[1,2,3].map(n => <button key={n} type="button" disabled={readOnly} aria-label={`Registrar ${n} sucessos`} aria-pressed={n <= successes} onClick={() => save("therapySuccesses", String(n === successes ? n - 1 : n))}>{n <= successes ? <Check size={22}/> : n}</button>)}</div></div><div><strong>{successes}/3</strong><span>3 sucessos → 1 Integridade</span></div></div>
      <div className="hc-playbook-facts"><span><Clock3 size={16}/> Sessão de 1 hora</span><span><Shield size={16}/> Vontade CD 7 · +2 vantagem</span></div><p className="hc-playbook-note">Intervalo de 6 dias por paciente. Falhas preservam o progresso. Limite total de 1 Integridade recuperada; não se aplica a si mesmo ou a criaturas com 0 Integridade. O registro não altera a ficha do paciente.</p>
    </section>;
  }
  if (kind === "persona") return <section className="hc-playbook hc-persona">
    <header className="hc-persona-banner"><Users size={32}/><div><span>Identidade pública</span><h3>{state.selections.personaImage || "Defina sua Persona"}</h3><p>{state.selections.personaAudience || "Quem conhece e apoia essa imagem?"}</p></div></header>
    <div className="hc-playbook-fields"><label>Sua imagem<input disabled={readOnly} value={state.selections.personaImage ?? ""} placeholder="Ex.: artista rebelde da cidade baixa" onChange={e => save("personaImage", e.target.value)}/></label><label>Seu público<input disabled={readOnly} value={state.selections.personaAudience ?? ""} placeholder="Ex.: músicos do distrito industrial" onChange={e => save("personaAudience", e.target.value)}/></label><label>O que esperam de você<input disabled={readOnly} value={state.selections.personaExpectation ?? ""} placeholder="Ex.: coragem e lealdade" onChange={e => save("personaExpectation", e.target.value)}/></label></div>
    <p className="hc-persona-explainer">Seu público é o grupo que conhece sua Persona e tem simpatia por ela. Pessoas que apenas reconhecem você não fazem parte dele.</p>
  </section>;
  if (kind === "trade") return <section className="hc-playbook">
    <header><span>Rede de contatos</span><h3>Prepare uma oportunidade</h3></header>
    <div className="hc-playbook-choices" role="group" aria-label="Tipo de negociação">{["Comprar","Vender"].map(mode => <button type="button" key={mode} disabled={readOnly} aria-pressed={(state.selections.tradeMode ?? "Comprar") === mode} onClick={() => save("tradeMode", mode)}>{mode}</button>)}</div>
    <div className="hc-playbook-fields"><label>{state.selections.tradeMode === "Vender" ? "O que você quer vender?" : "O que você está procurando?"}<input disabled={readOnly} value={state.selections.tradeOffer ?? ""} placeholder={state.selections.tradeMode === "Vender" ? "Ex.: um lote de componentes arcanos" : "Ex.: um implante raro ou acesso a um arquivo"} onChange={e => save("tradeOffer", e.target.value)}/></label></div>
    <div className="hc-playbook-detail"><div className="hc-playbook-value"><strong>1–3 h</strong><span>1d8 por hora · até Mente, mínimo 1</span></div><p>Depois da preparação, realize um Teste de Interação. A reserva pertence apenas a esta transação e deve ser descartada ao resolver o teste.</p></div>
    <div className="hc-trade-reserve"><div className="hc-reserve-caption"><span>Reserva da negociação</span><small>Descartar após o teste</small></div><div className="hc-face-slots">{[0,1,2].map(index => <button key={index} type="button" disabled={readOnly} data-filled={!!state.selections[`tradeDie${index}`]} aria-label={`Editar dado ${index + 1} da negociação`} onClick={() => { setEditingDie(index); setDieValue(state.selections[`tradeDie${index}`] ?? ""); }}><small>0{index + 1}</small><svg className="hc-confidence-gem" viewBox="0 0 100 110" aria-hidden="true"><path d="M50 4 94 55 50 106 6 55Z"/><path d="M6 55 50 25 94 55 50 85Z"/></svg><strong>{state.selections[`tradeDie${index}`] || "+"}</strong><span>{state.selections[`tradeDie${index}`] ? "Editar d8" : "Inserir valor"}</span></button>)}</div>{editingDie !== null && <div className="hc-die-editor"><label>Resultado do d8<input autoFocus type="number" min="1" max="8" value={dieValue} onChange={e => setDieValue(e.target.value)}/></label><button type="button" disabled={readOnly || !/^[1-8]$/.test(dieValue)} onClick={() => { save(`tradeDie${editingDie}`, dieValue); setEditingDie(null); }}>Salvar</button><button type="button" disabled={readOnly} onClick={() => { save(`tradeDie${editingDie}`, ""); setEditingDie(null); }}>Remover</button><button type="button" onClick={() => setEditingDie(null)}>Cancelar</button></div>}</div>
    <p className="hc-playbook-note">{state.selections.tradeMode === "Vender" ? "Sucesso limitado: 75% · padrão: 100% · crítico: 125% do valor justo. Limite de Ⱥ 2.000 por operação; uma tentativa por dia." : "Sucesso limitado: condição desfavorável · padrão: valor justo · crítico: condição favorável. Uma compra por operação."} O acordo e os pagamentos são resolvidos pela mesa.</p>
  </section>;
  return null;
}
