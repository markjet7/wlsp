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
exports.WolframEditorProvider = void 0;
const vscode = require("vscode");
const vscode_languageclient_1 = require("vscode-languageclient");
const psTree = require('ps-tree');
const net = require("net");
const fp = require('find-free-port');
const cp = require("child_process");
const path = require("path");
let kernel;
let kernelPORT;
let kernelPath;
let wolframKernel;
let context;
let outputChannel;
class WolframEditorProvider {
    constructor(context0) {
        this.context0 = context0;
        console.log("WolframEditorProvider constructor");
        context = context0;
    }
    static register(context, kernel0, outputChannel0) {
        const provider = new WolframEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(WolframEditorProvider.viewType, provider);
        context = context;
        outputChannel = outputChannel0;
        return providerRegistration;
    }
    resolveCustomTextEditor(document, webviewPanel, _token) {
        return __awaiter(this, void 0, void 0, function* () {
            webviewPanel.webview.options = {
                enableScripts: true,
            };
            webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
            function updateWebview() {
                if (kernel === undefined) {
                    connectKernelClient(outputChannel, context).then(() => {
                        if (kernel !== undefined) {
                            updateWebview();
                        }
                    });
                }
                else {
                    try {
                        kernel.sendRequest("nb2html", { document: document }).then((result) => {
                            webviewPanel.webview.postMessage({
                                type: 'update',
                                text: result,
                            });
                            //return this.updateTextDocument(document, result["result"]);
                        });
                    }
                    catch (e) {
                        vscode.window.showErrorMessage("Kernel is not ready. Please wait and try again.");
                        console.log(e);
                    }
                }
            }
            const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.uri.toString() === document.uri.toString()) {
                    updateWebview();
                }
            });
            webviewPanel.onDidDispose(() => {
                changeDocumentSubscription.dispose();
                stopWolfram(kernel, wolframKernel);
            });
            webviewPanel.webview.onDidReceiveMessage(e => {
                switch (e.type) {
                    case 'run':
                        updateWebview();
                        this.run(document, e.input, e.output);
                        return;
                    case 'update':
                        updateWebview();
                        this.updateTextDocument(document, e.text);
                        return;
                    // case 'delete':
                    // 	this.deleteScratch(document, e.id);
                    // 	return;
                }
            });
            updateWebview();
        });
    }
    /**
 * Get the static html used for the editor webviews.
 */
    getHtmlForWebview(webview) {
        // Local path to script and css for the webview
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'editor.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'editor.css'));
        const nonce = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return /* html */ `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
				Use a content security policy to only allow loading images from https or from our extension directory,
				and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleUri}" rel="stylesheet" />
				<title>Wolfram Editor</title>
			</head>
			<body>
				<div class="notes">
					<div class="add-button">
						<textarea>Enter Text</textarea>
					</div>
				</div>
				
				<script nonce="${nonce}"  src="${scriptUri}"></script>
			</body>
			</html>`;
    }
    /**
     * Add a new scratch to the current document.
     */
    run(document, text, output) {
        return this.runTextDocument(document, text, output);
    }
    /**
     * Try to get a current document as json text.
     */
    getDocumentAsJson(document) {
        const text = document.getText();
        if (text.trim().length === 0) {
            return {};
        }
        try {
            return JSON.parse(text);
        }
        catch (_a) {
            throw new Error('Could not get document as json. Content is not valid json');
        }
    }
    runTextDocument(document, input, output) {
        kernel.sendRequest("runNB", { document: document.getText(), input: input, output: output }).then((result) => {
            console.log(result);
            output.text = result["result"];
        });
    }
    /**
     * Write out the json to a given document.
     */
    updateTextDocument(document, html) {
        kernel.sendRequest("html2nb", { document: document, html: html }).then((result) => {
        });
    }
}
exports.WolframEditorProvider = WolframEditorProvider;
WolframEditorProvider.viewType = 'wolfram.editor';
function randomPort() {
    return Math.round(Math.random() * (100) + 8888);
}
function connectKernelClient(outputChannel, context) {
    return __awaiter(this, void 0, void 0, function* () {
        yield new Promise(resolve => {
            fp(randomPort()).then((freep) => {
                kernelPORT = freep[0];
                if (kernelPORT == undefined) {
                    console.log("Failed to find free port. Retrying");
                }
                console.log("Kernel Port: " + kernelPORT.toString());
                // await new Promise(resolve => setTimeout(resolve, 5000));
                loadwolfram(() => {
                    loadkernel(outputChannel, context, (theKernelDisposible) => {
                        if (theKernelDisposible != null) {
                            console.log("Connected to Kernel");
                            context.subscriptions.push(theKernelDisposible);
                            vscode.window.showInformationMessage("Wolfram is ready.");
                            resolve("Ready");
                        }
                        else {
                            console.log("Failed to connect to Kernel");
                            stopWolfram(kernel, wolframKernel);
                        }
                        // wolframNotebookProvider.setWolframKernelClient(wolframKernelClient);
                    });
                });
            });
        });
    });
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
function loadkernel(outputChannel, context, callback) {
    let serverOptions = function () {
        return new Promise((resolve, reject) => {
            let client = new net.Socket();
            setTimeout(() => {
                client.on("data", (data) => {
                    // console.log("WLSP Kernel Data: " + data.toString().substr(0, 200))
                });
                client.on('error', function (err) {
                    console.log("WLSP Kernel Error: " + err.message);
                    client.destroy();
                    // client.end();
                    setTimeout(() => {
                        client.connect(kernelPORT, "127.0.0.1", () => { });
                    }, 10000);
                });
                client.on('timeout', () => {
                    console.log("Kernel timed out");
                    client.destroy();
                    client.connect(kernelPORT, "127.0.0.1", () => { });
                });
                client.on('ready', () => {
                    console.log("Kernel is ready");
                });
                client.on('drain', () => {
                    console.log("Kernel is draining");
                });
                client.connect(kernelPORT, "127.0.0.1", () => {
                    client.setKeepAlive(true, 20000);
                    resolve({
                        reader: client,
                        writer: client
                    });
                });
            }, 10000);
        });
    };
    let clientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel
    };
    kernel = new vscode_languageclient_1.LanguageClient('wolfram', 'Wolfram Language Server Kernel', serverOptions, clientOptions);
    kernel.onReady().then(() => {
        // kernel.onNotification("onRunInWolfram", onRunInWolfram);
        // kernel.onNotification("wolframBusy", wolframBusy);
        // kernel.onNotification("updateDecorations", updateDecorations);
        // kernel.onNotification("updateVarTable", updateVarTable);
        // kernel.onNotification("moveCursor", moveCursor);
        // console.log("Sending kernel disposible");
        callback(disposible);
    });
    //console.log("Starting kernel disposible");
    let disposible = kernel.start();
    // setTimeout(() => {setInterval(check_pulse, 1000, wolframClient, kernel)}, 3000)
}
let loadwolfram = function (callback) {
    var _a, _b;
    if (process.env.VSCODE_DEBUG_MODE === "true") {
        kernelPORT = 6589;
    }
    else {
        try {
            kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
            if (process.platform === "win32") {
                wolframKernel = cp.spawn('cmd.exe', ['/c', 'wolframscript.exe', '-file', kernelPath, kernelPORT.toString(), kernelPath], { detached: false });
            }
            else {
                wolframKernel = cp.spawn('wolframscript', ['-file', kernelPath, kernelPORT.toString(), kernelPath], { detached: true });
            }
            if (wolframKernel.pid != undefined) {
                console.log("Launching wolframkernel: " + wolframKernel.pid.toString());
            }
            else {
                console.log("Launching wolframkernel: pid unknown");
            }
            (_a = wolframKernel.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
                console.log("WKernel: " + data.toString());
                outputChannel.appendLine("WKernel: " + data.toString());
                if (data.toString().includes("Kernel Ready")) {
                    console.log("Wolfram kernel loaded. Connecting...");
                    callback();
                }
            });
            wolframKernel.on('SIGPIPE', (data) => {
                console.log("SIGPIPE");
            });
            (_b = wolframKernel.stdout) === null || _b === void 0 ? void 0 : _b.on('error', (data) => {
                console.log("STDOUT Error" + data.toString());
            });
        }
        catch (error) {
            console.log(error);
            vscode.window.showErrorMessage("Wolframscript failed to load kernel.");
        }
    }
};
//# sourceMappingURL=wolframeditor.js.map