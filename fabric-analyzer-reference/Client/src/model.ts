export const roles = { Production:'تولید', Manager:'مدیر تولید', Sales:'فروش', Pricing:'قیمت‌گذاری', Administrator:'مدیر سیستم' } as const
export const statuses = { Draft:'پیش‌نویس', Ready:'آماده آزمایش', Review:'نیازمند بررسی', Approved:'تأییدشده', Obsolete:'منسوخ‌شده' } as const
export const kinds = { Chenille:'شانل', Filament:'فیلامنت', Spun:'ریسیده', Other:'سایر' } as const
export const systems = { Denier:'Denier', Dtex:'dTex', Tex:'Tex', Nm:'Nm', NeCotton:'Ne cotton' } as const
export const bases = { Single:'نمره تک‌لا', Finished:'نمره نهایی مجموعه' } as const
export const fabricBases = { Meter:'هر متر', Kilogram:'هر کیلوگرم' } as const
export const beamNames = { Single:'تک‌چله', Upper:'چله بالا', Lower:'چله پایین' } as const
export type Beam = keyof typeof beamNames
export type FabricBasis = keyof typeof fabricBases
export type WarpBeam = {beam:Beam; ends:number; steps:{yarnId:number;repeat:number;extra:number}[]}
export type Configuration = {maxWeftCycleSlots:number;tolerance:number;revision?:number;effectiveAt?:string}
export const axes = { Warp:'تار', Weft:'پود' } as const
export const states = { Pass:'در محدوده', Fail:'خارج از محدوده', Missing:'اطلاعات ناکافی' } as const
export const checks: Record<string,string> = {
  yarn:'مصرف نخ', tex:'صحت نمره و Tex', cycle:'موقعیت انتهای سیکل', ends:'تعداد سرنخ تار',
  warp:'مجموع مصرف تار', weft:'مجموع مصرف پود', balance:'تراز مصرف با پارچه و ضایعات', meter:'مصرف کل در متر', clothMeter:'وزن پارچه سالم در متر', beam:'مجموع چله', roll:'تطبیق رول و نمونه', total:'مجموع مصرف نخ', weighing:'کامل بودن توزین نخ'
}
export const actions: Record<string,string> = {
  Create:'ایجاد نسخه', Edit:'اصلاح پیش‌نویس', Ready:'آماده آزمایش', Prepare:'توزین اولیه',
  Trial:'ثبت آزمایش', CorrectTrial:'اصلاح آزمایش', Approve:'تأیید', Obsolete:'منسوخ‌شدن'
}
export type Role = keyof typeof roles
export type Status = keyof typeof statuses
export type Axis = keyof typeof axes
export type CheckState = keyof typeof states
export type Session = { sample:boolean; development:boolean; user?:string; name?:string; role?:Role }
export type YarnInput = {
  name:string; kind:keyof typeof kinds; color:string; system:keyof typeof systems | ''; count:number; plies:number;
  basis:keyof typeof bases | ''; measureM:number|null; measureG:number|null; measureSource:string;
  useMeasured:boolean; notes:string; code:string; material:string; measureDate:string
}
export type YarnRow = { id:number; input:YarnInput; tex:number; createdAt:string; createdBy:string }
export type YarnRef = { id:number; name:string; color:string; tex:number }
export type AnalysisInput = {
  code:string; description:string; version:number; date:string; responsible:string; machine:string;
  reedCm:number; fabricCm:number; warpDensity:number; weftDensity:number; sampleM:number;
  warpExtra:number; weftExtra:number; warpBasisCm:number|null; startPick:number; notes:string;
  warp:{yarnId:number; ends:number|null; extra:number}[];
  weft:{yarnId:number; picks:number; measuredPickCm:number|null}[];
  basis:FabricBasis; beams?:WarpBeam[]|null; weftColors?:number[]|null; settings?:Configuration|null; weftLengthSource?:string|null
}
export type Summary = {id:number; code:string; description:string; version:number; date:string; status:Status}
export type Use = {
  axis:Axis; yarnId:number; ends:number|null; cyclePicks:number; sharePercent:number|null; picksPerCm:number|null;
  picks:number|null; picksInOneMeter:number|null; meters:number; grams:number; gramsPerMeter:number; weightSharePercent:number; beam?:Beam|null
}
export type Theory = {
  lengthM:number; cyclePicks:number; totalPicks:number; startPick:number; nextPick:number; estimatedWarp:boolean;
  expectedEnds:number; totalEnds:number; warpG:number; weftG:number; totalG:number; warpGPerM:number;
  weftGPerM:number; totalGPerM:number; gsm:number; yarns:Use[]; warpGroups:{position:number;yarnId:number;ends:number;estimated:boolean;meters:number;gramsPerMeter:number;beam?:Beam|null}[]; basis:FabricBasis; warpDensityActual?:number; warpReferenceCm?:number
}
export type Weigh = {
  axis:Axis; yarnId:number; package:string; initialG:number; remainingG:number|null;
  gross:boolean; initialTareG:number; remainingTareG:number; wasteG:number|null; notes:string; beam?:Beam|null
}
export type TrialInput = {
  number:string; date:string; machine:string; operator:string; lengthM:number; widthCm:number; clothG:number;
  startPick:number; observedNextPick:number|null; notes:string; weighings:Weigh[]; replacesId?:number;
  preparationId?:number; reason?:string; lengthEstimated?:boolean; weights?:FabricWeights|null
}
export type FabricWeights = { rollGrossG:number|null; rollTareG:number|null; sampleG:number|null; sampleInRoll:boolean|null;
  yarnWasteG:number|null; fabricWasteG:number|null; fabricWasteM:number|null }
export type TrialResult = {
  theory:Theory; checks:{check:string; state:CheckState; expected:number|null; actual:number|null; difference:number|null; axis?:Axis; yarnId?:number; beam?:Beam|null; advisory?:boolean}[];
  consumedG:number|null; wasteG:number|null; clothG:number; clothGPerM:number; balanceG:number|null; tolerance:number; state:CheckState; lengthEstimated?:boolean; actualGsm?:number|null; actualRate?:number|null;
  rates?:{axis:Axis;yarnId:number;beam?:Beam|null;actual:number|null;estimate:number|null}[]; validationSettings?:Configuration|null
}
export type Trial = { id:number; preparation:boolean; at:string; user:string; replacesId?:number; superseded:boolean; packageUse?: (number|null)[]; input:TrialInput; result?:TrialResult }
export type ReportTrial = {id:number; number:string; date:string; result:TrialResult; weights?:FabricWeights|null}
export type Approval = {user:string; at:string; reason?:string}
export type Detail = { id:number; status:Status; rowVersion:string; input:AnalysisInput; theory:Theory; yarns:YarnRef[]; trials:Trial[];
  audit:{id:number; action:string; user:string; at:string; reason?:string; previous?:AnalysisInput}[]; approved?:Approval }
export type Report = {id:number; status:Status; input:AnalysisInput; theory:Theory; yarns:YarnRef[]; trials:ReportTrial[]; approved:Approval}
export type Account = { id:number; user:string; name:string; role:Role; enabled:boolean }

export async function api<T>(path:string, method = 'GET', payload?:unknown):Promise<T> {
  const response = await fetch('/api' + path, {
    method, headers: { 'Content-Type':'application/json', 'X-Fabric-Request':'1' },
    body:payload === undefined ? undefined : JSON.stringify(payload)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error ?? (response.status === 429 ? 'تعداد تلاش‌های ورود زیاد است. یک دقیقه صبر کنید.' : 'درخواست انجام نشد.'))
  }
  return response.status === 204 ? undefined as T : response.json()
}
export const number = (x:number|null|undefined, max = 4) => x == null ? '—' :
  new Intl.NumberFormat('en-US', { maximumFractionDigits:max }).format(x)
export const signed = (x:number|null) => x === null ? '—' : (x > 0 ? '+' : '') + number(x) + '%'
const dateFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit'
})
export function dateParts(value?:string) {
  const parts = dateFormatter.formatToParts(value ? new Date(value.length === 10 ? value + 'T12:00:00Z' : value) : new Date())
  return ['year','month','day'].map(key => parts.find(p => p.type === key)!.value)
}
export const localDate = (value?:string) => dateParts(value).join('/')
export const localTime = (value:string) => localDate(value) + ' ' +
  new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Tehran', hour:'2-digit', minute:'2-digit'}).format(new Date(value))
export async function isoDate(value:string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const [year, month, day] = value.split('/')
  return (await api<{date:string}>(`/date/${year}/${month}/${day}`)).date
}
export function latin(value:string) {
  return value.replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/٫/g,'.')
}
export function todayIso() { return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()) }
export function makeBeam(beam:Beam):WarpBeam {return {beam,ends:0,steps:[{yarnId:0,repeat:1,extra:0}]}}
export function makeAnalysis():AnalysisInput {
  return {code:'',description:'',version:1,date:todayIso(),responsible:'',machine:'',reedCm:0,fabricCm:0,
    warpDensity:0,weftDensity:0,sampleM:1,warpExtra:0,weftExtra:0,warpBasisCm:null,startPick:1,notes:'',
    warp:[],weft:[{yarnId:0,picks:1,measuredPickCm:null}],basis:'Meter',beams:[makeBeam('Single')],weftColors:[0]}
}
export function makeYarn():YarnInput {
  return {code:'',material:'',measureDate:todayIso(),name:'',kind:'Filament',color:'',system:'',count:0,plies:1,basis:'',measureM:null,measureG:null,measureSource:'',useMeasured:false,notes:''}
}
