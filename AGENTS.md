# WLSP – Agent Notes

## What This Project Provides
- Visual Studio Code extension (`package.json` name `wlsp`) delivering a Wolfram Language IDE experience: inline evaluation, hover previews, notebooks, plot/data panels, and debugging hooks.
- Shipping artifact is the compiled extension bundle in `dist/` plus two .NET executables (`fswstp`, `fswstpk`) that bridge VS Code with Wolfram kernels via MathLink/NETLink.
- Requires a local Wolfram installation or Wolfram Engine accessible through `wolframscript`; the executable path is configurable via `wlsp.executablePath`.

## Source Layout Highlights
- `src/`: TypeScript VS Code extension sources. Entry point `extension.ts` calls `startLanguageServer` in `clients.ts`, registering commands, notebook serializers, tree/data views, and spinning up Wolfram kernel + language server processes.
- `fswstp/` & `fswstpk/`: F# .NET 9.0 projects that implement the language server backends (main and kernel variants). They depend on `LanguageServerProtocol` NuGet package and `Wolfram.NETLink.dll`, and ship platform-specific MathLink binaries (`mathlink.framework`, `ml64i*.dll`).
- `wolfram/`: Wolfram Language scripts invoked by the extension and F# servers (`wolfram-lsp.wl`, `wolfram-kernel.wl`, `wolfram-editor.wl`, etc.), as well as resources for completions, symbol metadata, file transforms, and notebook conversion helpers.
- `syntaxes/` & `language-configuration.json`: TextMate grammar and editor configuration for `.wl` / `.wls` files.
- `media/` & project root `.gif/.jpg`: marketing assets for the VS Code marketplace listing.
- Legacy/sample pieces such as `src/server.ts` (Node LSP proof-of-concept) and `README.wl` (demo notebook) exist but are not part of the current activation path.

## Build & Testing Workflow
- Node/TypeScript toolchain is configured via `tsconfig.json`; Webpack bundles the extension into `dist/extension`. Scripts assume `npm install` has been run (note: `node_modules/` is already committed here).
- Compilation depends on .NET SDK 9.0 to build both F# projects before invoking TypeScript/webpack (`npm run compile`, `npm run webpack`, or `npm run vscode:prepublish`). Prepublish scripts produce self-contained binaries for both win-x64 and osx-x64 targets.
- Tests (`npm test`) presently just ensure the extension compiles; there are no automated integration tests for the Wolfram runtime.

## Runtime Behaviour to Remember
- `clients.ts` manages two long-lived child processes: the wolfram kernel (`wolfram-kernel.wl`) and the language server script (`wolfram-lsp.wl`). Output is exchanged using JSON packets split by the sentinel string `(*---*)`.
- Extension maintains evaluation queues, plot/data view updates, notebook serialization (`WolframNotebookSerializer`), and various commands prefixed `wolfram.*`. Be cautious when altering evaluation flow—several features rely on shared state maps (`evaluationQueue`, `editorDecorations`, etc.).
- Debugging support is wired through `WolframDebugAdapterDescriptorFactory` and `WolframDebugConfigProvider` (see `src/debug.ts`), with a `DEBUG_PORT` hard-coded to 7810.
- Workspace symbol search is powered by custom providers in `treeDataProvider.ts`, backed by data files in `wolfram/details.json` and `wolfram/completions.json`.

## External Dependencies & Environment Expectations
- Wolfram Engine must be installed locally; default command `wolframscript` must resolve on PATH or be overridden through extension settings.
- MathLink/NETLink binaries shipped under `fswstp*/` are required at runtime; ensure they remain aligned with the target Wolfram version.
- Uses `find-free-port`, `ps-tree`, `@vscode/webview-ui-toolkit`, `d3`, `bson`, etc., for VS Code integrations and webviews.

## Useful Commands
- `npm run compile`: builds both F# executables and compiles TypeScript (good quick sanity check).
- `npm run webpack` / `npm run webpack-dev`: rebuilds F# projects then bundles the extension in development or watch mode.
- `npm run vscode:prepublish`: full release build producing multi-platform binaries and production webpack bundle (requires OpenSSL legacy provider env var).

## Open Questions / Follow-Ups
- Confirm whether both `fswstp` and `fswstpk` binaries are still required or if one is legacy; audit duplicated logic before major refactors.
- Investigate status of `src/server.ts` (Node-based LSP) and `package copy.json` variants; they may be historical artifacts safe to remove but need validation. 
- No formal tests exist for Wolfram integration; consider scripting smoke tests (requires Wolfram Engine) when adding substantial features.
