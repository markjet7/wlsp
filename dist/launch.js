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
exports.stop = exports.restartKernel = exports.restart = exports.startWLSPKernelSocket = exports.startWLSP = exports.wolframKernelClient = exports.wolframClient = void 0;
const vscode = require("vscode");
const path = require("path");
const net = require("net");
const fp = require('find-free-port');
const cp = require("child_process");
const psTree = require('ps-tree');
const bson = require('bson');
const node_1 = require("vscode-LanguageClient/node");
const extension_1 = require("./extension");
let context;
let clientPort = 37800;
let kernelPort = 37810;
let lspPath = "";
let kernelPath = "";
var wolfram;
var wolframKernel;
let console_outputs = [];
let socketsClosed = 0;
let attempts = 0;
let connectingLSP = false;
function startWLSP(id, path) {
    return __awaiter(this, void 0, void 0, function* () {
        let timeout;
        lspPath = path;
        if (connectingLSP) {
            yield new Promise(resolve => setTimeout(resolve, 2000));
            return undefined;
        }
        let serverOptions = function () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                let socket = new net.Socket();
                let retries = 0;
                socket.setMaxListeners(5);
                // socket.on("data", (data) => {
                // console.log("WLSP Kernel Data: " + data.toString().slice(0, 200))
                // console_outputs.push(data.toString());
                // });
                socket.on('connect', () => {
                    clearTimeout(timeout);
                    setTimeout(() => {
                        resolve({
                            reader: socket,
                            writer: socket
                        });
                    }, 1000);
                });
                socket.on('error', function (err) {
                    extension_1.outputChannel.appendLine("Client Socket error: " + err);
                    retries += 1;
                    if (retries < 10) {
                        if (err.code === 'ECONNREFUSED') {
                            timeout = setTimeout(() => {
                                socket.connect(clientPort, "127.0.0.1");
                            }, 1500);
                        }
                    }
                    else {
                        vscode.window.showErrorMessage("Wolfram LSP failed to connect. Please check that wolframscript is installed and running and that the port " + clientPort + " is not in use.", { title: "Try Again?", command: "wolfram.restart" }).then((item) => __awaiter(this, void 0, void 0, function* () {
                            if ((item === null || item === void 0 ? void 0 : item.command) === "wolfram.restart") {
                                restart();
                            }
                        }));
                    }
                });
                socket.on("close", () => {
                    extension_1.outputChannel.appendLine("Client Socket closed");
                    stopWolfram(undefined, wolfram);
                });
                socket.on('timeout', () => {
                    extension_1.outputChannel.appendLine("Client Socket timeout");
                });
                socket.on('ready', () => {
                });
                socket.on('drain', () => {
                    // outputChannel.appendLine("Client Socket is draining")
                    // outputChannel.appendLine(new Date().toLocaleTimeString())
                });
                socket.on("end", () => {
                    extension_1.outputChannel.appendLine("Client Socket end");
                    stopWolfram(undefined, wolfram);
                });
                fp(clientPort).then(([freePort]) => __awaiter(this, void 0, void 0, function* () {
                    // clientPort = freePort + id;
                    yield load(wolfram, lspPath, clientPort, extension_1.outputChannel).then((r) => {
                        wolfram = r;
                        setTimeout(() => {
                            socket.connect(clientPort, "127.0.0.1", () => {
                                extension_1.outputChannel.appendLine("Client Socket connected");
                            });
                        }, 2000);
                    });
                }));
            }));
        };
        let clientErrorHandler = new ClientErrorHandler();
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            initializationOptions: {
                debuggerPort: 7777
            },
            diagnosticCollectionName: 'wolfram-lsp',
            outputChannel: extension_1.outputChannel,
            errorHandler: clientErrorHandler
        };
        exports.wolframClient = new node_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.start().then((value) => {
                connectingLSP = false;
                extension_1.outputChannel.appendLine("Client Started");
                resolve(exports.wolframClient);
            }, (reason) => {
                connectingLSP = false;
                extension_1.outputChannel.appendLine("Client Start Error: " + reason);
            });
            // outputChannel.appendLine(new Date().toLocaleTimeString())
            // if (disposible) {context.subscriptions.push(disposible)};
        }));
    });
}
exports.startWLSP = startWLSP;
let kernelConnecting = false;
function startWLSPKernelSocket(id, path) {
    return __awaiter(this, void 0, void 0, function* () {
        let timeout;
        kernelPath = path;
        if (kernelConnecting) {
            return new Promise(resolve => setTimeout(resolve, 1));
        }
        kernelConnecting = true;
        let serverOptions = function () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                let socket = new net.Socket();
                let retries = 0;
                socket.setMaxListeners(5);
                // socket.on("data", (data) => {
                // outputChannel.appendLine("WLSP Kernel Data: " + data.toString().slice(0, 200))
                // console_outputs.push(data.toString());
                // });
                socket.on('connect', () => {
                    clearTimeout(timeout);
                    setTimeout(() => {
                        resolve({
                            reader: socket,
                            writer: socket
                        });
                    }, 1000);
                });
                socket.on('error', function (err) {
                    extension_1.outputChannel.appendLine("Kernel Socket error: " + err);
                    retries += 1;
                    if (retries < 10) {
                        if (err.code === 'ECONNREFUSED') {
                            extension_1.outputChannel.appendLine("Kernel failed to connect");
                            timeout = setTimeout(() => {
                                socket.connect(kernelPort, "127.0.0.1", () => {
                                    // socket.setKeepAlive(true);
                                });
                            }, 1500);
                        }
                    }
                    else {
                        vscode.window.showErrorMessage("Wolfram Kernel failed to connect. Please check that wolframscript is installed and running and that the port " + kernelPort + " is not in use.", { title: "Try Again?", command: "wolfram.restart" }).then((item) => __awaiter(this, void 0, void 0, function* () {
                            if ((item === null || item === void 0 ? void 0 : item.command) === "wolfram.restart") {
                                restart();
                            }
                        }));
                    }
                });
                socket.on("close", () => {
                    extension_1.outputChannel.appendLine("Kernel Socket closed");
                    // stopWolfram(undefined, wolframKernel)
                    kernelConnecting = true;
                    socket.connect(kernelPort, "127.0.0.1", () => {
                        extension_1.outputChannel.appendLine("Kernel Socket reconnected");
                        kernelConnecting = false;
                    });
                });
                socket.on('timeout', () => {
                    extension_1.outputChannel.appendLine("Kernel Socket timeout");
                });
                socket.on('ready', () => {
                    // clearTimeout(timeout);
                    // setTimeout(() => {
                    //     resolve({
                    //         reader: socket,
                    //         writer: socket
                    //     }),
                    //         1000
                    // })
                });
                socket.on('drain', () => {
                    // outputChannel.appendLine("Kernel Socket is draining")
                });
                socket.on("end", (msg) => __awaiter(this, void 0, void 0, function* () {
                    extension_1.outputChannel.appendLine("Kernel Socket end");
                    // stopWolfram(undefined, wolframKernel)
                    kernelConnecting = true;
                    socket.connect(kernelPort, "127.0.0.1", () => {
                        extension_1.outputChannel.appendLine("Kernel Socket reconnected");
                        kernelConnecting = false;
                    });
                    // console.log("Kernel Socket end");
                    // console.log(msg);
                    // attempt to revive the kernel
                    // setTimeout(() => {
                    //     socket.connect(kernelPort, "127.0.0.1", () => {
                    //         // socket.setKeepAlive(true);
                    //     });
                    // }, 500)
                }));
                fp(kernelPort).then(([freePort]) => __awaiter(this, void 0, void 0, function* () {
                    if (wolframKernel) {
                        extension_1.outputChannel.appendLine("Killing kernel process: " + wolframKernel.pid);
                        yield stopWolfram(undefined, wolframKernel);
                    }
                    extension_1.outputChannel.appendLine("Wolfram Kernel status: " + (wolframKernel === null || wolframKernel === void 0 ? void 0 : wolframKernel.pid));
                    yield load(wolframKernel, kernelPath, kernelPort, extension_1.outputChannel).then((r) => {
                        wolframKernel = r;
                        socket.connect(kernelPort, "127.0.0.1", () => {
                            extension_1.outputChannel.appendLine("Kernel Socket connected");
                            kernelConnecting = false;
                        });
                    });
                }));
            }));
        };
        let kernelErrorHandler = new ClientErrorHandler();
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            diagnosticCollectionName: 'wolfram-lsp',
            markdown: {
                isTrusted: true,
                supportHtml: true
            },
            outputChannel: extension_1.outputChannel,
            errorHandler: kernelErrorHandler
        };
        exports.wolframKernelClient = new node_1.LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.start().then((value) => {
                extension_1.outputChannel.appendLine("Kernel Started");
                kernelConnecting = false;
                resolve(exports.wolframKernelClient);
            }, (reason) => {
                kernelConnecting = false;
                extension_1.outputChannel.appendLine("Kernel Start Error: " + reason);
            });
        }));
    });
}
exports.startWLSPKernelSocket = startWLSPKernelSocket;
function startWLSPIO(id) {
    return __awaiter(this, void 0, void 0, function* () {
        let serverOptions = {
            run: {
                command: "/usr/local/bin/wolframscript", args: ["-file", path.join(context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp-io.wl')))], transport: node_1.TransportKind.stdio
            },
            debug: { command: "/usr/local/bin/wolframscript", args: ["-script", path.join(context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp-io.wl')))], transport: node_1.TransportKind.stdio }
        };
        let clientOptions = {
            documentSelector: [{ scheme: 'file', language: 'wolfram' }],
            diagnosticCollectionName: 'Wolfram Language',
            outputChannel: extension_1.outputChannel,
            revealOutputChannelOn: 1
        };
        exports.wolframClient = new node_1.LanguageClient('wolfram', 'Wolfram Language', serverOptions, clientOptions);
        exports.wolframClient.registerProposedFeatures();
        exports.wolframClient.traceOutputChannel.show();
        exports.wolframClient.onDidChangeState((event) => {
            console.log("state changed");
            console.log(event.newState);
        });
        yield (exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.start());
        console.log("client ready");
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            // wolframClient = new LanguageClient('wolfram', 'Wolfram Language', serverOptions, clientOptions, true);
            // wolframClient.registerProposedFeatures();
            // wolframClient?.start();
            resolve();
            // onclientReady();
            // setTimeout(() => {
            //     let disposible: vscode.Disposable | undefined;
            //     wolframClient?.start();
            //     resolve();
            // }, 2000)
        }));
    });
}
function startWLSPKernelIO(id) {
    return __awaiter(this, void 0, void 0, function* () {
        attempts += 1;
        console.log("Starting WLSP Kernel: " + attempts);
        let serverOptions = {
            run: { module: context.asAbsolutePath('dist/server.js'), transport: node_1.TransportKind.ipc },
            debug: { module: context.asAbsolutePath('dist/server.js'), transport: node_1.TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6009"] } }
        };
        let kernelErrorHandler = new ClientErrorHandler();
        let clientOptions = {
            documentSelector: [
                "wolfram"
            ],
            initializationOptions: {
                debuggerPort: 7777
            },
            diagnosticCollectionName: 'wolfram-lsp',
            outputChannel: extension_1.outputChannel,
            errorHandler: kernelErrorHandler
        };
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            exports.wolframKernelClient = new node_1.LanguageClient('wolfram-kernel', 'Wolfram Language Kernel Server', serverOptions, clientOptions);
            setTimeout(() => {
                let disposible;
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.start();
                exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.outputChannel.appendLine("Kernel Client Started");
                // outputChannel.appendLine(new Date().toLocaleTimeString())
                // if (disposible) {context.subscriptions.push(disposible)};
                resolve();
            }, 100);
        }));
    });
}
function stopWolfram(client, client_process) {
    return new Promise((resolve) => {
        // client?.stop();
        try {
            client === null || client === void 0 ? void 0 : client.stop();
        }
        catch (_a) { }
        try {
            let cp = require('child_process');
            let isWin = /^win/.test(process.platform);
            if (isWin) {
                cp.exec('taskkill /PID ' + client_process.pid + ' /T /F', function (error, stdout, stderr) { });
                resolve();
            }
            else {
                console.log("Killing process: " + client_process.pid);
                cp.exec('kill -9 ' + client_process.pid, function (error, stdout, stderr) { });
                resolve();
                // process.kill(-client_process.pid, 'SIGKILL');
                // cp.exec('kill -9 ' + client_process.pid , function (error: any, stdout: any, stderr: any) {})
                // client_process.kill();
                // kill(client_process.pid);
            }
        }
        catch (e) {
            console.log(e.message);
            resolve();
        }
    });
}
function load(wolfram, path, port, outputChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            var _a, _b;
            let executablePath = vscode.workspace.getConfiguration('wolfram').get('executablePath') || "wolframscript";
            try {
                if (process.platform === "win32") {
                    wolfram = cp.spawn('cmd.exe', ['/c', executablePath === null || executablePath === void 0 ? void 0 : executablePath.toString(), '-file', path, port.toString(), path, "-noinit"], { detached: false });
                }
                else {
                    wolfram = cp.spawn(executablePath === null || executablePath === void 0 ? void 0 : executablePath.toString(), ['-file', path, port.toString(), path, "-noinit"], { detached: true });
                }
                wolfram.on("error", (err) => {
                    outputChannel.appendLine("Wolframscript error: " + err);
                    vscode.window.showErrorMessage("WLSP failed to load. Please check that wolframscript is installed and that the path is correct in the settings. Download wolframscript at https://www.wolfram.com/engine/");
                });
                wolfram.on('SIGPIPE', (data) => {
                    console.log("SIGPIPE");
                });
                (_a = wolfram.stdout) === null || _a === void 0 ? void 0 : _a.on('error', (data) => {
                    console.log("STDOUT Error" + data.toString());
                });
                (_b = wolfram.stdout) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
                    outputChannel.appendLine("WLSP: " + data.toString());
                    if (data.toString().includes("SocketObject")) {
                        setTimeout(() => { resolve(wolfram); }, 10);
                    }
                    // vscode.window.showInformationMessage(data.toString().slice(0, 1000))
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
function restart() {
    return __awaiter(this, void 0, void 0, function* () {
        yield stop();
        kernelConnecting = false;
        yield startWLSP(0, lspPath);
        yield startWLSPKernelSocket(0, kernelPath);
        return new Promise((resolve) => {
            resolve([exports.wolframClient, exports.wolframKernelClient]);
        });
    });
}
exports.restart = restart;
function restartKernel() {
    return __awaiter(this, void 0, void 0, function* () {
        if (exports.wolframKernelClient && (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state) === node_1.State.Starting) {
            return new Promise((resolve) => {
                resolve(exports.wolframKernelClient);
            });
        }
        if (exports.wolframKernelClient) {
            exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.stop();
        }
        yield stopKernel();
        kernelConnecting = false;
        yield startWLSPKernelSocket(0, kernelPath);
        return exports.wolframKernelClient;
    });
}
exports.restartKernel = restartKernel;
function stop() {
    return __awaiter(this, void 0, void 0, function* () {
        // wolframKernelClient?.sendNotification("Shutdown");
        // wolframClient?.sendNotification("Shutdown");
        console.log("Stopping Wolfram Clients");
        exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.stop();
        exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.stop();
        console.log("Stopping Wolfram Processes");
        yield kill(wolfram.pid);
        yield kill(wolframKernel.pid);
        console.log("Wolfram Processes Stopped");
        return new Promise((resolve) => {
            resolve();
        });
    });
}
exports.stop = stop;
function stopKernel() {
    return __awaiter(this, void 0, void 0, function* () {
        extension_1.outputChannel.appendLine("STOP: Stopping kernel");
        extension_1.outputChannel.appendLine("Wolfram Kernel Client Status: " + (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state));
        return exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.stop().then(() => __awaiter(this, void 0, void 0, function* () {
            if (wolframKernel) {
                extension_1.outputChannel.appendLine("STOP: Killing kernel process: " + wolframKernel.pid);
                yield kill(wolframKernel.pid);
                extension_1.outputChannel.appendLine("Kernel process killed");
            }
            else {
                extension_1.outputChannel.appendLine("Kernel process not found");
            }
            return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                resolve();
            }));
        }));
    });
}
let kill = function (pid) {
    let signal = 'SIGKILL';
    var killTree = false;
    return new Promise((resolve, reject) => {
        try {
            process.kill(pid, signal);
            resolve();
        }
        catch (ex) {
            extension_1.outputChannel.appendLine("Failed to kill wolfram process");
            resolve();
        }
    });
};
// let kill = function (pid: any) {
//     let signal = 'SIGKILL';
//     let callback = function () { };
//     var killTree = false;
//     if (killTree) {
//         psTree(pid, function (err: any, children: any) {
//             [pid].concat(
//                 children.map(function (p: any) {
//                     return p.PID;
//                 })
//             ).forEach(function (pid) {
//                 try { process.kill(pid, signal); }
//                 catch (ex) {
//                     console.log("Failed to kill: " + pid)
//                     console.log((ex as Error).message)
//                 }
//             });
//             callback();
//         });
//     } else {
//         try { 
//             process.kill(pid, signal); 
//         }
//         catch (ex) {
//             console.log("Failed to kill wolfram process")
//         }
//         callback();
//     }
// };
class ClientErrorHandler {
    error(error, message, count) {
        console.log("Error: " + error.message);
        return {
            action: node_1.ErrorAction.Continue
        };
    }
    closed() {
        console.log("Closed");
        return {
            action: node_1.CloseAction.DoNotRestart
        };
    }
}
//# sourceMappingURL=launch.js.map