
import { Uri, 
    Webview, 
    WebviewView, 
    WebviewViewProvider,
    WebviewViewResolveContext,
    CancellationToken, 
    ExtensionContext} from "vscode";

import * as vscode from 'vscode';

import { restartKernel } from "./clients";

import fs = require('fs');

export class PlotsViewProvider implements WebviewViewProvider {
    public _view?: WebviewView;
    private _extensionUri: Uri;
    private _text: string = "";
    private _context: ExtensionContext|undefined;
    private _allOutputs: Map<string, string> = new Map();
    private _out: any[]= [];
    private _fontSize: string = vscode.workspace.getConfiguration().get("wlsp.fontSize") || "var(--vscode-editor-font-size)";

    public static readonly viewType = "wolfram.plotsView";


    constructor(private readonly _extensionUri0: Uri, context:ExtensionContext|undefined) {
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

        this._view.webview.onDidReceiveMessage((data:any) => {
            if (data.text === "restart") {
                restartKernel();
            }

            if (data.text === "open") {
                // open new untitled document with content of data.output
                // console.log(data.output)

                // new document
                vscode.workspace.openTextDocument({ content: this._allOutputs.get(data.data) }).then((document) => {
                    vscode.window.showTextDocument(document);
                });
            }

            if (data.text === "paste") {
                // paste content of data.output
                // console.log(data.output)
                let editor = vscode.window.activeTextEditor;
                if (editor) {
                    let selection = editor.selection;
                    let position = new vscode.Position(selection.end.line+1, 0);
                    editor.edit((editBuilder) => {
                        editBuilder.insert(position, this._allOutputs.get(data.data)?.toString() + "\n");
                    }
                    );
                }
            }
        }, undefined, this._context?.subscriptions);


        this.updateView(this._out);
        // this._view?.webview.postMessage({text: []});
        this._view.show(true)
        // this._view.onDidChangeVisibility((e) => {
        //     if (this._view?.visible) {
        //         this._view?.webview.postMessage({text: []})
        //     }
        // })

        this._view.onDidDispose(
            () => {
                this._view = undefined;
            },
            null
        );

        // change the plotsView text css format when the configuration changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            this._fontSize = vscode.workspace.getConfiguration().get("wlsp.fontSize") || "var(--vscode-editor-font-size)";
            this._view?.webview.postMessage({command: "fontSize", size:this._fontSize, text: [], input:"", output:[]})
        });

        
        return
    }
    
    public clearResults() {
        this._view?.webview.postMessage({command: "clear", text: [], input:"", output:[]})
    }

    public updateView(out:any[]) {
        // this._text = out;
        this._out = out;
        let out2:any[] = []
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

        this._view?.webview.postMessage({text: (out2)})
    }

    public newInput(input:string) {
        this._view?.webview.postMessage({
            text: [],
            input: input,
            output: ""
        })
    }

    public newOutput(output:string) {
        let img = output
            .replace(`<div class="vertical"><span style="text-align:left" class="vertical-element">`, "")
            .replace(`</span><span style="text-align:left" class="vertical-element"><br></span></div>`, "")
            // .replace(`<?xml version="1.0" encoding="UTF-8"?>`,"");
        // console.log(img)

        this._view?.webview.postMessage({
            text: [],
            input: "",
            output: img
        })
    }

    getOutputContent(webview: any, extensionUri: Uri) {
        let timeNow = new Date().getTime();    
        const toolkitUri = getUri(webview, extensionUri, [
            "media",
            "toolkit.js"
        ]);
        const transformUri = getUri(webview, extensionUri, [
            "media",
            "transform.js"
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
            <style type="text/css">
    
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

                .output_row {
                    background: var(--vscode-tree-tableEvenRowsBackground);
                    overflow-x: scroll;
                    font-size: ${this._fontSize}px;
                    max-height:50vh;
                    overflow-y: scroll;
                }

                .output_row img{
                    width: 98vw;
                }

                #errors {
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    color: #801f01;
                }
    
                #result img{
                    width:90vw;
                    max-height:95vh;
                    object-fit:contain;
                    /* margin: 0; */
                    /* min-height: 200px; */
                    width: auto;
                    margin-bottom: 5px;
                    margin-left: auto;
                    margin-right: auto;
                    display: block;
                }

                #download-link {
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    color: #801f01;
                    display: block;
                    margin-top: 5px;
                    padding: 5px;

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
            <script src="${graphicToSVG}"></script>
            <script type="module" src="${toolkitUri}"></script>
            <script type="module" src="${transformUri}"></script>
            <script src="${d3Uri}"></script>
            <title>Plots</title>
        </head>
        <body onload="loaded()">
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


function invalidator() {
    // VSCode tries to be smart and only does something if the webview HTML changed.
    // That means that our onload events aren't fired and you won't get a thumbnail
    // for repeated plots. Attaching a meaningless and random script snippet fixes that.
    return `<script>(function(){${Math.random()}})()</script>`
}


function getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
    return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}