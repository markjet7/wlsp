
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
        
        return
    }
    
    public clearResults() {
        this._view?.webview.postMessage({command: "clear", text: []})
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
            .replace(`</span><span style="text-align:left" class="vertical-element"><br></span></div>`, "");

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

                .input_row {
                    background: var(--vscode-tree-tableOddRowsBackground);
                }

                #errors {
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    color: #801f01;
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
                content="default-src 'none'; img-src data: ${webview.cspSource} file: vscode-resource: https:; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';"
                /> 
                <script type="module" src="${toolkitUri}"></script>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Plots</title>
            <script>
                const vscode = acquireVsCodeApi();
                var viewState = vscode.getState() || [];
                // results = [];
                var index = 0;
                
                function loaded() {
                    index = 0; // results.length;
                    // results = vscode.getState() || [];
                    // results = [];
                    
                    const outputDiv = document.getElementById('outputs');
                    outputDiv.innerHTML = viewState;
        
                    outputDiv.scrollTop = outputDiv.scrollHeight;
        
                    // Add a download button for each image element
                    updateImageElements();
                }
                
                
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

            var lastInput = "";
            window.addEventListener('message', event => {

                const message = event.data;        

                if ("command" in message && message.command === "clear") {
                    clearOutputs();
                    return;
                }

                const outputDiv = document.getElementById('outputs');
                console.log(message);
                if (message.input.length > 0) {
                    index += 1;
                    console.log("index: " + index);
                    lastInput = "<div class='input_row'><hr>In[" + index + "]: " + message.input + "<hr></div><div class='output_row'>Loading...</div>";
                    outputDiv.innerHTML = lastInput + outputDiv.innerHTML;
                }

                if (message.output.length > 0) {
                    outputDiv.innerHTML = outputDiv.innerHTML.replace('<div class="output_row">Loading...</div>',  message.output + "<br><button type='button' name='open' textContent='Open' onclick='openOutputInNewDocument(\`" + message.output + "\`)'>Open</button>" + "<button type='button' name='paste' textContent='Paste' onclick='pasteOutput(\`" + message.output + "\`)'>Insert</button><br>")
                    // + outputDiv.innerHTML;
                    // outputDiv.innerHTML = lastInput;

                    
                }

                vscode.setState(outputDiv.innerHTML);
    
                // outputDiv.scrollTop = outputDiv.scrollHeight;
    
                // Add a download button for each image element
                updateImageElements();
    
            });

            // Get all image elements on the page
            // const imageElements = document.getElementsByTagName("img");

            const updateImageElements = () => {
                
                var downloadlinks = document.querySelectorAll("#download-link");
                for (const downloadlink of downloadlinks) {
                    downloadlink.remove();
                }

                // Get all image elements on the page
                var imageElements = document.getElementsByTagName("img");

                // Add a download button for each image element
                for (const imageElement of imageElements) {
                    createDownloadButton(imageElement);
                }
            };

            // Create a function to handle the click event 
            const handleImageClick = (imageElement) => {
                // Create an anchor element
                const link = document.createElement("a"); 

                // Set the image source as the link's href and specify the download attribute
                link.href = imageElement.src;
                link.download = "image.png";

                // Trigger the click event on the link element to start the download
                link.click();
            };

            // Function to create a download button for the given image element
            const createDownloadButton = (imageElement) => {
                // Create a button element
                const button = document.createElement("button");
                button.id = "download-link";

                // Set the button's text
                button.textContent = "Download";

                // Add a click event listener to the button
                button.addEventListener("click", () => handleImageClick(imageElement));

                // Insert the button after the image element
                imageElement.insertAdjacentElement("afterend", button);
            };


            var clearButton = document.getElementById('btn_clear');
            function clearOutputs() {
                index = 0;
                vscode.setState("");
                const outputDiv = document.getElementById('outputs');
                outputDiv.innerHTML = "";
            };

            var restartButton = document.getElementById('btn_restart');
            function restart() {
                console.log("Restarting kernel 1");
                test = vscode.postMessage({
                    text: "restart"
                });
                console.log(test);
            };
            
            function openOutputInNewDocument(output)  {
                test = vscode.postMessage({
                    text: "open",
                    // data: span1.textContent || span1.innerText
                    data: output
                });
            };

            function pasteOutput(output) {
                test = vscode.postMessage({
                    text: "paste",
                    // data: span1.textContent || span1.innerText
                    data: output
                });

            };

            </script>
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

// export function showPlotPanel(webview: any, extensionUri: Uri) {
//     let timeNow = new Date().getTime();    
//     const toolkitUri = getUri(webview, extensionUri, [
//         "media",
//         "toolkit.js"
//     ]);

   
//     let result = `<!DOCTYPE html>
//     <html lang="en">
//     <head>
//         <style type="text/css">

//             body{
//                 overflow-y:scroll;
//                 overflow-x:hidden;
//                 height:100%;
//             }

//             body.vscode-light {
//                 background: var(--vscode-editor-background);
//                 color: var(--vscode-editor-foreground);
//                 font: var(--vscode-editor-font-family);
//             }

//             body.vscode-dark {
//                 background: var(--vscode-editor-background);
//                 color: var(--vscode-editor-foreground);
//                 font: var(--vscode-editor-font-family);
//             }

//             body.vscode-high-contrast {
//                 background: var(--vscode-editor-background);
//                 color: var(--vscode-editor-foreground);
//                 font: var(--vscode-editor-font-family);
//             }

//             #expression {
//                 background: var(--vscode-editor-background);
//                 color: var(--vscode-editor-foreground);
//                 font: var(--vscode-editor-font-family);
//                 width: 100%;
//             }

//             .outer {
//                 height:100vh;
//                 display:block;
//                 position:relative;
//                 top:5vh;
//             }

//             #result-header {
//                 display:block;
//                 margin-top: 5px;
//                 padding: 5px;
//                 font-family: var(--vscode-editor-font-family);
//                 font-size: var(--vscode-editor-font-size);
//             }

//             #result {
//                 font-family: var(--vscode-editor-font-family);
//                 font-size: var(--vscode-editor-font-size);
//                 border-bottom: var(--vscode-editor-foreground) 2px solid;
//                 margin-top: 5px;
//                 padding: 5px;
//                 display: block;
//                 margin:0px;
//                 width:95vw;
//                 max-height:95vh;
//                 object-fit:cover;
//                 overflow-y:hidden;
//                 image-rendering:auto;
//             }

//             #result img{
//                 width:95vw;
//                 max-height:95vh;
//                 object-fit:cover;
//                 /* margin: 0; */
//                 /* min-height: 200px; */
//                 width: auto;
//                 margin-bottom: 5px;
//                 margin-left: auto;
//                 margin-right: auto;
//                 display: block;
//             }


//         </style>
//         <meta charset="UTF-8">

//         <meta
//             http-equiv="Content-Security-Policy"
//             content="default-src 'none'; img-src self ${webview.cspSource} file: vscode-resource: https:; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';"
//             /> 
//             <script type="module" src="${toolkitUri}"></script>
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <title>Plots</title>
//         <script>
//             const vscode = acquireVsCodeApi();
//             function scrollToBottom() {
//                 window.scrollTo(0,document.body.scrollHeight);

//                 var color = '';
//                 var fontFamily = '';
//                 var fontSize = '';
//                 var theme = '';
//                 var fontWeight = '';
//                 try {
//                     computedStyle = window.getComputedStyle(document.body);
//                     color = computedStyle.color + '';
//                     backgroundColor = computedStyle.backgroundColor + '';
//                     fontFamily = computedStyle.fontFamily;
//                     fontSize = computedStyle.fontSize;
//                     fontWeight = computedStyle.fontWeight;
//                     theme = document.body.className;
//                 } catch(ex) { }
//             }

//         function run(input) {
//             if(event.key === 'Enter') {
//                 if(event.shiftKey) {
//                     vscode.postMessage({
//                         text: input.value
//                     });
//                     input.value = ""
//                 }
//             }
//         }

//         window.addEventListener('message', event => {
//             const message = event.data;

//             console.log(message);

//             const outputDiv = document.getElementById('outputs');
//             outputDiv.innerHTML = message.text;

//             // outputDiv.scrollTop = outputDiv.scrollHeight;

//             // scrollToBottom()

//         })
//         </script>
//     </head>
//     <body>
//         <div class="outer">
//             <div class="inner" id='outputs'>
//                 <p>No plots yet... try running some code!</p>
//             </div>
//         </div>
//     </body>
//     </html>` + invalidator();
//     return result;
// }

function getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
    return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}