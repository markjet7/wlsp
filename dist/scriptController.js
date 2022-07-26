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
const clients_1 = require("./clients");
const fs = require('fs');
function activate(context) {
    context.subscriptions.push(new WolframScriptController(context));
}
exports.activate = activate;
class WolframScriptController {
    constructor(context) {
        this.controllerId = 'wolfram-script';
        this.notebookType = 'wolfram-script';
        this.label = 'Wolfram Script';
        this.supportedLanguages = ['wolfram', 'raw', 'plaintext'];
        this._executionOrder = 0;
        this.executions = [];
        this._controller = vscode.notebooks.createNotebookController(this.controllerId, this.notebookType, this.label);
        this._context = context;
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
        this.executions.map((execution) => {
            try {
                execution.end(false, Date.now());
                execution.replaceOutput(new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.error({
                        name: 'error',
                        message: "aborted"
                    })
                ]));
            }
            catch (e) {
                console.log(e);
            }
        });
        this.executions = [];
        clients_1.restart();
        // for (let cell of notebook.getCells()) {
        //     this._doInterrupt(cell);
        // }
    }
    _doInterrupt(cell) {
    }
    _doExecution(cell) {
        return __awaiter(this, void 0, void 0, function* () {
            if (clients_1.wolframKernelClient === null || clients_1.wolframKernelClient === void 0 ? void 0 : clients_1.wolframKernelClient.needsStart()) {
                clients_1.restart();
                clients_1.onkernelReady().then(() => {
                    this._doExecution(cell);
                });
            }
            else {
                let execution = this._controller.createNotebookCellExecution(cell);
                execution.executionOrder = ++this._executionOrder;
                execution.start(Date.now()); // Keep track of elapsed time to execute cell.
                this.executions.push(execution);
                /* Do some execution here; not implemented */
                try {
                    let abortCtl = new abort_controller_1.default();
                    execution.token.onCancellationRequested(() => {
                        abortCtl.abort();
                        execution.replaceOutput(new vscode.NotebookCellOutput([
                            vscode.NotebookCellOutputItem.error({
                                name: 'error',
                                message: "aborted"
                            })
                        ]));
                        execution.end(false, Date.now());
                    });
                    while (!execution.token.isCancellationRequested) {
                        clients_1.wolframKernelClient === null || clients_1.wolframKernelClient === void 0 ? void 0 : clients_1.wolframKernelClient.sendRequest("runExpression", {
                            expression: cell.document.getText(),
                            line: 0,
                            end: 0,
                            textDocument: cell.document
                        }).then((result) => {
                            let output = fs.readFileSync(result["output"], 'utf8').toString().replace("https:/file%2B.vscode-resource.vscode-cdn.net", "");
                            let re = new RegExp('data:image\/png;base64,(.*?)>', 'g');
                            let base64matches = output.replace(/\n/g, "").match(re);
                            let base64 = "";
                            if (base64matches != null && base64matches.length > 0) {
                                base64 = base64matches[0].replace('data:image\/png;base64,', '').replace('>', '');
                            }
                            execution.replaceOutput([
                                new vscode.NotebookCellOutput([
                                    vscode.NotebookCellOutputItem.text(output, 'text/html'),
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
            }
        });
    }
    dispose() {
        this._controller.dispose();
    }
}
exports.WolframScriptController = WolframScriptController;
//# sourceMappingURL=scriptController.js.map