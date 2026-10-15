"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { createSubmission, type FormState } from "@/app/actions/submissions";
import { ImageInput } from "@/components/image-input";
import { Button } from "@/components/ui/button";
import { CHANNELS, PRODUCTS, label } from "@/lib/domain";

type SampleOpt = { id: string; title: string; product: string; channel: string; content: string; url?: string };

const field = "h-9 w-full rounded-md border bg-card px-3 text-sm";

function SubmitButton({ ruleHint }: { ruleHint: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={pending} size="lg">
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Running AI pre-check…" : "Submit for review"}
      </Button>
      {pending && <span className="text-sm text-muted-foreground">{ruleHint} This usually takes 5–20 seconds.</span>}
    </div>
  );
}

export function SubmitForm({ samples, rulesByKey }: { samples: SampleOpt[]; rulesByKey: Record<string, { code: string; title: string }[]> }) {
  const [state, action] = useActionState<FormState, FormData>(createSubmission, undefined);
  const [mode, setMode] = useState<"text" | "url">("text");
  const [product, setProduct] = useState<string>("PERSONAL_LOAN");
  const [channel, setChannel] = useState<string>("EMAIL");
  const formRef = useRef<HTMLFormElement>(null);

  function loadSample(id: string) {
    const s = samples.find((x) => x.id === id);
    const f = formRef.current;
    if (!s || !f) return;
    (f.elements.namedItem("title") as HTMLInputElement).value = s.title;
    setProduct(s.product);
    setChannel(s.channel);
    if (s.url) {
      setMode("url");
      setTimeout(() => ((f.elements.namedItem("url") as HTMLInputElement).value = s.url!), 0);
    } else {
      setMode("text");
      setTimeout(() => ((f.elements.namedItem("content") as HTMLTextAreaElement).value = s.content), 0);
    }
  }

  const key = `${product}:${channel}`;
  const applicable = rulesByKey[key] ?? [];
  const ruleHint = `Checking against ${applicable.length} rules.`;

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-zinc-50 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Demo: load a sample →</span>
        <select className="h-8 rounded-md border bg-card px-2 text-sm" defaultValue="" onChange={(e) => loadSample(e.target.value)}>
          <option value="" disabled>
            Choose a sample…
          </option>
          {samples.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} — {s.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5 md:col-span-2">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required maxLength={140} className={field} placeholder="e.g. Spring personal loan email" />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Product</span>
          <select name="product" value={product} onChange={(e) => setProduct(e.target.value)} className={field}>
            {PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Channel</span>
          <select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={field}>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <details className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          <span className="font-medium text-foreground">{applicable.length} rules apply</span> to {label(product)} · {label(channel)}. Product and channel decide which
          regulations are checked (e.g. CAN-SPAM only for email, TCPA only for SMS, endorsement disclosures for social/affiliate content).
        </summary>
        <ul className="mt-2 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {applicable.map((r) => (
            <li key={r.code}>
              <span className="font-mono font-semibold">{r.code}</span> <span className="text-muted-foreground">{r.title}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="space-y-2">
        <div className="inline-flex rounded-md border bg-card p-0.5 text-sm">
          {(["text", "url"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1 ${mode === m ? "bg-primary text-primary-foreground" : "text-zinc-600"}`}
            >
              {m === "text" ? "Paste content" : "Landing page URL"}
            </button>
          ))}
        </div>
        {mode === "text" ? (
          <textarea
            name="content"
            rows={12}
            className="w-full rounded-md border bg-card p-3 font-mono text-sm"
            placeholder="Paste the email, SMS, social post, ad copy or page HTML… (optional if you attach an image)"
          />
        ) : (
          <div className="space-y-1">
            <input name="url" className={field} placeholder="https://… or /demo/affiliates/loanfinderhub-best-loans" />
            <p className="text-xs text-muted-foreground">
              Fetched server-side (10s timeout, 2MB, private addresses blocked). Hidden text and HTML comments are kept and flagged.
            </p>
          </div>
        )}
      </div>

      <ImageInput hint="PNG, JPEG, GIF or WebP up to 3MB. The AI transcribes the text in the image (including fine print) so it is checked against the same rules, and flags instructions hidden in images." />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Planned launch date (optional)</span>
          <input type="date" name="launchDate" className={field} />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Notes for reviewer (optional)</span>
          <input name="notes" maxLength={2000} className={field} />
        </label>
      </div>

      {state?.error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
      <SubmitButton ruleHint={ruleHint} />
    </form>
  );
}

