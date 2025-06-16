
import {
    Uri,
    Webview,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext,
    CancellationToken,
    ExtensionContext
} from "vscode";

import * as vscode from 'vscode';

import { restartKernel } from "./clients";

import fs = require('fs');

export class PlotsViewProvider implements WebviewViewProvider {
    public _view?: WebviewView;
    private _extensionUri: Uri;
    private _text: string = "";
    private _context: ExtensionContext | undefined;
    private _allOutputs: Map<string, string> = new Map();
    private _out: any[] = [];
    private _fontSize: string = vscode.workspace.getConfiguration().get("wlsp.fontSize") || "var(--vscode-editor-font-size)";

    public static readonly viewType = "wolfram.plotsView";


    constructor(private readonly _extensionUri0: Uri, context: ExtensionContext | undefined) {
        this._extensionUri = _extensionUri0;
        this._context = context;
    }

    public resolveWebviewView(
        webviewView: WebviewView,
        context: WebviewViewResolveContext,
        _token: CancellationToken) {
        this._view = webviewView;
        this._view.webview.options = {
            enableScripts: true,
            localResourceRoots: [Uri.joinPath(this._extensionUri, "media")]
        };


        this._text = "In: ..."
        this._view.webview.html = this.getOutputContent(this._view.webview, this._extensionUri);

        this._view.webview.onDidReceiveMessage((data: any) => {
            if (data.text === "restart") {
                restartKernel();
            }

            if (data.text === "open") {
                // open new untitled document with content of data.output
                // console.log(data.output)

                // new document
                vscode.workspace.openTextDocument({ content: data.data.replace("📝📋⇩", "")}).then((document) => {
                    vscode.window.showTextDocument(document);
                });
            }

            if (data.text === "paste") {
                // paste content of data.output
                // console.log(data.output)
                let editor = vscode.window.activeTextEditor;
                if (editor) {
                    let selection = editor.selection;
                    let position = new vscode.Position(selection.end.line + 1, 0);
                    editor.edit((editBuilder) => {
                        editBuilder.insert(position, data.data.replace("📝📋⇩", "") + "\n");
                    }
                    );
                }
            }
        }, undefined, this._context?.subscriptions);


        this.updateView(this._out);
        // this._view?.webview.postMessage({text: []});
        this._view.show(true);


        // this._view.onDidChangeVisibility((e) => {
        //     if (this._view?.visible) {
        //         this._view?.webview.postMessage({text: []})
        //     }
        // })

        this._view.onDidDispose(
            () => {

                this._view?.webview.postMessage({ command: "save", text: [], input: "", output: [] })

                this._view = undefined;
            },
            null
        );

        // change the plotsView text css format when the configuration changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            this._fontSize = vscode.workspace.getConfiguration().get("wlsp.fontSize") || "var(--vscode-editor-font-size)";
            this._view?.webview.postMessage({ command: "fontSize", size: this._fontSize, text: [], input: "", output: [] })

            this._view?.webview.postMessage({
                command: "background",
                background: vscode.workspace.getConfiguration().get("wlsp.background") || "none"
            })
        });


        return
    }

    public clearResults() {
        this._view?.webview.postMessage({ command: "clear", text: [], input: "", output: [] })
    }

    public updateView(out: any[]) {
        // this._text = out;
        this._out = out;
        let out2: any[] = []
        let index = 0
        for (let i = 0; i < this._out.length; i++) {
            index = this._allOutputs.size;
            let img = fs.readFileSync(this._out[i][2]).toString();

            img = img.replace(`<div class="vertical"><span style="text-align:left" class="vertical-element">`, "");
            img = img.replace(`</span><span style="text-align:left" class="vertical-element"><br></span></div>`, "");

            let o = [this._out[i][0], this._out[i][1], index]
            this._allOutputs.set(index.toString(), img);
            out2.push(o)
        }

        this._view?.webview.postMessage({ text: (out2) })
    }

    public newInput(row:number, input: string) {


        this._view?.webview.postMessage({
            text: [],
            row: row,
            input: input,
            output: "..."
        })
    }

    public newOutput(row:number, output: string) {
        let img = output
        // .replace(`<div class="vertical"><span style="text-align:left" class="vertical-element">`, "")
        // .replace(`</span><span style="text-align:left" class="vertical-element"><br></span></div>`, "")
        // .replace(`<?xml version="1.0" encoding="UTF-8"?>`,"");
        // console.log(img)

        this._view?.webview.postMessage({
            text: [],
            row,
            input: "",
            output: img
        })
    }

    getOutputContent(webview: any, extensionUri: Uri) {
        //  <link href="DataTables/datatables.min.css" rel="stylesheet">
 
// <script src="DataTables/datatables.min.js"></script>

        const jqueryUri = getUri(webview, extensionUri, [
            "media",
            "jquery-3.7.1.min.js"
        ]);

        const datatablescssUri = getUri(webview, extensionUri, [
            "media",
            "DataTables",
            "datatables.min.css"
        ]);
        const datatablesUri = getUri(webview, extensionUri, [
            "media",
            "DataTables",
            "datatables.min.js"
        ]);


        const toolkitUri = getUri(webview, extensionUri, [
            "media",
            "toolkit.js"
        ]);
        const transformUri = getUri(webview, extensionUri, [
            "media",
            "plotsViewCode.js"
        ]);
        const d3Uri = getUri(webview, extensionUri, [
            "media",
            "d3.min.js"
        ]);

        const graphicToSVG = getUri(webview, extensionUri, [
            "media",
            "graphicToSVG.js"
        ]);

        let result = `<!DOCTYPE html>
            <html lang="en">
            <head>
                <style id="_styles">
            
                svg {
                    width:100%;
                }
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
                    width:99vw;
                    display:block;
                    position:relative;
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
                    font-size: ${this._fontSize}px;
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

                .input_row {
                    background: var(--vscode-tree-tableOddRowsBackground);
                }

                .input_text {
                    position: relative;
                    left: 50px;
                    top: -18px;
                    }

                .output_row {
                    background: var(--vscode-tree-tableEvenRowsBackground);
                    overflow-x: scroll;
                    font-size: ${this._fontSize}px;
                    max-height:50vh;
                    overflow-y: scroll;
                    min-height: 45px;
                    width: 95vw;
                }

                .output_row .errors {
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    color: #801f01;
                }
            
                .output_row img {
                    width:90vw;
                    max-height:95vh;
                    object-fit:contain;
                    margin-bottom: 5px;
                    margin-left: auto;
                    margin-right: auto;
                    display: block;
                }

                .output_row button{
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);

                }

                @keyframes loading {
                    0% {
                    width: 0%;
                    }
                    50% {
                    width: 100%;
                    }
                    100% {
                    width: 0%;
                    }
                }

                .loading {
                    height: 3px;
                    border-radius: 2px;
                    overflow: hidden;
                    position: relative;
                    margin: 10px 0;
                }

                .loading::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    height: 100%;
                    background-color: var(--vscode-progressBar-background);
                    animation: loading 2s infinite;
                }

                .vertical {
                    display: flex;
                    flex-direction: column;
                    border: 1px solid #ccc;
                    width: fit-content;
                }

                .vertical-element {
                    text-align: left;
                    padding: 5px;
                    border-bottom: 1px solid #ccc;
                    border-top: 1px solid #ccc;
                    width: auto;
                }
            
                .horizontal {
                    display: flex;
                    flex-direction: row;
                    border: 1px solid #ccc;
                    width: fit-content;
                }

                .horizontal-element {
                    text-align: left;
                    padding: 5px;
                    border-right: 1px solid #ccc;
                }

                .horizontal-element:last-child {
                    border-right: none;
                }
            
                </style>
                <meta charset="UTF-8">
            
                <meta
                http-equiv="Content-Security-Policy"
                content="default-src 'none'; 
                img-src 'self' data: ${webview.cspSource} file: vscode-resource: https:; 
                script-src 'self' ${webview.cspSource} 'unsafe-inline'; 
                style-src 'self' ${webview.cspSource} 'unsafe-inline';
                object-src 'self' ${webview.cspSource} 'unsafe-inline';"
                /> 

                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script type="module" src="${transformUri}"></script>
                <title>Plots</title>
            </head>
            <body onload="">
                <div class="outer">
                <div id="progress" class=""></div>
                <div class="inner" id='outputs'>
                    <p>In: ... </p>
                </div>
                </div>
            </body>
            </html>` + invalidator();
        return result;
    }
}


function invalidator() {
    // VSCode tries to be smart and only does something if the webview HTML changed.
    // That means that our onload events aren't fired and you won't get a thumbnail
    // for repeated plots. Attaching a meaningless and random script snippet fixes that.
    return `<script>(function(){${Math.random()}})()</script>`
}


function getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
    return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}