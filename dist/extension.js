"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = exports.outputChannel = void 0;
const vscode = require("vscode");
const path = require("path");
const fp = require('find-free-port');
const psTree = require('ps-tree');
const fs = require('fs');
exports.outputChannel = vscode.window.createOutputChannel('wolf-lsp');
let context;
const clients_1 = require("./clients");
const launch_1 = require("./launch");
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
    let lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
    let kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));
    (0, clients_1.startLanguageServer)(context, exports.outputChannel);
    vscode.workspace.onWillSaveTextDocument(willsaveDocument);
}
exports.activate = activate;
function willsaveDocument(event) {
    if (event.document.fileName.endsWith(".nb")) {
    }
}
function deactivate() {
    (0, launch_1.stop)();
    console.log("deactivate");
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map