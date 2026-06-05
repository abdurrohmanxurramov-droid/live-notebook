import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Card, Button, Input } from "@/components/ui-bits";
import { LogIn, Mail } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/", replace: true });
    });
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Введите email и пароль");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Аккаунт создан");
        } else {
          toast.success("Проверьте почту — подтвердите регистрацию");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      console.error("[auth]", err);
      const msg = String(err?.message ?? "Ошибка");
      const localized = msg.includes("Invalid login credentials")
        ? "Неверный email или пароль"
        : msg.includes("already registered") || msg.includes("already been registered")
        ? "Этот email уже зарегистрирован"
        : msg.includes("Password should be")
        ? "Пароль слишком короткий (минимум 6 символов)"
        : msg.includes("rate limit") || msg.includes("Email rate limit")
        ? "Слишком много попыток, попробуйте позже"
        : msg.includes("Signups not allowed") || msg.includes("signup is disabled")
        ? "Регистрация временно отключена"
        : msg;
      toast.error(localized);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
    } catch (err: any) {
      toast.error(err?.message ?? "Ошибка входа через Google");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <div className="group relative mx-auto mb-4 h-16 w-16">
          <div className="pointer-events-none absolute inset-0 scale-150 rounded-full bg-accent/20 opacity-60 blur-2xl" />
          <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br from-white/70 to-white/20 shadow-[0_10px_30px_-10px_rgba(20,33,61,0.25)] backdrop-blur-2xl">
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-tr from-transparent via-white/40 to-transparent transition-transform duration-1000 ease-in-out group-hover:translate-x-full" />
            <div className="relative flex items-baseline">
              <span className="text-2xl font-bold leading-none tracking-[-0.05em] text-foreground">L</span>
              <span className="-ml-0.5 text-2xl font-medium leading-none tracking-[-0.05em] text-foreground">N</span>
              <div className="absolute -bottom-0.5 -right-1.5 h-1.5 w-1.5 rounded-full bg-accent shadow-sm" />
            </div>
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Live Notebook</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "login" ? "Sign in to continue" : "Create an account"}
        </p>
      </div>

      <Card className="p-5">
        <form onSubmit={handleEmail} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</span>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Пароль</span>
            <Input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </label>
          <Button variant="gold" className="w-full" type="submit" disabled={loading}>
            <Mail className="h-4 w-4" />
            {mode === "login" ? "Войти" : "Зарегистрироваться"}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">или</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
          <LogIn className="h-4 w-4" />
          Продолжить с Google
        </Button>
      </Card>

      <button
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
        className="mt-5 text-center text-sm text-muted-foreground hover:text-foreground"
      >
        {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
      </button>
    </div>
  );
}
