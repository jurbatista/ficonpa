import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { optionalEnv, env } from "@/lib/env";
import { safeEqual, verifyPassword } from "@/lib/crypto";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";

export { SESSION_COOKIE };

function secret(): Uint8Array {
  return new TextEncoder().encode(env("AUTH_SECRET"));
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

export function checkPassword(password: string): boolean {
  const hash = optionalEnv("APP_PASSWORD_HASH");
  if (hash) return verifyPassword(password, hash);
  return safeEqual(password, env("APP_PASSWORD", "ficonpa"));
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
