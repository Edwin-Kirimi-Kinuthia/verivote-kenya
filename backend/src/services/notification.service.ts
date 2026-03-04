import nodemailer from 'nodemailer';
import AfricasTalking from 'africastalking';
import type { OtpPurpose } from './otp.service.js';

export interface OtpNotificationPayload {
  channel: 'SMS' | 'EMAIL';
  recipient: string;         // +254XXXXXXXXX or email address
  nationalId: string;
  code: string;              // plaintext 6-digit OTP (sent once, never stored)
  purpose: OtpPurpose;
}

export interface DistressPinPayload {
  channel: 'SMS' | 'EMAIL';
  recipient: string;
  nationalId: string;
  distressPin: string;
  context: 'REGISTRATION' | 'PIN_RESET';
}

export class NotificationService {
  private mockMode = process.env.NOTIFICATION_MOCK === 'true';
  private atSms: ReturnType<typeof AfricasTalking>['SMS'] | null = null;
  private smtp: nodemailer.Transporter | null = null;

  constructor() {
    if (!this.mockMode) {
      const at = AfricasTalking({
        apiKey: process.env.AT_API_KEY!,
        username: process.env.AT_USERNAME!,
      });
      this.atSms = at.SMS;
      this.smtp = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    }
  }

  /**
   * Send a one-time password to the voter via SMS or email.
   * In mock mode, logs to console only (no external calls).
   */
  async sendOtp(payload: OtpNotificationPayload): Promise<void> {
    if (this.mockMode) {
      console.log(
        `[OTP MOCK] nationalId=${payload.nationalId} purpose=${payload.purpose}` +
        ` channel=${payload.channel} code=${payload.code}`,
      );
      return;
    }

    // Always log OTP to console in development for easy testing
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP DEV] nationalId=${payload.nationalId} purpose=${payload.purpose} channel=${payload.channel} recipient=${payload.recipient} code=${payload.code}`);
    }

    if (payload.channel === 'SMS') {
      try {
        await this.atSms!.send({
          to: [payload.recipient],
          message: this.smsText(payload),
        });
      } catch (smsErr) {
        // In development, fall back to console (AT sandbox doesn't deliver to real phones)
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[SMS FALLBACK] AT failed (${(smsErr as Error).message}). OTP for ${payload.nationalId}: ${payload.code}`);
          return;
        }
        throw smsErr;
      }
    } else {
      try {
        await this.smtp!.sendMail({
          from: process.env.EMAIL_FROM || '"VeriVote Kenya" <noreply@verivote.go.ke>',
          to: payload.recipient,
          subject: this.emailSubject(payload.purpose),
          text: this.emailText(payload),
        });
      } catch (smtpErr) {
        // In development, fall back to console so SMTP misconfiguration doesn't block the demo
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[EMAIL FALLBACK] SMTP failed (${(smtpErr as Error).message}). OTP for ${payload.nationalId}: ${payload.code}`);
          return;
        }
        throw smtpErr;
      }
    }
  }

  /**
   * Send the server-generated distress PIN to the voter after PIN setup.
   * The voter already knows their normal PIN — only the distress PIN is delivered.
   */
  async sendDistressPin(payload: DistressPinPayload): Promise<void> {
    const contextLabel = payload.context === 'REGISTRATION' ? 'registration' : 'PIN reset';

    if (this.mockMode) {
      console.log(
        `[DISTRESS PIN MOCK] nationalId=${payload.nationalId} context=${payload.context}` +
        ` distressPin=${payload.distressPin}`,
      );
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[DISTRESS PIN DEV] nationalId=${payload.nationalId} context=${payload.context}` +
        ` channel=${payload.channel} recipient=${payload.recipient} distressPin=${payload.distressPin}`,
      );
    }

    const smsMsg = (
      `VeriVote Kenya: Your ${contextLabel} distress PIN is ${payload.distressPin}. ` +
      `Use ONLY under coercion. Keep confidential. Never share with anyone.`
    );

    const emailSubject = `VeriVote Kenya — Your ${contextLabel === 'registration' ? 'Registration' : 'PIN Reset'} Distress PIN`;
    const emailBody = [
      `Dear Voter (National ID: ${payload.nationalId}),`,
      ``,
      `Your VeriVote Kenya distress PIN (${contextLabel}) is:`,
      ``,
      `    ${payload.distressPin}`,
      ``,
      `Use the distress PIN ONLY if you are forced to vote against your will.`,
      `It silently alerts IEBC officials and flags your vote for review.`,
      `Keep this PIN confidential. Do not share it with anyone, including IEBC officials.`,
      ``,
      `Your normal PIN is the one you chose during setup — keep it private too.`,
      ``,
      `VeriVote Kenya — IEBC`,
    ].join('\n');

    if (payload.channel === 'SMS') {
      try {
        await this.atSms!.send({ to: [payload.recipient], message: smsMsg });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[DISTRESS PIN SMS FALLBACK] AT failed. distressPin for ${payload.nationalId}: ${payload.distressPin}`);
          return;
        }
        throw err;
      }
    } else {
      try {
        await this.smtp!.sendMail({
          from: process.env.EMAIL_FROM || '"VeriVote Kenya" <noreply@verivote.go.ke>',
          to: payload.recipient,
          subject: emailSubject,
          text: emailBody,
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[DISTRESS PIN EMAIL FALLBACK] SMTP failed. distressPin for ${payload.nationalId}: ${payload.distressPin}`);
          return;
        }
        throw err;
      }
    }
  }

  /**
   * Send a PIN setup link to the voter after admin in-person registration.
   * The link contains a short-lived JWT so the voter can set their PIN on
   * their own device without the admin ever seeing the token.
   */
  async sendPinSetupLink(payload: {
    channel: 'SMS' | 'EMAIL';
    recipient: string;
    nationalId: string;
    setupUrl: string;
  }): Promise<void> {
    if (this.mockMode) {
      console.log(
        `[PIN SETUP LINK MOCK] nationalId=${payload.nationalId} channel=${payload.channel} url=${payload.setupUrl}`,
      );
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[PIN SETUP LINK DEV] nationalId=${payload.nationalId} channel=${payload.channel}` +
        ` recipient=${payload.recipient} url=${payload.setupUrl}`,
      );
    }

    const smsMsg =
      `VeriVote Kenya: Complete your voter registration by setting your PIN here: ${payload.setupUrl}` +
      ` — Link expires in 24 hours. Do not share it with anyone.`;

    const emailBody = [
      `Dear Voter (National ID: ${payload.nationalId}),`,
      ``,
      `Your in-person voter registration at an IEBC office is complete.`,
      `Please click the link below on your personal device to set your private voting PIN:`,
      ``,
      `    ${payload.setupUrl}`,
      ``,
      `This link expires in 24 hours and can only be used once.`,
      `Do not share this link with anyone — including IEBC officials.`,
      ``,
      `After you set your PIN, a separate distress PIN will be sent to this contact.`,
      `Use the distress PIN ONLY if you are ever forced to vote against your will —`,
      `it silently flags your vote for IEBC review without alerting anyone present.`,
      ``,
      `VeriVote Kenya — IEBC`,
    ].join('\n');

    if (payload.channel === 'SMS') {
      try {
        await this.atSms!.send({ to: [payload.recipient], message: smsMsg });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[PIN SETUP LINK SMS FALLBACK] AT failed. URL for ${payload.nationalId}: ${payload.setupUrl}`);
          return;
        }
        throw err;
      }
    } else {
      try {
        await this.smtp!.sendMail({
          from: process.env.EMAIL_FROM || '"VeriVote Kenya" <noreply@verivote.go.ke>',
          to: payload.recipient,
          subject: 'VeriVote Kenya — Set Your Voting PIN',
          text: emailBody,
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[PIN SETUP LINK EMAIL FALLBACK] SMTP failed. URL for ${payload.nationalId}: ${payload.setupUrl}`);
          return;
        }
        throw err;
      }
    }
  }

  isMockMode(): boolean {
    return this.mockMode;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private purposeLabel(purpose: OtpPurpose): string {
    switch (purpose) {
      case 'LOGIN':             return 'login';
      case 'CONTACT_VERIFY':   return 'contact verification';
      case 'CREDENTIAL_RESET': return 'credential reset';
    }
  }

  private smsText({ code, purpose }: OtpNotificationPayload): string {
    return (
      `VeriVote Kenya: Your ${this.purposeLabel(purpose)} OTP is ${code}. ` +
      `Valid for 10 minutes. Never share this code with anyone.`
    );
  }

  private emailSubject(purpose: OtpPurpose): string {
    return `VeriVote Kenya — Your ${this.purposeLabel(purpose)} OTP`;
  }

  private emailText({ code, nationalId, purpose }: OtpNotificationPayload): string {
    return [
      `Dear Voter (National ID: ${nationalId}),`,
      ``,
      `Your VeriVote Kenya ${this.purposeLabel(purpose)} one-time password is:`,
      ``,
      `    ${code}`,
      ``,
      `This code is valid for 10 minutes and can only be used once.`,
      `If you did not request this code, please contact IEBC support immediately.`,
      ``,
      `NEVER share this code with anyone — IEBC officials will never ask for it.`,
      ``,
      `VeriVote Kenya — IEBC`,
    ].join('\n');
  }
}

export const notificationService = new NotificationService();
