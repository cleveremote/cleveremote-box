import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, RpcExceptionFilter, ValidationError } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';
import { BoxErrorCode, BoxErrorParams } from './box-error';
import { ToErrorPayload } from './box-error.messages';

export type RpcErrorPayload = { status: 'error'; code: BoxErrorCode; params?: BoxErrorParams; message: string };

function FlattenValidationErrors(errors: ValidationError[]): string[] {
    return errors.flatMap((error) => [
        ...Object.values(error.constraints ?? {}),
        ...FlattenValidationErrors(error.children ?? [])
    ]);
}

// exceptionFactory des ValidationPipe/ParseArrayPipe : RpcException codee VALIDATION avec le detail des contraintes
export function RpcValidationExceptionFactory(errors: ValidationError[] | string): RpcException {
    const message = Array.isArray(errors) ? FlattenValidationErrors(errors).join(', ') : errors;
    const fields = Array.isArray(errors) ? errors.map((error) => error.property) : undefined;
    return new RpcException({ status: 'error', code: BoxErrorCode.VALIDATION, params: { fields }, message });
}

// Toute erreur -> { status, code, params, message } ; sans ca le filtre RPC de Nest reduit les HttpException
// (ValidationPipe par defaut) et les Error a "Internal server error"
export function ToRpcErrorPayload(exception: unknown, lang?: string): RpcErrorPayload {
    if (exception instanceof RpcException) {
        const error = exception.getError();
        return typeof error === 'object' && error !== null
            ? { status: 'error', code: BoxErrorCode.UNKNOWN, ...(error as Partial<RpcErrorPayload>), message: String((error as { message?: unknown }).message ?? '') }
            : { status: 'error', code: BoxErrorCode.UNKNOWN, message: String(error) };
    }
    if (exception instanceof HttpException) {
        const response = exception.getResponse();
        const message = typeof response === 'object' ? (response as { message?: string | string[] }).message ?? exception.message : response;
        const code = exception.getStatus() === HttpStatus.BAD_REQUEST ? BoxErrorCode.VALIDATION : BoxErrorCode.UNKNOWN;
        return { status: 'error', code, message: Array.isArray(message) ? message.join(', ') : message };
    }
    return { status: 'error', ...ToErrorPayload(exception, lang) };
}

@Catch()
export class RpcErrorsFilter implements RpcExceptionFilter<unknown> {
    private readonly _logger = new Logger(RpcErrorsFilter.name);

    public catch(exception: unknown, host: ArgumentsHost): Observable<never> {
        const payload = ToRpcErrorPayload(exception, (host.switchToRpc().getData() as { lang?: string } | undefined)?.lang);
        if (payload.code === BoxErrorCode.UNKNOWN) {
            this._logger.error(payload.message, exception instanceof Error ? exception.stack : undefined);
        } else {
            this._logger.warn(`${payload.code}: ${payload.message}`);
        }
        return throwError(() => payload);
    }
}
