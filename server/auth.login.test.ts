import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "./drizzle/schema";
import { authenticateRequest } from "./_core/auth";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const dbMocks = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  updateLastSignedIn: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserByEmail: dbMocks.getUserByEmail,
    updateLastSignedIn: dbMocks.updateLastSignedIn,
    getUserById: dbMocks.getUserById,
  };
});

const PASSWORD = "correct-horse-battery-staple";

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: "sample@example.com",
    name: "Sample User",
    passwordHash: bcrypt.hashSync(PASSWORD, 4),
    role: "user",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function makeCaller(user: User | null = null) {
  const ctx: TrpcContext = {
    user,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

beforeEach(() => {
  dbMocks.getUserByEmail.mockReset();
  dbMocks.updateLastSignedIn.mockReset();
  dbMocks.getUserById.mockReset();
});

describe("auth.login", () => {
  it("returns a token and the sanitized user on correct credentials", async () => {
    const user = buildUser();
    dbMocks.getUserByEmail.mockResolvedValue(user);
    dbMocks.updateLastSignedIn.mockResolvedValue(undefined);

    const result = await makeCaller().auth.login({ email: user.email, password: PASSWORD });

    expect(typeof result.token).toBe("string");
    expect(result.user).toMatchObject({ id: user.id, email: user.email });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(dbMocks.updateLastSignedIn).toHaveBeenCalledWith(user.id);
  });

  it("rejects a wrong password with a generic message", async () => {
    const user = buildUser();
    dbMocks.getUserByEmail.mockResolvedValue(user);

    await expect(
      makeCaller().auth.login({ email: user.email, password: "wrong-password" }),
    ).rejects.toThrow("Email ou senha inválidos");
  });

  it("rejects a nonexistent email with the same generic message", async () => {
    dbMocks.getUserByEmail.mockResolvedValue(undefined);

    await expect(
      makeCaller().auth.login({ email: "nobody@example.com", password: "anything" }),
    ).rejects.toThrow("Email ou senha inválidos");
  });

  it("issues a token that authenticateRequest accepts for the same user", async () => {
    const user = buildUser();
    dbMocks.getUserByEmail.mockResolvedValue(user);
    dbMocks.updateLastSignedIn.mockResolvedValue(undefined);
    dbMocks.getUserById.mockResolvedValue(user);

    const { token } = await makeCaller().auth.login({ email: user.email, password: PASSWORD });

    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Parameters<
      typeof authenticateRequest
    >[0];
    const authenticated = await authenticateRequest(req);
    expect(authenticated.id).toBe(user.id);
  });

  it("rejects login for a deactivated user even with the correct password", async () => {
    const user = buildUser({ active: false });
    dbMocks.getUserByEmail.mockResolvedValue(user);

    await expect(
      makeCaller().auth.login({ email: user.email, password: PASSWORD }),
    ).rejects.toThrow("Usuário desativado");
  });

  it("still rejects a wrong password for a deactivated user with the generic message (no enumeration)", async () => {
    const user = buildUser({ active: false });
    dbMocks.getUserByEmail.mockResolvedValue(user);

    await expect(
      makeCaller().auth.login({ email: user.email, password: "wrong-password" }),
    ).rejects.toThrow("Email ou senha inválidos");
  });

  it("drops a session in real time when the user is deactivated after the token was issued", async () => {
    const user = buildUser();
    dbMocks.getUserByEmail.mockResolvedValue(user);
    dbMocks.updateLastSignedIn.mockResolvedValue(undefined);

    const { token } = await makeCaller().auth.login({ email: user.email, password: PASSWORD });

    // Usuário é desativado depois de já ter o token em mãos (ex.: admin desativou no meio da sessão)
    dbMocks.getUserById.mockResolvedValue({ ...user, active: false });

    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Parameters<
      typeof authenticateRequest
    >[0];
    await expect(authenticateRequest(req)).rejects.toThrow();
  });
});

describe("auth.me", () => {
  it("never returns the password hash", async () => {
    const user = buildUser();
    const result = await makeCaller(user).auth.me();

    expect(result).not.toHaveProperty("passwordHash");
    expect(result?.id).toBe(user.id);
  });
});
