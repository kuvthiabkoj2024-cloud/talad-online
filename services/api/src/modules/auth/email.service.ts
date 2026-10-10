import { Injectable, Logger } from '@nestjs/common';

/**
 * Outbound email. No provider is wired up yet (scope §6), so messages are written to the
 * log; the API also returns dev links/codes outside production so flows can be tested.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async send(to: string, subject: string, text: string): Promise<void> {
    // TODO: integrate an email provider (e.g. SES / Postmark); keep logging in development.
    this.logger.log(`Email to ${to}: ${subject}\n${text}`);
  }
}
