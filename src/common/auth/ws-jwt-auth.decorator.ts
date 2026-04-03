import { applyDecorators, UseGuards } from '@nestjs/common';
import { WsJwtGuard } from './ws-jwt.guard';

export const WsJwtAuth = () => applyDecorators(UseGuards(WsJwtGuard));
