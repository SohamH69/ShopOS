"""Time helpers. Datetimes are stored in UTC; "today" and date filters use IST.

India has no daylight saving time, so IST is a fixed +05:30 offset (no zoneinfo).
"""

from __future__ import annotations

import threading
from datetime import date, datetime, time, timedelta, timezone

from app.errors import BadRequest

UTC = timezone.utc
IST = timezone(timedelta(hours=5, minutes=30), "IST")

# SQLite date() modifier that turns a stored UTC timestamp into the IST calendar date.
IST_SQLITE_MODIFIER = "+330 minutes"

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


_clock_lock = threading.Lock()
_last_now: datetime | None = None


def now_utc() -> datetime:
    """The current UTC time, strictly increasing within this process.

    Some clocks tick coarsely (Windows: every 1-16 ms), so two requests in a row could be
    stamped with the same instant and their order lost, for example a payment and the next
    order in a customer's khata. Each call returns at least 1 microsecond after the last.
    """
    global _last_now
    current = datetime.now(UTC)
    with _clock_lock:
        if _last_now is not None and current <= _last_now:
            current = _last_now + timedelta(microseconds=1)
        _last_now = current
    return current


def as_utc(value: datetime) -> datetime:
    """Aware datetime in UTC. Naive values are treated as UTC (as stored in the DB)."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def from_client(value: datetime | None) -> datetime | None:
    """Normalise a datetime sent by a client. Naive values are read as IST wall time.

    The result must be representable both in UTC (storage) and in IST (display, exports);
    instants at the very edge of the calendar (year 1 or 9999) are rejected with a 400.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=IST)
    try:
        utc = value.astimezone(UTC)
        utc.astimezone(IST)
    except OverflowError as exc:
        raise BadRequest("Enter a real date and time.") from exc
    return utc


def ist_date(value: datetime) -> date:
    return as_utc(value).astimezone(IST).date()


def today_ist(now: datetime | None = None) -> date:
    return ist_date(now or now_utc())


def ist_day_start(day: date) -> datetime:
    """UTC instant at which the IST calendar day ``day`` begins."""
    return datetime.combine(day, time.min, tzinfo=IST).astimezone(UTC)


def ist_at(day: date, hour: int, minute: int = 0) -> datetime:
    """UTC instant for a wall-clock time in IST on ``day``."""
    return datetime.combine(day, time(hour, minute), tzinfo=IST).astimezone(UTC)


def ist_day_bounds(day: date) -> tuple[datetime, datetime]:
    """[start, end) of an IST calendar day, as UTC datetimes."""
    start = ist_day_start(day)
    return start, start + timedelta(days=1)


def ist_range_bounds(
    date_from: date | None, date_to: date | None
) -> tuple[datetime | None, datetime | None]:
    """Inclusive IST date filter → half-open UTC bounds [start, end); None means unbounded.

    The first and last days of the calendar (0001-01-01, 9999-12-31) can't be shifted to
    UTC or past midnight. Every stored timestamp lies inside them, so they mean "no bound".
    """
    start: datetime | None = None
    end: datetime | None = None
    if date_from is not None:
        try:
            start = ist_day_start(date_from)
        except OverflowError:
            start = None
    if date_to is not None:
        try:
            end = ist_day_start(date_to + timedelta(days=1))
        except OverflowError:
            end = None
    return start, end


def month_start(day: date) -> date:
    return day.replace(day=1)


def add_months(day: date, months: int) -> date:
    """First-of-month arithmetic (``day`` must be the 1st)."""
    index = day.year * 12 + (day.month - 1) + months
    return date(index // 12, index % 12 + 1, 1)


def week_start(day: date) -> date:
    """Monday of the week containing ``day``."""
    return day - timedelta(days=day.weekday())


def short_day_label(day: date) -> str:
    return f"{day.day} {_MONTHS[day.month - 1]}"


def month_label(day: date) -> str:
    return f"{_MONTHS[day.month - 1]} {day.year}"


def format_ist(value: datetime | None) -> str:
    """'2026-10-04 15:05' in IST, for CSV exports."""
    if value is None:
        return ""
    return as_utc(value).astimezone(IST).strftime("%Y-%m-%d %H:%M")
