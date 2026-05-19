import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "lf_session";
const EXPIRATION_SECONDS = 60 * 60 * 8;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET no está definido.");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string;
  email: string;
  rol: "ADMIN" | "CONTADOR";
};

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRATION_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifySession(token: string) {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return payload as unknown as SessionPayload;
}

export { EXPIRATION_SECONDS, SESSION_COOKIE };
