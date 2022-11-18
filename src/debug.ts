import * as vscode from 'vscode';
import { ChildProcess } from 'child_process';
import {
    debug, DebugSession, DebugConfigurationProvider, DebugAdapterDescriptorFactory,
    DebugAdapterDescriptor, DebugAdapterServer, ProviderResult
} from "vscode";
import * as net from 'net';
import * as path from 'path';

import { readFileSync } from 'fs';
import { EventEmitter } from 'events';
const { Subject } = require('await-notify');

import {
	Logger, logger,
	LoggingDebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent,
	Thread, StackFrame, Scope, Source, Handles, Breakpoint
} from 'vscode-debugadapter';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    NotificationType,
    State, 
    StateChangeEvent
} from 'vscode-LanguageClient/node';
import { DebugProtocol } from 'vscode-debugprotocol';
import { CpuInfo } from 'os';

const fp = require('find-free-port');
import * as cp from 'child_process';
import { Server } from 'http';
import { debugPort } from 'process';
import { time } from 'console';
const psTree = require('ps-tree');

let port:number = 7777;
let debugClient:LanguageClient;


export class WolframDebugConfigProvider implements DebugConfigurationProvider { }

export class WolframDebugAdapterDescriptorFactory implements DebugAdapterDescriptorFactory {

    port: number;
    wolfram: ChildProcess | undefined;
    context: vscode.ExtensionContext;
    outputChannel: vscode.OutputChannel;

    constructor(port: number, context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
        this.port = port;
        this.context = context;
        this.outputChannel = outputChannel;
        console.log("WolframDebugAdapterDescriptorFactory");
    }

    createDebugAdapterDescriptor(_session: DebugSession, _executable:
        undefined): ProviderResult<DebugAdapterDescriptor> {
        return this.loadWLSPDebugger().then(() => {
            console.log("createDebugAdapterDescriptor");
            return new DebugAdapterServer(this.port);
        });
    }

    loadWLSPDebugger():Promise<void> {
        return new Promise((resolve, reject) => {
            console.log("loadWLSPDebugger");
            let executablePath:string = vscode.workspace.getConfiguration('wolfram').get('executablePath') || "wolframscript";
            let debugpath:string = this.context.asAbsolutePath(path.join('wolfram', 'wolfram-debug.wl'));
            if (process.platform === "win32") {
                this.wolfram = cp.spawn('cmd.exe', ['/c', executablePath?.toString(), '-file', debugpath, this.port.toString(), debugpath], { detached: false });
            } else {
                this.wolfram = cp.spawn(executablePath?.toString(), ['-file', debugpath, this.port.toString(), debugpath], { detached: true });
            }

            this.wolfram.on('SIGPIPE', (data) => {
                console.log("SIGPIPE");
            });


            this.wolfram.stdout?.on('error', (data) => {
                console.log("STDOUT Error" + data.toString());
            });

            this.wolfram.stdout?.once('data', (data) => {
                resolve()
                this.outputChannel.appendLine("WLSP: " + data.toString())
            });  

            this.wolfram.stdout?.on('data', (data) => {
                this.outputChannel.appendLine("WLSP: " + data.toString())
            });      

        })
        

    }

    dispose() {
        if (this.wolfram) {
            this.wolfram.kill();
        }
    }

}