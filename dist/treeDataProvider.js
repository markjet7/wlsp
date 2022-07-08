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
        this.lazyload = "";
    }
}
class workspaceSymbolProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.workspace_items = {};
        this.data = [new TreeItem("Symbols", [])];
        this.cancelChildrenToken = undefined;
        this.getBuiltins();
        this.builtins = new TreeItem("Builtins", []);
        this.cancelChildrenToken = undefined;
    }
    getBuiltins() {
        return __awaiter(this, void 0, void 0, function* () {
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
    }
    getSymbols(file) {
        return __awaiter(this, void 0, void 0, function* () {
            fs.readFile(file, 'utf8', (err, data) => {
                function symbolToTreeItem(symbol) {
                    var _a, _b;
                    let item = new TreeItem((_a = symbol.name) === null || _a === void 0 ? void 0 : _a.slice(0, 8192), []);
                    item.tooltip = (_b = symbol.definition) === null || _b === void 0 ? void 0 : _b.slice(0, 8192);
                    item.children = symbol.children;
                    item.lazyload = symbol.lazyload;
                    item.location = symbol.location;
                    item.resourceUri = vscode.Uri.parse(symbol.location["uri"]);
                    item.iconPath = new vscode.ThemeIcon(symbol.icon);
                    item.command = { command: 'vscode.open', arguments: [vscode.Uri.parse(symbol.location["uri"])], title: 'Open' };
                    return item;
                    // if (symbol.children && symbol.children.length > 0) {
                    //     item.children = symbol.children.map((child:any) => {
                    //         return symbolToTreeItem(child);
                    //     })
                    //     return item 
                    // } else {
                    //     item.collapsibleState = vscode.TreeItemCollapsibleState.None;
                    //     return item
                    // }
                }
                let result = JSON.parse(data.toString());
                this.workspace_items = {};
                result.forEach((symbol) => {
                    let item = symbolToTreeItem(symbol);
                    this.workspace_items[symbol.name] = item;
                });
                let newItems = new TreeItem("Symbols", []);
                newItems.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                Object.keys(this.workspace_items).forEach((key) => {
                    var _a;
                    (_a = newItems.children) === null || _a === void 0 ? void 0 : _a.push(this.workspace_items[key]);
                });
                this.data = [this.builtins, newItems];
                this._onDidChangeTreeData.fire();
            });
        });
    }
    refresh() {
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        return __awaiter(this, void 0, void 0, function* () {
            if (element === undefined) {
                return this.data;
            }
            if (element.lazyload === "") {
                return element.children;
            }
            else {
                return new Promise((resolve, reject) => {
                    let tokenSource = new vscode.CancellationTokenSource();
                    this.cancelChildrenToken = tokenSource.token;
                    setTimeout(() => {
                        var _a;
                        if (!((_a = this.cancelChildrenToken) === null || _a === void 0 ? void 0 : _a.isCancellationRequested)) {
                            tokenSource.cancel();
                            resolve([]);
                            return;
                        }
                    }, 10000);
                    clients_1.wolframKernelClient === null || clients_1.wolframKernelClient === void 0 ? void 0 : clients_1.wolframKernelClient.sendRequest("getChildren", element.lazyload).then((file) => {
                        var _a;
                        if ((_a = this.cancelChildrenToken) === null || _a === void 0 ? void 0 : _a.isCancellationRequested) {
                            return [];
                        }
                        else {
                            let children = [];
                            let result = JSON.parse(fs.readFileSync(file, 'utf8'));
                            children = result.map((item) => {
                                let newItem = new TreeItem(item.name, []);
                                newItem.tooltip = item.definition;
                                newItem.lazyload = item.lazyload;
                                newItem.iconPath = new vscode.ThemeIcon(item.icon);
                                newItem.collapsibleState = item.collapsibleState;
                                if (Object.keys(item).includes("location") && Object.keys(item.location).includes("uri")) {
                                    newItem.resourceUri = vscode.Uri.parse(item.location["uri"]);
                                    newItem.command = { command: 'vscode.open', arguments: [vscode.Uri.parse(item.location["uri"]), {
                                                preview: false,
                                                preserveFocus: false,
                                                selection: item.location.range
                                            }], title: 'Open' };
                                    vscode.window.showTextDocument(vscode.Uri.parse(item.location["uri"]), { preview: true });
                                }
                                return newItem;
                            });
                            tokenSource.dispose();
                            element.children = children;
                            // return [new TreeItem("Testing", [])]; 
                            resolve(children);
                            // return children
                        }
                    });
                });
            }
        });
    }
}
exports.workspaceSymbolProvider = workspaceSymbolProvider;
//# sourceMappingURL=treeDataProvider.js.map