from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import csv
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Literal

import bcrypt
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing

import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from urllib.parse import quote
from email_templates import render_email_template

# ---------------------------- Setup ----------------------------
def configure_logging() -> logging.Logger:
    app_level_name = os.environ.get("APP_LOG_LEVEL", "INFO").upper()
    root_level_name = os.environ.get("ROOT_LOG_LEVEL", "WARNING").upper()
    app_level = getattr(logging, app_level_name, logging.INFO)
    root_level = getattr(logging, root_level_name, logging.WARNING)

    logging.basicConfig(
        level=root_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        force=True,
    )

    for noisy_logger in ("httpx", "httpcore", "urllib3", "motor", "pymongo"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)

    logging.getLogger("uvicorn").setLevel(root_level)
    logging.getLogger("uvicorn.error").setLevel(root_level)
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.setLevel(logging.WARNING)
    access_logger.disabled = os.environ.get("UVICORN_ACCESS_LOG", "false").lower() not in ("1", "true", "yes")

    app_logger = logging.getLogger("cams")
    app_logger.setLevel(app_level)
    return app_logger


logger = configure_logging()

APP_ENV = os.environ.get("APP_ENV", os.environ.get("ENVIRONMENT", "development")).lower()


def is_production() -> bool:
    return APP_ENV in ("prod", "production")


def parse_bool_env(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.lower() in ("1", "true", "yes", "on")


def require_production_config() -> None:
    if not is_production():
        return
    missing = [
        name for name in (
            "MONGO_URL",
            "DB_NAME",
            "JWT_SECRET",
            "ADMIN_EMAIL",
            "ADMIN_PASSWORD",
            "PUBLIC_BACKEND_URL",
            "CORS_ORIGINS",
        )
        if not os.environ.get(name)
    ]
    if missing:
        raise RuntimeError(f"Missing required production env vars: {', '.join(missing)}")
    if len(os.environ["JWT_SECRET"]) < 32:
        raise RuntimeError("JWT_SECRET must be at least 32 characters in production")
    if os.environ["ADMIN_PASSWORD"] == "Admin@123":
        raise RuntimeError("ADMIN_PASSWORD must be changed before production startup")


require_production_config()

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Chess Klub Mysuru CAMS")
api = APIRouter(prefix="/api")

JWT_ALGO = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
ROLES = ["director", "ops_manager", "coach", "front_desk", "finance"]
COOKIE_SECURE = parse_bool_env("COOKIE_SECURE", is_production())

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

def validate_subscription_dates(start_iso: Optional[str], end_iso: Optional[str]) -> None:
    def parse_date(value: Optional[str], field: str):
        if not value:
            return None
        try:
            return datetime.fromisoformat(value).date()
        except Exception:
            raise HTTPException(400, f"{field} must be a valid YYYY-MM-DD date")

    start = parse_date(start_iso, "subscription_start")
    end = parse_date(end_iso, "subscription_end")
    if start and end and start > end:
        raise HTTPException(400, "subscription_start cannot be after subscription_end")

def oid(value: str, field: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(400, f"Invalid {field}")

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
        user = await db.users.find_one({"_id": oid(payload["sub"], "user id")})
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
    subscription_start: Optional[str] = None
    subscription_end: Optional[str] = None
    concession_pct: Optional[float] = 0
    referred_by: Optional[str] = ""
    status: Optional[str] = "inactive"

class BatchIn(BaseModel):
    name: str
    level_id: Optional[str] = None
    coach_id: Optional[str] = None
    schedule_days: List[str] = []
    session_time: Optional[str] = None
    venue: Optional[str] = None
    max_capacity: int = 20
    status: str = "active"
    whatsapp_group_link: Optional[str] = ""
    whatsapp_group_recipient: Optional[str] = ""

class BatchWhatsappIn(BaseModel):
    template: str = "batch_announcement"
    title: Optional[str] = ""
    event_date: Optional[str] = None

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
    await db.checkins.create_index([("student_id", 1), ("check_in_date", 1)], unique=True)
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
    elif parse_bool_env("ADMIN_RESET_PASSWORD_ON_STARTUP", False) and not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one({"_id": existing["_id"]},
                                  {"$set": {"password_hash": hash_password(admin_pw)}})
        logger.warning("Admin password reset from ADMIN_PASSWORD because ADMIN_RESET_PASSWORD_ON_STARTUP=true")

    # One-time migration: renumber students to CKM-00001 sorted by enrollment_date
    migrated = await db.counters.find_one({"key": "student-ckm-migrated"})
    if not migrated:
        students = await db.students.find({}).sort([("enrollment_date", 1), ("created_at", 1)]).to_list(10000)
        for i, s in enumerate(students, start=1):
            new_code = f"CKM-{i:05d}"
            await db.students.update_one({"_id": s["_id"]}, {"$set": {"student_code": new_code}})
        await db.counters.update_one(
            {"key": "student-ckm"},
            {"$set": {"value": len(students)}},
            upsert=True,
        )
        await db.counters.update_one(
            {"key": "student-ckm-migrated"},
            {"$set": {"value": 1, "at": iso(now_utc()), "count": len(students)}},
            upsert=True,
        )
        if students:
            logger.info(f"Migrated {len(students)} students to CKM-NNNNN format")

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
    n = await next_counter("student-ckm")
    return f"CKM-{n:05d}"

async def gen_invoice_no() -> str:
    today = datetime.now()
    n = await next_counter(f"invoice-{today.year}-{today.month:02d}")
    return f"INV-{today.year}-{today.month:02d}-{n:04d}"

async def gen_receipt_no() -> str:
    today = datetime.now()
    n = await next_counter(f"receipt-{today.year}-{today.month:02d}")
    return f"RCP-{today.year}-{today.month:02d}-{n:04d}"

# ---------------------------- Notifications ----------------------------
def send_whatsapp_template(to_phone: str, template_name: str, language_code: str,
                           body_params: List[str]) -> dict:
    """Send an approved WhatsApp template message (works outside the 24h window)."""
    token = os.environ.get("WHATSAPP_TOKEN")
    phone_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
    version = os.environ.get("WHATSAPP_GRAPH_VERSION", "v21.0")
    if not (token and phone_id):
        logger.debug(f"[WHATSAPP MOCK TMPL] to={to_phone} tpl={template_name} params={len(body_params or [])}")
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


def whatsapp_template_language() -> str:
    return os.environ.get("WHATSAPP_TEMPLATE_LANGUAGE_CODE", "en")


WHATSAPP_TEMPLATES = {
    "student_welcome": os.environ.get("WHATSAPP_STUDENT_WELCOME_TEMPLATE", "student_welcome"),
    "registration_received": os.environ.get("WHATSAPP_REGISTRATION_RECEIVED_TEMPLATE", "registration_received"),
    "registration_confirmed": os.environ.get("WHATSAPP_REGISTRATION_CONFIRMED_TEMPLATE", "registration_confirmed"),
    "invoice_created": os.environ.get("WHATSAPP_INVOICE_CREATED_TEMPLATE", "invoice_created"),
    "notify_test": os.environ.get("WHATSAPP_NOTIFY_TEST_TEMPLATE", "notify_test"),
    "batch_announcement": os.environ.get("WHATSAPP_BATCH_ANNOUNCEMENT_TEMPLATE", "batch_announcement"),
}


def send_named_whatsapp_template(to_phone: str, template_key: str, body_params: List[str]) -> dict:
    template_name = WHATSAPP_TEMPLATES.get(template_key)
    if not template_name:
        raise HTTPException(400, f"Unknown WhatsApp template: {template_key}")
    return send_whatsapp_template(to_phone, template_name, whatsapp_template_language(), body_params)


def money_text(amount) -> str:
    return f"Rs.{float(amount or 0):.2f}"


def public_backend_url() -> str:
    return (
        os.environ.get("PUBLIC_BACKEND_URL")
        or os.environ.get("BACKEND_PUBLIC_URL")
        or os.environ.get("BACKEND_URL")
        or "http://localhost:8001"
    ).rstrip("/")


def portal_pdf_url(student_id: str, doc_type: Literal["invoice", "receipt"], doc_id: str) -> str:
    token, _ = _portal_token(student_id)
    return f"{public_backend_url()}/api/portal/{quote(token, safe='')}/{doc_type}/{doc_id}/pdf"


UPI_PAYMENT_TEMPLATE = "upi://pay?mc=8299&pa=yespay.bizsbiz14832@yesbankltd&pn=MEGHANA MOHAN .B&am={amount}"


def invoice_upi_url(invoice: dict) -> str:
    amount = f"{float(invoice.get('amount', 0) or 0):.2f}"
    return UPI_PAYMENT_TEMPLATE.format(amount=amount)


def send_fee_reminder_whatsapp(to_phone: str, invoice: dict) -> dict:
    template_name = os.environ.get("WHATSAPP_FEE_REMINDER_TEMPLATE", "fee_reminder")
    invoice_pdf_url = portal_pdf_url(str(invoice.get("student_id", "")), "invoice", str(invoice.get("_id", "")))
    return send_whatsapp_template(
        to_phone,
        template_name,
        whatsapp_template_language(),
        [
            invoice.get("invoice_no", ""),
            money_text(invoice.get("balance", 0)),
            invoice.get("student_name", ""),
            invoice.get("due_date", ""),
            invoice_pdf_url,
        ],
    )


def send_payment_receipt_whatsapp(to_phone: str, invoice: dict, receipt: dict) -> dict:
    template_name = os.environ.get("WHATSAPP_PAYMENT_RECEIPT_TEMPLATE", "payment_receipt")
    receipt_pdf_url = portal_pdf_url(str(receipt.get("student_id", "")), "receipt", str(receipt.get("id", receipt.get("_id", ""))))
    return send_whatsapp_template(
        to_phone,
        template_name,
        whatsapp_template_language(),
        [
            money_text(receipt.get("amount", 0)),
            invoice.get("student_name", ""),
            receipt.get("receipt_no", ""),
            receipt_pdf_url,
        ],
    )


def send_template_email(to_email: str, template_key: str, context: dict) -> dict:
    context = {"academy_name": os.environ.get("ACADEMY_NAME", "Chess Klub Mysuru"), **context}
    subject, html = render_email_template(template_key, context)
    return send_email(to_email, subject, html)


async def existing_attendance_for_student(student_id: str, session_date: str, batch_id: Optional[str] = None) -> Optional[dict]:
    query = {f"marks.{student_id}": {"$exists": True}, "session_date": session_date}
    if batch_id:
        query["batch_id"] = {"$ne": batch_id}
    return await db.attendance.find_one(query)


async def mark_student_present_from_kiosk(student: dict, session_date: str, checkin_time: datetime) -> None:
    batch_id = student.get("batch_id")
    if not batch_id:
        return
    sid = str(student["_id"])
    duplicate = await existing_attendance_for_student(sid, session_date, batch_id=batch_id)
    if duplicate:
        raise HTTPException(400, "Attendance already exists for this student today.")
    current = await db.attendance.find_one({"batch_id": batch_id, "session_date": session_date})
    if current and sid in current.get("marks", {}):
        return
    await db.attendance.update_one(
        {"batch_id": batch_id, "session_date": session_date},
        {"$set": {
            f"marks.{sid}": "P",
            f"kiosk_checkins.{sid}": iso(checkin_time),
            "marked_via": "kiosk",
            "updated_at": iso(checkin_time),
        }},
        upsert=True,
    )


def send_email(to_email: str, subject: str, html: str) -> dict:
    """Send an email via Gmail SMTP using an App Password.
    Falls back to log-only mode when credentials are missing."""
    if not to_email:
        return {"sent": False, "mode": "log", "reason": "no recipient"}
    gmail_user = os.environ.get("GMAIL_USER")
    gmail_pass = os.environ.get("GMAIL_APP_PASSWORD")
    if not (gmail_user and gmail_pass):
        logger.debug(f"[EMAIL MOCK] to={to_email} subject_set={bool(subject)}")
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
    response.set_cookie("access_token", token, httponly=True, secure=COOKIE_SECURE, samesite="lax",
                        max_age=12 * 3600, path="/")
    return {"id": str(user["_id"]), "email": email, "name": user["name"], "role": user["role"]}

@api.post("/auth/logout")
async def logout(response: Response, _: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/", secure=COOKIE_SECURE, samesite="lax")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.get("/health")
async def health():
    try:
        await db.command("ping")
    except Exception as e:
        logger.warning(f"health check failed: {e}")
        raise HTTPException(503, "Database unavailable")
    return {"ok": True, "service": "ckm-cams", "env": APP_ENV}

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
    await db.users.delete_one({"_id": oid(uid)})
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
    await db.levels.update_one({"_id": oid(lid)}, {"$set": payload.model_dump()})
    doc = await db.levels.find_one({"_id": oid(lid)})
    return serialize_doc(doc)

@api.delete("/levels/{lid}")
async def delete_level(lid: str, _: dict = Depends(require_role("ops_manager"))):
    await db.levels.delete_one({"_id": oid(lid)})
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
    await db.batches.update_one({"_id": oid(bid)}, {"$set": payload.model_dump()})
    return serialize_doc(await db.batches.find_one({"_id": oid(bid)}))

@api.post("/batches/{bid}/whatsapp")
async def send_batch_whatsapp(bid: str, payload: BatchWhatsappIn,
                              user: dict = Depends(require_role("ops_manager", "front_desk", "coach"))):
    batch = await db.batches.find_one({"_id": oid(bid)})
    if not batch:
        raise HTTPException(404, "Batch not found")
    template_key = payload.template or "batch_announcement"
    if template_key != "batch_announcement":
        raise HTTPException(400, "Unsupported batch WhatsApp template")
    params = [
        batch.get("name", ""),
        payload.title or "Class update",
        payload.event_date or date.today().isoformat(),
    ]
    recipient = (batch.get("whatsapp_group_recipient") or "").strip()
    result = None
    if recipient:
        result = send_named_whatsapp_template(recipient, template_key, params)
    await db.whatsapp_batch_messages.insert_one({
        "batch_id": bid,
        "template": template_key,
        "params": params,
        "sent_to": recipient or None,
        "group_link": batch.get("whatsapp_group_link") or "",
        "result": result,
        "created_at": iso(now_utc()),
        "created_by": user["id"],
    })
    return {
        "whatsapp": result,
        "template": template_key,
        "params": params,
        "group_link": batch.get("whatsapp_group_link") or "",
        "mode": "template" if recipient else "group_link",
    }

@api.delete("/batches/{bid}")
async def delete_batch(bid: str, _: dict = Depends(require_role("ops_manager"))):
    await db.batches.delete_one({"_id": oid(bid)})
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
    validate_subscription_dates(doc.get("subscription_start"), doc.get("subscription_end"))
    doc["subscription_status"] = _compute_sub_status(doc.get("subscription_end"))
    if doc.get("subscription_end"):
        doc["subscription_plan"] = doc.get("payment_plan") or "monthly"
    res = await db.students.insert_one(doc)
    saved = serialize_doc({**doc, "_id": res.inserted_id})
    # send welcome
    if saved.get("parent_whatsapp"):
        send_named_whatsapp_template(saved["parent_whatsapp"], "student_welcome",
                                     [saved["full_name"], saved["student_code"], os.environ.get("ACADEMY_NAME", "")])
    if saved.get("parent_email"):
        send_template_email(saved["parent_email"], "student_welcome",
                            {"student_name": saved["full_name"], "student_code": saved["student_code"]})
    return saved

@api.get("/students/{sid}")
async def get_student(sid: str, user: dict = Depends(get_current_user)):
    s = await db.students.find_one({"_id": oid(sid)})
    if not s:
        raise HTTPException(404, "Student not found")
    return serialize_doc(s)

@api.put("/students/{sid}")
async def update_student(sid: str, payload: StudentIn, _: dict = Depends(require_role("ops_manager", "front_desk"))):
    existing = await db.students.find_one({"_id": oid(sid)})
    if not existing:
        raise HTTPException(404, "Student not found")
    doc = payload.model_dump()
    if doc.get("subscription_start") is None:
        doc["subscription_start"] = existing.get("subscription_start")
    if doc.get("subscription_end") is None:
        doc["subscription_end"] = existing.get("subscription_end")
    validate_subscription_dates(doc.get("subscription_start"), doc.get("subscription_end"))
    doc["subscription_status"] = _compute_sub_status(doc.get("subscription_end"))
    if doc.get("subscription_end"):
        doc["subscription_plan"] = doc.get("payment_plan") or "monthly"
    await db.students.update_one({"_id": oid(sid)}, {"$set": doc})
    return serialize_doc(await db.students.find_one({"_id": oid(sid)}))

@api.delete("/students/{sid}")
async def delete_student(sid: str, _: dict = Depends(require_role("ops_manager"))):
    await db.students.delete_one({"_id": oid(sid)})
    return {"ok": True}

# ---------------------------- Attendance ----------------------------
@api.post("/attendance")
async def save_attendance(payload: AttendanceSessionIn, user: dict = Depends(require_role("coach", "ops_manager", "front_desk"))):
    duplicate_students = []
    for sid, mark in payload.marks.items():
        if mark not in ("P", "A", "L", "LT", "H"):
            raise HTTPException(400, f"Invalid attendance mark for student {sid}")
        duplicate = await existing_attendance_for_student(sid, payload.session_date, batch_id=payload.batch_id)
        if duplicate:
            duplicate_students.append(sid)
    if duplicate_students:
        raise HTTPException(400, "A student attendance cannot be marked more than once for a day.")
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

@api.get("/attendance/export")
async def export_attendance(batch_id: Optional[str] = None, start_date: Optional[str] = None,
                            end_date: Optional[str] = None, user: dict = Depends(get_current_user)):
    flt = {}
    if batch_id:
        flt["batch_id"] = batch_id
    if start_date or end_date:
        flt["session_date"] = {}
        if start_date:
            flt["session_date"]["$gte"] = start_date
        if end_date:
            flt["session_date"]["$lte"] = end_date
    sessions = await db.attendance.find(flt).sort([("session_date", 1), ("batch_id", 1)]).to_list(5000)
    batch_ids = list({s.get("batch_id") for s in sessions if s.get("batch_id")})
    student_ids = list({sid for s in sessions for sid in s.get("marks", {}).keys()})
    batches = await db.batches.find({"_id": {"$in": [oid(b) for b in batch_ids if b]}}).to_list(1000) if batch_ids else []
    students = await db.students.find({"_id": {"$in": [oid(s) for s in student_ids if s]}}).to_list(5000) if student_ids else []
    batch_map = {str(b["_id"]): b.get("name", "") for b in batches}
    student_map = {str(s["_id"]): s for s in students}
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["session_date", "batch", "student_code", "student_name", "status", "marked_via"])
    for session in sessions:
        for sid, status in sorted(session.get("marks", {}).items(), key=lambda kv: (student_map.get(kv[0], {}).get("full_name", ""), kv[0])):
            student = student_map.get(sid, {})
            writer.writerow([
                session.get("session_date", ""),
                batch_map.get(session.get("batch_id"), session.get("batch_id", "")),
                student.get("student_code", ""),
                student.get("full_name", sid),
                status,
                session.get("marked_via", "manual"),
            ])
    filename = f"attendance-{date.today().isoformat()}.csv"
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})

@api.get("/attendance/student/{sid}")
async def student_attendance(sid: str, user: dict = Depends(get_current_user)):
    student = await db.students.find_one({"_id": oid(sid)})
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
    student = await db.students.find_one({"_id": oid(payload.student_id)})
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
        send_named_whatsapp_template(saved["parent_whatsapp"], "invoice_created",
                                     [saved["invoice_no"], saved["student_name"], money_text(saved["amount"]), saved["due_date"]])
    return saved

@api.get("/invoices/{iid}")
async def get_invoice(iid: str, user: dict = Depends(get_current_user)):
    inv = await db.invoices.find_one({"_id": oid(iid)})
    if not inv: raise HTTPException(404, "Invoice not found")
    return serialize_doc(inv)

@api.delete("/invoices/{iid}")
async def delete_invoice(iid: str, _: dict = Depends(require_role("finance", "ops_manager"))):
    await db.invoices.delete_one({"_id": oid(iid)})
    return {"ok": True}

@api.post("/invoices/{iid}/remind")
async def remind_invoice(iid: str, user: dict = Depends(require_role("finance", "ops_manager", "front_desk"))):
    inv = await db.invoices.find_one({"_id": oid(iid)})
    if not inv: raise HTTPException(404, "Invoice not found")
    wa_result = email_result = None
    if inv.get("parent_whatsapp"):
        wa_result = send_fee_reminder_whatsapp(inv["parent_whatsapp"], inv)
    if inv.get("parent_email"):
        invoice_pdf_url = portal_pdf_url(str(inv.get("student_id", "")), "invoice", str(inv.get("_id", "")))
        email_result = send_template_email(inv["parent_email"], "payment_reminder", {
            "invoice_no": inv["invoice_no"],
            "student_name": inv.get("student_name", ""),
            "balance": money_text(inv.get("balance", 0)),
            "due_date": inv.get("due_date", ""),
            "invoice_pdf_url": invoice_pdf_url,
        })
    return {"whatsapp": wa_result, "email": email_result}

@api.post("/payments")
async def record_payment(payload: PaymentIn, user: dict = Depends(require_role("finance", "ops_manager", "front_desk"))):
    inv = await db.invoices.find_one({"_id": oid(payload.invoice_id)})
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
    await db.invoices.update_one({"_id": oid(payload.invoice_id)},
                                 {"$set": {"paid": new_paid, "balance": new_balance, "status": status}})
    saved = serialize_doc({**receipt, "_id": r.inserted_id})
    # Extend subscription based on the student's payment plan
    student_doc = await db.students.find_one({"_id": oid(inv["student_id"])})
    plan = (student_doc or {}).get("payment_plan", "monthly") if student_doc else "monthly"
    sub = await _extend_subscription(inv["student_id"], plan)
    saved["subscription"] = sub
    if inv.get("parent_whatsapp"):
        send_payment_receipt_whatsapp(inv["parent_whatsapp"], inv, saved)
    if inv.get("parent_email"):
        invoice_pdf_url = portal_pdf_url(str(inv.get("student_id", "")), "invoice", str(inv.get("_id", "")))
        receipt_pdf_url = portal_pdf_url(str(saved.get("student_id", "")), "receipt", str(saved.get("id", "")))
        send_template_email(inv["parent_email"], "payment_receipt", {
            "receipt_no": receipt_no,
            "amount": money_text(payload.amount),
            "invoice_no": inv["invoice_no"],
            "invoice_pdf_url": invoice_pdf_url,
            "receipt_pdf_url": receipt_pdf_url,
        })
    return saved

@api.get("/receipts")
async def list_receipts(student_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    flt = {}
    if student_id: flt["student_id"] = student_id
    items = await db.receipts.find(flt).sort("created_at", -1).to_list(1000)
    return [serialize_doc(x) for x in items]

@api.get("/receipts/{rid}")
async def get_receipt(rid: str, user: dict = Depends(get_current_user)):
    r = await db.receipts.find_one({"_id": oid(rid)})
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

def _qr_flowable(value: str, size_mm: int = 32) -> Drawing:
    widget = qr.QrCodeWidget(value)
    bounds = widget.getBounds()
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    size = size_mm * mm
    drawing = Drawing(size, size, transform=[size / width, 0, 0, size / height, 0, 0])
    drawing.add(widget)
    return drawing


def _paid_seal(canvas, doc) -> None:
    canvas.saveState()
    try:
        canvas.setFillAlpha(0.14)
        canvas.setStrokeAlpha(0.45)
    except Exception:
        pass
    green = colors.HexColor("#1f9d55")
    x = A4[0] - 43 * mm
    y = A4[1] - 70 * mm
    canvas.setStrokeColor(green)
    canvas.setFillColor(green)
    canvas.setLineWidth(1.4)
    canvas.circle(x, y, 17 * mm, stroke=1, fill=0)
    canvas.setFont("Helvetica-Bold", 18)
    canvas.drawCentredString(x, y - 2 * mm, "PAID")
    canvas.setFont("Helvetica", 7)
    canvas.drawCentredString(x, y - 9 * mm, "INVOICE PAID")
    canvas.restoreState()


def _build_pdf(title: str, doc_no: str, doc_date: str, student_lines: List[str],
               rows: List[List[str]], totals: List[List[str]], footer_lines: List[str],
               qr_value: Optional[str] = None, watermark: Optional[str] = None) -> bytes:
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

    if qr_value:
        qr_table = Table(
            [[_qr_flowable(qr_value), Paragraph("<b>Scan to pay by UPI</b><br/>Amount is linked to this invoice.",
                                                ParagraphStyle('qr_text', fontSize=9, leading=12, textColor=GRAY))]],
            colWidths=[38 * mm, 142 * mm],
        )
        qr_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOX", (0, 0), (-1, -1), 0.4, GRAY),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(qr_table)
        elements.append(Spacer(1, 12))

    # Footer
    for line in footer_lines:
        elements.append(Paragraph(line, ParagraphStyle('f', fontSize=9, leading=12, textColor=GRAY)))

    if watermark == "PAID":
        doc.build(elements, onFirstPage=_paid_seal, onLaterPages=_paid_seal)
    else:
        doc.build(elements)
    buf.seek(0)
    return buf.read()

@api.get("/invoices/{iid}/pdf")
async def invoice_pdf(iid: str, user: dict = Depends(get_current_user)):
    inv = await db.invoices.find_one({"_id": oid(iid)})
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
    pdf = _build_pdf("INVOICE", inv["invoice_no"], inv["issued_at"][:10], student_lines, rows, totals, footer,
                     qr_value=invoice_upi_url(inv))
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{inv["invoice_no"]}.pdf"'})

@api.get("/receipts/{rid}/pdf")
async def receipt_pdf(rid: str, user: dict = Depends(get_current_user)):
    r = await db.receipts.find_one({"_id": oid(rid)})
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
    pdf = _build_pdf("PAYMENT RECEIPT", r["receipt_no"], r["created_at"][:10], student_lines, rows, totals, footer,
                     watermark="PAID")
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

    # subscription expiry buckets
    today_iso = date.today().isoformat()
    soon_iso = (date.today() + timedelta(days=7)).isoformat()
    expiring_soon = await db.students.count_documents({
        "status": "active",
        "subscription_end": {"$gte": today_iso, "$lte": soon_iso},
    })
    expired_subs = await db.students.count_documents({
        "status": "active",
        "subscription_end": {"$lt": today_iso},
    })

    return {
        "active_students": active_students,
        "total_students": total_students,
        "new_this_month": new_this_month,
        "pending_amount": pending_amount,
        "overdue_amount": overdue_amount,
        "overdue_count": len(overdue),
        "this_month_revenue": this_month_revenue,
        "attendance_rate": attendance_rate,
        "expiring_soon": expiring_soon,
        "expired_subs": expired_subs,
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
        out["whatsapp"] = send_named_whatsapp_template(payload.to_phone, "notify_test", [payload.message or "Test"])
    if payload.to_email:
        out["email"] = send_template_email(payload.to_email, "notify_test", {"message": payload.message or "Test"})
    return out

PLAN_DAYS = {"monthly": 30, "quarterly": 90, "annual": 365}

def _compute_sub_status(end_iso: Optional[str]) -> str:
    if not end_iso:
        return "none"
    try:
        end = datetime.fromisoformat(end_iso).date()
    except Exception:
        return "none"
    today = date.today()
    if end < today:
        return "expired"
    if (end - today).days <= 7:
        return "expiring_soon"
    return "active"

async def _extend_subscription(student_id: str, plan: str, ref_date: Optional[date] = None) -> dict:
    """Extend a student's subscription by the plan's day-count, anchored on the later of
    today and the existing end-date. Persists subscription_start/end/status on the student doc."""
    days = PLAN_DAYS.get(plan or "monthly", 30)
    student = await db.students.find_one({"_id": oid(student_id)})
    if not student:
        return {}
    today = ref_date or date.today()
    current_end_iso = student.get("subscription_end")
    try:
        current_end = datetime.fromisoformat(current_end_iso).date() if current_end_iso else None
    except Exception:
        current_end = None
    anchor = max(today, current_end) if current_end and current_end >= today else today
    new_end = anchor + timedelta(days=days)
    sub_start = student.get("subscription_start") or today.isoformat()
    new_end_iso = new_end.isoformat()
    await db.students.update_one(
        {"_id": oid(student_id)},
        {"$set": {
            "subscription_start": sub_start,
            "subscription_end": new_end_iso,
            "subscription_status": _compute_sub_status(new_end_iso),
            "subscription_plan": plan or "monthly",
        }},
    )
    return {"subscription_start": sub_start, "subscription_end": new_end_iso}

# ---------------------------- Kiosk: Self check-in / check-out ----------------------------
class KioskAction(BaseModel):
    code: str  # student_code like STU-2026-0001

@api.post("/kiosk/checkin")
async def kiosk_checkin(payload: KioskAction):
    code = payload.code.strip().upper()
    student = await db.students.find_one({"student_code": code})
    if not student:
        raise HTTPException(404, "Student code not recognised. Please check with the front desk.")
    today_iso = date.today().isoformat()
    existing = await db.checkins.find_one({
        "student_id": str(student["_id"]),
        "check_in_date": today_iso,
    })
    if existing and not existing.get("check_out"):
        return {
            "status": "already_in",
            "student_name": student["full_name"],
            "check_in": existing["check_in"],
        }
    if existing and existing.get("check_out"):
        # already done for the day
        return {
            "status": "already_done",
            "student_name": student["full_name"],
            "check_in": existing["check_in"],
            "check_out": existing["check_out"],
        }
    now = now_utc()
    doc = {
        "student_id": str(student["_id"]),
        "student_code": code,
        "student_name": student["full_name"],
        "batch_id": student.get("batch_id"),
        "check_in_date": today_iso,
        "check_in": iso(now),
        "check_out": None,
        "duration_minutes": None,
    }
    await mark_student_present_from_kiosk(student, today_iso, now)
    res = await db.checkins.insert_one(doc)
    return {"status": "checked_in", "student_name": student["full_name"],
            "check_in": doc["check_in"], "id": str(res.inserted_id)}

@api.post("/kiosk/checkout")
async def kiosk_checkout(payload: KioskAction):
    code = payload.code.strip().upper()
    student = await db.students.find_one({"student_code": code})
    if not student:
        raise HTTPException(404, "Student code not recognised.")
    today_iso = date.today().isoformat()
    existing = await db.checkins.find_one({
        "student_id": str(student["_id"]),
        "check_in_date": today_iso,
    })
    if not existing:
        raise HTTPException(400, f"{student['full_name']} has not checked in today.")
    if existing.get("check_out"):
        return {"status": "already_out", "student_name": student["full_name"],
                "check_in": existing["check_in"], "check_out": existing["check_out"]}
    now = now_utc()
    delta = (now - datetime.fromisoformat(existing["check_in"])).total_seconds() / 60.0
    await db.checkins.update_one(
        {"_id": existing["_id"]},
        {"$set": {"check_out": iso(now), "duration_minutes": round(delta, 1)}},
    )
    return {"status": "checked_out", "student_name": student["full_name"],
            "check_in": existing["check_in"], "check_out": iso(now),
            "duration_minutes": round(delta, 1)}

@api.get("/kiosk/recent")
async def kiosk_recent(user: dict = Depends(get_current_user)):
    today_iso = date.today().isoformat()
    items = await db.checkins.find({"check_in_date": today_iso}).sort("check_in", -1).to_list(100)
    return [serialize_doc(x) for x in items]

# ---------------------------- Subscription endpoints ----------------------------
class SubExtendIn(BaseModel):
    plan: Optional[str] = None  # uses student's plan if not provided
    days: Optional[int] = None  # explicit days override

@api.get("/students/{sid}/subscription")
async def get_subscription(sid: str, user: dict = Depends(get_current_user)):
    s = await db.students.find_one({"_id": oid(sid)})
    if not s:
        raise HTTPException(404, "Student not found")
    end = s.get("subscription_end")
    return {
        "start": s.get("subscription_start"),
        "end": end,
        "plan": s.get("subscription_plan") or s.get("payment_plan", "monthly"),
        "status": _compute_sub_status(end),
        "days_remaining": (datetime.fromisoformat(end).date() - date.today()).days if end else None,
    }

@api.post("/students/{sid}/subscription/extend")
async def extend_subscription_endpoint(sid: str, payload: SubExtendIn,
                                       _: dict = Depends(require_role("ops_manager", "finance", "front_desk"))):
    s = await db.students.find_one({"_id": oid(sid)})
    if not s:
        raise HTTPException(404, "Student not found")
    plan = payload.plan or s.get("payment_plan", "monthly")
    if payload.days is not None:
        # custom days extension
        today = date.today()
        current_end_iso = s.get("subscription_end")
        try:
            current_end = datetime.fromisoformat(current_end_iso).date() if current_end_iso else None
        except Exception:
            current_end = None
        anchor = max(today, current_end) if current_end and current_end >= today else today
        new_end = anchor + timedelta(days=int(payload.days))
        sub_start = s.get("subscription_start") or today.isoformat()
        new_end_iso = new_end.isoformat()
        await db.students.update_one(
            {"_id": oid(sid)},
            {"$set": {"subscription_start": sub_start,
                      "subscription_end": new_end_iso,
                      "subscription_status": _compute_sub_status(new_end_iso),
                      "subscription_plan": plan}},
        )
        return await get_subscription(sid, _)
    await _extend_subscription(sid, plan)
    return await get_subscription(sid, _)

# ---------------------------- Parent Magic Link ----------------------------
class MagicLinkOut(BaseModel):
    token: str
    expires_at: str

def _portal_token(student_id: str, days: int = 180) -> tuple[str, datetime]:
    exp = now_utc() + timedelta(days=days)
    payload = {"sub": student_id, "type": "portal", "exp": exp}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO), exp

def _decode_portal_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Link expired. Please request a new one.")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid link.")
    if payload.get("type") != "portal":
        raise HTTPException(401, "Invalid link.")
    return payload["sub"]

@api.post("/students/{sid}/magic-link", response_model=MagicLinkOut)
async def create_magic_link(sid: str, _: dict = Depends(require_role("ops_manager", "front_desk", "finance"))):
    s = await db.students.find_one({"_id": oid(sid)})
    if not s:
        raise HTTPException(404, "Student not found")
    token, exp = _portal_token(sid)
    await db.students.update_one(
        {"_id": oid(sid)},
        {"$set": {"portal_token_issued_at": iso(now_utc())}},
    )
    return {"token": token, "expires_at": iso(exp)}

@api.get("/portal/{token}/data")
async def portal_data(token: str):
    sid = _decode_portal_token(token)
    s = await db.students.find_one({"_id": oid(sid)})
    if not s:
        raise HTTPException(404, "Student not found")
    sid_str = str(s["_id"])
    # attendance
    batch_id = s.get("batch_id")
    sessions = await db.attendance.find({"batch_id": batch_id}, {"marks": 1, "session_date": 1}).sort("session_date", -1).limit(60).to_list(60) if batch_id else []
    counts = {"P": 0, "A": 0, "L": 0, "LT": 0, "H": 0}
    history = []
    for sess in sessions:
        st = (sess.get("marks") or {}).get(sid_str)
        if st:
            counts[st] = counts.get(st, 0) + 1
            history.append({"date": sess["session_date"], "status": st})
    total = sum(counts[k] for k in ["P", "A", "L", "LT"])
    pct = round((counts["P"] + counts["LT"]) / total * 100, 1) if total else 0
    # invoices + receipts
    inv = await db.invoices.find({"student_id": sid_str}).sort("issued_at", -1).to_list(200)
    rec = await db.receipts.find({"student_id": sid_str}).sort("created_at", -1).to_list(200)
    # batch + level
    batch = await db.batches.find_one({"_id": oid(batch_id)}) if batch_id else None
    level = await db.levels.find_one({"_id": oid(s["level_id"])}) if s.get("level_id") else None
    return {
        "student": {
            "id": sid_str,
            "code": s.get("student_code"),
            "name": s.get("full_name"),
            "parent_name": s.get("parent_name"),
            "batch": batch.get("name") if batch else None,
            "level": level.get("name") if level else None,
            "payment_plan": s.get("payment_plan"),
            "subscription_start": s.get("subscription_start"),
            "subscription_end": s.get("subscription_end"),
            "subscription_status": _compute_sub_status(s.get("subscription_end")),
        },
        "academy": {
            "name": os.environ.get("ACADEMY_NAME"),
            "phone": os.environ.get("ACADEMY_PHONE"),
            "email": os.environ.get("ACADEMY_EMAIL"),
            "logo_url": os.environ.get("LOGO_URL"),
        },
        "attendance": {"counts": counts, "percentage": pct, "history": history[:30]},
        "invoices": [serialize_doc(x) for x in inv],
        "receipts": [serialize_doc(x) for x in rec],
    }

@api.get("/portal/{token}/invoice/{iid}/pdf")
async def portal_invoice_pdf(token: str, iid: str):
    sid = _decode_portal_token(token)
    inv = await db.invoices.find_one({"_id": oid(iid)})
    if not inv or inv.get("student_id") != sid:
        raise HTTPException(404, "Invoice not found")
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
    footer = ["This is a computer-generated invoice.", "For queries, contact the academy office."]
    pdf = _build_pdf("INVOICE", inv["invoice_no"], inv["issued_at"][:10], student_lines, rows, totals, footer,
                     qr_value=invoice_upi_url(inv))
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{inv["invoice_no"]}.pdf"'})

@api.get("/portal/{token}/receipt/{rid}/pdf")
async def portal_receipt_pdf(token: str, rid: str):
    sid = _decode_portal_token(token)
    r = await db.receipts.find_one({"_id": oid(rid)})
    if not r or r.get("student_id") != sid:
        raise HTTPException(404, "Receipt not found")
    rows = [[f"Payment for invoice {r['invoice_no']} ({r.get('period')})", f"{r['amount']:.2f}"]]
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
    footer = ["Thank you for your payment.", "This is a computer-generated receipt."]
    pdf = _build_pdf("PAYMENT RECEIPT", r["receipt_no"], r["created_at"][:10], student_lines, rows, totals, footer,
                     watermark="PAID")
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{r["receipt_no"]}.pdf"'})

# ---------------------------- Pending balance ----------------------------
@api.get("/students/{sid}/pending-balance")
async def student_pending_balance(sid: str, user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find(
        {"student_id": sid, "status": {"$in": ["pending", "partial"]}},
        {"invoice_no": 1, "period": 1, "balance": 1, "due_date": 1},
    ).to_list(200)
    total = round(sum(float(i.get("balance", 0)) for i in invoices), 2)
    return {
        "total_balance": total,
        "open_invoice_count": len(invoices),
        "invoices": [serialize_doc(i) for i in invoices],
    }

# ---------------------------- Monthly billing run ----------------------------
class MonthlyRunIn(BaseModel):
    period: str  # "2026-03"
    due_date: str  # YYYY-MM-DD
    include_pending: bool = True
    plans: Optional[List[str]] = None  # e.g. ["monthly"] — defaults to all

@api.post("/billing/monthly-run")
async def monthly_billing_run(payload: MonthlyRunIn, user: dict = Depends(require_role("finance", "ops_manager"))):
    # Skip students who already have an invoice for this period
    existing = await db.invoices.find({"period": payload.period}, {"student_id": 1}).to_list(5000)
    already_billed = {x["student_id"] for x in existing}

    flt = {"status": "active"}
    if payload.plans:
        flt["payment_plan"] = {"$in": payload.plans}
    students = await db.students.find(flt).to_list(5000)

    levels = await db.levels.find().to_list(500)
    level_by_id = {str(l["_id"]): l for l in levels}

    created, skipped = [], []
    for s in students:
        sid_str = str(s["_id"])
        if sid_str in already_billed:
            skipped.append({"student_id": sid_str, "reason": "already_billed"})
            continue
        if not s.get("level_id"):
            skipped.append({"student_id": sid_str, "reason": "no_level"})
            continue
        lv = level_by_id.get(s["level_id"])
        if not lv:
            skipped.append({"student_id": sid_str, "reason": "level_missing"})
            continue
        plan = s.get("payment_plan", "monthly")
        fee_field = {"monthly": "monthly_fee", "quarterly": "quarterly_fee", "annual": "annual_fee"}[plan]
        fee_amt = float(lv.get(fee_field, 0) or 0)
        if fee_amt <= 0:
            skipped.append({"student_id": sid_str, "reason": "no_fee"})
            continue
        items = [{"description": f"{lv['name']} - {plan} fee ({payload.period})", "amount": fee_amt}]

        # Carry-over: include all pending balances from previous periods
        if payload.include_pending:
            pending = await db.invoices.find(
                {"student_id": sid_str, "status": {"$in": ["pending", "partial"]}, "period": {"$ne": payload.period}},
                {"balance": 1, "invoice_no": 1, "period": 1},
            ).to_list(50)
            for p in pending:
                if float(p.get("balance", 0)) > 0:
                    items.append({
                        "description": f"Outstanding from {p.get('period')} (Inv {p.get('invoice_no')})",
                        "amount": float(p["balance"]),
                    })

        inv_payload = InvoiceIn(
            student_id=sid_str, period=payload.period, due_date=payload.due_date,
            items=[InvoiceItem(**i) for i in items], notes="Auto-generated by monthly run",
        )
        inv = await _build_invoice_doc(inv_payload, user)
        res = await db.invoices.insert_one(inv)
        created.append({"student_id": sid_str, "invoice_no": inv["invoice_no"], "amount": inv["amount"]})

    return {"created": created, "skipped": skipped, "total_created": len(created)}

# ---------------------------- Open Registration (public) ----------------------------
class RegistrationIn(BaseModel):
    full_name: str
    dob: Optional[str] = None
    gender: Optional[str] = None
    parent_name: str
    parent_whatsapp: str
    parent_email: Optional[EmailStr] = None
    address: Optional[str] = ""
    level_preference: Optional[str] = None  # level code or free text
    referred_by: Optional[str] = ""
    notes: Optional[str] = ""

@api.get("/registrations/public/meta")
async def registration_meta():
    """Public endpoint to list level options for the registration form."""
    levels = await db.levels.find({"status": "active"}, {"name": 1, "code": 1, "program": 1}).to_list(100)
    return {
        "academy": {
            "name": os.environ.get("ACADEMY_NAME"),
            "phone": os.environ.get("ACADEMY_PHONE"),
            "email": os.environ.get("ACADEMY_EMAIL"),
            "logo_url": os.environ.get("LOGO_URL"),
        },
        "levels": [serialize_doc(l) for l in levels],
    }

@api.post("/registrations")
async def create_registration(payload: RegistrationIn):
    """PUBLIC — anyone can submit a registration request from /register."""
    doc = payload.model_dump()
    doc["status"] = "pending"
    doc["created_at"] = iso(now_utc())
    res = await db.registrations.insert_one(doc)
    saved = serialize_doc({**doc, "_id": res.inserted_id})
    # Acknowledge receipt to parent
    if saved.get("parent_whatsapp"):
        send_named_whatsapp_template(saved["parent_whatsapp"], "registration_received",
                                     [saved["parent_name"], saved["full_name"], os.environ.get("ACADEMY_NAME", "")])
    if saved.get("parent_email"):
        send_template_email(saved["parent_email"], "registration_received",
                            {"parent_name": saved["parent_name"], "student_name": saved["full_name"]})
    return {"id": saved["id"], "status": "received"}

@api.get("/registrations")
async def list_registrations(status: Optional[str] = "pending", _: dict = Depends(get_current_user)):
    flt = {}
    if status and status != "all":
        flt["status"] = status
    items = await db.registrations.find(flt).sort("created_at", -1).to_list(500)
    return [serialize_doc(x) for x in items]

class RegistrationConfirmIn(BaseModel):
    level_id: str
    batch_id: Optional[str] = None
    payment_plan: str = "monthly"
    concession_pct: float = 0
    enrollment_date: Optional[str] = None

@api.post("/registrations/{rid}/confirm")
async def confirm_registration(rid: str, payload: RegistrationConfirmIn,
                               user: dict = Depends(require_role("ops_manager", "front_desk"))):
    reg = await db.registrations.find_one({"_id": oid(rid)})
    if not reg:
        raise HTTPException(404, "Registration not found")
    if reg.get("status") == "confirmed":
        raise HTTPException(400, "Already confirmed")
    student_doc = {
        "full_name": reg["full_name"],
        "dob": reg.get("dob"),
        "gender": reg.get("gender") or "other",
        "parent_name": reg["parent_name"],
        "parent_whatsapp": reg["parent_whatsapp"],
        "parent_email": reg.get("parent_email"),
        "address": reg.get("address", ""),
        "level_id": payload.level_id,
        "batch_id": payload.batch_id or None,
        "payment_plan": payload.payment_plan,
        "concession_pct": payload.concession_pct,
        "referred_by": reg.get("referred_by", ""),
        "status": "active",
        "student_code": await gen_student_code(),
        "enrollment_date": payload.enrollment_date or date.today().isoformat(),
        "created_at": iso(now_utc()),
        "created_by": user["id"],
        "registration_id": rid,
    }
    res = await db.students.insert_one(student_doc)
    await db.registrations.update_one(
        {"_id": oid(rid)},
        {"$set": {"status": "confirmed", "confirmed_at": iso(now_utc()),
                  "confirmed_by": user["id"], "student_id": str(res.inserted_id)}},
    )
    # Welcome notifications
    if student_doc.get("parent_whatsapp"):
        send_named_whatsapp_template(student_doc["parent_whatsapp"], "registration_confirmed",
                                     [student_doc["parent_name"], student_doc["full_name"], student_doc["student_code"]])
    if student_doc.get("parent_email"):
        send_template_email(student_doc["parent_email"], "registration_confirmed", {
            "parent_name": student_doc["parent_name"],
            "student_name": student_doc["full_name"],
            "student_code": student_doc["student_code"],
        })
    return {"id": str(res.inserted_id), "student_code": student_doc["student_code"]}

@api.delete("/registrations/{rid}")
async def reject_registration(rid: str, _: dict = Depends(require_role("ops_manager", "front_desk"))):
    await db.registrations.update_one(
        {"_id": oid(rid)},
        {"$set": {"status": "rejected", "rejected_at": iso(now_utc())}},
    )
    return {"ok": True}

# ---------------------------- Students CSV import ----------------------------
class StudentImportRow(BaseModel):
    rows: List[dict]

@api.post("/students/import")
async def import_students(payload: StudentImportRow, user: dict = Depends(require_role("ops_manager", "front_desk"))):
    """Bulk import students. Expected fields per row:
    full_name, parent_name, parent_whatsapp, parent_email, dob, gender, address,
    payment_plan (monthly|quarterly|annual), level_code, batch_name, enrollment_date.
    Missing optional fields default to empty/none."""
    levels = await db.levels.find().to_list(500)
    batches = await db.batches.find().to_list(500)
    level_by_code = {(l.get("code") or "").upper(): str(l["_id"]) for l in levels}
    batch_by_name = {(b.get("name") or "").lower(): str(b["_id"]) for b in batches}

    created, errors = [], []
    for idx, row in enumerate(payload.rows, start=1):
        try:
            full_name = (row.get("full_name") or "").strip()
            parent_name = (row.get("parent_name") or "").strip()
            parent_whatsapp = (row.get("parent_whatsapp") or "").strip()
            if not full_name or not parent_name or not parent_whatsapp:
                errors.append({"row": idx, "reason": "full_name / parent_name / parent_whatsapp required"})
                continue
            level_id = level_by_code.get((row.get("level_code") or "").upper())
            batch_id = batch_by_name.get((row.get("batch_name") or "").lower())
            email_val = (row.get("parent_email") or "").strip() or None
            plan = (row.get("payment_plan") or "monthly").strip().lower()
            if plan not in ("monthly", "quarterly", "annual"):
                plan = "monthly"
            doc = {
                "full_name": full_name,
                "dob": (row.get("dob") or "").strip() or None,
                "gender": (row.get("gender") or "other").strip().lower(),
                "parent_name": parent_name,
                "parent_whatsapp": parent_whatsapp,
                "parent_email": email_val,
                "address": (row.get("address") or "").strip(),
                "level_id": level_id,
                "batch_id": batch_id,
                "payment_plan": plan,
                "concession_pct": float(row.get("concession_pct") or 0),
                "referred_by": (row.get("referred_by") or "").strip(),
                "status": "active",
                "student_code": await gen_student_code(),
                "enrollment_date": (row.get("enrollment_date") or "").strip() or date.today().isoformat(),
                "created_at": iso(now_utc()),
                "created_by": user["id"],
            }
            res = await db.students.insert_one(doc)
            created.append({"id": str(res.inserted_id), "student_code": doc["student_code"], "full_name": full_name})
        except Exception as e:
            errors.append({"row": idx, "reason": str(e)})
    return {"created": len(created), "errors": errors, "details": created}

# ---------------------------- Mount ----------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_BUILD_DIR = ROOT_DIR / "frontend_build"
if FRONTEND_BUILD_DIR.exists():
    static_dir = FRONTEND_BUILD_DIR / "static"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "Not found")
        requested = FRONTEND_BUILD_DIR / full_path
        if requested.is_file():
            return FileResponse(requested)
        return FileResponse(FRONTEND_BUILD_DIR / "index.html")
