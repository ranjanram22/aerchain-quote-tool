"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOGIN_PASSWORD, LOGIN_USER, SESSION_COOKIE, SESSION_DAYS, sessionToken } from "@/lib/auth";

export async function login(_prev: { error: string | null; username?: string }, form: FormData): Promise<{ error: string | null; username?: string }> {
  const user = String(form.get("username") ?? "").trim();
  const pass = String(form.get("password") ?? "");
  if (user !== LOGIN_USER || pass !== LOGIN_PASSWORD) return { error: "Wrong username or password.", username: user };
  (await cookies()).set(SESSION_COOKIE, await sessionToken(user), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400,
  });
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
