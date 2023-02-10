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

export class InteractiveNotebook {
    public mapping: Map<number, any> = new Map();
    private wolframKernel:BaseLanguageClient;
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
        private _wolframKernel:BaseLanguageClient) {

            // this.uri = uri;
            this.fileName = fileName;
            this.viewType = viewType;
            this.isDirty = isDirty;
            this.isUntitled = isUntitled;
            this.cells = cells;
            this.languages = languages;
            // this.metadata = metadata;
            this.wolframKernel = _wolframKernel;
    }

    public setWolframClient(_wolframKernel:BaseLanguageClient) {
        this.wolframKernel = _wolframKernel
    }

}


export function deactivate() {}