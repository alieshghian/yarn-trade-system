import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

const base='http://127.0.0.1:5089'
function session() {
  let cookie=''
  return async (path, method='GET', body, status=200, url=base) => {
    const response=await fetch(url+'/api'+path,{
      method, headers:{'Content-Type':'application/json','X-Fabric-Request':'1', cookie},
      body:body===undefined?undefined:JSON.stringify(body)
    })
    const value=await response.text()
    assert.equal(response.status,status,`${method} ${path}: ${value}`)
    const set=response.headers.get('set-cookie')
    if(set)cookie=set.split(';')[0]
    return value?JSON.parse(value):undefined
  }
}
const admin=session(), operator=session(), anonymous=session()
await admin('/dev/Administrator','POST',undefined,204)
const setting=await admin('/settings')
const user='test-pricing-'+randomBytes(4).toString('hex')
const pwd=randomBytes(19).toString('base64url')
await admin('/users','POST',{user,name:'کاربر آزمون قیمت‌گذاری',password:pwd,role:'Pricing',enabled:true},204)
const account=(await admin('/users')).find(u=>u.user===user)
try {
  await anonymous('/login','POST',{user,password:'incorrect'},401)
  await operator('/login','POST',{user,password:pwd},204)
  assert.equal((await operator('/session')).role,'Pricing')
  await operator('/reports')
  await operator('/settings','GET',undefined,403)
  await operator('/analyses','GET',undefined,403)
  await anonymous('/dev/Manager','POST',undefined,404,'http://127.0.0.1:5088')
  console.log('PASS 1 Account password sign-in, role isolation and operational quick-login denial')
  await admin('/settings','PUT',{tolerance:4.75},204)
  assert.equal((await admin('/settings')).tolerance,4.75)
  await admin('/settings','PUT',{tolerance:101},422)
  assert.equal((await admin('/settings')).tolerance,4.75)
  console.log('PASS 2 Settings persistence and invalid tolerance rejection')
} finally {
  await admin('/settings','PUT',setting,204)
  await admin('/users/'+account.id,'PUT',{...account,enabled:false},204)
}
await operator('/reports','GET',undefined,401)
console.log('PASS 3 Disabling an account revokes its existing session')

const producer=session()
await producer('/dev/Production','POST',undefined,204)
const versions=await producer('/analyses')
const template=await producer('/analyses/'+versions.find(v=>v.status==='Approved').id)
const draft=await producer('/analyses','POST',{...template.input,code:'FA-DRAFT-'+randomBytes(3).toString('hex'),version:1})
const reason='اصلاح آزمایشی طول نمونه و ترتیب سیکل'
const amended=await producer('/analyses/'+draft.id,'PUT',{...template.input,
  code:(await producer('/analyses/'+draft.id)).input.code,version:1,sampleM:2,
  weft:template.input.weft.slice().reverse(),rowVersion:draft.rowVersion,reason})
assert.notEqual(amended.rowVersion,draft.rowVersion)
const recovered=await producer('/analyses/'+draft.id)
assert.equal(recovered.input.sampleM,2)
assert.deepEqual(recovered.input.weft,template.input.weft.slice().reverse())
assert.equal(recovered.audit.find(h=>h.action==='Edit').reason,reason)
assert.deepEqual(recovered.audit.find(h=>h.action==='Edit').previous.weft,template.input.weft)
console.log('PASS 4 Draft revision preserves the prior cycle and records the reason')
console.log('Administration/integration scenarios: 4 passed, 0 failed.')
