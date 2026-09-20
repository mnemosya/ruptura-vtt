// Renderiza o componente real com ações simuladas, sem alterar campanhas.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({
  stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { SessionTimeoutDialog } from './src/app/mesas/[campaignId]/_shell/SessionTimeoutDialog';
    const root = createRoot(document.getElementById('root'));
    window.calls = []; window.reloads = 0;
    window.renderDialog = (seconds = 600) => root.render(<SessionTimeoutDialog key={seconds}
      campaignId="campaign-test" session={{ id: 'session-test', confirmation_deadline: new Date(Date.now() + seconds * 1000).toISOString() }}
      clockOffset={0} syncError={null} reload={async () => { window.reloads++; }} />);
    window.renderDialog();
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, outdir: '/tmp/ruptura-session-ui-bundle', jsx: 'automatic',
  plugins: [{ name: 'mock-session-actions', setup(b) {
    b.onResolve({ filter: /onlineSessionActions$/ }, () => ({ path: 'actions', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
      const call = async (type, args) => {
        window.calls.push({type, args});
        return window.fail ? {ok: false, error: 'Falha simulada de conexão'} : {ok: true};
      };
      export const continueOnlineSession = (...args) => call('continue', args);
      export const changeOnlineSession = (...args) => call('end', args);
    ` }));
  } }],
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  await page.setContent('<!doctype html><html><body><button id="previous">Mesa</button><div id="root"></div></body></html>');
  await page.focus('#previous');
  await page.addStyleTag({ content: bundle.outputFiles.find(f => f.path.endsWith('.css')).text });
  await page.addScriptTag({ content: bundle.outputFiles.find(f => f.path.endsWith('.js')).text });
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Continuar');
  await page.keyboard.press('Escape');
  assert.ok(await dialog.isVisible(), 'Escape não deve confirmar nem dispensar o prazo');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Encerrar');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.waitForFunction(() => window.reloads === 1);
  assert.equal((await page.evaluate(() => window.calls))[0].type, 'continue');
  await page.evaluate(() => { window.fail = true; });
  await page.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.ok(await dialog.isVisible(), 'Erro mantém aviso aberto');
  assert.deepEqual((await page.evaluate(() => window.calls))[1], { type: 'end', args: ['campaign-test', false, 'session-test'] });
  await page.setViewportSize({ width: 320, height: 640 });
  assert.ok(await dialog.evaluate(el => el.getBoundingClientRect().right <= window.innerWidth));
  for (const button of await dialog.getByRole('button').all()) {
    assert.ok(await button.evaluate(el => el.scrollWidth <= el.clientWidth), 'Botão não corta texto');
  }
  await page.evaluate(() => { window.fail = false; window.renderDialog(0); });
  await page.getByText('Prazo esgotado. Sincronizando encerramento…').waitFor();
  assert.ok(await page.getByRole('button', { name: 'Continuar', exact: true }).isDisabled());
  console.log('OK: modal real, foco, teclado, confirmação, erro, expiração e largura de 320px (ações simuladas).');
} finally {
  await browser.close();
}
