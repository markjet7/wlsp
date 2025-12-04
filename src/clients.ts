import * as vscode from 'vscode';
import { debug, WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import * as path from 'path';
import * as net from 'net';
const fp = require('find-free-port');
import * as cp from 'child_process';
const psTree = require('ps-tree');
const bson = require('bson');
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    NotificationType,
    State,
    StateChangeEvent,
    ErrorHandler, ErrorAction, CloseHandlerResult, CloseAction, ErrorHandlerResult, Message,
    integer
} from 'vscode-LanguageClient/node';
import { resolve } from 'path';
import { deactivate } from './notebook';
import { time } from 'console';
import { WolframDebugConfigProvider, WolframDebugAdapterDescriptorFactory } from './debug'
import * as launch from './launch';

const fs = require('fs')
import { WolframScriptSerializer, WolframNotebookSerializer } from './notebook';
import { WolframNotebookController } from './notebookController';
import { InteractiveNotebookSerializer, InteractiveNotebook } from './interactiveNotebook';
import { InteractiveController } from './interactiveController';
import { WolframScriptController } from './scriptController';
import { workspaceSymbolProvider } from './treeDataProvider';
import { DataViewProvider } from './dataPanel';
import { PlotsViewProvider } from './plotsView';
import { send } from 'process';
import { Int32 } from 'bson';
import { text } from 'd3';

interface EvaluationData {
    id: number;
    range: vscode.Selection;
    textDocument: vscode.TextDocument | undefined;
    print: boolean;
    output: boolean;
    trace: boolean;
    text: string;
    allowFullKernelResults?: boolean;
    maxPreviewElements?: number;
}

interface PlotInputOutput {
    input: string;
    output: string;
    range?: vscode.Range;
}

const DEBUG_PORT = 7810;
const MAX_PRINT_RESULTS = 50;
const EXECUTION_TIMEOUT_MS = 120000;
const DEFAULT_MAX_PREVIEW_ELEMENTS = 2000;

let context: vscode.ExtensionContext;
let outputChannel: vscode.OutputChannel;
let kernelOutputChannel: vscode.OutputChannel;

let wolframStatusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
let wolframVersionText = "$(extensions-sync-enabled~spin) Wolfram";
let progressStatus: any;

let lspPath: string;
let kernelPath: string;
let cursorFile: string = "";
let clients: Map<string, (LanguageClient | undefined)[]> = new Map();
let processes: cp.ChildProcess[] = [];

let wolfram: cp.ChildProcess;
let wolframKernel: cp.ChildProcess;
let withProgressCancellation: vscode.CancellationTokenSource | undefined;

let dataProvider: DataViewProvider;
let plotsProvider: PlotsViewProvider;
let debugging: boolean = false;

export let wolframClient: LanguageClient | undefined;
export let wolframKernelClient: LanguageClient | undefined;
let firstKernelLaunched = false;

export let scriptserializer: vscode.NotebookSerializer;
export let notebookSerializer: WolframNotebookSerializer;
export let notebookcontroller: WolframNotebookController;
export let interactiveController: InteractiveController;
export let interactiveNotebookSerializer: InteractiveNotebookSerializer;
export let scriptController: WolframScriptController;
export let treeDataProvider: workspaceSymbolProvider;
export let wlspdebugger: WolframDebugAdapterDescriptorFactory;

let plotsInputsOutputs: Map<number, PlotInputOutput[]> = new Map();
let evaluationIdCounter = Math.random() * 1000000;
let wlspPath = "";

let wolframBusyQ: boolean = false;
let evaluationQueue: EvaluationData[] = [];
let temporaryDir = "";
let variableTable: any = {};
let printResults: any[] = [];
let editorDecorations: Map<string, vscode.DecorationOptions[]> = new Map();
let runningLines: Map<vscode.Range, vscode.DecorationOptions> = new Map();
let movePositions: { [index: string]: any } = {};
let starttime = 0;
let inputs: string[] = [];
let cursorMoved = false;
let cursorLocations: any[] = [];
let evaluationResults: { [key: string]: string } = {};
let now = Date.now();
let workspaceDecorations: { [index: string]: vscode.DecorationOptions[] } = {};
let workspaceLintDecorations: { [index: string]: vscode.DecorationOptions[] } = {};
let newDecorations: { [index: string]: vscode.DecorationOptions[] } = {};
let totalClients: number = 0;
let plotsProviderActive = false;
let sendToWolframRetry = 0;

const variableDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});

const lintDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'none',
    light: { color: new vscode.ThemeColor("foreground") },
    dark: { color: new vscode.ThemeColor("foreground") },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});

const runningDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'none',
    light: { color: new vscode.ThemeColor("foreground") },
    dark: { color: new vscode.ThemeColor("foreground") },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});

const blockDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'none',
    overviewRulerColor: new vscode.ThemeColor("foreground"),
    overviewRulerLane: vscode.OverviewRulerLane.Right
});

function getKernelOutputPreferences() {
    const config = vscode.workspace.getConfiguration('wlsp');
    return {
        allowFullKernelResults: config.get<boolean>('allowFullKernelResults', false),
        maxPreviewElements: config.get<number>('maxPreviewElements', DEFAULT_MAX_PREVIEW_ELEMENTS)
    };
}

export async function startLanguageServer(context0: vscode.ExtensionContext, outputChannel0: vscode.OutputChannel): Promise<void> {
    initializeGlobals(context0, outputChannel0);
    registerCommands();
    initializeProviders();
    await startKernel();
    startWLSP();
    registerEventHandlers();
    await setupNotebookSerializers();
    setupDebugger();
    setupTreeDataProvider();
}

function initializeGlobals(context0: vscode.ExtensionContext, outputChannel0: vscode.OutputChannel): void {
    context = context0;
    wlspPath = context.asAbsolutePath(path.join(''));
    lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
    kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
    cursorFile = path.join(context.extensionPath, "wolfram", "cursorLocations.js");
    outputChannel = outputChannel0;
    debugging = (vscode.env.machineId === "someValue.machineId");
}

function registerCommands(): void {
    const commands: [string, (...args: any[]) => any][] = [
        ['wolfram.runInWolfram', () => runInWolfram()],
        ['wolfram.runInWolframMove', () => runInWolframMove()],
        ['wolfram.runToLine', (line:integer) => runToLine(line)],
        ['wolfram.runFromLine', (line:integer) => runFromLine(line)],
        ['wolfram.sendSectionToWolfram', () => sendSectionToWolfram()],
        ['wolfram.printInWolfram', () => printInWolfram()],
        ['wolfram.runTextCell', (location: vscode.Range) => runTextCell(location)],
        ['wolfram.wolframTerminal', () => startWolframTerminal()],
        ['wolfram.runInTerminal', () => runInTerminal()],
        ['wolfram.help', () => help()],
        ['wolfram.stringHelp', (string: string) => stringHelp(string)],
        ['wolfram.wolframHelp', (url: string) => wolframHelp(url)],
        ['wolfram.restart', () => restart()],
        ['wolfram.abort', () => abort()],
        ['wolfram.textToSection', () => textToSection()],
        ['wolfram.textFromSection', () => textFromSection()],
        ['wolfram.createFile', () => createFile()],
        ['wolfram.createNotebook', () => createNotebook()],
        ['wolfram.createNotebookScript', () => createNotebookScript()],
        ['wolfram.createNotebookInteractive', () => createNotebookInteractive()],
        ['wolfram.runExpression', (expression: string, line: number, end: number) => runExpression(expression, line, end)],
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

function initializeProviders(): void {
    plotsProvider = new PlotsViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(PlotsViewProvider.viewType, plotsProvider)
    );
    plotsProvider._view?.show(true);

    dataProvider = new DataViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DataViewProvider.viewType, dataProvider)
    );
}

async function startWLSP(): Promise<void> {
    outputChannel.appendLine("Starting Wolfram Language Server Protocol (WLSP)...");
    
    let lspStarter = launch.startWLSPIO(0, wlspPath);

    await lspStarter.then(async (client) => {
        wolframClient = client;
        outputChannel.appendLine("Wolfram Language Server started: " + wolframClient?.state);
        
        if (wolframClient?.state === State.Running) {
            await onlspReady();
        } else {
            outputChannel.appendLine("Wolfram Language Server failed to start.");
        }
    }).catch((error) => {
        outputChannel.appendLine("Error starting Wolfram Language Server: " + error);
        vscode.window.showErrorMessage("Failed to start Wolfram Language Server. Check the output for details.");
    });
}

async function startKernel(): Promise<void> {
    const kernelStarter = process.platform === "win32" 
        ? () => launch.startWLSPKernelIO(0, wlspPath)
        : () => launch.startWLSPKernelIO(0, wlspPath);

    await kernelStarter().then(async (client) => {
        wolframKernelClient = client;
        onkernelReady();
        firstKernelLaunched = true;
        outputChannel.appendLine("Wolfram Language Kernel started: " + wolframKernelClient?.state);
    });
}

function registerEventHandlers(): void {
    vscode.workspace.onDidChangeTextDocument(didChangeTextDocument);
    vscode.workspace.onDidOpenTextDocument(didOpenTextDocument);
    vscode.workspace.onDidSaveTextDocument(didSaveTextDocument);
    vscode.workspace.onDidChangeConfiguration(updateConfiguration);
    vscode.window.onDidChangeTextEditorSelection(didChangeSelection);
    vscode.window.onDidChangeWindowState(didChangeWindowState);
    
    vscode.workspace.onDidChangeWorkspaceFolders(handleWorkspaceFolderChanges);
    vscode.workspace.textDocuments.forEach(didOpenTextDocument);
}

async function setupNotebookSerializers(): Promise<void> {
    scriptserializer = new WolframScriptSerializer();
    notebookSerializer = new WolframNotebookSerializer();
    scriptController = new WolframScriptController(context);
    interactiveNotebookSerializer = new InteractiveNotebookSerializer();
    interactiveController = new InteractiveController();

    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('wolfram-script', scriptserializer),
        vscode.workspace.registerNotebookSerializer('wolfram-interactive', interactiveNotebookSerializer),
        notebookcontroller,
        scriptController,
        interactiveController
    );
}

function setupDebugger(): void {
    const provider = new WLSPConfigurationProvider();
    
    fp(DEBUG_PORT).then(([freePort]: number[]) => {
        wlspdebugger = new WolframDebugAdapterDescriptorFactory(freePort, context, outputChannel);
    });

    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider('wlspdebugger', provider),
        vscode.debug.registerDebugConfigurationProvider("wlspdebugger", new WolframDebugConfigProvider()),
        vscode.debug.registerDebugAdapterDescriptorFactory('wlspdebugger', wlspdebugger)
    );
}

function setupTreeDataProvider(): void {
    treeDataProvider = new workspaceSymbolProvider();
    vscode.window.registerTreeDataProvider("wolframSymbols", treeDataProvider);
}

function handleWorkspaceFolderChanges(event: vscode.WorkspaceFoldersChangeEvent): void {
    // for (const folder of event.removed) {
    //     const client = clients.get(folder.uri.toString());
    //     if (client) {
    //         clients.delete(folder.uri.toString());
    //         client[0]?.stop();
    //         client[1]?.stop();
    //     }
    // }

    for (const folder of event.added) {
            wolframKernelClient?.sendNotification("didChangeWorkspaceFolders", folder);
            wolframClient?.sendNotification("didChangeWorkspaceFolders", folder);
        }
}

export async function onlspReady(): Promise<void> {
    return new Promise((resolve) => {
        outputChannel.appendLine("Wolfram Language Server ready: " + wolframClient?.state);
        
        setupLSPNotifications();
        handleWorkspaceFiles();
        
        if (wolframClient?.state === State.Running) {
            wolframClient?.sendRequest("storageUri").then((result: any) => {
                temporaryDir = result;
                resolve();
            });
            // wolframClient?.sendRequest("getVersion").then((result: any) => { 
            //     wolframVersionText =  "Wolfram (" + result.version.substring(0, Math.min(4, result.version.length)) + ")";
            //     wolframStatusBar.text = wolframVersionText;
            //     wolframStatusBar.show();
            // });
        } else {
            resolve();
        }
    });
}

export async function onkernelReady(): Promise<void> {
    return new Promise((resolve) => {
        outputChannel.appendLine("Wolfram onKernel ready: " + wolframKernelClient?.state);
        
        setupKernelNotifications();
        handleWorkspaceFiles();
        
        if (wolframKernelClient?.state == 2) {
            wolframKernelClient?.sendRequest("storageUri").then((result: any) => {
                temporaryDir = result;
                resolve();
            });
            wolframKernelClient?.sendRequest("getVersion").then((result: any) => { 
                wolframVersionText =  "Wolfram (" + result.version.substring(0, Math.min(4, result.version.length)) + ")";
                wolframStatusBar.text = wolframVersionText;
                wolframStatusBar.show();
            });
        } else {
            resolve();
        }
    });
}

function setupLSPNotifications(): void {
    if (!wolframClient) return;

    const notifications: [string, (...args: any[]) => void][] = [
        ['updatePositions', updatePositions],
    ];

    notifications.forEach(([event, handler]) => {
        wolframClient?.onNotification(event, handler);
    });
}

function setupKernelNotifications(): void {
    if (!wolframKernelClient) return;

    const notifications: [string, (...args: any[]) => void][] = [
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
        wolframKernelClient?.onNotification(event, handler);
    });
}

function handleWorkspaceFiles(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return;



    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    workspaceFolders.forEach((folder: WorkspaceFolder) => {
        
        if (wolframKernelClient?.state !== State.Running || wolframClient?.state !== State.Running) {
            outputChannel.appendLine("Wolfram Kernel or Client not running, cannot send workspace folders.");
            return;
        }

        try {
            
        wolframKernelClient?.sendNotification("didChangeWorkspaceFolders", folder);
        } catch (error) {
            
        }

        try {
            wolframClient?.sendNotification("didChangeWorkspaceFolders", folder);
        } catch (error) {
        }
    });
}

function updateConfiguration(): void {
    if (vscode.workspace.getConfiguration().get("wlsp.liveDocument")) {
    }

    wolframKernelClient?.sendNotification(
        "updateConfiguration",
        { "abortOnError": vscode.workspace.getConfiguration().get("wlsp.abortOnError") }
    );
}

export async function restartKernel(): Promise<LanguageClient | undefined> {
    wolframKernelClient = await launch.restartKernel();
    await onkernelReady();
    return new Promise((resolve) => {
        resolve(wolframKernelClient);
    });
}

export async function restart(): Promise<void> {
    resetState();
    await startNewLSP();
    await startNewKernel();
    vscode.workspace.textDocuments.forEach(didOpenTextDocument);
}

function resetState(): void {
    const editor = vscode.window.activeTextEditor;
    wolframBusyQ = false;
    evaluationQueue = [];
    withProgressCancellation?.cancel();
    wolframStatusBar.text = "Wolfram ?";
    wolframStatusBar.show();
    editorDecorations = new Map();
    editor?.setDecorations(variableDecorationType, []);
    try {
        wolframClient?.stop();
    } catch (e) {}
    
    try {
        wolframKernelClient?.stop();
    } catch (e) {}
}

async function startNewLSP(): Promise<void> {
    await launch.startWLSPIO(0, wlspPath).then(async (client) => {
        wolframClient = client;
        onlspReady();
    });
}

async function startNewKernel(): Promise<void> {
    await launch.startWLSPKernelIO(0, wlspPath).then(async (client) => {
        wolframKernelClient = client;
        onkernelReady();
    });
}

function runFromLine(line: integer): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    let selection: vscode.Position;
    let range: vscode.Range;

    if (!line || line === 0) {
        selection = editor.selection.active;
        range = new vscode.Selection(0, 0, 0, 0);
    } else {
        selection = new vscode.Position(line - 1, 0);
        range = new vscode.Selection(0, 0, line - 1, 0);
    }

    const ranges = extractRangesFromPositions(editor.document.uri.fsPath.toString());
    const rangesAfterCursor = ranges.filter(range => range.end.line >= selection.line);

    let text = editor.document.getText();
    for (const r of rangesAfterCursor) {
        if (isEqualOrAfter(r.start, selection)) {

            let s:vscode.Selection = new vscode.Selection(
                new vscode.Position(
                    r.start.line, 
                    r.start.character 
                ),
                new vscode.Position(
                    r.end.line,
                    r.end.character 
                ));
            
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

function runToLine(line:integer): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    let selection: vscode.Position;
    let range: vscode.Range;

    if (!line) {
        selection = editor.selection.active;
        range = new vscode.Selection(0, 0, selection.line, selection.character);
    } else {
        selection = new vscode.Position(line - 1, 0);
        range = new vscode.Selection(0, 0, line - 1, 0);
    }

    const ranges = extractRangesFromPositions(editor.document.uri.fsPath.toString());
    const rangesBeforeCursor = ranges.filter(range => range.end.line <= selection.line+1);  

    let text = editor.document.getText();
    for (const r of rangesBeforeCursor) {
        if (isEqualOrBefore(range.start, selection) && isEqualOrAfter(range.end, selection)) {

            let s:vscode.Selection = new vscode.Selection(
                new vscode.Position(
                    r.start.line, 
                    r.start.character 
                ),
                new vscode.Position(
                    r.end.line,
                    r.end.character 
                ));
            
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

function runInWolframMove(printOutput = false, trace = false, section = false): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

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

function runInWolfram(printOutput = false, trace = false, section = false): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

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

function queueEvaluation(evaluationData: Omit<EvaluationData, 'id'>): number {
    evaluationIdCounter = Math.random() * 1000000;
    let id = evaluationIdCounter;
    let evaluationWithId = evaluationData as EvaluationData;
    evaluationWithId.id = id;
    const { allowFullKernelResults, maxPreviewElements } = getKernelOutputPreferences();
    evaluationWithId.allowFullKernelResults = allowFullKernelResults;
    evaluationWithId.maxPreviewElements = maxPreviewElements;
    evaluationQueue.unshift(evaluationWithId);
    
    let inputSnippet = "Running..."
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

function processEvaluationQueue(): void {
    if (!wolframKernelClient) {
        restart().then(() => {
            sendToWolfram(false);
        });
        return;
    }

    if (evaluationQueue.length >= 1) {
        sendToWolfram(false);
    }
}

async function sendSectionToWolfram(): Promise<void> {
    runInWolfram(false, false, true);
}

async function sendToWolfram(printOutput = false, sel?: vscode.Selection, section = false): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    if (evaluationQueue.length === 0) return;

    const evalNext = evaluationQueue.pop();
    if (!evalNext) return;

    starttime = Date.now();

    if (wolframKernelClient?.state === State.Running) {
        await handleRunningKernel(evalNext, section);
    } else {
        await handleNonRunningKernel(evalNext);
    }
}

async function handleRunningKernel(evalNext: EvaluationData, section: boolean): Promise<void> {
    try {
        if (section) {
            await wolframKernelClient?.sendNotification("runSectionInWolfram", evalNext);
        } else {
            await wolframKernelClient?.sendNotification("getInput", evalNext);
            await wolframKernelClient?.sendNotification("runInWolfram", evalNext);
        }
    } catch (err) {
        console.log("Error in kernel communication:", err);
    }
}

async function handleNonRunningKernel(evalNext: EvaluationData): Promise<void> {
    outputChannel.appendLine("Kernel not running, waiting for kernel to start");
    
    try {
        await launch.stopKernel();
    } catch (e) {
        // Ignore stop errors
    }

    await launch.startWLSPKernelIO(0, kernelPath).then((client) => {
        outputChannel.appendLine("Kernel started after not running");
        wolframKernelClient = client;
        onkernelReady().then(async () => {
            wolframKernelClient?.sendNotification("runInWolfram", evalNext);
        });
    });
}

function clearDecorationAroundCursor(ranges: vscode.Range[], position: vscode.Position): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const uri = editor.document.uri.fsPath.toString();
    const decorations = editorDecorations.get(uri) ?? [];

    const rangeAroundCursor = ranges.filter(range => {
        return isWithin(position, range);
    });

    if (rangeAroundCursor.length === 0) return;
    
    const filteredDecorations = decorations.filter(d => {
        return !isWithin(d.range.start, rangeAroundCursor[0])
    });

    editorDecorations.set(uri, filteredDecorations);
    editor.setDecorations(variableDecorationType, filteredDecorations);
}

async function moveCursor2(position0: vscode.Position): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const uri = editor.document.uri.fsPath.toString();
    const position = new vscode.Position(position0.line, position0.character+1);
    
    if (!(decodeURIComponent(uri) in movePositions)) return;

    const ranges = extractRangesFromPositions(uri);
    const { current, next } = findRangeEndsAroundCursor(ranges, position);

    if (current) {
        decorateRunningLine(current);
    }

    if (next) {
        clearDecorationAroundCursor(ranges, next);
        moveCursorToPosition(editor, next);
    } else {
        moveCursorToPosition(editor, new vscode.Position(position.line+1, 0));
    }
}

function extractRangesFromPositions(uri: string): vscode.Range[] {
    const ranges: vscode.Range[] = [];
    if (!movePositions || !movePositions[decodeURIComponent(uri)]) return ranges;
    const locations = movePositions[decodeURIComponent(uri)]["locations"];
    
    for (const location of Object.values(locations)) {
        const range = location as vscode.Range;
        ranges.push(new vscode.Range(
            new vscode.Position(range.start.line, range.start.character),
            new vscode.Position(range.end.line, range.end.character)
        ));
    }
    
    return ranges;
}

function moveCursorToPosition(editor: vscode.TextEditor, next: vscode.Position): void {
    if (!editor) return;

    if (next.line < 0) {
        next = new vscode.Position(0, 0);
    }

    if (next. line >= editor.document.lineCount) {
        // insert a new line at the end
        const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
        editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(editor.document.lineCount, 0), "\n");
        });
        next = new vscode.Position(editor.document.lineCount+1, 0);
    }

    const nextCharacter = new vscode.Position(next.line, next.character + 1);
    editor.selection = new vscode.Selection(nextCharacter, nextCharacter);
    editor.revealRange(new vscode.Range(nextCharacter, nextCharacter), vscode.TextEditorRevealType.Default);
}

// create a positions decorator type
const positionsDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 0, 0.3)',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});
let positionsDecorations: vscode.DecorationOptions[] = [];

async function updatePositions(params: any): Promise<void> {

    params["result"].forEach((e: any) => {
        let uri: string = "";
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
                let range = new vscode.Range(
                    new vscode.Position(location["start"]["line"], location["start"]["character"]),
                    new vscode.Position(location["end"]["line"], location["end"]["character"])
                );

                let editor = vscode.window.visibleTextEditors.find(ed =>decodeURIComponent(ed.document.uri.toString()) === uri);
                if (!editor) return;


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
                } as vscode.DecorationOptions;

                // positionsDecorations.push(positionDecoration);
                // editor.setDecorations(positionsDecorationType, positionsDecorations);
            }
        }
    });
}

function getUpdateVarTable(): void {
    const editor = vscode.window.activeTextEditor;
    wolframKernelClient?.sendNotification("updateVarTable", { textDocument: editor?.document });
    plotsProvider._view?.show(true);
}

function updateVarTable(vars: any): void {
    fs.readFile(vars["values"], "utf8", (err: any, data: any) => {
        if (err) {
            console.log(err);
            return;
        }

        const updatedVariables = JSON.parse(data);
        Object.keys(updatedVariables).forEach((k: any) => {
            variableTable[k] = updatedVariables[k].slice(0, 1000);
        });

        const varsHtml = generateVariableTableHtml();
        dataProvider.updateView(varsHtml);
    });
}

function generateVariableTableHtml(): string {
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

function isEqualOrBefore(a: vscode.Position, b: vscode.Position): boolean {
    return a.line < b.line || (a.line === b.line && a.character <= b.character);
}

function isEqualOrAfter(a: vscode.Position, b: vscode.Position): boolean {
    return a.line > b.line || (a.line === b.line && a.character >= b.character);
}

function isWithin(pos: vscode.Position, range: vscode.Range): boolean {
    return !isEqualOrBefore(pos, range.start) && !isEqualOrAfter(pos, range.end);
}

function findRangeEndsAroundCursor(ranges: vscode.Range[], cursor: vscode.Position): { current?: vscode.Position; next?: vscode.Position } {
    let current: vscode.Position | undefined;
    let next: vscode.Position | undefined;

    for (const range of ranges) {
        if (isWithin(cursor, range)) {
            if (!current || isEqualOrBefore(range.end, current)) current = range.end;
        } else if (isEqualOrAfter(range.start, cursor)) {
            if (!next || isEqualOrBefore(range.start, next)) next = range.end;
        }
    }

    return { current, next };
}

function decorateRunningLine(outputPosition: vscode.Position): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || outputPosition.line === 0) return;

    const decorationLine = editor.document.lineAt(outputPosition.line - 1);
    const start = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 10);
    const end = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 20);
    const range = new vscode.Range(start, end);

    const decoration: vscode.DecorationOptions = {
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

function removeExistingDecorationAtLine(editor: vscode.TextEditor, line: number): void {
    const decorations = editorDecorations.get(editor.document.uri.fsPath.toString()) ?? [];

    const filteredDecorations = decorations.filter(d => d.range.start.line <= line);
    editorDecorations.set(editor.document.uri.fsPath.toString(), filteredDecorations);
    editor.setDecorations(variableDecorationType, filteredDecorations);
}

function abort(): void {
    try {
        wolframKernelClient?.sendNotification("abort");
    } catch {
        console.log("Wolfram kernel interrupt failed");
    }
}

function updateInputs(params: any): void {
    const evaluationId = params["id"] || evaluationIdCounter;
    
    if (!plotsProviderActive) {
        plotsProviderActive = true;
        if (!plotsProvider._view) {
            vscode.commands.executeCommand('wolfram.plotsView.focus', { preserveFocus: true });
        }
    }

    plotsProvider.newInput(evaluationId, params["input"]);

    if (plotsInputsOutputs.has(evaluationId)) {
        let currentEntry = plotsInputsOutputs.get(evaluationId)!;
        currentEntry[0].input = params["input"];
        currentEntry[0].output = "";

        plotsInputsOutputs.set(evaluationId, currentEntry);
    }
}

async function onPrintMessage(params:any) {
    let message = params["message"];
    // add the print message to the last output in the plots provider
    const evaluationId = evaluationIdCounter;
    if (!plotsInputsOutputs.has(evaluationId)) {
        plotsInputsOutputs.set(evaluationId, [{ input: "", output: "", range: new vscode.Range(0, 0, 0, 0) }]);
    }
    const currentEntry = plotsInputsOutputs.get(evaluationId)!;
    currentEntry[0].output = message + "<br>" + currentEntry[0].output;   
    
    plotsInputsOutputs.set(evaluationId, currentEntry);
    plotsProvider.newOutput(evaluationId, message);

}

async function onRunInWolframIO(result: any): Promise<void> {
    const end = Date.now();
    outputChannel.appendLine(`Execution time: ${end - starttime} ms`);

    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.show();

    setDecorations({ params: result });
    const editor = findEditorByPath(result["document"]["path"]);
    
    if (editor) {
        updateResults(editor, { params: result }, result["print"], result["input"]);
    }
}

async function onRunInWolfram(params: any): Promise<void> {
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
}

function updateResultInPlotsProvider(evaluationId: number, output: string): void {
    if (plotsInputsOutputs.has(evaluationId)) {
        const currentEntry = plotsInputsOutputs.get(evaluationId)!;
        plotsInputsOutputs.set(evaluationId, [{ input: currentEntry[0].input, output: output, range: currentEntry[0].range }]);
        plotsProvider.newOutput(evaluationId, 
            output.replace("class=\"grid\"", "id=\"myTable\" class=\"datatable\"") +  "<br>" + currentEntry[0].output );
    }
}

function handleFileBasedResult(params: any): void {
    if (!params.file) return;

    fs.readFile(params.file, null, (err: any, data: any) => {
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

function parseResultData(data: any): any {
    try {
        return JSON.parse(Buffer.from(data).toString());
    } catch {
        return createErrorResult();
    }
}

function createErrorResult(): any {
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
                line: (activeEditor?.selection.active.line ?? 0) + 1,
                character: (activeEditor?.selection.active.character ?? 0)
            },
            document: {
                $mid: 1,
                fsPath: activeEditor?.document.uri.fsPath,
                external: activeEditor?.document.uri.toString(),
                path: activeEditor?.document.uri.path,
                scheme: "file"
            }
        }
    };
}

function findEditorByPath(path: string): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find(e => e.document.uri.path === path);
}

function processNextEvaluation(): void {
    if (evaluationQueue.length > 0) {
        sendToWolfram();
    } else {
        treeDataProvider.refresh();
    }
}

function setDecorations(result: any): void {
    const editor = findEditorByPath(result.params.document.path);
    if (!editor) return;

    const decorationsToRemove = Array.from(runningLines.values()).filter(d => 
        d.range.start.line === result.params.position.line - 1
    );

    decorationsToRemove.forEach(d => {
        runningLines.delete(d.range);
    });

    editor.setDecorations(runningDecorationType, Array.from(runningLines.values()));
}

function onResult(result: any): void {
}

function unescapeHtml(html: string): string {
    if (!html) return '';
    const entities: { [key: string]: string } = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        arrow: "->",
        rarr: "->"
    };

    return html.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (_match, ent) => {
        if (ent.charAt(0) === '#') {
            const isHex = ent.charAt(1)?.toLowerCase() === 'x';
            const num = isHex ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
            return isNaN(num) ? _match : String.fromCodePoint(num);
        }
        return entities[ent] ?? _match;
    });
}

async function updateResults(editor: vscode.TextEditor | undefined, result: any, print: boolean, input: string = "", file: any = ""): Promise<void> {
    if (!editor) return;

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

                decoration.range = new vscode.Range(
                    new vscode.Position(line, 0),
                    new vscode.Position(line, 200)
                );

            }
        }

        updateEditorDecorations(editor, decoration, startLine);
        
        if (print) {
            insertPrintOutput(editBuilder, result, rawoutput);
        }

        updatePlotsProvider(input, output, result.params.id);
        logExecutionTime();
    });
}

function prepareOutput(result: any, file: any): { output: string; rawoutput: string } {
    now = Date.now();
    let output: string;
    let rawoutput: string;

    if (result.params.load) {
        output = fs.readFileSync(result.params.output).toString();
        outputChannel.appendLine("Time to read file: " + (Date.now() - now) + " ms");
        if (output === '') output = " ";
        rawoutput = output;
    } else {
        output = result.params.output;

        output = output.replace("class=\"grid\"", "id=\"myTable\" class=\"datatable\"");
        rawoutput = result.params.raw || output;
    }

    if (result.params.messages.length > 0) {
        output += "<div class='errors' style='color: #801f01;'>" +
            result.params.messages.reduce((acc: any, cur: any) => acc + "<br>" + cur, "") +
            "</div>";
    }

    output = unescapeHtml(output);

    return { output, rawoutput };
}

function updatePrintResults(input: string, output: string): void {
    if (printResults.length > MAX_PRINT_RESULTS) {
        printResults.shift();
    }

    const inputSnippet = input.length > 1000 ? 
        input.slice(0, 250) + "..." + input.slice(-250) : input;

    if (!output.includes("<img")) {
        outputChannel.appendLine(output.slice(0, 8192));
    }
}


  function escapeHtml(str:String) {
    if (str == null) return "";
    return String(str)
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/&/g, "&amp;");
  }

function createResultDecoration(result: any, rawoutput: string, output: string): vscode.DecorationOptions {
    const nextline = Math.min(result.params.position.line - 1, 
        vscode.window.activeTextEditor?.document.lineCount ?? 1 - 1);
    const startChar = vscode.window.activeTextEditor?.document.lineAt(nextline).range.end.character ?? 0;

    let hoverMessage = output;
    if (hoverMessage.length > 8192 && !hoverMessage.includes("<img")) {
        hoverMessage = "Large output: " + hoverMessage.substring(0, 100) + "...";
    }
    if (result.params.messages.length > 0) {
        hoverMessage += "\n" + result.params.messages;
    }

    const decoration: vscode.DecorationOptions = {
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

function createMarkdownHoverMessage(content: string): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString(content, false);
    markdown.isTrusted = true;
    markdown.supportHtml = true;
    return markdown;
}

function updateEditorDecorations(editor: vscode.TextEditor, decoration: vscode.DecorationOptions, line: number): void {
    const uri = editor.document.uri.fsPath.toString();
    let decorations = editorDecorations.get(uri) ?? [];

    decorations = decorations.filter(d => d.range.start.line < line);
    decorations.push(decoration);

    editorDecorations.set(uri, decorations);
    editor.setDecorations(variableDecorationType, decorations);
}

function insertPrintOutput(editBuilder: vscode.TextEditorEdit, result: any, rawoutput: string): void {
    const outputPosition = new vscode.Position(result.params.position.line + 1, 0);
    try {
        editBuilder.insert(outputPosition, ("\n" + unescapeHtml(rawoutput) + "\n\n").slice(0, 8192));
    } catch (error) {
        console.log("Error: " + error);
    }
}

function updatePlotsProvider(input: string, output: string, id: number): void {
    const inputSnippet = input.length > 1000 ? 
        input.slice(0, 250) + "..." + input.slice(-250) : input.trim();

    if (plotsInputsOutputs.has(id)) {
        const currentEntry = plotsInputsOutputs.get(id)!;
        currentEntry[0].input = inputSnippet;
        currentEntry[0].output = output + "<br>" + currentEntry[0].output ;
        plotsInputsOutputs.set(id, currentEntry);

        output = currentEntry[0].output
    }
    
    plotsProvider.newOutput(id, output);
}

function logExecutionTime(): void {
    outputChannel.appendLine("Time to update decorations: " + (Date.now() - now) + " ms");
}

function runExpression(expression: string, line: number, end: number): void {
    const editor = vscode.window.activeTextEditor ?? vscode.window.visibleTextEditors[0];
    decorateRunningLine(new vscode.Position(line, end));
    wolframKernelClient?.sendRequest("runExpression", { 
        print: false, 
        expression, 
        textDocument: editor?.document, 
        line, 
        end 
    });
}

function wolframBusy(params: any): void {
    const outputPosition = params.position ? 
        new vscode.Position(Math.max(0, params.position.start.line - 1), params.position.start.character) :
        new vscode.Position(0, 0);

    if (params.position) {
        createBusyDecoration(outputPosition, params.text);
    }

    updateBusyStatus(params.busy, outputPosition);
}

function createBusyDecoration(outputPosition: vscode.Position, text: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const decorationLine = editor.document.lineAt(Math.max(0, outputPosition.line - 1));
    const start = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 10);
    const end = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 20);
    const range = new vscode.Range(start, end);

    const decoration: vscode.DecorationOptions = {
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

function updateBusyStatus(busy: boolean, outputPosition: vscode.Position): void {
    if (busy) {
        wolframBusyQ = true;
        wolframStatusBar.text = "$(extensions-sync-enabled~spin) Running (" + outputPosition.line + ")";
        wolframStatusBar.show();
    } else {
        wolframBusyQ = false;
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();

        const editor = vscode.window.activeTextEditor;
        editor?.setDecorations(runningDecorationType, []);
        runningLines.clear();
    }
}

function updateDecorations(decorationfile: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || (editor.document.uri.scheme !== 'file' && editor.document.uri.scheme !== 'untitled')) {
        return;
    }

    fs.readFile(decorationfile, "utf8", (err: any, data: any) => {
        if (err || data === '') {
            outputChannel.appendLine(err);
            return;
        }

        processDecorationUpdate(editor, data);
    });
}

function processDecorationUpdate(editor: vscode.TextEditor, data: string): void {
    try {
        newDecorations = JSON.parse(data);
        const uri = editor.document.uri.fsPath.toString();

        if (newDecorations[uri] === workspaceDecorations[uri]) return;

        workspaceDecorations[uri] = newDecorations[uri];
        editorDecorations = createDecorationsFromData(workspaceDecorations[uri]);

        editor.setDecorations(variableDecorationType, editorDecorations.get(uri) || []);
        editor.setDecorations(runningDecorationType, Array.from(runningLines.values()));
    } catch {
        newDecorations = {};
    }
}

function createDecorationsFromData(decorationData: any): Map<string, vscode.DecorationOptions[]> {
    // const editorDecorations: vscode.DecorationOptions[] = [];

    let editor = vscode.window.activeTextEditor;
    if (!editor) return new Map();
    const uri = editor.document.uri.fsPath.toString();
    const decorations = editorDecorations.get(uri) ?? [];
    
    Object.keys(decorationData).forEach((d: any) => {
        const decoration: vscode.DecorationOptions = decorationData[d];
        decoration.hoverMessage = createMarkdownHoverMessage(decoration.hoverMessage as string);
        decorations.push(decoration);
    });
    editorDecorations.set(uri, decorations);

    return editorDecorations;
}

function updateLintDecorations(decorationfile: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || (editor.document.uri.scheme !== 'file' && editor.document.uri.scheme !== 'untitled')) {
        return;
    }

    fs.readFile(decorationfile, "utf8", (err: any, data: any) => {
        if (err) {
            outputChannel.appendLine(err);
            return;
        }

        processLintDecorationUpdate(editor, data);
    });
}

function processLintDecorationUpdate(editor: vscode.TextEditor, data: string): void {
    newDecorations = JSON.parse(data);
    const uri = editor.document.uri.fsPath.toString();

    if (newDecorations[uri] === workspaceDecorations[uri]) return;

    workspaceLintDecorations[uri] = newDecorations[uri];
    const editorLintDecorations: vscode.DecorationOptions[] = [];
    
    Object.keys(workspaceLintDecorations[uri]).forEach((d: any) => {
        editorLintDecorations.push(workspaceLintDecorations[uri][d]);
    });

    editor.setDecorations(lintDecorationType, editorLintDecorations);
    editor.setDecorations(runningDecorationType, []);
}

function clearPlots(): void {
    printResults = [];
    updateOutputPanel();
}

function clearResults(): void {
    plotsProvider.clearResults();
}

function updateOutputPanel(): void {
}

function runTextCell(location: vscode.Range): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = new vscode.Selection(
        new vscode.Position(location.start.line, location.start.character),
        new vscode.Position(location.end.line, 0)
    );

    // get all the ranges that are within the selection
    const ranges = extractRangesFromPositions(editor.document.uri.fsPath.toString());
    const rangesBeforeCursor = ranges.filter(range => range.end.line <= selection.end.line + 1);
    if (rangesBeforeCursor.length === 0) return;

    // run the evaluation for each range before the cursor
    for (const r of rangesBeforeCursor) {
        if (r.start.line >= selection.start.line) {
            let s: vscode.Selection = new vscode.Selection(
                new vscode.Position(r.start.line, r.start.character),
                new vscode.Position(r.end.line, r.end.character)
            );
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

function printInWolfram(print = true): void {
    runInWolfram(print);
}

async function didChangeSelection(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "wolfram" || editor.document.uri.scheme === 'untitled') {
        return;
    }

    const cursorBlock0 = await cursorBlock();
    if (!cursorBlock0) return;

    editor.setDecorations(blockDecorationType, []);

    const decoration: vscode.DecorationOptions = {
        range: new vscode.Range(
            cursorBlock0.start.line,
            0,
            cursorBlock0.end.line,
            cursorBlock0.end.character
        )
    };
    
    editor.setDecorations(blockDecorationType, [decoration]);
}

async function cursorBlock(): Promise<any> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    for (let i = 0; i < cursorLocations.length - 1; i++) {
        if ((cursorLocations[i]["start"]["line"] <= editor.selection.active.line) &&
            (cursorLocations[i]["end"]["line"] >= editor.selection.active.line)) {
            return cursorLocations[i];
        }
    }
    return editor.selection;
}

async function didChangeTextDocument(event: vscode.TextDocumentChangeEvent): Promise<void> {
    return new Promise((resolve) => {
        const editor = vscode.window.activeTextEditor;
        const selection = editor?.selection?.active;

        if (!editor || event.document.uri.fsPath.toString() !== editor.document.uri.fsPath.toString() || 
            event.contentChanges.length === 0) {
            resolve();
            return;
        }

        clearDecorations();
        updateRunningLines(editor, selection);
        updateEditorDecorationsAfterChange(editor, selection);
        resolve();
    });
}

function updateRunningLines(editor: vscode.TextEditor, selection: vscode.Position | undefined): void {
    const newRunningLines = new Map();
    
    runningLines.forEach((d: vscode.DecorationOptions, key: vscode.Range) => {
        if (selection && d.range.start.line < selection.line) {
            newRunningLines.set(key, d);
        }
    });

    runningLines = newRunningLines;
    editor.setDecorations(runningDecorationType, Array.from(runningLines.values()));
}

function updateEditorDecorationsAfterChange(editor: vscode.TextEditor, selection: vscode.Position | undefined): void {
    if (!selection) return;

    const newEditorDecorations = (editorDecorations.get(editor.document.uri.fsPath.toString()) ?? [])
        .filter((d: vscode.DecorationOptions) => d.range.start.line < selection.line);
    
    editorDecorations.set(editor.document.uri.fsPath.toString(), newEditorDecorations);
    editor.setDecorations(variableDecorationType, newEditorDecorations);
}

function clearDecorations(): void {
    const editor = vscode.window.activeTextEditor;
    const uri = editor?.document.uri.toString();

    if (uri && uri in workspaceDecorations) {
        editorDecorations.set(uri, []);
        editor?.setDecorations(variableDecorationType, []);
        editor?.setDecorations(runningDecorationType, []);
    }
}

function isUntitled(document: vscode.TextDocument | undefined): boolean {
    return document ? 
        (document.languageId === "wolfram" && document.uri.scheme === 'untitled') : 
        false;
}

function didOpenTextDocument(document: vscode.TextDocument): void {
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

function handleDocumentWithoutFolder(document: vscode.TextDocument): void {
    if (document.languageId === 'wolfram' && !clients.has("default")) {
        totalClients++;
        clients.set("default", [wolframClient, wolframKernelClient]);
    }
    
    if (isUntitled(document) && clients.size === 0) {
        clients.set("default", [wolframClient, wolframKernelClient]);
    }
}

function handleDocumentWithFolder(document: vscode.TextDocument, folder: vscode.WorkspaceFolder): void {
    if (!clients.has(folder.uri.toString()) && document.languageId === "wolfram") {
        totalClients++;
        clients.set(folder.uri.toString(), [wolframClient, wolframKernelClient]);
    }
}

function updateTreeDataProvider(): void {
    treeDataProvider.refresh();
}

function didSaveTextDocument(event: vscode.TextDocument): void {
    clearDecorations();
    didOpenTextDocument(event);
}

function createFile(): void {
    vscode.workspace.openTextDocument(vscode.Uri.parse("untitled:.wl")).then((document: vscode.TextDocument) => {
        vscode.window.showTextDocument(document);
    });
}

function createNotebook(): void {
    vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.nb"));
}

function createNotebookInteractive(): void {
    vscode.window.showNotebookDocument(new InteractiveNotebook(
        vscode.Uri.parse("untitled:untitled.nb"),
        "wolfram-interactive",
        "wolfram-interactive",
        false,
        true,
        [],
        ["wolfram"],
        wolframKernelClient
    ));
}

function createNotebookScript(): void {
    vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(""), 'jupyter-notebook');
}

function didChangeWindowState(state: vscode.WindowState): void {
    if (wolframKernelClient?.state === 2) {
        wolframKernelClient.sendNotification("windowFocused", {
            focus: state.focused,
        });
    }
}

function startWolframTerminal(): void {
    const { cmd, args } = getTerminalCommand();
    const activeWolframTerminal = vscode.window.createTerminal("wolfram terminal", cmd, args);
    activeWolframTerminal.show(true);
}

function getTerminalCommand(): { cmd: string; args: string[] } {
    if (process.platform === "win32") {
        return { cmd: 'cmd.exe', args: ['/c', 'wolframscript.exe'] };
    } else {
        return { cmd: 'rlwrap wolframscript', args: [] };
    }
}

function runInTerminal(): void {
    if (!vscode.window.activeTerminal) {
        startWolframTerminal();
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const text = editor.document.getText(new vscode.Range(editor.selection.start, editor.selection.end));
    vscode.window.activeTerminal?.sendText(text);
}

function help(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selectedText = getSelectedText(editor);
    const url = `https://reference.wolfram.com/language/ref/${selectedText}.html`;
    createHelpPanel(url, selectedText);
}

function getSelectedText(editor: vscode.TextEditor): string {
    const selections = editor.selections;
    let text = "";
    
    for (const selection of selections) {
        text += editor.document.getText(new vscode.Range(selection.start, selection.end));
    }
    
    return text;
}

function createHelpPanel(url: string, text:string): void {
    const helpPanel = vscode.window.createWebviewPanel(
        "wolframHelp",
        "Doc: " + text,
        2,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    helpPanel.webview.html = generateHelpPanelHtml(url);
}

function generateHelpPanelHtml(url: string): string {
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

function wolframHelp(url: string): void {
    createHelpPanel(url, "");
}

function stringHelp(string: string): void {
    const url = `https://reference.wolfram.com/language/ref/${string}.html`;
    createHelpPanel(url, string);
}

function textToSection(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const lines = editor.document.getText(new vscode.Range(selection.start, selection.end)).split('\n');
    const newlines = lines.map(line => `(*${line}*)`).join('\n');

    editor.edit(editbuilder => {
        editbuilder.replace(selection, newlines);
    });
}

function textFromSection(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const lines = editor.document.getText(new vscode.Range(selection.start, selection.end)).split('\n');
    const newlines = lines.map(line => line.replace(/^\(\*/, "").replace(/\*\)$/, "")).join('\n');

    editor.edit(editbuilder => {
        editbuilder.replace(selection, newlines);
    });
}

function showTrace(): void {
    runInWolfram(false, true);
}

function errorMessages(params: any): void {
    const file = params["file"];
    
    fs.readFile(file, "utf8", (err: any, data: any) => {
        if (err) return;

        const errors = JSON.parse(data);
        const errorString = errors.map((e: any) => {
            vscode.window.showErrorMessage(e.toString());
            return e.toString();
        }).join("\n");

        printResults.push([params["input"], errorString]);
        updateOutputPanel();
    });
}

function startWLSPDebugger(): void {
}

class WLSPConfigurationProvider implements vscode.DebugConfigurationProvider {
    resolveDebugConfiguration(
        folder: WorkspaceFolder | undefined, 
        config: DebugConfiguration, 
        token?: CancellationToken
    ): ProviderResult<DebugConfiguration> {
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
