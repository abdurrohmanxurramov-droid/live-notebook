import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getErrorMessage(error: unknown, fallback = "Ошибка") {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export function getSafeUiErrorMessage(error: unknown, fallback = "Что-то пошло не так") {
  const message = getErrorMessage(error, fallback).trim();
  if (!message || message.length > 300) return fallback;
  if (
    /(?:postgres|postgrest|sqlstate|stack trace|relation |column |constraint|schema |service[_ -]?role|private[_ -]?key|access[_ -]?token|refresh[_ -]?token|jwt|bearer|vault|rpc )/i.test(
      message,
    )
  ) {
    return fallback;
  }
  return message;
}
