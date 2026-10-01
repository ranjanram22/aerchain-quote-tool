import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Quote Desk</h1>
        <p className="mb-5 text-sm text-slate-500">Sign in to continue</p>
        <LoginForm next={typeof next === "string" ? next : "/"} />
      </div>
    </div>
  );
}
