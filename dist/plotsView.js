"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showPlotPanel = exports.PlotsViewProvider = void 0;
const vscode_1 = require("vscode");
class PlotsViewProvider {
    resolveWebviewView(webviewView, context, _token) {
        var _a;
        this._view = webviewView;
        this._view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode_1.Uri.joinPath(this._extensionUri, "media")]
        };
        this._view.webview.html = this.getOutputContent(this._view.webview, this._extensionUri);
        this._view.show(true);
        this._text = "In: ...";
        (_a = this._view) === null || _a === void 0 ? void 0 : _a.webview.postMessage({ text: [["", ""]] });
        // this._view.onDidChangeVisibility((e) => {
        //     if (this._view?.visible) {
        //         this._view?.webview.postMessage({text: (this._text)})
        //     }
        // })
        this._view.onDidDispose(() => {
            this._view = undefined;
        }, null);
        return;
    }
    updateView(out) {
        var _a;
        // this._text = out;
        (_a = this._view) === null || _a === void 0 ? void 0 : _a.webview.postMessage({ text: (out) });
        if (this._view) {
            // console.log("Getting data view")
            // this._view.webview.html = this.getOutputContent(this._view.webview, this._extensionUri);
        }
        else {
            // console.log("No data view")
        }
    }
    constructor(_extensionUri0) {
        this._extensionUri0 = _extensionUri0;
        this._text = "";
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
                    overflow-y:scroll;
                    overflow-x:hidden;
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
    
                .outer {
                    height:100vh;
                    display:block;
                    position:relative;
                    top:5vh;
                }
    
                #result-header {
                    display:block;
                    margin-top: 5px;
                    padding: 5px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                }
    
                #result {
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    border-bottom: var(--vscode-editor-foreground) 2px solid;
                    margin-top: 5px;
                    padding: 10px;
                    display: block;
                    margin:0px;
                    width:90vw;
                    max-height:95vh;
                    object-fit:cover;
                    overflow-y:hidden;
                    image-rendering:auto;
                }
    
                #result img{
                    width:90vw;
                    max-height:95vh;
                    object-fit:cover;
                    /* margin: 0; */
                    /* min-height: 200px; */
                    width: auto;
                    margin-bottom: 5px;
                    margin-left: auto;
                    margin-right: auto;
                    display: block;
                }
    
    
            </style>
            <meta charset="UTF-8">
    
            <!-- <meta
                http-equiv="Content-Security-Policy"
                content="default-src 'none'; img-src ${webview.cspSource} https:; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';"
                /> -->
                <script type="module" src="${toolkitUri}"></script>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Plots</title>
            <script>
                const vscode = acquireVsCodeApi();
                var results = vscode.getState() || [["",""]];
                function scrollToBottom() {
                    window.scrollTo(0,document.body.scrollHeight);
    
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
                results.splice(0, 0, event.data.text).slice(0, 20);
                results = results.filter(v => v !== ["",""]);
                vscode.setState(results);
    
                const outputDiv = document.getElementById('outputs');

                let newHTML = "";
                for (let i = 0; i < results.length; i++) {
                    newHTML += "<hr>In[" + (results.length-i) +"]: " + results[i][0] + "<hr>" + results[i][1];
                }
                outputDiv.innerHTML = newHTML;
    
                outputDiv.scrollTop = outputDiv.scrollHeight;
    
                // scrollToBottom()
    
            })
            </script>
        </head>
        <body>
            <div class="outer">
                <div class="inner" id='outputs'>
                    <p>In: ... </p>
                </div>
            </div>
        </body>
        </html>` + invalidator();
        return result;
    }
}
exports.PlotsViewProvider = PlotsViewProvider;
PlotsViewProvider.viewType = "wolfram.plotsView";
function invalidator() {
    // VSCode tries to be smart and only does something if the webview HTML changed.
    // That means that our onload events aren't fired and you won't get a thumbnail
    // for repeated plots. Attaching a meaningless and random script snippet fixes that.
    return `<script>(function(){${Math.random()}})()</script>`;
}
function showPlotPanel(webview, extensionUri) {
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
                overflow-y:scroll;
                overflow-x:hidden;
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

            .outer {
                height:100vh;
                display:block;
                position:relative;
                top:5vh;
            }

            #result-header {
                display:block;
                margin-top: 5px;
                padding: 5px;
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
            }

            #result {
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
                border-bottom: var(--vscode-editor-foreground) 2px solid;
                margin-top: 5px;
                padding: 5px;
                display: block;
                margin:0px;
                width:95vw;
                max-height:95vh;
                object-fit:cover;
                overflow-y:hidden;
                image-rendering:auto;
            }

            #result img{
                width:95vw;
                max-height:95vh;
                object-fit:cover;
                /* margin: 0; */
                /* min-height: 200px; */
                width: auto;
                margin-bottom: 5px;
                margin-left: auto;
                margin-right: auto;
                display: block;
            }


        </style>
        <meta charset="UTF-8">

        <!-- <meta
            http-equiv="Content-Security-Policy"
            content="default-src 'none'; img-src ${webview.cspSource} https:; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';"
            /> -->
            <script type="module" src="${toolkitUri}"></script>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Plots</title>
        <script>
            const vscode = acquireVsCodeApi();
            function scrollToBottom() {
                window.scrollTo(0,document.body.scrollHeight);

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

            const outputDiv = document.getElementById('outputs');
            outputDiv.innerHTML = message.text;

            // outputDiv.scrollTop = outputDiv.scrollHeight;

            // scrollToBottom()

        })
        </script>
    </head>
    <body>
        <div class="outer">
            <div class="inner" id='outputs'>
                <p>No plots yet... try running some code!</p>
            </div>
        </div>
    </body>
    </html>` + invalidator();
    return result;
}
exports.showPlotPanel = showPlotPanel;
function getUri(webview, extensionUri, pathList) {
    return webview.asWebviewUri(vscode_1.Uri.joinPath(extensionUri, ...pathList));
}
//# sourceMappingURL=plotsView.js.map