import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";

const dataDirectory = path.join(process.cwd(), ".data");
const authStorePath = path.join(dataDirectory, "auth.json");
const sessionCookieName = "blackboard_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;
const verificationCodeTtlMs = 10 * 60 * 1000;
const verificationResendCooldownMs = 60 * 1000;

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  verificationCodeHash?: string;
  verificationCodeExpiresAt?: string;
  lastVerificationSentAt?: string;
};

type AuthSession = {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

type AuthData = {
  users: AuthUser[];
  sessions: AuthSession[];
};

type LegacyAuthUser = Partial<AuthUser> & {
  verified?: boolean;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
};

export const authSessionCookieName = sessionCookieName;
export const authSessionMaxAgeSeconds = sessionMaxAgeSeconds;
export const verificationResendCooldownSeconds = Math.ceil(
  verificationResendCooldownMs / 1000
);

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const getPublicUser = (user: AuthUser): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt,
});

const emptyAuthData = (): AuthData => ({
  users: [],
  sessions: [],
});

const ensureAuthStore = async () => {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(authStorePath);
  } catch {
    await fs.writeFile(authStorePath, JSON.stringify(emptyAuthData(), null, 2));
  }
};

export const readAuthData = async (): Promise<AuthData> => {
  await ensureAuthStore();

  try {
    const rawData = await fs.readFile(authStorePath, "utf8");
    const parsedData = JSON.parse(rawData) as Partial<AuthData>;

    const users = (Array.isArray(parsedData.users)
      ? parsedData.users
      : []) as LegacyAuthUser[];

    return {
      users: users
        .filter((user) => Boolean(user?.id && user?.email))
        .map((user) => ({
          id: user.id as string,
          name:
            user.name ??
            String(user.email).split("@")[0] ??
            "User",
          email: normalizeEmail(user.email as string),
          passwordHash: user.passwordHash ?? "",
          emailVerified: Boolean(user.emailVerified ?? user.verified ?? false),
          createdAt: user.createdAt ?? new Date().toISOString(),
          updatedAt: user.updatedAt ?? user.createdAt ?? new Date().toISOString(),
          verificationCodeHash: user.verificationCodeHash,
          verificationCodeExpiresAt: user.verificationCodeExpiresAt,
          lastVerificationSentAt: user.lastVerificationSentAt,
        })),
      sessions: Array.isArray(parsedData.sessions) ? parsedData.sessions : [],
    };
  } catch {
    return emptyAuthData();
  }
};

export const writeAuthData = async (data: AuthData) => {
  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(authStorePath, JSON.stringify(data, null, 2));
};

export const createToken = () => randomBytes(32).toString("hex");

export const createVerificationCode = () =>
  String(Math.floor(100000 + Math.random() * 900000));

export const hashSecret = (secret: string) => bcrypt.hash(secret, 12);

export const verifySecret = (secret: string, expectedHash: string) =>
  bcrypt.compare(secret, expectedHash);

export const createPendingUser = async (
  name: string,
  email: string,
  password: string,
  verificationCode: string
) => {
  const data = await readAuthData();
  const normalizedEmail = normalizeEmail(email);
  const existingUser = data.users.find((user) => user.email === normalizedEmail);

  if (existingUser) {
    throw new Error("ACCOUNT_EXISTS");
  }

  const now = new Date().toISOString();
  const user: AuthUser = {
    id: randomBytes(16).toString("hex"),
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await hashSecret(password),
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
    verificationCodeHash: await hashSecret(verificationCode),
    verificationCodeExpiresAt: new Date(
      Date.now() + verificationCodeTtlMs
    ).toISOString(),
    lastVerificationSentAt: now,
  };

  data.users.push(user);
  await writeAuthData(data);
  return user;
};

export const updatePendingUserRegistration = async (
  data: AuthData,
  user: AuthUser,
  name: string,
  password: string,
  verificationCode: string
) => {
  if (user.emailVerified) {
    throw new Error("ACCOUNT_EXISTS");
  }

  const now = new Date().toISOString();

  user.name = name.trim();
  user.passwordHash = await hashSecret(password);
  user.emailVerified = false;
  user.verificationCodeHash = await hashSecret(verificationCode);
  user.verificationCodeExpiresAt = new Date(
    Date.now() + verificationCodeTtlMs
  ).toISOString();
  user.lastVerificationSentAt = now;
  user.updatedAt = now;
  await writeAuthData(data);
  return user;
};

export const canSendVerificationCode = (user: AuthUser) => {
  if (!user.lastVerificationSentAt) return { allowed: true, retryAfter: 0 };

  const elapsedMs = Date.now() - new Date(user.lastVerificationSentAt).getTime();
  const retryAfter = Math.ceil(
    (verificationResendCooldownMs - elapsedMs) / 1000
  );

  return {
    allowed: elapsedMs >= verificationResendCooldownMs,
    retryAfter: Math.max(0, retryAfter),
  };
};

export const setVerificationCode = async (
  data: AuthData,
  user: AuthUser,
  verificationCode: string
) => {
  const now = new Date().toISOString();

  user.verificationCodeHash = await hashSecret(verificationCode);
  user.verificationCodeExpiresAt = new Date(
    Date.now() + verificationCodeTtlMs
  ).toISOString();
  user.lastVerificationSentAt = now;
  user.updatedAt = now;
  await writeAuthData(data);
};

export const findUserByEmail = async (email: string) => {
  const data = await readAuthData();
  const user = data.users.find((item) => item.email === normalizeEmail(email));

  return { data, user };
};

export const createSession = async (userId: string) => {
  const data = await readAuthData();
  const token = createToken();
  const now = new Date();

  data.sessions = data.sessions.filter(
    (session) => new Date(session.expiresAt).getTime() > now.getTime()
  );
  data.sessions.push({
    tokenHash: await hashSecret(token),
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + sessionMaxAgeSeconds * 1000
    ).toISOString(),
  });

  await writeAuthData(data);
  return token;
};

export const getUserFromSessionToken = async (token?: string) => {
  if (!token) return null;

  const data = await readAuthData();
  const now = Date.now();
  const previousSessionCount = data.sessions.length;

  data.sessions = data.sessions.filter(
    (session) => new Date(session.expiresAt).getTime() > now
  );

  let matchedSession: AuthSession | undefined;
  for (const session of data.sessions) {
    if (await verifySecret(token, session.tokenHash)) {
      matchedSession = session;
      break;
    }
  }

  if (data.sessions.length !== previousSessionCount) {
    await writeAuthData(data);
  }

  if (!matchedSession) return null;

  return (
    data.users.find(
      (user) => user.id === matchedSession.userId && user.emailVerified
    ) ?? null
  );
};

export const deleteSession = async (token?: string) => {
  if (!token) return;

  const data = await readAuthData();
  const nextSessions: AuthSession[] = [];

  for (const session of data.sessions) {
    if (!(await verifySecret(token, session.tokenHash))) {
      nextSessions.push(session);
    }
  }

  data.sessions = nextSessions;
  await writeAuthData(data);
};
