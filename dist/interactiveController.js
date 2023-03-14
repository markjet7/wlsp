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
exports.InteractiveController = exports.activate = void 0;
const clients_1 = require("./clients");
const vscode = require("vscode");
const fs = require('fs');
function activate(context) {
    context.subscriptions.push(new InteractiveController());
}
exports.activate = activate;
class InteractiveController {
    constructor() {
        this.controllerId = 'wolfram-interactive';
        this.notebookType = 'wolfram-interactive';
        this.label = 'Wolfram Interactive';
        this.supportedLanguages = ['wolfram'];
        this._executionOrder = 0;
        this._controller = vscode.notebooks.createNotebookController(this.controllerId, this.notebookType, this.label);
        this._controller.supportedLanguages = this.supportedLanguages;
        this._controller.supportsExecutionOrder = true;
        this._controller.executeHandler = this._execute.bind(this);
        this.id = this.controllerId;
        // this._controller.interruptHandler = this._interrupt.bind(this);
    }
    executeHandler(cells, notebook, controller) {
        throw new Error('Method not implemented.');
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
        // for (let cell of notebook.getCells()) {
        //     this._doInterrupt(cell);
        // }
    }
    _doInterrupt(cell) {
        if (cell.kind === vscode.NotebookCellKind.Code) {
            let execution = cell.executionSummary;
            if (execution === null || execution === void 0 ? void 0 : execution.executionOrder) {
                let executionId = execution.executionOrder;
                if (executionId && executionId <= this._executionOrder) {
                    clients_1.wolframKernelClient === null || clients_1.wolframKernelClient === void 0 ? void 0 : clients_1.wolframKernelClient.sendRequest("$/cancelRequest", { id: executionId }).then(() => { });
                }
            }
            else {
                clients_1.wolframKernelClient === null || clients_1.wolframKernelClient === void 0 ? void 0 : clients_1.wolframKernelClient.sendRequest("$/cancelRequest", { id: this._executionOrder }).then(() => { });
            }
        }
    }
    _doExecution(cell) {
        return __awaiter(this, void 0, void 0, function* () {
            let execution = this._controller.createNotebookCellExecution(cell);
            execution.executionOrder = this._executionOrder;
            execution.start(Date.now());
            if (cell.kind === vscode.NotebookCellKind.Code) {
                this._executionOrder += 1;
                clients_1.wolframKernelClient === null || clients_1.wolframKernelClient === void 0 ? void 0 : clients_1.wolframKernelClient.sendRequest("runExpression", { id: this._executionOrder, expression: cell.document.getText() }).then((result) => {
                    execution.replaceOutput([
                        new vscode.NotebookCellOutput([
                            vscode.NotebookCellOutputItem.text(fs.readFileSync(result["output"], 'utf8'), 'text/html'),
                            vscode.NotebookCellOutputItem.text(result["result"]),
                            vscode.NotebookCellOutputItem.text(result["result"], 'text/wolfram')
                        ])
                    ]);
                });
            }
        });
    }
    dispose() {
        this._controller.dispose();
    }
}
exports.InteractiveController = InteractiveController;
//# sourceMappingURL=interactiveController.js.map