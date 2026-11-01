"""Alberta adopted permanent UTC-6 on 2026-11-01; old host tzdata needs a narrow fallback.
Historical instants still use IANA rules. Explicit device offsets remain authoritative.
https://www.alberta.ca/albertas-new-time-system-abt
"""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

ALBERTA_START = datetime(2026, 11, 1, 6, tzinfo=timezone.utc).timestamp()


def zone_at(name: str, timestamp: float):
    if name in ("America/Edmonton", "Canada/Mountain") and timestamp >= ALBERTA_START:
        return timezone(timedelta(hours=-6))
    return ZoneInfo(name)
