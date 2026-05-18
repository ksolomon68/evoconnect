const nodemailer = require('nodemailer');
const cfg = require('../agency.config');

function createTransport() {
    if (process.env.EMAIL_HOST) {
        return nodemailer.createTransport({
            host:   process.env.EMAIL_HOST,
            port:   parseInt(process.env.EMAIL_PORT || '587', 10),
            secure: process.env.EMAIL_SECURE === 'true',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
    }
    // Dev fallback: log to console
    return {
        sendMail: async (opts) => {
            console.log('\n═══ EMAIL (dev mode) ═══');
            console.log('To:', opts.to);
            console.log('Subject:', opts.subject);
            console.log('Text:', opts.text || '(html only)');
            console.log('════════════════════════\n');
            return { messageId: 'dev-' + Date.now() };
        }
    };
}

const BASE_URL = process.env.APP_URL || 'https://evoconnect.evobrand.net';

function wrap(content) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F8FAFC;margin:0;padding:0}
    .container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .header{background:#0F172A;padding:24px 32px;text-align:center}
    .header h1{color:#06B6D4;margin:0;font-size:1.5rem}
    .header p{color:#94A3B8;margin:4px 0 0;font-size:.85rem}
    .body{padding:32px}
    .body p{color:#334155;line-height:1.6;margin:0 0 16px}
    .btn{display:inline-block;background:#06B6D4;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;margin:8px 0}
    .footer{background:#F1F5F9;padding:16px 32px;text-align:center}
    .footer p{color:#94A3B8;font-size:.8rem;margin:0}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>EvoConnect</h1>
      <p>Connect the Contract. Build the Future.</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>© 2026 EvoConnect — a PrimeReach Brand by EVOBRAND Concepts<br>
         <a href="${BASE_URL}" style="color:#06B6D4">${BASE_URL}</a> | 214-531-4427
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function sendEmail({ to, subject, html, text }) {
    const transporter = createTransport();
    try {
        const info = await transporter.sendMail({
            from: `"EvoConnect" <${process.env.EMAIL_FROM || cfg.email}>`,
            to,
            subject,
            html: html || wrap(`<p>${text}</p>`),
            text: text || subject,
        });
        console.log(`EvoConnect Email sent: ${subject} → ${to}`);
        return info;
    } catch (err) {
        console.error('EvoConnect Email error:', err.message);
        throw err;
    }
}

async function sendWorkerWelcome({ to, name }) {
    return sendEmail({
        to, subject: "Welcome to EvoConnect — here's what happens next",
        html: wrap(`
          <p>Hi ${name},</p>
          <p>You're registered on <strong>EvoConnect</strong>. Here's your roadmap:</p>
          <ol>
            <li style="margin-bottom:8px"><strong>Check your NAICS matches</strong> — we matched your trade to federal contract codes.</li>
            <li style="margin-bottom:8px"><strong>Complete the Vendor Readiness Checklist</strong> — start with the SAM.gov Federal track.</li>
            <li style="margin-bottom:8px"><strong>Finish your profile to 100%</strong> — complete profiles appear first in searches.</li>
            <li><strong>Review your Capability Statement</strong> — prime contractors ask for this first.</li>
          </ol>
          <p><a href="${BASE_URL}/labor/dashboard" class="btn">Go to My Dashboard</a></p>
          <p style="font-size:.85rem;color:#64748B">Questions? Email <a href="mailto:${cfg.supportEmail}">${cfg.supportEmail}</a> or call 214-531-4427.</p>
        `)
    });
}

async function sendBusinessWelcome({ to, companyName }) {
    return sendEmail({
        to, subject: 'Your EvoConnect Business profile is live',
        html: wrap(`
          <p>Hi ${companyName},</p>
          <p>Your business profile on <strong>EvoConnect</strong> is now live.</p>
          <ul>
            <li>Review your NAICS code matches</li>
            <li>Generate your Capability Statement</li>
            <li>Complete the Vendor Readiness Checklist</li>
          </ul>
          <p><a href="${BASE_URL}/business/dashboard" class="btn">Go to My Dashboard</a></p>
        `)
    });
}

async function sendPrimeWelcomePending({ to, companyName }) {
    return sendEmail({
        to, subject: 'Welcome to EvoConnect Prime — your account is pending approval',
        html: wrap(`
          <p>Hi ${companyName},</p>
          <p>Your <strong>EvoConnect Prime</strong> account is under review. Our team will verify your information within <strong>24 business hours</strong>.</p>
          <p>Once approved, you'll receive a confirmation email with full directory access.</p>
          <p>Questions? Contact <a href="mailto:${cfg.supportEmail}">${cfg.supportEmail}</a></p>
        `)
    });
}

async function sendPrimeApproved({ to, companyName }) {
    return sendEmail({
        to, subject: 'Your EvoConnect Prime account is approved',
        html: wrap(`
          <p>Hi ${companyName},</p>
          <p>Your <strong>EvoConnect Prime</strong> account has been approved.</p>
          <p><a href="${BASE_URL}/prime/dashboard" class="btn">Access Prime Dashboard</a></p>
        `)
    });
}

async function sendPrimeDenied({ to, companyName, reason }) {
    return sendEmail({
        to, subject: 'EvoConnect Prime — account application update',
        html: wrap(`
          <p>Hi ${companyName},</p>
          <p>After review, we are unable to approve your EvoConnect Prime account at this time.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>Contact <a href="mailto:${cfg.supportEmail}">${cfg.supportEmail}</a> with questions.</p>
        `)
    });
}

async function sendAdminNewPrime({ to, companyName }) {
    return sendEmail({
        to, subject: `New Prime Registration: ${companyName}`,
        html: wrap(`
          <p>A new prime contractor registered and requires approval: <strong>${companyName}</strong></p>
          <p><a href="${BASE_URL}/admin/dashboard" class="btn">Review in Admin Dashboard</a></p>
        `)
    });
}

async function sendConnectionRequest({ to, recipientName, primeCompany, message, dashboardUrl }) {
    return sendEmail({
        to, subject: `New Connection Request from ${primeCompany}`,
        html: wrap(`
          <p>Hi ${recipientName},</p>
          <p><strong>${primeCompany}</strong> sent you a connection request on EvoConnect.</p>
          ${message ? `<blockquote style="border-left:3px solid #06B6D4;padding-left:12px;margin:16px 0;color:#334155">${message}</blockquote>` : ''}
          <p><a href="${dashboardUrl || BASE_URL}" class="btn">View Request</a></p>
        `)
    });
}

async function sendConnectionAccepted({ to, recipientName }) {
    return sendEmail({
        to, subject: `${recipientName} accepted your connection request`,
        html: wrap(`
          <p><strong>${recipientName}</strong> accepted your connection request.</p>
          <p><a href="${BASE_URL}/prime/dashboard" class="btn">Go to Prime Dashboard</a></p>
        `)
    });
}

async function sendChecklistMilestone({ to, name, track, pct }) {
    const label = { federal: 'Federal (SAM.gov)', state: 'Texas State', subcontractor: 'Subcontractor Ready' }[track] || track;
    return sendEmail({
        to, subject: `You're ${pct}% complete on your ${label} checklist`,
        html: wrap(`
          <p>Hi ${name},</p>
          <p>You hit <strong>${pct}% complete</strong> on your <strong>${label}</strong> vendor readiness track.</p>
          ${pct === 100 ? '<p>Your track is <strong>complete</strong>. Prime contractors can now see your full vendor readiness status.</p>' :
            '<p>Keep going — a complete checklist increases your visibility to prime contractors.</p>'}
          <p><a href="${BASE_URL}/labor/dashboard" class="btn">Continue Checklist</a></p>
        `)
    });
}

async function sendPasswordReset({ to, resetUrl }) {
    return sendEmail({
        to, subject: 'Reset your EvoConnect password',
        html: wrap(`
          <p>You requested a password reset for your EvoConnect account.</p>
          <p>Click below to set a new password. This link expires in <strong>1 hour</strong>.</p>
          <p><a href="${resetUrl}" class="btn">Reset Password</a></p>
          <p style="font-size:.85rem;color:#64748B">If you didn't request this, ignore this email.</p>
          <p style="font-size:.85rem;color:#64748B">Link: ${resetUrl}</p>
        `)
    });
}

module.exports = {
    sendEmail,
    sendWorkerWelcome,
    sendBusinessWelcome,
    sendPrimeWelcomePending,
    sendPrimeApproved,
    sendPrimeDenied,
    sendAdminNewPrime,
    sendConnectionRequest,
    sendConnectionAccepted,
    sendChecklistMilestone,
    sendPasswordReset,
};
