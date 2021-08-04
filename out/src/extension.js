"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const vscode = require("vscode");
const path = require("path");
const net = require("net");
const fp = require('find-free-port');
const psTree = require('ps-tree');
const cp = require("child_process");
const vscode_languageclient_1 = require("vscode-languageclient");
// import {WolframNotebook, WolframProvider} from './notebook';
let client;
let wolframClient;
let wolframStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
wolframStatusBar.command = "wolfram.restart";
wolframStatusBar.text = "$(repo-sync~spin) Loading Wolfram...";
wolframStatusBar.show();
let kernelStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
kernelStatusBar.command = "wolfram.launchKernel";
kernelStatusBar.text = "$(lightbulb)";
kernelStatusBar.color = "foreground";
kernelStatusBar.show();
// let wolframNotebookProvider:WolframProvider;
let PORT;
let outputChannel = vscode.window.createOutputChannel('wolf-lsp');
let lspPath = '';
let theContext;
vscode.workspace.onDidChangeTextDocument(didChangeTextDocument);
vscode.workspace.onDidOpenTextDocument(didOpenTextDocument);
vscode.workspace.onDidSaveTextDocument(didSaveTextDocument);
vscode.window.onDidChangeWindowState(didChangeWindowState);
vscode.commands.registerCommand('wolfram.runInWolfram', runInWolfram);
vscode.commands.registerCommand('wolfram.runExpression', runExpression);
vscode.commands.registerCommand('wolfram.runToLine', runToLine);
vscode.commands.registerCommand('wolfram.printInWolfram', printInWolfram);
vscode.commands.registerCommand('wolfram.wolframTerminal', startWolframTerminal);
vscode.commands.registerCommand('wolfram.runInTerminal', runInTerminal);
vscode.commands.registerCommand('wolfram.clearDecorations', clearDecorations);
vscode.commands.registerCommand('wolfram.showOutput', showOutput);
vscode.commands.registerCommand('wolfram.help', help);
vscode.commands.registerCommand('wolfram.restart', restartWolfram);
vscode.commands.registerCommand('wolfram.launchKernel', launchKernel);
vscode.commands.registerCommand('wolfram.abort', abort);
let theDisposible;
function activate(context) {
    theContext = context;
    lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
    // wolframNotebookProvider = new WolframProvider("wolfram", context.extensionPath.toString(), true, wolframClient);
    try {
        // context.subscriptions.push(vscode.notebook.registerNotebookContentProvider('wolfram', wolframNotebookProvider));
    }
    catch (_a) { }
    fp(3000).then((freep) => {
        PORT = freep[0];
        console.log("Port: " + PORT.toString());
        loadwolfram().then((success) => __awaiter(this, void 0, void 0, function* () {
            yield new Promise(resolve => setTimeout(resolve, 5000));
            theDisposible = loadWolframServer(outputChannel, context);
            context.subscriptions.push(theDisposible);
            // wolframNotebookProvider.setWolframClient(wolframClient);
        }));
    });
}
exports.activate = activate;
let wolfram;
let loadwolfram = function () {
    return new Promise((resolve, reject) => {
        var _a, _b, _c;
        if (process.env.VSCODE_DEBUG_MODE === "true") {
            PORT = 6589;
        }
        else {
            try {
                if (process.platform === "win32") {
                    wolfram = cp.spawn('cmd.exe', ['/c', 'wolframscript.exe', '-file', lspPath, PORT.toString(), lspPath], { detached: false });
                }
                else {
                    wolfram = cp.spawn('wolframscript', ['-file', lspPath, PORT.toString(), lspPath], { detached: true });
                }
                console.log("Launching wolframscript: " + wolfram.pid.toString());
                (_a = wolfram.stdout) === null || _a === void 0 ? void 0 : _a.once('data', (data) => {
                    resolve(true);
                });
                (_b = wolfram.stdout) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
                    console.log("STDOUT: " + data.toString());
                });
                wolfram.on('SIGPIPE', (data) => {
                    console.log("SIGPIPE");
                });
                (_c = wolfram.stdout) === null || _c === void 0 ? void 0 : _c.on('error', (data) => {
                    console.log("STDOUT Error" + data.toString());
                });
            }
            catch (error) {
                console.log(error.message);
                vscode.window.showErrorMessage("Wolframscript failed to load.");
                return reject(false);
            }
        }
    });
};
function loadWolframServer(outputChannel, context) {
    // let serverOptions = {
    //     run: { module: serverModule, transport: TransportKind.ipc },
    //     debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    // };
    //logtime("start client");
    let serverOptions = function () {
        return new Promise((resolve, reject) => {
            let client = new net.Socket();
            //setTimeout(() =>{
            client.connect(PORT, "127.0.0.1", () => {
                client.setKeepAlive(true, 3000);
                resolve({
                    reader: client,
                    writer: client
                });
            });
            // client.on("error", (e) => { 
            //     console.log("Error:" + e.message);
            //     // loadWolframServer(outputChannel, context);
            //     setTimeout(() =>  loadWolframServer(outputChannel, context), 1000);
            //     client.destroy();
            // });
            // client.on("timeout", () => { console.log("Timeout"); reject();});
            //logtime("connected");
            //}, 10000);
        });
    };
    let clientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel
    };
    wolframClient = new vscode_languageclient_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
    wolframClient.onReady().then(() => {
        //wolframClient.sendRequest("DocumentSymbolRequest");
        wolframClient.onNotification("wolframBusy", wolframBusy);
        wolframClient.onNotification("wolframVersion", wolframVersion);
        wolframClient.onNotification("updateDecorations", updateDecorations);
        wolframClient.onNotification("moveCursor", moveCursor);
        // wolframClient.onNotification("wolframResult", wolframResult);
    });
    let disposible = wolframClient.start();
    return disposible;
}
let wolframVersionText = "";
function wolframVersion(data) {
    wolframVersionText = data["output"];
    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.show();
}
// function wolframResult(result:any) {
//     let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
//     let outputPosition = new vscode.Position(result["position"]["line"], result["position"]["character"]);
//     printResults.push(result["output"]);
//     if (printResults.length > 20) {
//         printResults.shift();
//     }
//     // showOutput(printResults);
//     if(typeof(e) !== "undefined") {
//         e.edit(editBuilder => {
//             // if (result["output"].indexOf("<img") >= 0 ){
//             //     printResults.push(result["output"]);
//             //     showOutput(printResults);
//             // } 
//             if(result["print"]){
//                 editBuilder.insert(outputPosition, "(* " + result["output"] + " *)\n");
//             }
//         });
//     }
//     wolframStatusBar.text = wolframVersionText;
// }
function didOpenTextDocument(document) {
    if (document.languageId !== 'wolfram' || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
        return;
    }
    if (document.languageId === "wolfram") {
        wolframClient.sendRequest("DocumentSymbolRequest");
    }
    return;
}
function didChangeTextDocument(event) {
    // didOpenTextDocument(event.document);
    // remove old decorations
    let editor = vscode.window.activeTextEditor;
    let decorations = [];
    if (editor) {
        let position = editor === null || editor === void 0 ? void 0 : editor.selection.active;
        let uri = editor.document.uri.toString();
        Object.keys(workspaceDecorations[uri]).forEach((line, index) => {
            if (parseInt(line, 10) < position.line) {
                decorations.push(workspaceDecorations[uri][line]);
            }
            else {
                delete workspaceDecorations[uri][line];
            }
        });
        editor.setDecorations(variableDecorationType, decorations);
    }
    return;
}
function didSaveTextDocument(event) {
    didOpenTextDocument(event);
    return;
}
function moveCursor(params) {
    let e = vscode.window.activeTextEditor;
    let outputPosition = new vscode.Position(params["position"]["line"], params["position"]["character"]);
    if (e) {
        e.selection = new vscode.Selection(outputPosition, outputPosition);
        e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
    }
}
function launchKernel() {
    kernelStatusBar.color = "red";
    wolframClient.sendRequest("launchKernel").then((result) => {
        if (result.launched) {
            kernelStatusBar.color = "yellow";
        }
        else {
            kernelStatusBar.color = undefined;
        }
    });
}
let printResults = [];
function runInWolfram(print = false) {
    let e = vscode.window.activeTextEditor;
    let sel = e.selection;
    let outputPosition = new vscode.Position(sel.active.line + 1, 0);
    if ((e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'vscode-notebook-cell') {
        // let n:WolframNotebook | undefined = wolframNotebookProvider._notebooks.get(e.document.uri.toString());
        // if (n){
        //     wolframNotebookProvider.executeCell(n, n.cells[0])
        // }
    }
    else if ((e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'file' || (e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'untitled') {
        e.selection = new vscode.Selection(outputPosition, outputPosition);
        e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
        wolframClient.sendRequest("runInWolfram", { range: sel, textDocument: e.document, print: print }).then((result) => {
            // cursor has not moved yet
            // if (e?.selection.active.line === outputPosition.line && e.selection.active.character === outputPosition.character){
            //     outputPosition = new vscode.Position(result["position"]["line"], result["position"]["character"]);
            //     e.selection = new vscode.Selection(outputPosition, outputPosition);
            //     e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            // }
            // printResults.push(result["output"]);
            if (printResults.length > 1) {
                printResults.shift();
            }
            if (typeof (e) !== "undefined") {
                e.edit(editBuilder => {
                    printResults.unshift(result["output"]);
                    showOutput();
                    if (print) {
                        editBuilder.insert(outputPosition, "\t" + result["result"] + "\n");
                    }
                });
            }
            ;
            updateOutputPanel();
            wolframStatusBar.text = wolframVersionText;
        });
    }
}
function runCell() {
    let e = vscode.window.activeTextEditor;
    // let n: vscode.NotebookDocument| undefined = e?.document;
    // let currentCell:vscode.NotebookCell;
    // if (n?.cells) {
    //     for (let index = 0; index < n.cells.length; index++) {
    //         if (n.cells[index].document.getText() === e?.document.getText()) {
    //             currentCell = n.cells[index]
    //             wolframNotebookProvider.executeCell(e, currentCell)
    //             break
    //         }
    //     }
    // }
}
function runExpression(expression) {
    let print = false;
    wolframClient.sendRequest("runExpression", { print: print, expression: expression }).then((result) => {
    });
}
function printInWolfram() {
    let print = true;
    runInWolfram(print);
}
function abort() {
    wolframClient.sendRequest("abort");
    wolframStatusBar.text = wolframVersionText;
}
function restartWolfram() {
    // try {
    //     kill(wolfram.pid);
    // } catch {
    //     console.log("Failed to stop wolfram: " + wolfram.pid.toString());
    // }
    wolframClient.stop();
    let isWin = /^win/.test(process.platform);
    if (isWin) {
        let cp = require('child_process');
        cp.exec('taskkill /PID ' + wolfram.pid + ' /T /F', function (error, stdout, stderr) {
            // console.log('stdout: ' + stdout);
            // console.log('stderr: ' + stderr);
            // if(error !== null) {
            //      console.log('exec error: ' + error);
            // }
        });
    }
    else {
        kill(wolfram.pid);
    }
    //let context = myContext;
    wolframStatusBar.text = "$(repo-sync~spin) Loading Wolfram...";
    wolframStatusBar.show();
    vscode.window.showInformationMessage("Wolfram is restarting.");
    // context.subscriptions.forEach((sub:any) => {
    //     try {
    //         sub.dispose();
    //     } catch (error) {
    //         console.log("subs: " + error);
    //     }
    // });
    // context.subscriptions.push(loadWolframServer(outputChannel, context));
    theContext.subscriptions.length = 0;
    fp(3000).then((freep) => {
        PORT = freep[0];
        console.log("Port: " + PORT.toString());
        loadwolfram().then((success) => {
            // loadWolframServer(outputChannel, context)
            theDisposible.dispose();
            theDisposible = loadWolframServer(outputChannel, theContext);
            // wolframNotebookProvider.setWolframClient(wolframClient);
            // try{
            //     theContext.subscriptions.push(vscode.notebook.registerNotebookContentProvider('wolfram', wolframNotebookProvider));
            // } catch {}
            theContext.subscriptions.push(theDisposible);
            wolframStatusBar.text = wolframVersionText;
        });
    });
}
let kill = function (pid) {
    let signal = 'SIGKILL';
    let callback = function () { };
    var killTree = true;
    if (killTree) {
        psTree(pid, function (err, children) {
            [pid].concat(children.map(function (p) {
                return p.PID;
            })).forEach(function (tpid) {
                try {
                    process.kill(tpid, signal);
                }
                catch (ex) { }
            });
            callback();
        });
    }
    else {
        try {
            process.kill(pid, signal);
        }
        catch (ex) { }
        callback();
    }
};
function runToLine() {
    let e = vscode.window.activeTextEditor;
    let sel = e === null || e === void 0 ? void 0 : e.selection.active;
    let outputPosition = new vscode.Position(sel.line + 1, 0);
    let r = new vscode.Selection(0, 0, sel.line, sel.character);
    e.revealRange(r, vscode.TextEditorRevealType.Default);
    wolframClient.sendRequest("runInWolfram", { range: r, textDocument: e.document, print: false }).then((result) => {
        // cursor has not moved yet
        if (e.selection.active.line === outputPosition.line - 1 && e.selection.active.character === outputPosition.character) {
            outputPosition = new vscode.Position(result["position"]["line"], result["position"]["character"]);
            e.selection = new vscode.Selection(outputPosition, outputPosition);
            e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
        }
    });
}
function didChangeWindowState(state) {
    if (state.focused === true) {
        wolframClient.sendNotification("windowFocused", true);
    }
    else {
        wolframClient.sendNotification("windowFocused", false);
    }
}
let variableDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'none',
    light: {
        color: new vscode.ThemeColor("foreground")
    },
    dark: {
        color: new vscode.ThemeColor("foreground")
    }
});
let workspaceDecorations = {};
function clearDecorations() {
    let e = vscode.window.activeTextEditor;
    workspaceDecorations = {};
    e === null || e === void 0 ? void 0 : e.setDecorations(variableDecorationType, []);
}
function updateDecorations(decorations) {
    let editor = vscode.window.activeTextEditor;
    if ((editor === null || editor === void 0 ? void 0 : editor.document.uri.scheme) === 'file') {
        //editor.setDecorations(variableDecorationType, []);
        if (typeof (editor) === "undefined") {
            return;
        }
        let uri = editor.document.uri.toString();
        workspaceDecorations[uri] = {};
        decorations.forEach(d => {
            workspaceDecorations[uri][d.range.start.line] = d;
        });
        let editorDecorations = [];
        Object.keys(workspaceDecorations[uri]).forEach((d) => {
            editorDecorations.push(workspaceDecorations[uri][d]);
        });
        editor.setDecorations(variableDecorationType, editorDecorations);
    }
}
function wolframBusy(params) {
    if (params.busy === true) {
        kernelStatusBar.color = "red";
        wolframStatusBar.text = "$(repo-sync~spin) Wolfram Running";
        wolframStatusBar.show();
    }
    else {
        kernelStatusBar.color = "yellow";
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();
    }
}
function startWolframTerminal() {
    let cmd;
    let args;
    if (process.platform === "win32") {
        cmd = 'cmd.exe';
        args = ['/c', 'wolframscript.exe'];
    }
    else {
        cmd = 'rlwrap wolframscript';
        args = [];
    }
    let activeWolframTerminal;
    activeWolframTerminal = vscode.window.createTerminal("wolfram terminal", cmd, args);
    activeWolframTerminal.show(true);
}
function runInTerminal() {
    var _a;
    if (!vscode.window.activeTerminal) {
        startWolframTerminal();
    }
    let e = vscode.window.activeTextEditor;
    let d = e.document;
    let sel = e.selections;
    (_a = vscode.window.activeTerminal) === null || _a === void 0 ? void 0 : _a.sendText(d.getText(new vscode.Range(e.selection.start, e === null || e === void 0 ? void 0 : e.selection.end)));
}
function help() {
    let e = vscode.window.activeTextEditor;
    let d = e.document;
    let sel = e.selections;
    let txt = "";
    let dataString = "";
    for (var x = 0; x < sel.length; x++) {
        txt = txt + d.getText(new vscode.Range(sel[x].start, sel[x].end));
    }
    let url = "https://reference.wolfram.com/language/ref/" + txt + ".html";
    // opn(url);
    let helpPanel = vscode.window.createWebviewPanel("wolframHelp", "Wolfram Help", 2, {
        enableScripts: true
    });
    helpPanel.webview.html = `<!DOCTYPE html>
    <html lang="en">
    <head>
    
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' https://reference.wolfram.com 'unsafe-inline'">
    
    </head>
    <body>
        <iframe src="${url}" style="height:100vh; width:100%" sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-modals"></iframe>
    </body>
    </html>
    `;
}
let outputPanel;
function showOutput() {
    var _a;
    let outputColumn = (_a = vscode.window.activeTextEditor) === null || _a === void 0 ? void 0 : _a.viewColumn;
    //let out = "<table id='outputs'>";
    if (outputPanel) {
        if (outputPanel.visible) {
        }
        else {
            if (outputColumn) {
                outputPanel.reveal(outputColumn + 1, true);
            }
            else {
                outputPanel.reveal(1, true);
            }
        }
    }
    else {
        if (outputColumn) {
            outputPanel = vscode.window.createWebviewPanel('WolframOutput', "Wolfram Output", { viewColumn: outputColumn + 1, preserveFocus: true }, {
                localResourceRoots: [vscode.Uri.file(path.join(theContext.extensionPath, 'media'))],
                enableScripts: true
            });
            outputPanel.webview.html = getOutputContent(outputPanel.webview);
            outputPanel.webview.onDidReceiveMessage(message => {
                runExpression(message.text);
                return;
            }, undefined, theContext.subscriptions);
            outputPanel.onDidDispose(() => {
                outputPanel = undefined;
            }, null);
            updateOutputPanel();
        }
    }
}
function updateOutputPanel() {
    let out = "";
    let i = 0;
    for (let i = 0; i < printResults.length; i++) {
        let img2 = printResults[i].replace(/^\"/, '');
        let img3 = img2.replace(/\"$/, '');
        // out += "<tr><td>" + i.toString() + ": </td><td>" + img3 + "</td></tr>";
        out += "<div id='result'>" + img3 + "</div>";
    }
    //out += "</table>";
    // if(typeof(outputPanel) === "undefined") {
    //     loadOutputPanel(myContext, 2);
    // }
    outputPanel === null || outputPanel === void 0 ? void 0 : outputPanel.webview.postMessage({ text: out });
}
function getOutputContent(webview) {
    let timeNow = new Date().getTime();
    let result = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <style type="text/css">
            td {
                margin:10px;
            }

            body{
                overflow:scroll;
                height:100%;
            }

            img{
                max-width:100%;
                max-height:90vh;
                margin:auto;
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

            .inner {
                position:absolute;
            }

            .outer {
                overflow:none;
            }
            #scratch {
                position:fixed;
                width:85vw;
                margin-top:5px;
            }

            #scratch textarea {
                border-radius:5px;
            }

            #outputs {
                display:grid;
                height:100%;
            }

            #result {
                border-bottom: var(--vscode-editor-foreground) 2px solid;
                margin-top: 5px;
                width: 85vw;
                padding: 10px;
            }
        </style>
        <meta charset="UTF-8">

        <!--
        Use a content security policy to only allow loading printResults from https or from our extension directory,
        and only allow scripts that have a specific nonce.
        
        <meta http-equiv="Content-Security-Policy" content="default-src 'none';">
        -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource};"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Wolfram Output</title>
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
        <!--<div id="scratch">
            <textarea id="expression" onkeydown="run(this)" rows="3" placeholder="Shift+Enter to run"></textarea>
        </div> -->
        <div class="inner" id='outputs'>
            
        </div>
    </div>
    </body>
    </html>`;
    return result;
}
//# sourceMappingURL=extension.js.map