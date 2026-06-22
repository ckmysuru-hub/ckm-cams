from html import escape


EMAIL_TEMPLATES = {
    "student_welcome": {
        "subject": "Welcome to {academy_name}, {student_name} ",
        "html": """
        <p>Hi {parent_name},</p>

    <p>Welcome to the CHESS KLUB family!</p>

    <p>We are very excited to have <strong>{student_name}</strong> on board, and we look forward to helping her/him take this beautiful game of Chess to the next level.</p>

    <p>Below are the class details for {student_name}!</p>

    <hr>

    <h2>Onboarding</h2>
    <p>Please follow the below steps for a smooth onboarding:</p>

    <p><strong>STEP 1:</strong> Sign up for <a href="#">CHESS KLUB Online Community</a> and request access to the following:</p>
    <ul>
        <li><a href="https://my.chessklub.com/spaces/3728452/content"> Beginner Level 1 Study Material</a></li>
        <li><a href="https://my.chessklub.com/posts/how-to-guides-how-to-prepare-for-intermediate-1">How to Prepare for Intermediate 1</a></li>
    </ul>

    <p><strong>STEP 2:</strong> Create an account with <a href="https://lichess.org" target="_blank">Lichess.org</a> (for Tournaments)</p>

    <p><strong>STEP 3:</strong> Download WhatsApp (if you already don’t have one. Else skip to Step 4)<br>
    Please go to <a href="https://whatsapp.com/dl" target="_blank">whatsapp.com/dl</a> to download WhatsApp on your phone to receive important updates regarding class schedules, tournaments, and upcoming events at CHESS KLUB.</p>

    <p><strong>STEP 4:</strong> Join the below WhatsApp Groups:</p>
    <ol type="a">
        <li><a href="https://chat.whatsapp.com/CMrqJQ6wpVmKk0FZWAz7o8">CHESS KLUB - Mysuru</a></li>
        <li>Class Specific Group [We will add you to this group]</li>
    </ol>

    <hr>

    <p>Also, please find attached guidelines for the classes. Kindly read through and acknowledge the same. No response to this email will be assumed and considered as an acknowledgment to all the messages and no questions.</p>

    <p>Have a great day!</p>

    <p>
        Warm Regards,<br>
        <strong> {academy_name}</strong><br>
        +91 89516 61957
    </p>
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
            <p><a href="{invoice_pdf_url}">View invoice PDF</a></p>
        """,
    },
    "payment_receipt": {
        "subject": "Payment Receipt {receipt_no}",
        "html": """
            <p>Thank you.</p>
            <p>We have received <b>{amount}</b> towards invoice <b>{invoice_no}</b>.</p>
            <p>Receipt number: <b>{receipt_no}</b>.</p>
            <p><a href="{receipt_pdf_url}">View receipt PDF</a></p>
            <p><a href="{invoice_pdf_url}">View invoice PDF</a></p>
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
