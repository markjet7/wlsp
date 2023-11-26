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
exports.onkernelReady = exports.stop = exports.restart = exports.restartKernel = exports.startLanguageServer = exports.wlspdebugger = exports.treeDataProvider = exports.scriptController = exports.interactiveNotebookSerializer = exports.interactiveController = exports.notebookcontroller = exports.notebookSerializer = exports.scriptserializer = exports.wolframKernelClient = exports.wolframClient = void 0;
const vscode = require("vscode");
const vscode_1 = require("vscode");
const path = require("path");
const net = require("net");
const fp = require('find-free-port');
const cp = require("child_process");
const psTree = require('ps-tree');
const bson = require('bson');
const node_1 = require("vscode-LanguageClient/node");
const path_1 = require("path");
const debug_1 = require("./debug");
let wolframStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
let wolframVersionText = "$(extensions-sync-enabled~spin) Wolfram";
let progressStatus;
const fs = require('fs');
const notebook_1 = require("./notebook");
const interactiveNotebook_1 = require("./interactiveNotebook");
const interactiveController_1 = require("./interactiveController");
const scriptController_1 = require("./scriptController");
const treeDataProvider_1 = require("./treeDataProvider");
const dataPanel_1 = require("./dataPanel");
const plotsView_1 = require("./plotsView");
// let wolfram: cp.ChildProcess;
// let wolframKernel: cp.ChildProcess;
let clientPort = 7710;
let kernelPort = 7910;
let debugPort = 7810;
let lspPath;
let kernelPath;
let context;
let cursorFile = "";
let outputChannel;
let kernelOutputChannel;
let clients = new Map();
let processes = [];
var wolfram;
var wolframKernel;
let withProgressCancellation;
let dataProvider;
let plotsProvider;
exports.wolframClient = undefined;
exports.wolframKernelClient = undefined;
function startLanguageServer(context0, outputChannel0) {
    return __awaiter(this, void 0, void 0, function* () {
        context = context0;
        lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
        kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
        cursorFile = path.join(context.extensionPath, "wolfram", "cursorLocations.js");
        outputChannel = outputChannel0;
        kernelOutputChannel = vscode.window.createOutputChannel("Wolfram Kernel");
        wolframStatusBar.text = "Wolfram ?";
        wolframStatusBar.command = 'wolfram.restart';
        wolframStatusBar.show();
        vscode.workspace.onDidChangeTextDocument(didChangeTextDocument);
        exports.scriptserializer = new notebook_1.WolframScriptSerializer();
        exports.notebookSerializer = new notebook_1.WolframNotebookSerializer();
        // notebookcontroller = new WolframNotebookController()
        exports.scriptController = new scriptController_1.WolframScriptController(context);
        exports.interactiveNotebookSerializer = new interactiveNotebook_1.InteractiveNotebookSerializer();
        exports.interactiveController = new interactiveController_1.InteractiveController();
        const provider = new WLSPConfigurationProvider();
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('wlspdebugger', provider));
        // context.subscriptions.push(
        //     vscode.workspace.registerNotebookSerializer('wolfram-notebook', notebookSerializer)
        // );
        context.subscriptions.push(vscode.workspace.registerNotebookSerializer('wolfram-script', exports.scriptserializer));
        context.subscriptions.push(vscode.workspace.registerNotebookSerializer('wolfram-interactive', exports.interactiveNotebookSerializer));
        dataProvider = new dataPanel_1.DataViewProvider(context.extensionUri);
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(dataPanel_1.DataViewProvider.viewType, dataProvider));
        plotsProvider = new plotsView_1.PlotsViewProvider(context.extensionUri, context);
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(plotsView_1.PlotsViewProvider.viewType, plotsProvider));
        // plotsProvider._view?.webview.onDidReceiveMessage((data:any) => {
        //     if (data.text === "restart") {
        //         restartKernel();
        //     }
        // }, undefined, context.subscriptions);
        context.subscriptions.push(exports.notebookcontroller);
        context.subscriptions.push(exports.scriptController);
        context.subscriptions.push(exports.interactiveController);
        fp(debugPort).then(([freePort]) => {
            exports.wlspdebugger = new debug_1.WolframDebugAdapterDescriptorFactory(freePort, context, outputChannel);
        });
        context.subscriptions.push(vscode_1.debug.registerDebugConfigurationProvider("wlspdebugger", new debug_1.WolframDebugConfigProvider()));
        context.subscriptions.push(vscode_1.debug.registerDebugAdapterDescriptorFactory('wlspdebugger', exports.wlspdebugger));
        // context.subscriptions.push(
        //     wlspdebugger
        // )
        startWLSP(0);
        startWLSPKernelSocket(0);
        vscode.commands.registerCommand('wolfram.runInWolfram', runInWolfram);
        vscode.commands.registerCommand('wolfram.runToLine', runToLine);
        vscode.commands.registerCommand('wolfram.printInWolfram', printInWolfram);
        vscode.commands.registerCommand('wolfram.runTextCell', runTextCell);
        vscode.commands.registerCommand('wolfram.wolframTerminal', startWolframTerminal);
        vscode.commands.registerCommand('wolfram.runInTerminal', runInTerminal);
        vscode.commands.registerCommand('wolfram.help', help);
        vscode.commands.registerCommand('wolfram.stringHelp', stringHelp);
        vscode.commands.registerCommand('wolfram.wolframHelp', wolframHelp);
        vscode.commands.registerCommand('wolfram.restart', restart);
        vscode.commands.registerCommand('wolfram.abort', abort);
        vscode.commands.registerCommand('wolfram.textToSection', textToSection);
        vscode.commands.registerCommand('wolfram.textFromSection', textFromSection);
        vscode.commands.registerCommand('wolfram.createFile', createFile);
        vscode.commands.registerCommand('wolfram.createNotebook', createNotebook);
        vscode.commands.registerCommand('wolfram.createNotebookScript', createNotebookScript);
        vscode.commands.registerCommand('wolfram.createNotebookInteractive', createNotebookInteractive);
        vscode.commands.registerCommand('wolfram.runExpression', runExpression);
        vscode.commands.registerCommand('wolfram.clearResults', clearResults);
        vscode.commands.registerCommand('wolfram.showTrace', showTrace);
        vscode.commands.registerCommand('wolfram.debug', startWLSPDebugger);
        vscode.commands.registerCommand('wolfram.updateTreeData', updateTreeDataProvider);
        vscode.commands.registerCommand('wolfram.clearPlots', clearPlots);
        vscode.workspace.onDidOpenTextDocument(didOpenTextDocument);
        vscode.workspace.onDidSaveTextDocument(didSaveTextDocument);
        vscode.workspace.onDidChangeConfiguration(updateConfiguration);
        vscode.workspace.onDidChangeTextDocument(didChangeTextDocument);
        exports.treeDataProvider = new treeDataProvider_1.workspaceSymbolProvider();
        vscode.window.onDidChangeTextEditorSelection(didChangeSelection);
        vscode.window.onDidChangeWindowState(didChangeWindowState);
        vscode.window.registerTreeDataProvider("wolframSymbols", exports.treeDataProvider);
        vscode.workspace.textDocuments.forEach(didOpenTextDocument);
        vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            var _a, _b, _c;
            for (const folder of event.removed) {
                const client = clients.get(folder.uri.toString());
                if (client) {
                    clients.delete(folder.uri.toString());
                    (_a = client[0]) === null || _a === void 0 ? void 0 : _a.stop();
                    (_b = client[1]) === null || _b === void 0 ? void 0 : _b.stop();
                }
            }
            for (const folder of event.added) {
                const client = clients.get(folder.uri.toString());
                if (client) {
                    (_c = client[1]) === null || _c === void 0 ? void 0 : _c.sendNotification("didChangeWorkspaceFolders", folder);
                }
            }
        });
        // setTimeout(updateRunningLines, 500);
        // restart()
    });
}
exports.startLanguageServer = startLanguageServer;
function stopKernel() {
    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("Shutdown");
}
function startWLSPDebugger() {
    // wolfDebugger.startDebugger()
}
function updateConfiguration() {
    if (vscode.workspace.getConfiguration().get("wlsp.liveDocument")) {
    }
    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("updateConfiguration", { "abortOnError": vscode.workspace.getConfiguration().get("wlsp.abortOnError") });
}
function restartKernel() {
    return __awaiter(this, void 0, void 0, function* () {
        if (connectingKernel) {
            return new Promise((resolve) => {
                setTimeout(() => resolve(), 2000);
            });
        }
        ;
        evaluationQueue = [];
        wolframBusyQ = false;
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            stopWolfram(undefined, wolframKernel).then(() => {
                startWLSPKernelSocket(0);
                resolve();
            });
        }));
    });
}
exports.restartKernel = restartKernel;
function restart() {
    return __awaiter(this, void 0, void 0, function* () {
        let e = vscode.window.activeTextEditor;
        wolframBusyQ = false;
        evaluationQueue = [];
        withProgressCancellation === null || withProgressCancellation === void 0 ? void 0 : withProgressCancellation.cancel();
        wolframStatusBar.text = "Wolfram ?";
        wolframStatusBar.show();
        clients.forEach((client, key) => {
            var _a, _b;
            if (client) {
                (_a = client[0]) === null || _a === void 0 ? void 0 : _a.stop();
                (_b = client[1]) === null || _b === void 0 ? void 0 : _b.stop();
            }
            clients.delete(key);
        });
        editorDecorations.clear();
        e === null || e === void 0 ? void 0 : e.setDecorations(variableDecorationType, []);
        stopWolfram(undefined, wolfram);
        stopWolfram(undefined, wolframKernel);
        // sleep for 1 second to allow the kernel to shut down
        yield new Promise(resolve => setTimeout(resolve, 5000));
        connectingKernel = false;
        startWLSP(0);
        startWLSPKernelSocket(0);
        return new Promise((resolve) => {
            vscode.workspace.textDocuments.forEach(didOpenTextDocument);
            resolve();
        });
    });
}
exports.restart = restart;
function stop() {
    var _a, _b;
    const promises = [];
    for (const client of clients.values()) {
        promises.push((_a = client[0]) === null || _a === void 0 ? void 0 : _a.stop());
        promises.push((_b = client[1]) === null || _b === void 0 ? void 0 : _b.stop());
    }
    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("Shutdown");
    for (let p of processes) {
        stopWolfram(undefined, p);
    }
    exports.wlspdebugger.dispose();
    return Promise.all(promises).then(() => undefined);
}
exports.stop = stop;
function completionRequest(params) {
    console.log("completionRequest", params);
    return {};
}
function onclientReady() {
    return __awaiter(this, void 0, void 0, function* () {
        function checkClient(cb) {
            if (exports.wolframClient !== undefined && exports.wolframClient.initializeResult !== undefined) {
                exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification("updatePositions", updatePositions);
                exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification("updateLintDecorations", updateLintDecorations);
                // wolframClient?.onRequest("textDocument/completion", completionRequest);
                // wolframClient.handleFailedRequest
                exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendRequest("wolframVersion").then((result) => {
                    wolframVersionText = result["output"];
                    wolframStatusBar.text = result["output"];
                });
                // wolframClient?.sendRequest("DocumentSymbolRequest");
                exports.treeDataProvider.getBuiltins();
            }
            else {
                setTimeout(() => {
                    checkClient(cb);
                }, 500);
            }
        }
        return new Promise((resolve) => {
            checkClient(resolve);
        });
    });
}
let temporaryDir = "";
function onkernelReady() {
    return __awaiter(this, void 0, void 0, function* () {
        function checkKernel(cb) {
            var _a;
            if (exports.wolframKernelClient !== undefined && exports.wolframKernelClient.state === 2) {
                // wolframKernelClient?.onNotification("onRunInWolfram", onRunInWolfram);
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification("wolframBusy", wolframBusy);
                // wolframKernelClient?.onNotification("updateDecorations", updateDecorations);
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification("updateVarTable", updateVarTable);
                // wolframKernelClient?.onNotification("moveCursor", moveCursor);
                // wolframKernelClient?.onNotification("updateTreeItems", updateTreeItems);
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification("pulse", pulse);
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification("errorMessages", errorMessages);
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification("updateInputs", updateInputs);
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification("onResult", onResult);
                if (vscode.window.activeTextEditor) {
                    let workspacefolder = vscode.workspace.getWorkspaceFolder((_a = vscode.window.activeTextEditor) === null || _a === void 0 ? void 0 : _a.document.uri);
                    if (workspacefolder) {
                        vscode.workspace.findFiles("**/*.wl*", workspacefolder.uri).then(result => {
                            exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("didChangeWorkspaceFolders", result);
                        });
                    }
                }
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendRequest("storageUri").then((result) => {
                    temporaryDir = result;
                });
                exports.treeDataProvider.getSymbols(undefined);
                pulse();
                cb();
            }
            else {
                setTimeout(() => {
                    checkKernel(cb);
                }, 500);
            }
        }
        return new Promise((resolve) => {
            checkKernel(resolve);
        });
    });
}
exports.onkernelReady = onkernelReady;
let pulseInterval; // NodeJS.Timeout;
function promiseWithTimeout(ms, promise) {
    // Create a promise that rejects in <ms> milliseconds
    let timeout = new Promise((resolve, reject) => {
        let id = setTimeout(() => {
            clearTimeout(id);
            reject('Timed out in ' + ms + 'ms.');
        }, ms);
    });
    // Returns a race between our timeout and the passed in promise
    return Promise.race([
        promise,
        timeout
    ]);
}
function pulse() {
    if (exports.wolframKernelClient !== undefined && (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state) == 2) {
        promiseWithTimeout(1000 * 60 * 10, exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendRequest("pulse").then((a) => {
            wolframStatusBar.color = "red";
            setTimeout(() => {
                wolframStatusBar.color = new vscode.ThemeColor("statusBar.foreground");
            }, 1000 * 30);
            (0, path_1.resolve)("true");
        })).then((a) => {
            setTimeout(pulse, 1000 * 60 * 10);
        }).catch(error => {
            console.log(error);
            outputChannel.appendLine("ping failed");
            vscode.window.showWarningMessage("The Wolfram kernel has not responded in >10 minutes. Would you like to restart it?", "Yes", "No").then((result) => {
                if (result === "Yes") {
                    restart();
                }
                if (result === "No") {
                    setTimeout(pulse, 1000 * 60 * 10);
                }
                else {
                }
            });
        });
    }
    // pulseInterval = setInterval(ping, 60000)
}
function newFunction() {
    exports.treeDataProvider = new treeDataProvider_1.workspaceSymbolProvider();
}
function clearResults() {
    plotsProvider.clearResults();
}
// function updateTreeItems(result:any) {
//     treeDataProvider?.getSymbols(result["file"])
// }
let movePositions = {};
function updatePositions(params) {
    params["result"].forEach((e) => {
        if (!(e["location"]["uri"] in movePositions)) {
            movePositions[e["location"]["uri"]] = {};
        }
        movePositions[e["location"]["uri"]][e["name"]] = e;
    });
}
function runToLine() {
    let e = vscode.window.activeTextEditor;
    let sel = e === null || e === void 0 ? void 0 : e.selection.active;
    let outputPosition = new vscode.Position(sel.line + 1, 0);
    let r = new vscode.Selection(0, 0, sel.line, sel.character);
    // e.revealRange(r, vscode.TextEditorRevealType.Default);
    let printOutput = false;
    let output = true;
    // if (plotsPanel?.visible == true) {
    //     output = true;
    // }
    let evaluationData = { range: r, textDocument: e === null || e === void 0 ? void 0 : e.document, print: printOutput, output: output, trace: false };
    evaluationQueue.unshift(evaluationData);
    if (!exports.wolframKernelClient) {
        restart().then(() => {
            evaluationQueue.unshift(evaluationData);
            sendToWolfram(printOutput);
            return;
        });
    }
    if (evaluationQueue.length == 1) {
        sendToWolfram(printOutput);
    }
}
let variableTable = {};
function updateVarTable(vars) {
    fs.readFile(vars["values"], "utf8", (err, data) => {
        if (err) {
            console.log(err);
            return;
        }
        let updatedVariables = JSON.parse(data);
        Object.keys(updatedVariables).map((k) => {
            variableTable[k] = updatedVariables[k].slice(0, 1000);
        });
        let vars = "";
        let i = 0;
        vars += `<vscode-data-grid id="varTable" generate-header="sticky" aria-label="With Sticky Header">
    <vscode-data-grid-row row-type="header">
        <vscode-data-grid-cell cell-type="columnheader" grid-column="1">Name</vscode-data-grid-cell>
        <vscode-data-grid-cell cell-type="columnheader" grid-column="2">Value</vscode-data-grid-cell>
    </vscode-data-grid-row>`;
        Object.keys(variableTable).forEach(k => {
            // if (i % 2 === 0) {
            //     vars += "<tr><td style='background:var(--vscode-editor-foreground) !important; color:var(--vscode-editor-background) !important;'>" + k + "</td><td style='background:var(--vscode-editor-foreground) !important; color:var(--vscode-editor-background) !important;'>" + variableTable[k] + "</td></tr>\n"
            // } else {
            //     vars += "<tr><td>" + k + "</td><td>" + variableTable[k] + "</td></tr>\n"
            // }
            vars += `<vscode-data-grid-row>
        <vscode-data-grid-cell grid-column="1">${k}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="2">${variableTable[k]}</vscode-data-grid-cell>
      </vscode-data-grid-row>`;
        });
        vars += "</vscode-data-grid>";
        dataProvider.updateView(vars);
    });
}
let runningLines = new Map();
function moveCursor2(position) {
    let e = vscode.window.activeTextEditor;
    let uri = e === null || e === void 0 ? void 0 : e.document.uri.toString();
    if (!(uri === undefined) && (uri in movePositions)) {
        let newPos = Object.values(movePositions[uri]).filter((p) => {
            let r = p["location"]["range"];
            return ((r.start.line <= position.line) && (position.line <= r.end.line));
        });
        if (newPos.length > 0) {
            let outputPosition = new vscode.Position(newPos[0]["location"]["range"]["end"]["line"] + 1, 0);
            if (e) {
                e.selection = new vscode.Selection(outputPosition, outputPosition);
                e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            }
            decorateRunningLine(outputPosition);
        }
        else {
            if (e) {
                let outputPosition = new vscode.Position(position["line"] + 1, 0);
                e.selection = new vscode.Selection(outputPosition, outputPosition);
                e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
                decorateRunningLine(outputPosition);
            }
        }
    }
}
// function moveCursor(params: any) {
//     let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
//     let outputPosition = new vscode.Position(params["position"]["line"], params["position"]["character"]);
//     if (e) {
//         e.selection = new vscode.Selection(outputPosition, outputPosition);
//         e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
//     }
//     decorateRunningLine(outputPosition);
// }
function cursorBlock() {
    let e = vscode.window.activeTextEditor;
    for (let i = 0; i < cursorLocations.length - 1; i++) {
        if (e) {
            if ((cursorLocations[i]["start"]["line"] <= (e === null || e === void 0 ? void 0 : e.selection.active.line)) &&
                (cursorLocations[i]["end"]["line"] >= (e === null || e === void 0 ? void 0 : e.selection.active.line))) {
                return cursorLocations[i];
                break;
            }
        }
    }
    return e === null || e === void 0 ? void 0 : e.selection;
}
let cursorMoved = false;
let cursorLocations = [];
function moveCursor(selection) {
    // if (cursorMoved == true) {
    //     cursorMoved = false;
    //     return
    // }
    let e = vscode.window.activeTextEditor;
    fs.readFile(cursorFile, "utf8", (err, data) => {
        var _a, _b, _c;
        if (err) {
            console.log(err);
            return;
        }
        let uri = e === null || e === void 0 ? void 0 : e.document.uri.toString();
        cursorLocations = (_a = JSON.parse(data)[uri]) !== null && _a !== void 0 ? _a : [];
        let top = selection.active;
        let bottom = (e === null || e === void 0 ? void 0 : e.selection.active.line) + 1 || 0;
        for (let i = 0; i < cursorLocations.length; i++) {
            if (e) {
                // This is the current block being executed
                if ((cursorLocations[i]["start"]["line"] <= selection.active.line) && (cursorLocations[i]["end"]["line"] >= selection.active.line)) {
                    // There is a block after this one
                    if (cursorLocations.length > i + 1) {
                        top = cursorLocations[i]["end"];
                        bottom = cursorLocations[i + 1]["start"]["line"];
                        break;
                    }
                    else {
                        top = cursorLocations[i]["end"];
                        bottom = top.line + 1;
                        break;
                    }
                }
            }
        }
        // console.log(selection.active.line, bottom)
        let outputPosition = new vscode.Position(bottom, 0);
        if ((e === null || e === void 0 ? void 0 : e.document.lineCount) == (outputPosition.line)) {
            e === null || e === void 0 ? void 0 : e.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(outputPosition.line + 1, 0), "\n");
            });
        }
        if (e) {
            e.selection = new vscode.Selection(outputPosition, outputPosition);
            // cursorMoved = true;
            e === null || e === void 0 ? void 0 : e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            decorateRunningLine(new vscode.Position(top["line"], top["character"]));
            let newEditorDecorations = [];
            let selection = e.selection.active;
            newEditorDecorations = ((_b = editorDecorations.get(e.document.uri.toString())) !== null && _b !== void 0 ? _b : []).filter((d) => {
                return d.range.start.line < selection.line;
            });
            editorDecorations.set(e.document.uri.toString(), newEditorDecorations);
            e.setDecorations(variableDecorationType, ((_c = editorDecorations.get(e.document.uri.toString())) !== null && _c !== void 0 ? _c : []));
        }
    });
}
function decorateRunningLine(outputPosition) {
    var _a, _b, _c, _d, _e;
    let e = vscode.window.activeTextEditor;
    if (e) {
        // if (outputPosition.line == 0) {
        //     return
        // }
        let decorationLine = e.document.lineAt(outputPosition.line);
        let start = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 10);
        let end = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 20);
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
        runningLines.set(range, d);
        e.setDecorations(runningDecorationType, Array.from(runningLines.values()));
        let documentDecorations = (_a = editorDecorations.get(e.document.uri.toString())) !== null && _a !== void 0 ? _a : [];
        for (let i = 0; i < ((_b = editorDecorations.get(e.document.uri.toString())) !== null && _b !== void 0 ? _b : []).length; i++) {
            const d1 = ((_c = editorDecorations.get(e.document.uri.toString())) !== null && _c !== void 0 ? _c : [])[i];
            if (d1.range.start.line == d.range.start.line) {
                ((_d = editorDecorations.get(e.document.uri.toString())) !== null && _d !== void 0 ? _d : []).splice(i, 1);
            }
        }
        e.setDecorations(variableDecorationType, ((_e = editorDecorations.get(e.document.uri.toString())) !== null && _e !== void 0 ? _e : []));
        // updateDecorations([d]);
    }
}
function updateRunningLines() {
    let editor = vscode.window.activeTextEditor;
    if (wolframBusyQ === true) {
        runningLines.forEach((d) => {
            let r = d["renderOptions"];
            let a = r ? ["after"] : { "contentText": "" };
            let c = a ? ["contentText"] : "";
            if (d["renderOptions"]["after"]["contentText"] == ".") {
                d["renderOptions"]["after"]["contentText"] = "..";
            }
            else if (d["renderOptions"]["after"]["contentText"] == "..") {
                d["renderOptions"]["after"]["contentText"] = "...";
            }
            else if (d["renderOptions"]["after"]["contentText"] == "...") {
                d["renderOptions"]["after"]["contentText"] = "....";
            }
            else if (d["renderOptions"]["after"]["contentText"] == "....") {
                d["renderOptions"]["after"]["contentText"] = ".....";
            }
            else if (d["renderOptions"]["after"]["contentText"] == ".....") {
                d["renderOptions"]["after"]["contentText"] = ".";
            }
        });
        editor === null || editor === void 0 ? void 0 : editor.setDecorations(runningDecorationType, Array.from(runningLines.values()));
        setTimeout(updateRunningLines, 500);
    }
    else {
        editor === null || editor === void 0 ? void 0 : editor.setDecorations(runningDecorationType, []);
    }
}
function abort() {
    var _a;
    try {
        (_a = wolframKernel.stdin) === null || _a === void 0 ? void 0 : _a.write("\x03");
    }
    catch (_b) {
        console.log("Wolfram kernel interrupt failed");
    }
}
let starttime = 0;
let inputs = [];
function runInWolfram(printOutput = false, trace = false) {
    let unsavedDocumentsQ = false;
    let editors = vscode.window.visibleTextEditors;
    editors.forEach((e) => {
        if (e.document.isUntitled) {
            unsavedDocumentsQ = true;
            // vscode.window.showInformationMessage("Please save all files before running in Wolfram")
        }
    });
    let e = vscode.window.activeTextEditor;
    let sel = e.selection;
    // let cursorMoved = false;
    // vscode.window.onDidChangeTextEditorSelection((e: vscode.TextEditorSelectionChangeEvent) => {
    //     cursorMoved = true;
    // })
    moveCursor(sel);
    let output = true;
    // if (plotsPanel?.visible == true) {
    //     output = true;
    // }
    let evaluationData = { range: sel, textDocument: e === null || e === void 0 ? void 0 : e.document, print: printOutput, output: output, trace: trace };
    evaluationQueue.unshift(evaluationData);
    // showPlots();
    // check if wolframkernelclient is undefined
    if (exports.wolframKernelClient == undefined || (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state) == 1) {
        restartKernel().then(() => {
            // evaluationQueue.unshift(evaluationData);
            sendToWolfram(printOutput);
            return;
        });
    }
    sendToWolfram(printOutput);
    // if (evaluationQueue.length == 1) {
    //     sendToWolfram(printOutput);
    // }
}
let evaluationQueue = [];
function sendToWolfram(printOutput = false, sel = undefined) {
    return __awaiter(this, void 0, void 0, function* () {
        let e = vscode.window.activeTextEditor;
        if (!sel) {
            sel = e.selection;
        }
        ;
        let outputPosition = new vscode.Position(sel.active.line, 0);
        if ((e === null || e === void 0 ? void 0 : e.document.lineCount) == outputPosition.line) {
            e === null || e === void 0 ? void 0 : e.edit(editBuilder => {
                editBuilder.insert(outputPosition, "\n");
                if (!sel) {
                    sel = e.selection;
                }
                ;
                outputPosition = new vscode.Position(sel.active.line + 1, 0);
            });
        }
        if ((e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'vscode-notebook-cell') {
            e.selection = new vscode.Selection(0, 0, 1, 1);
            try {
                starttime = Date.now();
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("runInWolfram", { range: sel, textDocument: e.document, print: false });
            }
            catch (err) {
                vscode.window.showErrorMessage("Wolfram kernel not running", "Restart kernel?").then((selection) => {
                    if (selection === "Restart kernel?") {
                        restartKernel();
                    }
                });
            }
        }
        else if ((e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'file' || (e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'untitled') {
            // e.selection = new vscode.Selection(outputPosition, outputPosition);
            // e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            // wolframKernelClient.sendNotification("moveCursor", {range:sel, textDocument:e.document});
            // if (!wolframBusyQ) {
            if (true) {
                let evalNext = evaluationQueue.pop();
                if (evalNext == undefined) {
                    return;
                }
                starttime = Date.now();
                console.log(exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state);
                outputChannel.appendLine("Sending to Wolfram: " + evalNext["textDocument"]["uri"]["path"]);
                if ((exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state) !== 2) {
                    vscode.window.showInformationMessage("Kernel is not running... restarting");
                    yield restartKernel().then(() => {
                        exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("runInWolfram", evalNext).then((result) => {
                        }).catch((err) => {
                            console.log("Error in runInWolfram");
                            // restart()
                        });
                    });
                }
                else {
                    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("runInWolfram", evalNext).then((result) => {
                    }).catch((err) => {
                        console.log("Error in runInWolfram");
                        // restart()
                    });
                }
            }
        }
    });
}
function setDecorations(result) {
    const editors = vscode.window.visibleTextEditors;
    let e = editors.filter((e) => {
        return e.document.uri.path === result["params"]["document"]["path"];
    })[0];
    for (let i = 0; i < Array.from(runningLines.values()).length; i++) {
        const d = Array.from(runningLines.values())[i];
        if (d.range.start.line == result["params"]["position"]["line"] - 1) {
            runningLines.delete(d.range);
            e.setDecorations(runningDecorationType, Array.from(runningLines.values()));
        }
    }
}
function onRunInWolframIO(result) {
    let end = Date.now();
    outputChannel.appendLine(`Execution time: ${end - starttime} ms`);
    // wolframBusyQ = false;
    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.show();
    setDecorations({ params: result });
    const editors = vscode.window.visibleTextEditors;
    let e = editors.filter((e) => {
        return e.document.uri.path === result["document"]["path"];
    })[0];
    updateResults(e, { params: result }, result["print"], result["input"]);
}
let evaluationResults = {};
function onRunInWolfram(file) {
    let end = Date.now();
    outputChannel.appendLine(`Execution time: ${end - starttime} ms`);
    // wolframBusyQ = false;
    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.show();
    let result;
    // try {
    //     result = bson.deserialize(fs.readFileSync(file["file"]), {encoding: null})
    // }
    fs.readFile(file["file"], null, ((err, data) => {
        var _a, _b, _c, _d, _e, _f, _g;
        if (err) {
            outputChannel.appendLine(err);
            return;
        }
        try {
            try {
                result = JSON.parse(Buffer.from(data).toString());
            }
            catch (_h) {
                result = {
                    "method": "onRunInWolfram",
                    "params": {
                        "input": "",
                        "print": false,
                        "output": "error reading output",
                        "result": "error reading output",
                        "hover": "error reading output",
                        "messages": [],
                        "load": false,
                        "time": 0,
                        "position": {
                            "line": ((_b = (_a = vscode.window.activeTextEditor) === null || _a === void 0 ? void 0 : _a.selection.active.line) !== null && _b !== void 0 ? _b : 0) + 1,
                            "character": ((_d = (_c = vscode.window.activeTextEditor) === null || _c === void 0 ? void 0 : _c.selection.active.character) !== null && _d !== void 0 ? _d : 0)
                        },
                        "document": {
                            "$mid": 1,
                            "fsPath": (_e = vscode.window.activeTextEditor) === null || _e === void 0 ? void 0 : _e.document.uri.fsPath,
                            "external": (_f = vscode.window.activeTextEditor) === null || _f === void 0 ? void 0 : _f.document.uri.toString(),
                            "path": (_g = vscode.window.activeTextEditor) === null || _g === void 0 ? void 0 : _g.document.uri.path,
                            "scheme": "file"
                        }
                    }
                };
            }
            setDecorations(result);
            const editors = vscode.window.visibleTextEditors;
            let e = editors.filter((e) => {
                return e.document.uri.path === result["params"]["document"]["path"];
            })[0];
            if (e.document.uri.scheme == 'vscode-notebook-cell') {
            }
            else {
                // inputs.push(file["input"])
                updateResults(e, result, result["params"]["print"], file["input"], file);
            }
        }
        catch (err) {
            outputChannel.appendLine("Output data error: " + err);
        }
        if (evaluationQueue.length > 0) {
            sendToWolfram();
        }
        else {
            exports.treeDataProvider.refresh();
        }
    }));
    // try{
    //     result = JSON.parse(fs.readFileSync(file["file"], "utf8"))["params"];
    // } catch {
    //     return
    // }
}
let maxPrintResults = 20;
let printResults = [];
let editorDecorations = new Map();
// let printResults: Map<string, string> = new Map();
function onResult(result) {
    console.log(result);
}
function updateInputs(params) {
    plotsProvider.newInput(params["input"]);
}
function updateResults(e, result, print, input = "", file = "") {
    if (typeof (e) !== "undefined") {
        e.edit(editBuilder => {
            var _a, _b, _c, _d;
            if (print) {
                let sel = e.selection;
                let outputPosition = new vscode.Position(result["params"]["position"]["line"] + 1, 0);
                try {
                    editBuilder.insert(outputPosition, (result["params"]["result"] + "\n\n").slice(0, 8192));
                }
                catch (error) {
                    console.log("Error: " + error);
                }
            }
            let output;
            if (result["params"]["load"]) {
                output = `${fs.readFileSync(result["params"]["output"]).toString()}`;
            }
            else {
                // output = result["params"]["output"] + "<br>" + file["file"] +"<br>" +  result["params"]["messages"].join("<br>");
                output = `${result["params"]["output"]}` + "<br>" + file["file"] + "<br>" + result["params"]["messages"].join("<br>");
            }
            if (result["params"]["messages"].length > 0) {
                output += "<div id='errors'>" +
                    result["params"]["messages"].reduce((acc, cur) => {
                        return acc + "<br>" + cur;
                    }, "") +
                    "</div>";
            }
            if (printResults.length > maxPrintResults) {
                printResults.shift();
            }
            let inputSnippet = input;
            if (input.length > 1000) {
                inputSnippet = input.slice(0, 250) + "..." + input.slice(-250);
            }
            let outputSnippet = output;
            if (output.length > 2000 && !output.includes("<img")) {
                outputSnippet = output.slice(0, 500) + " ... " + output.slice(-500);
            }
            if (!output.includes("<img")) {
                outputChannel.appendLine(result["params"]["result"].slice(0, 8192));
            }
            // let out = console_outputs.pop();
            // printResults.push(out);
            // showOutput();
            let backgroundColor = "editorInfo.background";
            let foregroundColor = "editorInfo.foreground";
            let hoverMessage = output; // result["params"]["output"];
            // is <img> tags in hoverMessage string
            if (hoverMessage.length > 8192 && !hoverMessage.includes("<img")) {
                hoverMessage = "Large output: " + hoverMessage.substring(0, 100) + "...";
            }
            if (result["params"]["messages"].length > 0) {
                backgroundColor = "red";
                hoverMessage += "\n" + result["params"]["messages"];
            }
            let resultString = result["params"]["time"].toString().slice(0, 5) + " s: " + result["params"]["result"];
            if (resultString.length > 300) {
                resultString = resultString.slice(0, 100) + "..." + resultString.slice(-100);
            }
            let nextline = result["params"]["position"]["line"] - 1;
            if (nextline >= e.document.lineCount) {
                nextline = e.document.lineCount - 1;
            }
            let startChar = e.document.lineAt(nextline).range.end.character;
            let decoration = {
                "range": new vscode.Range(nextline, startChar + 10, nextline, startChar + 200),
                "renderOptions": {
                    "after": {
                        "contentText": " " + resultString,
                        "backgroundColor": new vscode.ThemeColor("editorInfo.background"),
                        "color": new vscode.ThemeColor("editorInfo.foreground"),
                        "margin": "10px 10px 10px 10px",
                        "border": "4px solid blue",
                        "textDecoration": "none; white-space: pre; border-top: 0px; border-right: 0px; border-bottom: 0px; border-radius: 2px"
                    }
                },
                "hoverMessage": hoverMessage
            };
            let h = new vscode.MarkdownString(decoration.hoverMessage, false);
            h.isTrusted = true;
            h.supportHtml = true;
            decoration.hoverMessage = h;
            for (let i = 0; i < ((_a = editorDecorations.get(e.document.uri.toString())) !== null && _a !== void 0 ? _a : []).length; i++) {
                const d = ((_b = editorDecorations.get(e.document.uri.toString())) !== null && _b !== void 0 ? _b : [])[i];
                if (d.range.start.line == result["params"]["position"]["line"] - 1) {
                    ((_c = editorDecorations.get(e.document.uri.toString())) !== null && _c !== void 0 ? _c : []).splice(i, 1);
                }
            }
            if (editorDecorations.get(e.document.uri.toString()) == undefined) {
                editorDecorations.set(e.document.uri.toString(), []);
            }
            (_d = editorDecorations.get(e.document.uri.toString())) === null || _d === void 0 ? void 0 : _d.push(decoration);
            e.setDecorations(variableDecorationType, editorDecorations.get(e.document.uri.toString()));
            plotsProvider.newOutput(outputSnippet);
        });
    }
    ;
}
function runExpression(expression, line, end) {
    let e = (vscode.window.activeTextEditor == null) ? vscode.window.visibleTextEditors[0] : vscode.window.activeTextEditor;
    decorateRunningLine(new vscode.Position(line, end));
    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendRequest("runExpression", { print: false, expression: expression, textDocument: e === null || e === void 0 ? void 0 : e.document, line: line, end: end }).then((result) => { });
}
let wolframBusyQ = false;
function wolframBusy(params) {
    if (params.busy === true) {
        //kernelStatusBar.color = "red";
        wolframBusyQ = true;
        wolframStatusBar.text = "$(extensions-sync-enabled~spin) Wolfram Running";
        wolframStatusBar.show();
        let outputPosition = new vscode.Position(0, 0);
        if (params.position) {
            outputPosition = new vscode.Position(params.position.line, params.position.character);
        }
        progressStatus = vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Running line " + (outputPosition.line) + " in Wolfram",
            cancellable: true
        }, (prog, withProgressCancellation) => {
            return new Promise((resolve, reject) => {
                // withProgressCancellation = new vscode.CancellationTokenSource();
                withProgressCancellation.onCancellationRequested(ev => {
                    console.log("Aborting Wolfram evaluation");
                    // withProgressCancellation?.dispose();
                    // stopWolfram(undefined, wolframKernel);
                    let notification = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
                    notification.text = "$(alert) Wolfram evaluation aborted";
                    setTimeout(() => {
                        notification.dispose();
                    }, 2000);
                    // progressStatus.dispose();
                    restartKernel();
                    resolve(false);
                });
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification("onRunInWolfram", (result) => {
                    onRunInWolfram(result);
                    resolve(true);
                });
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification("onRunInWolframIO", (result) => {
                    onRunInWolframIO(result);
                    resolve(true);
                });
                // wolframStatusBar.text = "$(extensions-sync-enabled~spin) Wolfram Running";
                // wolframStatusBar.show();
                // starttime = Date.now();
                // if (wolframKernelClient?.state === 1) {
                //     console.log("Kernel is not running")
                //     setTimeout(() => {
                //         console.log("Restarting kernel")
                //         restartKernel().then((m:any) => {
                //             console.log("Kernel restarted. State: ")
                //             sendToWolfram(printOutput, sel)
                //         });
                //         resolve(false)
                //     }, 1000);
                // }
            }).catch((err) => {
                console.log("Error in sendToWolfram");
                console.log(err);
                restart();
            });
        });
    }
    else {
        //kernelStatusBar.color = "yellow";
        wolframBusyQ = false;
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();
        // progressStatus?.resolve();
    }
}
let workspaceDecorations = {};
let workspaceLintDecorations = {};
function clearDecorations() {
    let editor = vscode.window.activeTextEditor;
    let uri = editor === null || editor === void 0 ? void 0 : editor.document.uri.toString();
    if (uri && uri in workspaceDecorations) {
        // workspaceDecorations[uri] = {} as vscode.DecorationOptions[];
        // editor?.setDecorations(variableDecorationType,[] )
    }
}
let newDecorations = {};
function updateDecorations(decorationfile) {
    let editor = vscode.window.activeTextEditor;
    if ((editor === null || editor === void 0 ? void 0 : editor.document.uri.scheme) === 'file' || (editor === null || editor === void 0 ? void 0 : editor.document.uri.scheme) === 'untitled') {
        //editor.setDecorations(variableDecorationType, []);
        fs.readFile(decorationfile, "utf8", (err, data) => {
            if (err) {
                outputChannel.appendLine(err);
                return;
            }
            if (data == '') {
                return;
            }
            newDecorations = JSON.parse(data);
            if (typeof (editor) === "undefined") {
                return;
            }
            let uri = editor.document.uri.toString();
            let editorDecorations = [];
            if (newDecorations[uri] === workspaceDecorations[uri]) {
                return;
            }
            else {
                workspaceDecorations[uri] = newDecorations[uri];
                Object.keys(workspaceDecorations[uri]).forEach((d) => {
                    let decoration = workspaceDecorations[uri][d];
                    let h = new vscode.MarkdownString(decoration.hoverMessage, false);
                    h.isTrusted = true;
                    h.supportHtml = true;
                    decoration.hoverMessage = h;
                    editorDecorations.push(workspaceDecorations[uri][d]);
                });
                // runningLines = [];
                editor.setDecorations(variableDecorationType, editorDecorations);
                editor.setDecorations(runningDecorationType, Array.from(runningLines.values()));
            }
        });
        // try{
        //     ;
        // } catch{
        //     newDecorations = {};
        //     return
        // }
    }
}
function updateLintDecorations(decorationfile) {
    let editor = vscode.window.activeTextEditor;
    if ((editor === null || editor === void 0 ? void 0 : editor.document.uri.scheme) === 'file' || (editor === null || editor === void 0 ? void 0 : editor.document.uri.scheme) === 'untitled') {
        //editor.setDecorations(variableDecorationType, []);
        fs.readFile(decorationfile, "utf8", (err, data) => {
            if (err) {
                outputChannel.appendLine(err);
                return;
            }
            newDecorations = JSON.parse(data);
            if (typeof (editor) === "undefined") {
                return;
            }
            let uri = editor.document.uri.toString();
            let editorLintDecorations = [];
            if (newDecorations[uri] === workspaceDecorations[uri]) {
                return;
            }
            else {
                workspaceLintDecorations[uri] = newDecorations[uri];
                Object.keys(workspaceLintDecorations[uri]).forEach((d) => {
                    editorLintDecorations.push(workspaceLintDecorations[uri][d]);
                });
                // runningLines = [];
                editor.setDecorations(lintDecorationType, editorLintDecorations);
                editor.setDecorations(runningDecorationType, []);
            }
        });
        // try{
        //     ;
        // } catch{
        //     newDecorations = {};
        //     return
        // }
    }
}
let variableDecorationType = vscode.window.createTextEditorDecorationType({
    // light: {
    //     color: new vscode.ThemeColor("editorInfo.background")
    // },
    // dark: {
    //     color: new vscode.ThemeColor("editorInfo.background")
    // },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});
let lintDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'none',
    light: {
        color: new vscode.ThemeColor("foreground")
    },
    dark: {
        color: new vscode.ThemeColor("foreground")
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});
let runningDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'none',
    light: {
        color: new vscode.ThemeColor("foreground")
    },
    dark: {
        color: new vscode.ThemeColor("foreground")
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});
let blockDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'none',
    fontWeight: 'bold',
    overviewRulerColor: new vscode.ThemeColor("foreground"),
    overviewRulerLane: vscode.OverviewRulerLane.Right
});
function clearPlots() {
    printResults = [];
    updateOutputPanel();
}
function updateOutputPanel() {
    // plotsProvider.updateView(printResults.reverse())
}
function startWLSPIO(id) {
    return __awaiter(this, void 0, void 0, function* () {
        let serverOptions = {
            run: {
                command: "/usr/local/bin/wolframscript", args: ["-file", path.join(context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp-io.wl')))], transport: node_1.TransportKind.stdio
            },
            debug: { command: "/usr/local/bin/wolframscript", args: ["-script", path.join(context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp-io.wl')))], transport: node_1.TransportKind.stdio }
        };
        let clientOptions = {
            documentSelector: [{ scheme: 'file', language: 'wolfram' }],
            diagnosticCollectionName: 'Wolfram Language',
            outputChannel: outputChannel,
            revealOutputChannelOn: 1
        };
        exports.wolframClient = new node_1.LanguageClient('wolfram', 'Wolfram Language', serverOptions, clientOptions);
        exports.wolframClient.registerProposedFeatures();
        exports.wolframClient.traceOutputChannel.show();
        exports.wolframClient.onDidChangeState((event) => {
            console.log("state changed");
            console.log(event.newState);
        });
        yield (exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.start());
        console.log("client ready");
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            // wolframClient = new LanguageClient('wolfram', 'Wolfram Language', serverOptions, clientOptions, true);
            // wolframClient.registerProposedFeatures();
            // wolframClient?.start();
            resolve();
            // onclientReady();
            // setTimeout(() => {
            //     let disposible: vscode.Disposable | undefined;
            //     wolframClient?.start();
            //     resolve();
            // }, 2000)
        }));
    });
}
let console_outputs = [];
let socketsClosed = 0;
function startWLSP(id) {
    return __awaiter(this, void 0, void 0, function* () {
        let timeout;
        let serverOptions = function () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                let socket = new net.Socket();
                let retries = 0;
                socket.setMaxListeners(5);
                // socket.on("data", (data) => {
                // console.log("WLSP Kernel Data: " + data.toString().slice(0, 200))
                // console_outputs.push(data.toString());
                // });
                socket.on('connect', () => {
                    clearTimeout(timeout);
                    setTimeout(() => {
                        resolve({
                            reader: socket,
                            writer: socket
                        });
                    }, 1000);
                });
                socket.on('error', function (err) {
                    outputChannel.appendLine("Client Socket error: " + err);
                    retries += 1;
                    if (retries < 10) {
                        if (err.code === 'ECONNREFUSED') {
                            timeout = setTimeout(() => {
                                socket.connect(clientPort, "127.0.0.1");
                            }, 1500);
                        }
                    }
                    else {
                        vscode.window.showErrorMessage("Wolfram LSP failed to connect. Please check that wolframscript is installed and running and that the port " + clientPort + " is not in use.", { title: "Try Again?", command: "wolfram.restart" }).then((item) => __awaiter(this, void 0, void 0, function* () {
                            if ((item === null || item === void 0 ? void 0 : item.command) === "wolfram.restart") {
                                restart();
                            }
                        }));
                    }
                });
                socket.on("close", () => {
                    outputChannel.appendLine("Client Socket closed");
                    stopWolfram(undefined, wolfram);
                });
                socket.on('timeout', () => {
                    outputChannel.appendLine("Client Socket timeout");
                });
                socket.on('ready', () => {
                });
                socket.on('drain', () => {
                    // outputChannel.appendLine("Client Socket is draining")
                    // outputChannel.appendLine(new Date().toLocaleTimeString())
                });
                socket.on("end", () => {
                    outputChannel.appendLine("Client Socket end");
                });
                fp(clientPort).then(([freePort]) => __awaiter(this, void 0, void 0, function* () {
                    clientPort = freePort + id;
                    yield load(wolfram, lspPath, clientPort, outputChannel).then((r) => {
                        wolfram = r;
                        setTimeout(() => {
                            socket.connect(clientPort, "127.0.0.1", () => {
                                outputChannel.appendLine("Client Socket connected");
                            });
                        }, 2000);
                    });
                }));
            }));
        };
        let clientErrorHandler = new ClientErrorHandler();
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            initializationOptions: {
                debuggerPort: 7777
            },
            diagnosticCollectionName: 'wolfram-lsp',
            outputChannel: outputChannel,
            errorHandler: clientErrorHandler
        };
        exports.wolframClient = new node_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            onclientReady();
            // wolframClient.onReady().then(() => {
            //     onclientReady();
            // })
            exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.start().then((value) => {
                outputChannel.appendLine("Client Started");
                resolve();
            }, (reason) => {
                outputChannel.appendLine("Client Start Error: " + reason);
            });
            // outputChannel.appendLine(new Date().toLocaleTimeString())
            // if (disposible) {context.subscriptions.push(disposible)};
        }));
    });
}
let attempts = 0;
function startWLSPKernelIO(id) {
    return __awaiter(this, void 0, void 0, function* () {
        attempts += 1;
        console.log("Starting WLSP Kernel: " + attempts);
        let serverOptions = {
            run: { module: context.asAbsolutePath('dist/server.js'), transport: node_1.TransportKind.ipc },
            debug: { module: context.asAbsolutePath('dist/server.js'), transport: node_1.TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6009"] } }
        };
        let kernelErrorHandler = new ClientErrorHandler();
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            initializationOptions: {
                debuggerPort: 7777
            },
            diagnosticCollectionName: 'wolfram-lsp',
            outputChannel: kernelOutputChannel,
            errorHandler: kernelErrorHandler
        };
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            exports.wolframKernelClient = new node_1.LanguageClient('wolfram-kernel', 'Wolfram Language Kernel Server', serverOptions, clientOptions);
            onclientReady();
            setTimeout(() => {
                let disposible;
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.start();
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.outputChannel.appendLine("Kernel Client Started");
                // outputChannel.appendLine(new Date().toLocaleTimeString())
                // if (disposible) {context.subscriptions.push(disposible)};
                resolve();
            }, 100);
        }));
    });
}
let connectingKernel = false;
function startWLSPKernelSocket(id) {
    return __awaiter(this, void 0, void 0, function* () {
        let timeout;
        if (connectingKernel) {
            return;
        }
        connectingKernel = true;
        let serverOptions = function () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                let socket = new net.Socket();
                let retries = 0;
                socket.setMaxListeners(5);
                // socket.on("data", (data) => {
                // outputChannel.appendLine("WLSP Kernel Data: " + data.toString().slice(0, 200))
                // console_outputs.push(data.toString());
                // });
                socket.on('connect', () => {
                    clearTimeout(timeout);
                    connectingKernel = false;
                    setTimeout(() => {
                        resolve({
                            reader: socket,
                            writer: socket
                        });
                    }, 1000);
                });
                socket.on('error', function (err) {
                    outputChannel.appendLine("Kernel Socket error: ");
                    retries += 1;
                    if (retries < 10) {
                        if (err.code === 'ECONNREFUSED') {
                            outputChannel.appendLine("Kernel failed to connect");
                            timeout = setTimeout(() => {
                                socket.connect(kernelPort, "127.0.0.1", () => {
                                    socket.setKeepAlive(true);
                                });
                            }, 2000);
                        }
                    }
                    else {
                        vscode.window.showErrorMessage("Wolfram Kernel failed to connect. Please check that wolframscript is installed and running and that the port " + kernelPort + " is not in use.", { title: "Try Again?", command: "wolfram.restart" }).then((item) => __awaiter(this, void 0, void 0, function* () {
                            if ((item === null || item === void 0 ? void 0 : item.command) === "wolfram.restart") {
                                restart();
                            }
                        }));
                    }
                });
                socket.on("close", () => {
                    outputChannel.appendLine(new Date().toLocaleTimeString());
                    outputChannel.appendLine("Kernel Socket closed");
                    stopWolfram(undefined, wolframKernel);
                });
                socket.on('timeout', () => {
                    outputChannel.appendLine("Kernel Socket timeout");
                });
                socket.on('ready', () => {
                    clearTimeout(timeout);
                    setTimeout(() => {
                        resolve({
                            reader: socket,
                            writer: socket
                        }),
                            1000;
                    });
                });
                socket.on('drain', () => {
                    // outputChannel.appendLine("Kernel Socket is draining")
                });
                socket.on("end", (msg) => __awaiter(this, void 0, void 0, function* () {
                    outputChannel.appendLine("Kernel Socket end");
                    console.log("Kernel Socket end");
                    console.log(msg);
                    // attempt to revive the kernel
                    // await new Promise(resolve => setTimeout(resolve, 1000));
                    // stopWolfram(undefined, wolframKernel)  
                    // vscode.window.showErrorMessage("Wolfram Kernel disconnected.",
                    //     "Restart kernel?").then((selection) => {
                    //         if (selection === "Restart kernel?") {
                    //             restartKernel()
                    //         }
                    //     });
                }));
                fp(kernelPort).then(([freePort]) => __awaiter(this, void 0, void 0, function* () {
                    kernelPort = freePort + id;
                    yield stopWolfram(undefined, wolframKernel).then((a) => {
                        load(wolframKernel, kernelPath, kernelPort, outputChannel).then((r) => {
                            wolframKernel = r;
                            setTimeout(() => {
                                socket.connect(kernelPort, "127.0.0.1", () => {
                                    socket.setKeepAlive(true);
                                });
                            }, 500);
                        });
                    });
                }));
            }));
        };
        let kernelErrorHandler = new ClientErrorHandler();
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            diagnosticCollectionName: 'wolfram-lsp',
            markdown: {
                isTrusted: true,
                supportHtml: true
            },
            outputChannel: kernelOutputChannel,
            errorHandler: kernelErrorHandler
        };
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            exports.wolframKernelClient = new node_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
            onkernelReady();
            // wolframKernelClient.onReady().then(() => {
            //     onkernelReady();
            // })
            setTimeout(() => {
                let disposible;
                // disposible = wolframKernelClient?.start();
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.start().then(() => {
                    outputChannel.appendLine("Kernel Started");
                    resolve();
                });
                // outputChannel.appendLine(new Date().toLocaleTimeString())
                // if (disposible) {context.subscriptions.push(disposible)};
            }, 1000);
        }));
    });
}
// 
function delay(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => { setTimeout(resolve, ms); });
    });
}
function connectKernelClient(outputChannel, context) {
}
function load(wolfram, path, port, outputChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            var _a, _b;
            let executablePath = vscode.workspace.getConfiguration('wolfram').get('executablePath') || "wolframscript";
            try {
                if (process.platform === "win32") {
                    wolfram = cp.spawn('cmd.exe', ['/c', executablePath === null || executablePath === void 0 ? void 0 : executablePath.toString(), '-file', path, port.toString(), path, "-noinit"], { detached: false });
                }
                else {
                    wolfram = cp.spawn(executablePath === null || executablePath === void 0 ? void 0 : executablePath.toString(), ['-file', path, port.toString(), path, "-noinit"], { detached: true });
                }
                wolfram.on("error", (err) => {
                    outputChannel.appendLine("Wolframscript error: " + err);
                    vscode.window.showErrorMessage("WLSP failed to load. Please check that wolframscript is installed and that the path is correct in the settings. Download wolframscript at https://www.wolfram.com/engine/");
                });
                if (wolfram.pid != undefined) {
                    // console.log("Launching wolframscript: " + wolfram.pid.toString());
                    processes.push(wolfram);
                }
                // else {
                //     // console.log("Launching wolframscript: pid unknown");
                // }
                wolfram.on('SIGPIPE', (data) => {
                    console.log("SIGPIPE");
                });
                (_a = wolfram.stdout) === null || _a === void 0 ? void 0 : _a.on('error', (data) => {
                    console.log("STDOUT Error" + data.toString());
                });
                (_b = wolfram.stdout) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
                    outputChannel.appendLine("WLSP: " + data.toString());
                    if (data.toString().includes("SocketObject")) {
                        setTimeout(() => { resolve(wolfram); }, 1000);
                    }
                    // vscode.window.showInformationMessage(data.toString().slice(0, 1000))
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
    return new Promise((resolve) => {
        // client?.stop();
        try {
            client === null || client === void 0 ? void 0 : client.stop();
        }
        catch (_a) { }
        try {
            let cp = require('child_process');
            let isWin = /^win/.test(process.platform);
            if (isWin) {
                cp.exec('taskkill /PID ' + client_process.pid + ' /T /F', function (error, stdout, stderr) { });
                resolve();
            }
            else {
                console.log("Killing process: " + client_process.pid);
                cp.exec('kill -9 ' + client_process.pid, function (error, stdout, stderr) { });
                resolve();
                // process.kill(-client_process.pid, 'SIGKILL');
                // cp.exec('kill -9 ' + client_process.pid , function (error: any, stdout: any, stderr: any) {})
                // client_process.kill();
                // kill(client_process.pid);
            }
        }
        catch (e) {
            console.log(e.message);
            resolve();
        }
    });
}
let kill = function (pid) {
    let signal = 'SIGTERM';
    let callback = function () { };
    var killTree = false;
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
                    console.log(ex.message);
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
function runTextCell(location) {
    let e = vscode.window.activeTextEditor;
    let sel = new vscode.Selection(new vscode.Position(location.start.line, location.start.character), new vscode.Position(location.end.line - 1, location.end.character));
    let evaluationData = { range: sel, textDocument: e === null || e === void 0 ? void 0 : e.document, print: false, output: true, trace: false };
    evaluationQueue.unshift(evaluationData);
    sendToWolfram(false);
}
function printInWolfram(print = true) {
    runInWolfram(print);
}
function didChangeSelection(event) {
    let editor = vscode.window.activeTextEditor;
    editor === null || editor === void 0 ? void 0 : editor.setDecorations(blockDecorationType, []);
    let cursorBlock0 = cursorBlock();
    let d = {
        "range": new vscode.Range(cursorBlock0.start.line, 0, cursorBlock0.end.line, cursorBlock0.end.character)
    };
    editor === null || editor === void 0 ? void 0 : editor.setDecorations(blockDecorationType, [d]);
}
function didChangeTextDocument(event) {
    return __awaiter(this, void 0, void 0, function* () {
        // didOpenTextDocument(event.document);
        // remove old decorations
        // console.log(event)
        return new Promise((resolve) => {
            var _a, _b, _c;
            let editor = vscode.window.activeTextEditor;
            let selection = (_a = editor === null || editor === void 0 ? void 0 : editor.selection) === null || _a === void 0 ? void 0 : _a.active;
            if (event.document.uri.toString() !== (editor === null || editor === void 0 ? void 0 : editor.document.uri.toString())) {
                return;
            }
            if (event.contentChanges.length === 0) {
                return;
            }
            clearDecorations();
            // let newrunninglines = [];
            // newrunninglines = runningLines.filter((d: vscode.DecorationOptions) => {
            //     return d.range.start.line < selection?.line
            // })
            // Remove old running lines and decorations
            let newrunninglines = new Map();
            runningLines.forEach((d, key) => {
                if (d.range.start.line < (selection === null || selection === void 0 ? void 0 : selection.line)) {
                    newrunninglines.set(key, d);
                }
            });
            runningLines = newrunninglines;
            editor.setDecorations(runningDecorationType, Array.from(runningLines.values()));
            let newEditorDecorations = [];
            newEditorDecorations = ((_b = editorDecorations.get(editor.document.uri.toString())) !== null && _b !== void 0 ? _b : []).filter((d) => {
                return d.range.start.line < selection.line;
            });
            editorDecorations.set(editor.document.uri.toString(), newEditorDecorations);
            editor.setDecorations(variableDecorationType, ((_c = editorDecorations.get(editor.document.uri.toString())) !== null && _c !== void 0 ? _c : []));
            // for (let i = 0; i < runningLines.length; i++) {
            //     const d:vscode.DecorationOptions = runningLines[i];
            //     if (selection?.line == d.range.start.line) {
            //         d.range = new vscode.Range(
            //             selection.line,
            //             editor.document.lineAt(selection.line).range.end.character + 10,
            //             selection.line,
            //             editor.document.lineAt(selection.line).range.end.character + 110
            //         )
            //         runningLines[i] = d
            //     }
            // }
            // editor.setDecorations(runningDecorationType, runningLines)
            // for (let i = 0; i < editorDecorations.length; i++) {
            //     const d:vscode.DecorationOptions = editorDecorations[i];
            //     if (selection?.line == d.range.start.line) {
            //         d.range = new vscode.Range(
            //             selection.line,
            //             editor.document.lineAt(selection.line).range.end.character + 10,
            //             selection.line,
            //             editor.document.lineAt(selection.line).range.end.character + 110
            //         )
            //         editorDecorations[i] = d
            //     }
            // }
            // editor.setDecorations(variableDecorationType, editorDecorations)
            // if (vscode.workspace.getConfiguration().get("wlsp.liveDocument")) {
            //     let doc = editor?.document;
            //     if (wolframKernelClient) {        
            //             wolframKernelClient?.sendNotification("runDocumentLive", doc?.uri)
            //     } 
            //     return
            // }  
            // return ;
            resolve();
        });
    });
}
function isUntitled(document) {
    if (document) {
        return (document.languageId === "wolfram" && document.uri.scheme === 'untitled');
    }
    else {
        return false;
    }
}
let totalClients = 0;
function didOpenTextDocument(document) {
    if (document.languageId !== 'wolfram' || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
        return;
    }
    let folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
        if (document.languageId == 'wolfram' && !clients.has("default")) {
            totalClients++;
            // startWLSP(totalClients)
            // startWLSPKernel(totalClients)
            clients.set("default", [exports.wolframClient, exports.wolframKernelClient]);
            return;
        }
        return;
    }
    if (!clients.has(folder.uri.toString()) && document.languageId === "wolfram") {
        totalClients++;
        // startWLSP(totalClients)
        // startWLSPKernel(totalClients)
        clients.set(folder.uri.toString(), [exports.wolframClient, exports.wolframKernelClient]);
    }
    if (isUntitled(document) && clients.size == 0) {
        // startWLSP()
        // startWLSPKernel()
        clients.set("default", [exports.wolframClient, exports.wolframKernelClient]);
        return;
    }
    return;
}
function updateTreeDataProvider() {
    exports.treeDataProvider.refresh();
}
function didSaveTextDocument(event) {
    // treeDataProvider.refresh();
    clearDecorations();
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
function createNotebookInteractive() {
    // vscode.workspace.openNotebookDocument("wolfram-interactive").then((document: vscode.NotebookDocument) => {
    //     // vscode.window.showNotebookDocument(document);
    // });
    vscode.window.showNotebookDocument(new interactiveNotebook_1.InteractiveNotebook(vscode.Uri.parse("untitled:untitled.nb"), "wolfram-interactive", "wolfram-interactive", false, true, [], ["wolfram"], exports.wolframKernelClient));
}
function createNotebookScript() {
    vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(""), 'jupyter-notebook');
    // vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.wl")).then((document: vscode.NotebookDocument) => {
    //     // vscode.window.showNotebookDocument(document);
    // });
}
function didChangeWindowState(state) {
    if (exports.wolframClient !== undefined && exports.wolframClient.state === 2) {
        exports.wolframClient.sendNotification("windowFocused", state.focused);
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
function wolframHelp(url) {
    let helpPanel = vscode.window.createWebviewPanel("wolframHelp", "Wolfram Help", 2, {
        enableScripts: true,
        retainContextWhenHidden: true
    });
    helpPanel.webview.html = `<!DOCTYPE html>
    <html lang="en">
    <head>
    
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' ${url} 'unsafe-inline'">
    
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
function showTrace() {
    runInWolfram(false, true);
}
function errorMessages(params) {
    let file = params["file"];
    fs.readFile(file, "utf8", (err, data) => {
        if (err)
            return;
        let errors = JSON.parse(data);
        let errorString = "";
        errors.forEach((e) => {
            errorString += e.toString() + "\n";
            vscode.window.showErrorMessage(e.toString());
        });
        printResults.push([params["input"],
            errorString]);
        updateOutputPanel();
    });
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
// async function connect(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, port: number, type?: string): Promise<(any)[]> {
//     let serverOptions: ServerOptions = function () {
//         return new Promise((resolve, reject) => {
//             let socket = new net.Socket();
//             socket.setMaxListeners(100);
//             // socket.on("data", (data) => {
//                 // console.log("WLSP Kernel Data: " + data.toString().slice(0, 200))
//                 // console_outputs.push(data.toString());
//             // });
//             let timeout: any;
//             socket.on('connect', () => {
//                 console.log("Socket connected: " )
//                 clearTimeout(timeout);
//                 resolve({
//                     reader: socket,
//                     writer: socket
//                 })
//             })
//             socket.on('error', function (err) {
//                 // console.log("Socket Error: " + err.message);
//                 timeout = setTimeout(() => {            
//                     socket.connect(port, "127.0.0.1", () => {
//                         socket.setKeepAlive(false);
//                     });
//                 },1000)
//             })
//             socket.on("close", () => {
//                 console.log("Socket close")    
//                 // startLanguageServer(context, outputChannel)
//             })
//             socket.on('timeout', () => {
//                 console.log("Socket timeout")    
//             });
//             socket.on('ready', () => {
//                 console.log("Socket ready")     
//             })
//             socket.on('drain', () => {
//                 // console.log("Socket is draining")
//             })
//             socket.on("end", () => {
//                 console.log("Socket end");
//                 timeout = setTimeout(() => {
//                     socket.connect(port, "127.0.0.1", () => { socket.setKeepAlive(true) });
//                 }, 1000);
//             })
//             socket.connect(port, "127.0.0.1", () => {
//                 socket.setKeepAlive(false);
//             });
//         })
//     };
//     let clientOptions: LanguageClientOptions = {
//         documentSelector: [
//             "wolfram"
//         ],
//         diagnosticCollectionName: 'wolfram-lsp',
//         outputChannel: outputChannel
//     };
//     return new Promise(async (resolve) => {
//         let disposible: vscode.Disposable;
//         let client = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);    
//         while (client.needsStart()){
//             console.log("Waiting for client to start...");
//             disposible = client.start();
//             delay(1000);
//         }
//         client.onReady().then(() => {
//             console.log("Client ready");
//             resolve([client, disposible]);
//         });
//         // disposible = client.start();
//         // resolve([client, disposible]);
//     });
// }
class WLSPConfigurationProvider {
    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    resolveDebugConfiguration(folder, config, token) {
        // if launch.json is missing or empty
        if (!config.type && !config.request && !config.name) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'markdown') {
                config.type = 'mock';
                config.name = 'Launch';
                config.request = 'launch';
                config.program = '${file}';
                config.stopOnEntry = true;
            }
        }
        if (!config.program) {
            return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
                return undefined; // abort launch
            });
        }
        return config;
    }
}
class ClientErrorHandler {
    error(error, message, count) {
        console.log("Error: " + error.message);
        return {
            action: node_1.ErrorAction.Continue
        };
    }
    closed() {
        console.log("Closed");
        return {
            action: node_1.CloseAction.DoNotRestart
        };
    }
}
//# sourceMappingURL=clients.js.map