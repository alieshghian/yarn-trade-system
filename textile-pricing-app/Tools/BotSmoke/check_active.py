import sqlite3
connection = sqlite3.connect('file:App_Data/pricing.db?mode=ro', uri=True)
count = connection.execute("SELECT COUNT(*) FROM RubikaDispatches WHERE Status IN ('queued','running')").fetchone()[0]
print('Active dispatches:', count)
raise SystemExit(0 if count == 0 else 1)
