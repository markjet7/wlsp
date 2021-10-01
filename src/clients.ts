import * as vscode from 'vscode';
import * as path from 'path';
import * as net from 'net';
const fp = require('find-free-port');
import * as cp from 'child_process';
const psTree = require('ps-tree');
import {
    LanguageClient,
    LanguageClientOptions,
    NotificationType,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient';
import { resolve } from 'path';

let PORT: any;
let kernelPORT: any;
let outputChannel = vscode.window.createOutputChannel('wolf-lsp');
export let wolframClient: LanguageClient;
export let wolframKernelClient: LanguageClient;

let wolframVersionText: string = "wolfram v.?";
let wolfram: cp.ChildProcess;
let wolframKernel: cp.ChildProcess;

export class Client {
    constructor() { }

    async start(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): Promise<void> {
        return new Promise((resolve) => {
            fp(randomPort())
                .then((freep: any) => {
                    let port = freep[0];
                    if (port == undefined) {
                        console.log("Failed to find free port. Retrying");
                    } else {
                        let lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
                        load(wolfram, lspPath, port, outputChannel)
                            .then((result: Boolean) => {
                                if (result) {
                                    connect(context, outputChannel, port)
                                        .then(([client, disposible]) => {
                                            wolframClient = client;
                                            context.subscriptions.push(disposible);
                                            fp(randomPort())
                                                .then((freep: any) => {
                                                    let port = freep[0];
                                                    if (port == undefined) {
                                                        console.log("Failed to find kernel free port. Retrying");
                                                    } else {
                                                        let kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
                                                        load(wolframKernel, kernelPath, port, outputChannel)
                                                            .then((result: Boolean) => {
                                                                if (result) {
                                                                    connect( context, outputChannel, port)
                                                                        .then(([client, disposible]) => {
                                                                            wolframKernelClient = client;
                                                                            context.subscriptions.push(disposible);
                                                                            console.log("Resolving clients")
                                                                            resolve()
                                                                        })
                                                                }
                                                            })
                                                    }
                                                })
                                        })
                                }
                            })
                    }
                })
        })
    }

    restart(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
        console.log("Restarting");

        vscode.window.showInformationMessage("Wolfram is restarting.");

        stopWolfram(wolframClient, wolfram);
        stopWolfram(wolframKernelClient, wolframKernel);

        // wolframStatusBar.text = "Wolfram v.?";
        // wolframStatusBar.show();
        // retry(function(){return connectKernel(outputChannel, theContext)});
        this.start(context, outputChannel);
    }

    stop() {
        stopWolfram(wolframClient, wolfram);
        stopWolfram(wolframKernelClient, wolframKernel);
    }
}

async function connect(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, port: number): Promise<(any)[]> {
    let serverOptions: ServerOptions = function () {
        return new Promise((resolve, reject) => {
            let socket = new net.Socket();

            setTimeout(() => {
                socket.on("data", (data) => {
                    // console.log("WLSP Kernel Data: " + data.toString().substr(0, 200))
                });

                socket.on('error', function (err) {
                    console.log("WLSP Kernel Error: " + err.message);
                    socket.destroy();
                    // client.end();
                    setTimeout(() => {
                        socket.connect(port, "127.0.0.1", () => { });
                    }, 10000);
                })

                socket.on('timeout', () => {
                    console.log("Kernel timed out")
                    socket.destroy();
                    socket.connect(port, "127.0.0.1", () => { });
                });

                socket.on('ready', () => {
                    console.log("Kernel is ready")
                })

                socket.on('drain', () => {
                    console.log("Kernel is draining")
                })

                socket.connect(port, "127.0.0.1", () => {
                    socket.setKeepAlive(true, 20000);
                    resolve({
                        reader: socket,
                        writer: socket
                    });
                });
            }, 10000);
        })
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel
    };

    let disposible: vscode.Disposable;
    let client = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);
    return new Promise((resolve) => {
        disposible = client.start();
        client.onReady().then(() => {
            resolve([client, disposible])
        })
    });

    //console.log("Starting kernel disposible");
    // setTimeout(() => {setInterval(check_pulse, 1000, wolframClient, wolframKernelClient)}, 3000)
}

function randomPort() {
    return Math.round(Math.random() * (100) + 8888);
}



function connectKernelClient(outputChannel: any, context: any) {

}

async function load(wolfram: cp.ChildProcess, path: string, port: number, outputChannel: vscode.OutputChannel): Promise<Boolean> {
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

            wolfram.stdout?.once('data', (data) => {
                wolfram.stdout?.on('data', (data) => {
                    outputChannel.appendLine("WLSP: " + data.toString())
                    console.log("WLSP: " + data.toString());
                });
                resolve(true)
            });

        } catch (error) {
            console.log(error)
            vscode.window.showErrorMessage("Wolframscript failed to load.")
            resolve(false)
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

