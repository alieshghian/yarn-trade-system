"""Native A4 materials report; no browser, network, or account access."""
import json
import sys
from io import BytesIO
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, LongTable, TableStyle
from price_pdf import RtlText, rtl, fa


def render(document):
    fonts = Path(__file__).parent / 'fonts'
    pdfmetrics.registerFont(TTFont('Vazir', str(fonts / 'Vazirmatn-Regular.ttf')))
    pdfmetrics.registerFont(TTFont('VazirBold', str(fonts / 'Vazirmatn-Bold.ttf')))
    output = BytesIO()
    page_width, page_height = A4
    margin = 36
    width = page_width - 2 * margin
    company = document.get('companyName', '').strip()
    title = document['title']
    query = document.get('query', '').strip()
    query_text = RtlText('جست‌وجو: ' + query, 9) if query else None
    query_height = query_text.wrap(width, page_height)[1] if query_text else 0
    top_margin = 112 + query_height
    widths = [45, 68, 80, 92, 56, width - 373, 32]
    labels = ['', 'آخرین ویرایش', 'قیمت ریالی', 'قیمت', 'واحد', 'نام کالا / خدمت', 'ردیف']
    data = [[RtlText(label, 9, 'VazirBold', center=True) for label in labels]]
    for index, row in enumerate(document['rows'], 1):
        price = f"{row['price']:,.2f}" if row['currency'] == 'دلار' else f"{row['price']:,.0f}"
        data.append([
            '',
            RtlText(fa(row['lastEdited']), 8, center=True),
            RtlText(fa(f"{row['rialPrice']:,.0f}"), 9, center=True),
            RtlText(fa(price) + ' ' + row['currency'], 9, center=True),
            RtlText(row['measurementUnit'], 8, center=True),
            RtlText(row['name'], 9),
            RtlText(fa(index), 8, center=True),
        ])
    if not document['rows']:
        data.append(['', RtlText('موردی برای نمایش وجود ندارد.', 10, center=True)] + [''] * 5)
    table = LongTable(data, colWidths=widths, repeatRows=1, hAlign='CENTER')
    styles = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8edf1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#b8c2cb')),
    ]
    if not document['rows']:
        styles.append(('SPAN', (1, 1), (-1, 1)))
    table.setStyle(TableStyle(styles))

    def page_header(canvas, doc):
        canvas.saveState()
        def centered(text, size, y):
            shaped = rtl(text)
            measured = pdfmetrics.stringWidth(shaped, 'VazirBold', size)
            if measured > width:
                size *= width / measured
            canvas.setFont('VazirBold', size)
            canvas.drawCentredString(page_width / 2, y, shaped)
        centered(company or title, 17, page_height - 48)
        if company:
            centered(title, 12, page_height - 69)
        canvas.setFont('Vazir', 9)
        canvas.drawRightString(page_width - margin, page_height - 88, rtl('تاریخ گزارش: ' + fa(document['date'])))
        canvas.drawString(margin, page_height - 88, rtl('تعداد ردیف: ' + fa(len(document['rows']))))
        if query_text:
            query_text.drawOn(canvas, margin, page_height - 97 - query_height)
        canvas.setStrokeColor(colors.HexColor('#243447'))
        canvas.line(margin, page_height - top_margin + 10, page_width - margin, page_height - top_margin + 10)
        canvas.setStrokeColor(colors.HexColor('#b8c2cb'))
        canvas.line(margin, 40, page_width - margin, 40)
        canvas.setFont('Vazir', 8)
        canvas.drawCentredString(page_width / 2, 26, rtl('صفحه ' + fa(doc.page)))
        canvas.restoreState()

    doc = SimpleDocTemplate(output, pagesize=A4, leftMargin=margin, rightMargin=margin,
                            topMargin=top_margin, bottomMargin=52, title=title, author=company)
    doc.build([table], onFirstPage=page_header, onLaterPages=page_header)
    return output.getvalue()


if __name__ == '__main__':
    sys.stdout.buffer.write(render(json.load(sys.stdin)))
