"""Money and quantity helpers.

Money is stored as integer paise and exposed as rupees with at most 2 decimals.
Every conversion rounds half-up to the paisa; quantities round half-up to 3 decimals.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

_HUNDRED = Decimal(100)
_ONE = Decimal(1)
_QTY_STEP = Decimal("0.001")

Number = int | float | Decimal | str


def _decimal(value: Number) -> Decimal:
    # str() first so binary float noise (e.g. 1.005) is not carried into the rounding.
    return value if isinstance(value, Decimal) else Decimal(str(value))


def to_paise(rupees: Number) -> int:
    return int((_decimal(rupees) * _HUNDRED).quantize(_ONE, rounding=ROUND_HALF_UP))


def to_rupees(paise: int) -> float:
    return float(Decimal(int(paise)) / _HUNDRED)


def optional_rupees(paise: int | None) -> float | None:
    return None if paise is None else to_rupees(paise)


def round_qty(quantity: Number) -> float:
    rounded = float(_decimal(quantity).quantize(_QTY_STEP, rounding=ROUND_HALF_UP))
    return 0.0 if rounded == 0 else rounded  # normalise -0.0


def multiply_paise(quantity: Number, unit_paise: int) -> int:
    """round(quantity * unit price) in paise, half-up."""
    return int((_decimal(quantity) * Decimal(int(unit_paise))).quantize(_ONE, rounding=ROUND_HALF_UP))


def divide_paise(total_paise: int, count: int) -> int:
    """total / count rounded half-up to the paisa (0 when count is 0)."""
    if count == 0:
        return 0
    return int((Decimal(int(total_paise)) / Decimal(count)).quantize(_ONE, rounding=ROUND_HALF_UP))


def _group_indian(integer_digits: str) -> str:
    if len(integer_digits) <= 3:
        return integer_digits
    head, tail = integer_digits[:-3], integer_digits[-3:]
    groups: list[str] = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return ",".join(groups + [tail])


def format_inr(paise: int) -> str:
    """'₹18,450', '₹92.50', '₹1,23,456' — decimals only when non-zero (matches the UI)."""
    sign = "-" if paise < 0 else ""
    rupees, remainder = divmod(abs(int(paise)), 100)
    text = _group_indian(str(rupees))
    if remainder:
        text += f".{remainder:02d}"
    return f"{sign}₹{text}"


def format_plain_amount(paise: int) -> str:
    """Two-decimal amount without symbol or grouping, for CSV exports."""
    sign = "-" if paise < 0 else ""
    rupees, remainder = divmod(abs(int(paise)), 100)
    return f"{sign}{rupees}.{remainder:02d}"


def format_qty(quantity: float) -> str:
    text = f"{round_qty(quantity):.3f}".rstrip("0").rstrip(".")
    return text or "0"
