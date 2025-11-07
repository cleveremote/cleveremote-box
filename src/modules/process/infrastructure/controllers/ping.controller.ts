import { Controller, Get } from '@nestjs/common';
const os = require("os");

@Controller('ping')
export class PingController {
  @Get()
  ping() {
    return {
        name: os.hostname(),
        status: 'ok',
        port: 3000,
        timestamp: new Date().toISOString(),
      };
  }
}