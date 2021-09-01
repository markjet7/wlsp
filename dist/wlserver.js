"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const vscode_languageclient_1 = require("vscode-languageclient");
const net = require("net");
const cp = require("child_process");
let PORT;
let wolfram;
function loadwolfram(lspPath, PORT, callback) {
    var _a, _b;
    if (process.env.VSCODE_DEBUG_MODE === "true") {
        PORT = 6589;
    }
    else {
        try {
            if (process.platform === "win32") {
                wolfram = cp.spawn('cmd.exe', ['/c', 'wolframscript.exe', '-file', lspPath, PORT.toString(), lspPath], { detached: false });
            }
            else {
                wolfram = cp.spawn('wolframscript', ['-file', lspPath, PORT.toString(), lspPath], { detached: true });
            }
            if (wolfram.pid != undefined) {
                console.log("Launching wolframscript: " + wolfram.pid.toString());
            }
            else {
                console.log("Launching wolframscript: pid unknown");
            }
            wolfram.on('SIGPIPE', (data) => {
                console.log("SIGPIPE");
            });
            (_a = wolfram.stdout) === null || _a === void 0 ? void 0 : _a.on('error', (data) => {
                console.log("STDOUT Error" + data.toString());
            });
            (_b = wolfram.stdout) === null || _b === void 0 ? void 0 : _b.once('data', (data) => {
                var _a;
                (_a = wolfram.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
                    outputChannel.appendLine("WLSP: " + data.toString());
                    console.log("WLSP: " + data.toString());
                });
                callback();
            });
        }
        catch (error) {
            console.log(error);
            vscode.window.showErrorMessage("Wolframscript failed to load.");
        }
    }
}
;
function loadWolframServer(outputChannel, context, callback) {
    let wolframClient;
    let serverOptions = function () {
        return new Promise((resolve, reject) => {
            let client = new net.Socket();
            setTimeout(() => {
                client.on("data", (data) => {
                    // console.log("LSP Client: " + data.toString())
                });
                client.on('error', function (err) {
                    console.log("WLSP Kernel Error: " + err.message);
                    // client.destroy();
                    client.end();
                    setTimeout(() => {
                        client.connect(PORT, "127.0.0.1", () => { });
                    }, 5000);
                });
                client.on('timeout', () => {
                    console.log("LSP timed out");
                    client.destroy();
                    client.connect(PORT, "127.0.0.1", () => { });
                });
                client.connect(PORT, "127.0.0.1", () => {
                    client.setKeepAlive(true, 20000);
                    resolve({
                        reader: client,
                        writer: client
                    });
                });
            }, 2000);
        });
    };
    let clientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel
    };
    wolframClient = new vscode_languageclient_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
    wolframClient.onReady().then(() => {
        //wolframClient.sendRequest("DocumentSymbolRequest");
        wolframClient.onNotification("wolframVersion", wolframVersion);
        // wolframClient.onNotification("moveCursor", moveCursor);
        // wolframClient.onNotification("wolframResult", wolframResult);
        callback(disposible);
    });
    let disposible = wolframClient.start();
}
//# sourceMappingURL=wlserver.js.map