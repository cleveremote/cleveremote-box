import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SlaveTemplate } from '../models/device.model';
import { SlaveTemplateRepository } from '@process/infrastructure/repositories/slave-template.repository';

@Injectable()
export class SlaveTemplateService {
    public constructor(
        private slaveTemplateRepository: SlaveTemplateRepository,
        private readonly logger: Logger
    ) { }

    public async save(template: SlaveTemplate): Promise<SlaveTemplate> {
        const saved = await this.slaveTemplateRepository.save(template);
        this.logger.log({ templateId: saved._id, name: saved.name, type: saved.type }, 'slave template saved');
        return saved;
    }

    public get(): Promise<SlaveTemplate[]> {
        return this.slaveTemplateRepository.get();
    }
}
