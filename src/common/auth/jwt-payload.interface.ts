import { JwtPayload as JwtBasePayload } from 'jsonwebtoken';

export interface JwtPayload extends JwtBasePayload {
    sub: string; // device ID (login)
}

export interface TokensResponse {
    accessToken: string;
    refreshToken: string;
}
