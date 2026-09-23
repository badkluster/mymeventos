import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
export interface TokenPayload { sub: string; username: string; }
export const generateAccessToken = (payload: TokenPayload, expiresIn: string = env.ACCESS_TOKEN_EXPIRES_IN): string => jwt.sign(payload, env.ACCESS_TOKEN_SECRET, { expiresIn } as jwt.SignOptions);
// `jti` is required so two refresh calls issued for the same user within the same second
// (double tab, client retry, SSR + browser) never sign the byte-identical JWT — jsonwebtoken's
// `iat` has 1s resolution and the payload is otherwise static, so without it the second
// RefreshToken.create() collides on the unique tokenHash index (E11000).
export const generateRefreshToken = (payload: TokenPayload, expiresIn: string = env.REFRESH_TOKEN_EXPIRES_IN): string => jwt.sign({ ...payload, jti: crypto.randomUUID() }, env.REFRESH_TOKEN_SECRET, { expiresIn } as jwt.SignOptions);
export const verifyAccessToken = (token: string): TokenPayload => jwt.verify(token, env.ACCESS_TOKEN_SECRET) as TokenPayload;
export const verifyRefreshToken = (token: string): TokenPayload => jwt.verify(token, env.REFRESH_TOKEN_SECRET) as TokenPayload;
export const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');
