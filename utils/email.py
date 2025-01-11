import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List

SMTP_SERVER = "smtp.office365.com"
SMTP_PORT = 587


def send_email(subject: str, body: str, to_emails: List[str], from_email: str, password: str):
    """
    ارسال ایمیل با استفاده از SMTP.
    """
    try:
        # ایجاد پیام ایمیل
        msg = MIMEMultipart()
        msg["From"] = from_email
        msg["To"] = ", ".join(to_emails)
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html"))

        # اتصال به سرور SMTP
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()  # شروع ارتباط امن
            server.login(from_email, password)
            server.sendmail(from_email, to_emails, msg.as_string())

        print(f"Email sent successfully to: {', '.join(to_emails)}")
    except Exception as e:
        print(f"Failed to send email: {e}")
