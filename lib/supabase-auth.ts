import "server-only";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export type SupabaseAppUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

const getUserMetadataName = (user: User) => {
  const metadata = user.user_metadata;

  if (typeof metadata?.name === "string" && metadata.name.trim().length > 0) {
    return metadata.name.trim();
  }

  if (
    typeof metadata?.full_name === "string" &&
    metadata.full_name.trim().length > 0
  ) {
    return metadata.full_name.trim();
  }

  if (typeof user.email === "string" && user.email.includes("@")) {
    return user.email.split("@")[0] || "User";
  }

  return "User";
};

export const mapSupabaseUserToAppUser = (
  user: User | null | undefined
): SupabaseAppUser | null => {
  if (!user?.id || !user.email) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: getUserMetadataName(user),
    emailVerified: Boolean(user.email_confirmed_at),
  };
};

export const getCurrentSupabaseUser = async () => {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerAuthClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options);
      });
    },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return mapSupabaseUserToAppUser(user);
};

export const getSupabaseUserFromRequest = async (request: NextRequest) => {
  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return mapSupabaseUserToAppUser(user);
};
