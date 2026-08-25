# Chat assistant

The assistant is a shared package, `@complifine/chat`, rendered by both the
producer app (`apps/web`) and the operator console (`apps/console`). Persistence
is the API, not `localStorage`. Drafts, theme, and the Enter-to-send preference
are the only things stored in the browser.

## Why a package

The two apps used to each own a `ChatWorkspace`. They drifted: one had edition
filters, the other had cert-scope versions; neither had history, branching, or
a composer that survived a tab switch. One implementation, two thin wrappers.

```
packages/chat/src
  types.ts, thread.ts, client.ts, store/use-chat.ts
  components/chat-shell.tsx   ← the product
apps/web/src/components/chat-workspace.tsx      ChatShell + company copy
apps/console/src/components/chat-workspace.tsx  ChatShell + #tour-search
```

## Data model

A conversation is a tree. `parent_id` is the previous message. Editing a user
message or regenerating an assistant reply inserts a **sibling**, not an
overwrite. `conversations.active_leaf_id` is the tip currently in view; the
visible thread is the walk from that leaf to the root.

```
user u1
 └─ assistant a1          ← original
     └─ user u2
         ├─ assistant a2  ← first answer
         └─ assistant a3  ← regenerated (sibling of a2)
user u1b (edit of u1, sibling)
 └─ assistant a1b
```

The UI shows `1/2` on a message that has siblings. Switching versions sets
`active_leaf_id` to the deepest descendant of the chosen sibling so a later
follow-up on that branch stays in view.

Tables: `conversations`, `conversation_messages` (migration `0005`).

## API

| Method | Path | Role |
| --- | --- | --- |
| GET | `/conversations?q=&limit=&before=` | List, search title **or** message text, cursor by `updated_at` |
| POST | `/conversations` | Empty conversation (`id` optional so the client can mint one) |
| GET | `/conversations/:id` | Full tree |
| PATCH | `/conversations/:id` | Rename or switch `activeLeafId` |
| DELETE | `/conversations/:id` | Cascade messages |
| POST | `/conversations/:id/messages` | Append (passages mode, tooling) |
| PATCH | `/conversations/:id/messages/:id` | Feedback, content |
| DELETE | `/conversations/:id/messages/:id` | Node and descendants |
| POST | `/ask/stream` | SSE; inserts the turn, streams, then `finishAssistant` |

`POST /ask/stream` accepts `conversationId`, `parentId`, `userMessageId`,
`assistantMessageId`, `skipUser` (regenerate), `userContent` (what the human
typed — the model may receive a version-scoped rewrite), and `attachments`.

Aborting the fetch marks the assistant message `stopped` and keeps the partial
text.

## Composer

- Auto-resizing textarea, capped with internal scroll.
- Enter sends, Shift+Enter newline. Toggle in the sidebar (`Enter sends`).
- Stop replaces Send while a response is in flight. Double-enter is ignored.
- Paste and drag-and-drop images/files, 4 MB cap, removable chips.
- Character warning from 7 200, hard cap 8 000.
- Per-conversation draft in `localStorage` (`cf-chat-draft:<id>`).
- Slash commands: `/new`, `/export`, `/export json`.

## Theming

`.cf-chat` owns the design tokens. The console forces `html.dark`; the chat
shell still has its own light/dark/system toggle because tokens are set on the
shell, not inherited from `html`. Persist key: `cf-chat-theme`.

## Accessibility

Message list is `role="log"` with polite live updates. Branch switchers,
sidebar rows, composer, and Stop are keyboard-reachable. `/` focuses the
composer, Escape closes the mobile drawer, Ctrl/Cmd+N starts a new chat.
Visible `:focus-visible` rings on every control.

## Apps

```tsx
<ChatShell
  apiBase={apiBase()}
  title="Ask the standard"
  versionOptions={[...]}
  criterionHref={(id) => `/criteria/${encodeURIComponent(id)}`}
/>
```

Operator extras: `titleId="tour-search"`, `showKindFilter`, cert-scope versions.
Pass a `models` array when a model picker should appear; it is hidden until then.
Thumbs up/down call `onFeedback` and PATCH the message.

Import styles once per app:

```css
@import "@complifine/chat/styles.css";
@source "../../../../packages/chat/src";
```
