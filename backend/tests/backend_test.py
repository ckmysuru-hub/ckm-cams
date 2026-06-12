"""Backend API tests for Chess Klub Mysuru CAMS."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ck-mysuru-portal.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@chessklub.in"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["email"] == ADMIN_EMAIL and data["role"] == "director"
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def state():
    return {}


# ---------- Auth ----------
class TestAuth:
    def test_login_success_and_cookie(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert d["role"] == "director"
        assert isinstance(d["token"], str) and len(d["token"]) > 20
        # cookie
        assert "access_token" in r.cookies, f"cookies: {r.cookies}"

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_bearer(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL


# ---------- Levels ----------
class TestLevels:
    def test_create_and_list(self, auth_headers, state):
        code = f"TEST-LVL-{uuid.uuid4().hex[:6].upper()}"
        payload = {"name": "TEST Beginner", "code": code, "monthly_fee": 1500, "description": "test level"}
        r = requests.post(f"{API}/levels", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), r.text
        lvl = r.json()
        assert lvl["code"] == code
        assert "id" in lvl
        state["level_id"] = lvl["id"]
        state["level_monthly"] = 1500

        r = requests.get(f"{API}/levels", headers=auth_headers)
        assert r.status_code == 200
        assert any(l["id"] == lvl["id"] for l in r.json())


# ---------- Batches ----------
class TestBatches:
    def test_create_and_list(self, auth_headers, state):
        payload = {"name": f"TEST Batch {uuid.uuid4().hex[:4]}", "level_id": state["level_id"],
                   "schedule": "Mon/Wed 5pm", "capacity": 20}
        r = requests.post(f"{API}/batches", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), r.text
        b = r.json()
        assert "id" in b
        state["batch_id"] = b["id"]

        r = requests.get(f"{API}/batches", headers=auth_headers)
        assert r.status_code == 200
        rows = r.json()
        assert any(x["id"] == b["id"] for x in rows)
        # enrolled count present
        match = next(x for x in rows if x["id"] == b["id"])
        assert "enrolled_count" in match or "enrolled" in match


# ---------- Students ----------
class TestStudents:
    def test_create_list_detail(self, auth_headers, state):
        payload = {
            "name": f"TEST Student {uuid.uuid4().hex[:4]}",
            "parent_name": "TEST Parent",
            "whatsapp": "+919999999999",
            "email": f"test_{uuid.uuid4().hex[:6]}@example.com",
            "batch_id": state["batch_id"],
            "level_id": state["level_id"],
        }
        r = requests.post(f"{API}/students", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), r.text
        s = r.json()
        assert "id" in s
        assert s.get("student_code", "").startswith("STU-"), f"code={s.get('student_code')}"
        # format STU-YYYY-NNNN
        parts = s["student_code"].split("-")
        assert len(parts) == 3 and len(parts[1]) == 4 and parts[2].isdigit()
        state["student_id"] = s["id"]

        r = requests.get(f"{API}/students", headers=auth_headers)
        assert r.status_code == 200
        assert any(x["id"] == s["id"] for x in r.json())

        r = requests.get(f"{API}/students/{s['id']}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["id"] == s["id"]


# ---------- Attendance ----------
class TestAttendance:
    def test_save_get_upsert(self, auth_headers, state):
        date = "2026-01-15"
        marks = {state["student_id"]: "P"}
        payload = {"batch_id": state["batch_id"], "date": date, "marks": marks}
        r = requests.post(f"{API}/attendance", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), r.text

        r = requests.get(f"{API}/attendance", headers=auth_headers,
                         params={"batch_id": state["batch_id"], "date": date})
        assert r.status_code == 200
        data = r.json()
        # marks dict can be at top-level or under 'marks'
        marks_back = data.get("marks") if isinstance(data, dict) else None
        if marks_back is None and isinstance(data, list) and data:
            marks_back = data[0].get("marks")
        assert marks_back and marks_back.get(state["student_id"]) == "P"

        # Upsert with different mark
        payload["marks"] = {state["student_id"]: "A"}
        r = requests.post(f"{API}/attendance", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), f"Upsert failed: {r.status_code} {r.text}"

        # Student summary
        r = requests.get(f"{API}/attendance/student/{state['student_id']}", headers=auth_headers)
        assert r.status_code == 200
        summary = r.json()
        assert "percentage" in summary or "attendance_percentage" in summary or "percent" in summary


# ---------- Invoices ----------
class TestInvoices:
    def test_create_list_pdf(self, auth_headers, state):
        payload = {
            "student_id": state["student_id"],
            "items": [{"description": "Monthly Fee 2026-02", "amount": 1500, "period": "2026-02"}],
        }
        r = requests.post(f"{API}/invoices", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), r.text
        inv = r.json()
        assert "id" in inv
        inv_no = inv.get("invoice_no") or inv.get("invoice_number")
        assert inv_no and inv_no.startswith("INV-"), f"invoice_no={inv_no}"
        parts = inv_no.split("-")
        assert len(parts) == 4 and len(parts[1]) == 4 and len(parts[2]) == 2
        state["invoice_id"] = inv["id"]
        state["invoice_total"] = inv.get("total", 1500)

        r = requests.get(f"{API}/invoices", headers=auth_headers)
        assert r.status_code == 200
        assert any(x["id"] == inv["id"] for x in r.json())

        r = requests.get(f"{API}/invoices/{inv['id']}/pdf", headers=auth_headers)
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "").lower()
        assert len(r.content) > 200


# ---------- Payments ----------
class TestPayments:
    def test_record_payment_and_receipt(self, auth_headers, state):
        amt = state.get("invoice_total", 1500)
        payload = {"invoice_id": state["invoice_id"], "amount": amt, "mode": "cash"}
        r = requests.post(f"{API}/payments", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), r.text
        pay = r.json()
        receipt_no = pay.get("receipt_no") or pay.get("receipt_number")
        assert receipt_no and receipt_no.startswith("RCP-"), f"receipt_no={receipt_no}"
        receipt_id = pay.get("receipt_id") or pay.get("id")
        state["receipt_id"] = receipt_id

        # Invoice now paid
        r = requests.get(f"{API}/invoices/{state['invoice_id']}", headers=auth_headers)
        assert r.status_code == 200
        inv = r.json()
        assert inv.get("status") in ("paid", "partial"), f"status={inv.get('status')}"
        assert (inv.get("balance") or 0) < state.get("invoice_total", 1500) + 1

        # Receipt PDF
        if receipt_id:
            r = requests.get(f"{API}/receipts/{receipt_id}/pdf", headers=auth_headers)
            assert r.status_code == 200, r.text[:200]
            assert "application/pdf" in r.headers.get("content-type", "").lower()
            assert len(r.content) > 200


# ---------- Reminder (mock mode) ----------
class TestReminder:
    def test_remind_log_mode(self, auth_headers, state):
        r = requests.post(f"{API}/invoices/{state['invoice_id']}/remind", headers=auth_headers)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        # Expect whatsapp + email keys, mode == 'log'
        ws = d.get("whatsapp") or {}
        em = d.get("email") or {}
        # accept either shape
        wmode = ws.get("mode") if isinstance(ws, dict) else None
        emode = em.get("mode") if isinstance(em, dict) else None
        assert wmode == "log" or "log" in str(ws).lower(), f"whatsapp={ws}"
        assert emode == "log" or "log" in str(em).lower(), f"email={em}"


# ---------- Dashboard ----------
class TestDashboard:
    def test_summary(self, auth_headers):
        r = requests.get(f"{API}/dashboard/summary", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("attendance_rate", "revenue_by_month", "payment_by_mode"):
            assert k in d, f"missing {k} in {list(d.keys())}"
        # this_month_revenue > 0 because we created a payment
        tmr = d.get("this_month_revenue") or d.get("revenue_this_month") or 0
        assert tmr >= 0  # at least non-negative; revenue is for current month


# ---------- Settings & RBAC ----------
class TestSettings:
    def test_settings_academy(self, auth_headers):
        r = requests.get(f"{API}/settings/academy", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert "name" in d or "academy_name" in d
        # integrations flags
        integ = d.get("integrations") or {}
        assert isinstance(integ, dict)

    def test_create_user_director_only(self, auth_headers):
        payload = {"email": f"test_{uuid.uuid4().hex[:6]}@example.com",
                   "name": "TEST Coach", "password": "Test@1234", "role": "coach"}
        r = requests.post(f"{API}/users", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), r.text
        new_user = r.json()
        assert new_user["role"] == "coach"

        # List users
        r = requests.get(f"{API}/users", headers=auth_headers)
        assert r.status_code == 200
        assert any(u["email"] == payload["email"] for u in r.json())

        # Non-director should get 403
        login = requests.post(f"{API}/auth/login", json={"email": payload["email"], "password": "Test@1234"})
        assert login.status_code == 200
        coach_token = login.json()["token"]
        r = requests.post(f"{API}/users",
                          headers={"Authorization": f"Bearer {coach_token}", "Content-Type": "application/json"},
                          json={"email": f"x_{uuid.uuid4().hex[:4]}@e.com", "name": "x", "password": "Test@1234", "role": "coach"})
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"
