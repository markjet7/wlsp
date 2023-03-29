/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	TextDocumentChangeEvent,
	DidChangeTextDocumentParams
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import * as cp from 'child_process';

import * as path from 'path';

import * as vscode from 'vscode';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);
const extensionPath = path.resolve(__dirname, '..');

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

let wolfram:cp.ChildProcess;
let wolframReady = false;
let wolframLaunching = false;
async function loadWolfram():Promise<void> {
	return new Promise((resolve, reject) => {
    // wolfram = cp.spawnSync( 'wolframscript', ['-file', '/Users/markmw/Github/wlsp/wolfram/wolfram-kernel-io.wl'],
	
	// {stdio:['inherit', 'inherit', 'pipe']});
	if (wolframReady) {
		resolve();
		return;
	}

	wolframLaunching = true;
	wolfram?.emit('exit')
	// console.log(extensionPath);
	wolfram = cp.spawn('wolframscript', ['-file', path.join(extensionPath, "wolfram", 'wolfram-kernel-io.wl')]);

	wolfram.on("data", (data:any) => {
		console.log(`data: ${data}`);
	});

	wolfram.on('close', (code:any) => {
		console.log(`child process exited with code ${code}`);
	});

	wolfram.on('error', (err:any) => {
		console.log(`child process error ${err}`);
	});

	wolfram.on('exit', (code:any) => {
		console.log(`child process exited with code ${code}`);
	});

	process.stdin.pipe(wolfram?.stdin as NodeJS.WritableStream);

	wolfram.stdout?.once('data', (data:any) => {
		// console.log(`data: ${data}`);
		wolframReady = true;
		// console.log('wolfram ready');

		let chunk:string = "";
		wolfram?.stdout?.on('data', (data:any) => {
			// console.log(`stdout: ${data}`);
			chunk += data.toString();

			try {
				if (!chunk.includes("(*---*)")) {
					0;
				} else {
					let messages = chunk.split("(*---*)");
					chunk = chunk.split("(*---*)").pop() as string;
					for (let message of messages) {
						let json = JSON.parse(message);
						if (Object.keys(json).includes("method")) {
							// console.log("method: " + json.method);
							connection.sendNotification(json.method, json.params);
						}
						else {
							// console.log("message: " + data.toString());
						}
					}			
				}
			} catch (e) {
				// console.error("Error parsing kernel output: " + e);
			}
		});

		wolfram.stdin?.write(JSON.stringify(["path", path.join(extensionPath, "wolfram")]) + "\n");
		resolve();
	});
	});
}

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			workspace: {
				workspaceFolders: {
					supported: true
				}
			},
			hoverProvider: true
			// Tell the client that this server supports code completion.
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
    loadWolfram().then(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
		console.log('registered for config changes');
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});
});

// The example settings

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.

// Cache the settings of all open documents

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		// documentSettings.clear();
	} else {
		// globalSettings = <ExampleSettings>(
		// 	(change.settings.languageServerExample || defaultSettings)
		// );
	}

	// Revalidate all open text documents
	// documents.all().forEach(validateTextDocument);
});

// Only keep settings for open documents
documents.onDidClose(e => {
	
});

documents.onDidOpen((change:TextDocumentChangeEvent<TextDocument>) => {
	if (wolframReady) {
	onDidOpen(change);
	} 

	if (wolframReady == false && wolframLaunching == false) {
		wolframLaunching = true;
		loadWolfram();
		onDidOpen(change);
		
	}

	if (wolframReady == false && wolframLaunching == true) {
		setTimeout(() => {
			onDidOpen(change);
		}, 2000);
	}
});

function onDidOpen(change:TextDocumentChangeEvent<TextDocument>) {
	if (wolframReady == false) {
		setTimeout(() => {
			onDidOpen(change);
		}, 2000);
		return
	}

	// console.log("on did open");
	wolfram.stdin?.write(JSON.stringify(["textDocument/didOpen", 
	{
		"textDocument": {
			"uri": change.document.uri,
			"text": change.document.getText()
		}
	}
]) + "\n");
}


// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change:TextDocumentChangeEvent<TextDocument>) => {
	if (wolframReady) {
		wolfram.stdin?.write(JSON.stringify(["textDocument/didChange", 
		{
			"textDocument": {
				"uri": change.document.uri
			},
			"contentChanges": [{"text":change.document.getText()}]
		}
	]) + "\n");

	} 

	if (wolframReady == false && wolframLaunching == false) {
		// console.log("not ready")
		wolframLaunching = true;
		loadWolfram();
	}
});

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

// let requestListener:any;
let id = 0;
connection.onRequest((request, params:any) => {
	// console.log("Received: " + request)
	// console.log(wolfram);
	// console.log("sending request")
	// wolfram.stdin?.write(JSON.stringify([request, params]), (msg:any) => {console.log(msg)});
	if (wolframReady) {
		id += 1;
		params["id"] = id;
		// console.log("sending: " + JSON.stringify([request, params]))
		wolfram.stdin?.write(JSON.stringify([request, params]) + "\n");

		let requestListener = (data:any) => {
			try {
				let parsed = JSON.parse(data.toString());
				if (parsed["id"] == id) {
					// console.log("received: " + data);
					wolfram.stdout?.removeListener('data', requestListener);
					// console.log("removed listener")
					return parsed["result"];
				}
			} catch (e) {
				// console.log("error parsing: " + e);
				return "error"
			}
		}

		wolfram.stdout?.on('data', requestListener)
	} 

	if (wolframReady == false && wolframLaunching == false) {
		// console.log("not ready")
		wolframLaunching = true;
		loadWolfram();
	}
});

connection.onNotification((notification, params) => {
	// console.log("params: " + JSON.stringify(params))
	// console.log(`{${notification}, ${params?.toString()}}\n`);
	// wolfram.stdin?.write(`[${notification}, ${JSON.stringify(params)}]\n`);
	// wolfram.stdin?.write(`["notification", {"param":0}]\n`);
	// console.log(wolfram.stdin === undefined)

	// console.log("Received: " + notification)
	if (notification == "runInWolfram") {
		notification = "runInWolframIO";
	};

	if (notification == "Shutdown") {
		console.log("shutting down")
		shutdown();
		return
	}
	
	if (wolframReady) {
		// console.log("sending: " + JSON.stringify([notification, params]))
		wolfram.stdin?.write(JSON.stringify([notification, params]) + "\n");
	} 
	if (wolframReady == false && wolframLaunching == false) {
		// console.log("not ready")
		wolframLaunching = true;
		loadWolfram();
	}

	// connection.sendNotification('onRunInWolfram', 'hello wolfram');
});

connection.onShutdown(() => {
    // Do some cleanup
    // wolfram?.kill();
	// console.log("shutting down")
	wolfram.stdin?.write("[\"Quit\", \"\"]\n");
	// Gracefully shut down the child process by sending a SIGTERM signal
	wolfram.kill('SIGTERM');

	// Set a timeout to forcefully terminate the child process if it doesn't exit
	setTimeout(() => {
	if (!wolfram.killed) {
		// console.log('Forcefully terminating the child process');
		wolfram.kill('SIGKILL');
	}
	}, 3000); // 5 seconds timeout
		
} );

connection.onExit(() => {
    // Do some cleanup
    // wolfram?.kill();
	// console.log("exiting")
	wolfram.stdin?.write("[\"Quit\", \"\"]\n");
	// Gracefully shut down the child process by sending a SIGTERM signal
	wolfram.kill('SIGTERM');

	// Set a timeout to forcefully terminate the child process if it doesn't exit
	setTimeout(() => {
	if (!wolfram.killed) {
		// console.log('Forcefully terminating the child process');
		wolfram.kill('SIGKILL');
	}
	}, 3000); // 5 seconds timeout
		
} );

function shutdown() {
	// console.log("exiting")
	wolfram.stdin?.write(JSON.stringify(["Quit", []]) + "\n");
	// Gracefully shut down the child process by sending a SIGTERM signal
	wolfram.kill('SIGKILL');


	// Set a timeout to forcefully terminate the child process if it doesn't exit
	setTimeout(() => {
	if (!wolfram.killed) {
		// console.log('Forcefully terminating the child process');
		wolfram.kill('SIGKILL');
	}
	}, 3000); // 5 seconds timeout
	process.exit();
}