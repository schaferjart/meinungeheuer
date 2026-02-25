Check the current state of the MeinUngeheuer project.

1. Run `pnpm typecheck` — report any TypeScript errors
2. Run `pnpm test` — report test results
3. Check which files exist in each app:
   - apps/tablet/src/ — list components and hooks
   - apps/backend/src/ — list routes and services
   - apps/printer-bridge/src/ — list modules
   - packages/shared/src/ — list type files
   - supabase/migrations/ — list migration files
4. For each screen state in the tablet app (Sleep, Welcome, TextDisplay, TermPrompt, Conversation, Synthesizing, Definition, Printing, Farewell), report: exists? / has content? / has tests?
5. For each backend endpoint, report: exists? / has handler? / has validation?
6. Report which environment variables are referenced but not in .env.example

Summarize: what's done, what's in progress, what's missing. Suggest the next task to work on.
