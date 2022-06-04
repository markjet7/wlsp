

import { Uri, Webview } from "vscode";

function invalidator() {
    // VSCode tries to be smart and only does something if the webview HTML changed.
    // That means that our onload events aren't fired and you won't get a thumbnail
    // for repeated plots. Attaching a meaningless and random script snippet fixes that.
    return `<script>(function(){${Math.random()}})()</script>`
}

export function showPlotPanel(webview: any, extensionUri: Uri) {
    let timeNow = new Date().getTime();
    const toolkitUri = getUri(webview, extensionUri, [
        "node_modules",
        "@vscode",
        "webview-ui-toolkit",
        "dist",
        "toolkit.js",
    ]);

    const mainUri = getUri(webview, extensionUri, ["media", "main.js"]);
    const styleUri = getUri(webview, extensionUri, ["media", "style.css"]);
    const codiconsUri = getUri(webview, extensionUri, [
        "node_modules",
        "@vscode",
        "codicons",
        "dist",
        "codicon.css",
    ]);
    
    let result = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <script type="module" src="${toolkitUri}"></script>
        <!-- <script type="module" src="${mainUri}"></script>
        <link rel="stylesheet" href="${styleUri}"> 
        <link rel="stylesheet" href="${codiconsUri}"> -->
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

            #result {
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

        <!-- <meta http-equiv="Content-Security-Policy" content="default-src *; img-src ${webview.cspSource} https: data:; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';"/> -->
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Wolfram Output</title>
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

        })
        </script>
    </head>
    <body onload="scrollToBottom()">
        <div class="outer">
            <div class="inner" id='outputs'>
            </div>
        </div>
    </body>
    </html>` + invalidator();
    return result;
}

function getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
    return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}