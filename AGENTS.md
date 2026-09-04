# Repository guidelines

## Language and structure

- Write application code and tooling in TypeScript. Do not add JavaScript source files.
- Keep React components in their own folders with their CSS beside them.
- Keep shared UI primitives in `src/ui` and feature components in `src/components`.
- Do not add barrel `index.ts` files; import modules directly.
- Keep application state in `Dashboard`. A component may own state that is private to it, such as `FileShelf` items.
- Keep shared widget labels and options in `src/catalog.ts`.

## Code style

- Every `if` statement must have a block body with braces, including guard clauses.
- Every text file must end with a newline.
- Keep nested JSX readable: put elements with children or several props on separate lines.
- Use Prettier for layout and whitespace; do not hand-align code against its output.
- Preserve strict TypeScript and prefer type-only imports where possible.
- Do not suppress linter rules unless the reason is documented and the narrower fix is impractical.

## Electron security

- Keep renderer sandboxing and context isolation enabled; never enable Node integration.
- Expose narrow preload APIs through `contextBridge`; never expose raw `ipcRenderer`.
- Validate IPC arguments and reject IPC messages that do not originate from the app renderer.
- Deny unexpected navigation, window creation, and permission requests.
- Keep a restrictive Content Security Policy in `src/index.html`.

## Verification

- Run `pnpm lint` after changing TypeScript, TSX, or CSS.
- Run `pnpm format` after changing supported text files.
- Run `pnpm check` before handing off a completed change.
- `pnpm lint` must finish with zero warnings.
- Use `pnpm lint:fix` for safe mechanical fixes, then review the diff.
- Objective-C++ in `native/window_manager.mm` is outside ESLint and Stylelint scope.
