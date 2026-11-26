import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const url = 'http://127.0.0.1:5089'
const manifest = new URL('../../.run/acceptance-v2-fixture.json', import.meta.url)
const resultFile = new URL('../../.run/acceptance-v2-results.json', import.meta.url)
const tag = 'FA-V2-' + Date.now().toString(36).toUpperCase()
const date = '2026-11-25'
const round = n => Number(n.toFixed(8))
const browser = await chromium.launch({ channel:'msedge',headless:true })
const results = []
let seq = 0, yarns, fixture

async function client(role) {
  const context = await browser.newContext({viewport:{width:1450,height:1050}})
  async function request(path, method='GET', data, status=200) {
    const response = await context.request.fetch(url+'/api'+path,{method,data,headers:{'X-Fabric-Request':'1'}})
    const body = await response.text()
    assert.equal(response.status(),status,`${method} ${path} ${body}`)
    return body ? JSON.parse(body) : undefined
  }
  if(role)await request('/dev/'+role,'POST',undefined,204)
  return {context,request}
}
async function scenario(n,label,run) {
  try {await run();results.push({n,label,status:'PASS'});console.log(`PASS ${n} ${label}`)}
  catch(e){results.push({n,label,status:'FAIL',detail:e.message});console.error(`FAIL ${n} ${label}\n${e.stack}`)}
}
function closeTo(actual, expected, epsilon=0.00001) {
  assert.equal(typeof actual, 'number')
  assert.ok(Math.abs(actual-expected)<epsilon,`Expected ${expected}; got ${actual}`)
}
const step=(id,picks=1,measuredPickCm=null)=>({yarnId:id,picks,measuredPickCm})
const warpStep=(id,repeat=1)=>({yarnId:id,repeat,extra:0})
function header(options={}) {
  return {code:tag+'-'+(++seq),description:'پارچه آزمایشی '+tag,version:1,date,responsible:'مسئول نمونه',
    machine:'ماشین نمونه',reedCm:100,fabricCm:90,warpDensity:1,weftDensity:.08,warpExtra:0,weftExtra:0,
    warpBasisCm:null,startPick:1,basis:'Meter',warp:[],notes:'داده نمونه پذیرش',
    beams:[{beam:'Single',ends:100,steps:[warpStep(yarns[0])]}],
    weftColors:[yarns[1],yarns[2]],weft:[step(yarns[1],2),step(yarns[2]),step(yarns[1])],...options}
}
async function createReady(p,options={}) {
  const input=header(options)
  const saved=await p('/analyses','POST',input)
  const ready=await p('/analyses/'+saved.id+'/ready','POST',{rowVersion:saved.rowVersion})
  return {...ready,input}
}
function sampleOf(version,{suffix='T1',factor=1,sampleInRoll=true,lengthEstimated=false}={}) {
  const theory=version.theory
  const rows=theory.yarns.map((u,i)=>({
    axis:u.axis,beam:u.beam,yarnId:u.yarnId,package:`${version.input.code}-${suffix}-P${i}`,
    initialG:100,remainingG:round(100-u.grams*factor),gross:false,initialTareG:0,remainingTareG:0,wasteG:null
  }))
  const clothG=round(theory.totalG*factor-.1)
  const weights={sampleInRoll,sampleG:.25,rollTareG:2,rollGrossG:round(clothG+2-(sampleInRoll?0:.25)),
    yarnWasteG:.05,fabricWasteG:.05,fabricWasteM:.01}
  return {number:suffix,date,machine:'ماشین نمونه',operator:'اپراتور نمونه',lengthM:1,widthCm:90,clothG,startPick:1,
    observedNextPick:theory.nextPick,weighings:rows,weights,lengthEstimated,rowVersion:version.rowVersion}
}
async function res(p,ready,sample,status=200) {return p('/analyses/'+ready.id+'/trials','POST',sample,status)}

try {
  if(process.argv.includes('--restart')) {
    const after=JSON.parse(await readFile(manifest,'utf8'))
    const sales=await client('Sales')
    const reports=await sales.request('/reports')
    assert.equal(reports.find(r=>r.code===after.code).id,after.id)
    const report=await sales.request('/reports/'+after.id)
    assert.equal(report.trials.at(-1).result.validationSettings.maxWeftCycleSlots,after.slots)
    const page=await sales.context.newPage()
    await page.goto(url+'/#reports')
    await page.getByLabel('جست‌وجوی کالا',{exact:true}).fill(after.code)
    await page.getByRole('button',{name:'نمایش',exact:true}).click()
    await page.getByRole('heading',{name:'نتیجه کنترل آزمایش',exact:true}).waitFor()
    console.log('PASS 12b Browser and SQL data reloaded following an actual process restart')
  } else {
    const {request:p}=await client('Production')
    const {request:a}=await client('Administrator')
    const {request:m}=await client('Manager')
    const {request:s}=await client('Sales')
    const initial=await a('/settings')
    const settings=(capacity,tolerance=5)=>a('/settings','PUT',{maxWeftCycleSlots:capacity,tolerance,reason:'آزمون پذیرش '+tag},204)
    await settings(8)
    yarns=[]
    for(const [i,count] of [100,20,30,15,40,45,50,55,60].entries()){
      const yarn=await p('/yarns','POST',{code:tag+'-Y'+i,name:'نخ آزمون '+tag+' '+i,material:'نمونه',kind:'Filament',
        color:String(i),system:'Tex',count,plies:1,basis:'Finished',useMeasured:false})
      yarns.push(yarn.id)
    }
    try {
      await scenario(1,'Default/capacity settings, 8/9/12 API and UI, and restricted access',async()=>{
        assert.equal(initial.maxWeftCycleSlots,8)
        await p('/settings','PUT',{maxWeftCycleSlots:12,tolerance:5},403)
        const colors=yarns.slice(1,9)
        const nine=header({weftDensity:.09,weftColors:colors,weft:colors.map((id,i)=>step(id,i===0?2:1))})
        await p('/analyses','POST',nine,422)
        const ui=await client('Production'), page=await ui.context.newPage()
        await page.goto(url+'/#analyses')
        await page.getByRole('button',{name:/ایجاد آنالیز/}).click()
        const colorsDropdown=page.getByLabel('تعداد رنگ پود',{exact:true})
        await colorsDropdown.locator('option[value="8"]').waitFor({state:'attached'})
        assert.equal(await colorsDropdown.locator('option').count(),8)
        await colorsDropdown.selectOption('8')
        const pickPanel=page.locator('.subsection').filter({has:page.getByRole('heading',{name:'سیکل پودگذاری',exact:true})})
        for(const [i,id] of colors.entries())
          await pickPanel.getByLabel('نخ و رنگ',{exact:true}).nth(i).selectOption(String(id))
        await pickPanel.getByLabel('تکرار متوالی پود',{exact:true}).first().fill('2')
        await pickPanel.getByRole('alert').filter({hasText:'8 جایگاه'}).waitFor()
        await ui.context.close()
        await settings(12)
        assert.equal((await a('/settings')).maxWeftCycleSlots,12)
        const draft=await p('/analyses','POST',nine)
        assert.equal(draft.theory.cyclePicks,9)
        const compatible=await createReady(p,{weftDensity:.09,weftColors:nine.weftColors,weft:nine.weft})
        const completed=await res(p,compatible,sampleOf(compatible))
        assert.equal(completed.result.state,'Pass')
        await settings(8)
        await m('/analyses/'+compatible.id+'/approve','POST',{rowVersion:completed.rowVersion},422)
        await p('/analyses/'+draft.id+'/ready','POST',{rowVersion:draft.rowVersion},422)
        assert.equal((await p('/analyses/'+draft.id)).input.settings.maxWeftCycleSlots,12)
      })
      await scenario(2,'Eight single, seven plus one, five with 2+2+2+1+1, and 9 blocked',async()=>{
        for(const counts of [[1,1,1,1,1,1,1,1],[2,1,1,1,1,1,1],[2,2,2,1,1]]){
          const colors=yarns.slice(1,counts.length+1)
          const x=header({weftColors:colors,weft:colors.map((id,i)=>step(id,counts[i]))})
          assert.equal((await p('/analyses/preview','POST',x)).cyclePicks,8)
        }
        const colors=yarns.slice(1,9)
        await p('/analyses/preview','POST',header({weftColors:colors,weft:colors.map((id,i)=>step(id,i===0?2:1))}),422)
      })
      await scenario(3,'Persist and read non-adjacent repeated yarn in original order',async()=>{
        const reference=header()
        const saved=await p('/analyses','POST',reference)
        const recovered=await p('/analyses/'+saved.id)
        assert.deepEqual(recovered.input.weft,reference.weft)
        assert.deepEqual(recovered.input.weftColors,reference.weftColors)
        assert.equal(recovered.theory.cyclePicks,4)
      })
      await scenario(4,'Single multi-yarn warp, two independent beams, and 1003-end remainder',async()=>{
        const x=header({warpDensity:10.03,beams:[{beam:'Single',ends:1003,steps:[warpStep(yarns[0],2),warpStep(yarns[1])]}]})
        const theory=await p('/analyses/preview','POST',x)
        assert.deepEqual(theory.yarns.filter(u=>u.axis==='Warp').map(u=>u.ends),[669,334])
        assert.equal(theory.expectedEnds,1003)
        const beams=[{beam:'Upper',ends:60,steps:[warpStep(yarns[0])]},{beam:'Lower',ends:40,steps:[warpStep(yarns[0])]}]
        const saved=await p('/analyses','POST',header({beams}))
        assert.deepEqual(saved.theory.yarns.filter(u=>u.axis==='Warp').map(u=>[u.beam,u.ends]),[['Upper',60],['Lower',40]])
        const persisted=await p('/analyses/'+saved.id)
        await p('/analyses/'+saved.id,'PUT',{...persisted.input,rowVersion:persisted.rowVersion,reason:'تغییر چله',
          beams:[{beam:'Single',ends:100,steps:[warpStep(yarns[0])]}]},422)
      })
      await scenario(5,'Tex conversions and ambiguous chenille rejection',async()=>{
        for(const [system,count,expected] of [['NeCotton',2,295.2706235],['Nm',20,50],['Denier',180,20],['Dtex',180,18],['Tex',42,42]]){
          const y=await p('/yarns/tex','POST',{name:'نخ',color:'01',kind:'Chenille',system,count,plies:1,basis:'Finished'})
          closeTo(y.tex,expected)
        }
        await p('/yarns/tex','POST',{name:'شانل',color:'01',kind:'Chenille',count:2,plies:1,basis:'Finished'},422)
      })
      await scenario(6,'Reference computations: 2400 picks and 78.2 g/m',async()=>{
        const result=await p('/analyses/preview','POST',header({weftDensity:24}))
        const count=result.yarns.filter(u=>u.axis==='Weft').map(u=>u.picks)
        assert.deepEqual(count,[1800,600])
        const w=yarns.slice(1,4)
        const t=await p('/analyses/preview','POST',header({reedCm:160,fabricCm:155,warpDensity:.625,weftDensity:24,
          weftColors:w,weft:[step(w[0],2,170),step(w[1],1,170),step(w[2],3,170)],weftLengthSource:'اندازه‌گیری نمونه'}))
        assert.deepEqual(t.yarns.filter(u=>u.axis==='Weft').map(u=>u.grams),[27.2,20.4,30.6])
        closeTo(t.weftG,78.2)
        await p('/analyses/preview','POST',header({fabricCm:101}),422)
      })
      await scenario(7,'Before and after package weights, negative/duplicate rejection, audit',async()=>{
        const ready=await createReady(p,{beams:[{beam:'Upper',ends:60,steps:[warpStep(yarns[0])]},
          {beam:'Lower',ends:40,steps:[warpStep(yarns[0])]}]})
        const sample=sampleOf(ready)
        const prep=await p('/analyses/'+ready.id+'/preparations','POST',{...sample,
          weights:null,weighings:sample.weighings.map(w=>({...w,remainingG:null}))})
        const complete={...sample,preparationId:prep.id,rowVersion:prep.rowVersion}
        await res(p,ready,{...complete,weighings:complete.weighings.map((w,i)=>i===0?{...w,remainingG:101}:w)},422)
        await res(p,ready,{...complete,weighings:complete.weighings.map(w=>({...w,package:'DUP-'+tag}))},422)
        const posted=await res(p,ready,complete)
        assert.equal(posted.result.state,'Pass')
        assert.equal(posted.result.checks.filter(c=>c.check==='beam').length,2)
        await res(p,ready,{...complete,rowVersion:posted.rowVersion},422)
        await res(p,ready,{...complete,preparationId:null,number:'EXTRA',rowVersion:posted.rowVersion},422)
        const latest=await p('/analyses/'+ready.id)
        assert.equal(latest.trials.length,2);assert.equal(latest.trials[0].input.weighings[0].remainingG,null)
        assert.equal(latest.trials[1].input.weighings[0].beam,'Upper')
      })
      await scenario(8,'Sample included in or excluded from roll without double count',async()=>{
        for(const sampleInRoll of [true,false]){
          const ready=await createReady(p)
          const sample=sampleOf(ready,{sampleInRoll})
          const posted=await res(p,ready,sample)
          closeTo(posted.result.balanceG,0)
          const roll=posted.result.checks.find(c=>c.check==='roll')
          closeTo(roll.expected,sample.clothG)
          assert.equal(roll.state,'Pass')
        }
      })
      await scenario(9,'Meter/kg units, advisory approximate length, independent mass balance',async()=>{
        const meter=await createReady(p)
        const metered=await res(p,meter,sampleOf(meter))
        closeTo(metered.result.actualRate,meter.theory.totalG)
        assert.equal(metered.result.theory.basis,'Meter')
        const kg=await createReady(p,{basis:'Kilogram'})
        const sample=sampleOf(kg,{lengthEstimated:true})
        const mass=await res(p,kg,sample)
        closeTo(mass.result.actualRate,kg.theory.totalG/sample.clothG*1000)
        assert.equal(mass.status,'Review')
        assert.equal(mass.result.actualGsm,null)
        assert.ok(mass.result.checks.filter(c=>c.advisory).every(c=>c.state==='Missing'))
        assert.equal(mass.result.checks.find(c=>c.check==='balance').state,'Pass')
        await m('/analyses/'+kg.id+'/approve','POST',{rowVersion:mass.rowVersion},422)
      })
      await scenario(10,'4% accepted, 6% requires manager reason, missing data cannot pass',async()=>{
        for(const [factor,expected,needsReason] of [[1.04,'Pass',false],[1.06,'Fail',true]]){
          const ready=await createReady(p)
          const trial=await res(p,ready,sampleOf(ready,{factor}))
          assert.equal(trial.result.state,expected)
          const command={rowVersion:trial.rowVersion}
          if(needsReason)await m('/analyses/'+ready.id+'/approve','POST',command,422)
          await m('/analyses/'+ready.id+'/approve','POST',{...command,reason:needsReason?'اختلاف آزمایشی مستند':null})
          if(!needsReason)fixture={code:ready.input.code,id:ready.id,slots:8}
        }
        const ready=await createReady(p)
        const input=sampleOf(ready)
        input.weighings[0].remainingG=null
        const missing=await res(p,ready,input)
        assert.equal(missing.result.state,'Missing')
        await m('/analyses/'+ready.id+'/approve','POST',{rowVersion:missing.rowVersion,reason:'آزمون'},422)
      })
      await scenario(11,'Approved revision protection, historical settings snapshots, API authorizations',async()=>{
        assert.ok(fixture)
        const old=await p('/analyses/'+fixture.id)
        const report=await s('/reports/'+fixture.id)
        assert.equal(report.trials[0].result.validationSettings.maxWeftCycleSlots,8)
        await settings(10,4.8)
        assert.equal((await s('/reports/'+fixture.id)).input.settings.maxWeftCycleSlots,8)
        await p('/analyses/'+fixture.id,'PUT',{...old.input,rowVersion:old.rowVersion,reason:'تغییر'},422)
        const next=await p('/analyses','POST',{...old.input,version:2})
        assert.equal((await p('/analyses/'+next.id)).input.settings.maxWeftCycleSlots,10)
        await s('/reports/'+next.id,'GET',undefined,422)
        await s('/analyses','GET',undefined,403)
        await p('/analyses/'+next.id+'/approve','POST',{rowVersion:next.rowVersion},403)
        assert.equal((await p('/analyses/'+fixture.id)).status,'Approved')
        const history=await a('/settings/history')
        assert.equal(history[0].maxWeftCycleSlots,10)
        await settings(8)
      })
      await scenario(12,'Browser keyboard/date, focus select, auto estimate, pilot weighing and approved report',async()=>{
        assert.ok(fixture)
        const production=await client('Production'), page=await production.context.newPage()
        const errors=[]
        page.on('pageerror',e=>errors.push(e.message))
        await page.goto(url+'/#analyses')
        const btn=(name,where=page)=>where.getByRole('button',{name,exact:true})
        const form=page.locator('#analysis-form')
        const f=label=>form.getByLabel(label,{exact:true})
        await page.getByRole('button',{name:/ایجاد آنالیز/}).waitFor()
        await page.locator('h1').click()
        await page.keyboard.press('Space')
        await f('کد کالا').fill(tag+'-BROWSER')
        await f('کد کالا').press('Enter')
        await f('شرح کالا').fill('رکورد نمونه مرورگر')
        await f('شرح کالا').press('Enter')
        assert.equal(await page.evaluate(()=>document.activeElement.value),'1')
        assert.deepEqual(await page.evaluate(()=>[document.activeElement.selectionStart,document.activeElement.selectionEnd]),[0,1])
        await f('شماره نسخه').press('Enter')
        assert.ok(await page.evaluate(()=>document.activeElement.classList.contains('day')))
        await page.keyboard.press('Enter')
        assert.ok(await page.evaluate(()=>document.activeElement.classList.contains('month')))
        await page.keyboard.press('Enter')
        assert.ok(await page.evaluate(()=>document.activeElement.classList.contains('year')))
        await page.keyboard.press('Enter')
        assert.equal(await page.evaluate(()=>document.activeElement.closest('label').querySelector('span').textContent),'مسئول تولید')
        for(const [label,value] of [
          ['مسئول تولید','مسئول نمونه'], ['نوع دستگاه بافندگی','ماشین تست'],['عرض شانه (cm)',100],['عرض پارچه خام (cm)',101]
        ]) await f(label).fill(String(value))
        await page.getByRole('alert').filter({hasText:'عرض خام نباید'}).waitFor()
        await f('عرض پارچه خام (cm)').fill('90')
        await f('تراکم تار در هر cm').fill('10')
        await f('تراکم کل پود در هر cm').fill('24')
        await f('سرنخ تک‌چله').fill('1000')
        await f('سرنخ تک‌چله').blur()
        assert.equal(await f('سرنخ تک‌چله').inputValue(),'1,000')
        await f('سرنخ تک‌چله').focus()
        assert.deepEqual(await page.evaluate(()=>[document.activeElement.selectionStart,document.activeElement.selectionEnd]),[0,5])
        const beam=page.locator('.beam-panel')
        await beam.getByLabel('نخ و رنگ',{exact:true}).selectOption(String(yarns[0]))
        const picks=page.locator('.subsection').filter({has:page.getByRole('heading',{name:'سیکل پودگذاری',exact:true})})
        await btn('＋ نخ جدید',picks).click()
        const dialog=page.getByRole('dialog')
        const jf=label=>dialog.getByLabel(label,{exact:true})
        await jf('کد یکتای نخ').fill(tag+'-INLINE');await jf('نام نخ').fill('نخ جدید نمونه '+tag)
        await jf('رنگ یا کد رنگ').fill('01');await jf('جنس نخ').fill('پلی‌استر')
        await jf('سیستم نمره‌گذاری').selectOption('Denier');await jf('نمره نخ').fill('180')
        await jf('مبنای نمره').selectOption('Finished')
        await page.keyboard.press('F3')
        await dialog.waitFor({state:'hidden'})
        await form.locator('.preview table').waitFor()
        assert.equal(await f('طول نمونه (متر)').count(),0)
        const saved=page.waitForResponse(r=>r.url().endsWith('/api/analyses')&&r.request().method()==='POST')
        await f('شرح کالا').focus()
        await page.keyboard.press('F3')
        const response=await saved
        assert.equal(response.status(),200,await response.text())
        const savedAnalysis=await response.json()
        const readyRequest=page.waitForResponse(r=>r.url().endsWith('/api/analyses/'+savedAnalysis.id+'/ready'))
        await btn('آماده آزمایش').click()
        const rd=await readyRequest
        assert.equal(rd.status(),200,await rd.text())
        const ready={...await rd.json(),input:{code:tag+'-BROWSER'}}
        const sample=sampleOf(ready)
        await btn('＋ توزین اولیه').click()
        const trialField=(label)=>page.getByLabel(label,{exact:true})
        await trialField('شماره آزمایش').fill(sample.number)
        for(const [i,w] of sample.weighings.entries()){
          await trialField('شماره بسته').nth(i).fill(w.package)
          await trialField('وزن اولیه').nth(i).fill(String(w.initialG))
        }
        const preparing=page.waitForResponse(r=>r.url().endsWith('/api/analyses/'+ready.id+'/preparations'))
        await page.keyboard.press('F3')
        const prepared=await preparing
        assert.equal(prepared.status(),200,await prepared.text())
        await btn('ثبت وزن باقی‌مانده و تکمیل').click()
        for(const [label,value] of [
          ['متراژ تولید (متر)',sample.lengthM],['عرض واقعی (cm)',sample.widthCm],['وزن پارچه سالم (گرم)',sample.clothG],
          ['پود بعد از پایان (مشاهده‌شده)',sample.observedNextPick],['وزن ناخالص رول (گرم)',sample.weights.rollGrossG],
          ['وزن مغزی و بسته‌بندی (گرم)',sample.weights.rollTareG],['وزن نمونه جداشده (گرم)',sample.weights.sampleG],
          ['ضایعات نخ (گرم)',sample.weights.yarnWasteG],['ضایعات پارچه (گرم)',sample.weights.fabricWasteG],
          ['متراژ ضایعات پارچه (متر)',sample.weights.fabricWasteM]
        ])await trialField(label).fill(String(value))
        await trialField('شمول نمونه در وزن رول').selectOption('in')
        for(const [i,w] of sample.weighings.entries())await trialField('وزن باقی‌مانده').nth(i).fill(String(w.remainingG))
        const completing=page.waitForResponse(r=>r.url().endsWith('/api/analyses/'+ready.id+'/trials'))
        await page.keyboard.press('F3')
        const completed=await completing
        assert.equal(completed.status(),200,await completed.text())
        const body=await completed.json()
        assert.equal(body.result.state,'Pass')
        const resultHeading=page.getByRole('heading',{name:'نتیجه کنترل آزمایش',exact:true})
        await resultHeading.scrollIntoViewIfNeeded()
        await page.screenshot({path:fileURLToPath(new URL('../../.run/acceptance-v2-browser.png',import.meta.url))})
        const sales=await client('Sales'), reportPage=await sales.context.newPage()
        await reportPage.goto(url+'/#reports')
        await reportPage.getByLabel('جست‌وجوی کالا',{exact:true}).fill(fixture.code)
        await reportPage.getByRole('button',{name:'نمایش',exact:true}).click()
        await reportPage.getByRole('heading',{name:'نتیجه کنترل آزمایش',exact:true}).waitFor()
        assert.equal(errors.length,0,errors.join('\n'))
      })
    } finally {
      await a('/settings','PUT',{tolerance:initial.tolerance,maxWeftCycleSlots:initial.maxWeftCycleSlots,reason:'پایان آزمون '+tag},204)
      if(fixture)await writeFile(manifest,JSON.stringify(fixture,null,2))
      await writeFile(resultFile,JSON.stringify(results,null,2))
    }
    const failed=results.filter(r=>r.status==='FAIL').length
    console.log(`${results.length-failed} PASS / ${failed} FAIL (${results.length} acceptance groups; restart reported separately)`)
    if(failed)process.exitCode=1
  }
} finally { await browser.close() }
