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
        const transportOpts: any = {
          auth: {
            user: config.SMTP_USER,
            pass: config.SMTP_PASS,
          },
        };

        if (isGmail) {
          transportOpts.service = 'gmail';
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
    } else {
      logger.info('SMTP credentials not provided. Verification codes will be printed to application logs.');
      this.isConfigured = false;
    }
  }

  private getFromAddress(): string {
    if (config.SMTP_FROM && !config.SMTP_FROM.includes('no-reply@extensionguard.io')) {
      return config.SMTP_FROM;
    }
    if (config.SMTP_USER) {
      return `ExtensionGuard <${config.SMTP_USER}>`;
    }
    return config.SMTP_FROM || 'ExtensionGuard <no-reply@extensionguard.io>';
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
      } catch (err) {
        logger.error({ err, email }, 'Failed to send verification email via SMTP');
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
      } catch (err) {
        logger.error({ err, email }, 'Failed to send password reset email via SMTP');
        return false;
      }
    } else {
      logger.warn({ email, resetLink }, '📧 [EMAIL SIMULATION] Password reset link generated');
      return true;
    }
  }
}

export const emailService = new EmailService();
