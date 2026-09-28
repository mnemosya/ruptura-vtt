import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Protege o contrato SQL consumido por linhaParaTokenVtt: o fallback
// para zero ocultava a ausência de direcao na leitura após a 0135.
const dir = new URL('../supabase/migrations/', import.meta.url);
const definition = /CREATE OR REPLACE FUNCTION public\.read_vtt_scene_tokens\(p_scene_id uuid\)[\s\S]*?\$function\$;/i;
let latest;
for (const name of readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
  const match = readFileSync(new URL(name, dir), 'utf8').match(definition);
  if (match) latest = match[0];
}
assert.ok(latest, 'Deve existir uma projeção de tokens');
assert.match(latest, /'direcao',\s*v_token\.direcao/, 'A leitura deve devolver a direção persistida');

// A correção deve preservar integralmente a projeção e a autorização
// anterior; não amplia recursos privados nem muda a pegada.
const previous = readFileSync(new URL('0112_vtt_autorizacao_por_cena.sql', dir), 'utf8').match(definition)[0];
assert.equal(latest.replace(/\n\s*'direcao', v_token\.direcao,/, ''), previous);
console.log('OK: direção incluída; projeção e autorização anteriores preservadas.');
