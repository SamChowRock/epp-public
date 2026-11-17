import nodemailer from 'nodemailer';
import type { AppConfig } from './config.js';
import type { RecoveryPurpose } from './recovery-contract.js';

export type DeliveryContext = {attemptId:string};
export type DeliveryReceipt = {providerMessageId:string};
export interface VerificationDelivery {
  readonly provider?: 'local'|'resend';
  readonly providerScope?: string;
  send(recipient: string, purpose: RecoveryPurpose, token: string, issuedAt: Date, expiresAt: Date, context: DeliveryContext): Promise<DeliveryReceipt>;
}

export class LocalMailDelivery implements VerificationDelivery {
  readonly provider = 'local' as const;
  readonly providerScope = 'practice';
  private readonly transport;
  constructor(config: Pick<AppConfig, 'localSmtpPort'>) {
    // shortcut: loopback SMTP sink only; configure TLS, authentication and verified sender before external delivery.
    this.transport = nodemailer.createTransport({
      host: '127.0.0.1', port: config.localSmtpPort, secure: false, ignoreTLS: true,
      connectionTimeout: 1500, greetingTimeout: 1500, socketTimeout: 2000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
    });
  }
  async send(recipient: string, purpose: RecoveryPurpose, token: string, issuedAt: Date, expiresAt: Date, context: DeliveryContext): Promise<DeliveryReceipt> {
    const info = await this.transport.sendMail({
      from: 'EPP Practice <no-reply@epp.test>', to: recipient,
      subject: purpose === 'register' ? 'EPP registration verification' : 'EPP password recovery',
      text: `Purpose: ${purpose}\nVerification token: ${token}\nRequested (UTC): ${issuedAt.toISOString()}\nExpires (UTC): ${expiresAt.toISOString()} Use the token for your latest request.\nIf you did not request this, ignore it. This message does not confirm an account exists.`,
    });
    if (info.accepted.length !== 1) throw new Error('MAIL_NOT_ACCEPTED');
    return {providerMessageId:info.messageId};
  }
}
