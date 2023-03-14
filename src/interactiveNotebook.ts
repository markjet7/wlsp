import { rejects, throws } from 'assert';
import { Runnable } from 'mocha';
import { rawListeners } from 'process';
import * as vscode from 'vscode';
import { 
	BaseLanguageClient,
	LanguageClientOptions} from 'vscode-languageclient';
import { wolframClient } from './clients';

export interface RawNotebookCell {
    indentation?: string;
    metadata?:any;
	language: string;
	value: string;
    kind: vscode.NotebookCellKind;
}

export class InteractiveNotebookSerializer implements vscode.NotebookSerializer {
    private raw: RawNotebookCell[] = [];
    private cells: vscode.NotebookCell[] = [];

    async deserializeNotebook(content: unknown, token: unknown): Promise<vscode.NotebookData> {
        return new Promise((resolve, reject) => {
            resolve(new vscode.NotebookData([]))
        })
        
    }

    async serializeNotebook(data: vscode.NotebookData, token: unknown): Promise<Uint8Array> {
        let contents: any[] = [];
        return Buffer.from(JSON.stringify(contents));
    }

    getCells(item:any) {
        if(item.constructor.name === "Array"){
          item.map(
            (item:any) => this.getCells(item)
          );
        } else {
          this.raw.push({
            kind: item.kind,
            language: item.languageId,
            value: item.value,
            metadata: item.metadata
          })
        }
    }
}

export class InteractiveNotebook implements vscode.NotebookDocument {
    public mapping: Map<number, any> = new Map();
    private wolframKernel:BaseLanguageClient|undefined;
    public version = 0;
    public contentOptions = {
        transientOutputs: true,
        transientMetadata: {}
    }


    constructor(
        public uri:vscode.Uri,
        public fileName:string,
        public viewType:string,
        public isDirty:boolean,
        public isUntitled:boolean,
        public cells: readonly any[],
        public languages: string[],
        // public metadata: vscode.NotebookDocumentMetadata,
        private _wolframKernel:BaseLanguageClient | undefined) {

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

            this.notebookType = "wolfram-interactive"
            this.isClosed = false;
            this.metadata = {};

            this.cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    "1+1",
                    "wolfram"
                )
            ]

            this.cellCount = cells.length;
    }
    notebookType: string;
    isClosed: boolean;
    metadata: { [key: string]: any; };
    cellCount: number;
    cellAt(index: number): vscode.NotebookCell;
    cellAt(index: number): vscode.NotebookCell;
    cellAt(index: unknown): vscode.NotebookCell {
        throw new Error('Method not implemented.');
    }
    getCells(range?: vscode.NotebookRange | undefined): vscode.NotebookCell[];
    getCells(range?: vscode.NotebookRange | undefined): vscode.NotebookCell[];
    getCells(range?: unknown): vscode.NotebookCell[] {
        throw new Error('Method not implemented.');
    }
    save(): Thenable<boolean>;
    save(): Thenable<boolean>;
    save(): Thenable<boolean> {
        throw new Error('Method not implemented.');
    }

    public setWolframClient(_wolframKernel:BaseLanguageClient) {
        this.wolframKernel = _wolframKernel
    }

}


export function deactivate() {}