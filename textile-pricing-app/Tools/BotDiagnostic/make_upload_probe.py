from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader

root = Path(__file__).resolve().parents[2]
output = root / 'tmp/pdfs/rubika-upload-probe.pdf'
output.parent.mkdir(parents=True, exist_ok=True)
document = canvas.Canvas(str(output), pagesize=A4)
document.setTitle('Upload test')
document.setAuthor('Diagnostic')
document.setFont('Helvetica', 18)
document.drawString(60, 760, 'Upload test')
document.setFont('Helvetica', 11)
document.drawString(60, 730, 'Synthetic diagnostic document. No customer data or prices.')
document.showPage()
document.save()
pdf = PdfReader(output)
assert len(pdf.pages) == 1
assert 'Upload test' in pdf.pages[0].extract_text()
print('Synthetic PDF validated:', output.stat().st_size, 'bytes')
