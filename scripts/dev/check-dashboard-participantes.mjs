// DASH-01 — gramática do tooltip de participantes. Roda a função real do
// dashboard (`_global/participantes.ts`), sem banco: é sobre texto, e texto errado aqui ("1 jogadores")
// é o que denuncia contagem improvisada.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/app/mesas/_global/participantes.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external',
  outdir: '/tmp/ruptura-dash-participantes', jsx: 'automatic',
});
const { textoDeParticipantes: texto } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const casos = [
  [[true, 0], 'Narrador na mesa; nenhum jogador conectado.'],
  [[true, 1], 'Narrador na mesa e 1 jogador conectado.'],
  [[true, 4], 'Narrador na mesa e 4 jogadores conectados.'],
  [[false, 0], 'Ninguém conectado no momento; a sessão segue aberta.'],
  [[false, 1], '1 jogador conectado; narrador ausente.'],
  [[false, 3], '3 jogadores conectados; narrador ausente.'],
];
for (const [args, esperado] of casos) {
  assert.equal(texto(...args), esperado, `narrador=${args[0]}, jogadores=${args[1]}`);
  console.log(`ok - narrador ${args[0] ? 'presente' : 'ausente'} + ${args[1]}: "${esperado}"`);
}

// Desconhecido não pode virar zero — o aceite proíbe loading/erro se
// apresentando como "ninguém online".
for (const args of [[undefined, undefined], [true, undefined], [undefined, 0]]) {
  const t = texto(...args);
  assert.match(t, /não foi possível/i, `Desconhecido virou afirmação: "${t}"`);
  assert.doesNotMatch(t, /nenhum|ninguém/i, `Desconhecido se disfarçou de vazio: "${t}"`);
}
console.log('ok - leitura ausente admite que não sabe, em vez de dizer que não há ninguém');
console.log('\nTodos os critérios passaram.');
