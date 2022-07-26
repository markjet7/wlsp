"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const fp = require('find-free-port');
const psTree = require('ps-tree');
const fs = require('fs');
let outputChannel = vscode.window.createOutputChannel('wolf-lsp');
let context;
const clients_1 = require("./clients");
// let kernelStatusBar:vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
// function retry(fn:any, retries=5, err=null) {
//     if (!retries) {
//         return Promise.reject(err);
//     }
//     return fn().catch((err:any) => {
//         return retry(fn, (retries - 1), err);
//     });
// }
function activate(context0) {
    context = context0;
    clients_1.startLanguageServer(context, outputChannel);
    vscode.workspace.onWillSaveTextDocument(willsaveDocument);
}
exports.activate = activate;
function willsaveDocument(event) {
}
function deactivate() {
    console.log("deactivate");
    clients_1.stop(); // if (kernelStatusBar) {
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map