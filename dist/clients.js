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
exports.deactivate = exports.onkernelReady = exports.stop = exports.restart = exports.startLanguageServer = exports.treeDataProvider = exports.notebookcontroller = exports.notebookSerializer = exports.scriptserializer = exports.wolframSymbolClient = exports.wolframKernelClient = exports.wolframClient = exports.wolframSymbols = exports.wolframKernel = exports.wolfram = void 0;
const vscode = require("vscode");
const path = require("path");
const fp = require('find-free-port');
const cp = require("child_process");
const psTree = require('ps-tree');
const node_1 = require("vscode-LanguageClient/node");
let wolframStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
let wolframVersionText = "$(extensions-sync-enabled~spin) Wolfram";
const fs = require('fs');
const notebook_1 = require("./notebook");
const notebookController_1 = require("./notebookController");
const treeDataProvider_1 = require("./treeDataProvider");
const dataPanel_1 = require("./dataPanel");
const plotsView_1 = require("./plotsView");
// export let wolframClient: LanguageClient;
// export let wolframKernelClient: LanguageClient;
// let wolfram: cp.ChildProcess;
// let wolframKernel: cp.ChildProcess;
let clientPort = 7710;
let symbolPort = 7810;
let kernelPort = 7910;
let lspPath;
let kernelPath;
let symbolsPath;
let context;
let outputChannel;
let clients = new Map();
let processes = [];
let runtime = vscode.workspace.getConfiguration().get("wlsp.runtime");
// runtime = "/Applications/Mathematica.app/Contents/MacOS/MathKernel"
function startLanguageServer(context0, outputChannel0) {
    return __awaiter(this, void 0, void 0, function* () {
        context = context0;
        lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
        kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
        symbolsPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-symbols.wl'));
        outputChannel = outputChannel0;
        wolframStatusBar.text = "Wolfram ?";
        wolframStatusBar.command = 'wolfram.restart';
        wolframStatusBar.show();
        vscode.workspace.onDidChangeTextDocument(didChangeTextDocument);
        // scriptserializer = new WolframScriptSerializer()
        exports.notebookSerializer = new notebook_1.WolframNotebookSerializer();
        exports.notebookcontroller = new notebookController_1.WolframNotebookController(context);
        // scriptController = new WolframScriptController(context)
        context.subscriptions.push(vscode.workspace.registerNotebookSerializer('wolfram-notebook', exports.notebookSerializer));
        context.subscriptions.push(vscode.workspace.registerNotebookSerializer('wolfram-script', exports.scriptserializer));
        context.subscriptions.push(exports.notebookcontroller);
        // context.subscriptions.push(scriptController);
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification("updatePositions", updatePositions);
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification("updateLintDecorations", updateLintDecorations);
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification("onRunInWolfram", onRunInWolfram);
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification("updateDecorations", updateDecorations);
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification("wolframBusy", wolframBusy);
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification("updateVarTable", updateVarTable);
        // wolframKernelClient?.onNotification("onRunInWolfram", onRunInWolfram);
        // wolframKernelClient?.onNotification("wolframBusy", wolframBusy);
        // wolframKernelClient?.onNotification("updateDecorations", updateDecorations);
        // wolframKernelClient?.onNotification("updateVarTable", updateVarTable);
        // wolframKernelClient?.onNotification("moveCursor", moveCursor);
        // wolframKernelClient?.onNotification("updateTreeItems", updateTreeItems);
        exports.treeDataProvider = new treeDataProvider_1.workspaceSymbolProvider();
        vscode.window.registerTreeDataProvider("wolframSymbols", exports.treeDataProvider);
        startWLSP(0);
        // startWLSPKernel(0);
        // startWLSPSymbol(0);
        vscode.commands.registerCommand('wolfram.runInWolfram', runInWolfram);
        vscode.commands.registerCommand('wolfram.printInWolfram', printInWolfram);
        vscode.commands.registerCommand('wolfram.runTextCell', runTextCell);
        vscode.commands.registerCommand('wolfram.wolframTerminal', startWolframTerminal);
        vscode.commands.registerCommand('wolfram.runInTerminal', runInTerminal);
        vscode.commands.registerCommand('wolfram.help', help);
        vscode.commands.registerCommand('wolfram.stringHelp', stringHelp);
        vscode.commands.registerCommand('wolfram.restart', restart);
        vscode.commands.registerCommand('wolfram.abort', abort);
        vscode.commands.registerCommand('wolfram.textToSection', textToSection);
        vscode.commands.registerCommand('wolfram.textFromSection', textFromSection);
        vscode.commands.registerCommand('wolfram.createFile', createFile);
        vscode.commands.registerCommand('wolfram.createNotebook', createNotebook);
        vscode.commands.registerCommand('wolfram.createNotebookScript', createNotebookScript);
        vscode.commands.registerCommand('wolfram.showOutput', showOutput);
        vscode.commands.registerCommand('wolfram.showPlots', showPlots);
        vscode.commands.registerCommand('wolfram.runExpression', runExpression);
        vscode.commands.registerCommand('wolfram.clearResults', clearResults);
        vscode.commands.registerCommand('wolfram.showTrace', showTrace);
        vscode.commands.registerCommand('wolfram.newNotebook', createNotebook);
        vscode.workspace.onDidOpenTextDocument(didOpenTextDocument);
        vscode.workspace.onDidSaveTextDocument(didSaveTextDocument);
        // vscode.window.onDidChangeWindowState(didChangeWindowState);
        vscode.workspace.onDidChangeConfiguration(updateConfiguration);
        vscode.workspace.textDocuments.forEach(didOpenTextDocument);
        // vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        // 	for (const folder  of event.removed) {
        // 		const client = clients.get(folder.uri.toString());
        // 		if (client) {
        // 			clients.delete(folder.uri.toString());
        // 			client[0]?.stop();
        //             client[1]?.stop();
        //             client[2]?.stop();
        // 		}
        // 	}
        //     for (const folder of event.added) {
        //         const client = clients.get(folder.uri.toString());
        //         if (client) {
        //             client[1]?.sendNotification("didChangeWorkspaceFolders", folder)
        //         }
        //     }
        // });
        // setTimeout(updateRunningLines, 500);
        // restart()
    });
}
exports.startLanguageServer = startLanguageServer;
function updateConfiguration() {
    if (vscode.workspace.getConfiguration().get("wlsp.liveDocument")) {
    }
}
function restart() {
    return __awaiter(this, void 0, void 0, function* () {
        wolframBusyQ = false;
        evaluationQueue = [];
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.stop();
        exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.stop();
        exports.wolframSymbolClient === null || exports.wolframSymbolClient === void 0 ? void 0 : exports.wolframSymbolClient.stop();
        startWLSP(0);
        return new Promise((resolve) => {
            vscode.workspace.textDocuments.forEach(didOpenTextDocument);
            resolve();
        });
    });
}
exports.restart = restart;
function stop() {
    exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendNotification("shutdown");
    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("shutdown");
    exports.wolframSymbolClient === null || exports.wolframSymbolClient === void 0 ? void 0 : exports.wolframSymbolClient.sendNotification("shutdown");
    // wolframClient?.stop();
    // wolframKernelClient?.stop();
    // wolframSymbolClient?.stop();
    return;
}
exports.stop = stop;
function onclientReady() {
    return __awaiter(this, void 0, void 0, function* () {
        function checkClient(cb) {
            if (exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.isRunning()) {
                exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification("updatePositions", updatePositions);
                exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification("updateLintDecorations", updateLintDecorations);
                exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendRequest("wolframVersion").then((result) => {
                    wolframVersionText = result["output"];
                    wolframStatusBar.text = result["output"];
                });
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
            if (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.isRunning()) {
                // if (vscode.window.activeTextEditor){
                //     let workspacefolder:any = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor?.document.uri)
                //     if (workspacefolder) {
                //          vscode.workspace.findFiles("**/*.wl*", workspacefolder.uri).then(result => {
                //             wolframKernelClient?.sendNotification("didChangeWorkspaceFolders", result)
                //         })
                //     }
                // }
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendRequest("storageUri").then((result) => {
                    temporaryDir = result;
                });
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
function clearResults() {
    // while(printResults.pop) {
    // }
    printResults = [];
    updateOutputPanel();
}
function updateTreeItems(result) {
    exports.treeDataProvider === null || exports.treeDataProvider === void 0 ? void 0 : exports.treeDataProvider.getSymbols(result["file"]);
}
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
    e.revealRange(r, vscode.TextEditorRevealType.Default);
    try {
        exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendRequest("runInWolfram", { range: r, textDocument: e.document, print: false }).then((result) => {
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
        restart();
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
            variableTable[k] = updatedVariables[k];
        });
        updateOutputPanel();
    });
}
let runningLines = [];
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
function moveCursor() {
    if (cursorMoved == true) {
        cursorMoved = false;
        return;
    }
    let e = vscode.window.activeTextEditor;
    let cursorFile = path.join(context.extensionPath, "wolfram", "cursorLocations.js");
    fs.readFile(cursorFile, "utf8", (err, data) => {
        if (err) {
            console.log(err);
            return;
        }
        let cursorLocations = JSON.parse(data);
        let top = new vscode.Position(0, 0);
        let bottom = ((e === null || e === void 0 ? void 0 : e.selection.active.line) || 0) + 1;
        for (let i = 0; i < cursorLocations.length; i++) {
            if (e) {
                if (cursorLocations[i + 1]["start"]["line"] > (e === null || e === void 0 ? void 0 : e.selection.active.line)) {
                    top = cursorLocations[i]["end"];
                    bottom = cursorLocations[i + 1]["start"]["line"];
                    break;
                }
            }
        }
        let outputPosition = new vscode.Position(bottom, 0);
        if ((e === null || e === void 0 ? void 0 : e.document.lineCount) == outputPosition.line) {
            e === null || e === void 0 ? void 0 : e.edit(editBuilder => {
                editBuilder.insert(outputPosition, "\n");
            });
        }
        if (e) {
            e.selection = new vscode.Selection(outputPosition, outputPosition);
            cursorMoved = true;
            e === null || e === void 0 ? void 0 : e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            decorateRunningLine(new vscode.Position(top["line"], top["character"]));
        }
    });
}
function decorateRunningLine(outputPosition) {
    let e = vscode.window.activeTextEditor;
    if (e) {
        let decorationLine = e.document.lineAt(outputPosition.line - 1);
        let start = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character);
        let end = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character);
        let range = new vscode.Range(start, end);
        let d = {
            "range": range,
            "renderOptions": {
                "after": {
                    "contentText": ".",
                    "color": "foreground",
                    "margin": "20px"
                }
            }
        };
        runningLines.push(d);
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
        editor === null || editor === void 0 ? void 0 : editor.setDecorations(runningDecorationType, runningLines);
        setTimeout(updateRunningLines, 500);
    }
    else {
        editor === null || editor === void 0 ? void 0 : editor.setDecorations(runningDecorationType, []);
    }
}
let starttime = 0;
let inputs = [];
let cursorMoved = false;
function runInWolfram(print = false, trace = false) {
    let e = vscode.window.activeTextEditor;
    let sel = e.selection;
    vscode.window.onDidChangeTextEditorSelection((e) => {
        cursorMoved = true;
    });
    cursorMoved = false;
    moveCursor();
    // wolframClient?.sendRequest("moveCursor", { range: sel, textDocument: e?.document }).then((result:any) => {
    //     if (
    //         ((sel.active.line + 1) === e!.selection.active.line) &&
    //         e!.selection.active.character === 0) {
    //             moveCursor(result)
    //     }
    // });
    let evaluationData = { range: sel, textDocument: e === null || e === void 0 ? void 0 : e.document, print: print, trace };
    evaluationQueue.push(evaluationData);
    // showPlots();
    if (!exports.wolframClient) {
        restart().then(() => {
            evaluationQueue.push(evaluationData);
            sendToWolfram(print);
            return;
        });
    }
    if (evaluationQueue.length == 1 || wolframBusyQ == false) {
        sendToWolfram(print);
    }
}
let evaluationQueue = [];
function sendToWolfram(print = false, sel = undefined) {
    return __awaiter(this, void 0, void 0, function* () {
        let e = vscode.window.activeTextEditor;
        if (!sel) {
            sel = e.selection;
        }
        ;
        if ((e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'vscode-notebook-cell') {
            e.selection = new vscode.Selection(0, 0, 1, 1);
            try {
                starttime = Date.now();
                // wolframKernelClient?.sendNotification("runInWolfram", { range: sel, textDocument: e.document, print: false });
                exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendNotification("runInWolfram", { range: sel, textDocument: e.document, print: false });
            }
            catch (err) {
                console.log(err);
                restart();
            }
        }
        else if ((e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'file' || (e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'untitled') {
            // e.selection = new vscode.Selection(outputPosition, outputPosition);
            // e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            // wolframKernelClient.sendNotification("moveCursor", {range:sel, textDocument:e.document});
            if (!wolframBusyQ) {
                wolframBusyQ = true;
                wolframStatusBar.text = "$(extensions-sync-enabled~spin) Wolfram Running";
                wolframStatusBar.show();
                starttime = Date.now();
                exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendNotification("runInWolfram", evaluationQueue.shift());
            }
        }
    });
}
let evaluationResults = {};
function onRunInWolfram(file) {
    let end = Date.now();
    outputChannel.appendLine(`Execution time: ${end - starttime} ms`);
    wolframBusyQ = false;
    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.show();
    let result;
    if (evaluationQueue.length > 0) {
        sendToWolfram();
    }
    fs.readFile(file["file"], "utf8", ((err, data) => {
        if (err) {
            outputChannel.appendLine(err);
            return;
        }
        try {
            result = JSON.parse(data);
            let editors = vscode.window.visibleTextEditors;
            let e = editors.filter((e) => {
                return e.document.uri.path === result["params"]["document"]["path"];
            })[0];
            if (runningLines.length > 0) {
                runningLines.pop();
            }
            if (e.document.uri.scheme == 'vscode-notebook-cell') {
            }
            else {
                // inputs.push(file["input"])
                updateResults(e, result, result["params"]["print"], file["input"]);
            }
        }
        catch (err) {
            outputChannel.appendLine("Output data error: " + err);
        }
        exports.treeDataProvider.refresh();
    }));
    // try{
    //     result = JSON.parse(fs.readFileSync(file["file"], "utf8"))["params"];
    // } catch {
    //     return
    // }
}
let maxPrintResults = 20;
let printResults = [];
// let printResults: Map<string, string> = new Map();
function updateResults(e, result, print, input = "") {
    if (printResults.length > maxPrintResults) {
        printResults.shift();
    }
    if (typeof (e) !== "undefined") {
        e.edit(editBuilder => {
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
            fs.readFile(result["params"]["output"].substring(1, result["params"]["output"].length), "utf8", (err, data) => {
                if (err) {
                    outputChannel.appendLine(err);
                    return;
                }
                let output = data;
                printResults.push([input,
                    output]);
                if (output.includes("<img")) {
                }
                else {
                    outputChannel.appendLine(output.slice(0, 8192));
                }
                // let out = console_outputs.pop();
                // printResults.push(out);
                // showOutput();
            });
            // let output = fs.readFileSync(result["output"].toString(), 'utf8');
        });
    }
    ;
    updateOutputPanel();
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
        outputPanel = vscode.window.createWebviewPanel('WolframOutput', "Wolfram Data Table", { viewColumn: 2, preserveFocus: true }, {
            enableScripts: true
        });
        outputPanel.webview.html = dataPanel_1.getOutputContent(outputPanel.webview, context.extensionUri);
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
let plotsPanel;
function showPlots() {
    var _a;
    let outputColumn = (_a = vscode.window.activeTextEditor) === null || _a === void 0 ? void 0 : _a.viewColumn;
    //let out = "<table id='outputs'>";
    if (plotsPanel) {
        if (!plotsPanel.visible) {
            if (outputColumn) {
                plotsPanel.reveal(outputColumn + 1, true);
            }
            else {
                plotsPanel.reveal(1, true);
            }
        }
    }
    else {
        plotsPanel = vscode.window.createWebviewPanel('WolframPlots', "Wolfram Plots", { viewColumn: 2, preserveFocus: true }, {
            localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "media")), vscode.Uri.file(path.join(context.extensionPath, 'wolfram')), vscode.Uri.file(temporaryDir)],
            enableScripts: true,
            retainContextWhenHidden: true
        });
        plotsPanel.webview.html = plotsView_1.showPlotPanel(plotsPanel.webview, context.extensionUri);
        plotsPanel.webview.onDidReceiveMessage(message => {
            runExpression(message.text, 0, 100);
            return;
        }, undefined, context.subscriptions);
        plotsPanel.onDidDispose(() => {
            plotsPanel = undefined;
        }, null);
        updateOutputPanel();
    }
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
    }
    else {
        //kernelStatusBar.color = "yellow";
        wolframBusyQ = false;
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();
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
                    editorDecorations.push(workspaceDecorations[uri][d]);
                });
                runningLines = [];
                editor.setDecorations(variableDecorationType, editorDecorations);
                editor.setDecorations(runningDecorationType, runningLines);
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
                runningLines = [];
                editor.setDecorations(lintDecorationType, editorLintDecorations);
                editor.setDecorations(runningDecorationType, runningLines);
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
    backgroundColor: 'none',
    light: {
        color: new vscode.ThemeColor("foreground")
    },
    dark: {
        color: new vscode.ThemeColor("foreground")
    },
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
function updateOutputPanel() {
    let out = "";
    printResults.forEach((row) => {
        let data = "";
        try {
            data += row[1];
        }
        catch (e) {
            console.log(e.message);
            data += "Error reading result";
        }
        if (data !== "") {
            out += "<div id='result-header'>In: " +
                row[0].substring(0, 1000) +
                "</div>" +
                "<div id='result'>" +
                data +
                "</div>";
        }
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
    outputPanel === null || outputPanel === void 0 ? void 0 : outputPanel.webview.postMessage({ text: out, vars: (vars) });
    plotsPanel === null || plotsPanel === void 0 ? void 0 : plotsPanel.webview.postMessage({ text: out, vars: (vars) });
}
let console_outputs = [];
let socketsClosed = 0;
class errorHandler {
    // error: ErrorHandlerResult | undefined;
    constructor() {
        this.message = "";
        this.count = 0;
    }
    error(error, message, count) {
        console.log(message === null || message === void 0 ? void 0 : message.jsonrpc.toString());
        return {
            action: 1
        };
    }
    closed() {
        return {
            action: 2
        };
    }
}
function startWLSP(id) {
    let timeout;
    fp(clientPort + id).then(([freePort]) => { clientPort = freePort; return clientPort; });
    let serverOptions = {
        command: runtime,
        // module: "",
        transport: {
            kind: node_1.TransportKind.socket,
            port: clientPort
        },
        args: ['-noprompt', '-file', path.join(context.extensionPath, "wolfram", "wolfram-lsp.wl"), clientPort.toString(), path.join(context.extensionPath, "wolfram", "wolfram-lsp.wl")],
        options: {
            shell: true,
            detached: true
        }
    };
    let clientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel,
        errorHandler: new errorHandler
    };
    return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
        exports.wolframClient = new node_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
        yield exports.wolframClient.start().then((result) => {
            outputChannel.appendLine("Wolfram Language Server started");
            exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendRequest("wolframVersion").then((result) => {
                wolframVersionText = result["output"];
                wolframStatusBar.text = result["output"];
            });
            // resolve(onclientReady());
            // startWLSPKernel(0);
        });
        resolve();
    }));
}
function startWLSPKernel(id) {
    return __awaiter(this, void 0, void 0, function* () {
        let timeout;
        yield fp(kernelPort + id).then(([freePort]) => { kernelPort = freePort; return kernelPort; });
        let serverOptions = {
            command: runtime,
            // module: "",
            transport: {
                kind: node_1.TransportKind.socket,
                port: kernelPort
            },
            args: ['-file', path.join(context.extensionPath, "wolfram", "wolfram-kernel.wl"), kernelPort.toString(), path.join(context.extensionPath, "wolfram", "wolfram-kernel.wl")],
            options: {
                shell: false,
                detached: true
            }
        };
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            diagnosticCollectionName: 'wolfram-lsp',
            outputChannel: outputChannel,
            markdown: {
                isTrusted: true,
                supportHtml: true
            },
            errorHandler: new errorHandler
        };
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            exports.wolframKernelClient = new node_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
            // wolframKernelClient.onReady().then(() => {
            //     onkernelReady();
            // })
            yield (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.start().then((result) => {
                startWLSPSymbol(0);
            }));
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
            var _a, _b, _c;
            let executablePath = vscode.workspace.getConfiguration('wolfram').get('executablePath') || "wolframscript";
            try {
                if (process.platform === "win32") {
                    wolfram = cp.spawn('cmd.exe', ['/c', executablePath === null || executablePath === void 0 ? void 0 : executablePath.toString(), '-file', path, port.toString(), path], { detached: false });
                }
                else {
                    wolfram = cp.spawn(executablePath === null || executablePath === void 0 ? void 0 : executablePath.toString(), ['-file', path, port.toString(), path], { detached: true });
                }
                (_a = wolfram.stdout) === null || _a === void 0 ? void 0 : _a.once('data', (data) => {
                    outputChannel.appendLine("WLSP: " + data.toString());
                    resolve(wolfram);
                });
                if (wolfram.pid != undefined) {
                    console.log("Launching wolframscript: " + wolfram.pid.toString());
                    processes.push(wolfram);
                }
                else {
                    console.log("Launching wolframscript: pid unknown");
                }
                wolfram.on('SIGPIPE', (data) => {
                    console.log("SIGPIPE");
                });
                (_b = wolfram.stdout) === null || _b === void 0 ? void 0 : _b.on('error', (data) => {
                    console.log("STDOUT Error" + data.toString());
                });
                (_c = wolfram.stdout) === null || _c === void 0 ? void 0 : _c.on('data', (data) => {
                    outputChannel.appendLine("WLSP: " + data.toString());
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
    let sel = new vscode.Selection(new vscode.Position(location.start.line, location.start.character), new vscode.Position(location.end.line, location.end.character));
    let evaluationData = { range: sel, textDocument: e === null || e === void 0 ? void 0 : e.document, print: false };
    evaluationQueue.push(evaluationData);
    sendToWolfram(false);
}
function printInWolfram(print = true) {
    runInWolfram(print);
}
function didChangeTextDocument(event) {
    // didOpenTextDocument(event.document);
    // remove old decorations
    let editor = vscode.window.activeTextEditor;
    if (event.document.uri.toString() !== (editor === null || editor === void 0 ? void 0 : editor.document.uri.toString())) {
        return;
    }
    clearDecorations();
    if (vscode.workspace.getConfiguration().get("wlsp.liveDocument")) {
        let doc = editor === null || editor === void 0 ? void 0 : editor.document;
        if (exports.wolframKernelClient) {
            exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("runDocumentLive", doc === null || doc === void 0 ? void 0 : doc.uri);
        }
        return;
    }
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
        // live document
        editor.setDecorations(variableDecorationType, decorations);
    }
    return;
}
function isUntitled(document) {
    return (document.languageId === "wolfram" && document.uri.scheme === 'untitled');
}
let totalClients = 0;
function didOpenTextDocument(document) {
    return;
}
function didSaveTextDocument(event) {
    exports.treeDataProvider.refresh();
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
    return __awaiter(this, void 0, void 0, function* () {
        // let content:string = `{"cells":[{"cell_type":"code","execution_count":null,"metadata":{},"outputs":[],"source":[]}],"metadata":{"file_extension":".wlnb","kernelspec":{"display_name":"Wolfram Language","language":"wolfram","name":"wolfram"},"language_info":{"codemirror_mode":{"name":"ipython","version":"4.0.0"}},"mimetype":"text/x-wolfram","name":"Wolfram Language","nbconvert_exporter":"python","nbformat":4,"pygments_lexer":"ipython4","version":"4.0.0"},"nbformat":4,"nbformat_minor":0,"vscode":{"interpreter":{"hash":""}}}
        // `
        // let encoded = new TextEncoder().encode(content);
        // let nbData = await notebookSerializer.deserializeNotebook(encoded, new vscode.CancellationTokenSource().token);
        vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse("untitled:.wlnb"), "wolfram");
        // notebookSerializer.deserializeNotebook(vscode.Uri.parse("untitled:.wlnb"), null).then((document: vscode.NotebookData) => { 
        //     vscode.note
        // });
    });
}
function createNotebookScript() {
    vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.wls")).then((document) => {
        // vscode.window.showNotebookDocument(document);
    });
}
function didChangeWindowState(state) {
    if (!(exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.isRunning())) {
        if (state.focused === true) {
            exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendNotification("windowFocused", true);
        }
        else {
            exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendNotification("windowFocused", false);
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
    exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendNotification("abort");
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
function addJupyterkernel() {
    if (process.platform == "win32") {
        cp.spawn("cmd.exe", [
            '/c',
            path.join(context.extensionPath, "wolfram", "jupyter", "configure-jupyter.wls"),
            'add'
        ], { detached: false });
    }
    else {
        cp.spawn(path.join(context.extensionPath, "wolfram", "jupyter", "configure-jupyter.wls"), [
            "add"
        ], { detached: false });
    }
    vscode.window.showInformationMessage("Attempted to install the WLSP kernel.");
}
function showTrace() {
    runInWolfram(false, true);
}
function startWLSPSymbol(id) {
    return __awaiter(this, void 0, void 0, function* () {
        let timeout;
        yield fp(symbolPort + id).then(([freePort]) => { symbolPort = freePort; return symbolPort; });
        let serverOptions = {
            command: runtime,
            // module: "",
            transport: {
                kind: node_1.TransportKind.socket,
                port: symbolPort
            },
            args: ['-file', path.join(context.extensionPath, "wolfram", "wolfram-symbols.wl"), symbolPort.toString(), path.join(context.extensionPath, "wolfram", "wolfram-symbols.wl")],
            options: {}
        };
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            diagnosticCollectionName: 'wolfram-lsp',
            outputChannel: outputChannel,
            errorHandler: new errorHandler
        };
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            exports.wolframSymbolClient = new node_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
            yield (exports.wolframSymbolClient === null || exports.wolframSymbolClient === void 0 ? void 0 : exports.wolframSymbolClient.start());
        }));
    });
}
function onsymbolclientReady() {
    function checkClient(cb) {
        if (exports.wolframSymbolClient === null || exports.wolframSymbolClient === void 0 ? void 0 : exports.wolframSymbolClient.isRunning()) {
            cb();
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
}
function deactivate() {
    exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendRequest("shutdown");
    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendRequest("shutdown");
    exports.wolframSymbolClient === null || exports.wolframSymbolClient === void 0 ? void 0 : exports.wolframSymbolClient.sendRequest("shutdown");
    exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.stop();
    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.stop();
    exports.wolframSymbolClient === null || exports.wolframSymbolClient === void 0 ? void 0 : exports.wolframSymbolClient.stop();
}
exports.deactivate = deactivate;
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
//# sourceMappingURL=clients.js.map