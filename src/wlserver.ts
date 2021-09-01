import * as vscode from 'vscode';
import { 
	LanguageClient,
	LanguageClientOptions,
    NotificationType,
	ServerOptions,
	TransportKind } from 'vscode-languageclient';
import * as net from 'net';
import * as cp from 'child_process';


let PORT:any;
let wolfram:cp.ChildProcess;
function loadwolfram(lspPath:string, PORT:any, callback:any) {
    
        if (process.env.VSCODE_DEBUG_MODE === "true") {
            PORT = 6589;
        } else {
        try {
            if (process.platform === "win32") {
                wolfram = cp.spawn('cmd.exe', ['/c', 'wolframscript.exe', '-file', lspPath, PORT.toString(), lspPath], {detached:false});
            } else {
                wolfram = cp.spawn('wolframscript', ['-file', lspPath, PORT.toString(), lspPath], {detached:true});
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
                callback();
            });

            } catch (error) {
                console.log(error)
                vscode.window.showErrorMessage("Wolframscript failed to load.")
            }  
        
        }
};

function loadWolframServer(outputChannel:any, context:vscode.ExtensionContext, callback:any) {
    let wolframClient:LanguageClient;
    let serverOptions: ServerOptions = function() {
        return new Promise ((resolve, reject) => {
            let client = new net.Socket();

            setTimeout(() => {
                client.on("data", (data) => {
                    // console.log("LSP Client: " + data.toString())
                });
    
                client.on('error', function(err){
                    console.log("WLSP Kernel Error: "+ err.message);
                    // client.destroy();
                    client.end();
                    setTimeout(() => {
                        client.connect(PORT, "127.0.0.1", () => {});
                    }, 5000);
                })
    
                client.on('timeout', () => {
                    console.log("LSP timed out")
                    client.destroy();
                    client.connect(PORT, "127.0.0.1", () => {});
                });
    
                client.connect(PORT, "127.0.0.1", () => {
                    client.setKeepAlive(true, 20000)
                    resolve({
                        reader: client,
                        writer: client
                    });
                });
            }, 2000);




        });
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            "wolfram"
        ],
        diagnosticCollectionName: 'wolfram-lsp',
        outputChannel: outputChannel
    };


    wolframClient = new LanguageClient('wolfram', 'Wolfram Language Server', serverOptions, clientOptions);

    wolframClient.onReady().then(() => {
        //wolframClient.sendRequest("DocumentSymbolRequest");
        wolframClient.onNotification("wolframVersion", wolframVersion);
        // wolframClient.onNotification("moveCursor", moveCursor);
        // wolframClient.onNotification("wolframResult", wolframResult);
        callback(disposible)
        
    });
    let disposible = wolframClient.start();

}