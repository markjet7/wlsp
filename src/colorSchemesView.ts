import {
    Uri,
    Webview,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext,
    CancellationToken
} from "vscode";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

interface ColorSchemeEntry {
    name: string;
    src: string;
}

export class ColorSchemesViewProvider implements WebviewViewProvider {
    public static readonly viewType = "wolfram.colorSchemesView";
    private _view?: WebviewView;
    private _extensionUri: Uri;
    private _colorsPath: string;
    private _packagedColorsPath: string;
    private _configuredPath: string | undefined;
    private getActivePath(): string {
        return fs.existsSync(this._colorsPath) ? this._colorsPath : this._packagedColorsPath;
    }

    constructor(extensionUri: Uri, colorsPath?: string) {
        this._extensionUri = extensionUri;
        this._packagedColorsPath = path.join(this._extensionUri.fsPath, "media", "colorschemes");
        this._colorsPath = colorsPath || this._packagedColorsPath;
        this._configuredPath = colorsPath;
    }

    public resolveWebviewView(
        webviewView: WebviewView,
        _context: WebviewViewResolveContext,
        _token: CancellationToken
    ) {
        this._view = webviewView;

        this.updateColorsPathFromConfig();
        this.applyResourceRoots();

        this._view.webview.html = this.getHtml(this._view.webview);

        this._view.webview.onDidReceiveMessage((message) => {
            if (message?.command === "refresh") {
                this.postSchemes();
            }
        });

        const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("wlsp.colorSchemePath")) {
                this.updateColorsPathFromConfig();
                this.applyResourceRoots();
                this.postSchemes();
            }
        });

        this._view.onDidDispose(() => {
            configListener.dispose();
        });

        this.postSchemes();
    }

    private applyResourceRoots() {
        if (!this._view) {
            return;
        }

        const roots = new Set<string>();
        roots.add(Uri.joinPath(this._extensionUri, "media").toString());
        roots.add(Uri.file(this._packagedColorsPath).toString());

        if (this._configuredPath) {
            roots.add(Uri.file(this._configuredPath).toString());
        }

        this._view.webview.options = {
            enableScripts: true,
            localResourceRoots: Array.from(roots).map((r) => Uri.parse(r))
        };
    }

    private updateColorsPathFromConfig() {
        const configuredPath = vscode.workspace.getConfiguration().get<string>("wlsp.colorSchemePath");
        const cleaned = configuredPath && configuredPath.trim().length > 0 ? configuredPath.trim() : "";
        this._configuredPath = cleaned || undefined;
        this._colorsPath = cleaned && fs.existsSync(cleaned) ? cleaned : this._packagedColorsPath;
    }

    private getSchemes(webview: Webview): ColorSchemeEntry[] {
        const activePath = this.getActivePath();

        if (!fs.existsSync(activePath)) {
            return [];
        }

        const entries = fs.readdirSync(activePath, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".png")
            .map((entry) => {
                const fileUri = Uri.file(path.join(activePath, entry.name));
                return {
                    name: path.basename(entry.name, ".png"),
                    src: webview.asWebviewUri(fileUri).toString()
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    private postSchemes() {
        if (!this._view) {
            return;
        }

        this.updateColorsPathFromConfig();
        this.applyResourceRoots();

        const schemes = this.getSchemes(this._view.webview);
        this._view.webview.postMessage({
            command: "schemes",
            schemes,
            root: this.getActivePath()
        });
    }

    private getHtml(webview: Webview): string {
        const csp = `
            default-src 'none';
            img-src ${webview.cspSource} data:;
            style-src ${webview.cspSource} 'unsafe-inline';
            script-src ${webview.cspSource} 'unsafe-inline';
        `;

        return /* html */ `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="${csp.replace(/\n|\s{2,}/g, " ").trim()}">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                :root {
                    --wlsp-card-bg: rgba(255,255,255,0.04);
                    --wlsp-border: rgba(255,255,255,0.08);
                }

                body {
                    margin: 0;
                    padding: 10px;
                    font-family: var(--vscode-editor-font-family);
                    color: var(--vscode-editor-foreground);
                    background: var(--vscode-editor-background);
                    height: 100vh;
                    box-sizing: border-box;
                    overflow: hidden;
                }

                #header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    gap: 6px;
                }

                #header h2 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                }

                #refresh {
                    border: 1px solid var(--wlsp-border);
                    background: var(--wlsp-card-bg);
                    color: var(--vscode-editor-foreground);
                    border-radius: 4px;
                    padding: 4px 8px;
                    cursor: pointer;
                    font-size: 12px;
                }

                #refresh:hover {
                    border-color: var(--vscode-button-hoverBackground);
                }

                #schemes {
                    height: calc(100vh - 40px);
                    overflow-y: auto;
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 10px;
                    padding-right: 6px;
                }

                .scheme {
                    border: 1px solid var(--wlsp-border);
                    border-radius: 6px;
                    padding: 8px;
                    background: var(--wlsp-card-bg);
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .scheme h3 {
                    margin: 0;
                    font-size: 13px;
                    font-weight: 600;
                    word-break: break-word;
                }

                .scheme img {
                    width: 100%;
                    border-radius: 4px;
                    box-shadow: 0 0 0 1px var(--wlsp-border);
                    object-fit: contain;
                }

                .empty {
                    opacity: 0.8;
                    font-size: 12px;
                    line-height: 1.4;
                }
            </style>
        </head>
        <body>
            <div id="header">
                <h2>Color Schemes</h2>
                <button id="refresh" type="button">Refresh</button>
            </div>
            <div id="schemes" class="empty">Loading color schemes…</div>
            <script>
                const vscode = acquireVsCodeApi();
                const container = document.getElementById("schemes");
                const refresh = document.getElementById("refresh");

                refresh.addEventListener("click", () => {
                    vscode.postMessage({ command: "refresh" });
                });

                function render(schemes, rootPath) {
                    if (!schemes || schemes.length === 0) {
                        container.classList.add("empty");
                        const missingMsg = rootPath ? ' at ' + rootPath : '';
                        container.innerHTML = 'No color schemes found' + missingMsg + '.';
                        return;
                    }

                    container.classList.remove("empty");
                    container.innerHTML = schemes.map((scheme) => {
                        const safeName = scheme.name
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;");
                        return \`
                            <div class="scheme">
                                <h3>\${safeName}</h3>
                                <img src="\${scheme.src}" alt="\${safeName}" loading="lazy" />
                            </div>\`;
                    }).join("");
                }

                window.addEventListener("message", (event) => {
                    const { command, schemes, root } = event.data;
                    if (command === "schemes") {
                        render(schemes, root);
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
