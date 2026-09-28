import nodemailer from 'nodemailer';
import '../config/app.config';
import { smtpOptions, smtpError } from '../modules/notifications/smtp.config';

async function main() {
  const config = smtpOptions();
  if (!config.ok) {
    console.error(config.error);
    process.exitCode = 1;
    return;
  }
  const transport = nodemailer.createTransport(config.options);
  try {
    await transport.verify();
    console.log('SMTP connection, TLS and authentication verified. No email was sent.');
  } catch (error) {
    console.error(smtpError(error));
    process.exitCode = 1;
  } finally {
    transport.close();
  }
}

void main();
