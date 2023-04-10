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
    ErrorHandler, ErrorAction, CloseHandlerResult, CloseAction, ErrorHandlerResult, Message
} from 'vscode-LanguageClient/node';
import { resolve } from 'path';
import { deactivate } from './notebook';
import { time } from 'console';
import { WolframDebugConfigProvider, WolframDebugAdapterDescriptorFactory } from './debug'

let wolframStatusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
let wolframVersionText = "$(extensions-sync-enabled~spin) Wolfram";
let progressStatus: any;

const fs = require('fs')
import { WolframScriptSerializer, WolframNotebookSerializer } from './notebook';
import { WolframNotebookController } from './notebookController';
import { InteractiveNotebookSerializer, InteractiveNotebook } from './interactiveNotebook';
import { InteractiveController } from './interactiveController';
import { WolframScriptController } from './scriptController';
import { workspaceSymbolProvider } from './treeDataProvider';
import { DataViewProvider } from './dataPanel';
import { PlotsViewProvider } from './plotsView';


// export let wolframClient: LanguageClient;
// export let wolframKernelClient: LanguageClient;

// let wolfram: cp.ChildProcess;
// let wolframKernel: cp.ChildProcess;

let clientPort: number = 7710;
let kernelPort: number = 7910;
let debugPort: number = 7810;
let lspPath: string;
let kernelPath: string;
let context!: vscode.ExtensionContext;
let cursorFile: String = "";
let outputChannel!: vscode.OutputChannel;
let kernelOutputChannel!: vscode.OutputChannel;
let clients: Map<string, (LanguageClient | undefined)[]> = new Map();
let processes: cp.ChildProcess[] = [];

var wolfram!: cp.ChildProcess;
var wolframKernel!: cp.ChildProcess;

let withProgressCancellation: vscode.CancellationTokenSource | undefined;

let dataProvider: DataViewProvider;
let plotsProvider: PlotsViewProvider;

export var wolframClient: LanguageClient | undefined;
export var wolframKernelClient: LanguageClient | undefined;
export let scriptserializer: vscode.NotebookSerializer;
export let notebookSerializer: WolframNotebookSerializer;
export let notebookcontroller: WolframNotebookController;
export let interactiveController: InteractiveController;
export let interactiveNotebookSerializer: InteractiveNotebookSerializer;
export let scriptController: WolframScriptController;
export let treeDataProvider: workspaceSymbolProvider;
export let wlspdebugger: WolframDebugAdapterDescriptorFactory;

export async function startLanguageServer(context0: vscode.ExtensionContext, outputChannel0: vscode.OutputChannel): Promise<void> {


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

    scriptserializer = new WolframScriptSerializer()
    notebookSerializer = new WolframNotebookSerializer()

    // notebookcontroller = new WolframNotebookController()
    scriptController = new WolframScriptController(context)

    interactiveNotebookSerializer = new InteractiveNotebookSerializer()
    interactiveController = new InteractiveController()

    const provider = new WLSPConfigurationProvider();
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('wlspdebugger', provider));

    // context.subscriptions.push(
    //     vscode.workspace.registerNotebookSerializer('wolfram-notebook', notebookSerializer)
    // );

    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('wolfram-script', scriptserializer)
    );

    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('wolfram-interactive', interactiveNotebookSerializer)
    );

    dataProvider = new DataViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DataViewProvider.viewType, dataProvider)
    )

    plotsProvider = new PlotsViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(PlotsViewProvider.viewType, plotsProvider)
    )

    context.subscriptions.push(notebookcontroller);
    context.subscriptions.push(scriptController);
    context.subscriptions.push(interactiveController);

    fp(debugPort).then(([freePort]: number[]) => {
        wlspdebugger = new WolframDebugAdapterDescriptorFactory(freePort, context, outputChannel);
    })

    context.subscriptions.push(
        debug.registerDebugConfigurationProvider("wlspdebugger", new WolframDebugConfigProvider()));
    context.subscriptions.push(
        debug.registerDebugAdapterDescriptorFactory('wlspdebugger', wlspdebugger)
    )

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
    vscode.commands.registerCommand('wolfram.debug', startWLSPDebugger)
    vscode.commands.registerCommand('wolfram.updateTreeData', updateTreeDataProvider)
    vscode.commands.registerCommand('wolfram.clearPlots', clearPlots)


    vscode.workspace.onDidOpenTextDocument(didOpenTextDocument);
    vscode.workspace.onDidSaveTextDocument(didSaveTextDocument);
    vscode.workspace.onDidChangeConfiguration(updateConfiguration);
    vscode.workspace.onDidChangeTextDocument(didChangeTextDocument);


    treeDataProvider = new workspaceSymbolProvider();
    vscode.window.onDidChangeTextEditorSelection(didChangeSelection);
    vscode.window.onDidChangeWindowState(didChangeWindowState);
    vscode.window.registerTreeDataProvider("wolframSymbols", treeDataProvider);

    vscode.workspace.textDocuments.forEach(didOpenTextDocument);
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        for (const folder of event.removed) {
            const client = clients.get(folder.uri.toString());
            if (client) {
                clients.delete(folder.uri.toString());
                client[0]?.stop();
                client[1]?.stop();
            }
        }

        for (const folder of event.added) {
            const client = clients.get(folder.uri.toString());
            if (client) {
                client[1]?.sendNotification("didChangeWorkspaceFolders", folder)
            }
        }
    });

    // setTimeout(updateRunningLines, 500);

    // restart()
}

function stopKernel() {
    wolframKernelClient?.sendNotification("Shutdown");
}
function startWLSPDebugger() {

    // wolfDebugger.startDebugger()
}

function updateConfiguration() {
    if (vscode.workspace.getConfiguration().get("wlsp.liveDocument")) {
    }

    wolframKernelClient?.sendNotification(
        "updateConfiguration",
        { "abortOnError": vscode.workspace.getConfiguration().get("wlsp.abortOnError") });
}

export async function restart(): Promise<void> {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    wolframBusyQ = false;
    evaluationQueue = [];
    withProgressCancellation?.cancel()
    wolframStatusBar.text = "Wolfram ?"
    wolframStatusBar.show();

    clients.forEach((client, key) => {
        if (client) {
            client[0]?.stop();
            client[1]?.stop();
        }
        clients.delete(key);
    });

    editorDecorations.clear();
    e?.setDecorations(variableDecorationType, []);

    stopWolfram(undefined, wolfram);
    stopWolfram(undefined, wolframKernel);

    // sleep for 1 second to allow the kernel to shut down
    await new Promise(resolve => setTimeout(resolve, 5000));

    startWLSP(0);
    startWLSPKernelSocket(0);

    return new Promise((resolve) => {
        vscode.workspace.textDocuments.forEach(didOpenTextDocument);

        resolve()
    })
}

export function stop() {
    const promises: (Thenable<void> | undefined)[] = [];
    for (const client of clients.values()) {
        promises.push(client[0]?.stop());
        promises.push(client[1]?.stop());
    }

    wolframKernelClient?.sendNotification("Shutdown");

    for (let p of processes) {
        stopWolfram(undefined, p)
    }
    wlspdebugger.dispose()

    return Promise.all(promises).then(() => undefined);

}

function completionRequest(params: any) {
    console.log("completionRequest", params)
    return {}
}

async function onclientReady(): Promise<void> {
    function checkClient(cb: any) {
        if (wolframClient !== undefined && wolframClient.initializeResult !== undefined) {

            wolframClient?.onNotification("updatePositions", updatePositions);
            wolframClient?.onNotification("updateLintDecorations", updateLintDecorations);
            // wolframClient?.onRequest("textDocument/completion", completionRequest);


            // wolframClient.handleFailedRequest

            wolframClient?.sendRequest("wolframVersion").then((result: any) => {
                wolframVersionText = result["output"];
                wolframStatusBar.text = result["output"];
            })

            // wolframClient?.sendRequest("DocumentSymbolRequest");
            treeDataProvider.getBuiltins();

        } else {
            setTimeout(() => {
                checkClient(cb)
            }, 500);
        }
    }

    return new Promise((resolve) => {
        checkClient(resolve)
    })
}

let temporaryDir = "";
export async function onkernelReady(): Promise<void> {
    function checkKernel(cb: any) {
        if (wolframKernelClient !== undefined && wolframKernelClient.initializeResult !== undefined) {

            // wolframKernelClient?.onNotification("onRunInWolfram", onRunInWolfram);
            wolframKernelClient?.onNotification("wolframBusy", wolframBusy);
            // wolframKernelClient?.onNotification("updateDecorations", updateDecorations);
            wolframKernelClient?.onNotification("updateVarTable", updateVarTable);
            // wolframKernelClient?.onNotification("moveCursor", moveCursor);
            // wolframKernelClient?.onNotification("updateTreeItems", updateTreeItems);
            wolframKernelClient?.onNotification("pulse", pulse);
            wolframKernelClient?.onNotification("errorMessages", errorMessages)


            if (vscode.window.activeTextEditor) {
                let workspacefolder: any = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor?.document.uri)

                if (workspacefolder) {
                    vscode.workspace.findFiles("**/*.wl*", workspacefolder.uri).then(result => {
                        wolframKernelClient?.sendNotification("didChangeWorkspaceFolders", result)
                    })
                }


            }
            wolframKernelClient?.sendRequest("storageUri").then((result: any) => {
                temporaryDir = result;
            });
            treeDataProvider.getSymbols(undefined);
            pulse();
            cb()

        } else {
            setTimeout(() => {
                checkKernel(cb)
            }, 500)
        }
    }


    return new Promise((resolve) => {
        checkKernel(resolve)
    })

}

let pulseInterval: any; // NodeJS.Timeout;
function promiseWithTimeout(ms: number, promise: Promise<any> | undefined) {
    // Create a promise that rejects in <ms> milliseconds
    let timeout = new Promise((resolve, reject) => {
        let id = setTimeout(() => {
            clearTimeout(id);
            reject('Timed out in ' + ms + 'ms.')
        }, ms)
    })

    // Returns a race between our timeout and the passed in promise
    return Promise.race([
        promise,
        timeout
    ])
}


function pulse() {

    promiseWithTimeout(1000 * 60 * 10, wolframKernelClient?.sendRequest("pulse").then((a: any) => {
        resolve("true")
    })).then(
        (a: any) => {
            setTimeout(pulse, 1000 * 60 * 10)
        }
    ).catch(error => {
        console.log(error)
        outputChannel.appendLine("ping failed")

        vscode.window.showWarningMessage("The Wolfram kernel has not responded in >10 minutes. Would you like to restart it?",
            "Yes", "No").then((result) => {
                if (result === "Yes") {
                    restart()
                }
                if (result === "No") {
                    setTimeout(pulse, 1000 * 60 * 10)
                } else {

                }
            })
    })


    // pulseInterval = setInterval(ping, 60000)
}

function newFunction() {
    treeDataProvider = new workspaceSymbolProvider();
}

function clearResults() {
    // while(printResults.pop) {
    // }
    printResults = [];
    updateOutputPanel()
}

// function updateTreeItems(result:any) {
//     treeDataProvider?.getSymbols(result["file"])
// }

let movePositions: { [index: string]: any } = {};
function updatePositions(params: any) {
    params["result"].forEach((e: any) => {
        if (!(e["location"]["uri"] in movePositions)) {
            movePositions[e["location"]["uri"]] = {}
        }
        movePositions[e["location"]["uri"]][e["name"]] = e;
    });
}

function runToLine() {
    let e: any = vscode.window.activeTextEditor;
    let sel: vscode.Position = e?.selection.active;
    let outputPosition: vscode.Position = new vscode.Position(sel.line + 1, 0);
    let r: vscode.Selection = new vscode.Selection(
        0,
        0,
        sel.line,
        sel.character
    );

    // e.revealRange(r, vscode.TextEditorRevealType.Default);

    let printOutput = false;

    let output = true;
    // if (plotsPanel?.visible == true) {
    //     output = true;
    // }
    let evaluationData = { range: r, textDocument: e?.document, print: printOutput, output: output, trace: false };
    evaluationQueue.push(evaluationData);

    if (!wolframKernelClient) {
        restart().then(() => {
            evaluationQueue.push(evaluationData);
            sendToWolfram(printOutput);
            return
        })
    }

    if (evaluationQueue.length == 1 || wolframBusyQ == false) {
        sendToWolfram(printOutput);
    }
}


let variableTable: any = {}
function updateVarTable(vars: any) {
    fs.readFile(vars["values"], "utf8", (err: any, data: any) => {
        if (err) {
            console.log(err)
            return
        }

        let updatedVariables = JSON.parse(data)
        Object.keys(updatedVariables).map((k: any) => {
            variableTable[k] = updatedVariables[k].slice(0, 1000)
        })



        let vars: string = "";

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
      </vscode-data-grid-row>`
        });
        vars += "</vscode-data-grid>";

        dataProvider.updateView(vars);

    })
}

let runningLines: any[] = []
function moveCursor2(position: vscode.Position) {
    let e = vscode.window.activeTextEditor;
    let uri = e?.document.uri.toString();
    if (!(uri === undefined) && (uri in movePositions)) {
        let newPos: any[] = Object.values(movePositions[uri]).filter((p: any) => {
            let r = p["location"]["range"] as vscode.Range;
            return ((r.start.line <= position.line) && (position.line <= r.end.line))
        })

        if (newPos.length > 0) {
            let outputPosition = new vscode.Position(newPos[0]["location"]["range"]["end"]["line"] + 1, 0);
            if (e) {
                e.selection = new vscode.Selection(outputPosition, outputPosition);
                e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            }
            decorateRunningLine(outputPosition);
        } else {
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
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    for (let i: any = 0; i < cursorLocations.length - 1; i++) {
        if (e) {
            if (
                (cursorLocations[i]["start"]["line"] <= e?.selection.active.line) &&
                (cursorLocations[i]["end"]["line"] >= e?.selection.active.line)
            ) {
                return cursorLocations[i]
                break;
            }
        }
    }
    return e?.selection
}

let cursorMoved = false;
let cursorLocations: any[] = [];
function moveCursor() {
    // if (cursorMoved == true) {
    //     cursorMoved = false;
    //     return
    // }

    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    fs.readFile(cursorFile, "utf8", (err: any, data: any) => {
        if (err) {
            console.log(err)
            return
        }
        cursorLocations = JSON.parse(data);

        let top: any = new vscode.Position(0, 0);
        let bottom: any = (e?.selection.active.line || 0) + 1;
        for (let i: any = 0; i < cursorLocations.length - 1; i++) {
            if (e) {
                if (cursorLocations[i + 1]["start"]["line"] > e?.selection.active.line) {
                    top = cursorLocations[i]["end"];
                    bottom = cursorLocations[i + 1]["start"]["line"];
                    break;
                }
            }
        }

        let outputPosition: vscode.Position = new vscode.Position(bottom, 0);

        if (e?.document.lineCount == outputPosition.line) {
            e?.edit(editBuilder => {
                editBuilder.insert(outputPosition!, "\n")
            })
        }

        if (e) {
            e.selection = new vscode.Selection(outputPosition, outputPosition);
            // cursorMoved = true;
            e?.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            decorateRunningLine(new vscode.Position(top["line"], top["character"]));
        }
    })
}


function decorateRunningLine(outputPosition: vscode.Position) {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (e) {

        // if (outputPosition.line == 0) {
        //     return
        // }

        let decorationLine = e.document.lineAt(outputPosition.line)
        let start = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 10)
        let end = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 20)
        let range = new vscode.Range(start, end)

        let d: vscode.DecorationOptions = {
            "range": range,
            "renderOptions": {
                "after": {
                    "contentText": "...",
                    "color": "foreground",
                    "margin": "20px"
                }
            }
        }

        runningLines.push(d);
        e.setDecorations(runningDecorationType, runningLines);

        let documentDecorations = editorDecorations.get(e.document.uri.toString()) ?? [];

        for (let i = 0; i < (editorDecorations.get(e.document.uri.toString()) ?? []).length; i++) {
            const d1 = (editorDecorations.get(e.document.uri.toString()) ?? [])[i];
            if (d1.range.start.line == d.range.start.line) {
                (editorDecorations.get(e.document.uri.toString()) ?? []).splice(i, 1)
            }
        }
        e.setDecorations(variableDecorationType, (editorDecorations.get(e.document.uri.toString()) ?? []));
        // updateDecorations([d]);
    }
}

function updateRunningLines() {
    let editor = vscode.window.activeTextEditor;
    if (wolframBusyQ === true) {
        runningLines.forEach((d: vscode.DecorationOptions) => {
            let r = d["renderOptions"];
            let a = r ? ["after"] : { "contentText": "" };
            let c = a ? ["contentText"] : "";
            if (d["renderOptions"]!["after"]!["contentText"] == ".") {
                d["renderOptions"]!["after"]!["contentText"] = ".."
            } else
                if (d["renderOptions"]!["after"]!["contentText"] == "..") {
                    d["renderOptions"]!["after"]!["contentText"] = "..."
                } else
                    if (d["renderOptions"]!["after"]!["contentText"] == "...") {
                        d["renderOptions"]!["after"]!["contentText"] = "...."
                    } else
                        if (d["renderOptions"]!["after"]!["contentText"] == "....") {
                            d["renderOptions"]!["after"]!["contentText"] = "....."
                        } else
                            if (d["renderOptions"]!["after"]!["contentText"] == ".....") {
                                d["renderOptions"]!["after"]!["contentText"] = "."
                            }
        })
        editor?.setDecorations(runningDecorationType, runningLines)

        setTimeout(updateRunningLines, 500)
    } else {
        editor?.setDecorations(runningDecorationType, [])
    }
}

function abort() {
    try {
        wolframKernel.stdin?.write("\x03");
    } catch {
        console.log("Wolfram kernel interrupt failed")
    }
}

let starttime = 0;
let inputs: String[] = [];
function runInWolfram(printOutput = false, trace = false) {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    let sel: vscode.Selection = e!.selection;

    //  is document untitiled?
    if (!isUntitled(e?.document)) {
        e?.document.save();
    }


    // let cursorMoved = false;
    // vscode.window.onDidChangeTextEditorSelection((e: vscode.TextEditorSelectionChangeEvent) => {
    //     cursorMoved = true;
    // })

    moveCursor()
    let output = true;
    // if (plotsPanel?.visible == true) {
    //     output = true;
    // }

    let evaluationData = { range: sel, textDocument: e?.document, print: printOutput, output: output, trace: trace };
    evaluationQueue.push(evaluationData);

    // showPlots();

    // check if is undefined


    if (typeof wolframKernelClient === 'undefined') {
        restart().then(() => {
            evaluationQueue.push(evaluationData);
            sendToWolfram(printOutput);
            return
        })
    }

    if (evaluationQueue.length == 1 || wolframBusyQ == false) {
        sendToWolfram(printOutput);
    }

}

let evaluationQueue: any[] = [];
function sendToWolfram(printOutput = false, sel: vscode.Selection | undefined = undefined) {

    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (!sel) { sel = e!.selection };
    let outputPosition: vscode.Position = new vscode.Position(sel.active.line + 1, 0);

    if (e?.document.lineCount == outputPosition.line) {
        e?.edit(editBuilder => {
            editBuilder.insert(outputPosition!, "\n")
        })
    }

    if (e?.document.uri.scheme === 'vscode-notebook-cell') {
        e.selection = new vscode.Selection(0, 0, 1, 1)
        try {
            starttime = Date.now();
            wolframKernelClient?.sendNotification("runInWolfram", { range: sel, textDocument: e.document, print: false });
        } catch (err) {
            console.log(err);
            restart()
        }

    }
    else if (e?.document.uri.scheme === 'file' || e?.document.uri.scheme === 'untitled') {
        // e.selection = new vscode.Selection(outputPosition, outputPosition);
        // e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);

        // wolframKernelClient.sendNotification("moveCursor", {range:sel, textDocument:e.document});

        if (!wolframBusyQ) {
            wolframBusyQ = true;
            let evalNext = evaluationQueue.pop();
            withProgressCancellation = new vscode.CancellationTokenSource();
            progressStatus = vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: "Wolfram (" + (evalNext.range.start.line + 1) + ")",
                cancellable: true
            }, (prog, withProgressCancellation) => {
                return new Promise((resolve, reject) => {

                    withProgressCancellation.onCancellationRequested(ev => {
                        console.log("Aborting Wolfram evaluation");
                        // stopWolfram(undefined, wolframKernel);
                        restart();
                        resolve(false)
                    })

                    wolframKernelClient?.onNotification("onRunInWolfram", (result: any) => {
                        onRunInWolfram(result)
                        resolve(true)
                    })


                    wolframKernelClient?.onNotification("onRunInWolframIO", (result: any) => {
                        onRunInWolframIO(result)
                        resolve(true)
                    })

                    // wolframStatusBar.text = "$(extensions-sync-enabled~spin) Wolfram Running";
                    // wolframStatusBar.show();
                    starttime = Date.now();

                    if (wolframKernelClient?.state === 3 || wolframKernelClient?.state === 1) {
                        console.log("Kernel is not running")
                        resolve(false)
                    }

                    wolframKernelClient?.sendNotification("runInWolfram", evalNext)
                }).catch((err) => {
                    console.log(err);
                    restart()
                })

            })
        }
    }
}

function setDecorations(result: any) {
    const editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors;
    let e = editors.filter((e) => {
        return e.document.uri.path === result["params"]["document"]["path"]
    })[0];

    for (let i = 0; i < runningLines.length; i++) {
        const d = runningLines[i];
        if (d.range.start.line == result["params"]["position"]["line"] - 1) {
            runningLines.splice(i, 1)
            e.setDecorations(runningDecorationType, runningLines)
        }
    }
}

function onRunInWolframIO(result: any) {
    let end = Date.now();
    outputChannel.appendLine(`Execution time: ${end - starttime} ms`);

    wolframBusyQ = false;
    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.show();

    setDecorations({params:result})
    const editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors;
    let e = editors.filter((e) => {
        return e.document.uri.path === result["document"]["path"]
    })[0];

    updateResults(e, {params:result}, result["print"], result["input"])
}

let evaluationResults: { [key: string]: string } = {}
function onRunInWolfram(file: any) {
    let end = Date.now();
    outputChannel.appendLine(`Execution time: ${end - starttime} ms`);

    wolframBusyQ = false;
    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.show();

    let result: any;

    // try {
    //     result = bson.deserialize(fs.readFileSync(file["file"]), {encoding: null})
    // }

    fs.readFile(file["file"], null, ((err: any, data: any) => {
        if (err) {
            outputChannel.appendLine(err);
            return
        }
        try {
            try {
                result = JSON.parse(Buffer.from(data).toString())
            } catch {
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
                            "line": (vscode.window.activeTextEditor?.selection.active.line ?? 0) + 1,
                            "character": (vscode.window.activeTextEditor?.selection.active.character ?? 0)
                        },
                        "document": {
                            "$mid": 1,
                            "fsPath": vscode.window.activeTextEditor?.document.uri.fsPath,
                            "external": vscode.window.activeTextEditor?.document.uri.toString(),
                            "path": vscode.window.activeTextEditor?.document.uri.path,
                            "scheme": "file"
                        }
                    }
                }
            }

            setDecorations(result);
            const editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors;
            let e = editors.filter((e) => {
                return e.document.uri.path === result["params"]["document"]["path"]
            })[0];
            if (e.document.uri.scheme == 'vscode-notebook-cell') {

            } else {
                // inputs.push(file["input"])
                updateResults(e, result, result["params"]["print"], file["input"]);
            }

        } catch (err) {
            outputChannel.appendLine("Output data error: " + err)
        }

        if (evaluationQueue.length > 0) {
            sendToWolfram();
        } else {
            treeDataProvider.refresh();
        }
    }))
    // try{
    //     result = JSON.parse(fs.readFileSync(file["file"], "utf8"))["params"];
    // } catch {
    //     return
    // }
}

let maxPrintResults = 20;
let printResults: any[] = [];
let editorDecorations: Map<string, vscode.DecorationOptions[]> = new Map();
// let printResults: Map<string, string> = new Map();
function updateResults(e: vscode.TextEditor | undefined, result: any, print: boolean, input: string = "") {

    if (typeof (e) !== "undefined") {
        e.edit(editBuilder => {

            if (print) {
                let sel: vscode.Selection = e!.selection;
                let outputPosition: vscode.Position = new vscode.Position(result["params"]["position"]["line"] + 1, 0);
                try {
                    editBuilder.insert(outputPosition, (result["params"]["result"] + "\n\n").slice(0, 8192));
                } catch (error) {
                    console.log("Error: " + error);
                }
            }

            let output;
            if (result["params"]["load"]) {
                output = fs.readFileSync(result["params"]["output"]).toString()
            } else {
                output = result["params"]["output"] + "<br>" + result["params"]["messages"].join("<br>");
            }

            if (printResults.length > maxPrintResults) {
                printResults.shift();
            }

            printResults.push(
                [input,
                    output]
            )
            if (output.includes("<img")) {
            } else {
                outputChannel.appendLine(result["params"]["result"].slice(0, 8192));
            }
            // let out = console_outputs.pop();
            // printResults.push(out);
            // showOutput();

            let backgroundColor = "editor.background";
            let foregroundColor = "editor.foreground";
            let hoverMessage = result["params"]["output"];

            // is <img> tags in hoverMessage string

            if (hoverMessage.length > 8192 && !hoverMessage.includes("<img")) {
                hoverMessage = "Large output: " + hoverMessage.slice(0, 200) + "..."
            } 
            if (result["params"]["messages"].length > 0) {
                backgroundColor = "red";
                hoverMessage += "\n" + result["params"]["messages"];
            }

            let resultString = result["params"]["result"];
            if (resultString.length > 300) {
                resultString = resultString.slice(0, 100) + "..." + resultString.slice(-100);
            }

            let startChar = e.document.lineAt(result["params"]["position"]["line"] - 1).range.end.character;

            let decoration: vscode.DecorationOptions = {
                "range": new vscode.Range(
                    result["params"]["position"]["line"] - 1,
                    startChar + 10,
                    result["params"]["position"]["line"] - 1,
                    startChar + 200,
                ),
                "renderOptions": {
                    "after": {
                        "contentText": resultString,
                        "backgroundColor": new vscode.ThemeColor("editor.foreground"),
                        "color": new vscode.ThemeColor("editor.background"),
                        "margin": "10px 0 0 10px",
                        "border": "2px solid blue",
                        "textDecoration": "none; white-space: pre; border-top: 0px; border-right: 0px; border-bottom: 0px; border-radius: 2px"

                    }
                },
                "hoverMessage": hoverMessage
            }
            let h: vscode.MarkdownString = new vscode.MarkdownString((decoration.hoverMessage as string), false)
            h.isTrusted = true;
            h.supportHtml = true;
            decoration.hoverMessage = h;

            for (let i = 0; i < (editorDecorations.get(e.document.uri.toString()) ?? []).length; i++) {
                const d = (editorDecorations.get(e.document.uri.toString()) ?? [])[i];
                if (d.range.start.line == result["params"]["position"]["line"] - 1) {
                    (editorDecorations.get(e.document.uri.toString()) ?? []).splice(i, 1)
                }
            }

            if (editorDecorations.get(e.document.uri.toString()) == undefined) {
                editorDecorations.set(e.document.uri.toString(), [])
            }

            editorDecorations.get(e.document.uri.toString())?.push(decoration)


            e.setDecorations(variableDecorationType,
                editorDecorations.get(e.document.uri.toString())!);
            updateOutputPanel();
        })
    };


}

function runExpression(expression: string, line: 0, end: 100) {
    let e: vscode.TextEditor | undefined = (vscode.window.activeTextEditor == null) ? vscode.window.visibleTextEditors[0] : vscode.window.activeTextEditor;


    decorateRunningLine(new vscode.Position(line, end));
    wolframKernelClient?.sendRequest("runExpression", { print: false, expression: expression, textDocument: e?.document, line: line, end: end }).then((result: any) => { });
}

let wolframBusyQ: boolean = false;
function wolframBusy(params: any) {
    if (params.busy === true) {
        //kernelStatusBar.color = "red";
        wolframBusyQ = true;
        wolframStatusBar.text = "$(extensions-sync-enabled~spin) Wolfram Running";
        wolframStatusBar.show();
    } else {
        //kernelStatusBar.color = "yellow";
        wolframBusyQ = false;
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();
    }
}

let workspaceDecorations: { [index: string]: vscode.DecorationOptions[]; } = {};
let workspaceLintDecorations: { [index: string]: vscode.DecorationOptions[]; } = {};
function clearDecorations() {
    let editor = vscode.window.activeTextEditor;
    let uri = editor?.document.uri.toString();

    if (uri && uri in workspaceDecorations) {
        // workspaceDecorations[uri] = {} as vscode.DecorationOptions[];

        // editor?.setDecorations(variableDecorationType,[] )
    }
}

let newDecorations: { [index: string]: vscode.DecorationOptions[]; } = {};
function updateDecorations(decorationfile: string) {
    let editor = vscode.window.activeTextEditor;
    if (editor?.document.uri.scheme === 'file' || editor?.document.uri.scheme === 'untitled') {
        //editor.setDecorations(variableDecorationType, []);

        fs.readFile(decorationfile, "utf8", (err: any, data: any) => {
            if (err) {
                outputChannel.appendLine(err)
                return
            }

            if (data == '') {
                return
            }

            newDecorations = JSON.parse(data)

            if (typeof (editor) === "undefined") {
                return;
            }
            let uri = editor.document.uri.toString();

            let editorDecorations: vscode.DecorationOptions[] = [];
            if (newDecorations[uri] === workspaceDecorations[uri]) {
                return
            } else {
                workspaceDecorations[uri] = newDecorations[uri];
                Object.keys(workspaceDecorations[uri]).forEach((d: any) => {
                    let decoration: vscode.DecorationOptions = workspaceDecorations[uri][d];
                    let h: vscode.MarkdownString = new vscode.MarkdownString((decoration.hoverMessage as string), false)
                    h.isTrusted = true;
                    h.supportHtml = true;
                    decoration.hoverMessage = h;
                    editorDecorations.push(workspaceDecorations[uri][d]);
                });

                runningLines = [];
                editor.setDecorations(variableDecorationType, editorDecorations);
                editor.setDecorations(runningDecorationType, runningLines);
            }
        })

        // try{
        //     ;
        // } catch{
        //     newDecorations = {};
        //     return
        // }
    }
}

function updateLintDecorations(decorationfile: string) {
    let editor = vscode.window.activeTextEditor;
    if (editor?.document.uri.scheme === 'file' || editor?.document.uri.scheme === 'untitled') {
        //editor.setDecorations(variableDecorationType, []);

        fs.readFile(decorationfile, "utf8", (err: any, data: any) => {
            if (err) {
                outputChannel.appendLine(err)
                return
            }
            newDecorations = JSON.parse(data)

            if (typeof (editor) === "undefined") {
                return;
            }
            let uri = editor.document.uri.toString();

            let editorLintDecorations: vscode.DecorationOptions[] = [];
            if (newDecorations[uri] === workspaceDecorations[uri]) {
                return
            } else {
                workspaceLintDecorations[uri] = newDecorations[uri];
                Object.keys(workspaceLintDecorations[uri]).forEach((d: any) => {
                    editorLintDecorations.push(workspaceLintDecorations[uri][d]);
                });

                runningLines = [];
                editor.setDecorations(lintDecorationType, editorLintDecorations);
                editor.setDecorations(runningDecorationType, runningLines);
            }
        })

        // try{
        //     ;
        // } catch{
        //     newDecorations = {};
        //     return
        // }
    }
}

let variableDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(
    {
        // light: {
        //     color: new vscode.ThemeColor("editor.background")
        // },
        // dark: {
        //     color: new vscode.ThemeColor("editor.background")
        // },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed

    }
);

let lintDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(
    {
        backgroundColor: 'none',
        light: {
            color: new vscode.ThemeColor("foreground")
        },
        dark: {
            color: new vscode.ThemeColor("foreground")
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    }
);

let runningDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(
    {
        backgroundColor: 'none',
        light: {
            color: new vscode.ThemeColor("foreground")
        },
        dark: {
            color: new vscode.ThemeColor("foreground")
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    }
);

let blockDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(
    {
        backgroundColor: 'none',
        fontWeight: 'bold',
        overviewRulerColor: new vscode.ThemeColor("foreground"),
        overviewRulerLane: vscode.OverviewRulerLane.Right
    }
)

function clearPlots() {
    printResults = [];
    updateOutputPanel();
}


function updateOutputPanel() {
    // let out = "";
    // let reversed = printResults.slice().reverse();
    // printResults.forEach((row) => {
    //     let data = "";
    //     try {
    //         data += row[1];
    //     } catch (e) {
    //         console.log((e as Error).message);
    //         data += "Error reading result";
    //     }

    //     if (data !== "") {

    //         let inputString = "";
    //         if (row[0].length > 500) {
    //             inputString = row[0].substring(0, 100) + " <<...>> " + row[0].substring(row[0].length - 100, row[0].length);
    //         } else {
    //             inputString = row[0];
    //         }

    //         out += "<div id='result-header'>In: " + inputString +
    //             "</div>" +

    //             "<div id='result'>" +
    //             data +
    //             "</div>";
    //     }
    // })

    plotsProvider.updateView(printResults.reverse())
}

async function startWLSPIO(id: number): Promise<void> {
    let serverOptions: ServerOptions = {
        run: { command: "/usr/local/bin/wolframscript", args: ["-file", path.join(context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp-io.wl'))) ], transport: TransportKind.stdio
        },
        debug: { command: "/usr/local/bin/wolframscript", args: ["-script", path.join(context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp-io.wl'))) ], transport: TransportKind.stdio}
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'wolfram' }],
        diagnosticCollectionName: 'Wolfram Language',
        outputChannel: outputChannel,
        revealOutputChannelOn: 1
    }

    wolframClient = new LanguageClient('wolfram', 'Wolfram Language', serverOptions, clientOptions);
    wolframClient.registerProposedFeatures();

    wolframClient.traceOutputChannel.show();

    wolframClient.onDidChangeState((event) => {
        console.log("state changed");
        console.log(event.newState);

    });

    await wolframClient?.start();

    console.log("client ready");

    return new Promise(async (resolve) => {
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
    })
}

let console_outputs: string[] = []
let socketsClosed = 0;
async function startWLSP(id: number): Promise<void> {
    let timeout: any;

    let serverOptions: ServerOptions = function () {
        return new Promise(async (resolve, reject) => {
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
                    })
                }, 100)
            })

            socket.on('error', function (err: any) {
                outputChannel.appendLine("Client Socket error: " + err)
                retries += 1;
                if (retries < 10) {
                    if (err.code === 'ECONNREFUSED') {
                        timeout = setTimeout(() => {
                            socket.connect(clientPort, "127.0.0.1");
                        }, 1500)
                    }
                } else {
                    vscode.window.showErrorMessage("Wolfram LSP failed to connect. Please check that wolframscript is installed and running and that the port " + clientPort + " is not in use.",
                        { title: "Try Again?", command: "wolfram.restart" }).then(async (item) => {
                            if (item?.command === "wolfram.restart") {
                                restart()
                            }
                        })
                }
            })

            socket.on("close", () => {
                outputChannel.appendLine("Client Socket closed")
                stopWolfram(undefined, wolfram);
            });

            socket.on('timeout', () => {
                outputChannel.appendLine("Client Socket timeout")
            });

            socket.on('ready', () => {
            })

            socket.on('drain', () => {
                // outputChannel.appendLine("Client Socket is draining")
                // outputChannel.appendLine(new Date().toLocaleTimeString())
            })


            socket.on("end", () => {
                outputChannel.appendLine("Client Socket end");
            })


            fp(clientPort).then(async ([freePort]: number[]) => {
                clientPort = freePort + id;
                await load(wolfram, lspPath, clientPort, outputChannel).then((r: any) => {
                    wolfram = r
                    socket.connect(clientPort, "127.0.0.1", () => {
                        socket.setKeepAlive(true);
                    });
                });
            })
        })
    };

    let clientErrorHandler = new ClientErrorHandler();
    let clientOptions: LanguageClientOptions = {
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

    return new Promise(async (resolve) => {
        wolframClient = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);

        onclientReady();

        // wolframClient.onReady().then(() => {
        //     onclientReady();
        // })

        setTimeout(() => {
            let disposible: vscode.Disposable | undefined;

            wolframClient?.start();
            outputChannel.appendLine("Client Started")
            // outputChannel.appendLine(new Date().toLocaleTimeString())
            // if (disposible) {context.subscriptions.push(disposible)};
            resolve()
        }, 1000)

    });
}

let attempts = 0;
async function startWLSPKernelIO(id: number): Promise<void> {
    attempts += 1;
    console.log("Starting WLSP Kernel: " + attempts)

    let serverOptions: ServerOptions = {
        run: { module: context.asAbsolutePath('dist/server.js'), transport: TransportKind.ipc },
        debug: { module: context.asAbsolutePath('dist/server.js'), transport: TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6009"] } }
    };

    let kernelErrorHandler = new ClientErrorHandler();
    let clientOptions: LanguageClientOptions = {
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

    return new Promise(async (resolve) => {

        wolframKernelClient = new LanguageClient('wolfram-kernel', 'Wolfram Language Kernel Server', serverOptions, clientOptions);

        onclientReady();

        setTimeout(() => {
            let disposible: vscode.Disposable | undefined;
            wolframKernelClient?.start();
            wolframKernelClient?.outputChannel.appendLine("Kernel Client Started")
            // outputChannel.appendLine(new Date().toLocaleTimeString())
            // if (disposible) {context.subscriptions.push(disposible)};
            resolve()
        }, 100)

    });
}


async function startWLSPKernelSocket(id: number): Promise<void> {
    let timeout: any;

    let serverOptions: ServerOptions = function () {
        return new Promise(async (resolve, reject) => {
            let socket = new net.Socket();
            let retries = 0;

            socket.setMaxListeners(5);

            // socket.on("data", (data) => {
            // outputChannel.appendLine("WLSP Kernel Data: " + data.toString().slice(0, 200))
            // console_outputs.push(data.toString());
            // });

            socket.on('connect', () => {
                clearTimeout(timeout);
                setTimeout(() => {
                    resolve({
                        reader: socket,
                        writer: socket
                    })
                }, 100)
            })

            socket.on('error', function (err: any) {
                outputChannel.appendLine("Kernel Socket error: ")
                retries += 1;
                if (retries < 10) {
                    if (err.code === 'ECONNREFUSED') {
                        outputChannel.appendLine("Kernel failed to connect")
                        timeout = setTimeout(() => {
                            socket.connect(kernelPort, "127.0.0.1", () => {
                                socket.setKeepAlive(true);
                            });
                        }, 2000)
                    }
                } else {
                    vscode.window.showErrorMessage("Wolfram Kernel failed to connect. Please check that wolframscript is installed and running and that the port " + kernelPort + " is not in use.",
                        { title: "Try Again?", command: "wolfram.restart" }).then(async (item) => {
                            if (item?.command === "wolfram.restart") {
                                restart()
                            }
                        })
                }
            })

            socket.on("close", () => {
                outputChannel.appendLine(new Date().toLocaleTimeString())
                outputChannel.appendLine("Kernel Socket closed")
                stopWolfram(undefined, wolframKernel)
            });

            socket.on('timeout', () => {
                outputChannel.appendLine("Kernel Socket timeout")
            });

            socket.on('ready', () => {
                clearTimeout(timeout);
                setTimeout(() => {
                    resolve({
                        reader: socket,
                        writer: socket
                    }),
                        100
                })
            })

            socket.on('drain', () => {
                // outputChannel.appendLine("Kernel Socket is draining")
            })


            socket.on("end", async () => {
                outputChannel.appendLine("Kernel Socket end");
                // attempt to revive the kernel
                await new Promise(resolve => setTimeout(resolve, 5000));
                // stopWolfram(undefined, wolframKernel)  
            })


            fp(kernelPort).then(async ([freePort]: number[]) => {
                kernelPort = freePort + id;
                await load(wolframKernel, kernelPath, kernelPort, outputChannel).then((r: any) => {
                    wolframKernel = r
                    socket.connect(kernelPort, "127.0.0.1", () => {
                        socket.setKeepAlive(true);
                    });
                });
            })
        })
    };

    let kernelErrorHandler = new ClientErrorHandler();
    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel,
        markdown: {
            isTrusted: true,
            supportHtml: true
        },
        errorHandler: kernelErrorHandler
    };

    return new Promise(async (resolve) => {
        wolframKernelClient = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);

        onkernelReady();
        // wolframKernelClient.onReady().then(() => {
        //     onkernelReady();
        // })


        setTimeout(() => {
            let disposible: vscode.Disposable | undefined;
            // disposible = wolframKernelClient?.start();
            wolframKernelClient?.start().then(() => {
                outputChannel.appendLine("Kernel Started")
                resolve()
            });
            // outputChannel.appendLine(new Date().toLocaleTimeString())
            // if (disposible) {context.subscriptions.push(disposible)};
        }, 100)

    });
}

// 

async function delay(ms: number) {
    return new Promise((resolve) => { setTimeout(resolve, ms) })
}

function connectKernelClient(outputChannel: any, context: any) {

}

async function load(wolfram: cp.ChildProcess, path: string, port: number, outputChannel: vscode.OutputChannel): Promise<cp.ChildProcess> {
    return new Promise((resolve) => {
        let executablePath: string = vscode.workspace.getConfiguration('wolfram').get('executablePath') || "wolframscript";
        try {
            if (process.platform === "win32") {
                wolfram = cp.spawn('cmd.exe', ['/c', executablePath?.toString(), '-file', path, port.toString(), path], { detached: false });
            } else {
                wolfram = cp.spawn(executablePath?.toString(), ['-file', path, port.toString(), path], { detached: true });
            }

            wolfram.stdout?.once('data', (data: any) => {
                outputChannel.appendLine("WLSP Loading: " + data.toString())
                setTimeout(() => {resolve(wolfram)}, 1000)
                // resolve(wolfram)
            });


            if (wolfram.pid != undefined) {
                // console.log("Launching wolframscript: " + wolfram.pid.toString());
                processes.push(wolfram)
            }
            // else {
            //     // console.log("Launching wolframscript: pid unknown");
            // }


            wolfram.on('SIGPIPE', (data) => {
                console.log("SIGPIPE");
            });


            wolfram.stdout?.on('error', (data) => {
                console.log("STDOUT Error" + data.toString());
            });

            wolfram.stdout?.on('data', (data) => {
                outputChannel.appendLine("WLSP: " + data.toString())
                // vscode.window.showInformationMessage(data.toString().slice(0, 1000))
            });


        } catch (error) {
            console.log(error)
            vscode.window.showErrorMessage("Wolframscript failed to load.")
            resolve(wolfram)
        }
    })
}



function stopWolfram(client: LanguageClient | undefined, client_process: any): Promise<void> {
    return new Promise((resolve) => {
        // client?.stop();
        try {
            client?.stop();
        } catch { }

        try {
            let cp = require('child_process');
            let isWin = /^win/.test(process.platform);
            if (isWin) {
                cp.exec('taskkill /PID ' + client_process.pid + ' /T /F', function (error: any, stdout: any, stderr: any) { });
                resolve()

            } else {
                console.log("Killing process: " + client_process.pid);
                cp.exec('kill -9 ' + client_process.pid, function (error: any, stdout: any, stderr: any) { });
                resolve()
                // process.kill(-client_process.pid, 'SIGKILL');

                // cp.exec('kill -9 ' + client_process.pid , function (error: any, stdout: any, stderr: any) {})
                // client_process.kill();
                // kill(client_process.pid);
            }
        } catch (e) {
            console.log((e as Error).message)
            resolve()
        }
    })
}

let kill = function (pid: any) {
    let signal = 'SIGTERM';
    let callback = function () { };
    var killTree = false;
    if (killTree) {
        psTree(pid, function (err: any, children: any) {
            [pid].concat(
                children.map(function (p: any) {
                    return p.PID;
                })
            ).forEach(function (pid) {
                try { process.kill(pid, signal); }
                catch (ex) {
                    console.log("Failed to kill: " + pid)
                    console.log((ex as Error).message)
                }
            });
            callback();
        });
    } else {
        try { process.kill(pid, signal); }
        catch (ex) {
            console.log("Failed to kill wolfram process")
        }
        callback();
    }
};






function runTextCell(location: vscode.Range) {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    let sel: vscode.Selection = new vscode.Selection(
        new vscode.Position(location.start.line, location.start.character),
        new vscode.Position(location.end.line, location.end.character)
    );
    let evaluationData = { range: sel, textDocument: e?.document, print: false, output: true, trace: false };
    evaluationQueue.push(evaluationData);
    sendToWolfram(false)
}

function printInWolfram(print = true) {
    runInWolfram(print);
}

function didChangeSelection(event: vscode.TextEditorSelectionChangeEvent) {

    let editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    editor?.setDecorations(blockDecorationType, []);
    let cursorBlock0: any = cursorBlock();
    let d: vscode.DecorationOptions = {
        "range": new vscode.Range(
            cursorBlock0.start.line,
            0,
            cursorBlock0.end.line,
            cursorBlock0.end.character
        )
    }
    editor?.setDecorations(blockDecorationType, [d]);
}

async function didChangeTextDocument(event: vscode.TextDocumentChangeEvent): Promise<void> {
    // didOpenTextDocument(event.document);
    // remove old decorations
    // console.log(event)

    return new Promise((resolve) => {


        let editor = vscode.window.activeTextEditor;
        let selection = editor?.selection?.active!

        if (event.document.uri.toString() !== editor?.document.uri.toString()) {
            return
        }

        if (event.contentChanges.length === 0) {
            return
        }

        clearDecorations();
        // Remove old running lines and decorations
        let newrunninglines = [];
        newrunninglines = runningLines.filter((d: vscode.DecorationOptions) => {
            return d.range.start.line < selection?.line
        })
        runningLines = newrunninglines;
        editor.setDecorations(runningDecorationType, runningLines)

        let newEditorDecorations = [];
        newEditorDecorations = (editorDecorations.get(editor.document.uri.toString()) ?? []).filter((d: vscode.DecorationOptions) => {
            return d.range.start.line < selection.line
        })
        editorDecorations.set(editor.document.uri.toString(), newEditorDecorations);
        editor.setDecorations(variableDecorationType, (editorDecorations.get(editor.document.uri.toString()) ?? []))

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
        resolve()
    })
}

function isUntitled(document: vscode.TextDocument | undefined) {
    if (document) {
        return (document.languageId === "wolfram" && document.uri.scheme === 'untitled')
    } else {
        return false;
    }
}


let totalClients: number = 0;
function didOpenTextDocument(document: vscode.TextDocument): void {
    if (document.languageId !== 'wolfram' || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
        return;
    }

    let folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
        if (document.languageId == 'wolfram' && !clients.has("default")) {
            totalClients++;
            // startWLSP(totalClients)
            // startWLSPKernel(totalClients)
            clients.set("default", [wolframClient, wolframKernelClient])
            return;
        }
        return
    }

    if (!clients.has(folder.uri.toString()) && document.languageId === "wolfram") {
        totalClients++;
        // startWLSP(totalClients)
        // startWLSPKernel(totalClients)
        clients.set(folder.uri.toString(), [wolframClient, wolframKernelClient])
    }

    if (isUntitled(document) && clients.size == 0) {
        // startWLSP()
        // startWLSPKernel()

        clients.set("default", [wolframClient, wolframKernelClient])
        return;

    }

    return;
}

function updateTreeDataProvider() {
    treeDataProvider.refresh();
}

function didSaveTextDocument(event: vscode.TextDocument): void {
    // treeDataProvider.refresh();
    clearDecorations();
    didOpenTextDocument(event);
    return;
}


function createFile() {
    vscode.workspace.openTextDocument(vscode.Uri.parse("untitled:.wl")).then((document: vscode.TextDocument) => {
        vscode.window.showTextDocument(document);
    });
}

function createNotebook() {
    vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.nb")).then((document: vscode.NotebookDocument) => {
        // vscode.window.showNotebookDocument(document);
    });
}

function createNotebookInteractive() {
    // vscode.workspace.openNotebookDocument("wolfram-interactive").then((document: vscode.NotebookDocument) => {
    //     // vscode.window.showNotebookDocument(document);
    // });
    vscode.window.showNotebookDocument(new InteractiveNotebook(
        vscode.Uri.parse("untitled:untitled.nb"),
        "wolfram-interactive",
        "wolfram-interactive",
        false,
        true,
        [],
        ["wolfram"],
        wolframKernelClient));

}

function createNotebookScript() {
    vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(""), 'jupyter-notebook');

    // vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.wl")).then((document: vscode.NotebookDocument) => {
    //     // vscode.window.showNotebookDocument(document);
    // });

}


function didChangeWindowState(state: vscode.WindowState) {
    if (wolframClient !== null || wolframClient !== undefined) {
        if (state.focused === true) {
            wolframClient?.sendNotification("windowFocused", true);
        } else {

            wolframClient?.sendNotification("windowFocused", false);
        }
    }
}

function startWolframTerminal() {
    let cmd: string;
    let args: string[];
    if (process.platform === "win32") {
        cmd = 'cmd.exe';
        args = ['/c', 'wolframscript.exe'];
    } else {
        cmd = 'rlwrap wolframscript';
        args = [];
    }
    let activeWolframTerminal: vscode.Terminal;
    activeWolframTerminal = vscode.window.createTerminal("wolfram terminal", cmd, args);
    activeWolframTerminal.show(true);
}

function runInTerminal() {
    if (!vscode.window.activeTerminal) {
        startWolframTerminal();
    }

    let e: any = vscode.window.activeTextEditor;
    let d: vscode.TextDocument = e!.document;
    let sel = e!.selections;
    vscode.window.activeTerminal?.sendText(d.getText(new vscode.Range(e.selection.start, e?.selection.end)));
}

function help() {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    let d = e!.document;
    let sel = e!.selections;
    let txt = "";
    let dataString = "";
    for (var x = 0; x < sel.length; x++) {
        txt = txt + d.getText(new vscode.Range(sel[x].start, sel[x].end));
    }

    let url = "https://reference.wolfram.com/language/ref/" + txt + ".html";
    // opn(url);

    let helpPanel = vscode.window.createWebviewPanel(
        "wolframHelp",
        "Wolfram Help",
        2,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );
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
    `
}

function wolframHelp(url: string) {

    let helpPanel = vscode.window.createWebviewPanel(
        "wolframHelp",
        "Wolfram Help",
        2,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

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
    `
}

function stringHelp(string: string) {
    let url = "https://reference.wolfram.com/language/ref/" + string + ".html";

    let helpPanel = vscode.window.createWebviewPanel(
        "wolframHelp",
        "Wolfram Help",
        2,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

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
    `
}

function textToSection() {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;

    let lines: string[];
    let newlines: string = "";

    if (e) {
        let sel: vscode.Selection = e.selection;
        lines = e?.document.getText(new vscode.Range(sel.start, sel.end)).split('\n');

        lines.forEach(l => {
            newlines += "(*" + l + "*)\n"
        });


        e.edit(editbuilder => {
            editbuilder.replace(sel, newlines.trimRight())
        })
    }
}


function textFromSection() {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;

    let lines: string[];
    let newlines: string = "";

    if (e) {
        let sel: vscode.Selection = e.selection;
        lines = e?.document.getText(new vscode.Range(sel.start, sel.end)).split('\n');

        lines.forEach(l => {
            newlines += l.replace(/^\(\*/, "").replace(/\*\)$/, "") + "\n"
        });


        e.edit(editbuilder => {
            editbuilder.replace(sel, newlines.trimRight())
        })
    }
}


function showTrace() {
    runInWolfram(false, true)
}

function errorMessages(params: any) {
    let file = params["file"];
    fs.readFile(file, "utf8", (err: any, data: any) => {
        if (err) return

        let errors = JSON.parse(data)

        let errorString = ""
        errors.forEach((e: any) => {
            errorString += e.toString() + "\n"
            vscode.window.showErrorMessage(e.toString())
        });

        printResults.push(
            [params["input"],
                errorString]
        )
        updateOutputPanel();
    })
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

class WLSPConfigurationProvider implements vscode.DebugConfigurationProvider {

    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

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
                return undefined;	// abort launch
            });
        }

        return config;
    }
}


class ClientErrorHandler implements ErrorHandler {
    error(error: Error, message: Message | undefined, count: number | undefined): ErrorHandlerResult {
        console.log("Error: " + error.message)
        return {
            action: ErrorAction.Continue
        }
    }

    closed(): CloseHandlerResult {
        console.log("Closed")
        return {
            action: CloseAction.DoNotRestart
        }
    }

}