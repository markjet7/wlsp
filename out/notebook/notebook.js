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
exports.deactivate = exports.WolframProvider = exports.WolframNotebook = void 0;
const vscode = require("vscode");
class WolframNotebook {
    constructor(uri, fileName, viewType, isDirty, isUntitled, cells, languages, metadata, _wolframClient) {
        this.uri = uri;
        this.fileName = fileName;
        this.viewType = viewType;
        this.isDirty = isDirty;
        this.isUntitled = isUntitled;
        this.cells = cells;
        this.languages = languages;
        this.metadata = metadata;
        this._wolframClient = _wolframClient;
        this.mapping = new Map();
        this.preloadScript = false;
        this.displayOrders = [
            'text/html',
            'application/json',
            'application/javascript',
            'application/vnd.*',
            'image/svg+xml',
            'text/markdown',
            'image/svg+xml',
            'image/png',
            'image/jpeg',
            'text/plain'
        ];
        this.nextExecutionOrder = 0;
        this.version = 0;
        this.contentOptions = {
            transientOutputs: true,
            transientMetadata: {}
        };
        // this.uri = uri;
        this.fileName = fileName;
        this.viewType = viewType;
        this.isDirty = isDirty;
        this.isUntitled = isUntitled;
        this.cells = cells;
        this.languages = languages;
        this.metadata = metadata;
        this.wolframClient = _wolframClient;
    }
    // uri: vscode.Uri;
    // fileName: string;
    // viewType: string;
    // isDirty: boolean;
    // isUntitled: boolean;
    // cells: readonly vscode.NotebookCell[];
    // languages: string[];
    // displayOrder?: vscode.GlobPattern[] | undefined;
    // metadata: vscode.NotebookDocumentMetadata;
    setWolframClient(_wolframClient) {
        this.wolframClient = _wolframClient;
    }
    execute(document, cell) {
        return __awaiter(this, void 0, void 0, function* () {
            if (cell) {
                const index = document.cells.indexOf(cell);
                let source = cell.document.getText();
                let r = new vscode.Selection(0, 0, 0, 0);
                if (this.wolframClient) {
                    yield this.wolframClient.sendRequest("runCell", { range: r, textDocument: document.uri.toString(), print: false, source: source }).then((result) => {
                        document.cells[index].outputs = [
                            {
                                outputKind: vscode.CellOutputKind.Rich,
                                data: {
                                    "text/html": [
                                        "<div style=\"min-height:50px; max-height:300px; overflow:scroll\">" + result.output.toString() + "<\div>"
                                    ],
                                    "application/json": { result: result.output.toString() },
                                    "text/plain": [
                                        result.result.toString()
                                    ],
                                    'image/png': [
                                        result.output.toString()
                                    ]
                                }
                            }
                        ];
                    });
                }
                else {
                    console.log("Wolfram not connected");
                    vscode.window.showErrorMessage("Wolfram not connected.");
                }
            }
        });
    }
    resolve() {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        let result = {
            languages: ['wolfram'],
            metadata: {
                editable: ((_a = this.metadata) === null || _a === void 0 ? void 0 : _a.editable) === undefined ? true : (_b = this.metadata) === null || _b === void 0 ? void 0 : _b.editable,
                runnable: ((_c = this.metadata) === null || _c === void 0 ? void 0 : _c.runnable) === undefined ? true : (_d = this.metadata) === null || _d === void 0 ? void 0 : _d.runnable,
                cellEditable: ((_e = this.metadata) === null || _e === void 0 ? void 0 : _e.cellEditable) === undefined ? true : (_f = this.metadata) === null || _f === void 0 ? void 0 : _f.cellEditable,
                cellRunnable: ((_g = this.metadata) === null || _g === void 0 ? void 0 : _g.cellRunnable) === undefined ? true : (_h = this.metadata) === null || _h === void 0 ? void 0 : _h.cellRunnable,
                displayOrder: this.displayOrders
            },
            cells: this.cells.map(((raw_cell) => {
                let outputs = [];
                let metadata = { editable: true, runnable: true, cellEditable: true, cellRunnable: true };
                return {
                    cellKind: raw_cell.cellKind,
                    source: raw_cell.source,
                    language: raw_cell.language || 'wolfram',
                    outputs: outputs,
                    metadata
                };
            }))
        };
        return result;
    }
}
exports.WolframNotebook = WolframNotebook;
function timeFn(fn) {
    return __awaiter(this, void 0, void 0, function* () {
        const startTime = Date.now();
        yield fn();
        return Date.now() - startTime;
    });
}
class WolframProvider {
    constructor(viewType, _extensionPath, fillOutputs, _wolframClient) {
        this._extensionPath = _extensionPath;
        this.fillOutputs = fillOutputs;
        this._wolframClient = _wolframClient;
        this._onDidChangeNotebook = new vscode.EventEmitter();
        this._notebooks = new Map();
        this.onDidChange = new vscode.EventEmitter().event;
        this.label = 'Wolfram';
        this.isPreferred = true;
        // The following are dummy implementations not relevant to this example.
        // onDidChangeNotebook = new vscode.EventEmitter<vscode.NotebookDocumentEditEvent>().event;
        this.onDidChangeNotebook = this._onDidChangeNotebook.event;
        this.wolframClient = _wolframClient;
        const emitter = new vscode.EventEmitter();
        vscode.notebook.registerNotebookKernelProvider({ viewType: viewType }, {
            onDidChangeKernels: undefined,
            provideKernels: () => {
                return [this];
            }
        });
        setTimeout(() => {
            emitter.fire();
        }, 5000);
    }
    setWolframClient(_wolframClient) {
        this.wolframClient = _wolframClient;
        this._notebooks.forEach((n, k) => {
            n.setWolframClient(_wolframClient);
        });
    }
    openNotebook(uri, context) {
        return __awaiter(this, void 0, void 0, function* () {
            let actualUri = context.backupId ? vscode.Uri.parse(context.backupId) : uri;
            try {
                const metadata = { editable: true, cellEditable: true, cellHasExecutionOrder: true, cellRunnable: true, runnable: true };
                const source = (yield vscode.workspace.fs.readFile(actualUri)).toString();
                // {
                //     cells: [{
                //         cell_type: 'markdown',
                //         source: [
                //             '# header'
                //         ]
                //     }]
                // }
                let rawcells = source.replace(/\r/gm, "\n").split(/\n\n\n\n|(?<=::\s+\*\))\n+/).map((s) => {
                    let trimmed = s.trim();
                    if (trimmed.substr(0, 3) == "(* " && trimmed.substr(trimmed.length - 3) == " *)") {
                        return {
                            type: 'markdown',
                            source: s,
                            metadata: { editable: true, runnable: true, cellEditable: true, cellRunnable: true, language_info: 'markdown' },
                            language: 'markdown',
                            cellKind: vscode.CellKind.Markdown,
                            outputs: []
                        };
                    }
                    else {
                        return {
                            type: 'wolfram',
                            source: s,
                            metadata: { editable: true, runnable: true, cellEditable: true, cellRunnable: true, language_info: 'wolfram' },
                            language: 'wolfram',
                            cellKind: vscode.CellKind.Code,
                            outputs: []
                        };
                    }
                });
                let languages = ['wolfram'];
                let wolframNotebook = new WolframNotebook(uri, uri.fsPath.toString(), "wolfram.input", false, false, rawcells, languages, metadata, this.wolframClient);
                //let wolframNotebook = new WolframNotebook(this._extensionPath, notebookRaw, true, this.wolframClient);
                this._notebooks.set(uri.toString(), wolframNotebook);
                return wolframNotebook.resolve();
            }
            catch (error) {
                console.log(error.message);
                throw new Error("Failed to load the document");
            }
        });
    }
    executeCell(document, cell) {
        return __awaiter(this, void 0, void 0, function* () {
            if (cell) {
                cell.metadata.statusMessage = 'Running';
                cell.metadata.runStartTime = Date.now();
                cell.metadata.runState = vscode.NotebookCellRunState.Running;
                cell.outputs = [];
            }
            else {
                document.cells.map((c) => {
                    this.executeCell(document, c);
                });
            }
            const duration = yield timeFn(() => __awaiter(this, void 0, void 0, function* () {
                const wolframNotebook = this._notebooks.get(document.uri.toString());
                if (wolframNotebook) {
                    return wolframNotebook.execute(document, cell);
                }
            }));
            if (cell) {
                cell.metadata.lastRunDuration = duration;
                cell.metadata.statusMessage = 'Success';
                cell.metadata.runState = vscode.NotebookCellRunState.Success;
            }
        });
    }
    executeAllCells(document) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.executeCell(document, undefined);
        });
    }
    cancelAllCellsExecution(document) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    cancelCellExecution(document, cell) {
        return __awaiter(this, void 0, void 0, function* () {
            if (cell) {
                cell.metadata.statusMessage = "Cancelled";
                cell.metadata.runState = vscode.NotebookCellRunState.Error;
            }
        });
    }
    resolveNotebook() {
        return __awaiter(this, void 0, void 0, function* () {
            return;
        });
    }
    saveNotebook(document, cancellation) {
        return __awaiter(this, void 0, void 0, function* () {
            const stringOutput = document.cells.map((c) => {
                return c.document.getText() + "\n\n\n";
            }).reduce((p, c) => { return p + c; }).trim();
            yield vscode.workspace.fs.writeFile(document.uri, Buffer.from(stringOutput));
        });
    }
    saveNotebookAs(targetResource, document, cancellation) {
        return __awaiter(this, void 0, void 0, function* () {
            const stringOutput = document.cells.map((c) => {
                return c.source;
            }).reduce((p, c) => { return p + c; });
            yield vscode.workspace.fs.writeFile(targetResource, Buffer.from(stringOutput));
        });
    }
    backupNotebook() {
        return __awaiter(this, void 0, void 0, function* () { return { id: '', delete: () => { } }; });
    }
}
exports.WolframProvider = WolframProvider;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=notebook.js.map