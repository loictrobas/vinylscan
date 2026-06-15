import os
import asyncio
import logging
from datetime import datetime

import httpx

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("EMAIL_FROM", "VinylScan <noreply@vinylscan.app>")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

_BASE = "https://api.resend.com"


def _header() -> dict:
    return {"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"}


async def _send(to: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        logger.info(f"[email skip] no RESEND_API_KEY — would send '{subject}' to {to}")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{_BASE}/emails",
                headers=_header(),
                json={"from": FROM_EMAIL, "to": [to], "subject": subject, "html": html},
            )
            if r.status_code not in (200, 201):
                logger.warning(f"[email] resend error {r.status_code}: {r.text[:200]}")
                return False
        return True
    except Exception as e:
        logger.warning(f"[email] send failed: {e}")
        return False


def _base_template(body_html: str, preview: str = "") -> str:
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>VinylScan</title>
</head>
<body style="margin:0;padding:0;background:#f7f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
{f'<div style="display:none;max-height:0;overflow:hidden;color:#f7f7fa;">{preview}</div>' if preview else ''}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fa;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <!-- Header -->
      <tr><td style="padding:0 0 24px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;">
          <div style="width:28px;height:28px;background:#1e3a4f;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
            <span style="color:#9db4c6;font-size:14px;">◎</span>
          </div>
          <span style="font-size:15px;font-weight:600;color:#16162a;">VinylScan</span>
        </div>
      </td></tr>
      <!-- Card -->
      <tr><td style="background:#fff;border:1px solid #e5e5ec;border-radius:16px;padding:32px 40px;">
        {body_html}
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:24px 0;text-align:center;font-size:12px;color:#8a8a9e;">
        VinylScan — Record store management<br>
        <a href="{FRONTEND_URL}" style="color:#4a7fa0;text-decoration:none;">vinylscan.app</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""


async def send_welcome(to: str, display_name: str) -> bool:
    name = display_name or to.split("@")[0]
    body = f"""
<h1 style="font-size:22px;font-weight:700;color:#16162a;margin:0 0 8px 0;">Welcome to VinylScan, {name}!</h1>
<p style="font-size:15px;color:#4a4a68;line-height:1.6;margin:0 0 24px 0;">
  Your account is ready. Start by scanning your first record — point your camera at any sleeve and our AI identifies it in seconds.
</p>
<table cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
  <tr>
    <td style="background:#4a7fa0;border-radius:10px;padding:0;">
      <a href="{FRONTEND_URL}/scan" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;">
        Scan your first record →
      </a>
    </td>
  </tr>
</table>
<p style="font-size:13px;color:#8a8a9e;margin:0;">
  You get <strong style="color:#16162a;">5 free scan credits</strong> to start, plus a 14-day Pro trial when you upgrade.
</p>"""
    return await _send(to, "Welcome to VinylScan 🎵", _base_template(body, f"Your record store management account is ready, {name}."))


async def send_trial_ending(to: str, display_name: str, days_left: int, trial_end_date: str) -> bool:
    name = display_name or to.split("@")[0]
    urgency = "ends tomorrow" if days_left <= 1 else f"ends in {days_left} days"
    body = f"""
<h1 style="font-size:22px;font-weight:700;color:#16162a;margin:0 0 8px 0;">Your trial {urgency}</h1>
<p style="font-size:15px;color:#4a4a68;line-height:1.6;margin:0 0 16px 0;">
  Hey {name}, your VinylScan Pro trial ends on <strong>{trial_end_date}</strong>.
  After that, you'll lose access to unlimited scanning, POS, and sales tracking.
</p>
<table cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
  <tr>
    <td style="background:#4a7fa0;border-radius:10px;padding:0;">
      <a href="{FRONTEND_URL}/subscription" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;">
        Keep my Pro access — $29/mo →
      </a>
    </td>
  </tr>
</table>
<p style="font-size:13px;color:#8a8a9e;margin:0;">
  You can cancel anytime from your billing dashboard. No hidden fees.
</p>"""
    return await _send(to, f"Your VinylScan trial {urgency}", _base_template(body))


async def send_payment_failed(to: str, display_name: str) -> bool:
    name = display_name or to.split("@")[0]
    body = f"""
<h1 style="font-size:22px;font-weight:700;color:#16162a;margin:0 0 8px 0;">Payment failed</h1>
<p style="font-size:15px;color:#4a4a68;line-height:1.6;margin:0 0 16px 0;">
  Hey {name}, we couldn't process your VinylScan Pro payment. Your subscription is at risk of canceling.
</p>
<table cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
  <tr>
    <td style="background:#dc2626;border-radius:10px;padding:0;">
      <a href="{FRONTEND_URL}/subscription" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;">
        Update payment method →
      </a>
    </td>
  </tr>
</table>
<p style="font-size:13px;color:#8a8a9e;margin:0;">
  Update your card via the billing dashboard. Stripe will retry automatically.
</p>"""
    return await _send(to, "Action required: VinylScan payment failed", _base_template(body))


async def send_subscription_canceled(to: str, display_name: str) -> bool:
    name = display_name or to.split("@")[0]
    body = f"""
<h1 style="font-size:22px;font-weight:700;color:#16162a;margin:0 0 8px 0;">Your subscription was canceled</h1>
<p style="font-size:15px;color:#4a4a68;line-height:1.6;margin:0 0 16px 0;">
  Hey {name}, your VinylScan Pro subscription has been canceled. You've been moved to the free plan.
  Your catalog is safe — you just won't be able to access Pro features.
</p>
<table cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
  <tr>
    <td style="background:#4a7fa0;border-radius:10px;padding:0;">
      <a href="{FRONTEND_URL}/subscription" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;">
        Resubscribe →
      </a>
    </td>
  </tr>
</table>
<p style="font-size:13px;color:#8a8a9e;margin:0;">
  Changed your mind? You can resubscribe anytime. Your data is always preserved.
</p>"""
    return await _send(to, "VinylScan Pro canceled", _base_template(body))
