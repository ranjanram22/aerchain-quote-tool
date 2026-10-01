"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, { error: null });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-xs text-slate-600">
        Username
        <input key={state.username ?? ""} name="username" defaultValue={state.username ?? ""} autoComplete="username" autoFocus={!state.username} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
      </label>
      <label className="block text-xs text-slate-600">
        Password
        <input name="password" type="password" autoComplete="current-password" autoFocus={!!state.username} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
      </label>
      {state.error && <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
