import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, Button } from "@/components/ui-bits";
import { exportBackup, importBackup } from "@/lib/backup.functions";
import { Download, Upload } from "lucide-react";

export function BackupSection() {
  const exportFn = useServerFn(exportBackup);
  const importFn = useServerFn(importBackup);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setBusy(true);
    try {
      const data = await exportFn({});
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `blocknot-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Бэкап скачан");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    if (!confirm("Импортировать данные из бэкапа? Существующие записи с теми же ID будут обновлены.")) return;
    setBusy(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await importFn({ data: { json } });
      const total = Object.values(res.counts).reduce((a, b) => a + b, 0);
      toast.success(`Импортировано записей: ${total}`);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось импортировать");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm text-muted-foreground">
        Скачайте JSON-файл со всеми вашими данными или загрузите ранее сохранённый бэкап.
      </div>
      <Button variant="outline" className="w-full" disabled={busy} onClick={handleExport}>
        <Download className="h-4 w-4" /> Скачать бэкап
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <Button variant="outline" className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4" /> Импортировать из файла
      </Button>
    </Card>
  );
}
