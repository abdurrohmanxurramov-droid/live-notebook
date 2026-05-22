import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui-bits";
import { StudentRoom } from "@/components/StudentRoom";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/students/$id")({ component: StudentDetailPage });

function StudentDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  return (
    <div className="px-4 pt-6">
      <button
        onClick={() => navigate({ to: "/" })}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Назад
      </button>
      <StudentRoom id={id} />
    </div>
  );
}
