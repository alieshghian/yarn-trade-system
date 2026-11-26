from pathlib import Path
import sqlite3
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[2]
with sqlite3.connect(f"file:{root / 'App_Data/pricing.db'}?mode=ro", uri=True) as source:
    active = source.execute("SELECT COUNT(*) FROM RubikaDispatches WHERE Status IN ('queued','running')").fetchone()[0]
    if active:
        raise RuntimeError("Active sends: do not restart")
    target = root / 'App_Data/backups' / ('before-shared-assignments-' + datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S') + '.db')
    target.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(target) as backup:
        source.backup(backup)
    print('Database backup:', target)
    print('Active sends:', active)
