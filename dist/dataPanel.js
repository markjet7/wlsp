"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataViewProvider = void 0;
const vscode_1 = require("vscode");
class DataViewProvider {
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        this._view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode_1.Uri.joinPath(this._extensionUri, "media")]
        };
        this._view.webview.html = this.getOutputContent(this._view.webview, this._extensionUri);
        this._view.show(true);
        this._vars = "";
        this._view.onDidChangeVisibility((e) => {
            var _a, _b;
            if ((_a = this._view) === null || _a === void 0 ? void 0 : _a.visible) {
                (_b = this._view) === null || _b === void 0 ? void 0 : _b.webview.postMessage({ vars: (this._vars) });
            }
        });
        this._view.onDidDispose(() => {
            this._view = undefined;
        }, null);
        return;
    }
    updateView(vars) {
        var _a;
        this._vars = vars;
        (_a = this._view) === null || _a === void 0 ? void 0 : _a.webview.postMessage({ vars: (vars) });
        if (this._view) {
            // this._view.webview.html = this.getOutputContent(this._view.webview, this._extensionUri);
        }
        else {
            // console.log("No data view")
        }
    }
    constructor(_extensionUri0) {
        this._extensionUri0 = _extensionUri0;
        this._vars = "";
        this._extensionUri = _extensionUri0;
    }
    getOutputContent(webview, extensionUri) {
        let timeNow = new Date().getTime();
        const toolkitUri = getUri(webview, extensionUri, [
            "media",
            "toolkit.js"
        ]);
        let result = `<!DOCTYPE html>
        <html lang="en">
        <head>
    
            <style type="text/css">
    
                body{
                    overflow:scroll;
                    height:100%;
                }
    
                body.vscode-light {
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font: var(--vscode-editor-font-family);
                }
    
                body.vscode-dark {
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font: var(--vscode-editor-font-family);
                }
    
                body.vscode-high-contrast {
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font: var(--vscode-editor-font-family);
                }
    
                #expression {
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font: var(--vscode-editor-font-family);
                    width: 100%;
                }
    
                #vars {
                    height:98vh;
                    position:relative;
                    top:0;
                    border-bottom: solid white 1px;
                    overflow-y:scroll;
                    width:93vw;
                }
    
                .outer {
                    height:100vh;
                    display:block;
                    position:relative;
                    top:0;
                }
                #scratch {
                    position:fixed;
                    width:95vw;
                    bottom:0px;
                    height: 8vh;
                }
    
                #scratch textarea {
                    border-radius:2px;
                    color: var(--vscode-editor-foreground);
                    font: var(--vscode-editor-font-family);
                }
    
            </style>
            <meta charset="UTF-8">
    
            <meta
                http-equiv="Content-Security-Policy"
                content="default-src 'none'; img-src ${webview.cspSource} https:; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';"
                />
    
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <script type="module" src="${toolkitUri}"></script>
            <title>Data Table</title>
            <script>
                const vscode = acquireVsCodeApi();
    
                function scrollToBottom() {
                    // window.scrollTo(0,document.body.scrollHeight);
    
                    var color = '';
                    var fontFamily = '';
                    var fontSize = '';
                    var theme = '';
                    var fontWeight = '';
                    try {
                        computedStyle = window.getComputedStyle(document.body);
                        color = computedStyle.color + '';
                        backgroundColor = computedStyle.backgroundColor + '';
                        fontFamily = computedStyle.fontFamily;
                        fontSize = computedStyle.fontSize;
                        fontWeight = computedStyle.fontWeight;
                        theme = document.body.className;
                    } catch(ex) { }
                }
    
            function run(input) {
                if(event.key === 'Enter') {
                    if(event.shiftKey) {
                        vscode.postMessage({
                            text: input.value
                        });
                        input.value = ""
                    }
                }
            }
    
            window.addEventListener('message', event => {
                const message = event.data;
                console.log(message.vars)
    
                const varT = document.getElementById("vars");
                varT.innerHTML = message.vars;
            })
            </script>
        </head>
        <body>
            <div class="outer">
                <div id="vars">
                    <vscode-data-grid id="varTable" generate-header="sticky" aria-label="With Sticky Header">
                        <vscode-data-grid-row row-type="header">
                            <vscode-data-grid-cell cell-type="columnheader" grid-column="1">Name
                            </vscode-data-grid-cell>
                            <vscode-data-grid-cell cell-type="columnheader" grid-column="2">value
                            </vscode-data-grid-cell>
                        </vscode-data-grid-row>
                  
                    
                    </vscode-data-grid>
                </div>
            </div>
        </body>
        </html>`;
        return result;
    }
}
exports.DataViewProvider = DataViewProvider;
DataViewProvider.viewType = "wolfram.dataView";
function getUri(webview, extensionUri, pathList) {
    // return webview.asWebviewUri(
    //     Uri.file(
    //         Uri.joinPath(extensionUri, ...pathList).toString()));
    return webview.asWebviewUri(vscode_1.Uri.joinPath(extensionUri, ...pathList));
}
//# sourceMappingURL=dataPanel.js.map