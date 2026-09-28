import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { getConfig } from '../../config/app.config';
import { smtpOptions, smtpError } from './smtp.config';

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  constructor() {
    getConfig();
  }

  async sendMail(options: EmailOptions): Promise<EmailResult> {
    const config = smtpOptions();
    if (!config.ok) return { success: false, error: config.error };
    const transport = nodemailer.createTransport(config.options);
    try {
      const result = await transport.sendMail({
        from: options.from || config.from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      if (!result.accepted?.length || result.rejected?.length) {
        return { success: false, error: 'SMTP server did not accept all recipients.' };
      }
      return {
        success: true,
        messageId: result.messageId,
        simulated: false,
      };
    } catch (err) {
      const errorMsg = smtpError(err);
      this.logger.warn(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    } finally {
      transport.close();
    }
  }
}
