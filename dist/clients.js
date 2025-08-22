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
exports.restart = exports.restartKernel = exports.onkernelReady = exports.onlspReady = exports.startLanguageServer = exports.wlspdebugger = exports.treeDataProvider = exports.scriptController = exports.interactiveNotebookSerializer = exports.interactiveController = exports.notebookcontroller = exports.notebookSerializer = exports.scriptserializer = exports.wolframKernelClient = exports.wolframClient = void 0;
const vscode = require("vscode");
const path = require("path");
const fp = require('find-free-port');
const psTree = require('ps-tree');
const bson = require('bson');
const node_1 = require("vscode-LanguageClient/node");
const debug_1 = require("./debug");
const launch = require("./launch");
const fs = require('fs');
const notebook_1 = require("./notebook");
const interactiveNotebook_1 = require("./interactiveNotebook");
const interactiveController_1 = require("./interactiveController");
const scriptController_1 = require("./scriptController");
const treeDataProvider_1 = require("./treeDataProvider");
const dataPanel_1 = require("./dataPanel");
const plotsView_1 = require("./plotsView");
const DEBUG_PORT = 7810;
const MAX_PRINT_RESULTS = 50;
const EXECUTION_TIMEOUT_MS = 120000;
let context;
let outputChannel;
let kernelOutputChannel;
let wolframStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
let wolframVersionText = "$(extensions-sync-enabled~spin) Wolfram";
let progressStatus;
let lspPath;
let kernelPath;
let cursorFile = "";
let clients = new Map();
let processes = [];
let wolfram;
let wolframKernel;
let withProgressCancellation;
let dataProvider;
let plotsProvider;
let debugging = false;
let firstKernelLaunched = false;
let plotsInputsOutputs = new Map();
let evaluationIdCounter = Math.random() * 1000000;
let wlspPath = "";
let wolframBusyQ = false;
let evaluationQueue = [];
let temporaryDir = "";
let variableTable = {};
let printResults = [];
let editorDecorations = new Map();
let runningLines = new Map();
let movePositions = {};
let starttime = 0;
let inputs = [];
let cursorMoved = false;
let cursorLocations = [];
let evaluationResults = {};
let now = Date.now();
let workspaceDecorations = {};
let workspaceLintDecorations = {};
let newDecorations = {};
let totalClients = 0;
let plotsProviderActive = false;
let sendToWolframRetry = 0;
const variableDecorationType = vscode.window.createTextEditorDecorationType({
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});
const lintDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'none',
    light: { color: new vscode.ThemeColor("foreground") },
    dark: { color: new vscode.ThemeColor("foreground") },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});
const runningDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'none',
    light: { color: new vscode.ThemeColor("foreground") },
    dark: { color: new vscode.ThemeColor("foreground") },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});
const blockDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'none',
    overviewRulerColor: new vscode.ThemeColor("foreground"),
    overviewRulerLane: vscode.OverviewRulerLane.Right
});
function startLanguageServer(context0, outputChannel0) {
    return __awaiter(this, void 0, void 0, function* () {
        initializeGlobals(context0, outputChannel0);
        registerCommands();
        initializeProviders();
        yield startKernel();
        startWLSP();
        registerEventHandlers();
        yield setupNotebookSerializers();
        setupDebugger();
        setupTreeDataProvider();
    });
}
exports.startLanguageServer = startLanguageServer;
function initializeGlobals(context0, outputChannel0) {
    context = context0;
    wlspPath = context.asAbsolutePath(path.join(''));
    lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
    kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
    cursorFile = path.join(context.extensionPath, "wolfram", "cursorLocations.js");
    outputChannel = outputChannel0;
    debugging = (vscode.env.machineId === "someValue.machineId");
}
function registerCommands() {
    const commands = [
        ['wolfram.runInWolfram', () => runInWolfram()],
        ['wolfram.runInWolframMove', () => runInWolframMove()],
        ['wolfram.runToLine', (line) => runToLine(line)],
        ['wolfram.runFromLine', (line) => runFromLine(line)],
        ['wolfram.sendSectionToWolfram', () => sendSectionToWolfram()],
        ['wolfram.printInWolfram', () => printInWolfram()],
        ['wolfram.runTextCell', (location) => runTextCell(location)],
        ['wolfram.wolframTerminal', () => startWolframTerminal()],
        ['wolfram.runInTerminal', () => runInTerminal()],
        ['wolfram.help', () => help()],
        ['wolfram.stringHelp', (string) => stringHelp(string)],
        ['wolfram.wolframHelp', (url) => wolframHelp(url)],
        ['wolfram.restart', () => restart()],
        ['wolfram.abort', () => abort()],
        ['wolfram.textToSection', () => textToSection()],
        ['wolfram.textFromSection', () => textFromSection()],
        ['wolfram.createFile', () => createFile()],
        ['wolfram.createNotebook', () => createNotebook()],
        ['wolfram.createNotebookScript', () => createNotebookScript()],
        ['wolfram.createNotebookInteractive', () => createNotebookInteractive()],
        ['wolfram.runExpression', (expression, line, end) => runExpression(expression, line, end)],
        ['wolfram.clearResults', () => clearResults()],
        ['wolfram.showTrace', () => showTrace()],
        ['wolfram.debug', () => startWLSPDebugger()],
        ['wolfram.updateTreeData', () => updateTreeDataProvider()],
        ['wolfram.updateVarTable', () => getUpdateVarTable()],
        ['wolfram.clearPlots', () => clearPlots()]
    ];
    commands.forEach(([command, handler]) => {
        vscode.commands.registerCommand(command, handler);
    });
}
function initializeProviders() {
    var _a;
    plotsProvider = new plotsView_1.PlotsViewProvider(context.extensionUri, context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(plotsView_1.PlotsViewProvider.viewType, plotsProvider));
    (_a = plotsProvider._view) === null || _a === void 0 ? void 0 : _a.show(true);
    dataProvider = new dataPanel_1.DataViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(dataPanel_1.DataViewProvider.viewType, dataProvider));
}
function startWLSP() {
    return __awaiter(this, void 0, void 0, function* () {
        outputChannel.appendLine("Starting Wolfram Language Server Protocol (WLSP)...");
        let lspStarter = launch.startWLSPIO(0, wlspPath);
        yield lspStarter.then((client) => __awaiter(this, void 0, void 0, function* () {
            exports.wolframClient = client;
            outputChannel.appendLine("Wolfram Language Server started: " + (exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.state));
            if ((exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.state) === node_1.State.Running) {
                yield onlspReady();
            }
            else {
                outputChannel.appendLine("Wolfram Language Server failed to start.");
            }
        })).catch((error) => {
            outputChannel.appendLine("Error starting Wolfram Language Server: " + error);
            vscode.window.showErrorMessage("Failed to start Wolfram Language Server. Check the output for details.");
        });
    });
}
function startKernel() {
    return __awaiter(this, void 0, void 0, function* () {
        const kernelStarter = process.platform === "win32"
            ? () => launch.startWLSPKernelIO(0, wlspPath)
            : () => launch.startWLSPKernelIO(0, wlspPath);
        yield kernelStarter().then((client) => __awaiter(this, void 0, void 0, function* () {
            exports.wolframKernelClient = client;
            onkernelReady();
            firstKernelLaunched = true;
            outputChannel.appendLine("Wolfram Language Kernel started: " + (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state));
        }));
    });
}
function registerEventHandlers() {
    vscode.workspace.onDidChangeTextDocument(didChangeTextDocument);
    vscode.workspace.onDidOpenTextDocument(didOpenTextDocument);
    vscode.workspace.onDidSaveTextDocument(didSaveTextDocument);
    vscode.workspace.onDidChangeConfiguration(updateConfiguration);
    vscode.window.onDidChangeTextEditorSelection(didChangeSelection);
    vscode.window.onDidChangeWindowState(didChangeWindowState);
    vscode.workspace.onDidChangeWorkspaceFolders(handleWorkspaceFolderChanges);
    vscode.workspace.textDocuments.forEach(didOpenTextDocument);
}
function setupNotebookSerializers() {
    return __awaiter(this, void 0, void 0, function* () {
        exports.scriptserializer = new notebook_1.WolframScriptSerializer();
        exports.notebookSerializer = new notebook_1.WolframNotebookSerializer();
        exports.scriptController = new scriptController_1.WolframScriptController(context);
        exports.interactiveNotebookSerializer = new interactiveNotebook_1.InteractiveNotebookSerializer();
        exports.interactiveController = new interactiveController_1.InteractiveController();
        context.subscriptions.push(vscode.workspace.registerNotebookSerializer('wolfram-script', exports.scriptserializer), vscode.workspace.registerNotebookSerializer('wolfram-interactive', exports.interactiveNotebookSerializer), exports.notebookcontroller, exports.scriptController, exports.interactiveController);
    });
}
function setupDebugger() {
    const provider = new WLSPConfigurationProvider();
    fp(DEBUG_PORT).then(([freePort]) => {
        exports.wlspdebugger = new debug_1.WolframDebugAdapterDescriptorFactory(freePort, context, outputChannel);
    });
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('wlspdebugger', provider), vscode.debug.registerDebugConfigurationProvider("wlspdebugger", new debug_1.WolframDebugConfigProvider()), vscode.debug.registerDebugAdapterDescriptorFactory('wlspdebugger', exports.wlspdebugger));
}
function setupTreeDataProvider() {
    exports.treeDataProvider = new treeDataProvider_1.workspaceSymbolProvider();
    vscode.window.registerTreeDataProvider("wolframSymbols", exports.treeDataProvider);
}
function handleWorkspaceFolderChanges(event) {
    // for (const folder of event.removed) {
    //     const client = clients.get(folder.uri.toString());
    //     if (client) {
    //         clients.delete(folder.uri.toString());
    //         client[0]?.stop();
    //         client[1]?.stop();
    //     }
    // }
    for (const folder of event.added) {
        exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("didChangeWorkspaceFolders", folder);
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendNotification("didChangeWorkspaceFolders", folder);
    }
}
function onlspReady() {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            outputChannel.appendLine("Wolfram Language Server ready: " + (exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.state));
            setupLSPNotifications();
            handleWorkspaceFiles();
            if ((exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.state) === node_1.State.Running) {
                exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendRequest("storageUri").then((result) => {
                    temporaryDir = result;
                    resolve();
                });
                exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendRequest("getVersion").then((result) => {
                    wolframVersionText = "Wolfram (" + result.version.substring(0, Math.min(4, result.version.length)) + ")";
                    wolframStatusBar.text = wolframVersionText;
                    wolframStatusBar.show();
                });
            }
            else {
                resolve();
            }
        });
    });
}
exports.onlspReady = onlspReady;
function onkernelReady() {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            outputChannel.appendLine("Wolfram onKernel ready: " + (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state));
            setupKernelNotifications();
            handleWorkspaceFiles();
            if ((exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state) == 2) {
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendRequest("storageUri").then((result) => {
                    temporaryDir = result;
                    resolve();
                });
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendRequest("getVersion").then((result) => {
                    wolframVersionText = "Wolfram (" + result.version.substring(0, Math.min(4, result.version.length)) + ")";
                    wolframStatusBar.text = wolframVersionText;
                    wolframStatusBar.show();
                });
            }
            else {
                resolve();
            }
        });
    });
}
exports.onkernelReady = onkernelReady;
function setupLSPNotifications() {
    if (!exports.wolframClient)
        return;
    const notifications = [
        ['updatePositions', updatePositions],
    ];
    notifications.forEach(([event, handler]) => {
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.onNotification(event, handler);
    });
}
function setupKernelNotifications() {
    if (!exports.wolframKernelClient)
        return;
    const notifications = [
        ['wolframBusy', wolframBusy],
        ['updateVarTable', updateVarTable],
        ['errorMessages', errorMessages],
        ['updateInputs', updateInputs],
        ['onResult', onResult],
        ['updateLintDecorations', updateLintDecorations],
        ['onRunInWolfram', onRunInWolfram],
        ['onRunInWolframIO', onRunInWolframIO],
        ['onPrintMessage', onPrintMessage]
    ];
    notifications.forEach(([event, handler]) => {
        exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onNotification(event, handler);
    });
}
function handleWorkspaceFiles() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor)
        return;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders)
        return;
    workspaceFolders.forEach((folder) => {
        if ((exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state) !== node_1.State.Running || (exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.state) !== node_1.State.Running) {
            outputChannel.appendLine("Wolfram Kernel or Client not running, cannot send workspace folders.");
            return;
        }
        try {
            exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("didChangeWorkspaceFolders", folder);
        }
        catch (error) {
        }
        try {
            exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.sendNotification("didChangeWorkspaceFolders", folder);
        }
        catch (error) {
        }
    });
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
        resetState();
        yield startNewLSP();
        yield startNewKernel();
        vscode.workspace.textDocuments.forEach(didOpenTextDocument);
    });
}
exports.restart = restart;
function resetState() {
    const editor = vscode.window.activeTextEditor;
    wolframBusyQ = false;
    evaluationQueue = [];
    withProgressCancellation === null || withProgressCancellation === void 0 ? void 0 : withProgressCancellation.cancel();
    wolframStatusBar.text = "Wolfram ?";
    wolframStatusBar.show();
    editorDecorations = new Map();
    editor === null || editor === void 0 ? void 0 : editor.setDecorations(variableDecorationType, []);
    try {
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.stop();
    }
    catch (e) { }
    try {
        exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.stop();
    }
    catch (e) { }
}
function startNewLSP() {
    return __awaiter(this, void 0, void 0, function* () {
        yield launch.startWLSPIO(0, wlspPath).then((client) => __awaiter(this, void 0, void 0, function* () {
            exports.wolframClient = client;
            onlspReady();
        }));
    });
}
function startNewKernel() {
    return __awaiter(this, void 0, void 0, function* () {
        yield launch.startWLSPKernelIO(0, wlspPath).then((client) => __awaiter(this, void 0, void 0, function* () {
            exports.wolframKernelClient = client;
            onkernelReady();
        }));
    });
}
function runFromLine(line) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    let selection;
    let range;
    if (!line || line === 0) {
        selection = editor.selection.active;
        range = new vscode.Selection(0, 0, 0, 0);
    }
    else {
        selection = new vscode.Position(line - 1, 0);
        range = new vscode.Selection(0, 0, line - 1, 0);
    }
    const ranges = extractRangesFromPositions(editor.document.uri.fsPath.toString());
    const rangesAfterCursor = ranges.filter(range => range.end.line >= selection.line);
    let text = editor.document.getText();
    for (const r of rangesAfterCursor) {
        if (isEqualOrAfter(r.start, selection)) {
            let s = new vscode.Selection(new vscode.Position(r.start.line, r.start.character), new vscode.Position(r.end.line, r.end.character));
            queueEvaluation({
                range: s,
                textDocument: editor.document,
                print: false,
                output: true,
                trace: false,
                text: text
            });
        }
    }
    processEvaluationQueue();
}
function runToLine(line) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    let selection;
    let range;
    if (!line) {
        selection = editor.selection.active;
        range = new vscode.Selection(0, 0, selection.line, selection.character);
    }
    else {
        selection = new vscode.Position(line - 1, 0);
        range = new vscode.Selection(0, 0, line - 1, 0);
    }
    const ranges = extractRangesFromPositions(editor.document.uri.fsPath.toString());
    const rangesBeforeCursor = ranges.filter(range => range.end.line <= selection.line + 1);
    let text = editor.document.getText();
    for (const r of rangesBeforeCursor) {
        if (isEqualOrBefore(range.start, selection) && isEqualOrAfter(range.end, selection)) {
            let s = new vscode.Selection(new vscode.Position(r.start.line, r.start.character), new vscode.Position(r.end.line, r.end.character));
            queueEvaluation({
                range: s,
                textDocument: editor.document,
                print: false,
                output: true,
                trace: false,
                text: text
            });
            processEvaluationQueue();
        }
    }
}
function runInWolframMove(printOutput = false, trace = false, section = false) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const selection = editor.selection;
    moveCursor2(selection.active);
    queueEvaluation({
        range: selection,
        textDocument: editor.document,
        print: printOutput,
        output: true,
        trace,
        text: editor.document.getText()
    });
    sendToWolfram(printOutput, undefined, section);
}
function runInWolfram(printOutput = false, trace = false, section = false) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const selection = editor.selection;
    queueEvaluation({
        range: selection,
        textDocument: editor.document,
        print: printOutput,
        output: true,
        trace: false,
        text: editor.document.getText()
    });
    sendToWolfram(printOutput, undefined, section);
}
function queueEvaluation(evaluationData) {
    evaluationIdCounter = Math.random() * 1000000;
    let id = evaluationIdCounter;
    let evaluationWithId = evaluationData;
    evaluationWithId.id = id;
    evaluationQueue.unshift(evaluationWithId);
    let inputSnippet = "Running...";
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        let line = evaluationWithId.range.start.line;
        inputSnippet = editor.document.lineAt(line).text;
    }
    plotsInputsOutputs.set(id, [{ input: inputSnippet, output: "", range: evaluationWithId.range }]);
    if (!plotsProviderActive) {
        plotsProviderActive = true;
    }
    if (!plotsProvider._view) {
        vscode.commands.executeCommand('wolfram.plotsView.focus', { preserveFocus: true });
    }
    plotsProvider.newInput(id, inputSnippet);
    return id;
}
function processEvaluationQueue() {
    if (!exports.wolframKernelClient) {
        restart().then(() => {
            sendToWolfram(false);
        });
        return;
    }
    if (evaluationQueue.length >= 1) {
        sendToWolfram(false);
    }
}
function sendSectionToWolfram() {
    return __awaiter(this, void 0, void 0, function* () {
        runInWolfram(false, false, true);
    });
}
function sendToWolfram(printOutput = false, sel, section = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        if (evaluationQueue.length === 0)
            return;
        const evalNext = evaluationQueue.pop();
        if (!evalNext)
            return;
        starttime = Date.now();
        if ((exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state) === node_1.State.Running) {
            yield handleRunningKernel(evalNext, section);
        }
        else {
            yield handleNonRunningKernel(evalNext);
        }
    });
}
function handleRunningKernel(evalNext, section) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (section) {
                yield (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("runSectionInWolfram", evalNext));
            }
            else {
                yield (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("getInput", evalNext));
                yield (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("runInWolfram", evalNext));
            }
        }
        catch (err) {
            console.log("Error in kernel communication:", err);
        }
    });
}
function handleNonRunningKernel(evalNext) {
    return __awaiter(this, void 0, void 0, function* () {
        outputChannel.appendLine("Kernel not running, waiting for kernel to start");
        try {
            yield launch.stopKernel();
        }
        catch (e) {
            // Ignore stop errors
        }
        yield launch.startWLSPKernelIO(0, kernelPath).then((client) => {
            outputChannel.appendLine("Kernel started after not running");
            exports.wolframKernelClient = client;
            onkernelReady().then(() => __awaiter(this, void 0, void 0, function* () {
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("runInWolfram", evalNext);
            }));
        });
    });
}
function clearDecorationAroundCursor(ranges, position) {
    var _a;
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const uri = editor.document.uri.fsPath.toString();
    const decorations = (_a = editorDecorations.get(uri)) !== null && _a !== void 0 ? _a : [];
    const rangeAroundCursor = ranges.filter(range => {
        return isWithin(position, range);
    });
    if (rangeAroundCursor.length === 0)
        return;
    const filteredDecorations = decorations.filter(d => {
        return !isWithin(d.range.start, rangeAroundCursor[0]);
    });
    editorDecorations.set(uri, filteredDecorations);
    editor.setDecorations(variableDecorationType, filteredDecorations);
}
function moveCursor2(position0) {
    return __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const uri = editor.document.uri.fsPath.toString();
        const position = new vscode.Position(position0.line, position0.character + 1);
        if (!(decodeURIComponent(uri) in movePositions))
            return;
        const ranges = extractRangesFromPositions(uri);
        const { current, next } = findRangeEndsAroundCursor(ranges, position);
        if (current) {
            decorateRunningLine(current);
        }
        if (next) {
            clearDecorationAroundCursor(ranges, next);
            moveCursorToPosition(editor, next);
        }
        else {
            moveCursorToPosition(editor, new vscode.Position(position.line + 1, 0));
        }
    });
}
function extractRangesFromPositions(uri) {
    const ranges = [];
    if (!movePositions || !movePositions[decodeURIComponent(uri)])
        return ranges;
    const locations = movePositions[decodeURIComponent(uri)]["locations"];
    for (const location of Object.values(locations)) {
        const range = location;
        ranges.push(new vscode.Range(new vscode.Position(range.start.line, range.start.character), new vscode.Position(range.end.line, range.end.character)));
    }
    return ranges;
}
function moveCursorToPosition(editor, next) {
    if (!editor)
        return;
    if (next.line < 0) {
        next = new vscode.Position(0, 0);
    }
    if (next.line >= editor.document.lineCount) {
        // insert a new line at the end
        const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
        editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(editor.document.lineCount, 0), "\n");
        });
        next = new vscode.Position(editor.document.lineCount + 1, 0);
    }
    const nextCharacter = new vscode.Position(next.line, next.character + 1);
    editor.selection = new vscode.Selection(nextCharacter, nextCharacter);
    editor.revealRange(new vscode.Range(nextCharacter, nextCharacter), vscode.TextEditorRevealType.Default);
}
// create a positions decorator type
const positionsDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 0, 0.3)',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});
let positionsDecorations = [];
function updatePositions(params) {
    return __awaiter(this, void 0, void 0, function* () {
        params["result"].forEach((e) => {
            let uri = "";
            if ("location" in e && "uri" in e["location"]) {
                uri = decodeURIComponent(e["location"]["uri"]);
            }
            if ("location" in e && "uri" in e["location"] && !(uri in movePositions)) {
                movePositions[uri] = {};
            }
            if ("location" in e && "uri" in e["location"] && (uri in movePositions)) {
                movePositions[uri]["locations"] = e["locations"];
                positionsDecorations = [];
                for (const location of e["locations"]) {
                    let range = new vscode.Range(new vscode.Position(location["start"]["line"], location["start"]["character"]), new vscode.Position(location["end"]["line"], location["end"]["character"]));
                    let editor = vscode.window.visibleTextEditors.find(ed => decodeURIComponent(ed.document.uri.toString()) === uri);
                    if (!editor)
                        return;
                    let positionDecoration = {
                        range: range,
                        hoverMessage: editor.document.getText(range),
                        renderOptions: {
                            after: {
                                contentText: e["name"],
                                color: "black",
                                fontWeight: "bold",
                                margin: "0 0 0 10px"
                            }
                        }
                    };
                    // positionsDecorations.push(positionDecoration);
                    // editor.setDecorations(positionsDecorationType, positionsDecorations);
                }
            }
        });
    });
}
function getUpdateVarTable() {
    var _a;
    const editor = vscode.window.activeTextEditor;
    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("updateVarTable", { textDocument: editor === null || editor === void 0 ? void 0 : editor.document });
    (_a = plotsProvider._view) === null || _a === void 0 ? void 0 : _a.show(true);
}
function updateVarTable(vars) {
    fs.readFile(vars["values"], "utf8", (err, data) => {
        if (err) {
            console.log(err);
            return;
        }
        const updatedVariables = JSON.parse(data);
        Object.keys(updatedVariables).forEach((k) => {
            variableTable[k] = updatedVariables[k].slice(0, 1000);
        });
        const varsHtml = generateVariableTableHtml();
        dataProvider.updateView(varsHtml);
    });
}
function generateVariableTableHtml() {
    let vars = `<vscode-data-grid id="varTable" generate-header="sticky" aria-label="With Sticky Header">
        <vscode-data-grid-row row-type="header">
            <vscode-data-grid-cell cell-type="columnheader" grid-column="1">Name</vscode-data-grid-cell>
            <vscode-data-grid-cell cell-type="columnheader" grid-column="2">Value</vscode-data-grid-cell>
        </vscode-data-grid-row>`;
    Object.keys(variableTable).forEach(k => {
        vars += `<vscode-data-grid-row>
            <vscode-data-grid-cell grid-column="1">${k}</vscode-data-grid-cell>
            <vscode-data-grid-cell grid-column="2">${variableTable[k]}</vscode-data-grid-cell>
        </vscode-data-grid-row>`;
    });
    vars += "</vscode-data-grid>";
    return vars;
}
function isEqualOrBefore(a, b) {
    return a.line < b.line || (a.line === b.line && a.character <= b.character);
}
function isEqualOrAfter(a, b) {
    return a.line > b.line || (a.line === b.line && a.character >= b.character);
}
function isWithin(pos, range) {
    return !isEqualOrBefore(pos, range.start) && !isEqualOrAfter(pos, range.end);
}
function findRangeEndsAroundCursor(ranges, cursor) {
    let current;
    let next;
    for (const range of ranges) {
        if (isWithin(cursor, range)) {
            if (!current || isEqualOrBefore(range.end, current))
                current = range.end;
        }
        else if (isEqualOrAfter(range.start, cursor)) {
            if (!next || isEqualOrBefore(range.start, next))
                next = range.end;
        }
    }
    return { current, next };
}
function decorateRunningLine(outputPosition) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || outputPosition.line === 0)
        return;
    const decorationLine = editor.document.lineAt(outputPosition.line - 1);
    const start = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 10);
    const end = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 20);
    const range = new vscode.Range(start, end);
    const decoration = {
        range,
        renderOptions: {
            after: {
                contentText: "...",
                color: "foreground",
                margin: "20px"
            }
        }
    };
    editor.setDecorations(runningDecorationType, Array.from(runningLines.values()));
    removeExistingDecorationAtLine(editor, decoration.range.start.line);
}
function removeExistingDecorationAtLine(editor, line) {
    var _a;
    const decorations = (_a = editorDecorations.get(editor.document.uri.fsPath.toString())) !== null && _a !== void 0 ? _a : [];
    const filteredDecorations = decorations.filter(d => d.range.start.line <= line);
    editorDecorations.set(editor.document.uri.fsPath.toString(), filteredDecorations);
    editor.setDecorations(variableDecorationType, filteredDecorations);
}
function abort() {
    try {
        exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendNotification("abort");
    }
    catch (_a) {
        console.log("Wolfram kernel interrupt failed");
    }
}
function updateInputs(params) {
    const evaluationId = params["id"] || evaluationIdCounter;
    if (!plotsProviderActive) {
        plotsProviderActive = true;
        if (!plotsProvider._view) {
            vscode.commands.executeCommand('wolfram.plotsView.focus', { preserveFocus: true });
        }
    }
    plotsProvider.newInput(evaluationId, params["input"]);
    if (plotsInputsOutputs.has(evaluationId)) {
        let currentEntry = plotsInputsOutputs.get(evaluationId);
        currentEntry[0].input = params["input"];
        currentEntry[0].output = "";
        plotsInputsOutputs.set(evaluationId, currentEntry);
    }
}
function onPrintMessage(params) {
    return __awaiter(this, void 0, void 0, function* () {
        let message = params["message"];
        // add the print message to the last output in the plots provider
        const evaluationId = evaluationIdCounter;
        if (!plotsInputsOutputs.has(evaluationId)) {
            plotsInputsOutputs.set(evaluationId, [{ input: "", output: "", range: new vscode.Range(0, 0, 0, 0) }]);
        }
        const currentEntry = plotsInputsOutputs.get(evaluationId);
        currentEntry[0].output = message + "<br>" + currentEntry[0].output;
        plotsInputsOutputs.set(evaluationId, currentEntry);
        plotsProvider.newOutput(evaluationId, message);
    });
}
function onRunInWolframIO(result) {
    return __awaiter(this, void 0, void 0, function* () {
        const end = Date.now();
        outputChannel.appendLine(`Execution time: ${end - starttime} ms`);
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();
        setDecorations({ params: result });
        const editor = findEditorByPath(result["document"]["path"]);
        if (editor) {
            updateResults(editor, { params: result }, result["print"], result["input"]);
        }
    });
}
function onRunInWolfram(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const end = Date.now();
        outputChannel.appendLine(`Execution time: ${end - starttime} ms`);
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();
        if (!Object.keys(params).includes("output")) {
            handleFileBasedResult(params);
            return;
        }
        const result = {
            method: "onRunInWolfram",
            params
        };
        const editor = findEditorByPath(result.params.document.path) || vscode.window.activeTextEditor;
        if (editor && editor.document.uri.scheme !== 'vscode-notebook-cell') {
            now = Date.now();
            updateResults(editor, result, result.params.print, params.input, params);
            // updateResultInPlotsProvider(params.id, params.output);
        }
        processNextEvaluation();
    });
}
function updateResultInPlotsProvider(evaluationId, output) {
    if (plotsInputsOutputs.has(evaluationId)) {
        const currentEntry = plotsInputsOutputs.get(evaluationId);
        plotsInputsOutputs.set(evaluationId, [{ input: currentEntry[0].input, output: output, range: currentEntry[0].range }]);
        plotsProvider.newOutput(evaluationId, output.replace("class=\"grid\"", "id=\"myTable\" class=\"datatable\"") + "<br>" + currentEntry[0].output);
    }
}
function handleFileBasedResult(params) {
    if (!params.file)
        return;
    fs.readFile(params.file, null, (err, data) => {
        if (err) {
            outputChannel.appendLine(err);
            return;
        }
        const result = parseResultData(data);
        const editor = findEditorByPath(result.params.document.path);
        if (editor && editor.document.uri.scheme !== 'vscode-notebook-cell') {
            updateResults(editor, result, result.params.print, params.input, params);
        }
        processNextEvaluation();
        setDecorations(result);
    });
}
function parseResultData(data) {
    try {
        return JSON.parse(Buffer.from(data).toString());
    }
    catch (_a) {
        return createErrorResult();
    }
}
function createErrorResult() {
    var _a, _b;
    const activeEditor = vscode.window.activeTextEditor;
    return {
        method: "onRunInWolfram",
        params: {
            input: "",
            print: false,
            output: "error reading output",
            result: "error reading output",
            hover: "error reading output",
            messages: [],
            load: false,
            time: 0,
            position: {
                line: ((_a = activeEditor === null || activeEditor === void 0 ? void 0 : activeEditor.selection.active.line) !== null && _a !== void 0 ? _a : 0) + 1,
                character: ((_b = activeEditor === null || activeEditor === void 0 ? void 0 : activeEditor.selection.active.character) !== null && _b !== void 0 ? _b : 0)
            },
            document: {
                $mid: 1,
                fsPath: activeEditor === null || activeEditor === void 0 ? void 0 : activeEditor.document.uri.fsPath,
                external: activeEditor === null || activeEditor === void 0 ? void 0 : activeEditor.document.uri.toString(),
                path: activeEditor === null || activeEditor === void 0 ? void 0 : activeEditor.document.uri.path,
                scheme: "file"
            }
        }
    };
}
function findEditorByPath(path) {
    return vscode.window.visibleTextEditors.find(e => e.document.uri.path === path);
}
function processNextEvaluation() {
    if (evaluationQueue.length > 0) {
        sendToWolfram();
    }
    else {
        exports.treeDataProvider.refresh();
    }
}
function setDecorations(result) {
    const editor = findEditorByPath(result.params.document.path);
    if (!editor)
        return;
    const decorationsToRemove = Array.from(runningLines.values()).filter(d => d.range.start.line === result.params.position.line - 1);
    decorationsToRemove.forEach(d => {
        runningLines.delete(d.range);
    });
    editor.setDecorations(runningDecorationType, Array.from(runningLines.values()));
}
function onResult(result) {
}
function updateResults(editor, result, print, input = "", file = "") {
    return __awaiter(this, void 0, void 0, function* () {
        if (!editor)
            return;
        editor.edit(editBuilder => {
            const { output, rawoutput } = prepareOutput(result, file);
            updatePrintResults(input, output);
            let decoration = createResultDecoration(result, rawoutput, output);
            let line = result.params.position.line - 1;
            let startLine = line;
            // find the movePositions containing the position
            if (movePositions && decodeURIComponent(editor.document.uri.fsPath.toString()) in movePositions) {
                const ranges = extractRangesFromPositions(editor.document.uri.fsPath.toString());
                const rangeAroundCursor = ranges.find(range => range.start.line <= line && range.end.line >= line);
                if (rangeAroundCursor) {
                    line = rangeAroundCursor.end.line;
                    startLine = rangeAroundCursor.start.line;
                    decoration.range = new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 200));
                }
            }
            updateEditorDecorations(editor, decoration, startLine);
            if (print) {
                insertPrintOutput(editBuilder, result, rawoutput);
            }
            updatePlotsProvider(input, output, result.params.id);
            logExecutionTime();
        });
    });
}
function prepareOutput(result, file) {
    now = Date.now();
    let output;
    let rawoutput;
    if (result.params.load) {
        output = fs.readFileSync(result.params.output).toString();
        outputChannel.appendLine("Time to read file: " + (Date.now() - now) + " ms");
        if (output === '')
            output = " ";
        rawoutput = output;
    }
    else {
        output = result.params.output;
        output = output.replace("class=\"grid\"", "id=\"myTable\" class=\"datatable\"");
        rawoutput = output;
    }
    if (result.params.messages.length > 0) {
        output += "<div class='errors' style='color: #801f01;'>" +
            result.params.messages.reduce((acc, cur) => acc + "<br>" + cur, "") +
            "</div>";
    }
    return { output, rawoutput };
}
function updatePrintResults(input, output) {
    if (printResults.length > MAX_PRINT_RESULTS) {
        printResults.shift();
    }
    const inputSnippet = input.length > 1000 ?
        input.slice(0, 250) + "..." + input.slice(-250) : input;
    if (!output.includes("<img")) {
        outputChannel.appendLine(output.slice(0, 8192));
    }
}
function createResultDecoration(result, rawoutput, output) {
    var _a, _b, _c, _d;
    const nextline = Math.min(result.params.position.line - 1, (_b = (_a = vscode.window.activeTextEditor) === null || _a === void 0 ? void 0 : _a.document.lineCount) !== null && _b !== void 0 ? _b : 1 - 1);
    const startChar = (_d = (_c = vscode.window.activeTextEditor) === null || _c === void 0 ? void 0 : _c.document.lineAt(nextline).range.end.character) !== null && _d !== void 0 ? _d : 0;
    let hoverMessage = output;
    if (hoverMessage.length > 8192 && !hoverMessage.includes("<img")) {
        hoverMessage = "Large output: " + hoverMessage.substring(0, 100) + "...";
    }
    if (result.params.messages.length > 0) {
        hoverMessage += "\n" + result.params.messages;
    }
    const decoration = {
        range: new vscode.Range(nextline, startChar + 10, nextline, startChar + 200),
        renderOptions: {
            after: {
                contentText: " " + result.params.decoration,
                backgroundColor: new vscode.ThemeColor("editorInfo.background"),
                color: new vscode.ThemeColor("editorInfo.foreground"),
                margin: "10px 10px 10px 10px",
                border: "4px solid blue",
                textDecoration: "none; white-space: pre; border-top: 0px; border-right: 0px; border-bottom: 0px; border-radius: 2px"
            }
        },
        hoverMessage: createMarkdownHoverMessage(hoverMessage)
    };
    return decoration;
}
function createMarkdownHoverMessage(content) {
    const markdown = new vscode.MarkdownString(content, false);
    markdown.isTrusted = true;
    markdown.supportHtml = true;
    return markdown;
}
function updateEditorDecorations(editor, decoration, line) {
    var _a;
    const uri = editor.document.uri.fsPath.toString();
    let decorations = (_a = editorDecorations.get(uri)) !== null && _a !== void 0 ? _a : [];
    decorations = decorations.filter(d => d.range.start.line < line);
    decorations.push(decoration);
    editorDecorations.set(uri, decorations);
    editor.setDecorations(variableDecorationType, decorations);
}
function insertPrintOutput(editBuilder, result, rawoutput) {
    const outputPosition = new vscode.Position(result.params.position.line + 1, 0);
    try {
        editBuilder.insert(outputPosition, (rawoutput + "\n\n").slice(0, 8192));
    }
    catch (error) {
        console.log("Error: " + error);
    }
}
function updatePlotsProvider(input, output, id) {
    const inputSnippet = input.length > 1000 ?
        input.slice(0, 250) + "..." + input.slice(-250) : input.trim();
    if (plotsInputsOutputs.has(id)) {
        const currentEntry = plotsInputsOutputs.get(id);
        currentEntry[0].input = inputSnippet;
        currentEntry[0].output = output + "<br>" + currentEntry[0].output;
        plotsInputsOutputs.set(id, currentEntry);
        output = currentEntry[0].output;
    }
    plotsProvider.newOutput(id, output);
}
function logExecutionTime() {
    outputChannel.appendLine("Time to update decorations: " + (Date.now() - now) + " ms");
}
function runExpression(expression, line, end) {
    var _a;
    const editor = (_a = vscode.window.activeTextEditor) !== null && _a !== void 0 ? _a : vscode.window.visibleTextEditors[0];
    decorateRunningLine(new vscode.Position(line, end));
    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.sendRequest("runExpression", {
        print: false,
        expression,
        textDocument: editor === null || editor === void 0 ? void 0 : editor.document,
        line,
        end
    });
}
function wolframBusy(params) {
    const outputPosition = params.position ?
        new vscode.Position(Math.max(0, params.position.start.line - 1), params.position.start.character) :
        new vscode.Position(0, 0);
    if (params.position) {
        createBusyDecoration(outputPosition, params.text);
    }
    updateBusyStatus(params.busy, outputPosition);
}
function createBusyDecoration(outputPosition, text) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const decorationLine = editor.document.lineAt(Math.max(0, outputPosition.line - 1));
    const start = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 10);
    const end = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 20);
    const range = new vscode.Range(start, end);
    const decoration = {
        range,
        renderOptions: {
            after: {
                contentText: text,
                color: "foreground",
                margin: "20px"
            }
        }
    };
    runningLines.set(range, decoration);
}
function updateBusyStatus(busy, outputPosition) {
    if (busy) {
        wolframBusyQ = true;
        wolframStatusBar.text = "$(extensions-sync-enabled~spin) Running (" + outputPosition.line + ")";
        wolframStatusBar.show();
    }
    else {
        wolframBusyQ = false;
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();
        const editor = vscode.window.activeTextEditor;
        editor === null || editor === void 0 ? void 0 : editor.setDecorations(runningDecorationType, []);
        runningLines.clear();
    }
}
function updateDecorations(decorationfile) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || (editor.document.uri.scheme !== 'file' && editor.document.uri.scheme !== 'untitled')) {
        return;
    }
    fs.readFile(decorationfile, "utf8", (err, data) => {
        if (err || data === '') {
            outputChannel.appendLine(err);
            return;
        }
        processDecorationUpdate(editor, data);
    });
}
function processDecorationUpdate(editor, data) {
    try {
        newDecorations = JSON.parse(data);
        const uri = editor.document.uri.fsPath.toString();
        if (newDecorations[uri] === workspaceDecorations[uri])
            return;
        workspaceDecorations[uri] = newDecorations[uri];
        editorDecorations = createDecorationsFromData(workspaceDecorations[uri]);
        editor.setDecorations(variableDecorationType, editorDecorations.get(uri) || []);
        editor.setDecorations(runningDecorationType, Array.from(runningLines.values()));
    }
    catch (_a) {
        newDecorations = {};
    }
}
function createDecorationsFromData(decorationData) {
    // const editorDecorations: vscode.DecorationOptions[] = [];
    var _a;
    let editor = vscode.window.activeTextEditor;
    if (!editor)
        return new Map();
    const uri = editor.document.uri.fsPath.toString();
    const decorations = (_a = editorDecorations.get(uri)) !== null && _a !== void 0 ? _a : [];
    Object.keys(decorationData).forEach((d) => {
        const decoration = decorationData[d];
        decoration.hoverMessage = createMarkdownHoverMessage(decoration.hoverMessage);
        decorations.push(decoration);
    });
    editorDecorations.set(uri, decorations);
    return editorDecorations;
}
function updateLintDecorations(decorationfile) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || (editor.document.uri.scheme !== 'file' && editor.document.uri.scheme !== 'untitled')) {
        return;
    }
    fs.readFile(decorationfile, "utf8", (err, data) => {
        if (err) {
            outputChannel.appendLine(err);
            return;
        }
        processLintDecorationUpdate(editor, data);
    });
}
function processLintDecorationUpdate(editor, data) {
    newDecorations = JSON.parse(data);
    const uri = editor.document.uri.fsPath.toString();
    if (newDecorations[uri] === workspaceDecorations[uri])
        return;
    workspaceLintDecorations[uri] = newDecorations[uri];
    const editorLintDecorations = [];
    Object.keys(workspaceLintDecorations[uri]).forEach((d) => {
        editorLintDecorations.push(workspaceLintDecorations[uri][d]);
    });
    editor.setDecorations(lintDecorationType, editorLintDecorations);
    editor.setDecorations(runningDecorationType, []);
}
function clearPlots() {
    printResults = [];
    updateOutputPanel();
}
function clearResults() {
    plotsProvider.clearResults();
}
function updateOutputPanel() {
}
function runTextCell(location) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const selection = new vscode.Selection(new vscode.Position(location.start.line, location.start.character), new vscode.Position(location.end.line, 0));
    // get all the ranges that are within the selection
    const ranges = extractRangesFromPositions(editor.document.uri.fsPath.toString());
    const rangesBeforeCursor = ranges.filter(range => range.end.line <= selection.end.line + 1);
    if (rangesBeforeCursor.length === 0)
        return;
    // run the evaluation for each range before the cursor
    for (const r of rangesBeforeCursor) {
        if (r.start.line >= selection.start.line) {
            let s = new vscode.Selection(new vscode.Position(r.start.line, r.start.character), new vscode.Position(r.end.line, r.end.character));
            queueEvaluation({
                range: s,
                textDocument: editor.document,
                print: false,
                output: true,
                trace: false,
                text: editor.document.getText()
            });
        }
    }
    sendToWolfram(false, undefined, false);
    moveCursor2(selection.end);
}
function printInWolfram(print = true) {
    runInWolfram(print);
}
function didChangeSelection(event) {
    return __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== "wolfram" || editor.document.uri.scheme === 'untitled') {
            return;
        }
        const cursorBlock0 = yield cursorBlock();
        if (!cursorBlock0)
            return;
        editor.setDecorations(blockDecorationType, []);
        const decoration = {
            range: new vscode.Range(cursorBlock0.start.line, 0, cursorBlock0.end.line, cursorBlock0.end.character)
        };
        editor.setDecorations(blockDecorationType, [decoration]);
    });
}
function cursorBlock() {
    return __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        for (let i = 0; i < cursorLocations.length - 1; i++) {
            if ((cursorLocations[i]["start"]["line"] <= editor.selection.active.line) &&
                (cursorLocations[i]["end"]["line"] >= editor.selection.active.line)) {
                return cursorLocations[i];
            }
        }
        return editor.selection;
    });
}
function didChangeTextDocument(event) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            var _a;
            const editor = vscode.window.activeTextEditor;
            const selection = (_a = editor === null || editor === void 0 ? void 0 : editor.selection) === null || _a === void 0 ? void 0 : _a.active;
            if (!editor || event.document.uri.toString() !== editor.document.uri.fsPath.toString() ||
                event.contentChanges.length === 0) {
                resolve();
                return;
            }
            clearDecorations();
            updateRunningLines(editor, selection);
            updateEditorDecorationsAfterChange(editor, selection);
            resolve();
        });
    });
}
function updateRunningLines(editor, selection) {
    const newRunningLines = new Map();
    runningLines.forEach((d, key) => {
        if (selection && d.range.start.line < selection.line) {
            newRunningLines.set(key, d);
        }
    });
    runningLines = newRunningLines;
    editor.setDecorations(runningDecorationType, Array.from(runningLines.values()));
}
function updateEditorDecorationsAfterChange(editor, selection) {
    var _a;
    if (!selection)
        return;
    const newEditorDecorations = ((_a = editorDecorations.get(editor.document.uri.fsPath.toString())) !== null && _a !== void 0 ? _a : [])
        .filter((d) => d.range.start.line < selection.line);
    editorDecorations.set(editor.document.uri.fsPath.toString(), newEditorDecorations);
    editor.setDecorations(variableDecorationType, newEditorDecorations);
}
function clearDecorations() {
    const editor = vscode.window.activeTextEditor;
    const uri = editor === null || editor === void 0 ? void 0 : editor.document.uri.toString();
    if (uri && uri in workspaceDecorations) {
        editorDecorations.set(uri, []);
        editor === null || editor === void 0 ? void 0 : editor.setDecorations(variableDecorationType, []);
        editor === null || editor === void 0 ? void 0 : editor.setDecorations(runningDecorationType, []);
    }
}
function isUntitled(document) {
    return document ?
        (document.languageId === "wolfram" && document.uri.scheme === 'untitled') :
        false;
}
function didOpenTextDocument(document) {
    if (document.languageId !== 'wolfram' ||
        (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
        return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
        handleDocumentWithoutFolder(document);
        return;
    }
    handleDocumentWithFolder(document, folder);
}
function handleDocumentWithoutFolder(document) {
    if (document.languageId === 'wolfram' && !clients.has("default")) {
        totalClients++;
        clients.set("default", [exports.wolframClient, exports.wolframKernelClient]);
    }
    if (isUntitled(document) && clients.size === 0) {
        clients.set("default", [exports.wolframClient, exports.wolframKernelClient]);
    }
}
function handleDocumentWithFolder(document, folder) {
    if (!clients.has(folder.uri.toString()) && document.languageId === "wolfram") {
        totalClients++;
        clients.set(folder.uri.toString(), [exports.wolframClient, exports.wolframKernelClient]);
    }
}
function updateTreeDataProvider() {
    exports.treeDataProvider.refresh();
}
function didSaveTextDocument(event) {
    clearDecorations();
    didOpenTextDocument(event);
}
function createFile() {
    vscode.workspace.openTextDocument(vscode.Uri.parse("untitled:.wl")).then((document) => {
        vscode.window.showTextDocument(document);
    });
}
function createNotebook() {
    vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.nb"));
}
function createNotebookInteractive() {
    vscode.window.showNotebookDocument(new interactiveNotebook_1.InteractiveNotebook(vscode.Uri.parse("untitled:untitled.nb"), "wolfram-interactive", "wolfram-interactive", false, true, [], ["wolfram"], exports.wolframKernelClient));
}
function createNotebookScript() {
    vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(""), 'jupyter-notebook');
}
function didChangeWindowState(state) {
    if ((exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state) === 2) {
        exports.wolframKernelClient.sendNotification("windowFocused", {
            focus: state.focused,
        });
    }
}
function startWolframTerminal() {
    const { cmd, args } = getTerminalCommand();
    const activeWolframTerminal = vscode.window.createTerminal("wolfram terminal", cmd, args);
    activeWolframTerminal.show(true);
}
function getTerminalCommand() {
    if (process.platform === "win32") {
        return { cmd: 'cmd.exe', args: ['/c', 'wolframscript.exe'] };
    }
    else {
        return { cmd: 'rlwrap wolframscript', args: [] };
    }
}
function runInTerminal() {
    var _a;
    if (!vscode.window.activeTerminal) {
        startWolframTerminal();
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const text = editor.document.getText(new vscode.Range(editor.selection.start, editor.selection.end));
    (_a = vscode.window.activeTerminal) === null || _a === void 0 ? void 0 : _a.sendText(text);
}
function help() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const selectedText = getSelectedText(editor);
    const url = `https://reference.wolfram.com/language/ref/${selectedText}.html`;
    createHelpPanel(url, selectedText);
}
function getSelectedText(editor) {
    const selections = editor.selections;
    let text = "";
    for (const selection of selections) {
        text += editor.document.getText(new vscode.Range(selection.start, selection.end));
    }
    return text;
}
function createHelpPanel(url, text) {
    const helpPanel = vscode.window.createWebviewPanel("wolframHelp", "Doc: " + text, 2, {
        enableScripts: true,
        retainContextWhenHidden: true
    });
    helpPanel.webview.html = generateHelpPanelHtml(url);
}
function generateHelpPanelHtml(url) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'self' https://reference.wolfram.com 'unsafe-inline'">
    </head>
    <body>
        <span>
            <input action="action" onclick="window.history.go(-1); return false;" type="button" value="Back" />
            <input action="action" onclick="window.history.forward(); return false;" type="button" value="Forward" />
        </span>
        <iframe src="${url}" style="height:100vh; width:100%" sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-modals allow-clipboard-read allow-clipboard-write"></iframe>
    </body>
    </html>`;
}
function wolframHelp(url) {
    createHelpPanel(url, "");
}
function stringHelp(string) {
    const url = `https://reference.wolfram.com/language/ref/${string}.html`;
    createHelpPanel(url, string);
}
function textToSection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const selection = editor.selection;
    const lines = editor.document.getText(new vscode.Range(selection.start, selection.end)).split('\n');
    const newlines = lines.map(line => `(*${line}*)`).join('\n');
    editor.edit(editbuilder => {
        editbuilder.replace(selection, newlines);
    });
}
function textFromSection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const selection = editor.selection;
    const lines = editor.document.getText(new vscode.Range(selection.start, selection.end)).split('\n');
    const newlines = lines.map(line => line.replace(/^\(\*/, "").replace(/\*\)$/, "")).join('\n');
    editor.edit(editbuilder => {
        editbuilder.replace(selection, newlines);
    });
}
function showTrace() {
    runInWolfram(false, true);
}
function errorMessages(params) {
    const file = params["file"];
    fs.readFile(file, "utf8", (err, data) => {
        if (err)
            return;
        const errors = JSON.parse(data);
        const errorString = errors.map((e) => {
            vscode.window.showErrorMessage(e.toString());
            return e.toString();
        }).join("\n");
        printResults.push([params["input"], errorString]);
        updateOutputPanel();
    });
}
function startWLSPDebugger() {
}
class WLSPConfigurationProvider {
    resolveDebugConfiguration(folder, config, token) {
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
                return undefined;
            });
        }
        return config;
    }
}
//# sourceMappingURL=clients.js.map