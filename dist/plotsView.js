"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showPlotPanel = void 0;
const vscode_1 = require("vscode");
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

            outputDiv.scrollTop = outputDiv.scrollHeight;

            scrollToBottom()

        })
        </script>
    </head>
    <body>
        <div class="outer">
            <div class="inner" id='outputs'>
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