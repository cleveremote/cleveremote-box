import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ProcessService } from '@process/domain/services/execution.service';
import { ProcessExecuteUC } from '@process/use-cases/process-execute.uc';
import { validate } from 'class-validator';
import { Console } from 'console';
import { ProcessExecuteDTO } from '../dto/process-execute.dto';

@Controller()
export class ExecutionController {
    public constructor(private readonly _processService: ProcessService) { }
    @UsePipes(ValidationPipe)
    @MessagePattern('execution/task')
    public async handleSendHello(@Payload() processExecuteDTO: ProcessExecuteDTO): Promise<void> {
        const uc = new ProcessExecuteUC(this._processService);
        const input = ProcessExecuteDTO.mapToProcessModel(processExecuteDTO);
        //await uc.execute(input);
    }
}