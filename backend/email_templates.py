from html import escape


EMAIL_TEMPLATES = {
    "student_welcome": {
        "subject": "Welcome to {academy_name}",
        "html": """
            <p>Dear Parent,</p>
            <p>Your child <b>{student_name}</b> has been enrolled at {academy_name}.</p>
            <p>Student ID: <b>{student_code}</b>.</p>
        """,
    },
    "registration_received": {
        "subject": "Registration received - {academy_name}",
        "html": """
            <p>Dear {parent_name},</p>
            <p>We've received your registration for <b>{student_name}</b>.</p>
            <p>Our team will review it and confirm shortly.</p>
        """,
    },
    "registration_confirmed": {
        "subject": "Enrolment confirmed - {academy_name}",
        "html": """
            <p>Dear {parent_name},</p>
            <p>We're delighted to confirm <b>{student_name}</b>'s enrolment.</p>
            <p>Student ID: <b>{student_code}</b>.</p>
            <p>See you at the board!</p>
        """,
    },
    "payment_reminder": {
        "subject": "Payment Reminder - {invoice_no}",
        "html": """
            <p>Dear Parent,</p>
            <p>This is a reminder for invoice <b>{invoice_no}</b> for <b>{student_name}</b>.</p>
            <p>Balance due: <b>{balance}</b>. Due date: <b>{due_date}</b>.</p>
        """,
    },
    "payment_receipt": {
        "subject": "Payment Receipt {receipt_no}",
        "html": """
            <p>Thank you.</p>
            <p>We have received <b>{amount}</b> towards invoice <b>{invoice_no}</b>.</p>
            <p>Receipt number: <b>{receipt_no}</b>.</p>
        """,
    },
    "notify_test": {
        "subject": "Test email from {academy_name}",
        "html": """
            <p>{message}</p>
            <p style="color:#777">Sent from Chess Klub Mysuru CAMS.</p>
        """,
    },
}


def render_email_template(name: str, context: dict) -> tuple[str, str]:
    template = EMAIL_TEMPLATES[name]
    safe_context = {k: escape(str(v if v is not None else "")) for k, v in context.items()}
    return template["subject"].format_map(safe_context), template["html"].format_map(safe_context)
