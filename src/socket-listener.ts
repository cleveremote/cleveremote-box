import { Controller, Get } from '@nestjs/common';
import { MessagePattern, Payload, Ctx } from '@nestjs/microservices';
import { Gpio } from 'onoff';
import { Socket } from 'socket.io-client';

@Controller()
export class SocketIoListener {
  @MessagePattern('welcome')
  handleSendHello(@Payload() data: string, @Ctx() client: Socket) {
    console.log('got welcome from server', data);
    //const responseMessage = 'Ohayo';
    //client.emit('greeting', responseMessage);
    const pump = new Gpio(16, 'out');
    const sector1 = new Gpio(26, 'out');
    const sector2 = new Gpio(19, 'out');
    const sector3 = new Gpio(21, 'out');
    const sector4 = new Gpio(20, 'out');

    pump.writeSync(1);
    sector1.writeSync(1);
    sector2.writeSync(1);
    sector3.writeSync(1);
    sector4.writeSync(1);

    setTimeout(() => {

      pump.writeSync(0);
      sector1.writeSync(0);
      sector2.writeSync(0);
      sector3.writeSync(0);
      sector4.writeSync(0);
      pump.unexport();
      sector1.unexport();
      sector2.unexport();
      sector3.unexport();
      sector4.unexport();
    }, 5000);
  }
}