import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket, io } from 'socket.io-client';

@Injectable()
export class SocketIoClientProvider {
  @Inject(ConfigService)
  private readonly config: ConfigService;

  private socket: Socket;

  private connect() {
    this.socket = io(this.config.get('SOCKET_SERVER'), {
      extraHeaders: {
        "myTestBox": "1234"
      }
    });
    
    
    return this.socket;
  }

  getSocket = () => {
    if (!this.socket) {
      return this.connect();
    }
    console.log(this.socket.id);
    return this.socket;
  };
}