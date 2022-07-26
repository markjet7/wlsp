import * as vscode from 'vscode';
import * as path from 'path';
import * as net from 'net';
const fp = require('find-free-port');
import * as cp from 'child_process';
const psTree = require('ps-tree');
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    NotificationType,
    State, 
    StateChangeEvent,
    NodeModule,
    Executable,
    ErrorHandler,
    ErrorHandlerResult,
    Message
} from 'vscode-LanguageClient/node';
import { resolve } from 'path';
// import { deactivate } from './notebook';
import { time } from 'console';
let wolframStatusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
let wolframVersionText = "$(extensions-sync-enabled~spin) Wolfram";
const fs = require('fs')
import { WolframNotebookSerializer } from './notebook';
import { WolframNotebookController } from './notebookController';
import { workspaceSymbolProvider } from './treeDataProvider';
import {getOutputContent} from './dataPanel';
import {showPlotPanel} from './plotsView';
import { VSCodeDropdown } from '@vscode/webview-ui-toolkit';

// export let wolframClient: LanguageClient;
// export let wolframKernelClient: LanguageClient;

// let wolfram: cp.ChildProcess;
// let wolframKernel: cp.ChildProcess;

let clientPort: number = 7710;
let symbolPort: number = 7810;
let kernelPort: number = 7910;
let lspPath: string;
let kernelPath: string;
let symbolsPath: string;
let context!: vscode.ExtensionContext;
let outputChannel!: vscode.OutputChannel;
let clients: Map<string, (LanguageClient|undefined)[]> = new Map();
let processes: cp.ChildProcess[] = [];

export var wolfram!: cp.ChildProcess;
export var wolframKernel!: cp.ChildProcess;
export var wolframSymbols!: cp.ChildProcess;

export var wolframClient!: LanguageClient | undefined;
export var wolframKernelClient: LanguageClient | undefined;
export var wolframSymbolClient: LanguageClient | undefined;
export let scriptserializer: vscode.NotebookSerializer;
export let notebookSerializer: WolframNotebookSerializer;
export let notebookcontroller: WolframNotebookController;
// export let scriptController: WolframScriptController;
export let treeDataProvider: workspaceSymbolProvider;
let runtime = vscode.workspace.getConfiguration().get("wlsp.runtime") as string;
// runtime = "/Applications/Mathematica.app/Contents/MacOS/MathKernel"

export async function startLanguageServer(context0: vscode.ExtensionContext, outputChannel0: vscode.OutputChannel): Promise<void> {


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
    notebookSerializer = new WolframNotebookSerializer()

    notebookcontroller = new WolframNotebookController(context)
    // scriptController = new WolframScriptController(context)

    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('wolfram-notebook', notebookSerializer)
    );

    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('wolfram-script', scriptserializer)
    );

    context.subscriptions.push(notebookcontroller);
    // context.subscriptions.push(scriptController);

    wolframClient?.onNotification("updatePositions", updatePositions);
    wolframClient?.onNotification("updateLintDecorations", updateLintDecorations);

    wolframClient?.onNotification("onRunInWolfram", onRunInWolfram);
    wolframClient?.onNotification("updateDecorations", updateDecorations);
    wolframClient?.onNotification("wolframBusy", wolframBusy);
    wolframClient?.onNotification("updateVarTable", updateVarTable);

    // wolframKernelClient?.onNotification("onRunInWolfram", onRunInWolfram);
    // wolframKernelClient?.onNotification("wolframBusy", wolframBusy);
    // wolframKernelClient?.onNotification("updateDecorations", updateDecorations);
    // wolframKernelClient?.onNotification("updateVarTable", updateVarTable);
    // wolframKernelClient?.onNotification("moveCursor", moveCursor);
    // wolframKernelClient?.onNotification("updateTreeItems", updateTreeItems);

    
    treeDataProvider = new workspaceSymbolProvider();
    vscode.window.registerTreeDataProvider("wolframSymbols", treeDataProvider);

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
}

function updateConfiguration(){
    if (vscode.workspace.getConfiguration().get("wlsp.liveDocument")) {
    } 
}

export async function restart(): Promise<void> {
    wolframBusyQ = false;
    evaluationQueue = [];    
    
    wolframClient?.stop();
    wolframKernelClient?.stop();
    wolframSymbolClient?.stop();

    startWLSP(0);

    return new Promise((resolve) => {
        vscode.workspace.textDocuments.forEach(didOpenTextDocument);

        resolve()
    })
}

export function stop() {
    wolframClient?.sendNotification("shutdown");
    wolframKernelClient?.sendNotification("shutdown");
    wolframSymbolClient?.sendNotification("shutdown");
    
    // wolframClient?.stop();
    // wolframKernelClient?.stop();
    // wolframSymbolClient?.stop();

	return 

}

async function onclientReady() : Promise<void> {
    function checkClient(cb:any) {
        if (wolframClient?.isRunning()) {

                wolframClient?.onNotification("updatePositions", updatePositions);
                wolframClient?.onNotification("updateLintDecorations", updateLintDecorations);
    
                wolframClient?.sendRequest("wolframVersion").then((result:any) => {
                    wolframVersionText = result["output"];
                    wolframStatusBar.text = result["output"];
                })
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
export async function  onkernelReady(): Promise<void> {
    function checkKernel(cb:any) {
        if (wolframKernelClient?.isRunning()) {



                // if (vscode.window.activeTextEditor){
                //     let workspacefolder:any = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor?.document.uri)

                //     if (workspacefolder) {
                //          vscode.workspace.findFiles("**/*.wl*", workspacefolder.uri).then(result => {
                //             wolframKernelClient?.sendNotification("didChangeWorkspaceFolders", result)
                //         })
                //     }
                    
                    
                // }
                wolframKernelClient?.sendRequest("storageUri").then((result:any) => {
                    temporaryDir = result;
                });

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

function clearResults() {
    // while(printResults.pop) {
    // }
    printResults = [];
    updateOutputPanel()
}

function updateTreeItems(result:any) {
    treeDataProvider?.getSymbols(result["file"])
}

let movePositions:{[index:string]: any} = {};
function updatePositions(params:any) {
    params["result"].forEach((e:any) => {
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

    e.revealRange(r, vscode.TextEditorRevealType.Default);

    try {
        wolframKernelClient?.sendRequest("runInWolfram", { range: r, textDocument: e.document, print: false }).then((result: any) => {
            // cursor has not moved yet
            if (e.selection.active.line === outputPosition.line - 1 && e.selection.active.character === outputPosition.character) {
                outputPosition = new vscode.Position(result["position"]["line"], result["position"]["character"]);
                e.selection = new vscode.Selection(outputPosition, outputPosition);
                e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            }

            updateResults(e, result, false);
        });
    } catch {
        console.log("Kernel is not ready. Restarting...")
        restart()
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
        Object.keys(updatedVariables).map((k:any) => {
            variableTable[k] = updatedVariables[k]
        })
        updateOutputPanel();

    })
}

let runningLines:any[] = []
function moveCursor2(position:vscode.Position) {
    let e = vscode.window.activeTextEditor;
    let uri = e?.document.uri.toString();
    if (!(uri === undefined) && (uri in movePositions)) {
        let newPos:any[] = Object.values(movePositions[uri]).filter((p:any) => {
            let r = p["location"]["range"] as vscode.Range;
            return ((r.start.line <= position.line) && (position.line <= r.end.line ))
        })

        if (newPos.length > 0) {
            let outputPosition = new vscode.Position(newPos[0]["location"]["range"]["end"]["line"]+1, 0) ;
            if (e) {
                e.selection = new vscode.Selection(outputPosition, outputPosition);
                e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
            }
            decorateRunningLine(outputPosition);
        } else {
            if (e) {
                let outputPosition = new vscode.Position(position["line"]+1, 0);
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
        return
    }

    let e:vscode.TextEditor | undefined = vscode.window.activeTextEditor;
        let cursorFile =  path.join(context.extensionPath, "wolfram", "cursorLocations.js");
        fs.readFile(cursorFile, "utf8", (err: any, data: any) => {
            if (err) {
                console.log(err)
                return
            }
            let cursorLocations:any[] = JSON.parse(data);
            
            let top:any = new vscode.Position(0,0);
            let bottom:any = (e?.selection.active.line || 0) + 1;
            for (let i:any = 0; i < cursorLocations.length; i++) {
                if (e) {
                    if (cursorLocations[i+1]["start"]["line"] > e?.selection.active.line) {
                        top = cursorLocations[i]["end"];
                        bottom = cursorLocations[i+1]["start"]["line"];
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
                cursorMoved = true;
                e?.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
                decorateRunningLine(new vscode.Position(top["line"], top["character"]));
            }
        })
}

function decorateRunningLine(outputPosition:vscode.Position) {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (e) {

        let decorationLine = e.document.lineAt(outputPosition.line - 1)
        let start = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character)
        let end = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character)
        let range = new vscode.Range(start, end)

        let d: vscode.DecorationOptions = {
            "range": range,
            "renderOptions": {
                "after": {
                    "contentText": ".",
                    "color": "foreground",
                    "margin": "20px"
                }
            }
        }

        runningLines.push(d);
        // updateDecorations([d]);
    }
}

function updateRunningLines() {
    let editor = vscode.window.activeTextEditor;
    if (wolframBusyQ === true) {
        runningLines.forEach((d:vscode.DecorationOptions) => {
            let r = d["renderOptions"];
            let a = r?["after"] : {"contentText": ""};
            let c = a?["contentText"] : "";
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

let starttime = 0;
let inputs:String[] = [];
let cursorMoved = false;
function runInWolfram(print = false, trace=false) {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    let sel: vscode.Selection = e!.selection;



    vscode.window.onDidChangeTextEditorSelection((e: vscode.TextEditorSelectionChangeEvent) => {
        cursorMoved = true;
    })
    cursorMoved = false;
    moveCursor()
        // wolframClient?.sendRequest("moveCursor", { range: sel, textDocument: e?.document }).then((result:any) => {
        //     if (
        //         ((sel.active.line + 1) === e!.selection.active.line) &&
        //         e!.selection.active.character === 0) {
        //             moveCursor(result)
        //     }
        // });

    let evaluationData = { range: sel, textDocument: e?.document, print: print, trace};
    evaluationQueue.push(evaluationData);

    // showPlots();

    if (!wolframClient) {
        restart().then(() => {
            evaluationQueue.push(evaluationData);
            sendToWolfram(print);
            return
        })
    } 

    if (evaluationQueue.length == 1 || wolframBusyQ == false) {
        sendToWolfram(print);
    }

}

let evaluationQueue:any[] = [];
async function sendToWolfram(print = false, sel:vscode.Selection|undefined = undefined) {

    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if(!sel) {sel = e!.selection};

    if (e?.document.uri.scheme === 'vscode-notebook-cell') {
        e.selection = new vscode.Selection(0, 0, 1, 1)
        try {
            starttime = Date.now();
            // wolframKernelClient?.sendNotification("runInWolfram", { range: sel, textDocument: e.document, print: false });
            wolframClient?.sendNotification("runInWolfram", { range: sel, textDocument: e.document, print: false });
        } catch (err) {
            console.log(err);
            restart()
        }

    }
    else if (e?.document.uri.scheme === 'file' || e?.document.uri.scheme === 'untitled') {
        // e.selection = new vscode.Selection(outputPosition, outputPosition);
        // e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);

        // wolframKernelClient.sendNotification("moveCursor", {range:sel, textDocument:e.document});

        if(!wolframBusyQ) {
                wolframBusyQ = true;
                wolframStatusBar.text = "$(extensions-sync-enabled~spin) Wolfram Running";
                wolframStatusBar.show();
                starttime = Date.now();
                wolframClient?.sendNotification("runInWolfram", evaluationQueue.shift())
        } 
    }
}

let evaluationResults:{[key:string]:string} = {}
function onRunInWolfram(file: any) {
    let end  = Date.now();
    outputChannel.appendLine(`Execution time: ${end - starttime} ms` );

    wolframBusyQ = false;
    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.show();

    let result:any;

    if (evaluationQueue.length > 0) {
        sendToWolfram();
    }

    fs.readFile(file["file"], "utf8", ((err:any, data:any) => {
        if (err) {
            outputChannel.appendLine(err);
            return 
        }
        try{
            result = JSON.parse(data)
            let editors: vscode.TextEditor[] = vscode.window.visibleTextEditors;
            let e = editors.filter((e) => { 
                return e.document.uri.path === result["params"]["document"]["path"] 
            })[0];

            if (runningLines.length > 0) {
                runningLines.pop()
            }

            if (e.document.uri.scheme == 'vscode-notebook-cell') {

            } else {
                // inputs.push(file["input"])
                updateResults(e, result, result["params"]["print"], file["input"]);
            }
        } catch (err) {
            outputChannel.appendLine("Output data error: " + err)
        }
        treeDataProvider.refresh();
    }))
    // try{
    //     result = JSON.parse(fs.readFileSync(file["file"], "utf8"))["params"];
    // } catch {
    //     return
    // }
}

let maxPrintResults = 20;
let printResults: any[] = [];
// let printResults: Map<string, string> = new Map();
function updateResults(e: vscode.TextEditor | undefined, result: any, print: boolean, input:string = "") {
    if (printResults.length > maxPrintResults) {
        printResults.shift();
    }

    if (typeof (e) !== "undefined") {
        e.edit(editBuilder => {

            if (print) {
                let sel: vscode.Selection = e!.selection;
                let outputPosition: vscode.Position = new vscode.Position(result["params"]["position"]["line"]+1, 0);
                try{
                    editBuilder.insert(outputPosition, (result["params"]["result"] + "\n\n").slice(0, 8192));
                } catch (error) {
                    console.log("Error: " + error);
                }
            }

            fs.readFile(result["params"]["output"].substring(1, result["params"]["output"].length), "utf8", (err:any, data:any) => {
                if (err) {
                    outputChannel.appendLine(err);
                    return
                }
                let output = data;

                printResults.push(
                    [input,
                    output]
                )
                if(output.includes("<img")) {
                } else {
                    outputChannel.appendLine(output.slice(0, 8192));
                }
                // let out = console_outputs.pop();
                // printResults.push(out);
                // showOutput();
            })



            // let output = fs.readFileSync(result["output"].toString(), 'utf8');
            
        });
    };

    updateOutputPanel();

}


let outputPanel: vscode.WebviewPanel | undefined;
function showOutput() {
    let outputColumn: vscode.ViewColumn | undefined = vscode.window.activeTextEditor?.viewColumn;
    //let out = "<table id='outputs'>";

    if (outputPanel) {
        if (outputPanel.visible) {

        } else {
            if (outputColumn) {
                outputPanel.reveal(outputColumn + 1, true);
            } else {
                outputPanel.reveal(1, true);
            }
        }
    } else {
        outputPanel = vscode.window.createWebviewPanel(
            'WolframOutput',
            "Wolfram Data Table",
            { viewColumn: 2, preserveFocus: true },
            {
                enableScripts: true
            });

        outputPanel.webview.html = getOutputContent(outputPanel.webview, context.extensionUri);

        outputPanel.webview.onDidReceiveMessage(
            message => {
                runExpression(message.text, 0, 100);
                return;
            }
            , undefined, context.subscriptions);

        outputPanel.onDidDispose(() => {
            outputPanel = undefined;
        }, null);


        updateOutputPanel()
    }

}

let plotsPanel: vscode.WebviewPanel | undefined;
function showPlots() {
    let outputColumn: vscode.ViewColumn | undefined = vscode.window.activeTextEditor?.viewColumn;
    //let out = "<table id='outputs'>";

    if (plotsPanel) {
        if (!plotsPanel.visible) {
            if (outputColumn) {
                plotsPanel.reveal(outputColumn + 1, true);
            } else {
                plotsPanel.reveal(1, true);
            }
        }
    } else {
        plotsPanel = vscode.window.createWebviewPanel(
            'WolframPlots',
            "Wolfram Plots",
            { viewColumn: 2, preserveFocus: true },
            {
                localResourceRoots:  [vscode.Uri.file(path.join(context.extensionPath, "media")),vscode.Uri.file(path.join(context.extensionPath, 'wolfram')), vscode.Uri.file(temporaryDir)],
                enableScripts: true,
                retainContextWhenHidden: true
            });

            plotsPanel.webview.html = showPlotPanel(plotsPanel.webview, context.extensionUri);

            plotsPanel.webview.onDidReceiveMessage(
            message => {
                runExpression(message.text, 0, 100);
                return;
            }
            , undefined, context.subscriptions);

        plotsPanel.onDidDispose(() => {
            plotsPanel = undefined;
        }, null);


        updateOutputPanel()
    }

}

function runExpression(expression: string, line: 0, end: 100) {
    let e: vscode.TextEditor | undefined = (vscode.window.activeTextEditor == null) ? vscode.window.visibleTextEditors[0] : vscode.window.activeTextEditor;


    decorateRunningLine(new vscode.Position(line, end));
    wolframKernelClient?.sendRequest("runExpression", { print: false, expression: expression, textDocument: e?.document, line: line, end: end }).then((result: any) => { });
}

let wolframBusyQ:boolean = false;
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

function updateOutputPanel() {
    let out = "";

    printResults.forEach((row) => {
        let data = "";
        try {
                data += row[1];
        } catch (e) {
            console.log((e as Error).message);
            data += "Error reading result";
        }

        if (data !== "") {
            out += "<div id='result-header'>In: " +
                    row[0].substring(0,  1000) + 
                "</div>" +
            
                "<div id='result'>" +
                    data +
                "</div>";
        }
    })

    let vars:string = "";

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

    outputPanel?.webview.postMessage({ text: out, vars: (vars) });
    plotsPanel?.webview.postMessage({ text: out, vars: (vars) });
}

let console_outputs:string[] = []
let socketsClosed = 0;
class errorHandler implements ErrorHandler  {
    message: string | undefined;
    count: number;
    // error: ErrorHandlerResult | undefined;

    constructor() {
        this.message= "";
        this.count= 0;
    }

    error (error: Error|undefined, message: Message|undefined, count: number|undefined):ErrorHandlerResult  {
        console.log(message?.jsonrpc.toString())
        return {
            action: 1
        };
    }

    closed() {
        return {
            action: 2
        }
    }


} 

function startWLSP(id:number): Promise<void> {
    let timeout: any;
    
    fp(clientPort+id).then(([freePort]:number[]) => { clientPort = freePort; return clientPort; })

    let serverOptions: Executable = {
        command: runtime,
        // module: "",
        transport: {
            kind: TransportKind.socket,
            port: clientPort
        },
        args: ['-noprompt', '-file', path.join(context.extensionPath, "wolfram", "wolfram-lsp.wl"), clientPort.toString(), path.join(context.extensionPath, "wolfram", "wolfram-lsp.wl")],
        options: {
            shell: true,
            detached: true
        }
    }

    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel,
        errorHandler:  new errorHandler

    };

    return new Promise(async (resolve) => {
        wolframClient = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);       

        
        await wolframClient.start().then((result:any) => {
            outputChannel.appendLine("Wolfram Language Server started");

            wolframClient?.sendRequest("wolframVersion").then((result:any) => {
                wolframVersionText = result["output"];
                wolframStatusBar.text = result["output"];
            })
            // resolve(onclientReady());
            // startWLSPKernel(0);
        })
        resolve()

    });
}


async function startWLSPKernel(id:number): Promise<void> {
    let timeout: any;
    
    await fp(kernelPort+id).then(([freePort]:number[]) => { kernelPort = freePort; return kernelPort; })

    let serverOptions: Executable = {
        command: runtime,
        // module: "",
        transport: {
            kind: TransportKind.socket,
            port: kernelPort
        },
        args: ['-file', path.join(context.extensionPath, "wolfram", "wolfram-kernel.wl"), kernelPort.toString(), path.join(context.extensionPath, "wolfram", "wolfram-kernel.wl")],
        options: {
            shell: false,
            detached: true
        }
    }

    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel,
        markdown:{
            isTrusted: true,
            supportHtml: true
        },
        errorHandler:  new errorHandler
    };

    return new Promise(async (resolve) => {
        wolframKernelClient = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);        
     
        // wolframKernelClient.onReady().then(() => {
        //     onkernelReady();
        // })
        await wolframKernelClient?.start().then((result:any) => {
            startWLSPSymbol(0);

        });
        
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
        let executablePath:string = vscode.workspace.getConfiguration('wolfram').get('executablePath') || "wolframscript";
        try {
            if (process.platform === "win32") {
                wolfram = cp.spawn('cmd.exe', ['/c', executablePath?.toString(), '-file', path, port.toString(), path], { detached: false });
            } else {
                wolfram = cp.spawn(executablePath?.toString(), ['-file', path, port.toString(), path], { detached: true });
            }

            wolfram.stdout?.once('data', (data: any) => {
                outputChannel.appendLine("WLSP: " + data.toString())
                resolve(wolfram);
            });


            if (wolfram.pid != undefined) {
                console.log("Launching wolframscript: " + wolfram.pid.toString());
                processes.push(wolfram)
            } else {
                console.log("Launching wolframscript: pid unknown");
            }


            wolfram.on('SIGPIPE', (data) => {
                console.log("SIGPIPE");
            });


            wolfram.stdout?.on('error', (data) => {
                console.log("STDOUT Error" + data.toString());
            });

            wolfram.stdout?.on('data', (data) => {
                outputChannel.appendLine("WLSP: " + data.toString())
            });


        } catch (error) {
            console.log(error)
            vscode.window.showErrorMessage("Wolframscript failed to load.")
            resolve(wolfram)
        }
    })
}



function stopWolfram(client: LanguageClient|undefined, client_process: any): Promise<void> {
    return new Promise((resolve) => {
        // client?.stop();
        try {
            client?.stop();
        } catch {}

        try {
            let cp = require('child_process');
            let isWin = /^win/.test(process.platform);
            if (isWin) {
                cp.exec('taskkill /PID ' + client_process.pid + ' /T /F', function (error: any, stdout: any, stderr: any) {});
                resolve()

            } else {
                console.log("Killing process: " + client_process.pid);
                cp.exec('kill -9 ' + client_process.pid, function (error: any, stdout: any, stderr: any) {});
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






function runTextCell(location:vscode.Range) {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    let sel: vscode.Selection = new vscode.Selection(
        new vscode.Position(location.start.line, location.start.character),
        new vscode.Position(location.end.line, location.end.character)
    );
    let evaluationData = { range: sel, textDocument: e?.document, print: false };
    evaluationQueue.push(evaluationData);
    sendToWolfram(false)
}

function printInWolfram(print = true) {
    runInWolfram(print);
}

function didChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
    // didOpenTextDocument(event.document);
    // remove old decorations

    let editor = vscode.window.activeTextEditor;

    if (event.document.uri.toString() !== editor?.document.uri.toString()) {
        return
    }

    clearDecorations();
    if (vscode.workspace.getConfiguration().get("wlsp.liveDocument")) {
        let doc = editor?.document;

        if (wolframKernelClient) {        
                wolframKernelClient?.sendNotification("runDocumentLive", doc?.uri)
        } 
        return
    }  

    let decorations: vscode.DecorationOptions[] = [];
    if (editor == null) {
        return
    } else {
        let position = editor?.selection.active;

        let uri = editor.document.uri.toString();

        if ((workspaceDecorations == undefined) || (workspaceDecorations == null)) {
            workspaceDecorations = {};
        }

        if (workspaceDecorations[uri] !== undefined) {
            Object.keys(workspaceDecorations[uri]).forEach((line: any) => {
                if (parseInt(line, 10) < position.line) {
                    decorations.push(workspaceDecorations[uri][line]);
                } else {
                    delete workspaceDecorations[uri][line];
                }
            });
        }

        // live document
        editor.setDecorations(variableDecorationType, decorations);
       
    }
    return;
}

function isUntitled(document:vscode.TextDocument) {
    return (document.languageId === "wolfram" && document.uri.scheme === 'untitled')
}


let totalClients:number = 0;
function didOpenTextDocument(document: vscode.TextDocument): void {
   

    return;
}


function didSaveTextDocument(event: vscode.TextDocument): void {
    treeDataProvider.refresh();
    clearDecorations();
    didOpenTextDocument(event);
    return;
}


function createFile() {
    vscode.workspace.openTextDocument(vscode.Uri.parse("untitled:.wl")).then((document: vscode.TextDocument) => {
        vscode.window.showTextDocument(document);
    });
}

async function createNotebook() {
    // let content:string = `{"cells":[{"cell_type":"code","execution_count":null,"metadata":{},"outputs":[],"source":[]}],"metadata":{"file_extension":".wlnb","kernelspec":{"display_name":"Wolfram Language","language":"wolfram","name":"wolfram"},"language_info":{"codemirror_mode":{"name":"ipython","version":"4.0.0"}},"mimetype":"text/x-wolfram","name":"Wolfram Language","nbconvert_exporter":"python","nbformat":4,"pygments_lexer":"ipython4","version":"4.0.0"},"nbformat":4,"nbformat_minor":0,"vscode":{"interpreter":{"hash":""}}}
    // `

    // let encoded = new TextEncoder().encode(content);

    // let nbData = await notebookSerializer.deserializeNotebook(encoded, new vscode.CancellationTokenSource().token);

    vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse("untitled:.wlnb"), "wolfram");

    // notebookSerializer.deserializeNotebook(vscode.Uri.parse("untitled:.wlnb"), null).then((document: vscode.NotebookData) => { 
    //     vscode.note

    // });
}

function createNotebookScript() {
    vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.wls")).then((document: vscode.NotebookDocument) => {
        // vscode.window.showNotebookDocument(document);
    });
}


function didChangeWindowState(state: vscode.WindowState) {
    if (!wolframClient?.isRunning()) {
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

function abort() {
    wolframClient?.sendNotification("abort");
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

function addJupyterkernel() {
    if (process.platform == "win32") {
        cp.spawn("cmd.exe", [
            '/c', 
            path.join(context.extensionPath, "wolfram", "jupyter", "configure-jupyter.wls"), 
            'add'
        ],
        {detached:false})
    } else {
        cp.spawn(path.join(context.extensionPath, "wolfram", "jupyter", "configure-jupyter.wls"), [
            "add"
        ],
        {detached:false})
    }

    vscode.window.showInformationMessage("Attempted to install the WLSP kernel.")
}




function showTrace() {
    runInWolfram(false, true)
}

async function startWLSPSymbol(id: number):Promise<void> {
    let timeout: any;
    
    await fp(symbolPort+id).then(([freePort]:number[]) => { symbolPort = freePort; return symbolPort; })

    let serverOptions: Executable = {
        command: runtime,
        // module: "",
        transport: {
            kind: TransportKind.socket,
            port: symbolPort
        },
        args: ['-file', path.join(context.extensionPath, "wolfram", "wolfram-symbols.wl"), symbolPort.toString(), path.join(context.extensionPath, "wolfram", "wolfram-symbols.wl")],
        options: {
            
        }
    }
    
    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel,
        errorHandler:  new errorHandler
    };

    return new Promise(async (resolve) => {
        wolframSymbolClient = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);       
        
        await wolframSymbolClient?.start();

    });
}

function onsymbolclientReady() {
    function checkClient(cb:any) {
        if (wolframSymbolClient?.isRunning()) {
                cb()
    
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


export function deactivate() {
    wolframClient?.sendRequest("shutdown");
    wolframKernelClient?.sendRequest("shutdown");
    wolframSymbolClient?.sendRequest("shutdown");

    wolframClient?.stop();
    wolframKernelClient?.stop();
    wolframSymbolClient?.stop();
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