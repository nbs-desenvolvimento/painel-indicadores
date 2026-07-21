import { ForbiddenError } from "@shared/_core/errors";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/** Sessão de 7 dias, sem refresh — expira e exige novo login. */
export const AUTH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function getJwtSecretKey() {
  return new TextEncoder().encode(ENV.jwtSecret);
}

/** Assina o token de sessão para um usuário autenticado. */
export async function signAuthToken(userId: number): Promise<string> {
  const issuedAt = Date.now();
  const expirationSeconds = Math.floor((issuedAt + AUTH_TOKEN_TTL_MS) / 1000);

  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getJwtSecretKey());
}

async function verifyAuthToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), {
      algorithms: ["HS256"],
    });

    if (!isNonEmptyString(payload.sub)) return null;
    const userId = Number(payload.sub);
    return Number.isFinite(userId) ? userId : null;
  } catch (error) {
    console.warn("[Auth] Token verification failed", String(error));
    return null;
  }
}

function getBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7);
  }
  return undefined;
}

/** Autentica a requisição pelo header `Authorization: Bearer <token>`. */
export async function authenticateRequest(req: Request): Promise<User> {
  const token = getBearerToken(req);
  const userId = token ? await verifyAuthToken(token) : null;

  if (!userId) {
    throw ForbiddenError("Invalid or missing token");
  }

  const user = await db.getUserById(userId);
  if (!user) {
    throw ForbiddenError("User not found");
  }

  return user;
}
