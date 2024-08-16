
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

    fp(clientPort, (err:any, freePort:any)=>{
        clientPort = freePort;
    });

    if (wolfram) {
        try{
            await kill(wolfram.pid)
        } catch (e) {}
    }

    if (wolfram == undefined || !wolfram.connected) {
        await load(wolfram, lspPath, clientPort, outputChannel)
    }

    // if (socket) {
    //     socket.destroy();
    //     socket = new net.Socket();
    // }

    let socket = new net.Socket();
    let serverOptions: ServerOptions = function () {
        return new Promise(async (resolve, reject) => {
            let retries = 0;
            socket.setMaxListeners(10);
            socket.setKeepAlive(true);

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
                socket.destroy();
                reject(err)
            });

            socket.on("close", () => {
                outputChannel.appendLine("Client Socket closed")
                socket.destroy()
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
                socket.destroy();
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

        // await load(wolfram, lspPath, clientPort, outputChannel);

        wolframClient?.start().then((value) => {
            connectingLSP = false;
            outputChannel.appendLine("Client Started")
        }, (reason) => {
            connectingLSP = false;
            outputChannel.appendLine("Client Start Error: " + reason)
        });
        resolve(wolframClient);

        wolframClient?.onDidChangeState(async (event) => {
            if (event.newState === State.Stopped) {

                if (wolfram && wolfram.connected) {
                    await kill(wolfram.pid);
                    wolfram.unref();
                }
                await load(wolfram, lspPath, clientPort, outputChannel);
                wolframClient?.restart();
            }
        })

        // outputChannel.appendLine(new Date().toLocaleTimeString())
        // if (disposible) {context.subscriptions.push(disposible)};


    });
}

let kernelConnectionAttempts = 0;
export async function startWLSPKernelSocket(id: number, path: string): Promise<LanguageClient | undefined> {
    let kernelSocket = new net.Socket();
    // if (wolframKernelClient && wolframKernelClient?.state === State.Starting) {
    //     return new Promise((resolve) => {
    //         resolve(wolframKernelClient)
    //     });
    // }
    fp(kernelPort, (err:any, freePort:any)=>{
        kernelPort = freePort;
    });

    if (wolframKernel) {
        try{
            await kill(wolframKernel.pid)
        } catch (e) {}
    }

    if (wolframKernel == undefined || !wolframKernel.connected) {
        await loadKernel(path);
    }

    if (kernelSocket) {
        kernelSocket.destroy();
        kernelSocket = new net.Socket();
    }
    let serverOptions: ServerOptions = function () {
        return new Promise((resolve, reject) => {
            kernelSocket.setMaxListeners(10);
            kernelSocket.setKeepAlive(true);

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
                kernelSocket.destroy();
                reject(err)
            })

            kernelSocket.on("close", () => {
                outputChannel.appendLine("Kernel Socket closed. Reconnecting...");
                kernelSocket.destroy();

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
                outputChannel.appendLine("Kernel Socket end: " + msg);
                if (wolframKernel.connected == true && kernelSocket.connecting == false) {
                    reconnect();
                }
            })

            async function reconnect() {
                if (kernelConnectionAttempts > 10) {
                    kernelConnectionAttempts = 0;
                    outputChannel.appendLine("Too many connection attempts. Stopping kernel.")
                    stopKernel();
                    return;
                } else {
                    kernelConnectionAttempts += 1;

                    
                    if (kernelSocket.connecting) {
                        return;
                    }

                        if (wolframKernel?.connected && kernelSocket.connecting == false) {
                            connect();
                        }

                        if (!wolframKernel?.connected && kernelSocket.connecting == false) {
                            await load(wolframKernel, kernelPath, kernelPort, outputChannel).then((r: any) => {
                                kernelSocket.connect(kernelPort, "127.0.0.1", () => {
                                    outputChannel.appendLine("Kernel Socket reconnected")
                                }
                                );
                            });
                        }

                        if (wolframKernel === undefined) {
                            await load(wolframKernel, kernelPath, kernelPort, outputChannel).then((r: any) => {
                                kernelSocket.connect(kernelPort, "127.0.0.1", () => {
                                    outputChannel.appendLine("Kernel Socket reconnected")
                                }
                                );
                            });
                        }

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

    let kernelErrorHandler = new KernelClientErrorHandler();
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
        wolframKernelClient?.onDidChangeState( (event: StateChangeEvent) => {
            if (event.newState === State.Stopped) {

                try{
                    kill(wolframKernel.pid).then(() => {
                        wolframKernel.unref();
                    });
                } catch (e) {
                    outputChannel.appendLine("Failed to kill wolfram kernel")
                }
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

    let kernelErrorHandler = new KernelClientErrorHandler();
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
        try{
            kill(wolframKernel.pid);
        } catch (e) {
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
            // kill(wolframKernel.pid);
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
                    launched = false;
                    resolve(undefined)
                }

                

                if (data.toString().includes("Failed socket operation")) {
                    // kill the cpw process
                    kill(cpw.pid);
                    launched = false;
                    resolve(undefined)
                }

                if (data.toString().includes("Invalid password")) {
                    kill(cpw.pid);
                    vscode.window.showErrorMessage("You may have launched too many wolfram instances. Check your task manager.")
                    launched = false;
                    resolve(undefined);
                }
            });

        } catch (error) {
            console.log(error)
            outputChannel.appendLine("Wolframscript failed to load. " + error)
            kill(cpw.pid);
            resolve(undefined)
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
        // kernelSocket.destroy();
        // await wolframKernelClient?.stop();
        await wolframKernelClient?.dispose();
    } catch (e) {
        console.log((e as Error).message)
    }


    // if (socket) {
    //     socket.destroy();
    // }

    // if (kernelSocket) {
    //     kernelSocket.destroy();
    // }

    return new Promise((resolve) => {
        resolve();
    });
}

export async function stopKernel(): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            wolframKernelClient?.stop();
        } catch (e) {
            outputChannel.appendLine("Error stopping kernel client: " + (e as Error).message)
        }
        resolve()

    })

}


let kill = function (pid: any): Promise<void> {
    let signal = 'SIGKILL';
    var killTree = false;
    return new Promise((resolve, reject) => {
        if (pid === undefined) {
            resolve()
        } else {
            outputChannel.appendLine("Killing: " + pid)
            try {
                process.kill(pid, signal);
                resolve();
            } catch (ex) {
                outputChannel.appendLine("Failed to kill wolfram process: " + ex);
                resolve();
            }
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

class KernelClientErrorHandler implements ErrorHandler {
    error(error: Error, message: Message | undefined, count: number | undefined): ErrorHandlerResult {
        console.log("Error: " + error.message)
        return {
            action: ErrorAction.Continue
        }
    }

    closed(): CloseHandlerResult {
        console.log("Closed")
        return {
            action: CloseAction.DoNotRestart
        }
    }

}