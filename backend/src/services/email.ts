import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

class EmailService {
  private transporter: Transporter | null = null;
  private isConfigured = false;

  constructor() {
    this.init();
  }

  private init() {
    const isGmail = config.SMTP_SERVICE === 'gmail' ||
      config.SMTP_HOST?.toLowerCase().includes('gmail') ||
      (config.SMTP_USER?.toLowerCase().endsWith('@gmail.com') && !config.SMTP_HOST);

    const hasCreds = config.SMTP_USER && config.SMTP_PASS && (config.SMTP_HOST || isGmail);

    if (hasCreds) {
      try {
        const cleanPass = isGmail && config.SMTP_PASS
          ? config.SMTP_PASS.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '')
          : (config.SMTP_PASS?.trim() || '');

        const transportOpts: any = {
          auth: {
            user: config.SMTP_USER?.trim(),
            pass: cleanPass,
          },
        };

        if (isGmail) {
          transportOpts.service = 'gmail';
          transportOpts.tls = {
            rejectUnauthorized: false,
          };
        } else {
          transportOpts.host = config.SMTP_HOST;
          transportOpts.port = config.SMTP_PORT || 587;
          transportOpts.secure = config.SMTP_SECURE || config.SMTP_PORT === 465;
        }

        this.transporter = nodemailer.createTransport(transportOpts);
        this.isConfigured = true;
        logger.info({
          mode: isGmail ? 'gmail-service' : 'custom-smtp',
          host: isGmail ? 'smtp.gmail.com' : config.SMTP_HOST,
          user: config.SMTP_USER
        }, 'SMTP Email service initialized and ready');
      } catch (err) {
        logger.error({ err }, 'Failed to initialize SMTP transporter');
        this.isConfigured = false;
      }
    } else if (config.GMAIL_SCRIPT_URL) {
      this.isConfigured = true;
      logger.info('Google Apps Script Web App initialized for Gmail delivery (HTTPS port 443)');
    } else if (config.RESEND_API_KEY) {
      this.isConfigured = true;
      logger.info('Resend HTTP API initialized for email delivery (HTTPS port 443)');
    } else if (config.BREVO_API_KEY) {
      this.isConfigured = true;
      logger.info('Brevo HTTP API initialized for email delivery (HTTPS port 443)');
    } else {
      logger.info('Email credentials not provided. Verification codes will be printed to application logs.');
      this.isConfigured = false;
    }
  }

  public getStatus() {
    const mode = config.GMAIL_SCRIPT_URL
      ? 'gmail-script'
      : config.RESEND_API_KEY
      ? 'resend-api'
      : config.BREVO_API_KEY
      ? 'brevo-api'
      : this.isConfigured && this.transporter
      ? 'smtp'
      : 'simulation';

    return {
      configured: mode !== 'simulation',
      mode,
      sender: this.getFromAddress(),
    };
  }

  public async testDiagnostic(to: string) {
    if (!config.GMAIL_SCRIPT_URL) {
      return { ok: false, error: 'GMAIL_SCRIPT_URL is not configured' };
    }

    try {
      const res = await fetch(config.GMAIL_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: 'ExtensionGuard Diagnostic Test',
          html: '<p>This is a live test from ExtensionGuard.</p>',
          text: 'This is a live test from ExtensionGuard.',
          secret: config.GMAIL_SCRIPT_SECRET || 'guard-secret-2026',
        }),
        redirect: 'follow',
      });

      const rawBody = await res.text().catch(() => '');
      let parsed = null;
      try { parsed = JSON.parse(rawBody); } catch {}

      return {
        httpStatus: res.status,
        rawBody: rawBody.slice(0, 500),
        parsed,
        success: parsed?.success === true || parsed?.status === 'success',
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  private getFromAddress(): string {
    if (config.RESEND_API_KEY) {
      if (config.SMTP_FROM && !config.SMTP_FROM.includes('no-reply@extensionguard.io')) {
        return config.SMTP_FROM;
      }
      return 'ExtensionGuard <onboarding@resend.dev>';
    }

    if (config.SMTP_FROM && !config.SMTP_FROM.includes('no-reply@extensionguard.io')) {
      return config.SMTP_FROM;
    }
    if (config.SMTP_USER) {
      return `ExtensionGuard <${config.SMTP_USER}>`;
    }
    return config.SMTP_FROM || 'ExtensionGuard <no-reply@extensionguard.io>';
  }

  /**
   * Dispatch email via HTTP REST API (port 443) — never blocked by cloud firewalls like Render free tier
   */
  private async sendViaHttp(to: string, subject: string, html: string, text: string): Promise<boolean> {
    if (config.GMAIL_SCRIPT_URL) {
      try {
        const res = await fetch(config.GMAIL_SCRIPT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to,
            subject,
            html,
            text,
            secret: config.GMAIL_SCRIPT_SECRET || 'guard-secret-2026',
          }),
          redirect: 'follow',
        });

        const resText = await res.text().catch(() => '');
        let parsedJson: any = null;
        try { parsedJson = JSON.parse(resText); } catch {}

        if (res.ok && (parsedJson?.success === true || parsedJson?.status === 'success')) {
          logger.info({ email: to }, 'Email sent successfully via Google Apps Script (HTTPS port 443)');
          return true;
        } else {
          logger.error({ status: res.status, resText: resText.slice(0, 300) }, 'Google Apps Script failed to dispatch email');
          return false;
        }
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to dispatch email via Google Apps Script');
        return false;
      }
    }

    if (config.RESEND_API_KEY) {
      try {
        const from = this.getFromAddress();
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.RESEND_API_KEY.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [to],
            subject,
            html,
            text,
          }),
        });

        if (res.ok) {
          logger.info({ email: to }, 'Verification email sent via Resend API (HTTPS port 443)');
          return true;
        } else {
          const errBody = await res.text().catch(() => '');
          logger.error({ status: res.status, errBody }, 'Resend API returned error response');
          return false;
        }
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to dispatch email via Resend API');
        return false;
      }
    }

    if (config.BREVO_API_KEY) {
      try {
        const senderEmail = config.SMTP_USER || 'security@extensionguard.io';
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': config.BREVO_API_KEY.trim(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'ExtensionGuard', email: senderEmail },
            to: [{ email: to }],
            subject,
            htmlContent: html,
            textContent: text,
          }),
        });

        if (res.ok) {
          logger.info({ email: to }, 'Verification email sent via Brevo API (HTTPS port 443)');
          return true;
        } else {
          const errBody = await res.text().catch(() => '');
          logger.error({ status: res.status, errBody }, 'Brevo API returned error response');
          return false;
        }
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to dispatch email via Brevo API');
        return false;
      }
    }

    return false;
  }

  /**
   * Send an account verification email containing an OTP code and verification link
   */
  async sendVerificationEmail(email: string, otpCode: string, token: string): Promise<boolean> {
    const frontendUrl = (config.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const verifyLink = `${frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;

    const subject = 'Verify your ExtensionGuard Account';
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #0f172a; padding: 28px 32px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .content { padding: 32px; color: #1e293b; line-height: 1.6; }
    .otp-box { background: #f8fafc; border: 2px dashed #0284c7; border-radius: 8px; text-align: center; padding: 18px; margin: 24px 0; }
    .otp-code { font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0284c7; font-family: monospace; }
    .btn { display: inline-block; background: #0284c7; color: #ffffff !important; padding: 12px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; margin: 16px 0; }
    .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e5e7eb; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛡️ ExtensionGuard Security</h1>
    </div>
    <div class="content">
      <h2>Verify your email address</h2>
      <p>Welcome to ExtensionGuard. Please use the verification code below to confirm your email and activate your account:</p>
      
      <div class="otp-box">
        <div class="otp-code">${otpCode}</div>
        <p style="margin: 6px 0 0 0; font-size: 12px; color: #64748b;">This code expires in 24 hours</p>
      </div>

      <p>Or click the button below to verify directly:</p>
      <p style="text-align: center;">
        <a href="${verifyLink}" class="btn">Verify My Account</a>
      </p>

      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">
        If you did not create an ExtensionGuard account, please disregard this email.
      </p>
    </div>
    <div class="footer">
      ExtensionGuard Automated Security Platform &bull; Keep your browser extensions secure
    </div>
  </div>
</body>
</html>
    `;

    const text = `Welcome to ExtensionGuard!\n\nYour verification code is: ${otpCode}\n\nOr verify directly at: ${verifyLink}\n\nThis code expires in 24 hours.`;

    // 1. Try HTTPS API first if available (bypasses Render/cloud SMTP firewall restrictions)
    if (config.GMAIL_SCRIPT_URL || config.RESEND_API_KEY || config.BREVO_API_KEY) {
      const httpSuccess = await this.sendViaHttp(email, subject, html, text);
      if (httpSuccess) return true;
    }

    // 2. Fall back to standard SMTP if configured
    if (this.isConfigured && this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.getFromAddress(),
          to: email,
          subject,
          text,
          html,
        });
        logger.info({ email }, 'Verification email sent via SMTP');
        return true;
      } catch (err: any) {
        logger.error({
          err: err?.message,
          code: err?.code,
          email
        }, 'Failed to send verification email via SMTP. (Note: Render free tier blocks outbound SMTP ports 25, 465, 587. Configure RESEND_API_KEY or BREVO_API_KEY to send via HTTPS port 443).');
        return false;
      }
    } else {
      logger.warn({ email, otpCode, verifyLink }, '📧 [EMAIL SIMULATION] Verification Code generated');
      return true;
    }
  }

  /**
   * Send a password reset email
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
    const frontendUrl = (config.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const resetLink = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;

    const subject = 'ExtensionGuard: Reset your password';
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #0f172a; padding: 28px 32px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; }
    .content { padding: 32px; color: #1e293b; line-height: 1.6; }
    .btn { display: inline-block; background: #dc2626; color: #ffffff !important; padding: 12px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; margin: 20px 0; }
    .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e5e7eb; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛡️ ExtensionGuard Security</h1>
    </div>
    <div class="content">
      <h2>Password Reset Request</h2>
      <p>We received a request to reset the password for your ExtensionGuard account.</p>
      <p style="text-align: center;">
        <a href="${resetLink}" class="btn">Reset My Password</a>
      </p>
      <p style="font-size: 13px; color: #64748b;">
        This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">
      ExtensionGuard Security Notification
    </div>
  </div>
</body>
</html>
    `;

    const text = `Reset your ExtensionGuard password by clicking: ${resetLink}\n\nThis link expires in 1 hour.`;

    // 1. Try HTTPS API first if available
    if (config.GMAIL_SCRIPT_URL || config.RESEND_API_KEY || config.BREVO_API_KEY) {
      const httpSuccess = await this.sendViaHttp(email, subject, html, text);
      if (httpSuccess) return true;
    }

    // 2. Fall back to SMTP
    if (this.isConfigured && this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.getFromAddress(),
          to: email,
          subject,
          text,
          html,
        });
        logger.info({ email }, 'Password reset email sent via SMTP');
        return true;
      } catch (err: any) {
        logger.error({
          err: err?.message,
          code: err?.code,
          email
        }, 'Failed to send password reset email via SMTP. (Note: Render free tier blocks outbound SMTP ports 25, 465, 587. Configure RESEND_API_KEY or BREVO_API_KEY to send via HTTPS port 443).');
        return false;
      }
    } else {
      logger.warn({ email, resetLink }, '📧 [EMAIL SIMULATION] Password reset link generated');
      return true;
    }
  }
}

export const emailService = new EmailService();
