

import { wolframKernelClient } from './clients';
import * as vscode from 'vscode';
const fs = require('fs')

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(new InteractiveController());
}

export class InteractiveController {
    readonly controllerId = 'wolfram-interactive';
    readonly notebookType = 'wolfram-interactive';
    readonly label = 'Wolfram Interactive';
    readonly supportedLanguages = ['wolfram'];

    private readonly _controller: vscode.NotebookController;
    private _executionOrder = 0;

    constructor() {
        this._controller = vscode.notebooks.createNotebookController(
            this.controllerId,
            this.notebookType,
            this.label
        );

        this._controller.supportedLanguages = this.supportedLanguages;
        this._controller.supportsExecutionOrder = true;
        this._controller.executeHandler = this._execute.bind(this);

        this.id = this.controllerId;
        // this._controller.interruptHandler = this._interrupt.bind(this);
    }



    private executeHandler(cells: vscode.NotebookCell[], notebook: vscode.NotebookDocument, controller: vscode.NotebookController): void {
        throw new Error('Method not implemented.');
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
        // for (let cell of notebook.getCells()) {
        //     this._doInterrupt(cell);
        // }
    }

    private _doInterrupt(cell: vscode.NotebookCell): void {
        if (cell.kind === vscode.NotebookCellKind.Code) {
            let execution = cell.executionSummary
            if (execution?.executionOrder) {
                let executionId = execution.executionOrder;
                if (executionId && executionId <= this._executionOrder) {
                    wolframKernelClient?.sendRequest("$/cancelRequest", {id: executionId}).then(
                        () => {});
                }
            } else {
                wolframKernelClient?.sendRequest("$/cancelRequest", {id: this._executionOrder}).then(
                    () => {});
            }
        }
    }

    private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
        let execution: vscode.NotebookCellExecution = vscode.NotebookCellExecution = this._controller.createNotebookCellExecution(cell);
        execution.executionOrder = this._executionOrder;
        execution.start(Date.now());
        if (cell.kind === vscode.NotebookCellKind.Code) {
            this._executionOrder += 1;
            wolframKernelClient?.sendRequest("runExpression", {id: this._executionOrder, expression: cell.document.getText()}).then(
                (result:any) => {
                    execution.replaceOutput([
                        new vscode.NotebookCellOutput([
                            vscode.NotebookCellOutputItem.text(
                                    fs.readFileSync(result["output"], 'utf8'),'text/html'),
                            vscode.NotebookCellOutputItem.text(result["result"]),
                            vscode.NotebookCellOutputItem.text(result["result"], 'text/wolfram')
                        ])
                    ]);
                });
        }   
    }

    dispose() {
        this._controller.dispose();
    }
}