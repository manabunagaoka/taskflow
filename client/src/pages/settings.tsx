import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/lib/team-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { apiBase } = useTeam();

  const handleExport = async () => {
    try {
      const res = await apiRequest("GET", `${apiBase}/export`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `taskflow-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Data exported successfully" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const importData = useMutation({
    mutationFn: async (data: unknown) => {
      await apiRequest("POST", `${apiBase}/import`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: "Data imported successfully" });
    },
    onError: () => {
      toast({ title: "Import failed — invalid data format", variant: "destructive" });
    },
  });

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        importData.mutate(data);
      } catch {
        toast({ title: "Invalid JSON file", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage your data and backups</p>

      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium mb-1">Export Data</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Download all your tasks, team members, and projects as a JSON file.
                Use this to create backups or transfer data.
              </p>
              <Button size="sm" variant="outline" onClick={handleExport} data-testid="button-export">
                <Download className="h-4 w-4 mr-1" />
                Export JSON
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium mb-1">Import Data</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Upload a previously exported JSON file. This will replace all current data.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importData.isPending}
                data-testid="button-import"
              >
                <Upload className="h-4 w-4 mr-1" />
                Import JSON
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-muted">
              <Database className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium mb-1">Data Storage</h3>
              <p className="text-xs text-muted-foreground">
                All data is stored on the server in memory. Export regularly to avoid data loss.
                Use the import feature to restore from backups.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
