import AfricasTalking from 'africastalking';
import type { OtpPurpose } from './otp.service.js';
import { logger } from '../lib/logger.js';

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

  constructor() {
    if (!this.mockMode) {
      const at = AfricasTalking({
        apiKey: process.env.AT_API_KEY!,
        username: process.env.AT_USERNAME!,
      });
      this.atSms = at.SMS;
    }
  }

  /**
   * Send an email via Mailtrap Email Testing HTTP API.
   * Falls back to a warning log in non-production if the token is missing or the call fails.
   */
  private async sendEmail(opts: {
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    const token   = process.env.MAILTRAP_TOKEN;
    const inboxId = process.env.MAILTRAP_INBOX_ID;

    if (!token || !inboxId) {
      throw new Error('MAILTRAP_TOKEN and MAILTRAP_INBOX_ID must be set in .env');
    }

    const response = await fetch(
      `https://sandbox.api.mailtrap.io/api/send/${inboxId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:    { email: 'noreply@verivote.go.ke', name: 'VeriVote Kenya' },
          to:      [{ email: opts.to }],
          subject: opts.subject,
          text:    opts.text,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Mailtrap API error ${response.status}: ${body}`);
    }
  }

  /**
   * Send a one-time password to the voter via SMS or email.
   * In mock mode, logs to console only (no external calls).
   */
  async sendOtp(payload: OtpNotificationPayload): Promise<void> {
    if (this.mockMode) {
      // Log that OTP was sent in mock mode — do NOT log the code itself
      logger.debug('[OTP MOCK] OTP issued', {
        nationalId: payload.nationalId,
        purpose: payload.purpose,
        channel: payload.channel,
      });
      return;
    }

    // In development, log that OTP was dispatched (recipient only, never the code)
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('[OTP DEV] OTP dispatched', {
        nationalId: payload.nationalId,
        purpose: payload.purpose,
        channel: payload.channel,
        recipient: payload.recipient,
      });
    }

    if (payload.channel === 'SMS') {
      try {
        await this.atSms!.send({
          to: [payload.recipient],
          message: this.smsText(payload),
        });
      } catch (smsErr) {
        // In development, fall back to logger (AT sandbox doesn't deliver to real phones)
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('[SMS FALLBACK] AT send failed — OTP not delivered', {
            nationalId: payload.nationalId,
            reason: (smsErr as Error).message,
          });
          return;
        }
        throw smsErr;
      }
    } else {
      try {
        await this.sendEmail({
          to: payload.recipient,
          subject: this.emailSubject(payload.purpose),
          text: this.emailText(payload),
        });
      } catch (emailErr) {
        // In development, fall back to logger so misconfiguration doesn't block the demo
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('[EMAIL FALLBACK] Mailtrap send failed — OTP not delivered', {
            nationalId: payload.nationalId,
            reason: (emailErr as Error).message,
          });
          return;
        }
        throw emailErr;
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
      // Log delivery event — do NOT log the distress PIN itself
      logger.debug('[DISTRESS PIN MOCK] Distress PIN issued', {
        nationalId: payload.nationalId,
        context: payload.context,
        channel: payload.channel,
      });
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      logger.debug('[DISTRESS PIN DEV] Distress PIN dispatched', {
        nationalId: payload.nationalId,
        context: payload.context,
        channel: payload.channel,
        recipient: payload.recipient,
      });
    }

    const smsMsg = (
      `VeriVote Kenya: Your ${contextLabel} distress PIN is ${payload.distressPin}. ` +
      `Use ONLY if forced to vote against your will. Never share this with anyone — not even IEBC officials.`
    );

    const emailSubject = `VeriVote Kenya — Your Distress PIN (${contextLabel === 'registration' ? 'Registration' : 'PIN Reset'})`;
    const emailBody = [
      `Dear Voter (National ID: ${payload.nationalId}),`,
      ``,
      `Your VeriVote Kenya distress PIN has been generated for ${contextLabel}:`,
      ``,
      `    ${payload.distressPin}`,
      ``,
      `WHAT IS THE DISTRESS PIN?`,
      `Use this PIN ONLY if you are being forced or coerced to vote against your will.`,
      `Voting with the distress PIN casts your vote normally (so no one present can tell),`,
      `but it silently alerts IEBC security officials to investigate your situation.`,
      ``,
      `Keep this PIN confidential. Do not share it with anyone — including IEBC officials.`,
      `Your normal PIN (the one you set yourself) is separate — keep it private too.`,
      ``,
      `VeriVote Kenya — IEBC`,
    ].join('\n');

    if (payload.channel === 'SMS') {
      try {
        await this.atSms!.send({ to: [payload.recipient], message: smsMsg });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('[DISTRESS PIN SMS FALLBACK] AT send failed — distress PIN not delivered', {
            nationalId: payload.nationalId,
            reason: (err as Error).message,
          });
          return;
        }
        throw err;
      }
    } else {
      try {
        await this.sendEmail({
          to: payload.recipient,
          subject: emailSubject,
          text: emailBody,
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('[DISTRESS PIN EMAIL FALLBACK] Mailtrap send failed — distress PIN not delivered', {
            nationalId: payload.nationalId,
            reason: (err as Error).message,
          });
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
      `VeriVote Kenya: Your voter registration is complete. Set your PINs and enroll your fingerprint here: ${payload.setupUrl}` +
      ` — Link expires in 24 hours. Do not share it with anyone, including IEBC officials.`;

    const emailBody = [
      `Dear Voter (National ID: ${payload.nationalId}),`,
      ``,
      `Your in-person voter registration at an IEBC office is complete.`,
      ``,
      `Please open the link below on YOUR OWN personal device (phone or computer) to:`,
      `  1. Optionally enroll your fingerprint or Face ID for quicker login`,
      `  2. Set your Normal PIN — used every time you vote`,
      `  3. Set your Distress PIN — use ONLY if forced to vote against your will;`,
      `     it silently alerts IEBC without revealing coercion to anyone present`,
      ``,
      `    ${payload.setupUrl}`,
      ``,
      `This link expires in 24 hours and can only be used once.`,
      `Do not share this link with anyone — including IEBC officials.`,
      `Both PINs are set by you privately; they are never visible to IEBC officers.`,
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
        await this.sendEmail({
          to: payload.recipient,
          subject: 'VeriVote Kenya — Complete Your Voter Registration Setup',
          text: emailBody,
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[PIN SETUP LINK EMAIL FALLBACK] Mailtrap failed. URL for ${payload.nationalId}: ${payload.setupUrl}`);
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

  /**
   * Alert the IEBC security coordinator when a distress PIN is used.
   * Silent from the voter's perspective — they see a normal confirmation.
   * Configured via DISTRESS_ALERT_PHONE and DISTRESS_ALERT_EMAIL env vars.
   */
  async sendDistressAlert(payload: {
    serialNumber: string;
    stationName: string;
    stationCode: string;
    timestamp: Date;
    recipientPhone?: string;
    recipientEmail?: string;
  }): Promise<void> {
    const coordinatorPhone = payload.recipientPhone ?? process.env.DISTRESS_ALERT_PHONE;
    const coordinatorEmail = payload.recipientEmail ?? process.env.DISTRESS_ALERT_EMAIL;
    const time = payload.timestamp.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });

    const msg = [
      `[VERIVOTE ALERT] Distress PIN activated`,
      `Station: ${payload.stationName} (${payload.stationCode})`,
      `Serial: ${payload.serialNumber}`,
      `Time: ${time}`,
      `Action: Verify voter safety at station immediately.`,
    ].join('\n');

    logger.warn('DISTRESS ALERT received', {
      stationCode: payload.stationCode,
      stationName: payload.stationName,
      serial: payload.serialNumber,
    });

    if (this.mockMode) return;

    const tasks: Promise<void>[] = [];

    if (coordinatorPhone && this.atSms) {
      tasks.push(
        this.atSms.send({ to: [coordinatorPhone], message: msg })
          .then(() => undefined)
          .catch((e) => { logger.error('Distress SMS alert failed', { reason: (e as Error).message }); })
      );
    }

    if (coordinatorEmail) {
      tasks.push(
        this.sendEmail({
          to: coordinatorEmail,
          subject: `[URGENT] Distress PIN activated — ${payload.stationName}`,
          text: msg,
        })
          .then(() => undefined)
          .catch((e) => { logger.error('Distress email alert failed', { reason: (e as Error).message }); })
      );
    }

    await Promise.all(tasks);
  }

  /**
   * Deliver a Shamir's Secret Sharing key share to a selected commissioner
   * at the start of the threshold homomorphic tally ceremony.
   *
   * The share is sensitive cryptographic material — treat it accordingly.
   * In mock/dev mode we log to console instead of sending.
   */
  async sendCeremonyKeyShare(payload: {
    channel:          'EMAIL' | 'SMS';
    recipient:        string;
    nationalId:       string;
    commissionerName: string;
    electionName:     string;
    shareIndex:       number;
    threshold:        number;
    shareHex:         string;
    commitment:       string;
    ceremonyId:       string;
  }): Promise<void> {
    if (this.mockMode) {
      logger.info('[CEREMONY KEY SHARE MOCK] Share issued — not delivered', {
        nationalId: payload.nationalId,
        shareIndex: payload.shareIndex,
        threshold:  payload.threshold,
        ceremonyId: payload.ceremonyId,
      });
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      logger.info('[CEREMONY KEY SHARE DEV] Share dispatched', {
        nationalId:  payload.nationalId,
        recipient:   payload.recipient,
        shareIndex:  payload.shareIndex,
        threshold:   payload.threshold,
        // shareHex deliberately omitted from logs even in dev
      });
    }

    const smsMsg =
      `VeriVote Kenya CEREMONY: You hold key share ${payload.shareIndex}/${payload.threshold} ` +
      `for "${payload.electionName}". ` +
      `Share: ${payload.shareHex.slice(0, 16)}… (full value in your email). ` +
      `CeremonyID: ${payload.ceremonyId.slice(0, 8)}`;

    const emailBody = [
      `Dear ${payload.commissionerName} (National ID: ${payload.nationalId}),`,
      ``,
      `You have been selected to hold a decryption key share for the following election ceremony:`,
      ``,
      `  Election:   ${payload.electionName}`,
      `  Ceremony:   ${payload.ceremonyId}`,
      `  Share:      ${payload.shareIndex} of ${payload.threshold}`,
      ``,
      `YOUR KEY SHARE (copy exactly — it is case-insensitive hex):`,
      ``,
      `  ${payload.shareHex}`,
      ``,
      `Public commitment (verifiable by anyone):`,
      `  g^share = ${payload.commitment}`,
      ``,
      `INSTRUCTIONS:`,
      `1. Keep this share strictly confidential until the tally ceremony begins.`,
      `2. When requested by the IEBC Returning Officer, navigate to:`,
      `   Admin Portal → Election Ceremony`,
      `3. Paste your key share into the input field and click "Submit Share".`,
      `4. The tally will proceed only when all ${payload.threshold} selected commissioner(s) have submitted.`,
      ``,
      `SECURITY NOTES:`,
      `- Do NOT share this value with anyone outside the official ceremony.`,
      `- Do NOT respond to any requests for your share via SMS, WhatsApp, or phone.`,
      `- If you believe this share has been compromised, contact the Commission Secretary immediately.`,
      ``,
      `VeriVote Kenya — IEBC Electoral Commission`,
    ].join('\n');

    if (payload.channel === 'SMS') {
      try {
        await this.atSms!.send({ to: [payload.recipient], message: smsMsg });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('[CEREMONY KEY SHARE SMS FALLBACK] AT send failed', {
            nationalId: payload.nationalId,
            reason: (err as Error).message,
          });
          return;
        }
        throw err;
      }
    } else {
      try {
        await this.sendEmail({
          to:      payload.recipient,
          subject: `[VeriVote Kenya] Your Tally Key Share — ${payload.electionName} (Share ${payload.shareIndex}/${payload.threshold})`,
          text:    emailBody,
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('[CEREMONY KEY SHARE EMAIL FALLBACK] Mailtrap send failed', {
            nationalId: payload.nationalId,
            reason: (err as Error).message,
          });
          return;
        }
        throw err;
      }
    }
  }
}

export const notificationService = new NotificationService();
