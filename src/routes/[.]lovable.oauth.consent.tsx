import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button } from "@/components/ui-bits";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { getSafeUiErrorMessage } from "@/lib/utils";

type AuthorizationDetails = {
  client?: { name?: string; client_name?: string; redirect_uri?: string };
  scope?: string;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};

type OAuthNamespace = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: { message: string } | null;
  }>;
  denyAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: { message: string } | null;
  }>;
};

function oauth(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <Card className="p-5 text-sm text-muted-foreground">
        {getSafeUiErrorMessage(error, "Не удалось загрузить запрос авторизации.")}
      </Card>
    </div>
  ),
});

function Consent() {
  const details = Route.useLoaderData() as AuthorizationDetails | null;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "приложение";
  const [email, setEmail] = useState<string>("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(getSafeUiErrorMessage(error, "Не удалось обработать запрос доступа."));
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Провайдер не вернул URL для редиректа.");
      return;
    }
    window.location.href = target;
  }

  const scopes = details?.scopes ?? (details?.scope ? details.scope.split(/\s+/) : []);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-5 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
          <ShieldCheck className="h-7 w-7 text-accent" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">
          Разрешить {clientName} доступ к LiveNotebook?
        </h1>
        {email && <p className="mt-1 text-xs text-muted-foreground">Вы вошли как {email}</p>}
      </div>

      <Card className="space-y-3 p-5 text-sm">
        <p className="text-foreground">
          {clientName} сможет вызывать инструменты LiveNotebook от вашего имени — читать и изменять
          только ваших учеников, уроки, ДЗ и финансы.
        </p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>• Просмотр учеников, уроков, ДЗ и оплат</li>
          <li>• Изменение статуса урока</li>
          {scopes.length > 0 && <li>• Запрошенные scope: {scopes.join(", ")}</li>}
        </ul>
        <p className="text-xs text-muted-foreground">
          Это не обходит правила доступа: политики базы данных по-прежнему ограничивают доступ
          только вашими данными.
        </p>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-2">
          <Button variant="gold" className="flex-1" onClick={() => decide(true)} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Разрешить
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => decide(false)}
            disabled={busy}
          >
            <X className="h-4 w-4" />
            Отклонить
          </Button>
        </div>
      </Card>
    </div>
  );
}
