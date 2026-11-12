import nodemailer from 'nodemailer';
import type { AppConfig } from './config.js';
import type { RecoveryPurpose } from './recovery-contract.js';

export interface VerificationDelivery {
  send(recipient: string, purpose: RecoveryPurpose, token: string, issuedAt: Date, expiresAt: Date): Promise<void>;
}

export class LocalMailDelivery implements VerificationDelivery {
  private readonly transport;
  constructor(config: Pick<AppConfig, 'localSmtpPort' | 'localSmtpHost'>) {
    // The exercise sink can run on loopback or a private service network.
    this.transport = nodemailer.createTransport({
      host: config.localSmtpHost, port: config.localSmtpPort, secure: false, ignoreTLS: true,
      connectionTimeout: 1500, greetingTimeout: 1500, socketTimeout: 2000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
    });
  }
  async send(recipient: string, purpose: RecoveryPurpose, token: string, issuedAt: Date, expiresAt: Date): Promise<void> {
    const info = await this.transport.sendMail({
      from: 'EPP Practice <no-reply@epp.test>', to: recipient,
      subject: purpose === 'register' ? 'EPP registration verification' : 'EPP password recovery',
      text: `Purpose: ${purpose}\nVerification token: ${token}\nRequested (UTC): ${issuedAt.toISOString()}\nExpires (UTC): ${expiresAt.toISOString()} Use the token for your latest request.\nIf you did not request this, ignore it. This message does not confirm an account exists.`,
    });
    if (info.accepted.length !== 1) throw new Error('MAIL_NOT_ACCEPTED');
  }
}
