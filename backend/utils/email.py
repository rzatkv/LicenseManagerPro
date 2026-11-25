"""Optional email sending via SMTP.

All SMTP settings come from environment variables (see config.py); nothing
is hardcoded. The function is unused by default and returns False when no
SMTP server is configured instead of raising.
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import (
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_TLS,
    SMTP_USER,
)


def send_email(
    subject: str,
    body: str,
    to_emails: list[str],
    from_email: str | None = None,
    password: str | None = None,
) -> bool:
    """Send an HTML email. Returns True on success, False otherwise."""
    if not SMTP_HOST:
        print("SMTP is not configured (SMTP_HOST is empty); email not sent.")
        return False

    sender = from_email or SMTP_FROM or SMTP_USER
    smtp_password = password if password is not None else SMTP_PASSWORD
    try:
        msg = MIMEMultipart()
        msg["From"] = sender
        msg["To"] = ", ".join(to_emails)
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            if SMTP_USE_TLS:
                server.starttls()
            if SMTP_USER and smtp_password:
                server.login(SMTP_USER, smtp_password)
            server.sendmail(sender, to_emails, msg.as_string())

        print(f"Email sent successfully to: {', '.join(to_emails)}")
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False
