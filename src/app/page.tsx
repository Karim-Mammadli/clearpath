import Link from "next/link";
import {
  ArrowRight,
  Bot,
  ClipboardCheck,
  Handshake,
  PenLine,
  ShieldCheck,
  FileSearch,
  FlaskConical,
  GitCompareArrows,
  Radar,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Wand2,
} from "lucide-react";
import latest from "../../evals/results/latest.json";
import { switchUser } from "@/app/actions/session";
import { BrandMark } from "@/components/brand-mark";
import { ShaderGradient } from "@/components/landing/shader-gradient";
import { APP } from "@/lib/config";

export const metadata = {
  title: "ClearPath Review: AI pre-review for marketing compliance",
  description: "Prioritized compliance queue + a grounded, injection-resistant AI pre-reviewer. A human always decides.",
};

const REPO = "https://github.com/Karim-Mammadli/clearpath";

type Summary = { micro: { recall: number; precision: number }; cleanFalsePositiveRate: number; injectionResistance: number | null; avgCostUsd: number; avgLatencyMs: number };
const evals = latest as unknown as { samples: number; modes: Record<"deterministic-only" | "hybrid", { summary: Summary }> };
const det = evals.modes["deterministic-only"].summary;
const hyb = evals.modes.hybrid.summary;
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

function RoleButton({ userId, children, variant = "primary" }: { userId: string; children: React.ReactNode; variant?: "primary" | "glass" }) {
  return (
    <form action={switchUser}>
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className={
          variant === "primary"
            ? "group inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#0B3B4A] shadow-lg shadow-black/20 transition hover:bg-[#e9fbf3]"
            : "group inline-flex h-11 items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20"
        }
      >
        {children}
        <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
      </button>
    </form>
  );
}

function ProductPreview() {
  return (
    <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-white/10 p-4 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="flex items-center justify-between text-xs text-white/70">
        <span className="font-medium text-white">Spring personal loan email · v1</span>
        <span className="rounded-md bg-red-500/90 px-1.5 py-0.5 font-semibold text-white">Risk 100</span>
      </div>
      <div className="mt-3 rounded-lg bg-black/25 p-3 font-mono text-[12px] leading-6 text-white/85">
        Subject: <mark className="rounded bg-red-400/35 px-0.5 text-white">You&apos;re APPROVED</mark>, claim your cash today!
        <br />
        Get $10,000 for just <mark className="rounded bg-orange-400/35 px-0.5 text-white">$199/month</mark> for 60 months.{" "}
        <mark className="rounded bg-red-400/35 px-0.5 text-white">Approval is guaranteed</mark> — no credit check required!
      </div>
      <div className="mt-3 space-y-2">
        {[
          ["CRITICAL", "UDAAP-GUARANTEE", "Rule-based", "bg-red-500/90"],
          ["HIGH", "REGZ-CE-TRIGGER", "Rule-based + AI", "bg-orange-500/90"],
          ["HIGH", "CANSPAM-EMAIL", "Missing unsubscribe + address", "bg-orange-500/90"],
        ].map(([sev, code, src, cls]) => (
          <div key={code} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>{sev}</span>
            <span className="font-mono font-semibold">{code}</span>
            <span className="ml-auto text-white/60">{src}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-400/15 px-2.5 py-1.5 text-xs text-emerald-50">
          <ShieldAlert className="size-3.5" /> 1 hallucinated AI finding discarded by grounding check
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-white/60">
        <span>gpt-6.1-sol · prompt reviewer.v1 · rule set v1</span>
        <span className="font-medium text-white">Human decides →</span>
      </div>
    </div>
  );
}

const STEPS = [
  { icon: FileSearch, title: "Submit", body: "Marketers and affiliates paste copy, a landing-page URL, or an image. Hidden text is surfaced, never dropped." },
  { icon: Bot, title: "AI pre-check", body: "Rule-based detectors + an LLM reviewer grounded in a versioned rule library run in seconds." },
  { icon: ScanSearch, title: "Verify", body: "Code checks every AI claim: the rule must apply and the quote must exist verbatim. Unverifiable findings are discarded." },
  { icon: UserCheck, title: "Human decides", body: "Reviewers work a prioritized queue, accept or dismiss findings with reasons, and approve. AI never approves." },
];

const FEATURES = [
  { icon: ShieldAlert, title: "Prompt-injection defense in depth", body: "Untrusted content in a nonce-delimited block, heuristic scan, no tools, output verification, and a manipulation cross-check. Even text hidden in images is caught." },
  { icon: ScanSearch, title: "Grounded, highlighted findings", body: "Every finding cites a rule, quotes the exact text (offsets computed in code), and comes with a concrete fix." },
  { icon: Wand2, title: "Compliant rewrite, self-verified", body: "The AI rewrites flagged copy using approved facts and [PLACEHOLDERS], then the full pipeline re-checks it before anyone can submit." },
  { icon: Radar, title: "Affiliate drift monitoring", body: "Approved once isn't approved forever. Live pages are re-checked; drift becomes a new version, re-reviewed and escalated." },
  { icon: GitCompareArrows, title: "Diffs and an audit trail", body: "Resubmissions show exactly what changed. Every state change is in an append-only audit log, exportable to CSV." },
  { icon: FlaskConical, title: "Evals + AI Ops", body: "Per-rule precision/recall on a labeled set, a CI regression gate, and every LLM call logged with tokens, cost and latency." },
];

const ROLES = [
  { id: "u_sam", icon: ClipboardCheck, role: "Compliance reviewer", who: "Sam Okafor", body: "Work the prioritized queue, triage AI findings, decide." },
  { id: "u_maya", icon: PenLine, role: "Marketer", who: "Maya Chen", body: "Submit content, get instant findings, fix and resubmit." },
  { id: "u_jordan", icon: Handshake, role: "Affiliate partner", who: "Jordan Blake · LoanFinderHub", body: "Sees only their own submissions. Server-enforced." },
  { id: "u_alex", icon: ShieldCheck, role: "Compliance lead", who: "Alex Morgan", body: "Everything, plus AI Ops, evals and drift-monitoring controls." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative isolate overflow-hidden text-white">
        <ShaderGradient className="absolute inset-0 -z-10" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/10 via-transparent to-black/40" />

        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark className="size-8 drop-shadow" />
            <span className="text-[15px] font-semibold tracking-tight">{APP.name}</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <a href={REPO} target="_blank" rel="noreferrer noopener" className="hidden rounded-lg px-3 py-1.5 text-white/80 hover:bg-white/10 hover:text-white sm:inline">
              GitHub
            </a>
            <Link href="/dashboard" className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 font-medium backdrop-blur-md hover:bg-white/20">
              Open the app
            </Link>
          </div>
        </nav>

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-10 pb-24 lg:grid-cols-[1.15fr_1fr] lg:pt-16 lg:pb-32">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-md">
              <Sparkles className="size-3.5" /> AI pre-review for marketing compliance
            </span>
            <h1 className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Ship compliant marketing in hours, not days.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
              ClearPath Review replaces the Excel-and-email review process with a prioritized queue and an AI pre-reviewer that is grounded in a versioned rule library, resistant to
              prompt injection, and never makes the final call.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <RoleButton userId="u_sam">Try as a compliance reviewer</RoleButton>
              <RoleButton userId="u_maya" variant="glass">
                Try as a marketer
              </RoleButton>
            </div>
            <p className="mt-4 text-xs text-white/60">No login: live demo with seeded data. Fictional company; rules simplified, not legal advice.</p>
          </div>
          <div className="flex justify-center animate-in fade-in slide-in-from-bottom-6 duration-1000 lg:justify-end">
            <ProductPreview />
          </div>
        </div>

        {/* Eval stats strip (real numbers from evals/results/latest.json) */}
        <div className="mx-auto max-w-6xl px-5 pb-10">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/10 backdrop-blur-xl sm:grid-cols-4">
            {[
              [`${pct(det.micro.recall)} → ${pct(hyb.micro.recall)}`, "Recall: rules only → rules + AI"],
              [pct(hyb.injectionResistance), "Injection resistance on eval set"],
              [pct(hyb.cleanFalsePositiveRate), "Clean ads flagged HIGH/CRITICAL"],
              [`$${hyb.avgCostUsd.toFixed(3)} · ${(hyb.avgLatencyMs / 1000).toFixed(1)}s`, "Avg cost · latency per review"],
            ].map(([v, l]) => (
              <div key={l} className="bg-black/10 px-5 py-4">
                <div className="text-xl font-semibold tabular-nums sm:text-2xl">{v}</div>
                <div className="mt-0.5 text-xs text-white/70">{l}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-white/50">
            Measured on {evals.samples} labeled samples with the production pipeline. See /evals in the app.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-sm font-semibold text-primary">How it works</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">The AI proposes. Code verifies. Humans decide.</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <s.icon className="size-4.5" />
                </span>
                <span className="text-xs font-semibold text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-semibold text-primary">Built to an AI-security bar</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight">Marketing content is untrusted input, especially from affiliates. We treat it that way.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <f.icon className="size-5 text-primary" />
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-sm font-semibold text-primary">Live demo</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Pick a role and jump in.</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">You can switch roles any time from the top bar inside the app.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <form key={r.id} action={switchUser}>
              <input type="hidden" name="userId" value={r.id} />
              <button type="submit" className="group h-full w-full rounded-2xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                <r.icon className="size-5 text-primary" />
                <div className="mt-3 font-semibold">{r.role}</div>
                <div className="text-xs text-muted-foreground">{r.who}</div>
                <p className="mt-2 text-sm text-muted-foreground">{r.body}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Enter <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </span>
              </button>
            </form>
          ))}
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <BrandMark className="size-5" /> {APP.name} · {APP.disclaimer} Fictional company.
          </div>
          <a href={REPO} target="_blank" rel="noreferrer noopener" className="hover:text-foreground">
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
