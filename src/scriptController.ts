
import AbortController from 'abort-controller';
import { exec } from 'child_process';
import * as vscode from 'vscode';
import {wolframKernelClient, restartKernel, onkernelReady} from './clients'
const fs = require('fs')

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(new WolframScriptController(context));
}
  
export class WolframScriptController {
    readonly controllerId = 'wolfram-script';
    readonly notebookType = 'wolfram-script';
    readonly label = 'Wolfram Script';
    readonly supportedLanguages = ['wolfram'];

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
        console.log(this.executions);
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
        restartKernel(this._context);
        // for (let cell of notebook.getCells()) {
        //     this._doInterrupt(cell);
        // }
    }

    private _doInterrupt(cell: vscode.NotebookCell): void {

    }

    private executions: vscode.NotebookCellExecution[] = [];

    private async _doExecution(cell: vscode.NotebookCell): Promise<void> {

        if(!wolframKernelClient) {
            restartKernel(this._context).then(() => {
                onkernelReady().then(() => {
                    this._doExecution(cell)
                })
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
                        wolframKernelClient.sendRequest("runExpression", 
                            {
                                expression: cell.document.getText(),
                                line: 0,
                                end: 0
                            }
                        ).then((result:any) => {
                            execution.replaceOutput([
                                new vscode.NotebookCellOutput([
                                    vscode.NotebookCellOutputItem.text(
                                            // result["output"],
                                            fs.readFileSync(result["output"], 'utf8'),
                                            'text/html'),
                                    vscode.NotebookCellOutputItem.text(result["result"]),
                                    vscode.NotebookCellOutputItem.text(result["result"], 'text/wolfram')
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