import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/lessons")({
  beforeLoad: () => {
    throw redirect({ to: "/schedule", replace: true });
  },
});
