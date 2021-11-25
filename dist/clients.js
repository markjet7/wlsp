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
exports.restartKernel = exports.startLanguageServer = exports.treeDataProvider = exports.scriptController = exports.notebookcontroller = exports.notebookSerializer = exports.scriptserializer = exports.wolframKernelClient = exports.wolframClient = void 0;
const vscode = require("vscode");
const path = require("path");
const net = require("net");
const fp = require('find-free-port');
const cp = require("child_process");
const psTree = require('ps-tree');
const vscode_1 = require("vscode");
const vscode_languageclient_1 = require("vscode-languageclient");
const path_1 = require("path");
let wolframStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
let wolframVersionText = "$(extensions-sync-enabled~spin) Wolfram";
const fs = require('fs');
const notebook_1 = require("./notebook");
const notebookController_1 = require("./notebookController");
const scriptController_1 = require("./scriptController");
let PORT;
let kernelPORT;
// export let wolframClient: LanguageClient;
// export let wolframKernelClient: LanguageClient;
// let wolfram: cp.ChildProcess;
// let wolframKernel: cp.ChildProcess;
let clientPort;
let kernelPort;
let lspPath;
let kernelPath;
let context;
let outputChannel;
let wolfram;
let wolframKernel;
function startLanguageServer(context0, outputChannel0) {
    return __awaiter(this, void 0, void 0, function* () {
        onkernelReady();
        onclientReady();
        context = context0;
        outputChannel = outputChannel0;
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.command = 'wolfram.restart';
        wolframStatusBar.show();
        vscode.workspace.onDidChangeTextDocument(didChangeTextDocument);
        exports.scriptserializer = new notebook_1.WolframScriptSerializer();
        exports.notebookSerializer = new notebook_1.WolframNotebookSerializer();
        exports.notebookcontroller = new notebookController_1.WolframNotebookController();
        exports.scriptController = new scriptController_1.WolframScriptController();
        return new Promise((resolve) => {
            lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
            let rndport = randomPort();
            fp(rndport, rndport + 50).then((freep) => {
                clientPort = freep[0];
            }).then(() => {
                load(wolfram, lspPath, clientPort, outputChannel).then((result) => {
                    wolfram = result;
                    connect(context, outputChannel, clientPort)
                        .then(([client, disposable]) => {
                        exports.wolframClient = client;
                        context.subscriptions.push(disposable);
                    });
                });
            });
            kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
            return fp(rndport + 51, rndport + 100).then((freep) => {
                kernelPort = freep[0];
            }).then(() => {
                load(wolframKernel, kernelPath, kernelPort, outputChannel).then((result) => {
                    wolframKernel = result;
                    connect(context, outputChannel, kernelPort)
                        .then(([client, disposable]) => {
                        exports.wolframKernelClient = client;
                        context.subscriptions.push(disposable);
                        resolve();
                    });
                });
            });
        });
    });
}
exports.startLanguageServer = startLanguageServer;
function startModule(context, outputChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            let clientPort;
            let lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
            let rndport = randomPort();
            fp(rndport, rndport + 50).then((freep) => {
                clientPort = freep[0];
            }).then(() => {
                connectModule(lspPath, "wolframscript", clientPort, outputChannel);
            });
            let kernelPort;
            let kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
            return fp(rndport + 51, rndport + 100).then((freep) => {
                kernelPort = freep[0];
            }).then(() => {
                connectModule(kernelPath, "wolframscript", kernelPort, outputChannel);
            });
        });
    });
}
function restartKernel() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Restarting");
        vscode.window.showInformationMessage("Wolfram is restarting.");
        stopWolfram(exports.wolframKernelClient, wolframKernel);
        load(wolframKernel, kernelPath, kernelPort, outputChannel).then((result) => {
            wolframKernel = result;
            connect(context, outputChannel, kernelPort)
                .then(([client, disposable]) => {
                exports.wolframKernelClient = client;
                context.subscriptions.push(disposable);
                path_1.resolve();
            });
        });
    });
}
exports.restartKernel = restartKernel;
function stop() {
    stopWolfram(exports.wolframClient, wolfram);
    stopWolfram(exports.wolframKernelClient, wolframKernel);
}
function onclientReady() {
    if (exports.wolframClient !== undefined) {
        exports.wolframClient.onReady().then(() => {
            exports.wolframClient.sendRequest("wolframVersion").then((result) => {
                wolframVersionText = result["output"];
                wolframStatusBar.text = result["output"];
            });
        });
    }
    else {
        setTimeout(onclientReady, 2000);
    }
}
function onkernelReady() {
    if (exports.wolframKernelClient !== undefined) {
        exports.wolframKernelClient.onReady().then(() => {
            console.log("Listening to kernel");
            exports.wolframKernelClient.onNotification("onRunInWolfram", onRunInWolfram);
            exports.wolframKernelClient.onNotification("wolframBusy", wolframBusy);
            exports.wolframKernelClient.onNotification("updateDecorations", updateDecorations);
            exports.wolframKernelClient.onNotification("updateVarTable", updateVarTable);
            exports.wolframKernelClient.onNotification("moveCursor", moveCursor);
            vscode.workspace.onDidOpenTextDocument(didOpenTextDocument);
            vscode.workspace.onDidSaveTextDocument(didSaveTextDocument);
            vscode.window.onDidChangeWindowState(didChangeWindowState);
            vscode.commands.registerCommand('wolfram.runInWolfram', runInWolfram);
            vscode.commands.registerCommand('wolfram.printInWolfram', printInWolfram);
            vscode.commands.registerCommand('wolfram.wolframTerminal', startWolframTerminal);
            vscode.commands.registerCommand('wolfram.runInTerminal', runInTerminal);
            vscode.commands.registerCommand('wolfram.help', help);
            vscode.commands.registerCommand('wolfram.stringHelp', stringHelp);
            vscode.commands.registerCommand('wolfram.restart', restartKernel);
            vscode.commands.registerCommand('wolfram.abort', abort);
            vscode.commands.registerCommand('wolfram.textToSection', textToSection);
            vscode.commands.registerCommand('wolfram.textFromSection', textFromSection);
            vscode.commands.registerCommand('wolfram.createFile', createFile);
            vscode.commands.registerCommand('wolfram.createNotebook', createNotebook);
            vscode.commands.registerCommand('wolfram.createNotebookScript', createNotebookScript);
            context.subscriptions.push(vscode.workspace.registerNotebookSerializer('wolfram-notebook', exports.notebookSerializer));
            context.subscriptions.push(vscode.workspace.registerNotebookSerializer('wolfram-script', exports.scriptserializer));
            context.subscriptions.push(exports.notebookcontroller);
            context.subscriptions.push(exports.scriptController);
        });
    }
    else {
        setTimeout(onkernelReady, 2000);
    }
}
function runToLine() {
    let e = vscode.window.activeTextEditor;
    let sel = e === null || e === void 0 ? void 0 : e.selection.active;
    let outputPosition = new vscode.Position(sel.line + 1, 0);
    let r = new vscode.Selection(0, 0, sel.line, sel.character);
    e.revealRange(r, vscode.TextEditorRevealType.Default);
    try {
        exports.wolframKernelClient.sendRequest("runInWolfram", { range: r, textDocument: e.document, print: false }).then((result) => {
            // cursor has not moved yet
            if (e.selection.active.line === outputPosition.line - 1 && e.selection.active.character === outputPosition.character) {
                outputPosition = new vscode.Position(result["position"]["line"], result["position"]["character"]);
                e.selection = new vscode.Selection(outputPosition, outputPosition);
                e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            }
            updateResults(e, result, false);
        });
    }
    catch (_a) {
        console.log("Kernel is not ready. Restarting...");
    }
}
let variableTable = {};
function updateVarTable(vars) {
    for (let index = 0; index < vars["values"].length; index++) {
        variableTable[vars["values"][index][0]] = vars["values"][index][1].slice(0, 200) + "...";
    }
    updateOutputPanel();
}
function moveCursor(params) {
    let e = vscode.window.activeTextEditor;
    let outputPosition = new vscode.Position(params["position"]["line"], params["position"]["character"]);
    if (e) {
        e.selection = new vscode.Selection(outputPosition, outputPosition);
        e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
        let decorationLine = e.document.lineAt(outputPosition.line - 1);
        let start = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character);
        let end = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character);
        let range = new vscode.Range(start, end);
        let d = {
            "range": range,
            "renderOptions": {
                "after": {
                    "contentText": "...",
                    "color": "foreground",
                    "margin": "20px"
                }
            }
        };
        updateDecorations([d]);
    }
}
function onRunInWolfram(result) {
    let editors = vscode.window.visibleTextEditors;
    let e = editors.filter((e) => { return e.document.uri.path === result["document"]["path"]; })[0];
    if (e.document.uri.scheme == 'vscode-notebook-cell') {
    }
    else {
        updateResults(e, result, result["print"]);
    }
}
let maxPrintResults = 20;
let printResults = [];
function updateResults(e, result, print) {
    if (printResults.length > maxPrintResults) {
        printResults.shift();
    }
    if (typeof (e) !== "undefined") {
        e.edit(editBuilder => {
            printResults.push(result["output"].toString());
            // showOutput();
            if (print) {
                let sel = e.selection;
                let outputPosition = new vscode.Position(sel.active.line + 1, 0);
                editBuilder.insert(outputPosition, "\t" + result["result"] + "\n");
            }
        });
    }
    ;
    updateOutputPanel();
}
let outputPanel;
function showOutput(context) {
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
                // localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'wolfram'))],
                enableScripts: true,
                retainContextWhenHidden: true
            });
            outputPanel.webview.html = getOutputContent(outputPanel.webview, context.extensionUri);
            outputPanel.webview.onDidReceiveMessage(message => {
                runExpression(message.text, 0, 100);
                return;
            }, undefined, context.subscriptions);
            outputPanel.onDidDispose(() => {
                outputPanel = undefined;
            }, null);
            updateOutputPanel();
        }
    }
}
function runExpression(expression, line, end) {
    let e = (vscode.window.activeTextEditor == null) ? vscode.window.visibleTextEditors[0] : vscode.window.activeTextEditor;
    exports.wolframKernelClient.sendRequest("runExpression", { print: false, expression: expression, textDocument: e === null || e === void 0 ? void 0 : e.document, line: line, end: end }).then((result) => { });
}
function wolframBusy(params) {
    if (params.busy === true) {
        //kernelStatusBar.color = "red";
        wolframStatusBar.text = "$(extensions-sync-enabled~spin) Wolfram Running";
        wolframStatusBar.show();
    }
    else {
        //kernelStatusBar.color = "yellow";
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();
    }
}
let workspaceDecorations = {};
function updateDecorations(decorations) {
    let editor = vscode.window.activeTextEditor;
    if ((editor === null || editor === void 0 ? void 0 : editor.document.uri.scheme) === 'file' || (editor === null || editor === void 0 ? void 0 : editor.document.uri.scheme) === 'untitled') {
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
let variableDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'none',
    light: {
        color: new vscode.ThemeColor("foreground")
    },
    dark: {
        color: new vscode.ThemeColor("foreground")
    }
});
function clearDecorations() {
    let e = vscode.window.activeTextEditor;
    workspaceDecorations = {};
    e === null || e === void 0 ? void 0 : e.setDecorations(variableDecorationType, []);
}
function updateOutputPanel() {
    let out = "";
    for (let i = 0; i < printResults.length; i++) {
        // out += "<tr><td>" + i.toString() + ": </td><td>" + img3 + "</td></tr>";
        let data = "";
        try {
            data += fs.readFileSync(printResults[i], 'utf8');
        }
        catch (e) {
            data += "Error reading result";
        }
        out += "<div id='result'>" +
            // printResults[i].replace(/(?:\r\n|\r|\n)/g, '<br><br>') + // .replace(/^\"/, '').replace(/\"$/, '')
            data +
            "</div>";
    }
    let vars = `<vscode-data-grid-row row-type="header">
        <vscode-data-grid-cell cell-type="columnheader" grid-column="1">Var</vscode-data-grid-cell>
        <vscode-data-grid-cell cell-type="columnheader" grid-column="2">Value</vscode-data-grid-cell>
    </vscode-data-grid-row>`;
    let i = 0;
    Object.keys(variableTable).forEach(k => {
        // if (i % 2 === 0) {
        //     vars += "<tr><td style='background:var(--vscode-editor-foreground) !important; color:var(--vscode-editor-background) !important;'>" + k + "</td><td style='background:var(--vscode-editor-foreground) !important; color:var(--vscode-editor-background) !important;'>" + variableTable[k] + "</td></tr>\n"
        // } else {
        //     vars += "<tr><td>" + k + "</td><td>" + variableTable[k] + "</td></tr>\n"
        // }
        vars += `<vscode-data-grid-row>
		    <vscode-data-grid-cell grid-column="1">${k}</vscode-data-grid-cell>
		    <vscode-data-grid-cell grid-column="2">${variableTable[k]}</vscode-data-grid-cell>
        </vscode-data-grid-row>
        `;
        i++;
    });
    outputPanel === null || outputPanel === void 0 ? void 0 : outputPanel.webview.postMessage({ text: out, vars: vars });
}
function connectModule(modulePath, runtimePath, port, outputChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Connecting to module: " + modulePath);
        console.log("Connecting to runtime: " + runtimePath);
        let serverOptions = {
            module: modulePath,
            runtime: runtimePath,
            transport: {
                kind: vscode_languageclient_1.TransportKind.socket,
                port: port
            },
            options: {
                env: {
                    PATH: process.env.PATH
                }
            },
            args: ['-file', runtimePath, port.toString(), runtimePath]
        };
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            diagnosticCollectionName: 'wolfram-lsp',
            outputChannel: outputChannel
        };
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            let disposible;
            let client = new vscode_languageclient_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
            disposible = client.start();
            resolve([client, disposible]);
        }));
    });
}
function connect(context, outputChannel, port) {
    return __awaiter(this, void 0, void 0, function* () {
        let serverOptions = function () {
            return new Promise((resolve, reject) => {
                let socket = new net.Socket();
                socket.setMaxListeners(100);
                socket.on("data", (data) => {
                    // console.log("WLSP Kernel Data: " + data.toString().substr(0, 200))
                });
                socket.on('error', function (err) {
                    console.log("Socket Error: " + err.message);
                    // socket.destroy();
                    // // client.end();
                    // setTimeout(() => {
                    //     socket.connect(port, "127.0.0.1", () => { socket.setKeepAlive(true) });
                    // }, 1000);
                });
                socket.on('timeout', () => {
                    console.log("Kernel timed out");
                    socket.destroy();
                });
                socket.on('ready', () => {
                    // console.log("Socket ready")     
                });
                socket.on('drain', () => {
                    console.log("Socket is draining");
                });
                socket.on('connect', () => {
                    // console.log("Socket connected")
                });
                socket.connect(port, "127.0.0.1", () => {
                    socket.setKeepAlive(true, 2000);
                    setTimeout(() => {
                        resolve({
                            reader: socket,
                            writer: socket
                        });
                    }, 4000);
                });
            });
        };
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            diagnosticCollectionName: 'wolfram-lsp',
            outputChannel: outputChannel
        };
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            let disposible;
            let client = new vscode_languageclient_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
            let start = new Date().getTime();
            yield delay(5000);
            let end = new Date().getTime();
            disposible = client.start();
            resolve([client, disposible]);
        }));
        //console.log("Starting kernel disposible");
        // setTimeout(() => {setInterval(check_pulse, 1000, wolframClient, wolframKernelClient)}, 3000)
    });
}
function delay(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => { setTimeout(resolve, ms); });
    });
}
function randomPort() {
    return Math.round(Math.random() * (100) + 8888);
}
function connectKernelClient(outputChannel, context) {
}
function load(wolfram, path, port, outputChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            var _a, _b;
            try {
                if (process.platform === "win32") {
                    wolfram = cp.spawn('cmd.exe', ['/c', 'wolframscript.exe', '-file', path, port.toString(), path], { detached: false });
                }
                else {
                    wolfram = cp.spawn('wolframscript', ['-file', path, port.toString(), path], { detached: true });
                }
                if (wolfram.pid != undefined) {
                    console.log("Launching wolframscript: " + wolfram.pid.toString());
                }
                else {
                    console.log("Launching wolframscript: pid unknown");
                }
                wolfram.on('SIGPIPE', (data) => {
                    console.log("SIGPIPE");
                });
                (_a = wolfram.stdout) === null || _a === void 0 ? void 0 : _a.on('error', (data) => {
                    console.log("STDOUT Error" + data.toString());
                });
                (_b = wolfram.stdout) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
                    outputChannel.appendLine("WLSP: " + data.toString());
                    console.log("WLSP: " + data.toString());
                    if (data.toString().includes("SocketObject")) {
                        setTimeout(() => { resolve(wolfram); }, 2000);
                    }
                });
            }
            catch (error) {
                console.log(error);
                vscode.window.showErrorMessage("Wolframscript failed to load.");
                resolve(wolfram);
            }
        });
    });
}
function stopWolfram(client, client_process) {
    // client?.stop();
    let isWin = /^win/.test(process.platform);
    if (isWin) {
        let cp = require('child_process');
        cp.exec('taskkill /PID ' + client_process.pid + ' /T /F', function (error, stdout, stderr) {
        });
    }
    else {
        kill(client_process.pid);
    }
}
let kill = function (pid) {
    let signal = 'SIGKILL';
    let callback = function () { };
    var killTree = true;
    if (killTree) {
        psTree(pid, function (err, children) {
            [pid].concat(children.map(function (p) {
                return p.PID;
            })).forEach(function (pid) {
                try {
                    process.kill(pid, signal);
                }
                catch (ex) {
                    console.log("Failed to kill: " + pid);
                }
            });
            callback();
        });
    }
    else {
        try {
            process.kill(pid, signal);
        }
        catch (ex) {
            console.log("Failed to kill wolfram process");
        }
        callback();
    }
};
function getOutputContent(webview, extensionUri) {
    let timeNow = new Date().getTime();
    const toolkitUri = getUri(webview, extensionUri, [
        "node_modules",
        "@vscode",
        "webview-ui-toolkit",
        "dist",
        "toolkit.js",
    ]);
    const codiconsUri = getUri(webview, extensionUri, [
        "node_modules",
        "@vscode",
        "codicons",
        "dist",
        "codicon.css",
    ]);
    const mainUri = getUri(webview, extensionUri, ["media", "main.js"]);
    const styleUri = getUri(webview, extensionUri, ["media", "style.css"]);
    let result = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <script type="module" src="${toolkitUri}"></script>
        <!-- <script type="module" src="${mainUri}"></script>
        <link rel="stylesheet" href="${styleUri}"> 
        <link rel="stylesheet" href="${codiconsUri}"> -->
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
                height:38vh;
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

            #outputs {
                display: block;
                height: 50vh;
                position: fixed;
                top: 40vh;
                overflow-y: scroll;
            }

            #result {
                border-bottom: var(--vscode-editor-foreground) 2px solid;
                margin-top: 5px;
                padding: 5px;
                display: block;
                margin:0px;
                width:93vw;
                /* height:48vh; */
                overflow:scroll;
            }

            #result img{
                max-width: 100%;
                max-height: 90%;
                /* margin: 0; */
                /* min-height: 200px; */
                width: auto;
                margin-left: auto;
                margin-right: auto;
                display: block;
                height: auto;
            }


        </style>
        <meta charset="UTF-8">

        <!-- <meta http-equiv="Content-Security-Policy" content="default-src *; img-src ${webview.cspSource} https: data:; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';"/> -->
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
                    input.value = ""
                }
            }
        }

        window.addEventListener('message', event => {
            const message = event.data;

            const outputDiv = document.getElementById('outputs');
            outputDiv.innerHTML = message.text;

            outputDiv.scrollTop = outputDiv.scrollHeight;

            const varT = document.getElementById('varTable');
            varT.innerHTML = message.vars;
        })
        </script>
    </head>
    <body onload="scrollToBottom()">
        <div class="outer">
            <div id="vars">
            <vscode-data-grid generate-header="none" aria-label="Basic" id="varTable">
                <vscode-data-grid-row row-type="header">
                    <vscode-data-grid-cell cell-type="columnheader" grid-column="1">Var</vscode-data-grid-cell>
                    <vscode-data-grid-cell cell-type="columnheader" grid-column="2">Value</vscode-data-grid-cell>
                </vscode-data-grid-row>
            </vscode-data-grid>
            </div>
            <div class="inner" id='outputs'>
            </div>
            <div id="scratch">
                <vscode-text-area id="expression" onkeydown="run(this)" rows="3" placeholder="Shift+Enter to run"></vscode-text-area>
            </div> 
        </div>
    </body>
    </html>`;
    return result;
}
function getUri(webview, extensionUri, pathList) {
    return webview.asWebviewUri(vscode_1.Uri.joinPath(extensionUri, ...pathList));
}
function runInWolfram(print = false) {
    if (exports.wolframKernelClient === undefined) {
        vscode.window.showWarningMessage("Wolfram kernel is not running. Please wait or start the kernel first.");
        return;
    }
    let e = vscode.window.activeTextEditor;
    let sel = e.selection;
    let outputPosition = new vscode.Position(sel.active.line + 1, 0);
    if ((e === null || e === void 0 ? void 0 : e.document.lineCount) == outputPosition.line) {
        e === null || e === void 0 ? void 0 : e.edit(editBuilder => {
            editBuilder.insert(outputPosition, "\n");
        });
    }
    if ((e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'vscode-notebook-cell') {
        e.selection = new vscode.Selection(0, 0, 1, 1);
        try {
            exports.wolframKernelClient.sendNotification("runInWolfram", { range: sel, textDocument: e.document, print: false });
        }
        catch (err) {
            console.log(err);
        }
    }
    else if ((e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'file' || (e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'untitled') {
        e.selection = new vscode.Selection(outputPosition, outputPosition);
        e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
        // wolframKernelClient.sendNotification("moveCursor", {range:sel, textDocument:e.document});
        exports.wolframKernelClient.onReady().then(ready => {
            exports.wolframKernelClient.sendNotification("runInWolfram", { range: sel, textDocument: e === null || e === void 0 ? void 0 : e.document, print: print });
        });
    }
}
function printInWolfram(print = true) {
    runInWolfram(print);
}
function didChangeTextDocument(event) {
    // didOpenTextDocument(event.document);
    // remove old decorations
    let editor = vscode.window.activeTextEditor;
    let decorations = [];
    if (editor == null) {
        return;
    }
    else {
        let position = editor === null || editor === void 0 ? void 0 : editor.selection.active;
        let uri = editor.document.uri.toString();
        if ((workspaceDecorations == undefined) || (workspaceDecorations == null)) {
            workspaceDecorations = {};
        }
        if (workspaceDecorations[uri] !== undefined) {
            Object.keys(workspaceDecorations[uri]).forEach((line) => {
                if (parseInt(line, 10) < position.line) {
                    decorations.push(workspaceDecorations[uri][line]);
                }
                else {
                    delete workspaceDecorations[uri][line];
                }
            });
        }
        editor.setDecorations(variableDecorationType, decorations);
    }
    return;
}
function didOpenTextDocument(document) {
    if (document.languageId !== 'wolfram' || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
        return;
    }
    if (document.languageId === "wolfram") {
        if (exports.wolframClient !== undefined) {
            exports.wolframClient.onReady().then(ready => {
                exports.wolframClient.sendRequest("DocumentSymbolRequest");
            });
        }
    }
    return;
}
function didSaveTextDocument(event) {
    exports.treeDataProvider.refresh();
    didOpenTextDocument(event);
    return;
}
function createFile() {
    vscode.workspace.openTextDocument(vscode.Uri.parse("untitled:.wl")).then((document) => {
        vscode.window.showTextDocument(document);
    });
}
function createNotebook() {
    vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.nb")).then((document) => {
        // vscode.window.showNotebookDocument(document);
    });
}
function createNotebookScript() {
    vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.wl")).then((document) => {
        // vscode.window.showNotebookDocument(document);
    });
}
function didChangeWindowState(state) {
    if (exports.wolframClient !== null || exports.wolframClient !== undefined) {
        if (state.focused === true) {
            exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onReady().then(ready => {
                exports.wolframClient.sendNotification("windowFocused", true);
            });
        }
        else {
            exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onReady().then(ready => {
                exports.wolframClient.sendNotification("windowFocused", false);
            });
        }
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
        enableScripts: true,
        retainContextWhenHidden: true
    });
    helpPanel.webview.html = `<!DOCTYPE html>
    <html lang="en">
    <head>
    
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' https://reference.wolfram.com 'unsafe-inline'">
    
    </head>
    <body>
        <span>
            <input
                action="action"
                onclick="window.history.go(-1); return false;"
                type="button"
                value="Back"
            />
            <input
                action="action"
                onclick="window.history.forward(); return false;"
                type="button"
                value="Forward"
            />
        </span>
        <iframe src="${url}" style="height:100vh; width:100%" sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-modals"></iframe>
    </body>
    </html>
    `;
}
function stringHelp(string) {
    let url = "https://reference.wolfram.com/language/ref/" + string + ".html";
    let helpPanel = vscode.window.createWebviewPanel("wolframHelp", "Wolfram Help", 2, {
        enableScripts: true,
        retainContextWhenHidden: true
    });
    helpPanel.webview.html = `<!DOCTYPE html>
    <html lang="en">
    <head>
    
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' https://reference.wolfram.com 'unsafe-inline'">
    
    </head>
    <body>
        <span>
            <input
                action="action"
                onclick="window.history.go(-1); return false;"
                type="button"
                value="Back"
            />
            <input
                action="action"
                onclick="window.history.forward(); return false;"
                type="button"
                value="Forward"
            />
        </span>
        <iframe src="${url}" style="height:100vh; width:100%" sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-modals"></iframe>
    </body>
    </html>
    `;
}
function abort() {
    exports.wolframClient.sendNotification("abort");
}
function textToSection() {
    let e = vscode.window.activeTextEditor;
    let lines;
    let newlines = "";
    if (e) {
        let sel = e.selection;
        lines = e === null || e === void 0 ? void 0 : e.document.getText(new vscode.Range(sel.start, sel.end)).split('\n');
        lines.forEach(l => {
            newlines += "(*" + l + "*)\n";
        });
        e.edit(editbuilder => {
            editbuilder.replace(sel, newlines.trimRight());
        });
    }
}
function textFromSection() {
    let e = vscode.window.activeTextEditor;
    let lines;
    let newlines = "";
    if (e) {
        let sel = e.selection;
        lines = e === null || e === void 0 ? void 0 : e.document.getText(new vscode.Range(sel.start, sel.end)).split('\n');
        lines.forEach(l => {
            newlines += l.replace(/^\(\*/, "").replace(/\*\)$/, "") + "\n";
        });
        e.edit(editbuilder => {
            editbuilder.replace(sel, newlines.trimRight());
        });
    }
}
// let kill = function (pid:any) {
//     let signal   = 'SIGKILL';
//     let callback = function () {};
//     var killTree = true;
//     if(killTree) {
//         psTree(pid, function (err:any, children:any) {
//             [pid].concat(
//                 children.map(function (p:any) {
//                     return p.PID;
//                 })
//             ).forEach(function (pid) {
//                 try { process.kill(pid, signal);}
//                 catch (ex) {
//                     console.log("Failed to kill: " + pid)
//                  }
//             });
//             callback();
//         });
//     } else {
//         try { process.kill(pid, signal); }
//         catch (ex) { 
//             console.log("Failed to kill wolfram process")}
//         callback();
//     }
// };
//# sourceMappingURL=clients.js.map