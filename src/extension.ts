import * as vscode from 'vscode';
import * as path from 'path';
import * as net from 'net';
import * as opn from "open";
const fp = require('find-free-port');
const psTree = require('ps-tree');
import * as cp from 'child_process';
import { 
	LanguageClient,
	LanguageClientOptions,
    NotificationType,
	ServerOptions,
	TransportKind } from 'vscode-languageclient';
import { EEXIST } from 'constants';
const fs = require('fs')

let outputChannel = vscode.window.createOutputChannel('wolf-lsp');
let context:vscode.ExtensionContext;

import {startLanguageServer, stop} from './clients'
import { kill } from 'process';
// let kernelStatusBar:vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

// function retry(fn:any, retries=5, err=null) {
//     if (!retries) {
//         return Promise.reject(err);
//     }
//     return fn().catch((err:any) => {
//         return retry(fn, (retries - 1), err);
//     });
// }

export function activate(context0: vscode.ExtensionContext){
    context = context0;
    let lspPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-lsp.wl'));
    let kernelPath = context.asAbsolutePath(path.join('wolfram', 'wolfram-kernel.wl'));

    startLanguageServer(context, outputChannel)
    vscode.workspace.onWillSaveTextDocument(willsaveDocument) 

}


function willsaveDocument(event:vscode.TextDocumentWillSaveEvent) {
    if(event.document.fileName.endsWith(".nb")) {
        
    }
}

export function deactivate() {
    console.log("deactivate");
    stop()// if (kernelStatusBar) {
}

















