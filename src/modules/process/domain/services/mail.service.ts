import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { createTransport } from 'nodemailer';

/**
 * Envoi de mails via le SMTP configuré dans .env.local : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM.
 */
@Injectable()
export class MailService {
    public constructor(
        private readonly _config: ConfigService,
        private readonly logger: Logger
    ) { }

    public async send(to: string, subject: string, text: string): Promise<boolean> {
        const host = this._config.get<string>('SMTP_HOST');
        const user = this._config.get<string>('SMTP_USER');
        const pass = this._config.get<string>('SMTP_PASSWORD');
        const from = this._config.get<string>('SMTP_FROM');
        if (!host || !user || !pass || !from) {
            this.logger.warn({ host, user, from }, 'mail not sent : config SMTP incomplète');
            return false;
        }
        const port = Number(this._config.get<string>('SMTP_PORT') || 587);
        const transporter = createTransport({
            host,
            port,
            secure: port === 465, // 587 : STARTTLS
            requireTLS: port !== 465,
            auth: { user, pass }
        });
        const info = await transporter.sendMail({ from, to, subject, text });
        this.logger.log({ messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }, 'mail sent');
        return info.accepted.length > 0;
    }
}
