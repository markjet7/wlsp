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
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const cp = require("child_process");
const path = require("path");
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
const extensionPath = path.resolve(__dirname, '..');
// Create a simple text document manager.
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
let wolfram;
let wolframReady = false;
let wolframLaunching = false;
function loadWolfram() {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            // wolfram = cp.spawnSync( 'wolframscript', ['-file', '/Users/markmw/Github/wlsp/wolfram/wolfram-kernel-io.wl'],
            var _a;
            // {stdio:['inherit', 'inherit', 'pipe']});
            if (wolframReady) {
                resolve();
                return;
            }
            wolframLaunching = true;
            wolfram === null || wolfram === void 0 ? void 0 : wolfram.emit('exit');
            // console.log(extensionPath);
            wolfram = cp.spawn('wolframscript', ['-file', path.join(extensionPath, "wolfram", 'wolfram-kernel-io.wl')]);
            wolfram.on("data", (data) => {
                console.log(`data: ${data}`);
            });
            wolfram.on('close', (code) => {
                console.log(`child process exited with code ${code}`);
            });
            wolfram.on('error', (err) => {
                console.log(`child process error ${err}`);
            });
            wolfram.on('exit', (code) => {
                console.log(`child process exited with code ${code}`);
            });
            process.stdin.pipe(wolfram === null || wolfram === void 0 ? void 0 : wolfram.stdin);
            (_a = wolfram.stdout) === null || _a === void 0 ? void 0 : _a.once('data', (data) => {
                var _a, _b;
                // console.log(`data: ${data}`);
                wolframReady = true;
                // console.log('wolfram ready');
                let chunk = "";
                (_a = wolfram === null || wolfram === void 0 ? void 0 : wolfram.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
                    // console.log(`stdout: ${data}`);
                    chunk += data.toString();
                    try {
                        if (!chunk.includes("(*---*)")) {
                            0;
                        }
                        else {
                            let messages = chunk.split("(*---*)");
                            chunk = chunk.split("(*---*)").pop();
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
                    }
                    catch (e) {
                        // console.error("Error parsing kernel output: " + e);
                    }
                });
                (_b = wolfram.stdin) === null || _b === void 0 ? void 0 : _b.write(JSON.stringify(["path", path.join(extensionPath, "wolfram")]) + "\n");
                resolve();
            });
        });
    });
}
connection.onInitialize((params) => {
    const capabilities = params.capabilities;
    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    hasDiagnosticRelatedInformationCapability = !!(capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation);
    const result = {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Full,
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
            connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
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
    }
    else {
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
documents.onDidOpen((change) => {
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
function onDidOpen(change) {
    var _a;
    if (wolframReady == false) {
        setTimeout(() => {
            onDidOpen(change);
        }, 2000);
        return;
    }
    // console.log("on did open");
    (_a = wolfram.stdin) === null || _a === void 0 ? void 0 : _a.write(JSON.stringify(["textDocument/didOpen",
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
documents.onDidChangeContent((change) => {
    var _a;
    if (wolframReady) {
        (_a = wolfram.stdin) === null || _a === void 0 ? void 0 : _a.write(JSON.stringify(["textDocument/didChange",
            {
                "textDocument": {
                    "uri": change.document.uri
                },
                "contentChanges": [{ "text": change.document.getText() }]
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
connection.onRequest((request, params) => {
    var _a, _b;
    // console.log("Received: " + request)
    // console.log(wolfram);
    // console.log("sending request")
    // wolfram.stdin?.write(JSON.stringify([request, params]), (msg:any) => {console.log(msg)});
    if (wolframReady) {
        id += 1;
        params["id"] = id;
        // console.log("sending: " + JSON.stringify([request, params]))
        (_a = wolfram.stdin) === null || _a === void 0 ? void 0 : _a.write(JSON.stringify([request, params]) + "\n");
        let requestListener = (data) => {
            var _a;
            try {
                let parsed = JSON.parse(data.toString());
                if (parsed["id"] == id) {
                    // console.log("received: " + data);
                    (_a = wolfram.stdout) === null || _a === void 0 ? void 0 : _a.removeListener('data', requestListener);
                    // console.log("removed listener")
                    return parsed["result"];
                }
            }
            catch (e) {
                // console.log("error parsing: " + e);
                return "error";
            }
        };
        (_b = wolfram.stdout) === null || _b === void 0 ? void 0 : _b.on('data', requestListener);
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
    var _a;
    // console.log("Received: " + notification)
    if (notification == "runInWolfram") {
        notification = "runInWolframIO";
    }
    ;
    if (notification == "Shutdown") {
        console.log("shutting down");
        shutdown();
        return;
    }
    if (wolframReady) {
        // console.log("sending: " + JSON.stringify([notification, params]))
        (_a = wolfram.stdin) === null || _a === void 0 ? void 0 : _a.write(JSON.stringify([notification, params]) + "\n");
    }
    if (wolframReady == false && wolframLaunching == false) {
        // console.log("not ready")
        wolframLaunching = true;
        loadWolfram();
    }
    // connection.sendNotification('onRunInWolfram', 'hello wolfram');
});
connection.onShutdown(() => {
    var _a;
    // Do some cleanup
    // wolfram?.kill();
    // console.log("shutting down")
    (_a = wolfram.stdin) === null || _a === void 0 ? void 0 : _a.write("[\"Quit\", \"\"]\n");
    // Gracefully shut down the child process by sending a SIGTERM signal
    wolfram.kill('SIGTERM');
    // Set a timeout to forcefully terminate the child process if it doesn't exit
    setTimeout(() => {
        if (!wolfram.killed) {
            // console.log('Forcefully terminating the child process');
            wolfram.kill('SIGKILL');
        }
    }, 3000); // 5 seconds timeout
});
connection.onExit(() => {
    var _a;
    // Do some cleanup
    // wolfram?.kill();
    // console.log("exiting")
    (_a = wolfram.stdin) === null || _a === void 0 ? void 0 : _a.write("[\"Quit\", \"\"]\n");
    // Gracefully shut down the child process by sending a SIGTERM signal
    wolfram.kill('SIGTERM');
    // Set a timeout to forcefully terminate the child process if it doesn't exit
    setTimeout(() => {
        if (!wolfram.killed) {
            // console.log('Forcefully terminating the child process');
            wolfram.kill('SIGKILL');
        }
    }, 3000); // 5 seconds timeout
});
function shutdown() {
    var _a;
    // console.log("exiting")
    (_a = wolfram.stdin) === null || _a === void 0 ? void 0 : _a.write(JSON.stringify(["Quit", []]) + "\n");
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
//# sourceMappingURL=server.js.map