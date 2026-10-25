import assert from 'node:assert/strict';
import { createInitialCharacter } from '../src/lib/character/createCharacter';
import { applyClassCommand, readClassPlay } from '../src/lib/character/classManagement';
import { estadoEscalpo, funcaoDaRodada, paDaMaquina, unidade, type TecnicoAcao } from '../src/lib/character/tecnicoTela';
import type { Character } from '../src/lib/character/types';

const make = (rank = 'D'): Character => ({ ...createInitialCharacter(null, 'Teste'), progressao: { classe_id: 'tecnico', ranking: rank }, current_round: 1, current_scene: 1 } as Character);
const tec = (c: Character, acao: TecnicoAcao, passo = 'passo') => { const r = applyClassCommand(c, { type: 'tecnico', acao, passo }, 4); assert.equal(r.error, undefined, r.error); return r.character; };
const desfazer = (c: Character) => applyClassCommand(c, { type: 'desfazerCombate' }, 4).character;

// Instalar, PD, Função da rodada e Protocolo, sem gastar PA (o custo fica no botão).
let c = make();
c = tec(c, { op: 'instalar', unidade: 0, forma: 'acoplada', alvo: 'Coruja' }, 'Instalada acoplada');
let s = readClassPlay(c);
assert.equal(unidade(s, 0)?.attachment, 'Coruja');
assert.equal(unidade(s, 0)?.value, 10);
assert.equal(c.estado_jogo?.pa_gastos ?? 0, 0, 'a tela não desconta PA');
assert.ok(applyClassCommand(c, { type: 'tecnico', acao: { op: 'instalar', unidade: 0, forma: 'posicionada' }, passo: 'x' }, 4).error, 'não instala duas vezes');
assert.ok(applyClassCommand(c, { type: 'tecnico', acao: { op: 'instalar', unidade: 1, forma: 'posicionada' }, passo: 'x' }, 4).error, 'no D só existe a Unidade 01');

c = tec(c, { op: 'funcao', unidade: 0, funcao: 'manutencao' }, 'Manutenção');
assert.equal(funcaoDaRodada(readClassPlay(c), 0), 'manutencao');
assert.equal(funcaoDaRodada(readClassPlay({ ...c, current_round: 2 }), 0), null, 'a Função vale só na rodada');

c = tec(c, { op: 'protocolo', unidade: 0, protocolo: { gatilho: ' a Coruja perder PD ', resposta: 'manutencao' } }, 'Protocolo programado');
assert.deepEqual(readClassPlay(c).tecnico?.prot?.[0], { gatilho: 'a Coruja perder PD', resposta: 'manutencao' });

// PD: Inativa a 0; recolher guarda os PD e limpa a Função; instalar de novo volta com eles.
c = tec(c, { op: 'pd', unidade: 0, valor: 4 }, 'PD 10 → 4');
c = tec(c, { op: 'recolher', unidade: 0 }, 'Unidade recolhida');
s = readClassPlay(c);
assert.equal(unidade(s, 0), undefined);
assert.equal(funcaoDaRodada(s, 0), null);
c = tec(c, { op: 'instalar', unidade: 0, forma: 'posicionada' }, 'Instalada posicionada');
assert.equal(unidade(readClassPlay(c), 0)?.value, 4, 'volta com os PD que tinha');
assert.ok(applyClassCommand(c, { type: 'tecnico', acao: { op: 'alvo', unidade: 0, alvo: 'Mula' }, passo: 'x' }, 4).error, 'posicionada não tem sistema acoplado');

// DESFAZER volta passo a passo, com o nome do passo.
assert.equal(readClassPlay(c).pilha?.at(-1)?.nome, 'Instalada posicionada');
c = desfazer(c);
assert.equal(unidade(readClassPlay(c), 0), undefined);
c = desfazer(c);
assert.equal(unidade(readClassPlay(c), 0)?.value, 4);
assert.equal(funcaoDaRodada(readClassPlay(c), 0), 'manutencao', 'desfazer o recolher devolve a Função');

// Ranking B: duas Unidades, Registro some se a Unidade ficar Inativa.
let b = make('B');
b = tec(b, { op: 'instalar', unidade: 1, forma: 'posicionada' });
b = tec(b, { op: 'registro', unidade: 1 }, 'Registro criado');
assert.equal(readClassPlay(b).tecnico?.reg?.[1], true);
b = tec(b, { op: 'pd', unidade: 1, valor: 0 });
assert.equal(readClassPlay(b).tecnico?.reg?.[1], undefined);
assert.ok(applyClassCommand(b, { type: 'tecnico', acao: { op: 'funcao', unidade: 1, funcao: 'interface' }, passo: 'x' }, 4).error, 'Inativa não executa Função');

// Operação Sincronizada é marcação por rodada e também volta pelo DESFAZER; a pilha zera na cena nova.
let sx = make('S');
sx = applyClassCommand(sx, { type: 'marcarUso', chave: 'round:sync', passo: 'Operação Sincronizada' }, 4).character;
assert.equal(readClassPlay(sx).uses['round:sync'], 1);
assert.equal(readClassPlay({ ...sx, current_round: 2 }).uses['round:sync'], undefined);
assert.equal(readClassPlay(desfazer(sx)).uses['round:sync'], undefined);
assert.equal(readClassPlay({ ...sx, current_scene: 2 }).pilha?.length ?? 0, 0);

// Roboticista: PA da máquina por rodada, ações feitas, Sistema recebido e alternância (marca o uso da rodada).
let r = make('A');
r = tec(r, { op: 'maquina', id: 'coruja', acao: 'Deslocar-se', custo: 1 }, 'Coruja: Deslocar-se');
r = tec(r, { op: 'maquina', id: 'coruja', acao: 'Investigar', custo: 1 }, 'Coruja: Investigar');
assert.deepEqual(paDaMaquina(readClassPlay(r), 'coruja'), { n: 2, feitas: ['Deslocar-se', 'Investigar'] });
assert.equal(paDaMaquina(readClassPlay({ ...r, current_round: 2 }), 'coruja').n, 0, 'PA da máquina vale só na rodada');
r = tec(r, { op: 'maquina', id: 'coruja', pa: 1 }, 'Coruja: PA 2 → 1');
assert.deepEqual(paDaMaquina(readClassPlay(r), 'coruja').feitas, ['Deslocar-se'], 'baixar o PA tira a última ação');
r = tec(r, { op: 'maquina', id: 'chacal', extra: { sistema: 'Guincho motorizado', de: 'Mula' }, troca: ['Submetralhadora integrada', 'Câmera térmica'] }, 'Chacal preparado');
r = tec(r, { op: 'maquina', id: 'chacal', troca: ['Câmera térmica', 'Submetralhadora integrada'], alternar: true }, 'Chacal: Câmera térmica ativa');
assert.equal(readClassPlay(r).uses['round:alternar'], 1);
assert.equal(readClassPlay(desfazer(r)).uses['round:alternar'], undefined, 'desfazer a alternância libera o uso');
r = tec(r, { op: 'intrusao', efeito: 'interromper' }, 'Intrusão Mecânica: Interromper');
assert.equal(readClassPlay(r).uses['round:intrusao'], 2);
r = tec(r, { op: 'maquina', id: 'chacal', pd: 0 }, 'Chacal: PD 12 → 0');
assert.equal(readClassPlay(r).tecnico?.maqs?.chacal?.pd, 0);

// Tecelão: Olho de Botão na primeira conexão da cena; Comando cai se a Unidade ficar Inativa ou for recolhida.
let tc = make('C');
tc = tec(tc, { op: 'conectar', conectado: true }, 'Conectado');
assert.equal(readClassPlay(tc).uses['scene:olho'], 1);
tc = tec(tc, { op: 'trama', unidade: 0, doca: 'no' }, 'Instalada na Trama');
assert.equal(unidade(readClassPlay(tc), 0)?.value, 10, 'instalar na Trama instala a Unidade');
tc = tec(tc, { op: 'comando', unidade: 0, comando: 'sistema' }, 'Sustentando Controlar Sistema');
tc = tec(tc, { op: 'conectar', conectado: false }, 'Desconectado');
assert.equal(readClassPlay(tc).tecnico?.trama?.[0]?.comando, 'sistema', 'o Comando sustentado continua desconectado');
tc = tec(tc, { op: 'pd', unidade: 0, valor: 0 }, 'PD 10 → 0');
assert.equal(readClassPlay(tc).tecnico?.trama?.[0]?.comando, null);
tc = tec(tc, { op: 'recolher', unidade: 0 }, 'Unidade recolhida');
assert.equal(readClassPlay(tc).tecnico?.trama?.[0], undefined);

// Biomecânico: Forçar Limites e Zona Vermelha valem na cena; Manutenção marca a Função da Unidade no mesmo passo.
let bm = make('A');
bm = tec(bm, { op: 'instalar', unidade: 0, forma: 'acoplada', alvo: 'Ouvidos de Caçador' });
bm = tec(bm, { op: 'escalpo', id: 'esc-1', forcar: 'protecao', zona: true }, 'ARS: Proteção · Zona Vermelha');
assert.equal(readClassPlay(bm).uses['scene:zona'], 1);
bm = tec(bm, { op: 'escalpo', id: 'esc-1', mit: 4, funcao: { unidade: 0, funcao: 'manutencao' } }, 'ARS: +4 MIT');
assert.deepEqual({ ...estadoEscalpo(readClassPlay(bm), 'esc-1') }, { cena: 1, forcado: 'protecao', zona: true, mit: 4 });
assert.equal(funcaoDaRodada(readClassPlay(bm), 0), 'manutencao');
bm = tec(bm, { op: 'escalpo', id: 'esc-1', forcar: null }, 'ARS: Proteção desmarcado');
assert.equal(readClassPlay(bm).uses['scene:zona'], undefined, 'desmarcar devolve a Zona Vermelha');
assert.equal(estadoEscalpo(readClassPlay({ ...bm, current_scene: 2 }), 'esc-1').mit, undefined, 'tudo do escalpo zera na cena nova');
assert.ok(applyClassCommand(bm, { type: 'tecnico', acao: { op: 'escalpo', id: 'esc-1', mit: 7 }, passo: 'x' }, 4).error, '1d6 vai de 1 a 6');

// Artífice: Modificações e Projetos como listas; o DESFAZER volta a lista anterior.
let ar = make('C');
ar = tec(ar, { op: 'mods', lista: [{ equip: 'Rifle de precisão', mod: 'potencializacao' }, null, null] }, 'Potencialização instalada');
const proj = { slug: 'colete', nome: 'Colete Composto', raridade: 'incomum', preco: 800, cd: 7, alvo: 300, inicial: true, coberto: false, iniciado: true, prog: 0 };
ar = tec(ar, { op: 'projetos', lista: [proj] }, 'Projeto: Colete Composto');
ar = tec(ar, { op: 'projetos', lista: [{ ...proj, prog: 156 }] }, 'Colete Composto: +156');
assert.equal(readClassPlay(ar).tecnico?.projetos?.[0]?.prog, 156);
assert.equal(readClassPlay(desfazer(ar)).tecnico?.projetos?.[0]?.prog, 0);
assert.ok(applyClassCommand(ar, { type: 'tecnico', acao: { op: 'projetos', lista: [{ ...proj, prog: 301 }] }, passo: 'x' }, 4).error, 'Progresso não passa do alvo');

// PA: o custo sai do personagem, o desconto devolve e o DESFAZER volta ao PA de antes do passo.
{
  const pa = (c: Character) => c.estado_jogo?.pa_gastos ?? 0;
  const run = (c: Character, cmd: Parameters<typeof applyClassCommand>[1]) => { const r = applyClassCommand(c, cmd, 4); assert.equal(r.error, undefined, r.error); return r.character; };
  let p = make('B');
  p = run(p, { type: 'tecnico', acao: { op: 'instalar', unidade: 0, forma: 'posicionada' }, passo: 'Instalada', pa: 1 });
  assert.equal(pa(p), 1);
  p = run(p, { type: 'tecnico', acao: { op: 'registro', unidade: 0 }, passo: 'Registro criado', pa: 1 });
  p = run(p, { type: 'tecnico', acao: { op: 'registro', unidade: 0 }, passo: 'Registro restaurado', pa: 2 });
  assert.equal(pa(p), 4, 'não passa do PA da rodada');
  p = desfazer(p); assert.equal(pa(p), 2, 'desfazer devolve o PA exato do passo');
  p = desfazer(p); p = desfazer(p); assert.equal(pa(p), 0);
  let inf = { ...make('C'), progressao: { classe_id: 'infiltrador', subclasse_id: 'sorrateiro', ranking: 'C' }, estado_jogo: { pa_gastos: 2 } } as Character;
  inf = run(inf, { type: 'marcarUso', chave: 'round:maos', passo: 'Mãos Leves', pa: -1 });
  assert.equal(pa(inf), 1, 'Mãos Leves devolve 1 PA');
  inf = run(inf, { type: 'brecha', op: 'receber', fonte: 'procurar', pa: 1 });
  assert.equal(pa(inf), 2);
  inf = desfazer(desfazer(inf)); assert.equal(pa(inf), 2);
  let cb = { ...make('C'), progressao: { classe_id: 'combatente', subclasse_id: 'acrobata', ranking: 'C' }, estado_jogo: { pa_gastos: 3 } } as Character;
  cb = run(cb, { type: 'impulsoGratis', valor: 3, pa: -1 });
  assert.equal(pa(cb), 2, 'Impulso Contínuo tira 1 PA da ação');
  assert.equal(pa(desfazer(cb)), 3);
}

console.log('tecnico-tela: ok');
