"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WolframDebugAdapterDescriptorFactory = exports.WolframDebugConfigProvider = void 0;
const vscode = require("vscode");
const vscode_1 = require("vscode");
const path = require("path");
const { Subject } = require('await-notify');
const fp = require('find-free-port');
const cp = require("child_process");
const psTree = require('ps-tree');
let debugClient;
class WolframDebugConfigProvider {
}
exports.WolframDebugConfigProvider = WolframDebugConfigProvider;
class WolframDebugAdapterDescriptorFactory {
    constructor(port, context, outputChannel) {
        this.port = port;
        this.context = context;
        this.outputChannel = outputChannel;
        console.log("WolframDebugAdapterDescriptorFactory");
    }
    createDebugAdapterDescriptor(_session, _executable) {
        return this.loadWLSPDebugger().then(() => {
            console.log("createDebugAdapterDescriptor");
            return new vscode_1.DebugAdapterServer(this.port);
        });
    }
    loadWLSPDebugger() {
        return new Promise((resolve, reject) => {
            var _a, _b, _c;
            let executablePath = vscode.workspace.getConfiguration('wolfram').get('executablePath') || "wolframscript";
            let debugpath = this.context.asAbsolutePath(path.join('wolfram', 'wolfram-debug.wl'));
            if (process.platform === "win32") {
                this.wolfram = cp.spawn('cmd.exe', ['/c', executablePath === null || executablePath === void 0 ? void 0 : executablePath.toString(), '-file', debugpath, this.port.toString(), debugpath], { detached: false });
            }
            else {
                this.wolfram = cp.spawn(executablePath === null || executablePath === void 0 ? void 0 : executablePath.toString(), ['-file', debugpath, this.port.toString(), debugpath], { detached: true });
            }
            this.wolfram.on('SIGPIPE', (data) => {
                console.log("SIGPIPE");
            });
            (_a = this.wolfram.stdout) === null || _a === void 0 ? void 0 : _a.on('error', (data) => {
                console.log("STDOUT Error" + data.toString());
            });
            (_b = this.wolfram.stdout) === null || _b === void 0 ? void 0 : _b.once('data', (data) => {
                resolve();
                this.outputChannel.appendLine("WLSP: " + data.toString());
            });
            (_c = this.wolfram.stdout) === null || _c === void 0 ? void 0 : _c.on('data', (data) => {
                this.outputChannel.appendLine("WLSP: " + data.toString());
            });
        });
    }
    dispose() {
        if (this.wolfram) {
            this.wolfram.kill();
        }
    }
}
exports.WolframDebugAdapterDescriptorFactory = WolframDebugAdapterDescriptorFactory;
//# sourceMappingURL=debug.js.map