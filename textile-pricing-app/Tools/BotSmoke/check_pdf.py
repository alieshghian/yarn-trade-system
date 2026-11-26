from pathlib import Path
from pypdf import PdfReader
from PIL import Image

root = Path(__file__).resolve().parents[2]
pdf = PdfReader(root / 'output/pdf/rubika-print-sample.pdf')
text = ''.join(page.extract_text() for page in pdf.pages)
assert len(pdf.pages) == 5
assert all(abs(float(page.mediabox.width) - 595.276) < 1 for page in pdf.pages)
assert all(text.count(f'T-{index:03}') == 1 for index in range(1, 81))
assert '٪' not in text and 'PRIVATE_CUSTOMER_NAME' not in text
# The document header and the four table header labels precede the first data row.
header = pdf.pages[0].extract_text().splitlines()[4:8]
assert all(page.extract_text().splitlines()[4:8] == header for page in pdf.pages)
sheet = Image.new('RGB', (1556, 1100), 'white')
for index in range(1, 6):
    image = Image.open(root / f'tmp/pdfs/rubika-columns-{index}.png').resize((389, 550))
    sheet.paste(image, (((index - 1) % 4) * 389, ((index - 1) // 4) * 550))
sheet.save(root / 'tmp/pdfs/rubika-columns-all.png')
print('PASS: A4, 80 unique codes, no percentages, repeated header on all 5 pages')
