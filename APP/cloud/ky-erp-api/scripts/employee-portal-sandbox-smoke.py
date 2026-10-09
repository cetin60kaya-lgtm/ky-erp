#!/usr/bin/env python3
"""KY ERP personnel / device / production D1 preflight.

Independent SQLITE IN-MEMORY sandbox. Never opens remote D1, performs deploys,
or reads live personnel. Run from APP/cloud/ky-erp-api with Python 3.
"""
from __future__ import annotations

import hashlib
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "migrations" / "0060_employee_portal_access.sql"
API = ROOT / "src" / "employee-portal-cloud.ts"
PRODUCTION = ROOT / "src" / "production-runtime-v2.ts"

def sandbox() -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    # Only pre-existing foreign-key parent from production is represented.
    db.execute("CREATE TABLE auth_users (id TEXT PRIMARY KEY, role TEXT NOT NULL)")
    db.executemany("INSERT INTO auth_users VALUES (?,?)", [
        ("person-a", "PERSONNEL"),
        ("person-b", "PERSONNEL"),
        ("approver", "COMPANY_ADMIN"),
    ])
    db.executescript(MIGRATION.read_text(encoding="utf-8"))
    return db

def account(db: sqlite3.Connection, uid: str, tenant: str, employee: str,
            username: str) -> None:
    db.execute(
        """INSERT INTO ky_employee_portal_accounts
        (id,main_company_slug,employee_id,auth_user_id,username_local,
         occupation,machine_id,created_by_user_id,created_at,updated_at)
        VALUES (?,?,?,?,?,'PERSONEL','',?,'2026-10-09','2026-10-09')""",
        (f"account-{uid}", tenant, employee, uid, username, "approver"),
    )

def device(db: sqlite3.Connection, uid: str, tenant: str, dev: str,
           kind: str = "MOBILE", status: str = "PENDING") -> None:
    db.execute(
        """INSERT INTO ky_employee_portal_devices
        (id,main_company_slug,account_user_id,kind,label,public_key_jwk,
         status,created_at,updated_at) VALUES (?,?,?,?,?,'{}',?,'now','now')""",
        (dev, tenant, uid, kind, "Test device", status),
    )

class PortalSchemaSmoke(unittest.TestCase):
    def setUp(self) -> None:
        self.db = sandbox()
    def tearDown(self) -> None:
        self.db.close()

    def test_all_four_sandbox_tables_exist(self):
        rows = self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        found = {row[0] for row in rows}
        expected = {"ky_employee_portal_accounts", "ky_employee_portal_devices",
                    "ky_employee_portal_approvers", "ky_employee_portal_nonces"}
        self.assertTrue(expected.issubset(found))
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))
        self.assertTrue(expected.issubset({
            x[0] for x in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }))

    def test_account_name_and_person_are_unique_inside_tenant(self):
        account(self.db, "person-a", "firma-a", "ik-a", "cuma")
        account(self.db, "person-b", "firma-b", "ik-b", "cuma")
        with self.assertRaises(sqlite3.IntegrityError):
            account(self.db, "approver", "firma-a", "ik-other", "cuma")
        with self.assertRaises(sqlite3.IntegrityError):
            account(self.db, "approver", "firma-a", "ik-a", "newname")
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM ky_employee_portal_accounts"
        ).fetchone()[0], 2)

    def test_device_is_pending_by_default_and_fails_closed(self):
        account(self.db, "person-a", "firma-a", "ik-a", "cuma")
        device(self.db, "person-a", "firma-a", "phone")
        self.assertEqual(self.db.execute(
            "SELECT status FROM ky_employee_portal_devices WHERE id='phone'"
        ).fetchone()[0], "PENDING")
        for kind in ("ROOT", "", "SERVER"):
            with self.subTest(kind=kind), self.assertRaises(sqlite3.IntegrityError):
                device(self.db, "person-a", "firma-a", "bad-" + kind, kind=kind)
        with self.assertRaises(sqlite3.IntegrityError):
            device(self.db, "person-a", "firma-a", "bad-status", status="TRUSTED")
        with self.assertRaises(sqlite3.IntegrityError):
            device(self.db, "missing-user", "firma-a", "fake")

    def test_account_and_device_approvals_are_independent(self):
        account(self.db, "person-a", "firma-a", "ik-a", "cuma")
        device(self.db, "person-a", "firma-a", "phone")
        self.db.execute("""UPDATE ky_employee_portal_devices
          SET status='APPROVED',approved_by_user_id='approver'
          WHERE id='phone' AND status='PENDING'""")
        active = self.db.execute(
            "SELECT activated_at FROM ky_employee_portal_accounts WHERE auth_user_id='person-a'"
        ).fetchone()[0]
        self.assertIsNone(active, "Device alone must not activate personnel account")
        self.db.execute("""UPDATE ky_employee_portal_accounts
          SET activated_at='now',approved_by_user_id='approver'
          WHERE auth_user_id='person-a'""")
        self.assertEqual(self.db.execute(
            "SELECT status FROM ky_employee_portal_devices WHERE id='phone'"
        ).fetchone()[0], "APPROVED")

    def test_revoke_and_nonce_replay_constraints(self):
        account(self.db, "person-a", "firma-a", "ik-a", "cuma")
        device(self.db, "person-a", "firma-a", "phone", status="APPROVED")
        self.db.execute("""UPDATE ky_employee_portal_devices SET
          status='REVOKED', revoked_at='now' WHERE id='phone' AND status='APPROVED'""")
        self.assertIsNone(self.db.execute("""SELECT id FROM ky_employee_portal_devices
          WHERE id='phone' AND status='APPROVED' AND revoked_at IS NULL""").fetchone())
        sql = "INSERT OR IGNORE INTO ky_employee_portal_nonces VALUES (?,?,?)"
        self.db.execute(sql, ("same-nonce", "phone", "later"))
        first = self.db.total_changes
        self.db.execute(sql, ("same-nonce", "phone", "later"))
        self.assertEqual(self.db.total_changes, first)
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM ky_employee_portal_nonces"
        ).fetchone()[0], 1)

    def test_approvers_are_tenant_scoped(self):
        self.db.execute("""INSERT INTO ky_employee_portal_approvers
          VALUES ('firma-a','approver','approver','now')""")
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM ky_employee_portal_approvers WHERE main_company_slug=?",
            ("firma-b",),
        ).fetchone()[0], 0)
        self.db.execute("""DELETE FROM ky_employee_portal_approvers
          WHERE main_company_slug=? AND user_id=?""", ("firma-a", "approver"))
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM ky_employee_portal_approvers"
        ).fetchone()[0], 0)

    def test_production_write_and_model_link_roll_back_together(self):
        # Same two canonical tables and a single transaction, no live production data.
        self.db.executescript("""
          CREATE TABLE production_records (
            id TEXT PRIMARY KEY, main_company_slug TEXT NOT NULL,
            model_id TEXT NOT NULL, total_quantity INTEGER NOT NULL
          );
          CREATE TABLE model_production_links (
            id TEXT PRIMARY KEY, main_company_slug TEXT NOT NULL,
            model_id TEXT NOT NULL, production_record_id TEXT NOT NULL
                REFERENCES production_records(id)
          );
        """)
        expected = hashlib.sha256(
            b"firma-a|person-a|phone|11111111-1111-4111-8111-111111111111"
        ).hexdigest()[:48]
        record_id = "personnel-" + expected
        with self.db:
            self.db.execute(
                "INSERT INTO production_records VALUES (?,?,?,?)",
                (record_id, "firma-a", "model-1", 100),
            )
            self.db.execute(
                "INSERT INTO model_production_links VALUES (?,?,?,?)",
                ("link-1", "firma-a", "model-1", record_id),
            )
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:
                self.db.execute(
                    "INSERT INTO production_records VALUES (?,?,?,?)",
                    (record_id, "firma-a", "model-1", 100),
                )
                self.db.execute(
                    "INSERT INTO model_production_links VALUES (?,?,?,?)",
                    ("link-2", "firma-a", "model-1", record_id),
                )
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM production_records"
        ).fetchone()[0], 1)
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM model_production_links"
        ).fetchone()[0], 1)
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:
                self.db.execute(
                    "INSERT INTO production_records VALUES (?,?,?,?)",
                    ("second", "firma-a", "model-1", 60),
                )
                self.db.execute(
                    "INSERT INTO model_production_links VALUES (?,?,?,?)",
                    ("link-1", "firma-a", "model-1", "second"),
                )
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM production_records"
        ).fetchone()[0], 1)

    def test_real_route_implementation_has_guardrails(self):
        api = API.read_text(encoding="utf-8")
        production = PRODUCTION.read_text(encoding="utf-8")
        self.assertIn("PERSONNEL_ACCOUNT_REQUIRED", api)
        self.assertIn("PERSONNEL_DEVICE_REQUIRED", api)
        self.assertIn("crypto.subtle.verify", api)
        self.assertIn("PERSONNEL_APPROVER_REVOKED", api)
        self.assertIn("activated_at IS NULL", api)
        self.assertIn("auditStatement(", api)
        self.assertIn("requestId", production)
        self.assertIn("await c.env.DB.batch([insertRecord,insertLink])", production)

if __name__ == "__main__":
    print("KY ERP isolated employee portal sandbox; no production access")
    unittest.main(verbosity=2)
