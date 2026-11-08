import assert from 'node:assert/strict';
import { createInitialCharacter } from '../src/lib/character/createCharacter';
import { applyClassCommand, readClassPlay } from '../src/lib/character/classManagement';
import { ativoNaRodada, limiteAtivo, type VanguardaAcao } from '../src/lib/character/vanguardaTela';
import type { Character } from '../src/lib/character/types';

const make = (rank = 'D', sub?: string): Character => {
  const c = createInitialCharacter(null, 'Teste');
  return { ...c, atributos: { ...c.atributos, corpo: 2 }, progressao: { classe_id: 'vanguarda', ranking: rank, subclasse_id: sub }, current_round: 1, current_scene: 1 } as Character;
};
const va = (c: Character, acao: VanguardaAcao, passo = 'passo', pa?: number) => { const r = applyClassCommand(c, { type: 'vanguarda', acao, passo, pa }, 4); assert.equal(r.error, undefined, r.error); return r.character; };
const erro = (c: Character, acao: VanguardaAcao) => applyClassCommand(c, { type: 'vanguarda', acao, passo: 'x' }, 4).error;
const desfazer = (c: Character) => applyClassCommand(c, { type: 'desfazerCombate' }, 4).character;
const n = (c: Character) => readClassPlay(c).resource;

// Ponta de Lança: limite 3 no D, receber marca a rodada sem travar; gastar Avançar/Pressionar.
let c = make('D');
c = va(c, { op: 'receber', fonte: 'adjacente' }, 'Ímpeto recebido');
c = va(c, { op: 'receber', fonte: 'adjacente' }, 'Ímpeto recebido');
assert.equal(n(c), 2);
assert.equal(readClassPlay(c).uses['round:adjacente'], 1, '1× por rodada só fica marcado');
c = va(c, { op: 'receber', fonte: 'adjacente' });
assert.ok(erro(c, { op: 'receber', fonte: 'adjacente' }), 'não passa do limite');
c = va(c, { op: 'gastar', uso: 'pressionar', n: 1 }, 'Pressionar');
c = va(c, { op: 'gastar', uso: 'avancar', n: 2 }, 'Avançar');
assert.equal(n(c), 0);
assert.match(readClassPlay(c).vanguarda!.registro.at(-1)!.det, /4 m sem gastar PA/);
assert.ok(erro(c, { op: 'gastar', uso: 'avancar', n: 1 }), 'sem Ímpeto não gasta');
c = desfazer(c);
assert.equal(n(c), 2, 'DESFAZER devolve o gasto');
assert.equal(readClassPlay(c).pilha?.at(-1)?.nome, 'Pressionar');

// Ranking F: limite 2, só deslocamento; Pressionar é do D.
let f = make('F');
f = va(f, { op: 'receber', fonte: 'adjacente' });
f = va(f, { op: 'receber', fonte: 'adjacente' });
assert.ok(erro(f, { op: 'receber', fonte: 'adjacente' }), 'limite 2 no F');
assert.ok(erro(f, { op: 'gastar', uso: 'pressionar', n: 1 }));
f = va(f, { op: 'gastar', uso: 'avancar', n: 2 });
assert.equal(readClassPlay(f).vanguarda!.registro.at(-1)!.nome, 'Deslocamento');

// Perder todos e a cena nova zeram Ímpeto, registro e pilha.
c = va(c, { op: 'perder' }, 'Ímpeto perdido');
assert.equal(n(c), 0);
c = va(c, { op: 'receber', fonte: 'adjacente' });
const nova = readClassPlay({ ...c, current_scene: 2 });
assert.equal(nova.resource, 0);
assert.equal(nova.vanguarda, undefined);
assert.deepEqual(nova.pilha, []);

// Ranking S: limite 4 e Avanço Irrefreável.
let s = make('S');
s = va(s, { op: 'receber', fonte: 'adjacente' });
assert.ok(erro(make('B'), { op: 'irrefreavel' }));
s = va(s, { op: 'irrefreavel' }, 'Avanço Irrefreável');
assert.equal(n(s), 2);
assert.equal(readClassPlay(s).uses['round:irrefreavel'], 1);

// Berserker: Dor é Combustível mesmo cheio, Fúria por 2 Ímpetos, Negar a Dor só em Fúria, Limite Rompido.
let bk = make('A', 'berserker');
bk = va(bk, { op: 'receber', fonte: 'dor' }, 'Dor é Combustível');
bk = va(bk, { op: 'receber', fonte: 'adjacente' });
assert.equal(n(bk), 2);
assert.ok(erro(bk, { op: 'negar' }), 'Negar a Dor só em Fúria');
assert.ok(erro(bk, { op: 'limite' }), 'Limite Rompido só em Fúria');
bk = va(bk, { op: 'furia', via: 'impeto' }, 'Fúria');
assert.equal(n(bk), 0);
assert.equal(readClassPlay(bk).vanguarda?.furia, true);
bk = va(bk, { op: 'limite' }, 'Limite Rompido');
assert.equal(n(bk), 3);
assert.ok(limiteAtivo(readClassPlay(bk).vanguarda!, 2) && !limiteAtivo(readClassPlay(bk).vanguarda!, 3), 'até o fim do próximo turno');
bk = va(bk, { op: 'negar' });
assert.equal(n(bk), 1);
assert.ok(erro(make('E', 'berserker'), { op: 'contra' }), 'Contra-Ataque é do C');
assert.equal(readClassPlay({ ...bk, current_scene: 2 }).vanguarda, undefined, 'a Fúria acaba com a cena');

// Colosso: Absorver Impacto pelo Corpo; Centro da Batalha zera o custo só na rodada.
let cl = make('A', 'colosso');
cl = va(cl, { op: 'receber', fonte: 'adjacente' });
cl = va(cl, { op: 'absorver' }, 'Absorver Impacto');
assert.equal(n(cl), 0);
assert.match(readClassPlay(cl).vanguarda!.registro.at(-1)!.det, /em 2 \(Corpo\)/);
cl = va(cl, { op: 'centro', valor: true }, 'Centro da Batalha');
cl = va(cl, { op: 'absorver' });
assert.equal(n(cl), 0, 'no Centro da Batalha não gasta');
assert.ok(ativoNaRodada(readClassPlay(cl).vanguarda!.centro, 1));
assert.ok(erro({ ...cl, current_round: 2 }, { op: 'absorver' }), 'fora do Centro volta a custar');
cl = va(cl, { op: 'abrirCaminho', manobra: 'Empurrar' });
assert.equal(readClassPlay(cl).uses['round:abrir'], 1);
let clc = make('C', 'colosso');
clc = va(clc, { op: 'receber', fonte: 'adjacente' });
clc = va(clc, { op: 'gastar', uso: 'avancar', n: 1 });
assert.match(readClassPlay(clc).vanguarda!.registro.at(-1)!.det, /ignorando terreno difícil/);

// Guardião: bloqueio dá Ímpeto Protetor uma vez por rodada; Abrigo Móvel; Interceptar e Ninguém Fica Para Trás.
let gd = make('A', 'guardiao');
gd = va(gd, { op: 'bloqueio', escudo: 'Escudo balístico', ok: true }, 'Bloqueou');
gd = va(gd, { op: 'bloqueio', escudo: 'Escudo balístico', ok: true }, 'Bloqueou');
assert.equal(n(gd), 1, 'Ímpeto Protetor só no primeiro bloqueio da rodada');
gd = va(gd, { op: 'abrigo', escudo: 'Escudo balístico' }, 'Abrigo Móvel');
assert.deepEqual(readClassPlay(gd).vanguarda?.abrigo, { escudo: 'Escudo balístico', rodada: 1 });
assert.ok(erro(gd, { op: 'interceptar' }), 'Interceptar custa 1 Ímpeto');
gd = va(gd, { op: 'ninguem', valor: true }, 'Ninguém Fica Para Trás');
gd = va(gd, { op: 'interceptar' }, 'Interceptar');
gd = va(gd, { op: 'interceptar' }, 'Interceptar');
assert.equal(n(gd), 0);
gd = va(gd, { op: 'guarda' }, 'Posição de Guarda');
assert.equal(readClassPlay(gd).uses['scene:guarda'], 1);
assert.ok(erro(make('A', 'colosso'), { op: 'guarda' }), 'só o Guardião');

console.log('vanguarda-tela: ok');
