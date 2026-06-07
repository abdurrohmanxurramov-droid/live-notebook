import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, Button } from "@/components/ui-bits";
import { exportBackup, importBackup, exportCsv } from "@/lib/backup.functions";
import { Download, Upload, FileSpreadsheet } from "lucide-react";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function BackupSection() {
  const exportFn = useServerFn(exportBackup);
  const importFn = useServerFn(importBackup);
  const exportCsvFn = useServerFn(exportCsv);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setBusy(true);
    try {
      const data = await exportFn({});
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `blocknot-backup-${date}.json`);
      toast.success("Бэкап скачан");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function handleExportCsv() {
    setBusy(true);
    try {
      const data = await exportCsvFn({});
      const date = new Date().toISOString().slice(0, 10);
      const tables: { key: keyof typeof data; name: string }[] = [
        { key: "students", name: "students" },
        { key: "finance", name: "finance" },
        { key: "attendance", name: "attendance" },
        { key: "homework", name: "homework" },
        { key: "lessons", name: "lessons" },
      ];
      let downloaded = 0;
      for (const t of tables) {
        const csv = data[t.key] ?? "";
        if (!csv) continue;
        // BOM for Excel/Sheets UTF-8 compatibility
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
        downloadBlob(blob, `${t.name}-${date}.csv`);
        downloaded++;
        await delay(350);
      }
      toast.success(downloaded === 0 ? "Нет данных для экспорта" : `Скачано файлов: ${downloaded}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    if (
      !confirm("Импортировать данные из бэкапа? Существующие записи с теми же ID будут обновлены.")
    )
      return;
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
        Скачайте JSON-файл со всеми вашими данными, выгрузите таблицы в CSV или загрузите ранее
        сохранённый бэкап.
      </div>
      <Button variant="outline" className="w-full" disabled={busy} onClick={handleExport}>
        <Download className="h-4 w-4" /> Скачать бэкап (JSON)
      </Button>
      <Button variant="outline" className="w-full" disabled={busy} onClick={handleExportCsv}>
        <FileSpreadsheet className="h-4 w-4" /> Экспорт в CSV (5 файлов)
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
      <Button
        variant="outline"
        className="w-full"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-4 w-4" /> Импортировать из файла
      </Button>
    </Card>
  );
}
