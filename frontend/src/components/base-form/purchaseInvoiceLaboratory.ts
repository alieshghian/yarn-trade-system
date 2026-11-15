import type { FormSchemaDraft, FormSchemaField, FormSchemaFieldKind, FormSchemaTable } from './formSchema'

// Independent design seed. Bindings follow CommercePage; all data is synthetic.
export const purchaseInvoiceLaboratoryId = 'form.new.purchase-invoice-commerce-20261115'
const text = (value: string) => ({ fa: value, en: value, zh: value })
const field = (id: string, label: string, kind: FormSchemaFieldKind, index: number, sectionId: string): FormSchemaField => ({
  id, sectionId, kind, componentId: 'definition.field', label: text(label),
  dataBinding: { kind: 'dataField', dataFieldId: id }, minTracks: 5, span: 5,
  settings: { layout: { grid: { columns: 20, columnStart: (index % 4) * 5 + 1, columnSpan: 5, rowStart: Math.floor(index / 4) + 1 } } }
})
const table = (id: string, title: string, columns: [string, string][]): FormSchemaTable => ({
  id, sectionId: 'purchase.grid.' + id, title: text(title), dataSourceId: 'synthetic.purchase.' + id,
  columns: columns.map(([key, label]) => ({ id: key, label: text(label), binding: { kind: 'dataField', dataFieldId: key } }))
})
export function purchaseInvoiceLaboratorySchema(): FormSchemaDraft {
  const header: [string, string, FormSchemaFieldKind][] = [
    ['internalNumber','شماره داخلی','text'], ['externalInvoiceNumber','شماره فاکتور خارجی','text'], ['invoiceDate','تاریخ فاکتور','date'], ['supplierId','تأمین‌کننده','select'],
    ['billOfLadingNumber','بارنامه','text'], ['buyerName','خریدار','text'], ['orderNumber','شماره سفارش مرجع','text'], ['originPort','مبدأ','text'],
    ['destinationPort','مقصد','text'], ['deliveryTerms','شرایط تحویل','text'], ['paymentTerms','شرایط پرداخت','text'], ['shipmentMethod','روش حمل','text'],
    ['internationalFreight','حمل خارجی','number'], ['otherForeignCosts','سایر هزینه خارجی','number']
  ]
  const details: [string, string, FormSchemaFieldKind][] = [
    ['comparisonStatus','فاکتور با سفارش تطبیق دارد','text'], ['comparisonNotes','مغایرت سفارش و فاکتور','textarea'],
    ['containerNumber','شماره کانتینر','text'], ['sealNumber','پلمب','text'], ['containerNetWeight','وزن خالص کانتینر','number'],
    ['documentType','نوع مدرک','select'], ['documentFile','مدرک خرید','file'], ['attachmentName','نام فایل پیوست','text'],
    ['warehouseId','انبار','select'], ['currency','ارز','select'], ['goodsTotal','جمع کالا','number'], ['grandTotal','جمع کل','number'], ['notes','توضیحات','textarea']
  ]
  const tables = [
    table('items','جزئیات فاکتور و گردش نخ', [['lineNumber','#'],['yarnItemId','نخ سیستم'],['originalDescription','شرح مدرک'],['orderedQuantity','مقدار سفارش'],['netWeight','وزن خالص فاکتور'],['grossWeight','وزن ناخالص'],['packageCount','بسته'],['unitPriceUSD','قیمت واحد'],['goodsAmountUSD','مبلغ'],['comparison','وضعیت تطبیق'],['remove','حذف ردیف']]),
    table('containers','جزئیات بسته‌بندی و کانتینر', [['containerNumber','شماره کانتینر'],['sealNumber','پلمب'],['netWeight','وزن خالص']]),
    table('attachments','مدارک خرید', [['originalFileName','نام فایل'],['documentType','نوع مدرک'],['fileSize','اندازه'],['download','دانلود'],['delete','حذف']]),
    table('orders','سفارش‌های ارجاع‌شده برای خرید نخ', [['orderNumber','شماره سفارش'],['orderDate','تاریخ'],['status','وضعیت'],['priority','اولویت'],['itemCount','ردیف'],['totalQuantity','مقدار']])
  ]
  return {
    id: purchaseInvoiceLaboratoryId, schemaVersion: 1, version: 1, status: 'draft', mode: 'operational', title: text('فاکتور خرید نخ — طرح مستقل'),
    layout: { direction: 'vertical', gap: 12 },
    sections: [{ id:'purchase.header', kind:'editor', title:text('خرید نخ') }, { id:'purchase.grid.items', kind:'grid' },
      { id:'purchase.details', kind:'editor', title:text('تطبیق، کانتینر و مدارک') },
      ...tables.slice(1).map(t => ({ id:t.sectionId!, kind:'grid' as const })), { id:'purchase.footer', kind:'footer' }],
    fields: [...header.map(([id,label,kind],i)=>field(id,label,kind,i,'purchase.header')), ...details.map(([id,label,kind],i)=>field(id,label,kind,i,'purchase.details'))],
    tables,
    actions: [['save','ثبت اطلاعات','F3'],['accept','پذیرش و شروع پیگیری',''],['createInvoice','ایجاد فاکتور خرید',''],['importExcel','استخراج Excel',''],['addLine','ردیف +',''],['addContainer','افزودن کانتینر',''],['upload','آپلود مدرک',''],['sendWarehouse','تأیید دریافت و ارسال به انبار','']].map(([id,label,code])=>({ id:'purchase.action.'+id, code:code || id, keys:code?[code]:[], label:text(label), sectionId:'purchase.footer' })),
    behaviorInstruction:'نمایش آزمایشگاهی با دادهٔ مصنوعی؛ عملیات خرید، بارگذاری مدرک و تطبیق اجرا نمی‌شود.'
  }
}
