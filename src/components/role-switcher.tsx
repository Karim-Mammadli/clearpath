"use client";

import { useRef } from "react";
import { switchUser } from "@/app/actions/session";

type U = { id: string; name: string; role: string; org: string };

export function RoleSwitcher({ users, currentId }: { users: U[]; currentId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={switchUser} className="flex items-center gap-2">
      <label htmlFor="role-switch" className="text-xs text-muted-foreground whitespace-nowrap">
        Acting as
      </label>
      <select
        id="role-switch"
        name="userId"
        defaultValue={currentId}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-8 max-w-[18rem] rounded-md border bg-background px-2 text-sm"
      >
        {["REVIEWER", "ADMIN", "MARKETER", "AFFILIATE"].map((role) => (
          <optgroup key={role} label={role.charAt(0) + role.slice(1).toLowerCase()}>
            {users
              .filter((u) => u.role === role)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.org}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </form>
  );
}
