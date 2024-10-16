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
exports.onkernelReady = exports.restart = exports.restartKernel = exports.startLanguageServer = exports.wlspdebugger = exports.treeDataProvider = exports.scriptController = exports.interactiveNotebookSerializer = exports.interactiveController = exports.notebookcontroller = exports.notebookSerializer = exports.scriptserializer = exports.wolframKernelClient = exports.wolframClient = void 0;
const vscode = require("vscode");
const vscode_1 = require("vscode");
const path = require("path");
const fp = require('find-free-port');
const psTree = require('ps-tree');
const bson = require('bson');
const node_1 = require("vscode-LanguageClient/node");
const path_1 = require("path");
const debug_1 = require("./debug");
const launch = require("./launch");
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
let debugging = false;
exports.wolframClient = undefined;
exports.wolframKernelClient = undefined;
let firstKernelLaunched = false;
function startLanguageServer(context0, outputChannel0) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        context = context0;
        lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
        kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
        cursorFile = path.join(context.extensionPath, "wolfram", "cursorLocations.js");
        outputChannel = outputChannel0;
        yield launch.startWLSP(0, lspPath).then((client) => {
            exports.wolframClient = client;
            onclientReady();
            // wolframClient?.onDidChangeState((event: StateChangeEvent) => {
            //     // if (event.newState == State.Running) {
            //         onclientReady()
            //     // }
            // })
        });
        vscode.commands.registerCommand('wolfram.runInWolfram', runInWolfram);
        yield launch.startWLSPKernelSocket(0, kernelPath).then((client) => {
            exports.wolframKernelClient = client;
            onkernelReady();
            firstKernelLaunched = true;
            // wolframKernelClient?.onDidChangeState((event: StateChangeEvent) => {
            //     // if (event.newState == State.Running) {
            //         console.log("Kernel ready: " + event.newState)
            //         onkernelReady()
            //     // }
            // })
        });
        // kernelOutputChannel = vscode.window.createOutputChannel("Wolfram Kernel");
        wolframStatusBar.text = "Wolfram ?";
        wolframStatusBar.command = 'wolfram.restart';
        wolframStatusBar.show();
        vscode.workspace.onDidChangeTextDocument(didChangeTextDocument);
        debugging = (vscode.env.machineId === "someValue.machineId");
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
        (_a = plotsProvider._view) === null || _a === void 0 ? void 0 : _a.show(true);
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
        vscode.commands.registerCommand('wolfram.updateVarTable', getUpdateVarTable);
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
    });
}
exports.startLanguageServer = startLanguageServer;
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
        exports.wolframKernelClient = yield launch.restartKernel();
        yield onkernelReady();
        return new Promise((resolve) => {
            resolve(exports.wolframKernelClient);
        });
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
        editorDecorations.clear();
        e === null || e === void 0 ? void 0 : e.setDecorations(variableDecorationType, []);
        yield launch.restart().then((clients) => {
            exports.wolframClient = clients[0];
            exports.wolframKernelClient = clients[1];
            onclientReady();
            onkernelReady();
        });
        return new Promise((resolve) => {
            vscode.workspace.textDocuments.forEach(didOpenTextDocument);
            resolve();
        });
    });
}
exports.restart = restart;
function completionRequest(params) {
    console.log("completionRequest", params);
    return {};
}
function onclientReady() {
    return __awaiter(this, void 0, void 0, function* () {
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification("updatePositions", updatePositions);
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification("updateLintDecorations", updateLintDecorations);
        // wolframClient?.onRequest("textDocument/completion", completionRequest);
        // wolframClient.handleFailedRequest
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendRequest("wolframVersion").then((result) => {
            wolframVersionText = result["output"];
            wolframStatusBar.text = result["output"];
        });
        // wolframClient?.sendRequest("DocumentSymbolRequest");
        exports.treeDataProvider === null || exports.treeDataProvider === void 0 ? void 0 : exports.treeDataProvider.getBuiltins();
        (0, path_1.resolve)();
    });
}
let temporaryDir = "";
function onkernelReady() {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            var _a;
            // wolframKernelClient?.onNotification("onRunInWolfram", onRunInWolfram);
            exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification("wolframBusy", wolframBusy);
            // wolframKernelClient?.onNotification("updateDecorations", updateDecorations);
            exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification("updateVarTable", updateVarTable);
            // wolframKernelClient?.onNotification("moveCursor", moveCursor);
            // wolframKernelClient?.onNotification("updateTreeItems", updateTreeItems);
            // wolframKernelClient?.onNotification("pulse", pulse);
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
            // treeDataProvider?.getSymbols([]);
            // pulse();
            resolve();
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
    return __awaiter(this, void 0, void 0, function* () {
        if (exports.wolframKernelClient !== undefined && (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state) == 2) {
            promiseWithTimeout(1000 * 60 * 2, exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendRequest("pulse").then((a) => {
                wolframStatusBar.color = "red";
                setTimeout(() => {
                    wolframStatusBar.color = new vscode.ThemeColor("statusBar.foreground");
                }, 1000 * 30);
                (0, path_1.resolve)("true");
            })).then((a) => {
                setTimeout(pulse, 1000 * 60 * 2);
            }).catch(error => {
                console.log(error);
                outputChannel.appendLine("The Wolfram kernel has not responded in >2 minutes");
            });
        }
        // pulseInterval = setInterval(ping, 60000)
    });
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
    return __awaiter(this, void 0, void 0, function* () {
        params["result"].forEach((e) => {
            if (!(e["location"]["uri"] in movePositions)) {
                movePositions[e["location"]["uri"]] = {};
            }
            movePositions[e["location"]["uri"]][e["name"]] = e;
        });
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
            // evaluationQueue.unshift(evaluationData);
            sendToWolfram(printOutput);
            return;
        });
    }
    if (evaluationQueue.length == 1) {
        sendToWolfram(printOutput);
    }
}
function getUpdateVarTable() {
    var _a;
    let e = vscode.window.activeTextEditor;
    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("updateVarTable", { textDocument: e === null || e === void 0 ? void 0 : e.document });
    (_a = plotsProvider._view) === null || _a === void 0 ? void 0 : _a.show(true);
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
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
let cursorMoved = false;
let cursorLocations = [];
function moveCursor(selection) {
    return __awaiter(this, void 0, void 0, function* () {
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
            // if the outputposition is equal to the lineCount and the last line is not empty, add a new line
            if ((e === null || e === void 0 ? void 0 : e.document.lineCount) == (outputPosition.line) && (e === null || e === void 0 ? void 0 : e.document.lineAt(outputPosition.line - 1).text) != "") {
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
    });
}
function decorateRunningLine(outputPosition) {
    var _a, _b, _c, _d;
    let e = vscode.window.activeTextEditor;
    if (e) {
        if (outputPosition.line == 0) {
            return;
        }
        let decorationLine = e.document.lineAt(outputPosition.line - 1);
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
        e.setDecorations(runningDecorationType, Array.from(runningLines.values()));
        for (let i = 0; i < ((_a = editorDecorations.get(e.document.uri.toString())) !== null && _a !== void 0 ? _a : []).length; i++) {
            const d1 = ((_b = editorDecorations.get(e.document.uri.toString())) !== null && _b !== void 0 ? _b : [])[i];
            if (d1.range.start.line == d.range.start.line) {
                ((_c = editorDecorations.get(e.document.uri.toString())) !== null && _c !== void 0 ? _c : []).splice(i, 1);
            }
        }
        e.setDecorations(variableDecorationType, ((_d = editorDecorations.get(e.document.uri.toString())) !== null && _d !== void 0 ? _d : []));
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
    sendToWolfram(printOutput);
    // if (evaluationQueue.length == 1) {
    //     sendToWolfram(printOutput);
    // }
}
let evaluationQueue = [];
let sendToWolframRetry = 0;
function sendToWolfram(printOutput = false, sel = undefined) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        let e = vscode.window.activeTextEditor;
        if (!sel) {
            sel = e.selection;
        }
        ;
        let outputPosition = new vscode.Position(sel.active.line, 0);
        if (((_a = plotsProvider._view) === null || _a === void 0 ? void 0 : _a.visible) == false || ((_b = plotsProvider._view) === null || _b === void 0 ? void 0 : _b.visible) == undefined) {
            vscode.commands.executeCommand('wolfram.plotsView.focus', { preserveFocus: true });
        }
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
        if ((e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'file' || (e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'untitled') {
            // e.selection = new vscode.Selection(outputPosition, outputPosition);
            // e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            // wolframKernelClient.sendNotification("moveCursor", {range:sel, textDocument:e.document});
            // if (!wolframBusyQ) {
            if (true) {
                if (evaluationQueue.length == 0) {
                    return;
                }
                let evalNext = evaluationQueue.pop();
                starttime = Date.now();
                // console.log(wolframKernelClient?.state)
                // outputChannel.appendLine("Sending to Wolfram: " + evalNext["textDocument"]["uri"]["path"])
                // outputChannel.appendLine("Wolfram Kernel State: " + wolframKernelClient?.state)
                if ((exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state) == node_1.State.Running) {
                    // console.log("Kernel running, sending to Wolfram")
                    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("runInWolfram", evalNext).then((result) => {
                    }).catch((err) => {
                        console.log("Error in runInWolfram");
                        // restart()
                    });
                    return;
                }
                else {
                    // outputChannel.appendLine("Kernel not running, waiting for kernel to start");
                    try {
                        yield launch.stopKernel();
                    }
                    catch (e) { }
                    // outputChannel.appendLine("Kernel stopped. Starting a new kernel");
                    yield launch.startWLSPKernelSocket(0, kernelPath).then((client) => {
                        outputChannel.appendLine("Kernel started after not running");
                        exports.wolframKernelClient = client;
                        onkernelReady().then(() => __awaiter(this, void 0, void 0, function* () {
                            // await sendToWolfram(printOutput, sel);
                            exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("runInWolfram", evalNext).then((result) => {
                            }).catch((err) => {
                                console.log("Error in runInWolfram after kernel relaunch");
                                // restart()
                            });
                        }));
                        return;
                    });
                }
            }
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
            return;
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
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
let evaluationResults = {};
let now = Date.now();
function onRunInWolfram(file) {
    return __awaiter(this, void 0, void 0, function* () {
        let end = Date.now();
        let start = Date.now();
        outputChannel.appendLine(`Execution time: ${end - start} ms`);
        // wolframBusyQ = false;
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();
        let result;
        // try {
        //     result = bson.deserialize(fs.readFileSync(file["file"]), {encoding: null})
        // }
        if (Object.keys(file).includes("output")) {
            result = {
                "method": "onRunInWolfram",
                "params": file
            };
            // setDecorations(result);
            const editors = vscode.window.visibleTextEditors;
            let e = editors.filter((e) => {
                return e.document.uri.path === result["params"]["document"]["path"];
            })[0];
            if (e.document.uri.scheme == 'vscode-notebook-cell') {
            }
            else {
                // inputs.push(file["input"])
                now = Date.now();
                updateResults(e, result, result["params"]["print"], file["input"], file);
            }
            if (evaluationQueue.length > 0) {
                sendToWolfram();
            }
            else {
                exports.treeDataProvider.refresh();
            }
            return;
        }
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
            setDecorations(result);
        }));
        // try{
        //     result = JSON.parse(fs.readFileSync(file["file"], "utf8"))["params"];
        // } catch {
        //     return
        // }
    });
}
let maxPrintResults = 20;
let printResults = [];
let editorDecorations = new Map();
// let printResults: Map<string, string> = new Map();
function onResult(result) {
    // console.log(result)
}
function updateInputs(params) {
    plotsProvider.newInput(params["input"]);
}
function updateResults(e, result, print, input = "", file = "") {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof (e) !== "undefined") {
            e.edit(editBuilder => {
                var _a, _b, _c, _d;
                let output;
                let rawoutput;
                now = Date.now();
                if (result["params"]["load"]) {
                    output = `${fs.readFileSync(result["params"]["output"]).toString()}`;
                    outputChannel.appendLine("Time to read file: " + (Date.now() - now) + " ms");
                    if (output === '') {
                        output = " ";
                    }
                    rawoutput = output;
                }
                else {
                    // output = result["params"]["output"] + "<br>" + file["file"] +"<br>" +  result["params"]["messages"].join("<br>");
                    // output = `${result["params"]["output"]}` + "<br>" + file["file"] + "<br>" + result["params"]["messages"].join("<br>");
                    output = `${result["params"]["output"]}`;
                    rawoutput = output;
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
                // if (output.length > 2000 && !output.includes("<img")) {
                //     outputSnippet = output.slice(0, 500) + " ... " + output.slice(-500);
                // }
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
                let resultString = result["params"]["time"].toString().slice(0, 5) + " s: " + rawoutput;
                if (resultString.length > 300) {
                    resultString = resultString.slice(0, 100) + "..." + resultString.slice(-100);
                }
                let nextline = result["params"]["position"]["line"] - 1;
                if (nextline >= e.document.lineCount) {
                    nextline = e.document.lineCount - 1;
                }
                let startChar = e.document.lineAt(nextline).range.end.character;
                plotsProvider.newOutput(outputSnippet);
                outputChannel.appendLine("Time to update plots: " + (Date.now() - now) + " ms");
                if (print) {
                    let sel = e.selection;
                    let outputPosition = new vscode.Position(result["params"]["position"]["line"] + 1, 0);
                    try {
                        editBuilder.insert(outputPosition, (rawoutput + "\n\n").slice(0, 8192));
                    }
                    catch (error) {
                        console.log("Error: " + error);
                    }
                }
                let decoration = {
                    "range": new vscode.Range(nextline, startChar + 10, nextline, startChar + 200),
                    "renderOptions": {
                        "after": {
                            "contentText": " " + result["params"]["decoration"],
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
                outputChannel.appendLine("Time to update decorations: " + (Date.now() - now) + " ms");
            });
        }
        ;
    });
}
function runExpression(expression, line, end) {
    let e = (vscode.window.activeTextEditor == null) ? vscode.window.visibleTextEditors[0] : vscode.window.activeTextEditor;
    decorateRunningLine(new vscode.Position(line, end));
    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendRequest("runExpression", { print: false, expression: expression, textDocument: e === null || e === void 0 ? void 0 : e.document, line: line, end: end }).then((result) => { });
}
let wolframBusyQ = false;
function wolframBusy(params) {
    let outputPosition = new vscode.Position(0, 0);
    if (params.position) {
        outputPosition = new vscode.Position(params.position.line - 1, params.position.character);
        let e = vscode.window.activeTextEditor;
        if (e) {
            let decorationLine = e.document.lineAt(outputPosition.line - 1);
            let start = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 10);
            let end = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 20);
            let range = new vscode.Range(start, end);
            let d = {
                "range": range,
                "renderOptions": {
                    "after": {
                        "contentText": params.text,
                        "color": "foreground",
                        "margin": "20px"
                    }
                }
            };
            runningLines.set(range, d);
        }
    }
    ;
    if (params.busy === true) {
        //kernelStatusBar.color = "red";
        wolframBusyQ = true;
        wolframStatusBar.text = "$(extensions-sync-enabled~spin) Running (" + (outputPosition.line) + ")";
        wolframStatusBar.show();
        exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification("onRunInWolfram", (result) => {
            onRunInWolfram(result);
        });
        exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification("onRunInWolframIO", (result) => {
            onRunInWolframIO(result);
        });
        // progressStatus = vscode.window.withProgress({
        //     location: vscode.ProgressLocation.Notification,
        //     title: "Running line " + (outputPosition.line) + " in Wolfram",
        //     cancellable: true
        // }, (prog, withProgressCancellation) => {
        //     return new Promise((resolve, reject) => {
        //         // withProgressCancellation = new vscode.CancellationTokenSource();
        //         withProgressCancellation.onCancellationRequested(ev => {
        //             console.log("Aborting Wolfram evaluation");
        //             // withProgressCancellation?.dispose();
        //             // stopWolfram(undefined, wolframKernel);
        //             let notification = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
        //             notification.text = "$(alert) Wolfram evaluation aborted";
        //             setTimeout(() => {
        //                 notification.dispose();
        //             }, 2000);
        //             // progressStatus.dispose();
        //             restartKernel();
        //             resolve(false)
        //         })
        //         wolframKernelClient?.onNotification("onRunInWolfram", (result: any) => {
        //             onRunInWolfram(result)
        //             resolve(true)
        //         })
        //         wolframKernelClient?.onNotification("onRunInWolframIO", (result: any) => {
        //             onRunInWolframIO(result)
        //             resolve(true);
        //         })
        //     }).catch((err) => {
        //         console.log("Error in sendToWolfram")
        //         console.log(err);
        //         restart()
        //     })
        // })
    }
    else {
        //kernelStatusBar.color = "yellow";
        wolframBusyQ = false;
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();
        // clear running line decorations
        let editor = vscode.window.activeTextEditor;
        editor === null || editor === void 0 ? void 0 : editor.setDecorations(runningDecorationType, []);
        runningLines.clear();
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
// 
function delay(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => { setTimeout(resolve, ms); });
    });
}
function connectKernelClient(outputChannel, context) {
}
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
    return __awaiter(this, void 0, void 0, function* () {
        let editor = vscode.window.activeTextEditor;
        // return if the file is not a wolfram file or untitled 
        if ((editor === null || editor === void 0 ? void 0 : editor.document.languageId) !== "wolfram" || (editor === null || editor === void 0 ? void 0 : editor.document.uri.scheme) === 'untitled') {
            return;
        }
        let cursorBlock0 = yield cursorBlock();
        if (cursorBlock0 === undefined) {
            return;
        }
        editor === null || editor === void 0 ? void 0 : editor.setDecorations(blockDecorationType, []);
        let d = {
            "range": new vscode.Range(cursorBlock0.start.line, 0, cursorBlock0.end.line, cursorBlock0.end.character)
        };
        editor === null || editor === void 0 ? void 0 : editor.setDecorations(blockDecorationType, [d]);
    });
}
function didChangeTextDocument(event) {
    return __awaiter(this, void 0, void 0, function* () {
        // didOpenTextDocument(event.document);
        // remove old decorations
        // console.log(event)
        // return new Promise((resolve) => {
        //     resolve()
        // });
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
//# sourceMappingURL=clients.js.map