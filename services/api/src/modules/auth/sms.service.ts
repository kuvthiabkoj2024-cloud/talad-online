import { Injectable, Logger } from '@nestjs/common';

/**
 * Outbound SMS. There is no gateway wired up yet (scope §6: local telecom gateway,
 * Twilio as fallback), so messages are written to the log.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async send(phone: string, message: string): Promise<void> {
    // TODO: integrate the SMS gateway; keep logging in development.
    this.logger.log(`SMS to ${phone}: ${message}`);
  }
}
