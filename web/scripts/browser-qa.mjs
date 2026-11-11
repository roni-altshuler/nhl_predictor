import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { chromium } from 'playwright'
const require = createRequire(import.meta.url)
const output = path.resolve(process.env.QA_OUTPUT_DIR || 'test-results')
await mkdir(output, { recursive: true })
const port = process.env.QA_PORT || '8891', base = process.env.QA_BASE_URL || `http://127.0.0.1:${port}`
const server = process.env.QA_BASE_URL ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], {stdio:'pipe'})
let browser, expectedNetworkFailure = false
const results = [], errors = [], consoleErrors = [], badResponses = []
const check = async (name, task) => { await task(); results.push({name,status:'passed'}); console.log(`PASS ${name}`) }
try {
  if (server) {
    let ready = false
    for (let n=0;n<100;n++) {
      if (server.exitCode !== null) throw new Error('QA preview server exited')
      try { ready = (await fetch(base)).ok } catch { /* bounded local startup */ }
      if (ready) break
      await new Promise(resolve=>setTimeout(resolve,100))
    }
    assert.ok(ready,'QA preview server ready')
  }
  browser = await chromium.launch({...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),headless:true,args:['--no-sandbox']})
  const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', e => errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error'&&!expectedNetworkFailure)consoleErrors.push(m.text())})
  page.on('response',r=>{if(r.status()>=400&&!expectedNetworkFailure)badResponses.push({url:r.url(),status:r.status()})})
  const go = async hash => { await page.goto("about:blank"); await page.goto(`${base}/${hash}`); await page.locator('main h1').waitFor(); if(!hash.includes('mode=actual')) await page.getByText('Opening the notebook',{exact:true}).waitFor({state:'hidden'}) }
  const main=page.locator('main')
  const countGames=async n=>{await page.waitForFunction(n=>document.querySelectorAll('main .game-card').length===n,n);assert.equal(await main.locator('.game-card').count(),n)}
  const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No page overflow at ${page.viewportSize().width}`)
  const axe=async name=>{await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});const report=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));await writeFile(path.join(output,`axe-${name}.json`),JSON.stringify(report,null,2));assert.deepEqual(report.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`Accessibility ${name}`)}
  await check('overview source boundary, version, record and assets',async()=>{await go('#/');assert.match(await main.innerText(),/4\s*\/8/);assert.match(await page.locator('.scope-band').innerText(),/Synthetic demonstration/);assert.ok(await page.getByTestId('build-version').getAttribute('title'));await countGames(4);await noOverflow();await axe('overview-desktop')})
  const routes=[['overview','#/'],['games','#/games'],['game','#/games/nhl%3A2024020008'],['teams','#/teams'],['team','#/teams/AAA'],['lab','#/lab'],['record','#/accuracy'],['method','#/method']]
  for(const width of [1440,768,390,320]) for(const [name,hash] of routes) await check(`responsive ${name} ${width}`,async()=>{await page.setViewportSize({width,height:width>800?1000:844});await go(hash);await noOverflow();await page.screenshot({path:path.join(output,`${name}-${width}.png`),fullPage:true});if(width===390)await axe(`${name}-mobile`)})
  await page.setViewportSize({width:1440,height:1000})
  await check('cross-page navigation returns to heading and filter edits preserve position',async()=>{
    await go('#/');await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.getByRole('navigation',{name:'Primary navigation',exact:true}).getByRole('link',{name:'Games',exact:true}).click();await page.getByRole('heading',{name:'Games & results'}).waitFor();assert.equal(await page.evaluate(()=>scrollY),0)
    await page.evaluate(()=>window.scrollTo(0,200));await page.getByRole('combobox',{name:'Replay model',exact:true}).selectOption('coin_flip');assert.ok(await page.evaluate(()=>scrollY)>0)
  })
  await check('games phases, season, team, search, empty, repeated reset and history',async()=>{
    await go('#/games');await countGames(8);await page.getByRole('combobox',{name:'Evaluation phase',exact:true}).selectOption('all');await countGames(20)
    await page.getByRole('combobox',{name:'Sample season',exact:true}).selectOption('2023');await countGames(12);await page.getByRole('combobox',{name:'Team',exact:true}).selectOption('AAA');await countGames(6)
    await page.getByLabel('Find a game').fill('nothing');await countGames(0);await page.getByRole('heading',{name:'No sample games match'}).waitFor()
    for(let i=0;i<2;i++)await main.getByRole('button',{name:'Reset filters',exact:true}).first().click();await countGames(8)
    await page.getByLabel('Find a game').fill('2024020008');await countGames(1);await page.reload();await countGames(1)
    await main.locator('.game-card').click();assert.match(await main.innerText(),/nhl:2024020008/);await page.goBack();await countGames(1);await page.goForward();await page.getByRole('heading',{level:1}).waitFor()
  })
  await check('date controls enforce chronological boundaries and reload',async()=>{
    await go('#/games');assert.equal(await page.getByRole('button',{name:'Previous sample day'}).isDisabled(),true)
    await page.getByRole('button',{name:'Next sample day'}).click();assert.notEqual(await page.getByRole('combobox',{name:'Sample day',exact:true}).inputValue(),'');await countGames(1)
    await page.getByRole('button',{name:'Next sample day'}).click();await countGames(1);await page.getByRole('button',{name:'Previous sample day'}).click();await countGames(1)
    const dates=await page.getByRole('combobox',{name:'Sample day',exact:true}).locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));await page.getByRole('combobox',{name:'Sample day',exact:true}).selectOption(dates.at(-1));assert.equal(await page.getByRole('button',{name:'Next sample day'}).isDisabled(),true)
    await page.reload();await countGames(1);await page.getByRole('combobox',{name:'Sample day',exact:true}).selectOption('');await countGames(8)
  })
  await check('team search, sorting, empty reset and detail navigation',async()=>{
    await go('#/teams');await page.getByRole('combobox',{name:'Sort teams',exact:true}).selectOption('wins');assert.match(await main.locator('tbody tr').first().innerText(),/AAA/)
    await page.getByLabel('Find a demo team').fill('xxx');await page.getByRole('heading',{name:'No demo team matches'}).waitFor();await page.getByRole('button',{name:'Clear team search'}).click();assert.equal(await main.locator('tbody tr').count(),4)
    await main.getByRole('link',{name:'Team AAA',exact:true}).click();assert.match(await main.innerText(),/7–3/)
    await main.getByRole('link',{name:'Open filtered game browser →',exact:true}).first().click();await countGames(10)
  })
  await check('matchup swaps, global home-rate, cutoff, invalid selection and reset',async()=>{
    await go('#/lab');const p=page.getByTestId('lab-home-probability');assert.equal(await p.innerText(),'56.4%')
    await page.getByRole('button',{name:'Swap home and away teams'}).click();assert.equal(await p.innerText(),'43.6%');await page.getByRole('button',{name:'Swap home and away teams'}).click();assert.equal(await p.innerText(),'56.4%')
    await page.getByRole('combobox',{name:'Replay model',exact:true}).selectOption('past_home_rate');assert.equal(await p.innerText(),'63.6%');await page.getByRole('button',{name:'Swap home and away teams'}).click();assert.equal(await p.innerText(),'63.6%')
    await page.getByRole('combobox',{name:'Replay snapshot',exact:true}).selectOption('before');assert.equal(await p.innerText(),'50.0%');await page.getByRole('combobox',{name:'Designated home team',exact:true}).selectOption(await page.getByRole('combobox',{name:'Designated away team',exact:true}).inputValue());await page.getByRole('heading',{name:'Choose two different demo teams'}).waitFor();assert.equal(await p.count(),0)
    await page.getByRole('button',{name:'Restore a valid matchup'}).click();await p.waitFor();for(let i=0;i<2;i++)await page.getByRole('button',{name:'Reset matchup'}).click();assert.equal(await p.innerText(),'56.4%');await page.reload();assert.equal(await p.innerText(),'56.4%')
  })
  const range=async(label,value)=>{await page.getByLabel(label,{exact:true}).fill(String(value));await page.getByLabel(label,{exact:true}).dispatchEvent('input')}
  await check('record model, cumulative/recent points and zero denominator',async()=>{
    await go('#/accuracy');await page.getByRole('combobox',{name:'Replay model',exact:true}).selectOption('past_home_rate');assert.match(await main.locator('.stats-grid').innerText(),/5\s*\/8/);await page.getByRole('combobox',{name:'Recent window',exact:true}).selectOption('8')
    await range('Inspect record game',0);assert.match(await page.getByTestId('point-detail').innerText(),/Cumulative.*1\/1/s);await range('Inspect record game',7);assert.match(await page.getByTestId('point-detail').innerText(),/5\/8/)
    await page.getByText('All chart values',{exact:true}).click();assert.equal(await main.locator('.disclosure tbody tr').count(),8)
    await range('Holdout games included',0);assert.match(await main.locator('.stats-grid').innerText(),/Unavailable/);assert.equal(await page.getByLabel('Inspect record game',{exact:true}).count(),0);assert.match(await main.innerText(),/No holdout games selected/);await page.reload();assert.match(await main.locator('.stats-grid').innerText(),/Unavailable/)
    await range('Holdout games included',8);assert.match(await main.locator('.stats-grid').innerText(),/5\s*\/8/)
  })
  await check('method exclusions and deterministic downloadable artifact',async()=>{
    await go('#/method');const link=main.getByRole('link',{name:/Download/});assert.ok(await link.getAttribute('download')!==null)
    const [download]=await Promise.all([page.waitForEvent('download'),link.click()]);const data=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(data.datasetKind,'synthetic-contract-fixture');assert.equal(data.records.length,20);assert.equal(data.livePrediction,false)
  })
  await check('unknown IDs and malformed routes recover without invented data',async()=>{for(const h of ['#/games/nhl%3A2024999999','#/teams/NHL','#/games/%ZZ','#/missing']){await go(h);await page.getByRole('heading',{name:'That view is not in the sample'}).waitFor();await main.getByRole('link',{name:'Browse sample games'}).click();await countGames(8)}})
  await check('actual NHL stays empty across navigation and reload',async()=>{
    await go('#/');await page.getByRole('combobox',{name:'Data source',exact:true}).selectOption('actual');await page.getByRole('heading',{name:'Real NHL coverage is unavailable'}).waitFor();await countGames(0)
    await page.getByRole('navigation',{name:'Primary navigation',exact:true}).getByRole('link',{name:'Track record'}).click();assert.match(page.url(),/mode=actual/);await page.getByRole('heading',{name:'Real NHL coverage is unavailable'}).waitFor();await page.reload();await page.getByRole('heading',{name:'Real NHL coverage is unavailable'}).waitFor();await axe('actual-empty')
    await page.screenshot({path:path.join(output,'actual-unavailable-1440.png'),fullPage:true});await page.getByRole('link',{name:'Explore the artificial sample'}).click();await page.getByRole('heading',{name:'Track record',exact:true}).waitFor()
  })
  await check('mobile More dialog, Escape, restored focus, navigation and skip',async()=>{
    await page.setViewportSize({width:390,height:844});await go('#/');const more=page.getByRole('button',{name:'More',exact:true});await more.click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');assert.equal(await more.evaluate(el=>el===document.activeElement),true)
    await more.click();await page.getByRole('navigation',{name:'More navigation'}).getByRole('link',{name:'Matchup lab'}).click();await page.getByRole('heading',{name:'Matchup lab',exact:true}).waitFor();assert.equal(await page.getByRole('dialog').isVisible(),false)
    await more.click();await page.getByRole('button',{name:'Close navigation'}).click();await more.click();await page.keyboard.press('Escape');await page.getByRole('link',{name:'Skip to content'}).focus();await page.keyboard.press('Enter');assert.equal(await main.evaluate(el=>el===document.activeElement),true);await noOverflow()
  })
  await check('unavailable data fails closed and retry recovers',async()=>{
    expectedNetworkFailure=true;await page.route('**/data/demo.json',route=>route.fulfill({status:503,body:'unavailable'}));await go('#/accuracy');await page.getByRole('heading',{name:'The demonstration could not be loaded'}).waitFor();assert.equal(await main.locator('.stats-grid').count(),0);await axe('data-error');await page.screenshot({path:path.join(output,'data-error-390.png'),fullPage:true})
    await page.unroute('**/data/demo.json');await page.getByRole('button',{name:'Try again'}).click();await page.getByRole('heading',{name:'Track record',exact:true}).waitFor();expectedNetworkFailure=false
  })
  await check('corrupt payload shows no metrics, repeated retry recovers',async()=>{
    const demo=JSON.parse(await readFile('public/data/demo.json','utf8'));demo.records[0].homeWinProbability.elo=.99;await page.route('**/data/demo.json',route=>route.fulfill({json:demo}));await go('#/');await page.getByRole('heading',{name:'The demonstration could not be loaded'}).waitFor();await countGames(0)
    await page.getByRole('button',{name:'Try again'}).click();await page.getByRole('heading',{name:'The demonstration could not be loaded'}).waitFor();await page.unroute('**/data/demo.json');await page.getByRole('button',{name:'Try again'}).click();await page.getByRole('heading',{name:/Explore the game/}).waitFor()
  })
  await check('interrupted load cannot leak into actual NHL mode',async()=>{
    let release;const pending=new Promise(resolve=>{release=resolve});await page.route('**/data/demo.json',async route=>{await pending;try{await route.continue()}catch{/* query AbortSignal cancelled */}})
    await page.goto("about:blank");await page.goto(`${base}/#/`);await page.getByRole('heading',{name:'Opening the notebook'}).waitFor();await page.screenshot({path:path.join(output,'loading-390.png'),fullPage:true});await page.getByRole('combobox',{name:'Data source',exact:true}).selectOption('actual');await page.getByRole('heading',{name:'Real NHL coverage is unavailable'}).waitFor();release();await page.unroute('**/data/demo.json');await page.waitForTimeout(100);await countGames(0)
    await page.getByRole('combobox',{name:'Data source',exact:true}).selectOption('demo');await page.getByRole('heading',{name:/Explore the game/}).waitFor();await countGames(4)
  })
  await check('production browser has no JS errors, broken assets or unexpected console errors',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(badResponses,[])})
  await writeFile(path.join(output,'summary.json'),JSON.stringify({status:'passed',base,browserVersion:browser.version(),checks:results.length,results,errors,consoleErrors,badResponses},null,2));console.log(`${results.length} browser checks passed`)
} catch(error) {
  await writeFile(path.join(output,'summary.json'),JSON.stringify({status:'failed',results,error:String(error),errors,consoleErrors,badResponses},null,2));throw error
} finally {if(browser)await browser.close();server?.kill('SIGTERM')}
