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
import * as launch from './launch';

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
import { send } from 'process';

// let wolfram: cp.ChildProcess;
// let wolframKernel: cp.ChildProcess;

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
let debugging: boolean = false;

export let wolframClient: LanguageClient | undefined;
export let wolframKernelClient: LanguageClient | undefined;
wolframClient = undefined;
wolframKernelClient = undefined;
let firstKernelLaunched = false;
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


    launch.startWLSP(0, lspPath).then((client) => {
        wolframClient = client;
        onclientReady()
        // wolframClient?.onDidChangeState((event: StateChangeEvent) => {
        //     // if (event.newState == State.Running) {
        //         onclientReady()
        //     // }
        // })
    });

    vscode.commands.registerCommand('wolfram.runInWolfram', runInWolfram);
    await launch.startWLSPKernelSocket(0, kernelPath).then((client) => {
        wolframKernelClient = client;
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

    plotsProvider = new PlotsViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(PlotsViewProvider.viewType, plotsProvider)
    )

    // plotsProvider._view?.webview.onDidReceiveMessage((data:any) => {
    //     if (data.text === "restart") {
    //         restartKernel();
    //     }
    // }, undefined, context.subscriptions);

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

export async function restartKernel(): Promise<LanguageClient | undefined> {

    wolframKernelClient = await launch.restartKernel();

    await onkernelReady()

    return new Promise((resolve) => {
        resolve(wolframKernelClient)
    });
}

export async function restart(): Promise<void> {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    wolframBusyQ = false;
    evaluationQueue = [];
    withProgressCancellation?.cancel()
    wolframStatusBar.text = "Wolfram ?"
    wolframStatusBar.show();

    editorDecorations.clear();
    e?.setDecorations(variableDecorationType, []);

    launch.restart().then((clients) => {
        wolframClient = clients[0];
        wolframKernelClient = clients[1];
        onclientReady()
        onkernelReady()
    })

    return new Promise((resolve) => {
        vscode.workspace.textDocuments.forEach(didOpenTextDocument);

        resolve()
    })
}
function completionRequest(params: any) {
    console.log("completionRequest", params)
    return {}
}

async function onclientReady(): Promise<void> {

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
}

let temporaryDir = "";
export async function onkernelReady(): Promise<void> {
    // wolframKernelClient?.onNotification("onRunInWolfram", onRunInWolfram);
    wolframKernelClient?.onNotification("wolframBusy", wolframBusy);
    // wolframKernelClient?.onNotification("updateDecorations", updateDecorations);
    wolframKernelClient?.onNotification("updateVarTable", updateVarTable);
    // wolframKernelClient?.onNotification("moveCursor", moveCursor);
    // wolframKernelClient?.onNotification("updateTreeItems", updateTreeItems);
    // wolframKernelClient?.onNotification("pulse", pulse);
    wolframKernelClient?.onNotification("errorMessages", errorMessages)
    wolframKernelClient?.onNotification("updateInputs", updateInputs)
    wolframKernelClient?.onNotification("onResult", onResult)


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
    // pulse();

    return new Promise((resolve) => {
        resolve()
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


async function pulse() {

    if (wolframKernelClient !== undefined && wolframKernelClient?.state == 2) {
        promiseWithTimeout(1000 * 60 * 2,


            wolframKernelClient?.sendRequest("pulse").then((a: any) => {
                wolframStatusBar.color = "red";
                setTimeout(() => {
                    wolframStatusBar.color = new vscode.ThemeColor("statusBar.foreground");
                }, 1000 * 30)
                resolve("true")
            })).then(
                (a: any) => {
                    setTimeout(pulse, 1000 * 60 * 2)
                }
            ).catch(error => {
                console.log(error)
                outputChannel.appendLine("The Wolfram kernel has not responded in >2 minutes")
            })


    }
    // pulseInterval = setInterval(ping, 60000)
}

function newFunction() {
    treeDataProvider = new workspaceSymbolProvider();
}

function clearResults() {
    plotsProvider.clearResults();
}

// function updateTreeItems(result:any) {
//     treeDataProvider?.getSymbols(result["file"])
// }

let movePositions: { [index: string]: any } = {};
async function updatePositions(params: any) {
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
    evaluationQueue.unshift(evaluationData);

    if (!wolframKernelClient) {
        restart().then(() => {
            evaluationQueue.unshift(evaluationData);
            sendToWolfram(printOutput);
            return
        })
    }

    if (evaluationQueue.length == 1) {
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

let runningLines: Map<vscode.Range, vscode.DecorationOptions> = new Map();
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


async function cursorBlock() {
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
async function moveCursor(selection: vscode.Selection) {
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
        let uri: string | undefined = e?.document.uri.toString() as string;
        cursorLocations = JSON.parse(data)[uri] ?? [];

        let top: any = selection.active;
        let bottom: any = e?.selection.active.line! + 1 || 0;
        for (let i: any = 0; i < cursorLocations.length; i++) {
            if (e) {
                // This is the current block being executed
                if ((cursorLocations[i]["start"]["line"] <= selection.active.line) && (cursorLocations[i]["end"]["line"] >= selection.active.line)) {
                    // There is a block after this one
                    if (cursorLocations.length > i + 1) {
                        top = cursorLocations[i]["end"];
                        bottom = cursorLocations[i + 1]["start"]["line"];
                        break;
                    } else {
                        top = cursorLocations[i]["end"];
                        bottom = top.line + 1;
                        break;
                    }
                }
            }
        }
        // console.log(selection.active.line, bottom)
        let outputPosition: vscode.Position = new vscode.Position(bottom, 0);

        // if the outputposition is equal to the lineCount and the last line is not empty, add a new line
        if (e?.document.lineCount == (outputPosition.line) && e?.document.lineAt(outputPosition.line - 1).text != "") {
            e?.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(outputPosition.line + 1, 0), "\n")
            })
        }

        if (e) {
            e.selection = new vscode.Selection(outputPosition, outputPosition);
            // cursorMoved = true;
            e?.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            decorateRunningLine(new vscode.Position(top["line"], top["character"]));

            let newEditorDecorations = [];
            let selection = e.selection.active;
            newEditorDecorations = (editorDecorations.get(e.document.uri.toString()) ?? []).filter((d: vscode.DecorationOptions) => {
                return d.range.start.line < selection.line
            })
            editorDecorations.set(e.document.uri.toString(), newEditorDecorations);
            e.setDecorations(variableDecorationType, (editorDecorations.get(e.document.uri.toString()) ?? []))
        }
    })
}


function decorateRunningLine(outputPosition: vscode.Position) {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (e) {

        // if (outputPosition.line == 0) {
        //     return
        // }

        let decorationLine = e.document.lineAt(outputPosition.line-1)
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

        e.setDecorations(runningDecorationType, Array.from(runningLines.values()));

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
        editor?.setDecorations(runningDecorationType, Array.from(runningLines.values()));

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
let inputs: String[] = []; function runInWolfram(printOutput = false, trace = false) {

    let unsavedDocumentsQ = false;
    let editors = vscode.window.visibleTextEditors;
    editors.forEach((e: vscode.TextEditor) => {
        if (e.document.isUntitled) {
            unsavedDocumentsQ = true;
            // vscode.window.showInformationMessage("Please save all files before running in Wolfram")
        }
    });

    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    let sel: vscode.Selection = e!.selection;

    // let cursorMoved = false;
    // vscode.window.onDidChangeTextEditorSelection((e: vscode.TextEditorSelectionChangeEvent) => {
    //     cursorMoved = true;
    // })

    moveCursor(sel)
    let output = true;
    // if (plotsPanel?.visible == true) {
    //     output = true;
    // }

    let evaluationData = { range: sel, textDocument: e?.document, print: printOutput, output: output, trace: trace };
    evaluationQueue.unshift(evaluationData);

    // showPlots();

    // check if wolframkernelclient is undefined



    if (wolframKernelClient == undefined || wolframKernelClient?.state == 1) {
        restartKernel().then(() => {
            // evaluationQueue.unshift(evaluationData);
            sendToWolfram(printOutput);
            return
        })
    }

    sendToWolfram(printOutput);

    // if (evaluationQueue.length == 1) {
    //     sendToWolfram(printOutput);
    // }

}

let evaluationQueue: any[] = [];
let sendToWolframRetry = 0;
async function sendToWolfram(printOutput = false, sel: vscode.Selection | undefined = undefined) {

    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (!sel) { sel = e!.selection };
    let outputPosition: vscode.Position = new vscode.Position(sel.active.line, 0);

    if (plotsProvider._view?.visible == false || plotsProvider._view?.visible == undefined) {
        vscode.commands.executeCommand('wolfram.plotsView.focus', { preserveFocus: true });
    }
    if (e?.document.lineCount == outputPosition.line) {
        e?.edit(editBuilder => {
            editBuilder.insert(outputPosition!, "\n")
            if (!sel) { sel = e!.selection };
            outputPosition = new vscode.Position(sel.active.line + 1, 0)
        })
    }

    if (e?.document.uri.scheme === 'vscode-notebook-cell') {
        e.selection = new vscode.Selection(0, 0, 1, 1)
        try {
            starttime = Date.now();
            wolframKernelClient?.sendNotification("runInWolfram", { range: sel, textDocument: e.document, print: false });
        } catch (err) {
            vscode.window.showErrorMessage("Wolfram kernel not running",
                "Restart kernel?").then((selection) => {
                    if (selection === "Restart kernel?") {
                        restartKernel()
                    }
                });
        }

    }
    else if (e?.document.uri.scheme === 'file' || e?.document.uri.scheme === 'untitled') {
        // e.selection = new vscode.Selection(outputPosition, outputPosition);
        // e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);

        // wolframKernelClient.sendNotification("moveCursor", {range:sel, textDocument:e.document});

        // if (!wolframBusyQ) {
        if (true) {
            let evalNext = evaluationQueue.pop();
            if (evalNext == undefined) {
                return
            }

            starttime = Date.now();
            // console.log(wolframKernelClient?.state)
            // outputChannel.appendLine("Sending to Wolfram: " + evalNext["textDocument"]["uri"]["path"])

            if (wolframKernelClient?.state == State.Running) {
                console.log("Kernel running, sending to Wolfram")
                wolframKernelClient?.sendNotification("runInWolfram", evalNext).then((result: any) => {
                }).catch((err) => {
                    console.log("Error in runInWolfram")
                    // restart()
                })
                return
            }

            if (wolframKernelClient == undefined && firstKernelLaunched == true) {
                outputChannel.appendLine("Kernel not running, waiting for kernel to start");
                await launch.stopKernel();
                await launch.startWLSPKernelSocket(0, kernelPath).then(async (client) => {
                    outputChannel.appendLine("Kernel started after not running");
                    wolframKernelClient = client;
                    onkernelReady();
                    sendToWolfram(printOutput, sel);
                    return;
                });

            }

            if (wolframKernelClient?.state == State.Starting) {
                // setTimeout(() => {sendToWolfram(printOutput, sel)}, 1000)
                console.log("Kernel starting");
                let sendDisposible = wolframKernelClient?.onDidChangeState((event: StateChangeEvent) => {
                    if (event.newState == State.Running) {

                        sendToWolfram(printOutput, sel)
                        sendDisposible.dispose()
                    } else if (event.newState == State.Stopped) {
                        vscode.window.showErrorMessage("Wolfram kernel stopped",
                            "Restart kernel?").then(async (selection): Promise<any> => {
                                if (selection === "Restart kernel?") {
                                    wolframKernelClient = await restartKernel();
                                    outputChannel.appendLine("Kernel restarted (" + wolframKernelClient?.state + ")");
                                    wolframKernelClient?.sendNotification("runInWolfram", evalNext).then((result: any) => {
                                    }).catch((err) => {
                                        console.log("Error in runInWolfram")
                                        // restart()
                                    })
                                }
                            });
                        return
                    }
                });
                return
            }
        }
    }
}

function setDecorations(result: any) {
    const editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors;
    let e = editors.filter((e) => {
        return e.document.uri.path === result["params"]["document"]["path"]
    })[0];

    for (let i = 0; i < Array.from(runningLines.values()).length; i++) {
        const d = Array.from(runningLines.values())[i];
        if (d.range.start.line == result["params"]["position"]["line"] - 1) {
            runningLines.delete(d.range);
            e.setDecorations(runningDecorationType, Array.from(runningLines.values()))
        }
    }
}

async function onRunInWolframIO(result: any) {
    let end = Date.now();
    outputChannel.appendLine(`Execution time: ${end - starttime} ms`);

    // wolframBusyQ = false;
    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.show();

    setDecorations({ params: result })
    const editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors;
    let e = editors.filter((e) => {
        return e.document.uri.path === result["document"]["path"]
    })[0];

    updateResults(e, { params: result }, result["print"], result["input"])
}

let evaluationResults: { [key: string]: string } = {}
let now = Date.now();
async function onRunInWolfram(file: any) {
    let end = Date.now();
    let start = Date.now();
    outputChannel.appendLine(`Execution time: ${end - start} ms`);



    // wolframBusyQ = false;
    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.show();

    let result: any;

    // try {
    //     result = bson.deserialize(fs.readFileSync(file["file"]), {encoding: null})
    // }
    if (Object.keys(file).includes("output")) {
        result = {
            "method": "onRunInWolfram",
            "params": file
        };

        // setDecorations(result);
        const editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors;
        let e = editors.filter((e) => {
            return e.document.uri.path === result["params"]["document"]["path"]
        })[0];
        if (e.document.uri.scheme == 'vscode-notebook-cell') {

        } else {
            // inputs.push(file["input"])
            now = Date.now();
            updateResults(e, result, result["params"]["print"], file["input"], file);

        }

        if (evaluationQueue.length > 0) {
            sendToWolfram();

        } else {

            treeDataProvider.refresh();
        }

        return
    }

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

            const editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors;
            let e = editors.filter((e) => {
                return e.document.uri.path === result["params"]["document"]["path"]
            })[0];
            if (e.document.uri.scheme == 'vscode-notebook-cell') {

            } else {
                // inputs.push(file["input"])
                updateResults(e, result, result["params"]["print"], file["input"], file);

            }

        } catch (err) {
            outputChannel.appendLine("Output data error: " + err)
        }

        if (evaluationQueue.length > 0) {
            sendToWolfram();
        } else {
            treeDataProvider.refresh();

        }
        setDecorations(result);
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

function onResult(result: any) {
    // console.log(result)
}

function updateInputs(params: any) {
    plotsProvider.newInput(params["input"])
}

async function updateResults(e: vscode.TextEditor | undefined, result: any, print: boolean, input: string = "", file: any = "") {

    if (typeof (e) !== "undefined") {
        e.edit(editBuilder => {


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
            } else {
                // output = result["params"]["output"] + "<br>" + file["file"] +"<br>" +  result["params"]["messages"].join("<br>");
                // output = `${result["params"]["output"]}` + "<br>" + file["file"] + "<br>" + result["params"]["messages"].join("<br>");
                output = `${result["params"]["output"]}`
                rawoutput = output;;
            }

            if (result["params"]["messages"].length > 0) {
                output += "<div id='errors'>" +
                    result["params"]["messages"].reduce((acc: any, cur: any) => {
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
                hoverMessage = "Large output: " + hoverMessage.substring(0, 100) + "..."
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
                nextline = e.document.lineCount - 1
            }
            let startChar = e.document.lineAt(nextline).range.end.character;

            plotsProvider.newOutput(outputSnippet);
            outputChannel.appendLine("Time to update plots: " + (Date.now() - now) + " ms");

            if (print) {
                let sel: vscode.Selection = e!.selection;
                let outputPosition: vscode.Position = new vscode.Position(result["params"]["position"]["line"] + 1, 0);
                try {
                    editBuilder.insert(outputPosition, (rawoutput + "\n\n").slice(0, 8192));
                } catch (error) {
                    console.log("Error: " + error);
                }
            }

            let decoration: vscode.DecorationOptions = {
                "range": new vscode.Range(
                    nextline,
                    startChar + 10,
                    nextline,
                    startChar + 200,
                ),
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

            outputChannel.appendLine("Time to update decorations: " + (Date.now() - now) + " ms");

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
    let outputPosition = new vscode.Position(0, 0);
    if (params.position) {
        outputPosition = new vscode.Position(params.position.line-1, params.position.character);
        let e = vscode.window.activeTextEditor;
        if (e) {


            let decorationLine = e.document.lineAt(outputPosition.line-1)
            let start = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 10)
            let end = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character + 20)
            let range = new vscode.Range(start, end)

            let d: vscode.DecorationOptions = {
                "range": range,
                "renderOptions": {
                    "after": {
                        "contentText": params.text,
                        "color": "foreground",
                        "margin": "20px"
                    }
                }
            }

            runningLines.set(range, d);
        }
    };

    if (params.busy === true) {
        //kernelStatusBar.color = "red";

        wolframBusyQ = true;
        wolframStatusBar.text = "$(extensions-sync-enabled~spin) Running (" + (outputPosition.line) + ")";
        wolframStatusBar.show();

        wolframKernelClient?.onNotification("onRunInWolfram", (result: any) => {
            onRunInWolfram(result)
        });

        wolframKernelClient?.onNotification("onRunInWolframIO", (result: any) => {
            onRunInWolframIO(result)
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


    } else {
        //kernelStatusBar.color = "yellow";
        wolframBusyQ = false;
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();

        // progressStatus?.resolve();
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

                // runningLines = [];
                editor.setDecorations(variableDecorationType, editorDecorations);
                editor.setDecorations(runningDecorationType, Array.from(runningLines.values()));
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

                // runningLines = [];
                editor.setDecorations(lintDecorationType, editorLintDecorations);
                editor.setDecorations(runningDecorationType, []);
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
        //     color: new vscode.ThemeColor("editorInfo.background")
        // },
        // dark: {
        //     color: new vscode.ThemeColor("editorInfo.background")
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
    // plotsProvider.updateView(printResults.reverse())
}


// 

async function delay(ms: number) {
    return new Promise((resolve) => { setTimeout(resolve, ms) })
}

function connectKernelClient(outputChannel: any, context: any) {

}


function runTextCell(location: vscode.Range) {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    let sel: vscode.Selection = new vscode.Selection(
        new vscode.Position(location.start.line, location.start.character),
        new vscode.Position(location.end.line - 1, location.end.character)
    );
    let evaluationData = { range: sel, textDocument: e?.document, print: false, output: true, trace: false };
    evaluationQueue.unshift(evaluationData);
    sendToWolfram(false)
}

function printInWolfram(print = true) {
    runInWolfram(print);
}

async function didChangeSelection(event: vscode.TextEditorSelectionChangeEvent) {

    let editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;

    // return if the file is not a wolfram file or untitled 
    if (editor?.document.languageId !== "wolfram" || editor?.document.uri.scheme === 'untitled') {
        return
    }

    let cursorBlock0: any = await cursorBlock();

    if (cursorBlock0 === undefined) {
        return
    }
    editor?.setDecorations(blockDecorationType, []);

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
    });

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
        // let newrunninglines = [];
        // newrunninglines = runningLines.filter((d: vscode.DecorationOptions) => {
        //     return d.range.start.line < selection?.line
        // })

        // Remove old running lines and decorations
        let newrunninglines = new Map();
        runningLines.forEach((d: vscode.DecorationOptions, key: vscode.Range) => {
            if (d.range.start.line < selection?.line) {
                newrunninglines.set(key, d)
            }
        });

        runningLines = newrunninglines;
        editor.setDecorations(runningDecorationType, Array.from(runningLines.values()));

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
    if (wolframClient !== undefined && wolframClient.state === 2) {
        wolframClient.sendNotification("windowFocused", state.focused);
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