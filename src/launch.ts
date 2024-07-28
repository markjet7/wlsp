
import * as vscode from 'vscode';
import * as path from 'path';
import * as net from 'net';
const fp = require('find-free-port');
import * as cp from 'child_process';
const psTree = require('ps-tree');
const bson = require('bson');
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    NotificationType,
    State,
    StateChangeEvent,
    ErrorHandler, ErrorAction, CloseHandlerResult, CloseAction, ErrorHandlerResult, Message
} from 'vscode-LanguageClient/node';

import { outputChannel } from "./extension"
let context: vscode.ExtensionContext;

let clientPort: number = 37800;
let kernelPort: number = 37810;
let lspPath = ""
let kernelPath = ""

var wolfram!: cp.ChildProcess;
var wolframKernel!: cp.ChildProcess;

export let wolframClient: LanguageClient | undefined;
export let wolframKernelClient: LanguageClient | undefined;

let console_outputs: string[] = []
let socketsClosed = 0;

let attempts = 0;

let connectingLSP = false;
let socket = new net.Socket();

function checkPort(port: number): Promise<boolean> {
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
        })

        s.on('timeout', () => {
            s.destroy();
            resolve(false);
        })

        s.connect(port, '127.0.0.1')
    })
}

let clientConnectionAttempts = 0;
export async function startWLSP(id: number, path: string): Promise<LanguageClient | undefined> {
    let timeout: any;
    lspPath = path;

    let serverOptions: ServerOptions = function () {
        return new Promise(async (resolve, reject) => {
            let retries = 0;
            socket.setMaxListeners(1);

            // socket.on("data", (data) => {
            // console.log("WLSP Kernel Data: " + data.toString().slice(0, 200))
            // console_outputs.push(data.toString());
            // });

            socket.on('connect', () => {
                resolve({
                    reader: socket,
                    writer: socket
                })
            });

            socket.on('error', async function (err: any) {
                outputChannel.appendLine("Client Socket error: " + err);
                switch (err.code) {
                    case 'ECONNREFUSED':
                        outputChannel.appendLine("Connection refused. Retrying...")
                        break;
                    case 'ECONNRESET':
                        outputChannel.appendLine("Connection reset. Retrying...")
                        break;
                    case 'EPIPE':
                        outputChannel.appendLine("Broken pipe. Retrying...")
                        break;
                    case 'EALREADY':
                        outputChannel.appendLine("Already connecting")
                        break;
                    default:
                        outputChannel.appendLine("Error: " + err.code)
                        break;
                }
                reconnect()
            });

            socket.on("close", () => {
                outputChannel.appendLine("Client Socket closed")
            });

            socket.on('timeout', () => {
                outputChannel.appendLine("Client Socket timeout")
            });

            socket.on('ready', () => {
            })

            socket.on('drain', () => {
                // outputChannel.appendLine("Client Socket is draining")
                // outputChannel.appendLine(new Date().toLocaleTimeString())
            })


            socket.on("end", () => {
                outputChannel.appendLine("Client Socket end");
            })

            function reconnect() {

                outputChannel.appendLine("Connection refused. Retrying...");
                if (clientConnectionAttempts > 10) {
                    outputChannel.appendLine("Too many connection attempts. Stopping client.")
                    stopWolfram(undefined, wolfram)
                    return;
                }
                else {
                    clientConnectionAttempts += 1;

                    setTimeout(async () => {

                        if (wolfram) {
                            kill(wolfram.pid)
                            wolfram.unref()
                        }

                        await load(wolfram, lspPath, clientPort, outputChannel);

                        socket.connect(clientPort, "127.0.0.1", () => {
                            outputChannel.appendLine("Client Socket reconnected")
                        });
                    }, Math.pow(2, clientConnectionAttempts) * 1000);
                }
            }

            function connect() {
                if (socket.connecting) {
                    return;
                } else {
                    socket.connect(clientPort, "127.0.0.1", () => {
                        outputChannel.appendLine("Client Socket connected")
                    });
                };
            };

            connect();
        })
    };

    let clientErrorHandler = new ClientErrorHandler();
    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        initializationOptions: {
            debuggerPort: 7777
        },
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel,
        errorHandler: clientErrorHandler
    };
    wolframClient = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);


    return new Promise(async (resolve) => {

        await load(wolfram, lspPath, clientPort, outputChannel);

        wolframClient?.start().then((value) => {
            connectingLSP = false;
            outputChannel.appendLine("Client Started")
            resolve(wolframClient);
        }, (reason) => {
            connectingLSP = false;
            outputChannel.appendLine("Client Start Error: " + reason)
            resolve(undefined);
        });

        wolframClient?.onDidChangeState(async (event) => {
            if (event.newState === State.Stopped) {

                wolframClient?.restart();
            }
        })

        // outputChannel.appendLine(new Date().toLocaleTimeString())
        // if (disposible) {context.subscriptions.push(disposible)};


    });
}

let kernelSocket = new net.Socket();
let kernelConnectionAttempts = 0;
export async function startWLSPKernelSocket(id: number, path: string): Promise<LanguageClient | undefined> {
    if (wolframKernelClient && wolframKernelClient?.state === State.Starting) {
        return new Promise((resolve) => {
            resolve(wolframKernelClient)
        });
    }

    if (wolframKernel) {
        await kill(wolframKernel.pid)
    }

    if (wolframKernel == undefined || !wolframKernel.connected) {
        await loadKernel(path);
    }

    let serverOptions: ServerOptions = function () {
        return new Promise(async (resolve, reject) => {
            kernelSocket.setMaxListeners(1);

            // socket.on("data", (data) => {
            // outputChannel.appendLine("WLSP Kernel Data: " + data.toString().slice(0, 200))
            // console_outputs.push(data.toString());
            // });

            kernelSocket.on('connect', () => {
                outputChannel.appendLine("Kernel Socket connected");
                resolve({
                    reader: kernelSocket,
                    writer: kernelSocket
                })
            })

            kernelSocket.on('error', async function (err: any) {
                outputChannel.appendLine("Kernel Socket error: " + err);
                reject(err)
            })

            kernelSocket.on("close", () => {
                outputChannel.appendLine("Kernel Socket closed. Reconnecting...");
                reconnect();

                // stopWolfram(undefined, wolframKernel)
                // kernelConnecting = true;
                // socket.connect(kernelPort, "127.0.0.1", () => {
                //     outputChannel.appendLine("Kernel Socket reconnected")
                //     kernelConnecting = false;
                // });
            });

            kernelSocket.on('timeout', () => {
                outputChannel.appendLine("Kernel Socket timeout")
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
            })

            kernelSocket.on('drain', () => {
                // outputChannel.appendLine("Kernel Socket is draining")
            })


            kernelSocket.on("end", (msg: any) => {
                outputChannel.appendLine("Kernel Socket end");
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
            })

            function reconnect() {
                if (kernelConnectionAttempts > 10) {
                    outputChannel.appendLine("Too many connection attempts. Stopping kernel.")
                    stopKernel();
                    return;
                } else {
                    kernelConnectionAttempts += 1;

                    setTimeout(() => {

                        if (wolframKernel?.connected && kernelSocket.connecting == false) {
                            connect();
                        }

                        if (!wolframKernel?.connected && kernelSocket.connecting == false) {
                            load(wolframKernel, kernelPath, kernelPort, outputChannel).then((r: any) => {
                                socket.connect(kernelPort, "127.0.0.1", () => {
                                    outputChannel.appendLine("Kernel Socket reconnected")
                                }
                                );
                            });
                        }

                        if (wolframKernel === undefined) {
                            load(wolframKernel, kernelPath, kernelPort, outputChannel).then((r: any) => {
                                socket.connect(kernelPort, "127.0.0.1", () => {
                                    outputChannel.appendLine("Kernel Socket reconnected")
                                }
                                );
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
                } else {
                    kernelSocket.connect(kernelPort, "127.0.0.1", () => {
                    });
                }
            };

            connect();
        })
    };

    let kernelErrorHandler = new ClientErrorHandler();
    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        markdown: {
            isTrusted: true,
            supportHtml: true
        },
        outputChannel: outputChannel,
        errorHandler: kernelErrorHandler
    };

    wolframKernelClient = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);

    return new Promise(async (resolve) => {
        wolframKernelClient?.onDidChangeState((event: StateChangeEvent) => {
            if (event.newState === State.Stopped) {
                wolframKernelClient?.restart();
            }
        });

        wolframKernelClient?.start().then((value) => {
            outputChannel.appendLine("Kernel Started")
            resolve(wolframKernelClient)
        }, (reason) => {
            outputChannel.appendLine("Kernel Start Error: " + reason)
            resolve(undefined)
        });

    });
}



async function startWLSPIO(id: number): Promise<void> {
    let serverOptions: ServerOptions = {
        run: {
            command: "/usr/local/bin/wolframscript", args: ["-file", path.join(context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp-io.wl')))], transport: TransportKind.stdio
        },
        debug: { command: "/usr/local/bin/wolframscript", args: ["-script", path.join(context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp-io.wl')))], transport: TransportKind.stdio }
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'wolfram' }],
        diagnosticCollectionName: 'Wolfram Language',
        outputChannel: outputChannel,
        revealOutputChannelOn: 1
    }

    wolframClient = new LanguageClient('wolfram', 'Wolfram Language', serverOptions, clientOptions);
    wolframClient.registerProposedFeatures();

    wolframClient.traceOutputChannel.show();

    wolframClient.onDidChangeState((event) => {
        console.log("state changed");
        console.log(event.newState);

    });

    await wolframClient?.start();

    console.log("client ready");

    return new Promise(async (resolve) => {
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
    })
}


async function startWLSPKernelIO(id: number): Promise<void> {
    attempts += 1;
    console.log("Starting WLSP Kernel: " + attempts)

    let serverOptions: ServerOptions = {
        run: { module: context.asAbsolutePath('dist/server.js'), transport: TransportKind.ipc },
        debug: { module: context.asAbsolutePath('dist/server.js'), transport: TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6009"] } }
    };

    let kernelErrorHandler = new ClientErrorHandler();
    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        initializationOptions: {
            debuggerPort: 7777
        },
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel,
        errorHandler: kernelErrorHandler
    };

    return new Promise(async (resolve) => {

        wolframKernelClient = new LanguageClient('wolfram-kernel', 'Wolfram Language Kernel Server', serverOptions, clientOptions);

        setTimeout(() => {
            let disposible: vscode.Disposable | undefined;
            wolframKernelClient?.start();
            wolframKernelClient?.outputChannel.appendLine("Kernel Client Started")
            // outputChannel.appendLine(new Date().toLocaleTimeString())
            // if (disposible) {context.subscriptions.push(disposible)};
            resolve()
        }, 100)

    });
}


function stopWolfram(client: LanguageClient | undefined, client_process: any): Promise<void> {
    return new Promise((resolve) => {
        // client?.stop();
        try {
            client?.stop();
        } catch { }

        try {
            let cp = require('child_process');
            let isWin = /^win/.test(process.platform);
            if (isWin) {
                cp.exec('taskkill /PID ' + client_process.pid + ' /T /F', function (error: any, stdout: any, stderr: any) { });
                resolve()

            } else {
                console.log("Killing process: " + client_process.pid);
                cp.exec('kill -9 ' + client_process.pid, function (error: any, stdout: any, stderr: any) { });
                resolve()
                // process.kill(-client_process.pid, 'SIGKILL');

                // cp.exec('kill -9 ' + client_process.pid , function (error: any, stdout: any, stderr: any) {})
                // client_process.kill();
                // kill(client_process.pid);
            }
        } catch (e) {
            console.log((e as Error).message)
            resolve()
        }
    })
}

async function loadKernel(kernelPath: string): Promise<void> {
    return new Promise((resolve) => {
        let executablePath: string = vscode.workspace.getConfiguration('wolfram').get('executablePath') || "wolframscript";
        if (wolframKernel) {
            kill(wolframKernel.pid);
        }
        wolframKernel = cp.spawn(executablePath, ['-file', kernelPath, kernelPort.toString(), kernelPath, "-noinit", "-noprompt"], { detached: true });
        wolframKernel.stdout?.on('data', (data) => {
            outputChannel.appendLine("Kernel: " + data.toString())
            if (data.toString().includes("SocketObject")) {
                resolve()
            }

            if (data.toString().includes("Cannot start tcp")) {
                kill(wolframKernel.pid);
                wolframKernel.unref();
                resolve()
            }

            if (data.toString().includes("Invalid password")) {
                kill(wolframKernel.pid);
                wolframKernel.unref();
                vscode.window.showErrorMessage("Wolfram Kernel failed to start. You may have launched too many instances. Check your task manager.")
                resolve();
            }
        });

        wolframKernel.stderr?.on('data', (data) => {
            outputChannel.appendLine("Kernel: " + data.toString())
        });

        wolframKernel.on('close', (code) => {
            outputChannel.appendLine("Kernel exited with code: " + code)
            kill(wolframKernel.pid);
            wolframKernel.unref();
            resolve()
        });
    });
}


async function load(wolf: cp.ChildProcess, path: string, port: number, outputChannel: vscode.OutputChannel): Promise<cp.ChildProcess | undefined> {
    let cpw: cp.ChildProcess;
    return new Promise((resolve) => {
        let executablePath: string = vscode.workspace.getConfiguration('wolfram').get('executablePath') || "wolframscript";

        try {

            if (wolf) {
                kill(wolf.pid);
            }
        } catch (error) {
            outputChannel.appendLine("Error killing wolfram process: " + error)
        }

        let launched = false;
        try {

            if (process.platform === "win32") {
                cpw = cp.spawn('cmd.exe', ['/c', executablePath?.toString(), '-file', path, port.toString(), path, "-noinit", "-noprompt"], { detached: false });
            } else {
                cpw = cp.spawn(executablePath?.toString(), ['-file', path, port.toString(), path, "-noinit", "-noprompt"], { detached: true });
            }

            cpw.on("error", (err) => {
                outputChannel.appendLine("Wolframscript error: " + err)
                vscode.window.showErrorMessage("WLSP failed to load. Please check that wolframscript is installed and that the path is correct in the settings. Download wolframscript at https://www.wolfram.com/engine/")
                kill(cpw.pid);
            })

            cpw.on('SIGPIPE', (data) => {
                console.log("SIGPIPE");
                kill(cpw.pid);
            });


            cpw.stdout?.on('error', (data) => {
                console.log("STDOUT Error" + data.toString());
            });

            cpw.stdout?.on('data', (data) => {
                outputChannel.appendLine("WLSP: " + data.toString())

                if (data.toString().includes("SocketObject")) {
                    wolf = cpw;
                    launched = true;
                    resolve(cpw)
                }

                if (data.toString().includes("Cannot start tcp")) {
                    // kill the cpw process
                    kill(cpw.pid);
                    launched = true;
                    resolve(undefined)
                }

                if (data.toString().includes("Invalid password")) {
                    kill(cpw.pid);
                    vscode.window.showErrorMessage("You may have launched too many wolfram instances. Check your task manager.")
                    launched = true;
                    resolve(undefined);
                }
            });

            setTimeout(() => {
                if (launched) {
                    return
                };
                outputChannel.appendLine("Failed to load wolfram after 10 seconds. Please check your installation and make sure wolframscript is in the path.")
                resolve(undefined)
            }, 10000);


        } catch (error) {
            console.log(error)
            vscode.window.showErrorMessage("Wolframscript failed to load.")
            outputChannel.appendLine("Wolframscript failed to load. " + error)
            kill(cpw.pid);
            resolve(cpw)
        }
    })
}

export async function restart(): Promise<(LanguageClient | undefined)[]> {
    await stop()

    await startWLSP(0, lspPath);
    await startWLSPKernelSocket(0, kernelPath)

    return new Promise((resolve) => {
        resolve([wolframClient, wolframKernelClient])
    });
}

export async function restartKernel(): Promise<LanguageClient | undefined> {
    if (wolframKernelClient && wolframKernelClient?.state === State.Starting) {
        return new Promise((resolve) => {
            resolve(wolframKernelClient)
        });
    }

    if (wolframKernelClient) {
        wolframKernelClient?.stop();
    }

    if (wolframKernel) {
        await kill(wolframKernel.pid)
    }

    wolframKernelClient = await startWLSPKernelSocket(0, kernelPath);

    return wolframKernelClient;
}

export async function stop(): Promise<void> {
    // wolframKernelClient?.sendNotification("Shutdown");
    // wolframClient?.sendNotification("Shutdown");

    console.log("Stopping Wolfram Clients")
    try {
        // await wolframClient?.stop();
        await wolframClient?.dispose();
    } catch (e) {
        console.log((e as Error).message)
    }

    try {
        await wolframKernelClient?.stop();
    } catch (e) {
        console.log((e as Error).message)
    }

    console.log("Stopping Wolfram Processes")
    if (wolfram) {
        await kill(wolfram.pid);
    }
    if (wolframKernel) {
        await kill(wolframKernel.pid);
    }
    console.log("Wolfram Processes Stopped")

    if (socket) {
        socket.destroy();
    }

    if (kernelSocket) {
        kernelSocket.destroy();
    }


    return new Promise((resolve) => {
        resolve();
    });
}

export async function stopKernel(): Promise<void> {
    outputChannel.appendLine("STOP: Stopping kernel")
    if (wolframKernelClient && wolframKernel.pid) {
        outputChannel.appendLine("Wolfram Kernel Client Status: " + wolframKernelClient?.state)

        return wolframKernelClient?.stop().then(async () => {

            if (wolframKernel) {
                outputChannel.appendLine("STOP: Killing kernel process: " + wolframKernel.pid)
                await kill(wolframKernel.pid)
                outputChannel.appendLine("Kernel process killed")
            } else {
                outputChannel.appendLine("Kernel process not found")
            }

            return new Promise(async (resolve): Promise<any> => {
                resolve();
            });
        })
    } else if (wolframKernel?.pid) {
        outputChannel.appendLine("STOP: Killing kernel process: " + wolframKernel.pid)
        await kill(wolframKernel.pid)
        outputChannel.appendLine("Kernel process killed")
        return new Promise(async (resolve): Promise<any> => {
            resolve();
        });
    } else if (wolframKernelClient) {
        return wolframKernelClient?.stop().then(async () => {
            return new Promise(async (resolve): Promise<any> => {
                resolve();
            });
        })
    } else {
        return new Promise(async (resolve): Promise<any> => {
            resolve();
        });
    }
}


let kill = function (pid: any): Promise<void> {
    let signal = 'SIGKILL';
    var killTree = false;
    return new Promise((resolve, reject) => {

        try {
            process.kill(pid, signal);
            resolve();
        } catch (ex) {
            outputChannel.appendLine("Failed to kill wolfram process");
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

class ClientErrorHandler implements ErrorHandler {
    error(error: Error, message: Message | undefined, count: number | undefined): ErrorHandlerResult {
        console.log("Error: " + error.message)
        return {
            action: ErrorAction.Continue
        }
    }

    closed(): CloseHandlerResult {
        console.log("Closed")
        return {
            action: CloseAction.Restart
        }
    }

}