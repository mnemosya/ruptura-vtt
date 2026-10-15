import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const configs=JSON.parse(readFileSync('src/app/ficha/_console/panels/identidade/workspaces.json','utf8'));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1120,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3000/dev/identidade');
 await page.getByLabel('Ranking de exemplo').selectOption('A');
 for(const [slug,m] of Object.entries(configs)){
  await page.getByLabel('Subclasse de exemplo').selectOption(slug);
  const area=page.getByRole('region',{name:`Gestão de ${m.nome}`,exact:true});await area.waitFor();
  assert.equal(await area.locator('textarea').count(),0,'gestão sem formulários de texto');
  await area.getByRole('button',{name:'Consultar regras'}).click();await page.getByRole('dialog').locator('.cp-rule').nth(2).waitFor();
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 }
 await page.getByLabel('Subclasse de exemplo').selectOption('mercador');
 const face=page.getByRole('region',{name:'Gestão de Mercador',exact:true});
 await face.getByRole('button',{name:'Rolar interação',exact:true}).click();
 await face.getByRole('button',{name:'Guardar',exact:true}).first().click();
 assert.equal(await face.locator('.cp-held-dice button:not(:disabled)').count(),1);
 await face.getByRole('button',{name:'Resolver teste',exact:true}).click();
 await page.getByLabel('Subclasse de exemplo').selectOption('terapeuta');
 let area=page.getByRole('region',{name:'Gestão de Terapeuta',exact:true});
 await area.getByLabel('Alvo na cena').first().selectOption('mara');
 await area.locator('.cp-action').filter({hasText:'Aterramento'}).click();

 assert.ok(await area.locator('.cp-action').filter({hasText:'Aterramento'}).isDisabled());
 await page.getByLabel('Subclasse de exemplo').selectOption('dissecador');
 area=page.getByRole('region',{name:'Gestão de Dissecador',exact:true});await area.getByLabel('Alvo na cena').first().selectOption('vigia');
 await area.getByRole('button',{name:'Pernas',exact:true}).click();assert.equal(await area.getByRole('button',{name:'Pernas',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Abrir no Console',exact:true}).click();await page.locator('.rc-tabpanel').waitFor();
 assert.ok(await page.locator('.rc-tabpanel').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
 await page.screenshot({path:'/tmp/classes-redesign-dissecador.png',fullPage:false});
 await page.getByRole('button',{name:'Fechar console',exact:true}).click();
 for(const slug of ['guardiao','mercador','domador','artifice','coordenador']){
  await page.getByLabel('Subclasse de exemplo').selectOption(slug);
  await page.screenshot({path:`/tmp/classes-redesign-${slug}.png`,fullPage:true});
 }
 await page.getByLabel('Somente leitura').check();assert.ok(await page.locator('.cp-panel button').filter({hasText:'Instalar'}).count()===0||await page.locator('.cp-panel button').filter({hasText:'Instalar'}).first().isDisabled());
 await page.setViewportSize({width:390,height:844});
 for(const slug of Object.keys(configs)){
  await page.getByLabel('Subclasse de exemplo').selectOption(slug);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${slug}`);
 }
 await page.screenshot({path:'/tmp/classes-redesign-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('24 variantes: telas, regras, custo/limite por alvo, anatomia, Console e mobile OK.');
}finally{await browser.close();}
