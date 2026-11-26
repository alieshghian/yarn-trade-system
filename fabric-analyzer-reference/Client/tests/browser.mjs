import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const base = 'http://127.0.0.1:5089'
const run = new URL('../../.run/',import.meta.url)
const manifest = new URL('browser-fixture.json', run)
await mkdir(run,{recursive:true})
const browser = await chromium.launch({ channel:'msedge', headless:true })
let passed = 0
const done = label => console.log(`PASS ${++passed} ${label}`)
const errors = []
const page = await browser.newPage({ viewport:{ width:1440,height:1000 } })
page.on('pageerror', error => errors.push(error.message))
const api = async (path, method='GET', body, expect=200) => {
  const response = await page.request.fetch(base+'/api'+path, { method,
    headers:{'X-Fabric-Request':'1'}, data:body })
  const value = await response.text()
  assert.equal(response.status(),expect,`${method} ${path}: ${value}`)
  return value ? JSON.parse(value) : undefined
}
async function login(role) {
  await page.context().clearCookies()
  await page.goto(base)
  await page.getByRole('button',{name:'ورود آزمایشی · '+role,exact:true}).click()
  await page.getByRole('button',{name:'خروج',exact:true}).waitFor()
}
const field=(label,root=page) => root.getByLabel(label,{exact:true})
const button=(label,root=page) => root.getByRole('button',{name:label,exact:true})
const fill=(label,value,root=page) => field(label,root).fill(String(value))
const resultPanel=()=>page.locator('.panel').filter({has:page.getByRole('heading',{name:'نتیجه کنترل آزمایش',exact:true})})
async function submit(path, trigger=()=>page.keyboard.press('F3')) {
  const request = page.waitForResponse(r=>r.url().endsWith('/api'+path) && ['POST','PUT'].includes(r.request().method()))
  await trigger()
  const response=await request
  assert.equal(response.status(),200,await response.text())
  return response.json()
}
const sampleTag='FA-E2E-'+Date.now().toString(36).toUpperCase()

try {
  if (process.argv.includes('--verify-restart')) {
    const {code, id, draft, count} = JSON.parse(await readFile(manifest,'utf8'))
    await login('فروش')
    const active = (await api('/reports')).find(r=>r.code===code)
    assert.equal(active.id,id)
    const report=await api('/reports/'+id)
    assert.equal(report.trials.length,count)
    assert.equal(report.trials[0].result.state,'Pass')
    await api('/reports/'+draft,'GET',undefined,422)
    await field('جست‌وجوی کالا').fill(code)
    await button('نمایش').click()
    await resultPanel().getByText('در محدوده',{exact:true}).first().waitFor()
    assert.equal(errors.length,0,errors.join('\n'))
    done('SQL Server data and active-version report survive process restart')
  } else {
    await page.goto(base)
    await api('/analyses','GET',undefined,401)
    await login('تولید')
    await page.getByRole('link',{name:'تعریف نخ'}).click()

    const yarns=[]
    for(const [name,kind,system,count] of [
      ['تار نمونه','Spun','Tex',100],['شانل نمونه','Chenille','NeCotton',2],['فیلامنت نمونه','Filament','Dtex',250]
    ]) {
      await page.getByRole('button',{name:/ایجاد نخ/}).waitFor()
      await page.locator('h1').click()
      await page.keyboard.press('Space')
      await fill('نام نخ',name+' '+sampleTag)
      await field('نام نخ').press('Enter')
      assert.equal(await page.evaluate(()=>document.activeElement.value),'Filament')
      await field('نوع نخ').selectOption(kind)
      await fill('رنگ یا کد رنگ','01')
      await field('سیستم نمره‌گذاری').selectOption(system)
      await fill('نمره نخ',count)
      await field('مبنای نمره').selectOption('Finished')
      if(kind==='Chenille') {
        await field('استفاده از Tex اندازه‌گیری‌شده').check()
        await fill('طول توزین Tex (متر)',20); await fill('وزن توزین Tex (گرم)',1)
        await fill('منبع اندازه‌گیری','ترازوی نمونه 01')
      }
      const saved=await submit('/yarns')
      yarns.push(saved.id)
      if(kind==='Chenille')assert.equal(saved.tex,50)
    }
    done('Browser yarn registration, measured Tex, Enter, F3 and Space')

    await page.getByRole('link',{name:'آنالیز پارچه'}).click()
    await page.getByRole('button',{name:/ایجاد آنالیز/}).click()
    await fill('کد کالا',sampleTag); await fill('شرح کالا','پارچه نمونه کنترل کارخانه')
    await fill('مسئول تولید','مسئول نمونه'); await fill('نوع دستگاه بافندگی','دستگاه نمونه 01')
    for (const [label,value] of [
      ['عرض شانه (cm)',100],['عرض پارچه خام (cm)',90],['عرض دقیق مبنای چله‌کشی (cm)',100],
      ['تراکم تار در هر cm',1],['تراکم کل پود در هر cm',0.08],['طول نمونه (متر)',1.25],['شماره پود آغاز سیکل',3]
    ]) await fill(label,value)
    const warp=page.locator('.subsection').filter({has:page.getByRole('heading',{name:'گروه‌های نخ تار',exact:true})})
    await field('نخ',warp).selectOption(String(yarns[0]))
    await fill('تعداد سرنخ',100,warp)
    const weft=page.locator('.subsection').filter({has:page.getByRole('heading',{name:'سیکل پودگذاری',exact:true})})
    for(let i=1;i<4;i++)await button('＋ افزودن مرحله',weft).click()
    for (const [i,id,count] of [[0,yarns[1],2],[1,yarns[2],1],[2,yarns[1],1],[3,yarns[2],3]]) {
      await field('نخ',weft).nth(i).selectOption(String(id))
      await field('پود متوالی',weft).nth(i).fill(String(count))
    }
    const preview=await submit('/analyses/preview',()=>button('محاسبه تئوری').click())
    assert.equal(preview.cyclePicks,7)
    assert.equal(preview.totalPicks,10)
    assert.equal(preview.nextPick,6)
    assert.equal(preview.warpG,12.5)
    assert.equal(preview.weftG,.35)
    assert.equal(await weft.locator('.cycle > span').count(),7)
    await page.screenshot({path:new URL('analysis-form.png',run).pathname.replace(/^\/(?=[A-Za-z]:)/,''),fullPage:true})
    const {id}=await submit('/analyses',()=>page.getByRole('button',{name:/ذخیره F3/}).click())
    await button('آماده آزمایش').waitFor()
    const ready=await submit('/analyses/'+id+'/ready',()=>button('آماده آزمایش').click())
    assert.equal(ready.status,'Ready')
    done('Browser analysis form, ordered repeating weft, remainder, weights and Draft → Ready')

    await button('＋ توزین اولیه').click()
    await fill('شماره آزمایش','T-01')
    const weigh=page.locator('.subsection').filter({has:page.getByRole('heading',{name:'وزن‌کشی بسته‌ها (گرم)',exact:true})})
    for(let i=0;i<3;i++){
      await field('شماره بسته',weigh).nth(i).fill('B-'+i)
      await field('وزن اولیه',weigh).nth(i).fill('100')
    }
    await field('مبنای وزن',weigh).nth(0).selectOption('gross')
    await field('وزن ظرف اولیه',weigh).nth(0).fill('10')
    const prep=await submit('/analyses/'+id+'/preparations')
    await button('ثبت وزن باقی‌مانده و تکمیل').click()
    await fill('وزن پارچه سالم (گرم)',12.75)
    await fill('پود بعد از پایان (مشاهده‌شده)',6)
    for(const [i,remaining,waste] of [[0,82.5,.1],[1,99.8,0],[2,99.85,0]]){
      await field('وزن باقی‌مانده',weigh).nth(i).fill(String(remaining))
      await field('وزن ضایعات',weigh).nth(i).fill(String(waste))
    }
    await field('وزن ظرف باقی‌مانده',weigh).nth(0).fill('5')
    const trial=await submit('/analyses/'+id+'/trials')
    assert.equal(trial.result.state,'Pass')
    assert.equal(trial.result.consumedG,12.85)
    assert.equal(trial.result.wasteG,.1)
    assert.equal(trial.result.balanceG,0)
    await resultPanel().getByText('در محدوده',{exact:true}).first().waitFor()
    const initial=await api('/analyses/'+id)
    assert.equal(initial.trials[0].id,prep.id)
    assert.equal(initial.trials[0].input.weighings[0].remainingG,null)
    assert.equal(initial.trials[1].packageUse[0],12.5)
    done('Browser before/after weighing, changing tare, retained preparation, green controls')

    const correct=initial.trials[1].input
    await api('/analyses/'+id+'/trials','POST',{...correct,number:'STALE',rowVersion:ready.rowVersion},409)
    await api('/analyses/'+id+'/trials','POST',{...correct,number:'MISMATCH',preparationId:undefined,rowVersion:initial.rowVersion,
      weighings:correct.weighings.map((w,i)=>i===0?{...w,remainingG:101}:w)},422)
    await api('/analyses/'+id+'/approve','POST',{rowVersion:initial.rowVersion},403)
    assert.equal((await api('/analyses/'+id)).trials.length,2)
    done('Server rejects stale token, impossible weighing and unauthorized approval atomically')

    await login('مدیر تولید')
    await button('بررسی و تأیید').click()
    await submit('/analyses/'+id+'/approve',()=>button('ثبت تأیید').click())
    await page.getByText('نسخه تأیید و برای فروش فعال شد.',{exact:true}).waitFor()
    await login('فروش')
    await field('جست‌وجوی کالا').fill(sampleTag);await button('نمایش').click()
    await resultPanel().getByText('در محدوده',{exact:true}).first().waitFor()
    await api('/analyses','GET',undefined,403)
    await api('/yarns','POST',{},403)
    done('Manager approval and read-only approved report for sales')

    await login('تولید')
    const a=initial.input
    const next=await api('/analyses','POST',{...a,version:2})
    const nextReady=await api('/analyses/'+next.id+'/ready','POST',{rowVersion:next.rowVersion})
    const failing=await api('/analyses/'+next.id+'/trials','POST',{...correct,number:'T-02',preparationId:null,clothG:14.75,
      rowVersion:nextReady.rowVersion,weighings:correct.weighings.map((w,i)=>i===0?{...w,remainingG:80.5}:w)})
    assert.equal(failing.status,'Review')
    assert.equal(failing.result.state,'Fail')
    assert.equal(failing.result.checks.find(c=>c.check==='warp').difference,16)
    await page.reload()
    await resultPanel().getByText('خارج از محدوده',{exact:true}).first().waitFor()
    await page.screenshot({path:new URL('failed-controls.png',run).pathname.replace(/^\/(?=[A-Za-z]:)/,''),fullPage:true})
    await login('مدیر تولید')
    await api('/analyses/'+next.id+'/approve','POST',{rowVersion:failing.rowVersion},422)
    assert.equal((await api('/analyses/'+next.id)).status,'Review')
    await login('قیمت‌گذاری')
    assert.equal((await api('/reports')).find(r=>r.code===sampleTag).id,id)
    await api('/reports/'+next.id,'GET',undefined,422)
    done('Red +16% controls, undocumented approval blocked, prior version remains active')

    await login('تولید')
    const fixed=await api('/analyses/'+next.id+'/trials','POST',{...correct,number:'T-02',preparationId:null,
      replacesId:failing.id,reason:'ثبت مجدد طبق رسید توزین',rowVersion:failing.rowVersion})
    assert.equal(fixed.result.state,'Pass')
    const history=await api('/analyses/'+next.id)
    assert.equal(history.trials.length,2)
    assert.equal(history.trials[0].superseded,true)
    assert.equal(history.trials[0].result.state,'Fail')
    await api('/analyses/'+id,'PUT',{...a,rowVersion:initial.rowVersion,reason:'try'},409)
    done('Append-only trial correction rechecks controls and preserves original result')

    await login('مدیر تولید')
    await api('/analyses/'+next.id+'/approve','POST',{rowVersion:fixed.rowVersion})
    const prior=await api('/analyses/'+id)
    assert.equal(prior.status,'Obsolete')
    await api('/analyses/'+id,'PUT',{...a,rowVersion:prior.rowVersion,reason:'try'},422)
    await login('قیمت‌گذاری')
    assert.equal((await api('/reports')).filter(r=>r.code===sampleTag).length,1)
    assert.equal((await api('/reports')).find(r=>r.code===sampleTag).id,next.id)
    done('New approval obsoletes the prior version and leaves exactly one active report')
    await writeFile(manifest, JSON.stringify({code:sampleTag,id:next.id,draft:id,count:1}))
    assert.equal(errors.length,0,errors.join('\n'))
  }
  console.log(`Browser/integration scenarios: ${passed} passed, 0 failed.`)
} finally { await browser.close() }
