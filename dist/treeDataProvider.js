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
exports.workspaceSymbolProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const clients_1 = require("./clients");
class TreeItem extends vscode.TreeItem {
    constructor(label, children) {
        super(label, children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
        this.children = children;
        this.location = "";
    }
}
class workspaceSymbolProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.data = [new TreeItem("Symbols", [])];
        this.getBuiltins();
        this.getSymbols();
        this.builtins = new TreeItem("Builtins", []);
    }
    getBuiltins() {
        return __awaiter(this, void 0, void 0, function* () {
            clients_1.wolframClient === null || clients_1.wolframClient === void 0 ? void 0 : clients_1.wolframClient.onReady().then(() => {
                clients_1.wolframClient === null || clients_1.wolframClient === void 0 ? void 0 : clients_1.wolframClient.sendRequest("builtInList").then((file) => {
                    fs.readFile(file, 'utf8', (err, data) => {
                        var _a;
                        let result = JSON.parse(data.toString());
                        let files = [];
                        // get all the letters in the alphabet
                        let letters = [];
                        for (let i = 65; i < 91; i++) {
                            letters.push(String.fromCharCode(i));
                        }
                        let builtinsymbols = result.builtins.map((symbol) => {
                            let item = new vscode.TreeItem(symbol.name);
                            item.tooltip = symbol.definition;
                            let e = vscode.window.activeTextEditor;
                            item.command = { command: 'wolfram.stringHelp', arguments: [
                                    symbol.name
                                ], title: 'Open' };
                            //item.command = {command: 'editor.action.addCommentLine', arguments: [], title: 'Add Comment'};
                            return item;
                        });
                        if (((_a = this.builtins.children) === null || _a === void 0 ? void 0 : _a.length) === 0) {
                            this.builtins = new TreeItem("Builtins", letters.map((letter) => {
                                return new TreeItem(letter, builtinsymbols.filter((item) => { var _a; return (_a = item.label) === null || _a === void 0 ? void 0 : _a.toString().startsWith(letter); }));
                            }));
                        }
                        this.data = [this.builtins];
                        this._onDidChangeTreeData.fire();
                    });
                });
            });
        });
    }
    getSymbols() {
        return __awaiter(this, void 0, void 0, function* () {
            clients_1.wolframKernelClient === null || clients_1.wolframKernelClient === void 0 ? void 0 : clients_1.wolframKernelClient.onReady().then(() => {
                clients_1.wolframKernelClient === null || clients_1.wolframKernelClient === void 0 ? void 0 : clients_1.wolframKernelClient.sendRequest("symbolList").then((file) => {
                    fs.readFile(file, 'utf8', (err, data) => {
                        let result = JSON.parse(data.toString());
                        let files = [];
                        let workspace_items = result.workspace.map((symbol) => {
                            let item;
                            if (symbol.children && symbol.children.length > 0) {
                                item = new TreeItem(symbol.name, []);
                            }
                            else {
                                item = new TreeItem(symbol.name);
                            }
                            item.tooltip = symbol.definition;
                            if ('range' in symbol.location) {
                                item.location = symbol.location.uri.split("/").pop().split("%")[0];
                                if (!files.some(f => f === item.location)) {
                                    files.push(item.location);
                                }
                                item.command = { command: 'editor.action.goToLocations', arguments: [
                                        vscode.Uri.parse(symbol.location.uri),
                                        new vscode.Position(symbol.location.range.start.line, symbol.location.range.start.character),
                                        [],
                                        "peek",
                                        symbol.name
                                    ], title: 'Go to' };
                            }
                            //item.command = {command: 'editor.action.addCommentLine', arguments: [], title: 'Add Comment'};
                            function symbolToTreeItem(symbol) {
                                if (symbol.children && symbol.children.length > 0) {
                                    return symbol.children.map((child) => {
                                        return new TreeItem(child.name, symbolToTreeItem(child));
                                    });
                                }
                                else {
                                    return undefined;
                                }
                            }
                            item.children = symbolToTreeItem(symbol);
                            // if (symbol.children && symbol.children.length > 0) {
                            //     symbol.children.forEach((child:any) => {
                            //         let leaf:TreeItem = new TreeItem(child.name)
                            //         leaf.tooltip = child.definition;
                            //         leaf.children = symbolToTreeItem(child)
                            //         item.children?.push(leaf);
                            //     })
                            // }
                            return item;
                        });
                        let workspace = new TreeItem("Workspace", files.map((file) => {
                            return new TreeItem(file, workspace_items.filter((item) => item.location === file));
                        }));
                        workspace.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                        if (this.data.length === 1) {
                            this.data.push(workspace);
                        }
                        else {
                            this.data.pop();
                            this.data.push(workspace);
                        }
                        this._onDidChangeTreeData.fire();
                    });
                });
            });
        });
    }
    refresh() {
        this.getSymbols();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element === undefined) {
            return this.data;
        }
        return element.children;
    }
}
exports.workspaceSymbolProvider = workspaceSymbolProvider;
//# sourceMappingURL=treeDataProvider.js.map