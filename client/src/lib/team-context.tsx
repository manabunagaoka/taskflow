import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useParams } from "wouter";

interface TeamContextType {
  teamSlug: string;
  teamName: string;
  apiBase: string; // e.g. "/api/t/acme-marketing"
}

const TeamContext = createContext<TeamContextType | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ teamSlug: string }>();
  const teamSlug = params.teamSlug || "";
  const apiBase = `/api/t/${teamSlug}`;
  const [teamName, setTeamName] = useState("");

  useEffect(() => {
    if (!teamSlug) return;
    fetch(`/api/teams/${teamSlug}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.name) setTeamName(data.name); })
      .catch(() => {});
  }, [teamSlug]);

  return (
    <TeamContext.Provider value={{ teamSlug, teamName, apiBase }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within a TeamProvider");
  return ctx;
}
