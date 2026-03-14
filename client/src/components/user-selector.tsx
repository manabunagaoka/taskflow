import { useQuery } from "@tanstack/react-query";
import { useTeam } from "@/lib/team-context";
import { useCurrentUser } from "@/context/user-context";
import type { Member } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User } from "lucide-react";

export function UserSelector() {
  const { apiBase } = useTeam();
  const { currentUser, setCurrentUser } = useCurrentUser();

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: [`${apiBase}/members`],
  });

  return (
    <div className="flex items-center gap-1.5">
      <User className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={currentUser || "__none__"} onValueChange={(v) => setCurrentUser(v === "__none__" ? "" : v)}>
        <SelectTrigger className="h-7 w-[140px] text-xs border-none bg-transparent shadow-none">
          <SelectValue placeholder="Working as..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Not selected</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
