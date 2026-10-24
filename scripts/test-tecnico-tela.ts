import assert from 'node:assert/strict';
import { createInitialCharacter } from '../src/lib/character/createCharacter';
import { applyClassCommand, readClassPlay } from '../src/lib/character/classManagement';
import { funcaoDaRodada, unidade, type TecnicoAcao } from '../src/lib/character/tecnicoTela';
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

console.log('tecnico-tela: ok');
