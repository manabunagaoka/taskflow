import { createContext, useContext, useState, type ReactNode } from "react";

interface UserContextType {
  currentUser: string;
  setCurrentUser: (name: string) => void;
}

const UserContext = createContext<UserContextType>({
  currentUser: "",
  setCurrentUser: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return localStorage.getItem("taskflow-current-user") || ""; } catch { return ""; }
  });

  const setUser = (name: string) => {
    setCurrentUser(name);
    try { localStorage.setItem("taskflow-current-user", name); } catch {}
  };

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser: setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useCurrentUser() {
  return useContext(UserContext);
}
