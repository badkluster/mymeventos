import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
export interface TokenPayload { sub: string; username: string; }
export const generateAccessToken = (payload: TokenPayload, expiresIn: string = env.ACCESS_TOKEN_EXPIRES_IN): string => jwt.sign(payload, env.ACCESS_TOKEN_SECRET, { expiresIn } as jwt.SignOptions);
export const generateRefreshToken = (payload: TokenPayload, expiresIn: string = env.REFRESH_TOKEN_EXPIRES_IN): string => jwt.sign(payload, env.REFRESH_TOKEN_SECRET, { expiresIn } as jwt.SignOptions);
export const verifyAccessToken = (token: string): TokenPayload => jwt.verify(token, env.ACCESS_TOKEN_SECRET) as TokenPayload;
export const verifyRefreshToken = (token: string): TokenPayload => jwt.verify(token, env.REFRESH_TOKEN_SECRET) as TokenPayload;
export const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');
