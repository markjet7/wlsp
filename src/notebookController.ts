
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(new Controller());
  }
  
class Controller {
    readonly controllerId = 'wolfram-notebook';
    readonly notebookType = 'wolfram.notebook';
    readonly label = 'Wolfram Notebook';
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
    }

    private _execute(
        cells: vscode.NotebookCell[],
        _notebook: vscode.NotebookDocument,
        _controller: vscode.NotebookController
    ): void {
        for (let cell of cells) {
        this._doExecution(cell);
        }
    }

    private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
        const execution = this._controller.createNotebookCellExecution(cell);
        execution.executionOrder = ++this._executionOrder;
        execution.start(Date.now()); // Keep track of elapsed time to execute cell.

        /* Do some execution here; not implemented */

        execution.replaceOutput([
        new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text('Dummy output text!')
        ])
        ]);
        execution.end(true, Date.now());
    }

    dispose() {
        this._controller.dispose()
    }
}