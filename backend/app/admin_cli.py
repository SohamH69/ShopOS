"""Create and manage ShopOS admin accounts (the people who can open /admin).

There is deliberately no sign-up page and no default admin: run this on the server.

    python -m app.admin_cli create --email you@example.com --name "Your Name"
    python -m app.admin_cli password --email you@example.com
    python -m app.admin_cli disable --email you@example.com
    python -m app.admin_cli list

(run from backend/). The password is asked for interactively; pass ``--password`` only in scripts.
"""

from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import select

from app.db import SessionLocal, init_database
from app.errors import AppError
from app.models import Admin
from app.services import admin as admin_service


def _password(given: str | None) -> str:
    if given:
        return given
    first = getpass.getpass("Password (at least 8 characters): ")
    if getpass.getpass("Type it again: ") != first:
        raise SystemExit("The passwords don't match.")
    return first


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.admin_cli", description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create", help="create an admin account")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--password", help="for scripts only; prompted for when left out")
    password = commands.add_parser("password", help="set a new password (signs out every session)")
    password.add_argument("--email", required=True)
    password.add_argument("--password")
    for name, text in (("disable", "turn an admin account off"), ("enable", "turn it back on")):
        command = commands.add_parser(name, help=text)
        command.add_argument("--email", required=True)
    commands.add_parser("list", help="list admin accounts")
    args = parser.parse_args(argv)

    init_database()
    with SessionLocal() as db:
        try:
            if args.command == "list":
                for admin in db.scalars(select(Admin).order_by(Admin.id)):
                    state = "active" if admin.is_active else "disabled"
                    print(f"{admin.id:>4}  {admin.email:<40} {admin.name:<30} {state}")
                return 0
            if args.command == "create":
                admin = admin_service.create_admin(
                    db, email=args.email, name=args.name, password=_password(args.password)
                )
                db.commit()
                print(f"Created admin {admin.email}. Sign in at /admin.")
                return 0
            admin = db.scalar(select(Admin).where(Admin.email == args.email.strip().lower()))
            if admin is None:
                print(f"No admin with the email {args.email}.", file=sys.stderr)
                return 1
            if args.command == "password":
                admin_service.set_password(db, admin, _password(args.password))
                print(f"Password changed for {admin.email}; their sessions are signed out.")
            else:
                admin.is_active = args.command == "enable"
                admin.token_version += 1
                print(f"{admin.email} is now {'active' if admin.is_active else 'disabled'}.")
            db.commit()
            return 0
        except AppError as exc:
            print(exc.detail, file=sys.stderr)
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
