import type { FormSchemaDraft, FormSchemaField } from './formSchema'
export const yarnPurchasePrototypeId = 'form.new.yarn-purchase-demo-20261115-9f36c2'
const t = (fa: string) => ({ fa, en: fa, zh: fa })
export function yarnPurchasePrototype(): FormSchemaDraft {
  const definitions: [string,string,string,string[]?][] = [
    ['supplierId','تأمین‌کننده','Zhejiang Huaxin Yarn',['Zhejiang Huaxin Yarn','Suzhou Textile']],
    ['invoiceDate','تاریخ فاکتور','2026-11-15'],
    ['externalInvoiceNumber','شماره فاکتور تأمین‌کننده',''],
    ['internalNumber','شماره فاکتور خرید','PUR-1405-00217'],
    ['paymentTerms','شرایط پرداخت','۱۲۰ روزه',['۱۲۰ روزه','نقدی','۶۰ روزه']],
    ['payer','متعهد پرداخت','شریک چینی',['شریک چینی','خریدار']],
    ['containerNotes','کانتینر و بارگیری','40HC — ظرفیت عملیاتی 68 CBM'],
    ['paymentNotes','جزئیات پرداخت و اقساط',''],['attachmentNotes','مدارک، پیوست‌ها و توضیحات','']
  ]
  const fields: FormSchemaField[] = definitions.map(([id,label,value,options],i)=>({id,label:t(label),componentId:id==='invoiceDate'?'base-form.date-input':'definition.field',kind:options?'select':'text',readOnly:id==='internalNumber',focusOrder:id==='invoiceDate'?1:id==='supplierId'?2:i+3,sectionId:i<6?'demo.header':i===6?'demo.containers':i===7?'demo.payments':'demo.documents',span:5,minTracks:5,settings:{demoValue:value,demoOptions:options??[],layout:{grid:{columns:20,columnStart:(i%4)*5+1,columnSpan:5,rowStart:Math.floor(i/4)+1}}}}))
  const names=[['lineNumber','ردیف'],['yarn','کالا / نخ'],['packaging','بسته‌بندی'],['packageCount','تعداد بسته'],['netWeight','وزن (kg)'],['unitPriceCNY','قیمت واحد CNY/kg'],['lineAmount','مبلغ CNY'],['orderReference','شماره سفارش'],['cbm','CBM'],['containerNumber','شماره کانتینر'],['remove','حذف']]
  return {id:yarnPurchasePrototypeId,schemaVersion:1,version:1,status:'draft',mode:'operational',title:t('ثبت خرید نخ'),settings:{demoPrototype:true},layout:{direction:'vertical',gap:6},fields,
    sections:[{id:'demo.header',kind:'editor'}, {id:'demo.items',kind:'grid'}, ...[['demo.containers','کانتینر و بارگیری'],['demo.payments','شرایط پرداخت'],['demo.documents','مدارک و پیوست‌ها']].map(([id,title])=>({id,kind:'editor' as const,title:t(title),settings:{collapsible:true,expanded:false}}))],
    tables:[{id:'demo.items',sectionId:'demo.items',title:t('اقلام فاکتور'),dataSourceId:'synthetic.local',columns:names.map(([id,label])=>({id,label:t(label),width:id==='yarn'?220:id==='containerNumber'?180:110,binding:{kind:'dataField',dataFieldId:id}})),settings:{demoEntries:{invoiceSummary:true,referenceRate:6.67,vat:13,editors:{yarn:{type:'select',options:['نخ پلی‌استر 150D/48F','نخ پلی‌استر 300D/96F']},packaging:{type:'select',options:['کارتن','گونی']},packageCount:{type:'number'},netWeight:{type:'number'},unitPriceCNY:{type:'number'},orderReference:{type:'select',options:['SN0002','PO-1405-033']},containerNumber:{type:'text'}},rows:[{id:'demo.1',yarn:'نخ پلی‌استر 150D/48F',packaging:'کارتن',packageCount:120,netWeight:3000,unitPriceCNY:20,orderReference:'SN0002',containerNumber:'CNU 482193-4'},{id:'demo.2',yarn:'نخ پلی‌استر 300D/96F',packaging:'گونی',packageCount:80,netWeight:2000,unitPriceCNY:25,orderReference:'PO-1405-033',containerNumber:'CNU 482193-4'}]}}}],actions:[],behaviorInstruction:'دموی محلی؛ هیچ عملیات خرید یا ثبت مالی اجرا نمی‌شود.'}
}
