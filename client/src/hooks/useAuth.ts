import type { PublicUser } from "@/lib/apiTypes";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback } from "react";

export const AUTH_TOKEN_KEY = "auth_token";

interface LoginResult {
  token: string;
  user: PublicUser;
}

interface AuthApi {
  useUtils: () => {
    auth: {
      me: {
        setData: (input: undefined, data: PublicUser | null) => void;
        invalidate: () => Promise<void>;
      };
    };
  };
  auth: {
    me: {
      useQuery: (
        input: undefined,
        opts: { retry: boolean; refetchOnWindowFocus: boolean },
      ) => {
        data: PublicUser | null | undefined;
        isLoading: boolean;
        error: unknown;
        refetch: () => void;
      };
    };
    login: {
      useMutation: (opts: { onSuccess: (data: LoginResult) => void }) => {
        mutateAsync: (input: { email: string; password: string }) => Promise<LoginResult>;
        isPending: boolean;
        error: unknown;
      };
    };
  };
}

export function useAuth() {
  const api = trpc as unknown as AuthApi;
  const utils = api.useUtils();

  const meQuery = api.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const loginMutation = api.auth.login.useMutation({
    onSuccess: (data) => {
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      utils.auth.me.setData(undefined, data.user);
    },
  });

  const login = useCallback(
    async (email: string, password: string) => {
      await loginMutation.mutateAsync({ email, password });
    },
    [loginMutation],
  );

  const logout = useCallback(async () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    utils.auth.me.setData(undefined, null);
    await utils.auth.me.invalidate();
  }, [utils]);

  return {
    user: meQuery.data ?? null,
    loading: meQuery.isLoading,
    error: meQuery.error ?? null,
    isAuthenticated: Boolean(meQuery.data),
    refresh: () => meQuery.refetch(),
    login,
    isLoggingIn: loginMutation.isPending,
    loginError:
      loginMutation.error instanceof TRPCClientError ? loginMutation.error.message : null,
    logout,
  };
}
