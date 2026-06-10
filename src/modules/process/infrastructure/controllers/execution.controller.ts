import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ProcessService } from '@process/domain/services/execution.service';
import { type InverterConfigParam } from '@process/domain/services/modbus-task.service';
import { ProcessExecuteUC } from '@process/use-cases/process-execute.uc';
import { ProcessExecuteDTO } from '../dto/process-execute.dto';

@Controller()
export class ExecutionController {
    public constructor(private readonly _processService: ProcessService) { }

    @UsePipes(ValidationPipe)
    @MessagePattern(['box/execution/process', 'box/execution/process/local'])
    public async handleSendHello(@Payload() processExecuteDTO: ProcessExecuteDTO): Promise<boolean> {
        const uc = new ProcessExecuteUC(this._processService);
        const input = ProcessExecuteDTO.mapToProcessModel(processExecuteDTO);
        return uc.execute(input)
            .then(() => true)
            .catch(() => false);
    }

    @MessagePattern(['box/execution/inverter/config'])
    public async handleInverterConfig(
        @Payload() data: { inverterId: string; params: InverterConfigParam[] }
    ): Promise<boolean> {
        return this._processService.applyInverterConfig(data.inverterId, data.params)
            .then(() => true)
            .catch(() => false);
    }
}