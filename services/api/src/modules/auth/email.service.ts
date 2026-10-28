import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.validation.js';

/**
 * Outbound email over SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS…). Without a host the message is
 * only written to the log, so flows still work in development. A failed send is logged, never
 * thrown: email is a side channel and must not undo what the request did.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    const host = config.get('SMTP_HOST', { infer: true });
    const port = config.get('SMTP_PORT', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    this.from = config.get('SMTP_FROM', { infer: true }) || user || 'Taladonline <no-reply@taladonline.la>';
    this.transport = host
      ? nodemailer.createTransport({
          host,
          port,
          // 465 is TLS from the start; 587 upgrades with STARTTLS.
          secure: port === 465,
          ...(user && { auth: { user, pass: config.get('SMTP_PASS', { infer: true }) ?? '' } }),
        })
      : null;
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transport) {
      this.logger.log(`Email to ${to}: ${subject}\n${text}`);
      return;
    }
    try {
      await this.transport.sendMail({ from: this.from, to, subject, text });
    } catch (e) {
      this.logger.warn(`Email to ${to} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
