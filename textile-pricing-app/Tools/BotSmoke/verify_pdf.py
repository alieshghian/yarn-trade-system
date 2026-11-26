import sys
from pathlib import Path
root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'RubikaBridge'))
from price_pdf import render

document = {'customerId': 1, 'companyName': 'شرکت نمونه نساجی', 'customerName': 'PRIVATE_CUSTOMER_NAME',
            'date': '1405/07/12', 'isVatExempt': False,
            'rows': [{'productCode': f'T-{i:03}', 'productName': 'پارچه نمونه با کیفیت - طرح ساده',
                      'price': 1234500 + i * 1000, 'changePercent': [None, 20, -5, 0][i % 4]} for i in range(1, 81)]}
output = root / 'output/pdf/rubika-print-sample.pdf'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(render(document))
print(output)
