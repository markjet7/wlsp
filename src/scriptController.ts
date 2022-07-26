
import AbortController from 'abort-controller';
import { exec } from 'child_process';
import * as vscode from 'vscode';
import {wolframKernelClient, restart, onkernelReady} from './clients'
const fs = require('fs')

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(new WolframScriptController(context));
}
  
export class WolframScriptController {
    readonly controllerId = 'wolfram-script';
    readonly notebookType = 'wolfram-script';
    readonly label = 'Wolfram Script';
    readonly supportedLanguages = ['wolfram', 'raw', 'plaintext'];

    private readonly _controller: vscode.NotebookController;
    private _executionOrder = 0;
    public _context: vscode.ExtensionContext;

    constructor(context:vscode.ExtensionContext) {
        this._controller = vscode.notebooks.createNotebookController(
        this.controllerId,
        this.notebookType,
        this.label
        );

        this._context = context;

        this._controller.supportedLanguages = this.supportedLanguages;
        this._controller.supportsExecutionOrder = true;
        this._controller.executeHandler = this._execute.bind(this);
        this._controller.interruptHandler = this._interrupt.bind(this);
    }

    private async _execute(
        cells: vscode.NotebookCell[],
        _notebook: vscode.NotebookDocument,
        _controller: vscode.NotebookController
    ): Promise<void> {
        let promises = cells.map(async cell => {
            await this._doExecution(cell)
            return true
        })

        await Promise.all(promises)

    }

    private _interrupt(notebook: vscode.NotebookDocument): void {
        /* Do some interruption here; not implemented */
        this.executions.map((execution) => {
            try {
                execution.end(false, Date.now());
    
                execution.replaceOutput(
                    new vscode.NotebookCellOutput([
                        vscode.NotebookCellOutputItem.error({
                            name: 'error', 
                            message: "aborted"})
                    ]));
            } catch (e) {
                console.log(e);
            }
        })
        this.executions = [];
        restart();
        // for (let cell of notebook.getCells()) {
        //     this._doInterrupt(cell);
        // }
    }

    private _doInterrupt(cell: vscode.NotebookCell): void {

    }

    private executions: vscode.NotebookCellExecution[] = [];

    private async _doExecution(cell: vscode.NotebookCell): Promise<void> {

        if(wolframKernelClient?.needsStart()) {
            restart()
            onkernelReady().then(() => {
                this._doExecution(cell)
            })
        } else {
            let execution: vscode.NotebookCellExecution = this._controller.createNotebookCellExecution(cell);
            execution.executionOrder = ++this._executionOrder;
            execution.start(Date.now()); // Keep track of elapsed time to execute cell.
            this.executions.push(execution);
            /* Do some execution here; not implemented */
            try {
                let abortCtl = new AbortController();
                execution.token.onCancellationRequested(() => {
                    abortCtl.abort();

                    execution.replaceOutput(
                        new vscode.NotebookCellOutput([
                            vscode.NotebookCellOutputItem.error({
                                name: 'error', 
                                message: "aborted"})
                        ]));
                    execution.end(false, Date.now());
                });
                while(!execution.token.isCancellationRequested){
                        wolframKernelClient?.sendRequest("runExpression", 
                            {
                                expression: cell.document.getText(),
                                line: 0,
                                end: 0,
                                textDocument: cell.document
                            }
                        ).then((result:any) => {

                            let output = fs.readFileSync(result["output"], 'utf8').toString().replace("https:/file%2B.vscode-resource.vscode-cdn.net", "")
       
                            let re:RegExp = new RegExp('data:image\/png;base64,(.*?)>', 'g')
                            let base64matches:string[] = output.replace(/\n/g,"").match(re);
        
                            let base64:string = "";
                            if(base64matches != null && base64matches.length>0){
                                base64 = base64matches[0].replace('data:image\/png;base64,', '').replace('>', '')
                            } 
        
                            execution.replaceOutput([
                                new vscode.NotebookCellOutput([
                                    vscode.NotebookCellOutputItem.text(
                                            output,'text/html'),
                                    vscode.NotebookCellOutputItem.text(result["result"]),
                                    vscode.NotebookCellOutputItem.text(result["result"], 'text/wolfram'),
                                    new vscode.NotebookCellOutputItem(Buffer.from(base64, 'base64'), 'image/png')
                                ])
                            ]);
                            if (execution.executionOrder !== undefined) {
                                if (execution.executionOrder <= this._executionOrder) {
                                    execution.end(true, Date.now());
                                }
                            }        
                        })
                    break;
                }
            } catch (e) {
                execution.replaceOutput(
                    new vscode.NotebookCellOutput([
                        vscode.NotebookCellOutputItem.error({
                            name: e instanceof Error && e.name || 'error', 
                            message: e instanceof Error && e.message || JSON.stringify(e, undefined, 4)})
                    ]));
                execution.end(false, Date.now());
            }
        }
    }

    

    dispose() {
        this._controller.dispose()
    }
}