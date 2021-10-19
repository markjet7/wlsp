import * as vscode from 'vscode';
import * as path from 'path';
import * as net from 'net';
const fp = require('find-free-port');
import * as cp from 'child_process';
const psTree = require('ps-tree');
import {
    BaseLanguageClient,
    LanguageClient,
    LanguageClientOptions,
    NotificationType,
    ServerOptions,
    NodeModule,
    TransportKind
} from 'vscode-languageclient';
import { resolve } from 'path';
import { deactivate } from './notebook';
import { time } from 'console';

let PORT: any;
let kernelPORT: any;
export let wolframClient: LanguageClient;
export let wolframKernelClient: LanguageClient;

let wolfram: cp.ChildProcess;
let wolframKernel: cp.ChildProcess;

export class Client {
    constructor() { }

    async start(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): Promise<void> {
        return new Promise((resolve) => {
            let clientPort:number;
            let lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
            let rndport = randomPort();
            fp(rndport, rndport+50).then((freep:any) => {
                clientPort = freep[0]
            }).then(() => {
                load(wolfram, lspPath, clientPort, outputChannel).then((result:cp.ChildProcess) => {
                    wolfram = result;
                    connect(context, outputChannel, clientPort)
                    .then(([client, disposable]) => {
                        wolframClient = client;
                        context.subscriptions.push(disposable);

                    })  
                }) 
            })

            let kernelPort:number;
            let kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
            return fp(rndport+51, rndport+100).then((freep:any) => {
                kernelPort = freep[0]
            }).then(() => {
                load(wolframKernel, kernelPath, kernelPort, outputChannel).then((result:cp.ChildProcess) => {
                    wolframKernel = result;
                    connect(context, outputChannel, kernelPort)
                    .then(([client, disposable]) => {
                        wolframKernelClient = client;
                        context.subscriptions.push(disposable);
                        resolve();
                    }) 
                })  
            })
        })
    }

    async startModule(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): Promise<void> {
        return new Promise((resolve) => {
            let clientPort:number;
            let lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
            let rndport = randomPort();
            fp(rndport, rndport+50).then((freep:any) => {
                clientPort = freep[0]
            }).then(() => {
                connectModule(
                    lspPath,
                    "wolframscript",
                    clientPort,
                    outputChannel
                )
            })

            let kernelPort:number;
            let kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
            return fp(rndport+51, rndport+100).then((freep:any) => {
                kernelPort = freep[0]
            }).then(() => {
                connectModule(
                    kernelPath,
                    "wolframscript",
                    kernelPort,
                    outputChannel
                )
            })
        })
    }

    async restart(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): Promise<void> {
        console.log("Restarting");

        vscode.window.showInformationMessage("Wolfram is restarting.");
        context.subscriptions.forEach((subscription:any) => {
            subscription.dispose();
        })

        stopWolfram(wolframClient, wolfram);
        stopWolfram(wolframKernelClient, wolframKernel);

        // wolframStatusBar.text = "Wolfram v.?";
        // wolframStatusBar.show();
        // retry(function(){return connectKernel(outputChannel, theContext)});
        return this.start(context, outputChannel).then(() => {
            resolve()});
    }

    stop() {
        stopWolfram(wolframClient, wolfram);
        stopWolfram(wolframKernelClient, wolframKernel);
    }
}

async function connectModule(modulePath:string, runtimePath:string, port:number, outputChannel: vscode.OutputChannel): Promise<(unknown)[]> {
    console.log("Connecting to module: " + modulePath);
    console.log("Connecting to runtime: " + runtimePath);
    let serverOptions: NodeModule = {
        module: modulePath,
        runtime: runtimePath, 
        transport: {
            kind: TransportKind.socket,
            port: port
        },
        options:{
            env: {
                PATH: process.env.PATH
            }
        },
        args: ['-file', runtimePath, port.toString(), runtimePath]
    }

    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel
    };

    return new Promise(async (resolve) => {
        let disposible: vscode.Disposable;
        let client = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
        disposible = client.start();
        resolve([client, disposible]);
    })
}

async function connect(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, port: number): Promise<(any)[]> {
    
    let serverOptions: ServerOptions = function () {
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
                })

                socket.on('timeout', () => {
                    console.log("Kernel timed out")
                    socket.destroy();
                });

                socket.on('ready', () => {
                    // console.log("Socket ready")     
                })

                socket.on('drain', () => {
                    console.log("Socket is draining")
                })

                socket.on('connect', () => {
                    // console.log("Socket connected")
                })

                socket.connect(port, "127.0.0.1", () => {
                    socket.setKeepAlive(true, 2000); 
                    setTimeout(() => {
                        resolve({
                            reader: socket,
                            writer: socket
                        })
                    }, 4000)
                });


        })
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel
    };


    return new Promise(async (resolve) => {
        let disposible: vscode.Disposable;
        let client = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
        let start = new Date().getTime();
        await delay(5000);
        let end = new Date().getTime();
        disposible = client.start();
        resolve([client, disposible]);
    });

    //console.log("Starting kernel disposible");
    // setTimeout(() => {setInterval(check_pulse, 1000, wolframClient, wolframKernelClient)}, 3000)
}

async function delay(ms:number) {
    return new Promise((resolve) => {setTimeout(resolve, ms)})
}

function randomPort() {
    return Math.round(Math.random() * (100) + 8888);
}



function connectKernelClient(outputChannel: any, context: any) {

}

async function load(wolfram: cp.ChildProcess, path: string, port: number, outputChannel: vscode.OutputChannel): Promise<cp.ChildProcess> {
    return new Promise((resolve) => {
        try {
            if (process.platform === "win32") {
                wolfram = cp.spawn('cmd.exe', ['/c', 'wolframscript.exe', '-file', path, port.toString(), path], { detached: false });
            } else {
                wolfram = cp.spawn('wolframscript', ['-file', path, port.toString(), path], { detached: true });
            }


            if (wolfram.pid != undefined) {
                console.log("Launching wolframscript: " + wolfram.pid.toString());
            } else {
                console.log("Launching wolframscript: pid unknown");
            }


            wolfram.on('SIGPIPE', (data) => {
                console.log("SIGPIPE");
            });


            wolfram.stdout?.on('error', (data) => {
                console.log("STDOUT Error" + data.toString());
            });

            wolfram.stdout?.on('data', (data) => {
                outputChannel.appendLine("WLSP: " + data.toString())
                console.log("WLSP: " + data.toString());
                if(data.toString().includes("TCPSERVER")){
                    setTimeout(() => {resolve(wolfram)}, 2000)
                }
            });

        } catch (error) {
            console.log(error)
            vscode.window.showErrorMessage("Wolframscript failed to load.")
            resolve(wolfram)
        }
    })
}



function stopWolfram(client: any, client_process: any) {
    client.stop();

    let isWin = /^win/.test(process.platform);
    if (isWin) {
        let cp = require('child_process');
        cp.exec('taskkill /PID ' + client_process.pid + ' /T /F', function (error: any, stdout: any, stderr: any) {
        });

    } else {
        kill(client_process.pid);
    }
}

let kill = function (pid: any) {
    let signal = 'SIGKILL';
    let callback = function () { };
    var killTree = true;
    if (killTree) {
        psTree(pid, function (err: any, children: any) {
            [pid].concat(
                children.map(function (p: any) {
                    return p.PID;
                })
            ).forEach(function (pid) {
                try { process.kill(pid, signal); }
                catch (ex) {
                    console.log("Failed to kill: " + pid)
                }
            });
            callback();
        });
    } else {
        try { process.kill(pid, signal); }
        catch (ex) {
            console.log("Failed to kill wolfram process")
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

