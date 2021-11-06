"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInWolfram = exports.printResults = exports.activate = void 0;
const vscode = require("vscode");
const vscode_1 = require("vscode");
const path = require("path");
const fp = require('find-free-port');
const psTree = require('ps-tree');
const notebook_1 = require("./notebook");
const notebookController_1 = require("./notebookController");
const scriptController_1 = require("./scriptController");
const fs = require('fs');
const clients_1 = require("./clients");
let outputChannel = vscode.window.createOutputChannel('wolf-lsp');
let context;
let scriptserializer;
let notebookSerializer;
let notebookcontroller;
let scriptController;
// let kernelStatusBar:vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
let client;
let wolframStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
let wolframVersionText = "$(extensions-sync-enabled~spin) Wolfram";
let treeDataProvider;
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
vscode.commands.registerCommand('wolfram.stringHelp', stringHelp);
vscode.commands.registerCommand('wolfram.restart', restart);
vscode.commands.registerCommand('wolfram.abort', abort);
vscode.commands.registerCommand('wolfram.textToSection', textToSection);
vscode.commands.registerCommand('wolfram.textFromSection', textFromSection);
vscode.commands.registerCommand('wolfram.createFile', createFile);
vscode.commands.registerCommand('wolfram.createNotebook', createNotebook);
vscode.commands.registerCommand('wolfram.createNotebookScript', createNotebookScript);
// function retry(fn:any, retries=5, err=null) {
//     if (!retries) {
//         return Promise.reject(err);
//     }
//     return fn().catch((err:any) => {
//         return retry(fn, (retries - 1), err);
//     });
// }
function check_pulse(client) {
    if (client !== undefined) {
        console.log(client.needsStart());
        if (!client.isConnectionActive()) {
            console.log("Connection is not active. Restarting client");
            restart();
        }
    }
}
class TreeItem extends vscode.TreeItem {
    constructor(label, children) {
        super(label, children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
        this.children = children;
        this.location = "";
    }
}
class workspaceSymbolProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.data = [new TreeItem("Symbols", [])];
        this.getSymbols();
        this.builtins = new TreeItem("Builtins", []);
    }
    getSymbols() {
        clients_1.wolframClient.onReady().then(() => {
            clients_1.wolframClient.sendRequest("symbolList").then((result) => {
                var _a;
                let files = [];
                let workspace_items = result.workspace.map((symbol) => {
                    let item = new TreeItem(symbol.name);
                    item.tooltip = symbol.definition;
                    if ('range' in symbol.location) {
                        item.location = symbol.location.uri;
                        if (!files.some(f => f === item.location)) {
                            files.push(item.location);
                        }
                        item.command = { command: 'editor.action.goToLocations', arguments: [
                                vscode.Uri.parse(symbol.location.uri),
                                new vscode.Position(symbol.location.range.start.line, symbol.location.range.start.character),
                                [],
                                "peek",
                                symbol.name
                            ], title: 'Go to' };
                    }
                    //item.command = {command: 'editor.action.addCommentLine', arguments: [], title: 'Add Comment'};
                    return item;
                });
                let workspace = new TreeItem("Workspace", files.map((file) => {
                    return new TreeItem(file, workspace_items.filter((item) => item.location === file));
                }));
                // get all the letters in the alphabet
                let letters = [];
                for (let i = 65; i < 91; i++) {
                    letters.push(String.fromCharCode(i));
                }
                let builtinsymbols = result.builtins.map((symbol) => {
                    let item = new vscode.TreeItem(symbol.name);
                    item.tooltip = symbol.definition;
                    let e = vscode.window.activeTextEditor;
                    item.command = { command: 'wolfram.stringHelp', arguments: [
                            symbol.name
                        ], title: 'Open' };
                    //item.command = {command: 'editor.action.addCommentLine', arguments: [], title: 'Add Comment'};
                    return item;
                });
                if (((_a = this.builtins.children) === null || _a === void 0 ? void 0 : _a.length) === 0) {
                    this.builtins = new TreeItem("Builtins", letters.map((letter) => {
                        return new TreeItem(letter, builtinsymbols.filter((item) => { var _a; return (_a = item.label) === null || _a === void 0 ? void 0 : _a.toString().startsWith(letter); }));
                    }));
                }
                this.data = [new TreeItem("Symbols", [workspace, this.builtins])];
                this._onDidChangeTreeData.fire();
            });
        });
    }
    refresh() {
        this.getSymbols();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element === undefined) {
            return this.data;
        }
        return element.children;
    }
}
client = new clients_1.Client();
scriptserializer = new notebook_1.WolframScriptSerializer();
notebookSerializer = new notebook_1.WolframNotebookSerializer();
notebookcontroller = new notebookController_1.WolframNotebookController();
scriptController = new scriptController_1.WolframScriptController();
function activate(context0) {
    context = context0;
    let lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
    let kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
    client.start(context, outputChannel).then(() => {
        onkernelReady();
    });
    context.subscriptions.push(vscode.workspace.registerNotebookSerializer('wolfram-notebook', notebookSerializer));
    context.subscriptions.push(vscode.workspace.registerNotebookSerializer('wolfram-script', scriptserializer));
    context.subscriptions.push(notebookcontroller);
    context.subscriptions.push(scriptController);
    vscode.workspace.onWillSaveTextDocument(willsaveDocument);
    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.command = 'wolfram.restart';
    wolframStatusBar.show();
}
exports.activate = activate;
function restart() {
    client.restart(context, outputChannel).then(() => {
        setTimeout(onkernelReady, 2000);
    });
}
function onkernelReady() {
    try {
        if ((clients_1.wolframKernelClient === undefined) || (clients_1.wolframClient === undefined)) {
            setTimeout(onkernelReady, 2000);
            return;
        }
        if (clients_1.wolframKernelClient !== undefined) {
            clients_1.wolframKernelClient.onReady().then(() => {
                console.log("Listening to kernel");
                clients_1.wolframKernelClient.onNotification("onRunInWolfram", onRunInWolfram);
                clients_1.wolframKernelClient.onNotification("wolframBusy", wolframBusy);
                clients_1.wolframKernelClient.onNotification("updateDecorations", updateDecorations);
                clients_1.wolframKernelClient.onNotification("updateVarTable", updateVarTable);
                clients_1.wolframKernelClient.onNotification("moveCursor", moveCursor);
            });
        }
        if (clients_1.wolframClient !== undefined) {
            clients_1.wolframClient.onReady().then(() => {
                clients_1.wolframClient.sendRequest("wolframVersion").then((result) => {
                    wolframStatusBar.text = wolframVersionText = result.output;
                    treeDataProvider = new workspaceSymbolProvider();
                    vscode.window.registerTreeDataProvider('wolframSymbols', treeDataProvider);
                });
            });
        }
    }
    catch (error) {
        setTimeout(onkernelReady, 2000);
    }
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
function willsaveDocument(event) {
    if (event.document.fileName.endsWith(".nb")) {
    }
}
function didOpenTextDocument(document) {
    if (document.languageId !== 'wolfram' || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
        return;
    }
    if (document.languageId === "wolfram") {
        if (clients_1.wolframClient !== undefined) {
            clients_1.wolframClient.onReady().then(ready => {
                clients_1.wolframClient.sendRequest("DocumentSymbolRequest");
            });
        }
    }
    return;
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
function didSaveTextDocument(event) {
    treeDataProvider.refresh();
    didOpenTextDocument(event);
    return;
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
function createFile() {
    vscode.workspace.openTextDocument(vscode.Uri.parse("untitled:.wl")).then((document) => {
        vscode.window.showTextDocument(document);
    });
}
function createNotebook() {
    vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.nb")).then((document) => {
        vscode.window.showNotebookDocument(document);
    });
}
function createNotebookScript() {
    vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.wl")).then((document) => {
        vscode.window.showNotebookDocument(document);
    });
}
exports.printResults = [];
function runInWolfram(print = false) {
    if (clients_1.wolframKernelClient === undefined) {
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
            clients_1.wolframKernelClient.sendNotification("runInWolfram", { range: sel, textDocument: e.document, print: false });
        }
        catch (err) {
            console.log(err);
        }
    }
    else if ((e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'file' || (e === null || e === void 0 ? void 0 : e.document.uri.scheme) === 'untitled') {
        e.selection = new vscode.Selection(outputPosition, outputPosition);
        e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
        // wolframKernelClient.sendNotification("moveCursor", {range:sel, textDocument:e.document});
        clients_1.wolframKernelClient.onReady().then(ready => {
            clients_1.wolframKernelClient.sendNotification("runInWolfram", { range: sel, textDocument: e === null || e === void 0 ? void 0 : e.document, print: print });
        });
    }
}
exports.runInWolfram = runInWolfram;
function onRunInWolfram(result) {
    let editors = vscode.window.visibleTextEditors;
    let e = editors.filter((e) => { return e.document.uri.path === result["document"]["path"]; })[0];
    if (e.document.uri.scheme == 'vscode-notebook-cell') {
    }
    else {
        updateResults(e, result, result["print"]);
    }
}
let variableTable = {};
function updateVarTable(vars) {
    for (let index = 0; index < vars["values"].length; index++) {
        variableTable[vars["values"][index][0]] = vars["values"][index][1].slice(0, 200) + "...";
    }
    updateOutputPanel();
}
let maxPrintResults = 20;
function updateResults(e, result, print) {
    if (exports.printResults.length > maxPrintResults) {
        exports.printResults.shift();
    }
    if (typeof (e) !== "undefined") {
        e.edit(editBuilder => {
            exports.printResults.push(result["output"].toString());
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
function runExpression(expression, line, end) {
    let e = (vscode.window.activeTextEditor == null) ? vscode.window.visibleTextEditors[0] : vscode.window.activeTextEditor;
    clients_1.wolframKernelClient.sendRequest("runExpression", { print: false, expression: expression, textDocument: e === null || e === void 0 ? void 0 : e.document, line: line, end: end }).then((result) => { });
}
function printInWolfram() {
    let print = true;
    runInWolfram(print);
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
function abort() {
    clients_1.wolframClient.sendNotification("abort");
}
function stopWolfram(client, client_process) {
    client.stop();
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
function runToLine() {
    let e = vscode.window.activeTextEditor;
    let sel = e === null || e === void 0 ? void 0 : e.selection.active;
    let outputPosition = new vscode.Position(sel.line + 1, 0);
    let r = new vscode.Selection(0, 0, sel.line, sel.character);
    e.revealRange(r, vscode.TextEditorRevealType.Default);
    try {
        clients_1.wolframKernelClient.sendRequest("runInWolfram", { range: r, textDocument: e.document, print: false }).then((result) => {
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
function didChangeWindowState(state) {
    if (clients_1.wolframClient !== null || clients_1.wolframClient !== undefined) {
        if (state.focused === true) {
            clients_1.wolframClient === null || clients_1.wolframClient === void 0 ? void 0 : clients_1.wolframClient.onReady().then(ready => {
                clients_1.wolframClient.sendNotification("windowFocused", true);
            });
        }
        else {
            clients_1.wolframClient === null || clients_1.wolframClient === void 0 ? void 0 : clients_1.wolframClient.onReady().then(ready => {
                clients_1.wolframClient.sendNotification("windowFocused", false);
            });
        }
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
function updateOutputPanel() {
    let out = "";
    for (let i = 0; i < exports.printResults.length; i++) {
        // out += "<tr><td>" + i.toString() + ": </td><td>" + img3 + "</td></tr>";
        let data = "";
        try {
            data += fs.readFileSync(exports.printResults[i], 'utf8');
        }
        catch (e) {
            data += "Error reading result";
        }
        out += "<div id='result'>" +
            // printResults[i].replace(/(?:\r\n|\r|\n)/g, '<br><br>') + // .replace(/^\"/, '').replace(/\"$/, '')
            data +
            "</div>";
    }
    //out += "</table>";
    // if(typeof(outputPanel) === "undefined") {
    //     loadOutputPanel(myContext, 2);
    // }
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
function getUri(webview, extensionUri, pathList) {
    return webview.asWebviewUri(vscode_1.Uri.joinPath(extensionUri, ...pathList));
}
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
//# sourceMappingURL=extension.js.map