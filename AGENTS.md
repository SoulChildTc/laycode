# LayCode Mobile

## Project Structure

```
opencode-mobile/
├── app/          # Expo React Native app (iOS/Android)
├── bridge/       # Desktop bridge server (Express), proxies to opencode
├── start.sh      # One-click launcher
```

## General Rules

- **Always check opencode source first** — The opencode TUI (`packages/tui/`) has every feature already implemented. Search there before writing anything.
- **SDK types** are in `@opencode-ai/sdk` v1 `dist/gen/types.gen.d.ts`.
- **Bridge proxies everything** — Any `/opencode-api/<path>` works through the bridge automatically. No bridge changes needed.
- **Prefer raw `fetch`** when SDK types are overly complex for the task.
- Each submodule (`app/`, `bridge/`) has its own `AGENTS.md` with module-specific rules.
