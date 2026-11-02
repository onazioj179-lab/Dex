# Command Palette & UKI

DEX has three input surfaces. They are intentionally distinct:

| Hotkey       | Surface          | Role                                                        |
| ------------ | ---------------- | ----------------------------------------------------------- |
| `Ctrl+K`     | CommandPalette   | Canonical command launcher (apps, settings, actions)        |
| `Ctrl+Space` | UKI overlay      | Conversational AI surface with slash commands & voice       |
| (in-app)     | SpotlightSearch  | Home page search bar — content discovery, not navigation    |

The standalone `SpotlightSearch` overlay variant has been retired; use
`Ctrl+K` for command launching. The `home` variant of `SpotlightSearch` still
powers the home page search bar.

## CommandPalette

Bound by the `useCommandPalette` hook in [src/renderer/App.tsx](../src/renderer/App.tsx).
Lives in [src/renderer/components/CommandPalette.tsx](../src/renderer/components/CommandPalette.tsx).

## UKI overlay

Lives in [src/renderer/components/UkiOverlay.tsx](../src/renderer/components/UkiOverlay.tsx).
The hotkey is wired in [src/renderer/components/AppManager.tsx](../src/renderer/components/AppManager.tsx)
via `useUkiStore.getState().togglePanel()`.

### Slash commands

| Command              | Effect                                                            |
| -------------------- | ----------------------------------------------------------------- |
| `/help`              | List available commands                                           |
| `/open <app>`        | Launch app by id, name, or prefix                                 |
| `/note [title]`      | Open Notes and dispatch `uki:create-note`                         |
| `/task [title]`      | Open Tasks and dispatch `uki:create-task`                         |
| `/find <query>`      | Open Files and dispatch `uki:files-search`                        |
| `/run <workflow>`    | Dispatch `uki:workflow-run`                                       |

Apps that wish to handle these intents listen for the corresponding
`window.addEventListener('uki:create-note', ...)` etc.
