Paste this as your first message to Claude Code (from the repo root, after copying CLAUDE.md, docs/, and .env.example into it):

---

Read CLAUDE.md and every file in docs/ fully before writing any code. This is a take-home for PromptArmor, an AI-security company, so the AI pipeline (grounding, verification, prompt-injection defense, evals, observability) matters most.

HARD DEADLINE: live URL + GitHub repo submitted by 9:30 AM PDT today. Follow the time-boxed plan in CLAUDE.md exactly, and use its cut order if a milestone runs over. Tell me the current milestone and whether we're on schedule after each commit.

Then:
1. Give me a short plan (5–10 lines): Prisma schema outline and folder structure. Record assumptions in docs/ASSUMPTIONS.md. Don't wait for approval; start M0 right after.
2. Setup is already done: the GitHub repo is connected to Vercel (every push auto-deploys), Neon Postgres was added through Vercel Storage, and I copied the database URLs into a local `.env` (gitignored). Don't use the Vercel CLI. Check the variable names in .env and wire Prisma to them (pooled URL for the app, unpooled for migrations). Put non-secret settings in src/lib/config.ts, not env vars. **The OpenAI key is NOT available yet** — follow "Building before the OpenAI key arrives" in CLAUDE.md and don't block on it. I'll tell you when it's ready.
3. Get the live URL working by the end of M0, then work through the milestones in order, committing and pushing after each one with typecheck, lint, and tests passing.
4. Before writing the OpenAI client, check the installed `openai` package types for the current Responses API + structured-output syntax. The model is gpt-6.1-sol, set in src/lib/config.ts; it does not support reasoning effort "none" or "minimal".
5. After M3, run S1, S2, and S8 through the pipeline and show me the findings before building the UI on top.
6. At the end, verify every acceptance criterion in docs/SPEC.md §7 on the deployed URL and write the README as described in SPEC.md §8.
