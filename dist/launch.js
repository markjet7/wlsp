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
exports.stopKernel = exports.stop = exports.restartKernel = exports.restart = exports.startWLSPKernelSocket = exports.startWLSP = exports.wolframKernelClient = exports.wolframClient = void 0;
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
let socket = new net.Socket();
function checkPort(port) {
    return new Promise((resolve) => {
        let s = new net.Socket();
        let t = 2000;
        s.setTimeout(t);
        s.on('connect', () => {
            s.destroy();
            resolve(true);
        });
        s.on('error', () => {
            s.destroy();
            resolve(false);
        });
        s.on('timeout', () => {
            s.destroy();
            resolve(false);
        });
        s.connect(port, '127.0.0.1');
    });
}
let clientConnectionAttempts = 0;
function startWLSP(id, path) {
    return __awaiter(this, void 0, void 0, function* () {
        let timeout;
        lspPath = path;
        let serverReady = yield checkPort(clientPort);
        if (serverReady) {
            clientPort = clientPort + 1;
        }
        ;
        if (wolfram == undefined) {
            yield load(wolfram, lspPath, clientPort, extension_1.outputChannel);
        }
        let serverOptions = function () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                let retries = 0;
                socket.setMaxListeners(5);
                // socket.on("data", (data) => {
                // console.log("WLSP Kernel Data: " + data.toString().slice(0, 200))
                // console_outputs.push(data.toString());
                // });
                socket.on('connect', () => {
                    resolve({
                        reader: socket,
                        writer: socket
                    });
                });
                socket.on('error', function (err) {
                    return __awaiter(this, void 0, void 0, function* () {
                        extension_1.outputChannel.appendLine("Client Socket error: " + err);
                        switch (err.code) {
                            case 'ECONNREFUSED':
                                yield setTimeout(() => {
                                    reconnect();
                                }, 1000);
                                break;
                            case 'ECONNRESET':
                                extension_1.outputChannel.appendLine("Connection reset. Retrying...");
                                break;
                            case 'EPIPE':
                                extension_1.outputChannel.appendLine("Broken pipe. Retrying...");
                                reconnect();
                                break;
                            case 'EALREADY':
                                extension_1.outputChannel.appendLine("Already connecting");
                                break;
                            default:
                                extension_1.outputChannel.appendLine("Error: " + err.code);
                                reconnect();
                                break;
                        }
                    });
                });
                socket.on("close", () => {
                    extension_1.outputChannel.appendLine("Client Socket closed");
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
                    if (wolfram.connected == true && socket.connecting == false) {
                        connect();
                    }
                });
                function reconnect() {
                    extension_1.outputChannel.appendLine("Connection refused. Retrying...");
                    if (clientConnectionAttempts > 10) {
                        extension_1.outputChannel.appendLine("Too many connection attempts. Stopping client.");
                        stopWolfram(undefined, wolfram);
                        return;
                    }
                    else {
                        clientConnectionAttempts += 1;
                        setTimeout(() => {
                            if (wolfram.connected) {
                                connect();
                            }
                            if (!wolfram.connected && socket.connecting == false) {
                                load(wolfram, lspPath, clientPort, extension_1.outputChannel).then((r) => {
                                    socket.connect(clientPort, "127.0.0.1", () => {
                                        extension_1.outputChannel.appendLine("Client Socket connected");
                                    });
                                });
                            }
                            if (socket.connecting) {
                                return;
                            }
                        }, Math.pow(2, clientConnectionAttempts) * 1000);
                    }
                }
                function connect() {
                    if (socket.connecting) {
                        return;
                    }
                    else {
                        socket.connect(clientPort, "127.0.0.1", () => {
                            extension_1.outputChannel.appendLine("Client Socket connected");
                        });
                    }
                    ;
                }
                ;
                connect();
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
                resolve(undefined);
            });
            // outputChannel.appendLine(new Date().toLocaleTimeString())
            // if (disposible) {context.subscriptions.push(disposible)};
        }));
    });
}
exports.startWLSP = startWLSP;
let kernelSocket = new net.Socket();
let kernelConnectionAttempts = 0;
function startWLSPKernelSocket(id, path) {
    return __awaiter(this, void 0, void 0, function* () {
        if (exports.wolframKernelClient && (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.state) === node_1.State.Starting) {
            return new Promise((resolve) => {
                resolve(exports.wolframKernelClient);
            });
        }
        if (wolframKernel) {
            yield kill(wolframKernel.pid);
        }
        if (wolframKernel == undefined || !wolframKernel.connected) {
            yield loadKernel(path);
        }
        let serverOptions = function () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                kernelSocket.setMaxListeners(1);
                // socket.on("data", (data) => {
                // outputChannel.appendLine("WLSP Kernel Data: " + data.toString().slice(0, 200))
                // console_outputs.push(data.toString());
                // });
                kernelSocket.on('connect', () => {
                    extension_1.outputChannel.appendLine("Kernel Socket connected");
                    resolve({
                        reader: kernelSocket,
                        writer: kernelSocket
                    });
                });
                kernelSocket.on('error', function (err) {
                    return __awaiter(this, void 0, void 0, function* () {
                        extension_1.outputChannel.appendLine("Kernel Socket error: " + err);
                        reject(err);
                    });
                });
                kernelSocket.on("close", () => {
                    extension_1.outputChannel.appendLine("Kernel Socket closed. Reconnecting...");
                    reconnect();
                    // stopWolfram(undefined, wolframKernel)
                    // kernelConnecting = true;
                    // socket.connect(kernelPort, "127.0.0.1", () => {
                    //     outputChannel.appendLine("Kernel Socket reconnected")
                    //     kernelConnecting = false;
                    // });
                });
                kernelSocket.on('timeout', () => {
                    extension_1.outputChannel.appendLine("Kernel Socket timeout");
                });
                kernelSocket.on('ready', () => {
                    // clearTimeout(timeout);
                    // setTimeout(() => {
                    //     resolve({
                    //         reader: socket,
                    //         writer: socket
                    //     }),
                    //         1000
                    // })
                });
                kernelSocket.on('drain', () => {
                    // outputChannel.appendLine("Kernel Socket is draining")
                });
                kernelSocket.on("end", (msg) => {
                    extension_1.outputChannel.appendLine("Kernel Socket end");
                    if (wolframKernel.connected == true && kernelSocket.connecting == false) {
                        connect();
                    }
                    // console.log("Kernel Socket end");
                    // console.log(msg);
                    // attempt to revive the kernel
                    // setTimeout(() => {
                    //     socket.connect(kernelPort, "127.0.0.1", () => {
                    //         // socket.setKeepAlive(true);
                    //     });
                    // }, 500)
                });
                function reconnect() {
                    if (kernelConnectionAttempts > 10) {
                        extension_1.outputChannel.appendLine("Too many connection attempts. Stopping kernel.");
                        stopKernel();
                        return;
                    }
                    else {
                        kernelConnectionAttempts += 1;
                        setTimeout(() => {
                            if ((wolframKernel === null || wolframKernel === void 0 ? void 0 : wolframKernel.connected) && kernelSocket.connecting == false) {
                                connect();
                            }
                            if (!(wolframKernel === null || wolframKernel === void 0 ? void 0 : wolframKernel.connected) && kernelSocket.connecting == false) {
                                load(wolframKernel, kernelPath, kernelPort, extension_1.outputChannel).then((r) => {
                                    socket.connect(kernelPort, "127.0.0.1", () => {
                                        extension_1.outputChannel.appendLine("Kernel Socket reconnected");
                                    });
                                });
                            }
                            if (wolframKernel === undefined) {
                                load(wolframKernel, kernelPath, kernelPort, extension_1.outputChannel).then((r) => {
                                    socket.connect(kernelPort, "127.0.0.1", () => {
                                        extension_1.outputChannel.appendLine("Kernel Socket reconnected");
                                    });
                                });
                            }
                            if (kernelSocket.connecting) {
                                return;
                            }
                        }, Math.pow(2, kernelConnectionAttempts) * 1000);
                    }
                }
                function connect() {
                    if (kernelSocket.connecting) {
                        return;
                    }
                    else {
                        kernelSocket.connect(kernelPort, "127.0.0.1", () => {
                        });
                    }
                }
                ;
                connect();
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
            exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.onDidChangeState((event) => {
                if (event.newState === node_1.State.Stopped) {
                    exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.restart();
                }
            });
            exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.start().then((value) => {
                extension_1.outputChannel.appendLine("Kernel Started");
                resolve(exports.wolframKernelClient);
            }, (reason) => {
                extension_1.outputChannel.appendLine("Kernel Start Error: " + reason);
                resolve(undefined);
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
function loadKernel(kernelPath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            var _a, _b;
            let executablePath = vscode.workspace.getConfiguration('wolfram').get('executablePath') || "wolframscript";
            if (wolframKernel) {
                kill(wolframKernel.pid);
            }
            wolframKernel = cp.spawn(executablePath, ['-file', kernelPath, kernelPort.toString(), kernelPath, "-noinit", "-noprompt"], { detached: true });
            (_a = wolframKernel.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
                extension_1.outputChannel.appendLine("Kernel: " + data.toString());
                if (data.toString().includes("SocketObject")) {
                    resolve();
                }
                if (data.toString().includes("Cannot start tcp")) {
                    kill(wolframKernel.pid);
                    wolframKernel.unref();
                    resolve();
                }
                if (data.toString().includes("Invalid password")) {
                    kill(wolframKernel.pid);
                    wolframKernel.unref();
                    vscode.window.showErrorMessage("Wolfram Kernel failed to start. You may have launched too many instances. Check your task manager.");
                    resolve();
                }
            });
            (_b = wolframKernel.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
                extension_1.outputChannel.appendLine("Kernel: " + data.toString());
            });
            wolframKernel.on('close', (code) => {
                extension_1.outputChannel.appendLine("Kernel exited with code: " + code);
                kill(wolframKernel.pid);
                wolframKernel.unref();
                resolve();
            });
        });
    });
}
function load(wolf, path, port, outputChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        let cpw;
        return new Promise((resolve) => {
            var _a, _b;
            let executablePath = vscode.workspace.getConfiguration('wolfram').get('executablePath') || "wolframscript";
            try {
                if (wolf) {
                    kill(wolf.pid);
                }
            }
            catch (error) {
                outputChannel.appendLine("Error killing wolfram process: " + error);
            }
            let launched = false;
            try {
                if (process.platform === "win32") {
                    cpw = cp.spawn('cmd.exe', ['/c', executablePath === null || executablePath === void 0 ? void 0 : executablePath.toString(), '-file', path, port.toString(), path, "-noinit", "-noprompt"], { detached: false });
                }
                else {
                    cpw = cp.spawn(executablePath === null || executablePath === void 0 ? void 0 : executablePath.toString(), ['-file', path, port.toString(), path, "-noinit", "-noprompt"], { detached: true });
                }
                cpw.on("error", (err) => {
                    outputChannel.appendLine("Wolframscript error: " + err);
                    vscode.window.showErrorMessage("WLSP failed to load. Please check that wolframscript is installed and that the path is correct in the settings. Download wolframscript at https://www.wolfram.com/engine/");
                    kill(cpw.pid);
                });
                cpw.on('SIGPIPE', (data) => {
                    console.log("SIGPIPE");
                    kill(cpw.pid);
                });
                (_a = cpw.stdout) === null || _a === void 0 ? void 0 : _a.on('error', (data) => {
                    console.log("STDOUT Error" + data.toString());
                });
                (_b = cpw.stdout) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
                    outputChannel.appendLine("WLSP: " + data.toString());
                    if (data.toString().includes("SocketObject")) {
                        wolf = cpw;
                        launched = true;
                        resolve(cpw);
                    }
                    if (data.toString().includes("Cannot start tcp")) {
                        // kill the cpw process
                        kill(cpw.pid);
                        launched = true;
                        resolve(undefined);
                    }
                    if (data.toString().includes("Invalid password")) {
                        kill(cpw.pid);
                        vscode.window.showErrorMessage("You may have launched too many wolfram instances. Check your task manager.");
                        launched = true;
                        resolve(undefined);
                    }
                });
                setTimeout(() => {
                    if (launched) {
                        return;
                    }
                    ;
                    outputChannel.appendLine("Failed to load wolfram after 10 seconds. Please check your installation and make sure wolframscript is in the path.");
                    resolve(undefined);
                }, 10000);
            }
            catch (error) {
                console.log(error);
                vscode.window.showErrorMessage("Wolframscript failed to load.");
                outputChannel.appendLine("Wolframscript failed to load. " + error);
                kill(cpw.pid);
                resolve(cpw);
            }
        });
    });
}
function restart() {
    return __awaiter(this, void 0, void 0, function* () {
        yield stop();
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
        if (wolframKernel) {
            yield kill(wolframKernel.pid);
        }
        exports.wolframKernelClient = yield startWLSPKernelSocket(0, kernelPath);
        return exports.wolframKernelClient;
    });
}
exports.restartKernel = restartKernel;
function stop() {
    return __awaiter(this, void 0, void 0, function* () {
        // wolframKernelClient?.sendNotification("Shutdown");
        // wolframClient?.sendNotification("Shutdown");
        console.log("Stopping Wolfram Clients");
        try {
            yield (exports.wolframClient === null || exports.wolframClient === void 0 ? void 0 : exports.wolframClient.stop());
        }
        catch (e) {
            console.log(e.message);
        }
        try {
            yield (exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.stop());
        }
        catch (e) {
            console.log(e.message);
        }
        console.log("Stopping Wolfram Processes");
        if (wolfram) {
            yield kill(wolfram.pid);
        }
        if (wolframKernel) {
            yield kill(wolframKernel.pid);
        }
        console.log("Wolfram Processes Stopped");
        if (socket) {
            socket.destroy();
        }
        if (kernelSocket) {
            kernelSocket.destroy();
        }
        return new Promise((resolve) => {
            resolve();
        });
    });
}
exports.stop = stop;
function stopKernel() {
    return __awaiter(this, void 0, void 0, function* () {
        extension_1.outputChannel.appendLine("STOP: Stopping kernel");
        if (exports.wolframKernelClient && wolframKernel.pid) {
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
        }
        else if (wolframKernel === null || wolframKernel === void 0 ? void 0 : wolframKernel.pid) {
            extension_1.outputChannel.appendLine("STOP: Killing kernel process: " + wolframKernel.pid);
            yield kill(wolframKernel.pid);
            extension_1.outputChannel.appendLine("Kernel process killed");
            return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                resolve();
            }));
        }
        else if (exports.wolframKernelClient) {
            return exports.wolframKernelClient === null || exports.wolframKernelClient === void 0 ? void 0 : exports.wolframKernelClient.stop().then(() => __awaiter(this, void 0, void 0, function* () {
                return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                    resolve();
                }));
            }));
        }
        else {
            return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                resolve();
            }));
        }
    });
}
exports.stopKernel = stopKernel;
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
            action: node_1.CloseAction.Restart
        };
    }
}
//# sourceMappingURL=launch.js.map