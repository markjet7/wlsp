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
exports.WolframController = exports.activate = void 0;
const vscode = require("vscode");
const extension_1 = require("./extension");
function activate(context) {
    context.subscriptions.push(new WolframController());
}
exports.activate = activate;
class WolframController {
    constructor() {
        this.controllerId = 'wolfram-notebook';
        this.notebookType = 'wolfram.notebook';
        this.label = 'Wolfram Notebook';
        this.supportedLanguages = ['wolfram'];
        this._executionOrder = 0;
        this._controller = vscode.notebooks.createNotebookController(this.controllerId, this.notebookType, this.label);
        this._controller.supportedLanguages = this.supportedLanguages;
        this._controller.supportsExecutionOrder = true;
        this._controller.executeHandler = this._execute.bind(this);
    }
    _execute(cells, _notebook, _controller) {
        for (let cell of cells) {
            this._doExecution(cell);
        }
    }
    _doExecution(cell) {
        return __awaiter(this, void 0, void 0, function* () {
            const execution = this._controller.createNotebookCellExecution(cell);
            execution.executionOrder = ++this._executionOrder;
            execution.start(Date.now()); // Keep track of elapsed time to execute cell.
            /* Do some execution here; not implemented */
            try {
                extension_1.wolframKernelClient.sendRequest("runExpression", {
                    expression: cell.document.getText(),
                    line: 0,
                    end: 0
                }).then((result) => {
                    execution.replaceOutput([
                        new vscode.NotebookCellOutput([
                            vscode.NotebookCellOutputItem.text(result["output"])
                        ])
                    ]);
                    execution.end(true, Date.now());
                });
            }
            catch (err) {
            }
        });
    }
    dispose() {
        this._controller.dispose();
    }
}
exports.WolframController = WolframController;
//# sourceMappingURL=notebookController.js.map