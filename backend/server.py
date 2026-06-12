from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Literal

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.pdfgen import canvas as rl_canvas

import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr

# ---------------------------- Setup ----------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Chess Klub Mysuru CAMS")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("cams")

JWT_ALGO = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
ROLES = ["director", "ops_manager", "coach", "front_desk", "finance"]

# ---------------------------- Helpers ----------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {"sub": user_id, "email": email, "role": role,
               "exp": now_utc() + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def serialize_doc(doc: dict) -> dict:
    if not doc:
        return doc
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    return doc

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(401, "User not found")
        user = serialize_doc(user)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

def require_role(*allowed: str):
    async def _dep(user: dict = Depends(get_current_user)):
        if user.get("role") not in allowed and user.get("role") != "director":
            raise HTTPException(403, "Insufficient permissions")
        return user
    return _dep

# ---------------------------- Models ----------------------------
class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str

class StudentIn(BaseModel):
    full_name: str
    dob: Optional[str] = None
    gender: Optional[str] = None
    photo_url: Optional[str] = None
    parent_name: str
    parent_whatsapp: str
    parent_email: Optional[EmailStr] = None
    address: Optional[str] = ""
    level_id: Optional[str] = None
    batch_id: Optional[str] = None
    enrollment_date: Optional[str] = None
    payment_plan: Optional[str] = "monthly"  # monthly | quarterly | annual
    concession_pct: Optional[float] = 0
    referred_by: Optional[str] = ""
    status: Optional[str] = "active"

class BatchIn(BaseModel):
    name: str
    level_id: Optional[str] = None
    coach_id: Optional[str] = None
    schedule_days: List[str] = []
    session_time: Optional[str] = None
    venue: Optional[str] = None
    max_capacity: int = 20
    status: str = "active"

class LevelIn(BaseModel):
    name: str
    code: str
    program: Optional[str] = "Standard"
    duration_months: int = 3
    sessions_per_week: int = 2
    curriculum: Optional[str] = ""
    admission_fee: float = 0
    monthly_fee: float = 0
    quarterly_fee: float = 0
    annual_fee: float = 0
    exam_fee: float = 0
    material_fee: float = 0
    late_penalty: float = 0
    status: str = "active"

class AttendanceMark(BaseModel):
    status: Literal["P", "A", "L", "LT", "H"]

class AttendanceSessionIn(BaseModel):
    batch_id: str
    session_date: str  # YYYY-MM-DD
    marks: dict  # {student_id: "P"|"A"|"L"|"LT"|"H"}

class InvoiceItem(BaseModel):
    description: str
    amount: float

class InvoiceIn(BaseModel):
    student_id: str
    period: str  # e.g. "2026-02" or "2026-Q1"
    due_date: str  # YYYY-MM-DD
    items: List[InvoiceItem]
    notes: Optional[str] = ""

class PaymentIn(BaseModel):
    invoice_id: str
    amount: float
    mode: Literal["cash", "upi", "bank_transfer", "card", "razorpay"]
    transaction_ref: Optional[str] = ""
    received_by: Optional[str] = None
    paid_at: Optional[str] = None

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: str

# ---------------------------- Startup ----------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.students.create_index("student_code", unique=True, sparse=True)
    await db.invoices.create_index("invoice_no", unique=True, sparse=True)
    await db.receipts.create_index("receipt_no", unique=True, sparse=True)
    await db.attendance.create_index([("batch_id", 1), ("session_date", 1)], unique=True)
    await db.counters.create_index("key", unique=True)
    # seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@chessklub.in")
    admin_pw = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    admin_name = os.environ.get("ADMIN_NAME", "Director")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_pw),
            "name": admin_name,
            "role": "director",
            "created_at": iso(now_utc()),
        })
        logger.info(f"Seeded admin {admin_email}")
    elif not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one({"_id": existing["_id"]},
                                  {"$set": {"password_hash": hash_password(admin_pw)}})

@app.on_event("shutdown")
async def shutdown():
    client.close()

# ---------------------------- Counters / IDs ----------------------------
async def next_counter(key: str) -> int:
    doc = await db.counters.find_one_and_update(
        {"key": key}, {"$inc": {"value": 1}},
        upsert=True, return_document=True,
    )
    return doc["value"]

async def gen_student_code() -> str:
    n = await next_counter(f"student-{datetime.now().year}")
    return f"STU-{datetime.now().year}-{n:04d}"

async def gen_invoice_no() -> str:
    today = datetime.now()
    n = await next_counter(f"invoice-{today.year}-{today.month:02d}")
    return f"INV-{today.year}-{today.month:02d}-{n:04d}"

async def gen_receipt_no() -> str:
    today = datetime.now()
    n = await next_counter(f"receipt-{today.year}-{today.month:02d}")
    return f"RCP-{today.year}-{today.month:02d}-{n:04d}"

# ---------------------------- Notifications ----------------------------
def send_whatsapp(to_phone: str, message: str) -> dict:
    """Send a WhatsApp message via Meta Cloud API (free-form text).
    NOTE: Free-form messages only work within the 24-hour customer-care window.
    For first-contact messages, an approved utility template is required.
    Falls back to log-only mode when credentials are missing."""
    token = os.environ.get("WHATSAPP_TOKEN")
    phone_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
    version = os.environ.get("WHATSAPP_GRAPH_VERSION", "v21.0")
    if not (token and phone_id):
        logger.info(f"[WHATSAPP MOCK] to={to_phone} msg={message[:200]}")
        return {"sent": False, "mode": "log", "to": to_phone}
    # Normalize phone: strip +, spaces, dashes
    to_norm = (to_phone or "").replace("+", "").replace(" ", "").replace("-", "")
    url = f"https://graph.facebook.com/{version}/{phone_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_norm,
        "type": "text",
        "text": {"body": message[:4096]},
    }
    try:
        r = requests.post(url, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }, json=payload, timeout=15)
        ok = r.ok
        data = {}
        try:
            data = r.json()
        except Exception:
            data = {"raw": r.text}
        if not ok:
            logger.warning(f"WhatsApp send failed [{r.status_code}]: {data}")
        return {"sent": ok, "mode": "meta_cloud", "status": r.status_code, "response": data}
    except Exception as e:
        logger.warning(f"WhatsApp send exception: {e}")
        return {"sent": False, "mode": "error", "error": str(e)}


def send_whatsapp_template(to_phone: str, template_name: str, language_code: str,
                           body_params: List[str]) -> dict:
    """Send an approved WhatsApp template message (works outside the 24h window)."""
    token = os.environ.get("WHATSAPP_TOKEN")
    phone_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
    version = os.environ.get("WHATSAPP_GRAPH_VERSION", "v21.0")
    if not (token and phone_id):
        logger.info(f"[WHATSAPP MOCK TMPL] to={to_phone} tpl={template_name} params={body_params}")
        return {"sent": False, "mode": "log", "to": to_phone}
    to_norm = (to_phone or "").replace("+", "").replace(" ", "").replace("-", "")
    url = f"https://graph.facebook.com/{version}/{phone_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_norm,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
            "components": [{"type": "body",
                            "parameters": [{"type": "text", "text": str(p)} for p in body_params]}],
        },
    }
    try:
        r = requests.post(url, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }, json=payload, timeout=15)
        ok = r.ok
        try:
            data = r.json()
        except Exception:
            data = {"raw": r.text}
        if not ok:
            logger.warning(f"WhatsApp template send failed [{r.status_code}]: {data}")
        return {"sent": ok, "mode": "meta_cloud_template", "status": r.status_code, "response": data}
    except Exception as e:
        logger.warning(f"WhatsApp template send exception: {e}")
        return {"sent": False, "mode": "error", "error": str(e)}


def send_email(to_email: str, subject: str, html: str) -> dict:
    """Send an email via Gmail SMTP using an App Password.
    Falls back to log-only mode when credentials are missing."""
    if not to_email:
        return {"sent": False, "mode": "log", "reason": "no recipient"}
    gmail_user = os.environ.get("GMAIL_USER")
    gmail_pass = os.environ.get("GMAIL_APP_PASSWORD")
    if not (gmail_user and gmail_pass):
        logger.info(f"[EMAIL MOCK] to={to_email} subj={subject}")
        return {"sent": False, "mode": "log", "to": to_email}
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = formataddr((os.environ.get("ACADEMY_NAME", "Chess Klub Mysuru"), gmail_user))
        msg["To"] = to_email
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as server:
            server.login(gmail_user, gmail_pass.replace(" ", ""))
            server.sendmail(gmail_user, [to_email], msg.as_string())
        return {"sent": True, "mode": "gmail_smtp", "to": to_email}
    except Exception as e:
        logger.warning(f"Gmail SMTP send failed: {e}")
        return {"sent": False, "mode": "error", "error": str(e)}

# ---------------------------- Auth Endpoints ----------------------------
@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_access_token(str(user["_id"]), email, user["role"])
    response.set_cookie("access_token", token, httponly=True, secure=False, samesite="lax",
                        max_age=12 * 3600, path="/")
    return {"id": str(user["_id"]), "email": email, "name": user["name"], "role": user["role"],
            "token": token}

@api.post("/auth/logout")
async def logout(response: Response, _: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ---------------------------- Users (Admin only) ----------------------------
@api.get("/users")
async def list_users(_: dict = Depends(require_role("director"))):
    users = await db.users.find({}, {"password_hash": 0}).to_list(500)
    return [serialize_doc(u) for u in users]

@api.post("/users")
async def create_user(payload: UserCreate, _: dict = Depends(require_role("director"))):
    if payload.role not in ROLES:
        raise HTTPException(400, "Invalid role")
    if await db.users.find_one({"email": payload.email.lower()}):
        raise HTTPException(400, "Email already exists")
    doc = {"email": payload.email.lower(), "name": payload.name, "role": payload.role,
           "password_hash": hash_password(payload.password), "created_at": iso(now_utc())}
    res = await db.users.insert_one(doc)
    return serialize_doc({**doc, "_id": res.inserted_id, "password_hash": None})

@api.delete("/users/{uid}")
async def delete_user(uid: str, _: dict = Depends(require_role("director"))):
    await db.users.delete_one({"_id": ObjectId(uid)})
    return {"ok": True}

# ---------------------------- Levels ----------------------------
@api.get("/levels")
async def list_levels(user: dict = Depends(get_current_user)):
    items = await db.levels.find().sort("created_at", 1).to_list(500)
    return [serialize_doc(x) for x in items]

@api.post("/levels")
async def create_level(payload: LevelIn, _: dict = Depends(require_role("ops_manager", "finance"))):
    doc = payload.model_dump()
    doc["created_at"] = iso(now_utc())
    res = await db.levels.insert_one(doc)
    return serialize_doc({**doc, "_id": res.inserted_id})

@api.put("/levels/{lid}")
async def update_level(lid: str, payload: LevelIn, _: dict = Depends(require_role("ops_manager", "finance"))):
    await db.levels.update_one({"_id": ObjectId(lid)}, {"$set": payload.model_dump()})
    doc = await db.levels.find_one({"_id": ObjectId(lid)})
    return serialize_doc(doc)

@api.delete("/levels/{lid}")
async def delete_level(lid: str, _: dict = Depends(require_role("ops_manager"))):
    await db.levels.delete_one({"_id": ObjectId(lid)})
    return {"ok": True}

# ---------------------------- Batches ----------------------------
@api.get("/batches")
async def list_batches(user: dict = Depends(get_current_user)):
    items = await db.batches.find().sort("created_at", -1).to_list(500)
    pipeline = [
        {"$match": {"status": "active"}},
        {"$group": {"_id": "$batch_id", "count": {"$sum": 1}}},
    ]
    enrolled_map = {doc["_id"]: doc["count"] async for doc in db.students.aggregate(pipeline)}
    out = []
    for b in items:
        sd = serialize_doc(b)
        sd["enrolled"] = enrolled_map.get(sd["id"], 0)
        out.append(sd)
    return out

@api.post("/batches")
async def create_batch(payload: BatchIn, _: dict = Depends(require_role("ops_manager"))):
    doc = payload.model_dump()
    doc["created_at"] = iso(now_utc())
    res = await db.batches.insert_one(doc)
    return serialize_doc({**doc, "_id": res.inserted_id})

@api.put("/batches/{bid}")
async def update_batch(bid: str, payload: BatchIn, _: dict = Depends(require_role("ops_manager"))):
    await db.batches.update_one({"_id": ObjectId(bid)}, {"$set": payload.model_dump()})
    return serialize_doc(await db.batches.find_one({"_id": ObjectId(bid)}))

@api.delete("/batches/{bid}")
async def delete_batch(bid: str, _: dict = Depends(require_role("ops_manager"))):
    await db.batches.delete_one({"_id": ObjectId(bid)})
    return {"ok": True}

@api.get("/batches/{bid}/students")
async def batch_students(bid: str, user: dict = Depends(get_current_user)):
    students = await db.students.find({"batch_id": bid}).sort("full_name", 1).to_list(1000)
    return [serialize_doc(s) for s in students]

# ---------------------------- Students ----------------------------
@api.get("/students")
async def list_students(q: Optional[str] = None, batch_id: Optional[str] = None,
                        status: Optional[str] = None, user: dict = Depends(get_current_user)):
    flt = {}
    if q:
        flt["full_name"] = {"$regex": q, "$options": "i"}
    if batch_id:
        flt["batch_id"] = batch_id
    if status:
        flt["status"] = status
    students = await db.students.find(flt).sort("created_at", -1).to_list(1000)
    return [serialize_doc(s) for s in students]

@api.post("/students")
async def create_student(payload: StudentIn, user: dict = Depends(require_role("ops_manager", "front_desk"))):
    doc = payload.model_dump()
    doc["student_code"] = await gen_student_code()
    doc["created_at"] = iso(now_utc())
    doc["created_by"] = user["id"]
    if not doc.get("enrollment_date"):
        doc["enrollment_date"] = date.today().isoformat()
    res = await db.students.insert_one(doc)
    saved = serialize_doc({**doc, "_id": res.inserted_id})
    # send welcome
    if saved.get("parent_whatsapp"):
        send_whatsapp(saved["parent_whatsapp"],
                      f"Welcome to {os.environ.get('ACADEMY_NAME')}! {saved['full_name']} has been enrolled. Student ID: {saved['student_code']}")
    if saved.get("parent_email"):
        send_email(saved["parent_email"], f"Welcome to {os.environ.get('ACADEMY_NAME')}",
                   f"<p>Dear Parent,</p><p>Your child <b>{saved['full_name']}</b> has been enrolled. Student ID: <b>{saved['student_code']}</b>.</p>")
    return saved

@api.get("/students/{sid}")
async def get_student(sid: str, user: dict = Depends(get_current_user)):
    s = await db.students.find_one({"_id": ObjectId(sid)})
    if not s:
        raise HTTPException(404, "Student not found")
    return serialize_doc(s)

@api.put("/students/{sid}")
async def update_student(sid: str, payload: StudentIn, _: dict = Depends(require_role("ops_manager", "front_desk"))):
    await db.students.update_one({"_id": ObjectId(sid)}, {"$set": payload.model_dump()})
    return serialize_doc(await db.students.find_one({"_id": ObjectId(sid)}))

@api.delete("/students/{sid}")
async def delete_student(sid: str, _: dict = Depends(require_role("ops_manager"))):
    await db.students.delete_one({"_id": ObjectId(sid)})
    return {"ok": True}

# ---------------------------- Attendance ----------------------------
@api.post("/attendance")
async def save_attendance(payload: AttendanceSessionIn, user: dict = Depends(require_role("coach", "ops_manager", "front_desk"))):
    doc = {
        "batch_id": payload.batch_id,
        "session_date": payload.session_date,
        "marks": payload.marks,
        "marked_by": user["id"],
        "updated_at": iso(now_utc()),
    }
    await db.attendance.update_one(
        {"batch_id": payload.batch_id, "session_date": payload.session_date},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}

@api.get("/attendance")
async def get_attendance(batch_id: str, session_date: str, user: dict = Depends(get_current_user)):
    doc = await db.attendance.find_one({"batch_id": batch_id, "session_date": session_date})
    return serialize_doc(doc) if doc else {"batch_id": batch_id, "session_date": session_date, "marks": {}}

@api.get("/attendance/student/{sid}")
async def student_attendance(sid: str, user: dict = Depends(get_current_user)):
    student = await db.students.find_one({"_id": ObjectId(sid)})
    if not student:
        raise HTTPException(404, "Student not found")
    batch_id = student.get("batch_id")
    sessions = await db.attendance.find({"batch_id": batch_id}).sort("session_date", -1).limit(100).to_list(100)
    history = []
    counts = {"P": 0, "A": 0, "L": 0, "LT": 0, "H": 0}
    for s in sessions:
        st = s.get("marks", {}).get(sid)
        if st:
            counts[st] = counts.get(st, 0) + 1
            history.append({"date": s["session_date"], "status": st})
    total_sessions = sum(counts[k] for k in ["P", "A", "L", "LT"])
    pct = round((counts["P"] + counts["LT"]) / total_sessions * 100, 1) if total_sessions else 0
    return {"counts": counts, "history": history, "percentage": pct}

# ---------------------------- Invoices & Payments ----------------------------
async def _build_invoice_doc(payload: InvoiceIn, user: dict) -> dict:
    student = await db.students.find_one({"_id": ObjectId(payload.student_id)})
    if not student:
        raise HTTPException(404, "Student not found")
    total = round(sum(i.amount for i in payload.items), 2)
    inv = {
        "invoice_no": await gen_invoice_no(),
        "student_id": payload.student_id,
        "student_code": student.get("student_code"),
        "student_name": student.get("full_name"),
        "parent_whatsapp": student.get("parent_whatsapp"),
        "parent_email": student.get("parent_email"),
        "period": payload.period,
        "due_date": payload.due_date,
        "items": [i.model_dump() for i in payload.items],
        "amount": total,
        "paid": 0.0,
        "balance": total,
        "status": "pending",
        "notes": payload.notes or "",
        "issued_at": iso(now_utc()),
        "issued_by": user["id"],
    }
    return inv

@api.get("/invoices")
async def list_invoices(student_id: Optional[str] = None, status: Optional[str] = None,
                        user: dict = Depends(get_current_user)):
    flt = {}
    if student_id: flt["student_id"] = student_id
    if status: flt["status"] = status
    items = await db.invoices.find(flt).sort("issued_at", -1).to_list(1000)
    return [serialize_doc(x) for x in items]

@api.post("/invoices")
async def create_invoice(payload: InvoiceIn, user: dict = Depends(require_role("finance", "ops_manager", "front_desk"))):
    inv = await _build_invoice_doc(payload, user)
    res = await db.invoices.insert_one(inv)
    saved = serialize_doc({**inv, "_id": res.inserted_id})
    if saved.get("parent_whatsapp"):
        send_whatsapp(saved["parent_whatsapp"],
                      f"Invoice {saved['invoice_no']} for {saved['student_name']} - Amount: Rs.{saved['amount']:.2f}. Due: {saved['due_date']}.")
    return saved

@api.get("/invoices/{iid}")
async def get_invoice(iid: str, user: dict = Depends(get_current_user)):
    inv = await db.invoices.find_one({"_id": ObjectId(iid)})
    if not inv: raise HTTPException(404, "Invoice not found")
    return serialize_doc(inv)

@api.delete("/invoices/{iid}")
async def delete_invoice(iid: str, _: dict = Depends(require_role("finance", "ops_manager"))):
    await db.invoices.delete_one({"_id": ObjectId(iid)})
    return {"ok": True}

@api.post("/invoices/{iid}/remind")
async def remind_invoice(iid: str, user: dict = Depends(require_role("finance", "ops_manager", "front_desk"))):
    inv = await db.invoices.find_one({"_id": ObjectId(iid)})
    if not inv: raise HTTPException(404, "Invoice not found")
    wa_result = email_result = None
    msg = f"Reminder: Invoice {inv['invoice_no']} for {inv['student_name']} - Rs.{inv['balance']:.2f} due on {inv['due_date']}."
    if inv.get("parent_whatsapp"):
        wa_result = send_whatsapp(inv["parent_whatsapp"], msg)
    if inv.get("parent_email"):
        email_result = send_email(inv["parent_email"], f"Payment Reminder - {inv['invoice_no']}", f"<p>{msg}</p>")
    return {"whatsapp": wa_result, "email": email_result}

@api.post("/payments")
async def record_payment(payload: PaymentIn, user: dict = Depends(require_role("finance", "ops_manager", "front_desk"))):
    inv = await db.invoices.find_one({"_id": ObjectId(payload.invoice_id)})
    if not inv: raise HTTPException(404, "Invoice not found")
    if payload.amount <= 0:
        raise HTTPException(400, "Amount must be > 0")
    new_paid = round(float(inv.get("paid", 0)) + float(payload.amount), 2)
    new_balance = round(float(inv["amount"]) - new_paid, 2)
    status = "paid" if new_balance <= 0.01 else "partial"
    receipt_no = await gen_receipt_no()
    receipt = {
        "receipt_no": receipt_no,
        "invoice_id": payload.invoice_id,
        "invoice_no": inv["invoice_no"],
        "student_id": inv["student_id"],
        "student_code": inv.get("student_code"),
        "student_name": inv.get("student_name"),
        "period": inv.get("period"),
        "amount": payload.amount,
        "mode": payload.mode,
        "transaction_ref": payload.transaction_ref or "",
        "previous_balance": float(inv["balance"]),
        "remaining_balance": new_balance,
        "received_by": payload.received_by or user.get("name"),
        "paid_at": payload.paid_at or iso(now_utc()),
        "created_at": iso(now_utc()),
    }
    r = await db.receipts.insert_one(receipt)
    await db.invoices.update_one({"_id": ObjectId(payload.invoice_id)},
                                 {"$set": {"paid": new_paid, "balance": new_balance, "status": status}})
    saved = serialize_doc({**receipt, "_id": r.inserted_id})
    if inv.get("parent_whatsapp"):
        send_whatsapp(inv["parent_whatsapp"],
                      f"Payment received: Rs.{payload.amount:.2f} for {inv['student_name']}. Receipt: {receipt_no}.")
    if inv.get("parent_email"):
        send_email(inv["parent_email"], f"Payment Receipt {receipt_no}",
                   f"<p>Thank you. We have received Rs.{payload.amount:.2f} towards invoice {inv['invoice_no']}.</p>")
    return saved

@api.get("/receipts")
async def list_receipts(student_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    flt = {}
    if student_id: flt["student_id"] = student_id
    items = await db.receipts.find(flt).sort("created_at", -1).to_list(1000)
    return [serialize_doc(x) for x in items]

@api.get("/receipts/{rid}")
async def get_receipt(rid: str, user: dict = Depends(get_current_user)):
    r = await db.receipts.find_one({"_id": ObjectId(rid)})
    if not r: raise HTTPException(404, "Receipt not found")
    return serialize_doc(r)

# ---------------------------- PDF Generation ----------------------------
ORANGE = colors.HexColor("#F45B2A")
BLACK = colors.HexColor("#0F0F10")
GRAY = colors.HexColor("#5b5b5b")
LIGHT = colors.HexColor("#f4f4f5")

_LOGO_CACHE = {"bytes": None, "fetched": False}

def fetch_logo_bytes() -> Optional[bytes]:
    if _LOGO_CACHE["fetched"]:
        return _LOGO_CACHE["bytes"]
    url = os.environ.get("LOGO_URL")
    if not url:
        _LOGO_CACHE["fetched"] = True
        return None
    try:
        r = requests.get(url, timeout=10)
        if r.ok:
            _LOGO_CACHE["bytes"] = r.content
    except Exception as e:
        logger.warning(f"logo fetch failed: {e}")
    _LOGO_CACHE["fetched"] = True
    return _LOGO_CACHE["bytes"]

def _academy_block():
    return [
        os.environ.get("ACADEMY_NAME", "Chess Klub Mysuru"),
        os.environ.get("ACADEMY_ADDRESS", ""),
        f"Phone: {os.environ.get('ACADEMY_PHONE', '')}",
        f"Email: {os.environ.get('ACADEMY_EMAIL', '')}",
    ]

def _build_pdf(title: str, doc_no: str, doc_date: str, student_lines: List[str],
               rows: List[List[str]], totals: List[List[str]], footer_lines: List[str]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    elements = []

    # Header
    logo_bytes = fetch_logo_bytes()
    header_cells = [["", ""]]
    if logo_bytes:
        try:
            img = Image(io.BytesIO(logo_bytes), width=22 * mm, height=22 * mm)
            header_cells = [[img, ""]]
        except Exception:
            pass
    academy = _academy_block()
    right_para = Paragraph(
        f"<para align='right'><b>{academy[0]}</b><br/>{academy[1]}<br/>{academy[2]}<br/>{academy[3]}</para>",
        ParagraphStyle('right', fontSize=9, leading=12),
    )
    header_cells[0][1] = right_para
    htable = Table(header_cells, colWidths=[30 * mm, 150 * mm])
    htable.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    elements.append(htable)
    elements.append(Spacer(1, 6))

    # Orange band
    band = Table([[" "]], colWidths=[180 * mm], rowHeights=[3])
    band.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ORANGE)]))
    elements.append(band)
    elements.append(Spacer(1, 8))

    # Title block
    title_tbl = Table([[Paragraph(f"<b>{title}</b>", ParagraphStyle('t', fontSize=18, leading=22, textColor=BLACK)),
                        Paragraph(f"<para align='right'><b>No:</b> {doc_no}<br/><b>Date:</b> {doc_date}</para>",
                                  ParagraphStyle('r', fontSize=10, leading=14))]],
                      colWidths=[90 * mm, 90 * mm])
    elements.append(title_tbl)
    elements.append(Spacer(1, 8))

    # Student info
    bill_to = Paragraph("<b>Billed To</b>", ParagraphStyle('bt', fontSize=10, leading=13, textColor=ORANGE))
    elements.append(bill_to)
    for line in student_lines:
        elements.append(Paragraph(line, ParagraphStyle('s', fontSize=10, leading=13)))
    elements.append(Spacer(1, 10))

    # Items
    table_data = [["Description", "Amount (INR)"]] + rows
    t = Table(table_data, colWidths=[130 * mm, 50 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLACK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.4, GRAY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 6))

    # Totals
    tot = Table(totals, colWidths=[130 * mm, 50 * mm])
    tot.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, -1), (-1, -1), ORANGE),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, BLACK),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(tot)
    elements.append(Spacer(1, 16))

    # Footer
    for line in footer_lines:
        elements.append(Paragraph(line, ParagraphStyle('f', fontSize=9, leading=12, textColor=GRAY)))

    doc.build(elements)
    buf.seek(0)
    return buf.read()

@api.get("/invoices/{iid}/pdf")
async def invoice_pdf(iid: str, user: dict = Depends(get_current_user)):
    inv = await db.invoices.find_one({"_id": ObjectId(iid)})
    if not inv: raise HTTPException(404, "Invoice not found")
    rows = [[i["description"], f"{i['amount']:.2f}"] for i in inv["items"]]
    totals = [
        ["Subtotal", f"INR {inv['amount']:.2f}"],
        ["Paid", f"INR {inv.get('paid', 0):.2f}"],
        ["Balance Due", f"INR {inv['balance']:.2f}"],
    ]
    student_lines = [
        f"<b>{inv.get('student_name')}</b> ({inv.get('student_code')})",
        f"Period: {inv.get('period')}",
        f"Due Date: {inv.get('due_date')}",
    ]
    footer = [
        "This is a computer-generated invoice.",
        "For queries, contact the academy office.",
    ]
    pdf = _build_pdf("INVOICE", inv["invoice_no"], inv["issued_at"][:10], student_lines, rows, totals, footer)
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{inv["invoice_no"]}.pdf"'})

@api.get("/receipts/{rid}/pdf")
async def receipt_pdf(rid: str, user: dict = Depends(get_current_user)):
    r = await db.receipts.find_one({"_id": ObjectId(rid)})
    if not r: raise HTTPException(404, "Receipt not found")
    rows = [
        [f"Payment for invoice {r['invoice_no']} ({r.get('period')})", f"{r['amount']:.2f}"],
    ]
    totals = [
        ["Previous Balance", f"INR {r['previous_balance']:.2f}"],
        ["Amount Paid", f"INR {r['amount']:.2f}"],
        ["Remaining Balance", f"INR {r['remaining_balance']:.2f}"],
    ]
    student_lines = [
        f"<b>{r.get('student_name')}</b> ({r.get('student_code')})",
        f"Mode: {r['mode'].upper()}{' - Ref: ' + r['transaction_ref'] if r.get('transaction_ref') else ''}",
        f"Received By: {r.get('received_by', '')}",
    ]
    footer = [
        "Thank you for your payment.",
        "This is a computer-generated receipt.",
    ]
    pdf = _build_pdf("PAYMENT RECEIPT", r["receipt_no"], r["created_at"][:10], student_lines, rows, totals, footer)
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{r["receipt_no"]}.pdf"'})

# ---------------------------- Dashboard ----------------------------
@api.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_current_user)):
    today = datetime.now()
    month_start = today.replace(day=1).strftime("%Y-%m")
    active_students = await db.students.count_documents({"status": "active"})
    total_students = await db.students.count_documents({})
    new_this_month = await db.students.count_documents({"enrollment_date": {"$gte": f"{month_start}-01"}})
    pending_invoices = await db.invoices.find(
        {"status": {"$in": ["pending", "partial"]}},
        {"balance": 1, "due_date": 1, "invoice_no": 1, "student_name": 1, "status": 1},
    ).to_list(2000)
    pending_amount = round(sum(float(i["balance"]) for i in pending_invoices), 2)
    overdue = [i for i in pending_invoices if i.get("due_date", "9999") < today.strftime("%Y-%m-%d")]
    overdue_amount = round(sum(float(i["balance"]) for i in overdue), 2)

    # monthly collection — last 12 months only
    cutoff_iso = (today - timedelta(days=370)).isoformat()
    receipts = await db.receipts.find(
        {"created_at": {"$gte": cutoff_iso}},
        {"created_at": 1, "amount": 1, "mode": 1},
    ).to_list(5000)
    by_month = {}
    by_mode = {}
    for r in receipts:
        m = (r.get("created_at") or "")[:7]
        by_month[m] = round(by_month.get(m, 0) + float(r["amount"]), 2)
        mode = r.get("mode", "cash")
        by_mode[mode] = round(by_mode.get(mode, 0) + float(r["amount"]), 2)

    this_month_revenue = by_month.get(today.strftime("%Y-%m"), 0)

    # attendance rate last 30 days
    cutoff = (today - timedelta(days=30)).strftime("%Y-%m-%d")
    sessions = await db.attendance.find({"session_date": {"$gte": cutoff}}, {"marks": 1}).to_list(2000)
    p_count = a_count = 0
    for s in sessions:
        for st in (s.get("marks") or {}).values():
            if st == "P" or st == "LT": p_count += 1
            elif st == "A": a_count += 1
    attendance_rate = round((p_count / (p_count + a_count)) * 100, 1) if (p_count + a_count) else 0

    return {
        "active_students": active_students,
        "total_students": total_students,
        "new_this_month": new_this_month,
        "pending_amount": pending_amount,
        "overdue_amount": overdue_amount,
        "overdue_count": len(overdue),
        "this_month_revenue": this_month_revenue,
        "attendance_rate": attendance_rate,
        "revenue_by_month": dict(sorted(by_month.items())[-6:]),
        "payment_by_mode": by_mode,
    }

@api.get("/dashboard/pending")
async def dashboard_pending(user: dict = Depends(get_current_user)):
    items = await db.invoices.find({"status": {"$in": ["pending", "partial"]}}).sort("due_date", 1).to_list(500)
    today = datetime.now().strftime("%Y-%m-%d")
    out = []
    for i in items:
        d = serialize_doc(i)
        d["days_overdue"] = max(0, (datetime.fromisoformat(today) - datetime.fromisoformat(d["due_date"])).days) if d.get("due_date") else 0
        out.append(d)
    return out

# ---------------------------- Settings ----------------------------
@api.get("/settings/academy")
async def get_academy(user: dict = Depends(get_current_user)):
    return {
        "name": os.environ.get("ACADEMY_NAME"),
        "address": os.environ.get("ACADEMY_ADDRESS"),
        "phone": os.environ.get("ACADEMY_PHONE"),
        "email": os.environ.get("ACADEMY_EMAIL"),
        "gstin": os.environ.get("ACADEMY_GSTIN"),
        "logo_url": os.environ.get("LOGO_URL"),
        "integrations": {
            "whatsapp_enabled": bool(os.environ.get("WHATSAPP_TOKEN") and os.environ.get("WHATSAPP_PHONE_NUMBER_ID")),
            "email_enabled": bool(os.environ.get("GMAIL_USER") and os.environ.get("GMAIL_APP_PASSWORD")),
        },
    }

# ---------------------------- WhatsApp Webhook ----------------------------
@api.get("/whatsapp/webhook")
async def whatsapp_webhook_verify(request: Request):
    """Verify endpoint for Meta to confirm webhook ownership."""
    qp = request.query_params
    mode = qp.get("hub.mode")
    token = qp.get("hub.verify_token")
    challenge = qp.get("hub.challenge")
    expected = os.environ.get("WHATSAPP_VERIFY_TOKEN")
    if mode == "subscribe" and token and expected and token == expected:
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(challenge or "")
    raise HTTPException(403, "Webhook verification failed")

@api.post("/whatsapp/webhook")
async def whatsapp_webhook_incoming(request: Request):
    """Handle incoming WhatsApp events (messages, statuses).
    Stores inbound messages in db.whatsapp_events for future inbox view."""
    body = await request.json()
    try:
        await db.whatsapp_events.insert_one({
            "received_at": iso(now_utc()),
            "payload": body,
        })
    except Exception as e:
        logger.warning(f"failed to persist whatsapp event: {e}")
    return {"status": "ok"}

# ---------------------------- Notification Self-Test ----------------------------
class TestNotifyIn(BaseModel):
    to_phone: Optional[str] = None
    to_email: Optional[EmailStr] = None
    message: Optional[str] = "Test message from Chess Klub Mysuru CAMS."

@api.post("/notify/test")
async def test_notify(payload: TestNotifyIn, _: dict = Depends(require_role("director"))):
    """Send a test WhatsApp/email to verify integrations are live."""
    out = {}
    if payload.to_phone:
        out["whatsapp"] = send_whatsapp(payload.to_phone, payload.message or "Test")
    if payload.to_email:
        out["email"] = send_email(
            payload.to_email,
            f"Test email from {os.environ.get('ACADEMY_NAME', 'CAMS')}",
            f"<p>{payload.message}</p><p style='color:#777'>Sent from Chess Klub Mysuru CAMS.</p>",
        )
    return out

# ---------------------------- Mount ----------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(',') if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)
