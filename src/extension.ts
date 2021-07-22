import * as vscode from 'vscode';
import * as path from 'path';
import * as net from 'net';
import * as opn from "open";
const fp = require('find-free-port');
const psTree = require('ps-tree');
import * as cp from 'child_process';
import { 
	LanguageClient,
	LanguageClientOptions,
    NotificationType,
	ServerOptions,
	TransportKind } from 'vscode-languageclient';
import { EEXIST } from 'constants';
import {WolframNotebook, WolframNotebookSerializer} from './notebook';
const fs = require('fs')

let client:LanguageClient;
let wolframClient:LanguageClient;
let wolframKernelClient:LanguageClient;
let wolframStatusBar:vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
wolframStatusBar.command = "wolfram.restart";
wolframStatusBar.text = "$(repo-sync~spin) Loading Wolfram...";
wolframStatusBar.show();
let kernelStatusBar:vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
kernelStatusBar.command = "wolfram.launchKernel";
kernelStatusBar.text = "$(lightbulb)";
kernelStatusBar.color = "foreground";
kernelStatusBar.show();

let wolframNotebookProvider:WolframNotebookSerializer;
let PORT:any;
let kernelPORT:any;
let outputChannel = vscode.window.createOutputChannel('wolf-lsp');
let lspPath = '';
let kernelPath = '';
let theContext:vscode.ExtensionContext;

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
vscode.commands.registerCommand('wolfram.restart', restartWolfram);   
vscode.commands.registerCommand('wolfram.restartKernel', restartKernel); 
vscode.commands.registerCommand('wolfram.abort', abort); 
vscode.commands.registerCommand('wolfram.textToSection', textToSection);
vscode.commands.registerCommand('wolfram.textFromSection', textFromSection);
let theDisposible:vscode.Disposable;
let theKernelDisposible:vscode.Disposable;

function randomPort(){
    return Math.round(Math.random()*(65535 - 49152)+49152)
}
export function activate(context: vscode.ExtensionContext){
    theContext = context;
    lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
    kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
    // wolframNotebookProvider = new WolframProvider("wolfram", context.extensionPath.toString(), true, wolframClient);
    context.subscriptions.push()
    try{
        // context.subscriptions.push(vscode.notebook.registerNotebookContentProvider('wolfram', wolframNotebookProvider));
    } catch {}

    
    fp(randomPort()).then((freep:any) => { 
        PORT = freep[0];
        outputChannel.appendLine("Port: " + PORT.toString());
        loadwolfram().then(async (success:any) => {
            await new Promise(resolve => setTimeout(resolve, 5000));
            theDisposible = loadWolframServer(outputChannel, context)
            context.subscriptions.push(theDisposible);
            // wolframNotebookProvider.setWolframClient(wolframClient);
    
        });
    }); 

    fp(randomPort()).then((freep:any) => { 
        kernelPORT = freep[0];
        outputChannel.appendLine("Port: " + kernelPORT.toString());
        loadwolframKernel().then(async (success:any) => {
            await new Promise(resolve => setTimeout(resolve, 5000));
            theKernelDisposible = loadWolframKernelClient(outputChannel, context)
            context.subscriptions.push(theKernelDisposible);
            // wolframNotebookProvider.setWolframClient(wolframClient);
    
        });
    }); 
    
}

let wolframKernel:cp.ChildProcess;
let loadwolframKernel = function() {
    return new Promise((resolve, reject) =>  {
        if (process.env.VSCODE_DEBUG_MODE === "true") {
            PORT = 6589;
        } else {
        try {
            if (process.platform === "win32") {
                wolframKernel = cp.spawn('cmd.exe', ['/c', 'wolframscript.exe', '-file', kernelPath, kernelPORT.toString(), kernelPath], {detached:false});
            } else {
                wolframKernel = cp.spawn('wolframscript', ['-file', kernelPath, kernelPORT.toString(), kernelPath], {detached:true});
            }
            outputChannel.appendLine("Launching wolframkernel: " + wolframKernel.pid.toString());

            wolframKernel.stdout?.once('data', (data) => {
                resolve(true);
            });

            wolframKernel.stdout?.on('data', (data) => {
                outputChannel.appendLine("STDOUT: " + data.toString());
            });

            wolframKernel.on('SIGPIPE', (data) => {
                outputChannel.appendLine("SIGPIPE");
            });


            wolframKernel.stdout?.on('error', (data) => {
                outputChannel.appendLine("STDOUT Error" + data.toString());
            });

            } catch (error) {
                outputChannel.appendLine(error.message)
                vscode.window.showErrorMessage("Wolframscript failed to load kernel.")
                return reject(false);
            }  
        
        }
    });

}


let wolfram:cp.ChildProcess;
let loadwolfram = function() {
    return new Promise((resolve, reject) =>  {
        if (process.env.VSCODE_DEBUG_MODE === "true") {
            PORT = 6589;
        } else {
        try {
            if (process.platform === "win32") {
                wolfram = cp.spawn('cmd.exe', ['/c', 'wolframscript.exe', '-file', lspPath, PORT.toString(), lspPath], {detached:false});
            } else {
                wolfram = cp.spawn('wolframscript', ['-file', lspPath, PORT.toString(), lspPath], {detached:true});
            }
            outputChannel.appendLine("Launching wolframscript: " + wolfram.pid.toString());

            wolfram.stdout?.once('data', (data) => {
                resolve(true);
            });

            wolfram.stdout?.on('data', (data) => {
                outputChannel.appendLine("STDOUT: " + data.toString());
            });

            wolfram.on('SIGPIPE', (data) => {
                outputChannel.appendLine("SIGPIPE");
            });


            wolfram.stdout?.on('error', (data) => {
                outputChannel.appendLine("STDOUT Error" + data.toString());
            });

            } catch (error) {
                outputChannel.appendLine(error.message)
                vscode.window.showErrorMessage("Wolframscript failed to load.")
                return reject(false);
            }  
        
        }
    });
};

function loadWolframKernelClient(outputChannel:any, context:vscode.ExtensionContext) {
    let serverOptions:ServerOptions = function () {
        return new Promise((resolve, reject) => {
            let client = new net.Socket();
            client.connect(kernelPORT, "127.0.0.1", () => {
                client.setKeepAlive(true, 3000); 
                resolve({
                    reader: client,
                    writer: client
                })
            })
        })
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel
    };

    wolframKernelClient = new LanguageClient('wolfram', 'Wolfram Language Server Kernel', serverOptions, clientOptions)
    wolframKernelClient.onReady().then(() => {
        wolframKernelClient.onNotification("onRunInWolfram", onRunInWolfram);
        wolframKernelClient.onNotification("wolframBusy", wolframBusy);
        wolframKernelClient.onNotification("updateDecorations", updateDecorations);
        wolframKernelClient.onNotification("updateVarTable", updateVarTable);
        wolframKernelClient.onNotification("moveCursor", moveCursor);
    });

    let disposible = wolframKernelClient.start();
    return disposible;
}


function loadWolframServer(outputChannel:any, context:vscode.ExtensionContext){
    // let serverOptions = {
    //     run: { module: serverModule, transport: TransportKind.ipc },
    //     debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    // };
    //logtime("start client");
    let serverOptions: ServerOptions = function() {
        return new Promise ((resolve, reject) => {
            let client = new net.Socket();
            //setTimeout(() =>{
                client.connect(PORT, "127.0.0.1", () => {
                    client.setKeepAlive(true, 3000);
                    resolve({
                        reader: client,
                        writer: client
                    });
                });

                // client.on("error", (e) => { 
                //     outputChannel.appendLine("Error:" + e.message);
                //     // loadWolframServer(outputChannel, context);
                //     setTimeout(() =>  loadWolframServer(outputChannel, context), 1000);
                //     client.destroy();
                    
                // });

                // client.on("timeout", () => { outputChannel.appendLine("Timeout"); reject();});
                //logtime("connected");
            //}, 10000);
        });
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel
    };


    wolframClient = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);

    wolframClient.onReady().then(() => {
        //wolframClient.sendRequest("DocumentSymbolRequest");
        wolframClient.onNotification("wolframVersion", wolframVersion);
        // wolframClient.onNotification("moveCursor", moveCursor);
        // wolframClient.onNotification("wolframResult", wolframResult);
    });
    let disposible = wolframClient.start();

    return disposible;
}

let wolframVersionText:string = "";
function wolframVersion(data:any) {        
    wolframVersionText = data["output"];
    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.show();
}

// function wolframResult(result:any) {
//     let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
//     let outputPosition = new vscode.Position(result["position"]["line"], result["position"]["character"]);

//     printResults.push(result["output"]);
//     if (printResults.length > 20) {
//         printResults.shift();
//     }
//     // showOutput(printResults);
//     if(typeof(e) !== "undefined") {
//         e.edit(editBuilder => {
//             // if (result["output"].indexOf("<img") >= 0 ){
//             //     printResults.push(result["output"]);
//             //     showOutput(printResults);
//             // } 
//             if(result["print"]){
//                 editBuilder.insert(outputPosition, "(* " + result["output"] + " *)\n");
//             }
//         });
//     }
//     wolframStatusBar.text = wolframVersionText;
// }

function didOpenTextDocument(document:vscode.TextDocument): void{
    if (document.languageId !== 'wolfram' || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
        return;
    }
    if (document.languageId==="wolfram"){
        if (wolframClient !== undefined) {
            wolframClient.onReady().then(ready => {
                wolframClient.sendRequest("DocumentSymbolRequest");
            });
        }
    }

    return;
}

function didChangeTextDocument(event:vscode.TextDocumentChangeEvent):void {
    // didOpenTextDocument(event.document);
    // remove old decorations
    let editor = vscode.window.activeTextEditor;
    let decorations:vscode.DecorationOptions[] = [];
    if(editor == null){
        return
    } else {
        let position = editor?.selection.active;

        let uri = editor.document.uri.toString();

        if ((workspaceDecorations == undefined) || (workspaceDecorations == null)) {
            workspaceDecorations = {};
        }

        if (workspaceDecorations[uri] !== undefined) {
            Object.keys(workspaceDecorations[uri]).forEach((line:any) => {
                if (parseInt(line, 10) < position.line) {
                    decorations.push(workspaceDecorations[uri][line]);
                } else {
                    delete workspaceDecorations[uri][line];
                }
            });
    }

        editor.setDecorations(variableDecorationType, decorations);
    }
    return;
}

function didSaveTextDocument(event:vscode.TextDocument):void {
    didOpenTextDocument(event);
    return;
}

function moveCursor(params:any) {
    let e:vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    let outputPosition = new vscode.Position(params["position"]["line"], params["position"]["character"]);
    if(e){
        e.selection = new vscode.Selection(outputPosition, outputPosition);
        e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);

        let decorationLine = e.document.lineAt(outputPosition.line-1)
        let start = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character)
        let end = new vscode.Position(decorationLine.lineNumber, decorationLine.range.end.character)
        let range = new vscode.Range(start, end)

        let d:vscode.DecorationOptions = {
            "range": range,
            "renderOptions": {
                "after": {
                    "contentText": "...",
                    "color":"foreground",
                    "margin":"20px"
                }
            }
        }
        updateDecorations([d]);
    }
}


function restartKernel(){
    kernelStatusBar.color = "yellow";

    wolframKernelClient.stop();

    let isWin = /^win/.test(process.platform);
    if(isWin) {
        let cp = require('child_process');
        cp.exec('taskkill /PID ' + wolfram.pid + ' /T /F', function (error:any, stdout:any, stderr:any) {
        }); 
        cp.exec('taskkill /PID ' + wolframKernel.pid + ' /T /F', function (error:any, stdout:any, stderr:any) {
        }); 

    } else {        
        kill(wolframKernel.pid);
    }
    //let context = myContext;
    wolframStatusBar.text = "$(repo-sync~spin) Loading Wolfram...";
    wolframStatusBar.show();

    vscode.window.showInformationMessage("Wolfram Kernel is restarting.");
    // context.subscriptions.forEach((sub:any) => {
    //     try {
    //         sub.dispose();
    //     } catch (error) {
    //         outputChannel.appendLine("subs: " + error);
    //     }
    // });
    // context.subscriptions.push(loadWolframServer(outputChannel, context));


    fp(randomPort()).then((freep:any) => { 
        kernelPORT = freep[0];
        outputChannel.appendLine("Port: " + kernelPORT.toString());
        loadwolframKernel().then(async (success:any) => {
            await new Promise(resolve => setTimeout(resolve, 5000));
            theKernelDisposible = loadWolframKernelClient(outputChannel, theContext)
            theContext.subscriptions.push(theKernelDisposible);
            // wolframNotebookProvider.setWolframClient(wolframClient);
    
        });
    }); 
    
}

let printResults:any[] = [];
function runInWolfram(print=false){
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    let sel:vscode.Selection = e!.selection;
    let outputPosition:vscode.Position = new vscode.Position(sel.active.line+1, 0);

    
    if (e?.document.lineCount == outputPosition.line) {
        e?.edit(editBuilder => {
            editBuilder.insert(outputPosition!, "\n")
        })
    }

    if(e?.document.uri.scheme==='vscode-notebook-cell') {
        // let n:WolframNotebook | undefined = wolframNotebookProvider._notebooks.get(e.document.uri.toString());
        // if (n){
        //     wolframNotebookProvider.executeCell(n, n.cells[0])
        // }
        
    }
    else if (e?.document.uri.scheme === 'file' || e?.document.uri.scheme ==='untitled') {
        e.selection = new vscode.Selection(outputPosition, outputPosition);
        e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);

        // wolframKernelClient.sendNotification("moveCursor", {range:sel, textDocument:e.document});
        wolframKernelClient.sendNotification("runInWolfram", {range:sel, textDocument:e.document, print:print});
    }
}

function onRunInWolfram(result:any){
    let editors:vscode.TextEditor[] = vscode.window.visibleTextEditors;
    let e = editors.filter((e) => {return e.document.uri.path === result["document"]["path"]})[0];
    if(e){
        updateResults(e, result, result["print"]);
    }
}

let variableTable:any = {}
function updateVarTable(vars:any) {
    for (let index = 0; index < vars["values"].length; index++) {
        variableTable[vars["values"][index][0]] = vars["values"][index][1].slice(0, 200) + "...";
    }
    updateOutputPanel();
}

let maxPrintResults = 20;
function updateResults(e:vscode.TextEditor | undefined, result:any, print:boolean) {
    if (printResults.length > maxPrintResults) {
        printResults.shift();
    }
    
    if(typeof(e) !== "undefined") {
        e.edit(editBuilder => {

            printResults.push(result["output"].toString());
            showOutput();

            if(print){
                let sel:vscode.Selection = e!.selection;
                let outputPosition:vscode.Position = new vscode.Position(sel.active.line+1, 0);
                editBuilder.insert(outputPosition, "\t" + result["result"] + "\n");
            }
        });
    };

    updateOutputPanel();
    wolframStatusBar.text = wolframVersionText;

}

function runCell() {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    // let n: vscode.NotebookDocument| undefined = e?.document;
    // let currentCell:vscode.NotebookCell;

    
    // if (n?.cells) {
    //     for (let index = 0; index < n.cells.length; index++) {
    //         if (n.cells[index].document.getText() === e?.document.getText()) {
    //             currentCell = n.cells[index]
    //             wolframNotebookProvider.executeCell(e, currentCell)
    //             break
    //         }
            
    //     }
    // }
}



function runExpression(expression:string, line:0, end:100) {
    let e: vscode.TextEditor | undefined = (vscode.window.activeTextEditor == null) ? vscode.window.visibleTextEditors[0] : vscode.window.activeTextEditor;
    
    wolframKernelClient.sendNotification("runExpression", {print:false, expression:expression, textDocument:e?.document, line:line, end:end});
}



function printInWolfram(){
    let print = true;
    runInWolfram(print);
}


function textToSection() {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    
    let lines: string[];
    let newlines: string = "";

    if (e){
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

    if (e){
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

function abort() {
    wolframClient.sendRequest("abort");
    wolframStatusBar.text = wolframVersionText;
}

function restartWolfram() {
    // try {
    //     kill(wolfram.pid);
    // } catch {
    //     outputChannel.appendLine("Failed to stop wolfram: " + wolfram.pid.toString());
    // }
    outputChannel.appendLine("Restarting");
    wolframStatusBar.text = "$(repo-sync~spin) Loading Wolfram...";
    wolframStatusBar.show();

    vscode.window.showInformationMessage("Wolfram is restarting.");

    wolframClient.stop();
    wolframKernelClient.stop();

    let isWin = /^win/.test(process.platform);
    if(isWin) {
        let cp = require('child_process');
        cp.exec('taskkill /PID ' + wolfram.pid + ' /T /F', function (error:any, stdout:any, stderr:any) {
        }); 
        cp.exec('taskkill /PID ' + wolframKernel.pid + ' /T /F', function (error:any, stdout:any, stderr:any) {
        }); 

    } else {        
        kill(wolfram.pid);
        kill(wolframKernel.pid);
    }

    //let context = myContext;
    // context.subscriptions.forEach((sub:any) => {
    //     try {
    //         sub.dispose();
    //     } catch (error) {
    //         outputChannel.appendLine("subs: " + error);
    //     }
    // });
    // context.subscriptions.push(loadWolframServer(outputChannel, context));
    
    theContext.subscriptions.length = 0;


    fp(randomPort()).then((freep:any) => { 
        kernelPORT = freep[0];
        outputChannel.appendLine("Kernel Port: " + kernelPORT.toString());
        loadwolframKernel().then(async (success:any) => {
            await new Promise(resolve => setTimeout(resolve, 5000));
            theKernelDisposible.dispose();
            theKernelDisposible = loadWolframKernelClient(outputChannel, theContext)
            theContext.subscriptions.push(theKernelDisposible);
            // wolframNotebookProvider.setWolframClient(wolframClient);
    
        });
    }); 

    fp(randomPort()).then((freep:any) => { 
        PORT = freep[0];
        outputChannel.appendLine("LSP Port: " + PORT.toString());
        loadwolfram().then(async (success:any) => {
            await new Promise(resolve => setTimeout(resolve, 5000));
            // loadWolframServer(outputChannel, context)
            theDisposible.dispose();
            theDisposible = loadWolframServer(outputChannel, theContext);
            // wolframNotebookProvider.setWolframClient(wolframClient);
            try{
                // theContext.subscriptions.push(vscode.notebook.registerNotebookContentProvider('wolfram', wolframNotebookProvider));
            } catch {}
            theContext.subscriptions.push(theDisposible);
            wolframStatusBar.text = wolframVersionText;
    
        });
    
    }); 
}

let kill = function (pid:any) {
    let signal   = 'SIGKILL';
    let callback = function () {};
    var killTree = true;
    if(killTree) {
        psTree(pid, function (err:any, children:any) {
            [pid].concat(
                children.map(function (p:any) {
                    return p.PID;
                })
            ).forEach(function (tpid) {
                try { process.kill(tpid, signal);}
                catch (ex) {
                    outputChannel.appendLine("Failed to kill: " + tpid.toString())
                 }
            });
            callback();
        });
    } else {
        try { process.kill(pid, signal); }
        catch (ex) { 
            outputChannel.appendLine("Failed to kill: " + pid.toString())}
        callback();
    }
};

function runToLine() {
    let e:any = vscode.window.activeTextEditor;
    let sel:vscode.Position = e?.selection.active;
    let outputPosition:vscode.Position = new vscode.Position(sel.line+1, 0);
    let r:vscode.Selection = new vscode.Selection(
        0,
        0,
        sel.line,
        sel.character
    );
  
    e.revealRange(r, vscode.TextEditorRevealType.Default);

    wolframClient.sendRequest("runInWolfram", {range:r, textDocument:e.document, print:false}).then((result:any) => {
        // cursor has not moved yet
        if (e.selection.active.line === outputPosition.line-1 && e.selection.active.character === outputPosition.character){
            outputPosition = new vscode.Position(result["position"]["line"], result["position"]["character"]);
            e.selection = new vscode.Selection(outputPosition, outputPosition);
            e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
        }

        updateResults(e, result, false);
    });
}

function didChangeWindowState(state:vscode.WindowState) {
    if (wolframClient !== null || wolframClient !== undefined) {
        if(state.focused === true){
            wolframClient.onReady().then(ready  => {
                wolframClient.sendNotification("windowFocused", true);
            });
        } else {
            wolframClient.onReady().then(ready  => {
                wolframClient.sendNotification("windowFocused", false);
            });
        }
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
        }
    }
);

let workspaceDecorations:{ [index:string]: vscode.DecorationOptions[];} = {};
function clearDecorations() {
    let e = vscode.window.activeTextEditor;

    workspaceDecorations = {};
    e?.setDecorations(variableDecorationType, []);
}

function updateDecorations(decorations:vscode.DecorationOptions[]) {
    let editor = vscode.window.activeTextEditor;
    if(editor?.document.uri.scheme==='file') {
        //editor.setDecorations(variableDecorationType, []);

        if(typeof(editor) === "undefined"){
            return;
        }
        let uri = editor.document.uri.toString();

        workspaceDecorations[uri] = {} as vscode.DecorationOptions[];
        decorations.forEach(d => {
            workspaceDecorations[uri][d.range.start.line] = d;
        });

        let editorDecorations:vscode.DecorationOptions[] = [];
        Object.keys(workspaceDecorations[uri]).forEach((d:any) => {
            editorDecorations.push(workspaceDecorations[uri][d]);
        });
        
        editor.setDecorations(variableDecorationType, editorDecorations);
    }
}

function wolframBusy(params:any) {
    if(params.busy === true){
        kernelStatusBar.color = "red";
        wolframStatusBar.text = "$(repo-sync~spin) Wolfram Running";
        wolframStatusBar.show();
    } else {
        kernelStatusBar.color = "yellow";
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();
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

function runInTerminal(){
    if(!vscode.window.activeTerminal) {
        startWolframTerminal();
    }

    let e:any = vscode.window.activeTextEditor;
    let d:vscode.TextDocument = e!.document;
    let sel = e!.selections;
    vscode.window.activeTerminal?.sendText(d.getText(new vscode.Range(e.selection.start, e?.selection.end)));
}

function help() {
    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    let d = e!.document;
    let sel = e!.selections;
    let txt = "";
    let dataString = "";
    for(var x = 0; x < sel.length; x++) {
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
        <iframe src="${url}" style="height:100vh; width:100%" sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-modals"></iframe>
    </body>
    </html>
    `
}


let outputPanel:vscode.WebviewPanel | undefined;
function showOutput() {
    let outputColumn:vscode.ViewColumn | undefined  = vscode.window.activeTextEditor?.viewColumn;
    //let out = "<table id='outputs'>";

    if(outputPanel) {
        if (outputPanel.visible){

        } else {
            if(outputColumn){
                outputPanel.reveal(outputColumn+1, true);
        } else{
            outputPanel.reveal(1, true);
        }
    }
    } else {
        if (outputColumn){
        outputPanel = vscode.window.createWebviewPanel(
            'WolframOutput',
            "Wolfram Output",
            {viewColumn:outputColumn+1, preserveFocus:true},
            {
                localResourceRoots: [vscode.Uri.file(path.join(theContext.extensionPath, 'wolfram'))],
                enableScripts: true,
                retainContextWhenHidden: true
            });
        
        outputPanel.webview.html = getOutputContent(outputPanel.webview);

        outputPanel.webview.onDidReceiveMessage(
            message => {
                runExpression(message.text, 0, 100);
                return;
            }
        , undefined, theContext.subscriptions);

        outputPanel.onDidDispose(() => {
            outputPanel = undefined;
        }, null);


        updateOutputPanel()
        }
    }

}

function updateOutputPanel(){
    let out = "";

    for (let i = 0; i < printResults.length; i++) {
        // out += "<tr><td>" + i.toString() + ": </td><td>" + img3 + "</td></tr>";

        
        let data = "";
        try{
            data += fs.readFileSync(printResults[i], 'utf8');
        } catch(e){
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

    let vars = "<tr><th>Var</th><th>Value</th></tr>\n";

    let i = 0;
    Object.keys(variableTable).forEach(k => {
        if (i % 2 === 0) {
            vars += "<tr><td style='background:var(--vscode-editor-foreground) !important; color:var(--vscode-editor-background) !important;'>" + k + "</td><td style='background:var(--vscode-editor-foreground) !important; color:var(--vscode-editor-background) !important;'>" + variableTable[k] + "</td></tr>\n"
        } else {
            vars += "<tr><td>" + k + "</td><td>" + variableTable[k] + "</td></tr>\n"
        }
        i++;
    });

    outputPanel?.webview.postMessage({text:out, vars:vars});
}

function getOutputContent(webview:any) {
    let timeNow = new Date().getTime();
    let result = `<!DOCTYPE html>
    <html lang="en">
    <head>
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

        <!--
        Use a content security policy to only allow loading printResults from https or from our extension directory,
        and only allow scripts that have a specific nonce.
        
        <meta http-equiv="Content-Security-Policy" content="default-src 'none';">

        <meta http-equiv="Content-Security-Policy" content="default-src 'all'; img-src ${webview.cspSource} https: data:; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource};"/>
        -->
        <meta http-equiv="Content-Security-Policy" content="default-src *; img-src ${webview.cspSource} https: data:; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';"/>
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
                <table id="varTable">
                    <th><td>Var</td><td>Value</td></th>
                    <tr><td></td><td>No values defined yet</td></tr>
                </table>
            </div>
            <div class="inner" id='outputs'>
            </div>
            <div id="scratch">
                <textarea id="expression" onkeydown="run(this)" rows="3" placeholder="Shift+Enter to run"></textarea>
            </div> 
        </div>
    </body>
    </html>`;
    return result;
}