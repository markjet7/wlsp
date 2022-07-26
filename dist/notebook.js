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
exports.deactivate = exports.WolframNotebookSerializer = void 0;
const vscode = require("vscode");
// export function activate(context: vscode.ExtensionContext) {
//     context.subscriptions.push(
//       vscode.workspace.registerNotebookSerializer('wolfram-notebook', new WolframNotebookSerializer())
//   );
// } todo: add this back in when we have a way to activate the extension
class WolframNotebookSerializer {
    deserializeNotebook(content, _token) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                try {
                    var contents = new TextDecoder().decode(content);
                    // deserialize jupyter notebook
                    let raw;
                    try {
                        raw = JSON.parse(contents);
                    }
                    catch (_a) {
                        raw = [];
                    }
                    const cells = raw.cells.map((item) => {
                        let cell;
                        if (item.cell_type === "code") {
                            item.kind = vscode.NotebookCellKind.Code;
                            cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, item.source.join(""), raw.metadata.kernelspec.language);
                        }
                        else {
                            item.kind = vscode.NotebookCellKind.Markup;
                            cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, item.source.join(""), "markdown");
                        }
                        // cell.outputs = item.outputs
                        cell.metadata = item.metadata;
                        cell.outputs = item.outputs.map((o) => {
                            return new vscode.NotebookCellOutput(Object.keys(o["data"]).map((k) => {
                                switch (k) {
                                    case "text/plain":
                                        return vscode.NotebookCellOutputItem.text(o["data"][k].join(""), 'text/plain');
                                    case "image/png":
                                        return new vscode.NotebookCellOutputItem(Buffer.from(o["data"][k], 'base64'), 'image/png');
                                    case "image/jpeg":
                                        return new vscode.NotebookCellOutputItem(Buffer.from(o["data"][k], 'base64'), 'image/jpeg');
                                    default:
                                        return vscode.NotebookCellOutputItem.text("Output parsing error", 'text/plain');
                                }
                            }));
                        });
                        return cell;
                    });
                    return resolve(new vscode.NotebookData(cells));
                }
                catch (_b) {
                    return resolve(new vscode.NotebookData([]));
                }
            });
        });
    }
    serializeNotebook(data, _token) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let contents = [];
            for (const cell of data.cells) {
                let kind;
                switch (cell.kind) {
                    case 2:
                        kind = "code";
                        break;
                    default:
                        kind = "markdown";
                }
                contents.push({
                    cell_type: kind,
                    language: cell.languageId,
                    source: cell.value.split("\\n"),
                    execution_count: null,
                    "metadata": {},
                    outputs: (_a = cell.outputs) === null || _a === void 0 ? void 0 : _a.map((o) => {
                        let out;
                        if (o.items[0].mime === "text/plain") {
                            out = [o.items[0].data.toString('utf8')];
                        }
                        else {
                            out = o.items[0].data.toString('base64');
                        }
                        ;
                        return {
                            "data": {
                                [o.items[0].mime.toString()]: out
                            }
                        };
                    })
                    // ,
                    // metadata: Object.values((cell as any).metadata).join(""),
                    // outputs: cell.outputs
                });
            }
            let nb = {};
            nb.cells = contents;
            nb.metadata = {
                "kernelspec": {
                    "display_name": "Wolfram Language",
                    "language": "wolfram",
                    "name": "wolfram"
                },
                "language_info": {
                    "codemirror_mode": {
                        "name": "ipython",
                        "version": "4.0.0"
                    }
                },
                "file_extension": ".wl",
                "mimetype": "text/x-wolfram",
                "name": "Wolfram Language",
                "nbformat": 4,
                "nbconvert_exporter": "python",
                "pygments_lexer": "ipython4",
                "version": "4.0.0"
            };
            nb.nbformat = 4;
            nb.nbformat_minor = 0;
            nb.vscode = {
                "interpreter": {
                    "hash": ""
                }
            };
            return new TextEncoder().encode(JSON.stringify(nb));
        });
    }
}
exports.WolframNotebookSerializer = WolframNotebookSerializer;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=notebook.js.map