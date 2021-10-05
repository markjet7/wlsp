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
exports.Client = exports.wolframKernelClient = exports.wolframClient = void 0;
const vscode = require("vscode");
const path = require("path");
const fp = require('find-free-port');
const cp = require("child_process");
const psTree = require('ps-tree');
const vscode_languageclient_1 = require("vscode-languageclient");
let PORT;
let kernelPORT;
let wolframVersionText = "wolfram v.?";
let wolfram;
let wolframKernel;
class Client {
    constructor() { }
    start(context, outputChannel) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => {
                fp(randomPort())
                    .then((freep) => {
                    let lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
                    connect(context, outputChannel, freep[0], lspPath);
                })
                    .then((result) => {
                    fp(randomPort())
                        .then((freep) => {
                        let kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
                        connect(context, outputChannel, freep[0], kernelPath);
                    });
                });
                // fp(randomPort())
                //     .then((freep: any) => {
                //         let port = freep[0];
                //         if (port == undefined) {
                //             console.log("Failed to find free port. Retrying");
                //         } else {
                //             let lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
                //             load(lspPath, port, outputChannel)
                //                 .then((result: cp.ChildProcess | undefined) => {
                //                     if (result) {
                //                         wolfram = result;
                //                         connect(context, outputChannel, port)
                //                             .then(([client, disposible]) => {
                //                                 wolframClient = client;
                //                                 console.log(disposible);
                //                                 context.subscriptions.push(disposible);
                //                                 fp(randomPort())
                //                                     .then((freep: any) => {
                //                                         let port = freep[0];
                //                                         if (port == undefined) {
                //                                             console.log("Failed to find kernel free port. Retrying");
                //                                         } else {
                //                                             let kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
                //                                             load( kernelPath, port, outputChannel)
                //                                                 .then((result: cp.ChildProcess | undefined) => {
                //                                                     if (result) {
                //                                                         wolframKernel = result;
                //                                                         connect( context, outputChannel, port)
                //                                                             .then(([client, disposible]) => {
                //                                                                 wolframKernelClient = client;
                //                                                                 console.log(disposible);
                //                                                                 context.subscriptions.push(disposible);
                //                                                                 console.log("Resolving clients")
                //                                                                 resolve()
                //                                                             })
                //                                                     }
                //                                                 })
                //                                         }
                //                                     })
                //                             })
                //                     }
                //                 })
                //         }
                //     })
            });
        });
    }
    restart(context, outputChannel) {
        console.log("Restarting");
        vscode.window.showInformationMessage("Wolfram is restarting.");
        stopWolfram(exports.wolframClient, wolfram);
        stopWolfram(exports.wolframKernelClient, wolframKernel);
        // wolframStatusBar.text = "Wolfram v.?";
        // wolframStatusBar.show();
        // retry(function(){return connectKernel(outputChannel, theContext)});
        this.start(context, outputChannel);
    }
    stop() {
        console.log("Stopping");
        stopWolfram(exports.wolframClient, wolfram);
        stopWolfram(exports.wolframKernelClient, wolframKernel);
    }
}
exports.Client = Client;
function connect(context, outputChannel, port, path) {
    return __awaiter(this, void 0, void 0, function* () {
        // let serverOptions: ServerOptions = function () {
        //     return new Promise((resolve, reject) => {
        //         let socket = new net.Socket();
        //             socket.on("data", (data) => {
        //                 console.log("WLSP Kernel Data: " + data.toString().substr(0, 20))
        //             });
        //             socket.on('error', function (err) {
        //                 console.log("WLSP Client Error: " + err.message);
        //                 socket.destroy();
        //                 // client.end();
        //                 setTimeout(() => {
        //                     socket.connect(port, "127.0.0.1", () => { });
        //                 }, 10000);
        //             })
        //             socket.on('timeout', () => {
        //                 console.log("Client timed out")
        //                 socket.destroy();
        //                 socket.connect(port, "127.0.0.1", () => { });
        //             });
        //             socket.on('ready', () => {
        //                 console.log("Client is ready");
        //             })
        //             socket.on('drain', () => {
        //                 console.log("Client is draining")
        //             })
        //             socket.connect(port, "127.0.0.1", () => {
        //                 socket.setKeepAlive(true, 10);
        //                 resolve({
        //                     reader: socket,
        //                     writer: socket
        //                 });
        //             });
        //     })
        // };
        let serverOptions = {
            module: path,
            runtime: "wolframscript",
            transport: {
                kind: vscode_languageclient_1.TransportKind.socket,
                port: port
            },
            options: {
                execArgv: ["-file", path, port.toString(), path]
            }
        };
        console.log(serverOptions);
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            diagnosticCollectionName: 'wolfram-lsp',
            outputChannel: outputChannel
        };
        let disposible;
        let client = new vscode_languageclient_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
        return new Promise((resolve) => {
            client.onReady().then(() => {
                resolve([client, disposible]);
            });
            disposible = client.start();
        });
        //console.log("Starting kernel disposible");
        // setTimeout(() => {setInterval(check_pulse, 1000, wolframClient, wolframKernelClient)}, 3000)
    });
}
function randomPort() {
    return Math.round(Math.random() * (100) + 8888);
}
function connectKernelClient(outputChannel, context) {
}
function load(path, port, outputChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            var _a, _b;
            let wolfram;
            try {
                if (process.platform === "win32") {
                    wolfram = cp.spawn('cmd.exe', ['/c', 'wolframscript.exe', '-file', path, port.toString(), path], { detached: false });
                }
                else {
                    wolfram = cp.spawn('wolframscript', ['-file', path, port.toString(), path], { detached: true });
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
                (_b = wolfram.stdout) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
                    outputChannel.appendLine("WLSP: " + data.toString());
                    console.log("WLSP: " + data.toString());
                    if (data.toString().includes("SocketObject")) {
                        setTimeout(() => { resolve(wolfram); }, 2000);
                    }
                });
            }
            catch (error) {
                console.log(error);
                vscode.window.showErrorMessage("Wolframscript failed to load.");
                resolve(undefined);
            }
        });
    });
}
function stopWolfram(client, client_process) {
    let isWin = /^win/.test(process.platform);
    if (isWin) {
        let cp = require('child_process');
        cp.exec('taskkill /PID ' + client_process.pid + ' /T /F', function (error, stdout, stderr) {
        });
    }
    else {
        kill(client_process.pid);
    }
    client.stop();
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
// function wolframVersion(data:any) {        
//     wolframVersionText = data["output"];
//     wolframStatusBar.text = wolframVersionText;
//     wolframStatusBar.show();
// }
// function restart() {
//     // try {
//     //     kill(wolfram.pid);
//     // } catch {
//     //     outputChannel.appendLine("Failed to stop wolfram: " + wolfram.pid.toString());
//     // }
//     console.log("Restarting");
//     wolframStatusBar.text = "$(repo-sync~spin) Loading Wolfram...";
//     wolframStatusBar.show();
//     vscode.window.showInformationMessage("Wolfram is restarting.");
//     fp(randomPort()).then((freep:any) => { 
//         kernelPORT = freep[0];
//         console.log("Kernel Port: " + kernelPORT.toString());
//         loadwolframKernel((success:any) => {
//             // await new Promise(resolve => setTimeout(resolve, 10000));
//             theKernelDisposible.dispose();
//             loadWolframKernelClient(outputChannel, theContext, (success:any) => {
//                 theKernelDisposible = success;
//             })
//             context.subscriptions.push(theKernelDisposible);
//             // wolframNotebookProvider.setWolframClient(wolframClient);
//         });
//     }); 
//     fp(randomPort()).then((freep:any) => { 
//         PORT = freep[0];
//         console.log("LSP Port: " + PORT.toString());
//         loadwolfram(async () => {
//             // await new Promise(resolve => setTimeout(resolve, 5000));
//             // loadWolframServer(outputChannel, context)
//             theDisposible.dispose();
//             loadWolframServer(outputChannel, theContext, async (success:vscode.Disposable) => {
//                 theDisposible = success;
//                 theContext.subscriptions.push(theDisposible);
//                 wolframStatusBar.text = wolframVersionText;
//             });
//         });
//     }); 
// }
//# sourceMappingURL=clients.js.map