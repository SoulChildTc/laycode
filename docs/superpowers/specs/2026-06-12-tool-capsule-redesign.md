# ToolCallCapsule Redesign

## Problem
Current ToolCallCapsule dumps raw JSON for input/output of all tools. Long content (especially `write`) makes the chat unusable — the capsule scrolls off-screen, leaving no way to collapse.

## Approach
Per-tool display rules + fixed-cap height detail area with internal scrolling.

## Per-Tool Display Spec

| Tool | Icon | Input Display | Output | Detail Area |
|------|------|--------------|--------|-------------|
| read | 📄 | `{filepath}` | Hidden | — |
| bash | $ | `{command}` + `{description}` | Truncated (max 20 lines) | Code block |
| write | 📝 | `{filepath}` | Truncated (max 20 lines) | Code block, input collapsed variant |
| edit | ✏️ | `{filepath}` | Diff display (+/- lines) | Collapsed by default |
| apply_patch | ✏️ | `{filepath}` | Diff display | Collapsed by default |
| glob | 🔍 | `{pattern}` (+ `{path}`) | File list (max 15 items) | Short list, no expand |
| grep | 🔍 | `{pattern} in {path}` | Match lines (max 15) | Truncated |
| webfetch | 🌐 | `{url}` | Hidden | — |
| websearch | 🔎 | `{query}` | Hidden | — |
| list | 📂 | `{path}` | File list (max 15) | Short list |
| todowrite | 📋 | `更新了 N 项待办` | Hidden | — |
| external_directory | 📁 | `{path}` | Hidden | — |
| question | ❓ | `{question text}` | Hidden | — |
| skill | 🧠 | `{name}` | Hidden | — |

## Detail Area UX
- Max height: 200px (roughly 10-12 lines of code)
- Internal ScrollView inside detail area
- Capsule header stays visible at all times — tap to collapse works without scrolling
- Collapse arrow always present when detail is expanded

## Code Structure
- `toolConfig.ts` — registry mapping tool name → display config (`icon`, `getTitle`, `getSubtitle`, `showOutput`, `getOutputPreview`)
- `DiffView.tsx` — simple +/- line diff renderer (new component, optional)
- `ToolCallCapsule.tsx` — updated to use config, with max-height detail area

## Future
- `FilePart` attachment display (tool-generated files: screenshots, code files) — not in scope