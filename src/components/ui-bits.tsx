import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`glass rounded-2xl ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "gold" | "danger" | "outline" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-[44px] text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50";
  const variants: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    gold: "bg-accent text-accent-foreground hover:opacity-90",
    ghost: "bg-transparent text-foreground hover:bg-secondary",
    outline: "border border-border bg-card text-foreground hover:bg-secondary",
    danger: "bg-destructive text-white hover:opacity-90",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full min-h-[44px] rounded-xl border border-white/60 bg-white/60 dark:bg-white/5 dark:border-white/10 backdrop-blur-md px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 ${props.className ?? ""}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...props}
      className={`w-full min-h-[44px] rounded-xl border border-white/60 bg-white/60 dark:bg-white/5 dark:border-white/10 backdrop-blur-md px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 ${props.className ?? ""}`}
    >
      {props.children}
    </select>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "danger" | "gold" }) {
  const tones: Record<string, string> = {
    neutral: "bg-secondary text-secondary-foreground",
    success: "bg-[color:var(--success)]/15 text-[color:var(--success)]",
    danger: "bg-destructive/15 text-destructive",
    gold: "bg-accent/15 text-accent",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Avatar({ initials }: { initials: string }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-foreground">
      {initials || "?"}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-3 flex items-center justify-between px-1">
      <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function Empty({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-secondary/60 ${className}`} />;
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}
