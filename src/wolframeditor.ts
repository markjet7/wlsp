import * as vscode from 'vscode';
import { 
	LanguageClient,
	LanguageClientOptions,
    NotificationType,
	ServerOptions,
	TransportKind } from 'vscode-languageclient';
const psTree = require('ps-tree');
import * as net from 'net';
const fp = require('find-free-port');
import * as cp from 'child_process';
import * as path from 'path';
import { resolve } from 'path';
import { rejects } from 'assert';

let kernel:LanguageClient;
let kernelPORT:number;
let kernelPath:string;
let wolframKernel:cp.ChildProcess;
let context:vscode.ExtensionContext;
let outputChannel:vscode.OutputChannel;

export class WolframEditorProvider implements vscode.CustomTextEditorProvider {
    public static register(context: vscode.ExtensionContext, kernel0:LanguageClient, outputChannel0:vscode.OutputChannel):vscode.Disposable {
        const provider = new WolframEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(WolframEditorProvider.viewType, provider);
		context = context;
		outputChannel = outputChannel0;
        return providerRegistration
    }

    private static readonly viewType = 'wolfram.editor'

    constructor(
		private readonly context0: vscode.ExtensionContext
    ) {
		console.log("WolframEditorProvider constructor");
		context = context0;
	}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        function updateWebview () {
			if (kernel === undefined) {
				connectKernelClient(outputChannel, context).then(() =>{
					if (kernel !== undefined) {
						updateWebview()
					}
				})
			} else {
				try{
					kernel.sendRequest("nb2html", {document:document}).then((result:any) => {
						webviewPanel.webview.postMessage({
							type: 'update',
							text: result,
						})
						//return this.updateTextDocument(document, result["result"]);
					})
				} catch(e) {
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
    }
        /**
	 * Get the static html used for the editor webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {

		// Local path to script and css for the webview
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
			context.extensionUri, 'media', 'editor.js'));

		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(
			context.extensionUri, 'media', 'editor.css'));

		const nonce = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

		return /* html */`
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
	private run(document: vscode.TextDocument, text: string, output:any) {

		return this.runTextDocument(document, text, output);

	}
	/**
	 * Try to get a current document as json text.
	 */
	private getDocumentAsJson(document: vscode.TextDocument): any {
		const text = document.getText();
		if (text.trim().length === 0) {
			return {};
		}

		try {
			return JSON.parse(text);
		} catch {
			throw new Error('Could not get document as json. Content is not valid json');
		}
	}

	private runTextDocument(document: vscode.TextDocument, input: any, output:any) {
		kernel.sendRequest("runNB", {document:document.getText(), input:input, output:output}).then((result:any) => {
			console.log(result);
			output.text = result["result"];
	    })
	}

	/**
	 * Write out the json to a given document.
	 */
	private updateTextDocument(document: vscode.TextDocument, html: any) {
		kernel.sendRequest("html2nb", {document:document, html:html}).then((result:any) => {

	    })
	}

}

function randomPort(){
	return Math.round(Math.random()*(100)+8888);
}

async function connectKernelClient(outputChannel:any, context:any) {
	await new Promise(resolve => {
			fp(randomPort()).then((freep:any) => {
			kernelPORT = freep[0];
			if (kernelPORT == undefined) {
				console.log("Failed to find free port. Retrying");
			}
			console.log("Kernel Port: " + kernelPORT.toString());
			
				// await new Promise(resolve => setTimeout(resolve, 5000));
			loadwolfram(() => {
				loadkernel(outputChannel, context, (theKernelDisposible:any) => {
						if(theKernelDisposible != null) {
							console.log("Connected to Kernel");
							context.subscriptions.push(theKernelDisposible);
							vscode.window.showInformationMessage("Wolfram is ready.");
							resolve("Ready")
						} else {
							console.log("Failed to connect to Kernel");
							stopWolfram(kernel, wolframKernel);
						}
						// wolframNotebookProvider.setWolframKernelClient(wolframKernelClient);
		
					});
			});
		})
	})
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

function loadkernel(outputChannel:any, context:vscode.ExtensionContext, callback:any) {
	let serverOptions:ServerOptions = function () {
			return new Promise((resolve, reject) => {
				let client = new net.Socket();

				setTimeout(() => {
					client.on("data", (data:any) => {
						// console.log("WLSP Kernel Data: " + data.toString().substr(0, 200))
					});
	
					client.on('error', function(err:any){
						console.log("WLSP Kernel Error: "+ err.message);
						client.destroy();
						// client.end();
						setTimeout(() => {
							client.connect(kernelPORT, "127.0.0.1", () => {});
						}, 10000);
					})
	
					client.on('timeout', () => {
						console.log("Kernel timed out")
						client.destroy();
						client.connect(kernelPORT, "127.0.0.1", () => {});
					});

					client.on('ready', () => {
						console.log("Kernel is ready")   
					})
	
					client.on('drain', () => {
						console.log("Kernel is draining")
					})

					client.connect(kernelPORT, "127.0.0.1", () => {
						client.setKeepAlive(true,20000);
						resolve({
							reader: client,
							writer: client
						});
					});}, 10000);
			})
		};

		let clientOptions: LanguageClientOptions = {
			documentSelector: [
				"wolfram"
			],
			diagnosticCollectionName: 'wolfram-lsp',
			outputChannel: outputChannel
		};

		kernel = new LanguageClient('wolfram', 'Wolfram Language Server Kernel', serverOptions, clientOptions)
		kernel.onReady().then(() => {
			// kernel.onNotification("onRunInWolfram", onRunInWolfram);
			// kernel.onNotification("wolframBusy", wolframBusy);
			// kernel.onNotification("updateDecorations", updateDecorations);
			// kernel.onNotification("updateVarTable", updateVarTable);
			// kernel.onNotification("moveCursor", moveCursor);
			// console.log("Sending kernel disposible");
			callback(disposible)
		});

		//console.log("Starting kernel disposible");
		let disposible = kernel.start();
		// setTimeout(() => {setInterval(check_pulse, 1000, wolframClient, kernel)}, 3000)
}

let loadwolfram = function(callback:any) {
	if (process.env.VSCODE_DEBUG_MODE === "true") {
		kernelPORT = 6589;
	} else {
	try {
		kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
		if (process.platform === "win32") {
			wolframKernel = cp.spawn('cmd.exe', ['/c', 'wolframscript.exe', '-file', kernelPath, kernelPORT.toString(), kernelPath], {detached:false});
		} else {
			wolframKernel = cp.spawn('wolframscript', ['-file', kernelPath, kernelPORT.toString(), kernelPath], {detached:true});
		}

		if (wolframKernel.pid != undefined) {
			console.log("Launching wolframkernel: " + wolframKernel.pid.toString());
		} else {
			console.log("Launching wolframkernel: pid unknown");
		}

		wolframKernel.stdout?.on('data', (data) => {
			console.log("WKernel: " + data.toString());
			outputChannel.appendLine("WKernel: " + data.toString());
			if (data.toString().includes("Kernel Ready")){
				console.log("Wolfram kernel loaded. Connecting...");
				callback();
			}
		});

		wolframKernel.on('SIGPIPE', (data) => {
			console.log("SIGPIPE");
		});

		wolframKernel.stdout?.on('error', (data) => {
			console.log("STDOUT Error" + data.toString());
		});

		} catch (error) {
			console.log(error)
			vscode.window.showErrorMessage("Wolframscript failed to load kernel.")
		}  
		
	}
}