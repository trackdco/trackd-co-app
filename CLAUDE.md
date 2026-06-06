@AGENTS.md
\<!-- BEGIN:nextjs-agent-rules -->
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
\<!-- END:nextjs-agent-rules -->
Application Building Context
Read the following files in order before implementing or making any architectural decision:
1. Context/project-overview.md – product definition, goals, features, and scope
2. Context/architecture.md – system structure, boundaries, storage model, and invariants
3. Context/ui-context.md – theme, colors, typography, canvas design, and component conventions
4. Context/code-standards.md – implementation rules and conventions
5. Context/ai-workflow-rules.md – development workflow, scoping rules, and delivery approach
6. Context/progress-tracker.md – current phase, completed work, decisions, and open questions (state only; no next steps)
7. Context/next-tasks.md – detailed current + upcoming task steps (the build track + Adrian's parallel track); read this to know what to work on next
Update Context/progress-tracker.md (state) and Context/next-tasks.md (steps) after each meaningful implementation change.
If implementation changes the architecture, scope, or standards documented in the context files, update the relevant file before continuing.