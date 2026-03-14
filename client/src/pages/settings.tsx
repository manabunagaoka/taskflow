import { useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTeam } from "@/lib/team-context";
import type { Member } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, Database, Trash2, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function Settings() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const { apiBase, teamSlug } = useTeam();
  const [, navigate] = useLocation();

  // Fetch team info to check creator
  const { data: teamInfo } = useQuery<{ id: number; createdBy: number | null }>({
    queryKey: [`/api/teams/${teamSlug}`],
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: [`${apiBase}/members`],
  });

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

  const handleExcelExport = () => {
    window.open(`${apiBase}/export/excel`, "_blank");
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        await apiRequest("POST", `${apiBase}/import/excel`, { data: base64 });
        queryClient.invalidateQueries();
        toast({ title: "Excel import successful" });
      } catch {
        toast({ title: "Excel import failed", variant: "destructive" });
      }
    };
    reader.readAsDataURL(file);
    if (excelInputRef.current) excelInputRef.current.value = "";
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
            <div className="p-2 rounded-lg bg-green-500/10">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium mb-1">Excel Export / Import</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Export your data as an Excel spreadsheet (.xlsx) with Tasks, Team, and Projects sheets.
                Import from a similarly formatted Excel file to add data.
              </p>
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelImport}
                className="hidden"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleExcelExport}>
                  <Download className="h-4 w-4 mr-1" />
                  Export Excel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => excelInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Import Excel
                </Button>
              </div>
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

        {teamInfo?.createdBy && (
          <Card className="p-5 border-destructive/30">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-destructive/10">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium mb-1">Delete Team</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Permanently delete this team and all its data. This action cannot be undone.
                  Only the team creator can perform this action.
                </p>
                <select
                  id="delete-as-member"
                  className="text-sm border rounded px-2 py-1 mb-3 w-full bg-background"
                  defaultValue=""
                >
                  <option value="" disabled>Select your name to confirm identity</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    const select = document.getElementById("delete-as-member") as HTMLSelectElement;
                    const memberId = select?.value;
                    if (!memberId) {
                      toast({ title: "Select your name first", variant: "destructive" });
                      return;
                    }
                    if (!confirm("Are you absolutely sure? This will delete the entire team and all data.")) return;
                    try {
                      const res = await fetch(`${apiBase}`, {
                        method: "DELETE",
                        headers: { "x-member-id": memberId },
                      });
                      if (res.status === 403) {
                        toast({ title: "Only the team creator can delete this team", variant: "destructive" });
                        return;
                      }
                      if (!res.ok) throw new Error();
                      toast({ title: "Team deleted" });
                      navigate("/");
                    } catch {
                      toast({ title: "Failed to delete team", variant: "destructive" });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Team
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
