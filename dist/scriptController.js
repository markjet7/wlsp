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
exports.WolframScriptController = exports.activate = void 0;
const abort_controller_1 = require("abort-controller");
const vscode = require("vscode");
const extension_1 = require("./extension");
const fs = require('fs');
function activate(context) {
    context.subscriptions.push(new WolframScriptController());
}
exports.activate = activate;
class WolframScriptController {
    constructor() {
        this.controllerId = 'wolfram-script';
        this.notebookType = 'wolfram-script';
        this.label = 'Wolfram Script';
        this.supportedLanguages = ['wolfram'];
        this._executionOrder = 0;
        this.executions = [];
        this._controller = vscode.notebooks.createNotebookController(this.controllerId, this.notebookType, this.label);
        this._controller.supportedLanguages = this.supportedLanguages;
        this._controller.supportsExecutionOrder = true;
        this._controller.executeHandler = this._execute.bind(this);
        this._controller.interruptHandler = this._interrupt.bind(this);
    }
    _execute(cells, _notebook, _controller) {
        return __awaiter(this, void 0, void 0, function* () {
            let promises = cells.map((cell) => __awaiter(this, void 0, void 0, function* () {
                yield this._doExecution(cell);
                return true;
            }));
            yield Promise.all(promises);
        });
    }
    _interrupt(notebook) {
        /* Do some interruption here; not implemented */
        this.executions.map(execution => {
            execution.end(false, Date.now());
        });
        this.executions = [];
        extension_1.restartKernel();
        // for (let cell of notebook.getCells()) {
        //     this._doInterrupt(cell);
        // }
    }
    _doInterrupt(cell) {
        // if (cell.kind === vscode.NotebookCellKind.Code) {
        //     let execution = cell.executionSummary
        //     if (execution?.executionOrder) {
        //         let executionId = execution.executionOrder;
        //         if (executionId && executionId <= this._executionOrder) {
        //             // client.wolframKernelClient.sendRequest("$/cancelRequest", {id: executionId}).then(
        //             //     () => {});
        //             // cancel cell execution
        //             // let execution:vscode.NotebookCellExecution = this._controller.createNotebookCellExecution(cell);
        //             // let abortCtl = new AbortController();
        //             // abortCtl.abort();
        //             // execution.replaceOutput(
        //             //     new vscode.NotebookCellOutput([
        //             //         vscode.NotebookCellOutputItem.error({
        //             //             name: 'error', 
        //             //             message: "aborted"})
        //             //     ]));
        //             // execution.end(false, Date.now());
        //             // cell.
        //         }
        //     } else {
        //     }
        // }
    }
    _doExecution(cell) {
        return __awaiter(this, void 0, void 0, function* () {
            let execution = this._controller.createNotebookCellExecution(cell);
            execution.executionOrder = ++this._executionOrder;
            execution.start(Date.now()); // Keep track of elapsed time to execute cell.
            this.executions.push(execution);
            /* Do some execution here; not implemented */
            try {
                let abortCtl = new abort_controller_1.default();
                execution.token.onCancellationRequested(() => {
                    abortCtl.abort();
                    // client.wolframKernelClient.sendRequest("$/cancelRequest", {id: execution.executionOrder}).then(
                    //     () => {});
                    execution.replaceOutput(new vscode.NotebookCellOutput([
                        vscode.NotebookCellOutputItem.error({
                            name: 'error',
                            message: "aborted"
                        })
                    ]));
                    execution.end(false, Date.now());
                });
                while (!execution.token.isCancellationRequested) {
                    extension_1.client.wolframKernelClient.sendRequest("runExpression", {
                        expression: cell.document.getText(),
                        line: 0,
                        end: 0
                    }).then((result) => {
                        execution.replaceOutput([
                            new vscode.NotebookCellOutput([
                                vscode.NotebookCellOutputItem.text(
                                // result["output"],
                                fs.readFileSync(result["output"], 'utf8'), 'text/html'),
                                vscode.NotebookCellOutputItem.text(result["result"]),
                                vscode.NotebookCellOutputItem.text(result["result"], 'text/wolfram')
                            ])
                        ]);
                        if (execution.executionOrder !== undefined) {
                            if (execution.executionOrder <= this._executionOrder) {
                                execution.end(true, Date.now());
                            }
                        }
                    });
                    break;
                }
            }
            catch (e) {
                execution.replaceOutput(new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.error({
                        name: e instanceof Error && e.name || 'error',
                        message: e instanceof Error && e.message || JSON.stringify(e, undefined, 4)
                    })
                ]));
                execution.end(false, Date.now());
            }
        });
    }
    dispose() {
        this._controller.dispose();
    }
}
exports.WolframScriptController = WolframScriptController;
//# sourceMappingURL=scriptController.js.map