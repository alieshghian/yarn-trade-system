import type { ExcelGridColumn, GridValue } from './excelGrid'

type WorkbookOptions<Row> = { title: string; language: 'fa' | 'en' | 'zh'; columns: readonly ExcelGridColumn<Row>[]; rows: readonly Row[] }
type WorkbookCell = { value: GridValue; style?: number; type?: 'text' | 'number' | 'boolean' }

const encoder = new TextEncoder()
const xml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const columnName = (index: number) => { let value = index + 1, name = ''; while (value) { const remainder = (value - 1) % 26; name = String.fromCharCode(65 + remainder) + name; value = Math.floor((value - 1) / 26) } return name }
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => { let crc = value; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; return crc >>> 0 })
const crc32 = (data: Uint8Array) => { let crc = 0xffffffff; for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0 }
const dosDateTime = (date: Date) => ({ time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() })
function zipStore(files: readonly [string, string][]): Blob {
  const local: Uint8Array[] = [], central: Uint8Array[] = []
  let offset = 0
  const now = dosDateTime(new Date())
  const word = (view: DataView, at: number, value: number) => view.setUint16(at, value, true)
  const dword = (view: DataView, at: number, value: number) => view.setUint32(at, value >>> 0, true)
  for (const [path, source] of files) {
    const name = encoder.encode(path), body = encoder.encode(source), crc = crc32(body)
    const localHeader = new Uint8Array(30 + name.length), localView = new DataView(localHeader.buffer)
    dword(localView, 0, 0x04034b50); word(localView, 4, 20); word(localView, 6, 0x0800); word(localView, 8, 0); word(localView, 10, now.time); word(localView, 12, now.date); dword(localView, 14, crc); dword(localView, 18, body.length); dword(localView, 22, body.length); word(localView, 26, name.length); word(localView, 28, 0); localHeader.set(name, 30)
    local.push(localHeader, body)
    const directory = new Uint8Array(46 + name.length), directoryView = new DataView(directory.buffer)
    dword(directoryView, 0, 0x02014b50); word(directoryView, 4, 20); word(directoryView, 6, 20); word(directoryView, 8, 0x0800); word(directoryView, 10, 0); word(directoryView, 12, now.time); word(directoryView, 14, now.date); dword(directoryView, 16, crc); dword(directoryView, 20, body.length); dword(directoryView, 24, body.length); word(directoryView, 28, name.length); word(directoryView, 30, 0); word(directoryView, 32, 0); word(directoryView, 34, 0); word(directoryView, 36, 0); dword(directoryView, 38, 0); dword(directoryView, 42, offset); directory.set(name, 46)
    central.push(directory)
    offset += localHeader.length + body.length
  }
  const directorySize = central.reduce((size, part) => size + part.length, 0), end = new Uint8Array(22), endView = new DataView(end.buffer)
  dword(endView, 0, 0x06054b50); word(endView, 4, 0); word(endView, 6, 0); word(endView, 8, files.length); word(endView, 10, files.length); dword(endView, 12, directorySize); dword(endView, 16, offset); word(endView, 20, 0)
  const parts = [...local, ...central, end]
  const output = new Uint8Array(new ArrayBuffer(parts.reduce((size, part) => size + part.length, 0)))
  let cursor = 0
  for (const part of parts) { output.set(part, cursor); cursor += part.length }
  return new Blob([output.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function cellXml(cell: WorkbookCell, reference: string): string {
  const style = cell.style === undefined ? '' : ` s="${cell.style}"`
  if (cell.value === null || cell.value === undefined || cell.value === '') return `<c r="${reference}"${style}/>`
  if (cell.type === 'number' && typeof cell.value === 'number' && Number.isFinite(cell.value)) return `<c r="${reference}"${style}><v>${cell.value}</v></c>`
  if (cell.type === 'boolean' && typeof cell.value === 'boolean') return `<c r="${reference}"${style} t="b"><v>${cell.value ? 1 : 0}</v></c>`
  const value = cell.value instanceof Date ? cell.value.toISOString() : String(cell.value)
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
}

export function downloadGridWorkbook<Row>({ title, language, columns, rows }: WorkbookOptions<Row>): void {
  if (!columns.length) return
  const lastColumn = columnName(columns.length - 1), lastRow = rows.length + 2
  const header = columns.map((column, index) => cellXml({ value: column.label, style: 2 }, `${columnName(index)}2`)).join('')
  const data = rows.map((row, rowIndex) => `<row r="${rowIndex + 3}" ht="22" customHeight="1">${columns.map((column, columnIndex) => cellXml({ value: column.value(row), type: column.type === 'date' ? 'text' : column.type, style: rowIndex % 2 ? 4 : 3 }, `${columnName(columnIndex)}${rowIndex + 3}`)).join('')}</row>`).join('')
  const titleCell = cellXml({ value: title || (language === 'fa' ? 'گزارش جدول' : 'Table report'), style: 1 }, 'A1')
  const cols = columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.max(10, Math.min(54, Math.round((column.width || 120) / 7)))}" customWidth="1"/>`).join('')
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"${language === 'fa' ? ' rightToLeft="1"' : ''}><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>${cols}</cols><sheetData><row r="1" ht="30" customHeight="1">${titleCell}</row><row r="2" ht="26" customHeight="1">${header}</row>${data}</sheetData><autoFilter ref="A2:${lastColumn}${Math.max(2, lastRow)}"/>${columns.length > 1 ? `<mergeCells count="1"><mergeCell ref="A1:${lastColumn}1"/></mergeCells>` : ''}</worksheet>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><color rgb="FF18332F"/><name val="Aptos"/></font><font><b/><sz val="15"/><color rgb="FF18332F"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF3F0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF347D70"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F7F5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD6E1DE"/></left><right style="thin"><color rgb="FFD6E1DE"/></right><top style="thin"><color rgb="FFD6E1DE"/></top><bottom style="thin"><color rgb="FFD6E1DE"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1" horizontal="right"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  const blob = zipStore([['[Content_Types].xml', contentTypes], ['_rels/.rels', rootRels], ['xl/workbook.xml', workbook], ['xl/_rels/workbook.xml.rels', workbookRels], ['xl/styles.xml', styles], ['xl/worksheets/sheet1.xml', sheet]])
  const safeTitle = (title || 'table').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().slice(0, 72) || 'table'
  const anchor = document.createElement('a'), url = URL.createObjectURL(blob)
  anchor.href = url; anchor.download = `${safeTitle}-${new Date().toISOString().slice(0, 10)}.xlsx`; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
