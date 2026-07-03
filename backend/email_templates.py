from html import escape


class SafeTemplateContext(dict):
    def __missing__(self, key):
        return ""

EMAIL_TEMPLATES = {
    "student_welcome": {
        "subject": "Welcome to {academy_name}, {student_name}",
        "html": """
        <p>Hi {parent_name},</p>

    <p>Welcome to the CHESS KLUB family!</p>

    <p>We are very excited to have <strong>{student_name}</strong> on board, and we look forward to helping her/him take this beautiful game of Chess to the next level.</p>

    <p>Below are the class details for {student_name}!</p>

    <table>
        <tr>
            <td><strong>Student Code:</strong></td>
            <td>{student_code}</td>
        </tr>
        <tr>
            <td><strong>Student Level:</strong></td>
            <td>{student_level}</td>
        </tr>
        <tr>
            <td><strong>Batch:</strong></td>
            <td>{batch}</td>
        </tr>
        <tr>
            <td><strong>Batch Timing:</strong></td>
            <td>{batch_timing}</td>
        </tr>
        <tr>
            <td><strong>Coach Name:</strong></td>
            <td>{coach_name}</td>
        </tr>
    </table>

    <hr>

    <h2>Onboarding</h2>
    <p>Please follow the below steps for a smooth onboarding:</p>

    <p><strong>STEP 1:</strong> Sign up for <a href="https://my.chessklub.com/">CHESS KLUB Online Community</a> and request access to the following:</p>
    <ul>
        <li><a href="{level_url}"> {student_level} Study Material</a></li>
        <li><a href="https://my.chessklub.com/posts/how-to-guides-how-to-prepare-for-intermediate-1">How to Prepare for Intermediate 1</a></li>
    </ul>

    <p><strong>STEP 2:</strong> Create an account with <a href="https://lichess.org" target="_blank">Lichess.org</a> (for Tournaments)</p>

    <p><strong>STEP 3:</strong> Join the below WhatsApp Groups:</p>
    <ol type="a">
        <li><a href="https://chat.whatsapp.com/CMrqJQ6wpVmKk0FZWAz7o8">CHESS KLUB - Mysuru</a></li>
        <li>Class Specific Group [We will add you to this group]</li>
    </ol>

    <hr>

    <p>Also, please find attached guidelines for the classes. Kindly read through and acknowledge the same. No response to this email will be assumed and considered as an acknowledgment to all the[...]

    <p>Have a great day!</p>

    <p>
        Warm Regards,<br>
        <strong> {academy_name}</strong><br>
        +91 89516 61957
    </p>
        """,
    },
    "registration_received": {
        "subject": "Registration received - {academy_name}",
        "html": """
            <p>Dear {parent_name},</p>
            <p>We've received your registration for <b>{student_name}</b>.</p>
            <p>Our team will review it and confirm shortly.</p>
                <p>
        Warm Regards,<br>
        <strong> {academy_name}</strong><br>
        +91 89516 61957
    </p>
        """,
    },
    "registration_confirmed": {
        "subject": "Enrolment confirmed - {academy_name}",
        "html": """
                   <p>Hi {parent_name},</p>

    <p>Welcome to the CHESS KLUB family!</p>

    <p>We are very excited to have <strong>{student_name}</strong> on board, and we look forward to helping her/him take this beautiful game of Chess to the next level.</p>

    <p>Below are the class details for {student_name}!</p>

    <table>
        <tr>
            <td><strong>Student Code:</strong></td>
            <td>{student_code}</td>
        </tr>
        <tr>
            <td><strong>Student Level:</strong></td>
            <td>{student_level}</td>
        </tr>
        <tr>
            <td><strong>Batch:</strong></td>
            <td>{batch}</td>
        </tr>
        <tr>
            <td><strong>Batch Timing:</strong></td>
            <td>{batch_timing}</td>
        </tr>
        <tr>
            <td><strong>Coach Name:</strong></td>
            <td>{coach_name}</td>
        </tr>
    </table>

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
    Please go to <a href="https://whatsapp.com/dl" target="_blank">whatsapp.com/dl</a> to download WhatsApp on your phone to receive important updates regarding class schedules, tournaments, and u[...]

    <p><strong>STEP 4:</strong> Join the below WhatsApp Groups:</p>
    <ol type="a">
        <li><a href="https://chat.whatsapp.com/CMrqJQ6wpVmKk0FZWAz7o8">CHESS KLUB - Mysuru</a></li>
        <li>Class Specific Group [We will add you to this group]</li>
    </ol>

    <hr>

    <p>Also, please find <a href="https://drive.google.com/drive/folders/1OJObwgqvIuT7g3KuZzjx_JwyXejoxAAG"> attached guidelines </a> for the classes. Kindly read through and acknowledge the same. No response to this email will be assumed and considered as an acknowledgment to all the[...]

    <p>Have a great day!</p>

    <p>
        Warm Regards,<br>
        <strong> {academy_name}</strong><br>
        +91 89516 61957
    </p>
        """,
    },
    "payment_reminder": {
        "subject": "Payment Reminder - {invoice_no}",
        "html": """
            <p>Dear Parent,</p>
            <p>This is a reminder for invoice <b>{invoice_no}</b> for <b>{student_name}</b>.</p>
            <p>Balance due: <b>{balance}</b>. Due date: <b>{due_date}</b>.</p>
            <p><a href="{invoice_pdf_url}">View invoice PDF</a></p>
            {payment_button}
                <p>
        Warm Regards,<br>
        <strong> {academy_name}</strong><br>
        +91 89516 61957
    </p>
        """,
    },
    "invoice_created": {
        "subject": "{academy_name} - Invoice Created - {invoice_no}",
        "html": """
            <p>Dear Parent,</p>
            <p>This is to inform you that invoice <b>{invoice_no}</b> for <b>{student_name}'s</b> chess classes has been created.</p>
            <p>Balance due: <b>{balance}</b>. Due date: <b>{due_date}</b>.</p>
            <p><a href="{invoice_pdf_url}">View invoice PDF</a></p>
            {payment_button}
                <p>
        Warm Regards,<br>
        <strong> {academy_name}</strong><br>
        +91 89516 61957
    </p>
        """,
    },
    "payment_receipt": {
        "subject": "Payment Receipt {receipt_no}",
        "html": """
            <p>Thank you.</p>
            <p>We have received <b>{amount}</b> towards invoice <b>{invoice_no}</b>.</p>
            <p>Receipt number: <b>{receipt_no}</b>.</p>
            <p><a href="{receipt_pdf_url}">View receipt PDF</a></p>
                <p>
        Warm Regards,<br>
        <strong> {academy_name}</strong><br>
        +91 89516 61957
    </p>
        """,
    },
    "notify_test": {
        "subject": "Test email from {academy_name}",
        "html": """
            <p>{message}</p>
            <p style="color:#777">Sent from Chess Klub Mysuru CAMS.</p>
        """,
    },
    "student_promoted": {
        "subject": "Promotion update for {student_name} - {academy_name}",
        "html": """
            <p>Dear {parent_name},</p>
            <p>Congratulations! <b>{student_name}</b> has been promoted from <b>{old_level}</b> to <b>{new_level}</b>.</p>
            <p>New batch: <b>{new_batch}</b></p>
            <p>Please find attached the scoresheet and promotion certificate.</p>
            
             <p>Below are the new class details for {student_name}!</p>

    <table>
        <tr>
            <td><strong>New Batch:</strong></td>
            <td>{new_batch}</td>
        </tr>
        <tr>
            <td><strong>Batch Timing:</strong></td>
            <td>{batch_timing}</td>
        </tr>
        <tr>
            <td><strong>Coach Name:</strong></td>
            <td>{coach_name}</td>
        </tr>
        <tr>
            <td><strong>Study Material:</strong></td>
            <td><li><a href="{level_url}"> {new_level} Study Material</a></li></td>
        </tr>
    </table>
            <p>
                Warm Regards,<br>
                <strong>{academy_name}</strong>
            </p>
        """,
    },
}


def render_email_template(name: str, context: dict, raw_context: dict = None) -> tuple[str, str]:
    template = EMAIL_TEMPLATES[name]
    safe_context = SafeTemplateContext({k: escape(str(v if v is not None else "")) for k, v in context.items()})
    if raw_context:
        # Values here are pre-built by our own server code (e.g. a styled payment
        # button pointing at a Razorpay link we just created) - not user input -
        # so they're inserted as-is instead of HTML-escaped.
        safe_context.update(raw_context)
    return template["subject"].format_map(safe_context), template["html"].format_map(safe_context)
