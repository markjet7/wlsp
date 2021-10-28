import * as vscode from 'vscode';
import { Uri, Webview } from "vscode";
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
import {WolframNotebook, WolframScriptSerializer, WolframNotebookSerializer} from './notebook';
import {WolframNotebookController} from './notebookController';
import {WolframScriptController} from './scriptController';
const fs = require('fs')

import { Client, wolframClient, wolframKernelClient } from './clients';

let outputChannel = vscode.window.createOutputChannel('wolf-lsp');
let context:vscode.ExtensionContext;
let scriptserializer:vscode.NotebookSerializer;
let notebookSerializer:WolframNotebookSerializer;
let notebookcontroller:WolframNotebookController;
let scriptController:WolframScriptController;
// let kernelStatusBar:vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
let client:Client;
let wolframStatusBar:vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
let wolframVersionText = "$(extensions-sync-enabled~spin) Wolfram";

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

function check_pulse(client:LanguageClient) {
    if (client !== undefined ){
        console.log(client.needsStart())
        if (!(client as any).isConnectionActive()) {
            console.log("Connection is not active. Restarting client");
            restart()
        }
    }
}

class workspaceSymbolProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor(private workspaceRoot: string | undefined) {
        this.workspaceRoot = workspaceRoot;
	}

    refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    //    if (!this.workspaceRoot) {
    //        return Promise.resolve([]);
    //    }
  
        return new Promise(resolve => {
            wolframClient.onReady().then(() => {
                    wolframClient.sendRequest("symbolList").then((result:any) => {
                    resolve(result.map((symbol:any) => 
                    {
                        let item = new vscode.TreeItem(symbol.name);
                        item.tooltip = symbol.definition;
                        let e = vscode.window.activeTextEditor;
                        item.command = {command: 'editor.action.goToLocations', arguments: [
                            vscode.Uri.parse(symbol.location.uri), 
                            new vscode.Position(symbol.location.range.start.line, symbol.location.range.start.character), 
                            [], 
                            "peek", 
                            "NA"], title: 'Go to'};
                        //item.command = {command: 'editor.action.addCommentLine', arguments: [], title: 'Add Comment'};

                        vscode.commands.executeCommand('editor.action.goToLocations', vscode.Uri.parse(symbol.location.uri), new vscode.Position(3, 0), [], "peek", "NA").then((result:any) => {
                            console.log("executed: ");
                            
                            console.log(result);
                        
                        })

                        return item

                    }));
                })
            });
        });

    }    
}


export function activate(context0: vscode.ExtensionContext){
    context = context0;
    client = new Client();
    let lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
    let kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));

    scriptserializer = new WolframScriptSerializer()
    notebookSerializer = new WolframNotebookSerializer()

    notebookcontroller = new WolframNotebookController()
    scriptController = new WolframScriptController()

    let treeDataProvider = new workspaceSymbolProvider(context.workspaceState.get('workspaceRoot'));
    vscode.window.registerTreeDataProvider('wolframSymbols', treeDataProvider);


    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('wolfram-notebook', notebookSerializer)
    );

    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('wolfram-script', scriptserializer)
    );

    context.subscriptions.push(notebookcontroller);
    context.subscriptions.push(scriptController);

    client.start(context, outputChannel).then(() => {
        onkernelReady();
    })


    vscode.workspace.onWillSaveTextDocument(willsaveDocument) 
    wolframStatusBar.text = wolframVersionText;
    wolframStatusBar.command = 'wolfram.restart';
    wolframStatusBar.show();

}

function restart(){
    client.restart(context, outputChannel).then(() => {
        setTimeout(onkernelReady, 2000);
    })
}

function onkernelReady() {
    try {
        if ((wolframKernelClient === undefined) || (wolframClient === undefined)) {
            setTimeout(onkernelReady, 2000)
            return
        }


        if(wolframKernelClient !== undefined) {
            wolframKernelClient.onReady().then(() => {
                console.log("Listening to kernel")
                wolframKernelClient.onNotification("onRunInWolfram", onRunInWolfram);
                wolframKernelClient.onNotification("wolframBusy", wolframBusy);
                wolframKernelClient.onNotification("updateDecorations", updateDecorations);
                wolframKernelClient.onNotification("updateVarTable", updateVarTable);
                wolframKernelClient.onNotification("moveCursor", moveCursor);
            });
        } 
        
        if (wolframClient !== undefined) {
            wolframClient.onReady().then(() => {
                wolframClient.sendRequest("wolframVersion").then((result:any) => {
                    wolframStatusBar.text = wolframVersionText = result.output
                })
            })
        } 
    } catch (error) {
        setTimeout(onkernelReady, 2000)
   }

}

function wolframBusy(params:any) {
    if(params.busy === true){
        //kernelStatusBar.color = "red";
        wolframStatusBar.text = "$(extensions-sync-enabled~spin) Wolfram Running";
        wolframStatusBar.show();
    } else {
        //kernelStatusBar.color = "yellow";
        wolframStatusBar.text = wolframVersionText;
        wolframStatusBar.show();
    }
}

function willsaveDocument(event:vscode.TextDocumentWillSaveEvent) {
    if(event.document.fileName.endsWith(".nb")) {
        
    }
}

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

function createFile(){
    vscode.workspace.openTextDocument(vscode.Uri.parse("untitled:.wl")).then((document:vscode.TextDocument) => {
        vscode.window.showTextDocument(document);
    });
}

function createNotebook(){
    vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.nb")).then((document:vscode.NotebookDocument) => {
        vscode.window.showNotebookDocument(document);
    });
}

function createNotebookScript(){
    vscode.workspace.openNotebookDocument(vscode.Uri.parse("untitled:.wl")).then((document:vscode.NotebookDocument) => {
        vscode.window.showNotebookDocument(document);
    });
}

export let printResults:any[] = [];
export function runInWolfram(print=false){
    if (wolframKernelClient === undefined) {
        vscode.window.showWarningMessage("Wolfram kernel is not running. Please wait or start the kernel first.");
        return
    }

    let e: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    let sel:vscode.Selection = e!.selection;
    let outputPosition:vscode.Position = new vscode.Position(sel.active.line+1, 0);

    
    if (e?.document.lineCount == outputPosition.line) {
        e?.edit(editBuilder => {
            editBuilder.insert(outputPosition!, "\n")
        })
    }

    if(e?.document.uri.scheme==='vscode-notebook-cell') {
        e.selection = new vscode.Selection(0, 0, 1, 1)
        try {
            wolframKernelClient.sendNotification("runInWolfram", {range:sel, textDocument:e.document, print:false});
        } catch (err) {
            console.log(err);
        }
        
    }
    else if (e?.document.uri.scheme === 'file' || e?.document.uri.scheme ==='untitled') {
        e.selection = new vscode.Selection(outputPosition, outputPosition);
        e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);

        // wolframKernelClient.sendNotification("moveCursor", {range:sel, textDocument:e.document});
        
        wolframKernelClient.onReady().then(ready => {
            wolframKernelClient.sendNotification("runInWolfram", {range:sel, textDocument:e?.document, print:print})
        });
    }
}

function onRunInWolfram(result:any){
    let editors:vscode.TextEditor[] = vscode.window.visibleTextEditors;
    let e = editors.filter((e) => {return e.document.uri.path === result["document"]["path"]})[0];
    
    if (e.document.uri.scheme == 'vscode-notebook-cell') {
        
    }else{
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
            // showOutput();

            if(print){
                let sel:vscode.Selection = e!.selection;
                let outputPosition:vscode.Position = new vscode.Position(sel.active.line+1, 0);
                editBuilder.insert(outputPosition, "\t" + result["result"] + "\n");
            }
        });
    };

    updateOutputPanel();

}


function runExpression(expression:string, line:0, end:100) {
    let e: vscode.TextEditor | undefined = (vscode.window.activeTextEditor == null) ? vscode.window.visibleTextEditors[0] : vscode.window.activeTextEditor;
    
    wolframKernelClient.sendRequest("runExpression", {print:false, expression:expression, textDocument:e?.document, line:line, end:end}).then((result:any) => {});
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
    wolframClient.sendNotification("abort");
}

function stopWolfram(client:any, client_process:any) {
    client.stop();

    let isWin = /^win/.test(process.platform);
    if(isWin) {
        let cp = require('child_process');
        cp.exec('taskkill /PID ' + client_process.pid + ' /T /F', function (error:any, stdout:any, stderr:any) {
        }); 

    } else {        
        kill(client_process.pid);
    }
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
            ).forEach(function (pid) {
                try { process.kill(pid, signal);}
                catch (ex) {
                    console.log("Failed to kill: " + pid)
                 }
            });
            callback();
        });
    } else {
        try { process.kill(pid, signal); }
        catch (ex) { 
            console.log("Failed to kill wolfram process")}
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

    try {    
        wolframKernelClient.sendRequest("runInWolfram", {range:r, textDocument:e.document, print:false}).then((result:any) => {
        // cursor has not moved yet
        if (e.selection.active.line === outputPosition.line-1 && e.selection.active.character === outputPosition.character){
            outputPosition = new vscode.Position(result["position"]["line"], result["position"]["character"]);
            e.selection = new vscode.Selection(outputPosition, outputPosition);
            e.revealRange(new vscode.Range(outputPosition, outputPosition), vscode.TextEditorRevealType.Default);
        }

            updateResults(e, result, false);
        });
    } catch {
        console.log("Kernel is not ready. Restarting...")
    }


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
    if(editor?.document.uri.scheme==='file' || editor?.document.uri.scheme==='untitled') {
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
                // localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'wolfram'))],
                enableScripts: true,
                retainContextWhenHidden: true
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
        `
        i++;
    });

    outputPanel?.webview.postMessage({text:out, vars:vars});
}

function getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
    return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
  }

function getOutputContent(webview:any, extensionUri: Uri) {
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



