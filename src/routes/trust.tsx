import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Доверие и безопасность — LiveNotebook" },
      {
        name: "description",
        content:
          "Как LiveNotebook защищает данные преподавателей: аутентификация, изоляция данных, шифрование при передаче и работа с третьими сторонами.",
      },
      { property: "og:title", content: "Доверие и безопасность — LiveNotebook" },
      {
        property: "og:description",
        content:
          "Подход LiveNotebook к безопасности, приватности и обработке данных пользователей.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Доверие и безопасность — LiveNotebook" },
      {
        name: "twitter:description",
        content:
          "Подход LiveNotebook к безопасности, приватности и обработке данных пользователей.",
      },
    ],
  }),
  component: TrustPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function TrustPage() {
  const updated = "20 июня 2026";
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Доверие · Безопасность · Приватность
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Доверие и безопасность
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Эта страница ведётся командой LiveNotebook и описывает доступные пользователям меры
          безопасности и приватности. Содержание редактируемое и не является независимой
          сертификацией или аудиторским заключением.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Обновлено: {updated}</p>
      </header>

      <div className="space-y-4">
        <Section title="Аутентификация и доступ">
          <p>
            Вход в LiveNotebook возможен по email/паролю или через Google. Сессии управляются
            провайдером аутентификации и используют короткоживущие токены с автоматическим
            обновлением.
          </p>
          <p>
            Каждый преподаватель видит только свои данные: ученики, занятия, оплаты и заметки
            изолированы по владельцу аккаунта на уровне базы данных (row-level security).
          </p>
        </Section>

        <Section title="Хранение данных и инфраструктура">
          <p>
            Приложение размещено на инфраструктуре Lovable Cloud (Cloudflare Workers для
            backend-кода и управляемый Postgres для данных). Это операционные характеристики
            платформы, а не сертификация безопасности.
          </p>
          <p>
            Резервные копии данных пользователь может выгрузить из раздела «Настройки →
            Резервная копия» в собственном аккаунте в любое время.
          </p>
        </Section>

        <Section title="Шифрование передачи">
          <p>
            Весь трафик между браузером, серверными функциями и базой данных передаётся по
            HTTPS/TLS. Cекреты (ключи API, токены) хранятся как переменные окружения серверной
            среды и недоступны клиентскому коду.
          </p>
        </Section>

        <Section title="Сторонние сервисы">
          <p>В работе приложения используются:</p>
          <ul className="ml-5 list-disc">
            <li>Lovable Cloud — хостинг, база данных, аутентификация.</li>
            <li>Google — необязательный вход через Google-аккаунт.</li>
            <li>Web Push (браузерные push-уведомления) — для напоминаний о занятиях.</li>
          </ul>
          <p>
            Эти сервисы получают только данные, необходимые для выполнения их функции
            (например, идентификатор подписки на push). Аналитика и реклама третьих сторон в
            приложении не подключены.
          </p>
        </Section>

        <Section title="Push-уведомления">
          <p>
            Push-уведомления отправляются только на устройства, которые пользователь явно
            подписал. Подписку можно отключить в настройках устройства или в разделе настроек
            приложения; запись подписки при этом удаляется.
          </p>
        </Section>

        <Section title="Удаление и экспорт данных">
          <p>
            Удалённые записи (ученики, занятия) перемещаются в «Корзину», откуда их можно
            восстановить или удалить безвозвратно.
          </p>
          <p>
            Для полного удаления аккаунта и связанных данных напишите на адрес ниже — запрос
            будет обработан вручную.
          </p>
        </Section>

        <Section title="Сообщения об уязвимостях">
          <p>
            Если вы обнаружили проблему безопасности, пожалуйста, сообщите ответственно: не
            публикуйте подробности до устранения и свяжитесь с нами по email ниже. Мы
            постараемся ответить в разумные сроки.
          </p>
        </Section>

        <Section title="Контакты">
          <p>
            По вопросам безопасности и приватности:{" "}
            <a
              className="text-primary underline underline-offset-2"
              href="mailto:teacher@livenote.app"
            >
              teacher@livenote.app
            </a>
          </p>
        </Section>

        <Section title="О чём эта страница не говорит">
          <p>
            LiveNotebook не заявляет о сертификациях SOC 2, ISO 27001, HIPAA, PCI DSS или
            соответствии GDPR. Указанные выше меры — это текущие практики продукта, а не
            гарантии или юридические обязательства.
          </p>
        </Section>
      </div>

      <div className="mt-8 text-center">
        <Link
          to="/"
          className="inline-block rounded-xl border border-border bg-background px-4 py-2 text-sm text-foreground"
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
