"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { checkAll, checkNow, type MonitorState } from "@/app/actions/monitoring";
import { Button } from "@/components/ui/button";

function Go({ children, variant = "outline" }: { children: React.ReactNode; variant?: "outline" | "default" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {pending ? "Checking…" : children}
    </Button>
  );
}

function Msg({ s }: { s: MonitorState }) {
  if (!s) return null;
  return <p className={`mt-1 text-xs ${s.error ? "text-red-700" : s.message?.startsWith("Drift") ? "font-medium text-red-700" : "text-emerald-700"}`}>{s.error ?? s.message}</p>;
}

export function CheckNowButton({ monitoredId }: { monitoredId: string }) {
  const [state, action] = useActionState<MonitorState, FormData>(checkNow, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="monitoredId" value={monitoredId} />
      <Go>Check now</Go>
      <Msg s={state} />
    </form>
  );
}

export function CheckAllButton() {
  const [state, action] = useActionState<MonitorState>(checkAll, undefined);
  return (
    <form action={action} className="text-right">
      <Go variant="default">Check all monitored URLs</Go>
      <Msg s={state} />
    </form>
  );
}
