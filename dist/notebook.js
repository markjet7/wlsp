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
exports.deactivate = exports.WolframNotebook = exports.WolframScriptSerializer = exports.WolframNotebookSerializer = void 0;
const vscode = require("vscode");
const clients_1 = require("./clients");
// export function activate(context: vscode.ExtensionContext) {
//     context.subscriptions.push(
//       vscode.workspace.registerNotebookSerializer('wolfram-notebook', new WolframNotebookSerializer())
//   );
// }
class WolframNotebookSerializer {
    constructor() {
        this.raw = [];
        this.cells = [];
    }
    deserializeNotebook(content, _token) {
        return __awaiter(this, void 0, void 0, function* () {
            var contents = new TextDecoder().decode(content);
            if (clients_1.wolframKernelClient !== undefined) {
                return clients_1.wolframKernelClient.sendRequest("deserializeNotebook", { contents: contents }).then((result) => {
                    this.raw = [];
                    result.map((item) => this.getCells(item));
                    this.cells = this.raw.map(item => {
                        let i = new vscode.NotebookCellData(item.kind, item.value, item.language);
                        i.metadata = item.metadata;
                        return i;
                    });
                    return new vscode.NotebookData(this.cells);
                });
            }
            else {
                vscode.window.showErrorMessage("Kernel is not ready. Please wait and try again.");
                return new vscode.NotebookData(this.cells);
            }
            // contents.split(/\r?\n\r?\n/).forEach(line => {
            //   raw.push({
            //     kind: vscode.NotebookCellKind.Code,
            //     value: line,
            //     language: "wolfram"
            //   })
            // })
        });
    }
    getCells(item) {
        if (item.constructor.name === "Array") {
            item.map((item) => this.getCells(item));
        }
        else {
            this.raw.push({
                kind: item.kind,
                language: item.language,
                value: item.value,
                metadata: item.metadata
            });
        }
    }
    serializeNotebook(data, _token) {
        return __awaiter(this, void 0, void 0, function* () {
            let contents = [];
            for (const cell of data.cells) {
                contents.push({
                    kind: cell.kind,
                    language: cell.languageId,
                    value: cell.value,
                    metadata: Object.values(cell.metadata).join("")
                });
            }
            return clients_1.wolframKernelClient.sendRequest("serializeNotebook", { contents: contents }).then((result) => {
                return Buffer.from(result);
            });
        });
    }
}
exports.WolframNotebookSerializer = WolframNotebookSerializer;
class WolframScriptSerializer {
    deserializeNotebook(content, _token) {
        return __awaiter(this, void 0, void 0, function* () {
            var contents = new TextDecoder().decode(content);
            let raw = [];
            contents.split(/\r?\n\r?\n/).forEach(line => {
                raw.push({
                    kind: vscode.NotebookCellKind.Code,
                    value: line,
                    language: "wolfram"
                });
            });
            const cells = raw.map(item => new vscode.NotebookCellData(item.kind, item.value, item.language));
            return new vscode.NotebookData(cells);
        });
    }
    serializeNotebook(data, _token) {
        return __awaiter(this, void 0, void 0, function* () {
            let contents = [];
            for (const cell of data.cells) {
                contents.push({
                    kind: cell.kind,
                    language: cell.languageId,
                    value: cell.value
                });
            }
            let stringoutput = contents.reduce((current, item) => current + item.value + "\n\n", "").trimRight();
            // return new TextEncoder().encode(JSON.stringify(contents));
            return Buffer.from(stringoutput);
        });
    }
}
exports.WolframScriptSerializer = WolframScriptSerializer;
class WolframNotebook {
    constructor(uri, fileName, viewType, isDirty, isUntitled, cells, languages, 
    // public metadata: vscode.NotebookDocumentMetadata,
    _wolframClient) {
        this.uri = uri;
        this.fileName = fileName;
        this.viewType = viewType;
        this.isDirty = isDirty;
        this.isUntitled = isUntitled;
        this.cells = cells;
        this.languages = languages;
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
        // this.metadata = metadata;
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
}
exports.WolframNotebook = WolframNotebook;
function timeFn(fn) {
    return __awaiter(this, void 0, void 0, function* () {
        const startTime = Date.now();
        yield fn();
        return Date.now() - startTime;
    });
}
// export class WolframProvider implements vscode.NotebookContentProvider, vscode.NotebookKernel {
//     private _onDidChangeNotebook = new vscode.EventEmitter<vscode.NotebookDocumentEditEvent>();
// 	public _notebooks: Map<string, WolframNotebook> = new Map();
// 	onDidChange: vscode.Event<void> = new vscode.EventEmitter<void>().event;
// 	label: string = 'Wolfram';
//     isPreferred: boolean = true;
//     private wolframClient:LanguageClient;
//     constructor(viewType: string, private _extensionPath: string, private fillOutputs: boolean, private _wolframClient:LanguageClient) {
//         this.wolframClient = _wolframClient;
// 		const emitter = new vscode.EventEmitter<void>();
// 		vscode.notebook.registerNotebookContentProvider({ notebookType: viewType }, {
// 			onDidChangeKernels: undefined,
// 			provideKernels: () => {
// 				return [this];
// 			}
// 		});
// 		setTimeout(() => {
// 			emitter.fire();
// 		}, 5000);
//     }
//     public setWolframClient(_wolframClient:LanguageClient) {
//         this.wolframClient = _wolframClient;
//         this._notebooks.forEach((n:WolframNotebook, k:string) => {
//             n.setWolframClient(_wolframClient);
//         })
//     }
//     async openNotebook(uri: vscode.Uri, context:vscode.NotebookDocumentOpenContext): Promise<vscode.NotebookData> {
//         let actualUri = context.backupId ? vscode.Uri.parse(context.backupId) : uri; 
//         try {
//             this.wolframClient.sendRequest("openNotebook", {path:actualUri}).then(async (result:any) => {
//                 let source = (await vscode.workspace.fs.readFile(actualUri)).toString();
//             // const metadata:vscode.NotebookDocumentMetadata =  { editable: true, cellEditable: true, cellHasExecutionOrder: true, cellRunnable: true, runnable: true };
//                         // {
//             //     cells: [{
//             //         cell_type: 'markdown',
//             //         source: [
//             //             '# header'
//             //         ]
//             //     }]
//             // }
//             let rawcells:any = [];
//             // = source.replace(/\r/gm,"\n").split(/\n\n\n\n|(?<=::\s+\*\))\n+/).map((s:any) => {
//             //         let trimmed = s.trim();
//             //         if (trimmed.substr(0, 3) == "(* " && trimmed.substr(trimmed.length - 3) == " *)"){
//             //             return {
//             //                 type: 'markdown',
//             //                 source: s,
//             //                 metadata:{editable:true, runnable:true, cellEditable:true, cellRunnable:true, language_info:'markdown'},
//             //                 language:'markdown',
//             //                 cellKind: vscode.CellKind.Markdown,
//             //                 outputs:[]
//             //             }
//             //         } else {
//             //             return {
//             //                     type: 'wolfram',
//             //                     source: s,
//             //                     metadata:{editable:true, runnable:true, cellEditable:true, cellRunnable:true, language_info:'wolfram'},
//             //                     language:'wolfram',
//             //                     cellKind: vscode.CellKind.Code,
//             //                     outputs:[]
//             //                 }}
//             //     })
//             let languages = ['wolfram']       
//             let wolframNotebook = new WolframNotebook(
//                 uri,
//                 uri.fsPath.toString(),
//                 "wolfram.input",
//                 false,
//                 false,
//                 rawcells,
//                 languages,
//                 metadata,
//                 this.wolframClient
//             )
//             //let wolframNotebook = new WolframNotebook(this._extensionPath, notebookRaw, true, this.wolframClient);
//             this._notebooks.set(uri.toString(), wolframNotebook);
//             return wolframNotebook.resolve();
//         })
//         } catch (error) {
//             console.log(error.message)
//             throw new Error("Failed to load the document");
//         }
//     }
//     async executeCell(document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined): Promise<void> {
// 		if (cell) {
// 			// cell.metadata.statusMessage = 'Running';
// 			// cell.metadata.runStartTime = Date.now();
//             // cell.metadata.runState = vscode.NotebookCellRunState.Running;
//             // cell.outputs = [];
// 		} else {
//             // document.cells.map((c:any) => {
//             //     this.executeCell(document, c);
//             // })
//         }
// 		const duration = await timeFn(async () => {
// 			const wolframNotebook = this._notebooks.get(document.uri.toString());
// 			if (wolframNotebook) {
// 				return wolframNotebook.execute(document, cell);
// 			}
// 		});
// 		if (cell) {
// 			// cell.metadata.lastRunDuration = duration;
// 			// cell.metadata.statusMessage = 'Success'
// 			// cell.metadata.runState = vscode.NotebookCellRunState.Success;
// 		}
//     }
//     async executeAllCells(document:vscode.NotebookDocument):Promise<void>{
// 		await this.executeCell(document, undefined);
//     }
//     async cancelAllCellsExecution(document:vscode.NotebookDocument):Promise<void> {
//     }
//     async cancelCellExecution(document:vscode.NotebookDocument, cell: vscode.NotebookCell | undefined){
//         if(cell) {
//             // cell.metadata.statusMessage = "Cancelled";
//             // cell.metadata.runState = vscode.NotebookCellRunState.Error;
//         }
//     }
//      // The following are dummy implementations not relevant to this example.
//     // onDidChangeNotebook = new vscode.EventEmitter<vscode.NotebookDocumentEditEvent>().event;
// 	onDidChangeNotebook: vscode.Event<vscode.NotebookDocumentEditEvent> = this._onDidChangeNotebook.event;
//     async resolveNotebook(): Promise<void> { 
//         return 
//      }
//     async saveNotebook(document: vscode.NotebookDocument, cancellation: vscode.CancellationToken): Promise<void> { 
//          const stringOutput = document.cells.map((c:any) => {
//             return c.document.getText() +"\n\n\n"
//          }).reduce((p, c) => {return p + c}).trim();
//          await vscode.workspace.fs.writeFile(document.uri, Buffer.from(stringOutput));
//      }
//     async saveNotebookAs(targetResource: vscode.Uri, document: vscode.NotebookDocument, cancellation: vscode.CancellationToken): Promise<void> { 
//         const stringOutput = document.cells.map((c:any) => {
//            return c.source
//         }).reduce((p, c) => {return p + c});
//         await vscode.workspace.fs.writeFile(targetResource, Buffer.from(stringOutput));}
//     async backupNotebook(): Promise<vscode.NotebookDocumentBackup> { return { id: '', delete: () => { } };}
// }
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=notebook.js.map