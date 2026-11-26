"""Print-friendly Persian price list. Generates bytes only; no network or authentication."""
from io import BytesIO
from pathlib import Path
import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, LongTable, TableStyle, Flowable


def fa(value):
    return str(value).translate(str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹'))


def rtl(value):
    return get_display(arabic_reshaper.reshape(str(value)), base_dir='R')


class RtlText(Flowable):
    def __init__(self, text, size=10, font='Vazir', color=colors.black, center=False):
        super().__init__()
        self.text, self.size, self.font, self.color, self.center = str(text), size, font, color, center

    def wrap(self, width, height):
        self.width = width
        self.lines = []
        for paragraph in self.text.split('\n'):
            line = ''
            for word in paragraph.split():
                candidate = (line + ' ' + word).strip()
                if pdfmetrics.stringWidth(rtl(candidate), self.font, self.size) <= width:
                    line = candidate
                else:
                    if line:
                        self.lines.append(line)
                        line = ''
                    for char in word:
                        if pdfmetrics.stringWidth(rtl(line + char), self.font, self.size) > width and line:
                            self.lines.append(line)
                            line = ''
                        line += char
            self.lines.append(line)
        self.height = max(1, len(self.lines)) * (self.size + 6)
        return self.width, self.height

    def draw(self):
        self.canv.setFont(self.font, self.size)
        self.canv.setFillColor(self.color)
        for index, line in enumerate(self.lines):
            y = self.height - self.size - index * (self.size + 6)
            if self.center:
                self.canv.drawCentredString(self.width / 2, y, rtl(line))
            else:
                self.canv.drawRightString(self.width, y, rtl(line))


def render(document):
    font_dir = Path(__file__).parent / 'fonts'
    pdfmetrics.registerFont(TTFont('Vazir', str(font_dir / 'Vazirmatn-Regular.ttf')))
    pdfmetrics.registerFont(TTFont('VazirBold', str(font_dir / 'Vazirmatn-Bold.ttf')))
    output = BytesIO()
    page_width, page_height = A4
    margin = 36
    width = page_width - 2 * margin
    table_header = [RtlText(label, 10, 'VazirBold', colors.black, True)
                    for label in ('قیمت (تومان)', 'کالا', 'کد کالا', 'ردیف')]
    data = [table_header]
    for index, row in enumerate(document['rows'], 1):
        data.append([RtlText(fa(f"{row['price']:,.0f}"), 11, 'VazirBold', center=True),
                     RtlText(row['productName'], 10),
                     RtlText(row['productCode'], 10, center=True), RtlText(fa(index), 10, center=True)])
    table = LongTable(data, colWidths=[117, width - 254, 95, 42], repeatRows=1, hAlign='RIGHT')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eeeeee')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#aaaaaa')),
    ]))

    def page_header(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(colors.black)
        # Fixed headers wrap at word boundaries; validation limits their lengths in the app.
        def header_line(text, font, size, y):
            shaped = rtl(text)
            measured = pdfmetrics.stringWidth(shaped, font, size)
            if measured > width - 36:
                size *= (width - 36) / measured
            canvas.setFont(font, size)
            canvas.drawCentredString(page_width / 2, y, shaped)
        header_line(document['companyName'], 'VazirBold', 17, page_height - 53)
        canvas.setFont('Vazir', 10)
        canvas.drawString(margin, page_height - 78, rtl('تاریخ: ' + fa(document['date'])))
        canvas.setFont('VazirBold', 11)
        canvas.drawRightString(page_width - margin, page_height - 78, rtl('فهرست قیمت'))
        canvas.setStrokeColor(colors.HexColor('#aaaaaa'))
        canvas.line(margin, page_height - 92, page_width - margin, page_height - 92)
        canvas.line(margin, 43, page_width - margin, 43)
        canvas.setFont('Vazir', 8)
        canvas.setFillColor(colors.black)
        canvas.drawString(margin, 28, rtl('صفحه ' + fa(doc.page)))
        canvas.restoreState()

    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=margin, leftMargin=margin,
                            topMargin=108, bottomMargin=58,
                            title='Price list', author=document['companyName'])
    doc.build([table], onFirstPage=page_header, onLaterPages=page_header)
    return output.getvalue()
