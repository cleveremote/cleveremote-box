import { UsePipes, ValidationPipe } from '@nestjs/common';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { WsJwtAuth } from '../../../../common/auth/ws-jwt-auth.decorator';
import { ProcessService } from '@process/domain/services/execution.service';
import { ProcessExecuteUC } from '@process/use-cases/process-execute.uc';
import { ProcessExecuteDTO } from '../dto/process-execute.dto';

@WebSocketGateway({ cors: { origin: '*' } })
export class ExecutionGateway {

    public constructor(private readonly _processService: ProcessService) { }

    @WsJwtAuth()
    @UsePipes(ValidationPipe)
    @SubscribeMessage('box/execution/process')
    public async handleExecuteProcess(@MessageBody() processExecuteDTO: ProcessExecuteDTO): Promise<boolean> {
        const uc = new ProcessExecuteUC(this._processService);
        const input = ProcessExecuteDTO.mapToProcessModel(processExecuteDTO);
        return uc.execute(input)
            .then(() => true)
            .catch(() => false);
    }

    @WsJwtAuth()
    @UsePipes(ValidationPipe)
    @SubscribeMessage('box/execution/process/local')
    public async handleExecuteProcessLocal(@MessageBody() processExecuteDTO: ProcessExecuteDTO): Promise<boolean> {
        const uc = new ProcessExecuteUC(this._processService);
        const input = ProcessExecuteDTO.mapToProcessModel(processExecuteDTO);
        return uc.execute(input)
            .then(() => true)
            .catch(() => false);
    }
}
