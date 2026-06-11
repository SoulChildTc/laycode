# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# App — React Native (Expo) Patterns

## Architecture

```
App (Expo RN) –HTTP/WS–> Bridge –HTTP–> Opencode Server
```
All API calls go through the bridge at `http://{host}:{port}/opencode-api/...`.

## Client API (`app/src/api/client.ts`)

- Uses both v1 and v2 SDK clients from `@opencode-ai/sdk`.
- Raw `fetch` for custom endpoints (health, browse, config/providers).
- SDK for standard endpoints (session CRUD, messages, file ops).

## Types (`app/src/types/index.ts`)

Keep local types simple. Map SDK types at the API boundary (in `client.ts` methods).

## Navigation (`app/src/navigation/RootNavigator.tsx`)

- Stack navigator at root level (Connect → Main tabs → Workspace → Session).
- Bottom tabs for Home (workspaces), Files, Settings.
- `client` and `themeMode` passed as props through screens.

## State Management

- React `useState` + `useContext` only. No Redux.
- `AsyncStorage` for persistence (model prefs, workspaces, connection config).
- SSE via `XMLHttpRequest` for real-time message streaming.

## Adding a New Screen

1. Create file in `app/src/screens/`.
2. Add to `RootNavigator.tsx` stack or a tab.
3. Pass `client`, `themeMode`, and any route params as props.

## Adding a New Component

- Place in `app/src/components/`.
- Accept `theme: Theme` prop for styling.
- Use `Feather` icons from `@expo/vector-icons`.

## Model Selection Feature — How It Works (Reference)

| Endpoint | SDK Method | Purpose |
|----------|-----------|---------|
| `GET /config/providers` | (raw fetch) | List providers + all models |
| `GET /session/{id}/message` | `client.session.messages()` | Message history; assistant msgs have `providerID`+`modelID` |
| `POST /session/{id}/prompt_async` | `client.session.promptAsync()` | Send message; body accepts `model: { providerID, modelID }` |

Model state: `ModelKey { providerID, modelID }`. Per-session persistence via `AsyncStorage`.
