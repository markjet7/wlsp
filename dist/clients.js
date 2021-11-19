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
const net = require("net");
const fp = require('find-free-port');
const cp = require("child_process");
const psTree = require('ps-tree');
const vscode_languageclient_1 = require("vscode-languageclient");
const path_1 = require("path");
let PORT;
let kernelPORT;
let wolfram;
let wolframKernel;
class Client {
    constructor() {
        this.clientPort = 0;
        this.kernelPort = 0;
        this.lspPath = "";
        this.kernelPath = "";
    }
    start(context, outputChannel) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => {
                this.lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
                let rndport = randomPort();
                fp(rndport, rndport + 50).then((freep) => {
                    this.clientPort = freep[0];
                }).then(() => {
                    load(wolfram, this.lspPath, this.clientPort, outputChannel).then((result) => {
                        wolfram = result;
                        connect(context, outputChannel, this.clientPort)
                            .then(([client, disposable]) => {
                            exports.wolframClient = client;
                            context.subscriptions.push(disposable);
                        });
                    });
                });
                this.kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
                return fp(rndport + 51, rndport + 100).then((freep) => {
                    this.kernelPort = freep[0];
                }).then(() => {
                    load(wolframKernel, this.kernelPath, this.kernelPort, outputChannel).then((result) => {
                        wolframKernel = result;
                        connect(context, outputChannel, this.kernelPort)
                            .then(([client, disposable]) => {
                            exports.wolframKernelClient = client;
                            context.subscriptions.push(disposable);
                            resolve();
                        });
                    });
                });
            });
        });
    }
    startModule(context, outputChannel) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => {
                let clientPort;
                let lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
                let rndport = randomPort();
                fp(rndport, rndport + 50).then((freep) => {
                    clientPort = freep[0];
                }).then(() => {
                    connectModule(lspPath, "wolframscript", clientPort, outputChannel);
                });
                let kernelPort;
                let kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
                return fp(rndport + 51, rndport + 100).then((freep) => {
                    kernelPort = freep[0];
                }).then(() => {
                    connectModule(kernelPath, "wolframscript", kernelPort, outputChannel);
                });
            });
        });
    }
    restart(context, outputChannel) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("Restarting");
            vscode.window.showInformationMessage("Wolfram is restarting.");
            // context.subscriptions.forEach((subscription:any) => {
            //     subscription.dispose();
            // })
            // stopWolfram(wolframClient, wolfram);
            // wolframStatusBar.text = "Wolfram v.?";
            // wolframStatusBar.show();
            // retry(function(){return connectKernel(outputChannel, theContext)});
            // return this.start(context, outputChannel).then(() => {
            //     resolve()});
            // load(wolfram, this.lspPath, this.clientPort, outputChannel).then((result:cp.ChildProcess) => {
            //     wolfram = result;
            //     connect(context, outputChannel, this.clientPort)
            //     .then(([client, disposable]) => {
            //         wolframClient = client;
            //         context.subscriptions.push(disposable);
            //     })  
            // }) 
            stopWolfram(exports.wolframKernelClient, wolframKernel);
            load(wolframKernel, this.kernelPath, this.kernelPort, outputChannel).then((result) => {
                wolframKernel = result;
                connect(context, outputChannel, this.kernelPort)
                    .then(([client, disposable]) => {
                    exports.wolframKernelClient = client;
                    context.subscriptions.push(disposable);
                    path_1.resolve();
                });
            });
        });
    }
    stop() {
        stopWolfram(exports.wolframClient, wolfram);
        stopWolfram(exports.wolframKernelClient, wolframKernel);
    }
}
exports.Client = Client;
function connectModule(modulePath, runtimePath, port, outputChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Connecting to module: " + modulePath);
        console.log("Connecting to runtime: " + runtimePath);
        let serverOptions = {
            module: modulePath,
            runtime: runtimePath,
            transport: {
                kind: vscode_languageclient_1.TransportKind.socket,
                port: port
            },
            options: {
                env: {
                    PATH: process.env.PATH
                }
            },
            args: ['-file', runtimePath, port.toString(), runtimePath]
        };
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            diagnosticCollectionName: 'wolfram-lsp',
            outputChannel: outputChannel
        };
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            let disposible;
            let client = new vscode_languageclient_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
            disposible = client.start();
            resolve([client, disposible]);
        }));
    });
}
function connect(context, outputChannel, port) {
    return __awaiter(this, void 0, void 0, function* () {
        let serverOptions = function () {
            return new Promise((resolve, reject) => {
                let socket = new net.Socket();
                socket.setMaxListeners(100);
                socket.on("data", (data) => {
                    // console.log("WLSP Kernel Data: " + data.toString().substr(0, 200))
                });
                socket.on('error', function (err) {
                    console.log("Socket Error: " + err.message);
                    // socket.destroy();
                    // // client.end();
                    // setTimeout(() => {
                    //     socket.connect(port, "127.0.0.1", () => { socket.setKeepAlive(true) });
                    // }, 1000);
                });
                socket.on('timeout', () => {
                    console.log("Kernel timed out");
                    socket.destroy();
                });
                socket.on('ready', () => {
                    // console.log("Socket ready")     
                });
                socket.on('drain', () => {
                    console.log("Socket is draining");
                });
                socket.on('connect', () => {
                    // console.log("Socket connected")
                });
                socket.connect(port, "127.0.0.1", () => {
                    socket.setKeepAlive(true, 2000);
                    setTimeout(() => {
                        resolve({
                            reader: socket,
                            writer: socket
                        });
                    }, 4000);
                });
            });
        };
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            diagnosticCollectionName: 'wolfram-lsp',
            outputChannel: outputChannel
        };
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            let disposible;
            let client = new vscode_languageclient_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
            let start = new Date().getTime();
            yield delay(5000);
            let end = new Date().getTime();
            disposible = client.start();
            resolve([client, disposible]);
        }));
        //console.log("Starting kernel disposible");
        // setTimeout(() => {setInterval(check_pulse, 1000, wolframClient, wolframKernelClient)}, 3000)
    });
}
function delay(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => { setTimeout(resolve, ms); });
    });
}
function randomPort() {
    return Math.round(Math.random() * (100) + 8888);
}
function connectKernelClient(outputChannel, context) {
}
function load(wolfram, path, port, outputChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            var _a, _b;
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
                resolve(wolfram);
            }
        });
    });
}
function stopWolfram(client, client_process) {
    // client?.stop();
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