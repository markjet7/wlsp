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
exports.deactivate = exports.InteractiveNotebook = exports.InteractiveNotebookSerializer = void 0;
const vscode = require("vscode");
class InteractiveNotebookSerializer {
    constructor() {
        this.raw = [];
        this.cells = [];
    }
    deserializeNotebook(content, token) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                resolve(new vscode.NotebookData([]));
            });
        });
    }
    serializeNotebook(data, token) {
        return __awaiter(this, void 0, void 0, function* () {
            let contents = [];
            return Buffer.from(JSON.stringify(contents));
        });
    }
    getCells(item) {
        if (item.constructor.name === "Array") {
            item.map((item) => this.getCells(item));
        }
        else {
            this.raw.push({
                kind: item.kind,
                language: item.languageId,
                value: item.value,
                metadata: item.metadata
            });
        }
    }
}
exports.InteractiveNotebookSerializer = InteractiveNotebookSerializer;
class InteractiveNotebook {
    constructor(uri, fileName, viewType, isDirty, isUntitled, cells, languages, 
    // public metadata: vscode.NotebookDocumentMetadata,
    _wolframKernel) {
        this.uri = uri;
        this.fileName = fileName;
        this.viewType = viewType;
        this.isDirty = isDirty;
        this.isUntitled = isUntitled;
        this.cells = cells;
        this.languages = languages;
        this._wolframKernel = _wolframKernel;
        this.mapping = new Map();
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
        // this.metadata = metadata;
        if (_wolframKernel) {
            this.wolframKernel = _wolframKernel;
        }
        this.notebookType = "wolfram-interactive";
        this.isClosed = false;
        this.metadata = {};
        this.cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Code, "1+1", "wolfram")
        ];
        this.cellCount = cells.length;
    }
    cellAt(index) {
        throw new Error('Method not implemented.');
    }
    getCells(range) {
        throw new Error('Method not implemented.');
    }
    save() {
        throw new Error('Method not implemented.');
    }
    setWolframClient(_wolframKernel) {
        this.wolframKernel = _wolframKernel;
    }
}
exports.InteractiveNotebook = InteractiveNotebook;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=interactiveNotebook.js.map