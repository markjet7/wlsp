import { throws } from 'assert';
import { meta } from 'eslint/lib/rules/*';
import { Runnable } from 'mocha';
import * as vscode from 'vscode';
import { 
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind } from 'vscode-languageclient';

export interface RawNotebookCell {
    indentation?: string;
    metadata:any;
	language: string;
	source: string;
	cell_type: 'text' | 'code';
}

export class WolframNotebook {
    public mapping: Map<number, any> = new Map();
    private wolframClient:LanguageClient;
	private preloadScript = false;
	private displayOrders = [
		'text/html',
		'application/json',
		'application/javascript',
		'application/vnd.*',
		'image/svg+xml',
		'text/markdown',
		'image/svg+xml',
		'image/png',
		'image/jpeg',
		'text/plain'
    ];
    private nextExecutionOrder = 0;
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
        public metadata: vscode.NotebookDocumentMetadata,
        private _wolframClient:LanguageClient) {

            // this.uri = uri;
            this.fileName = fileName;
            this.viewType = viewType;
            this.isDirty = isDirty;
            this.isUntitled = isUntitled;
            this.cells = cells;
            this.languages = languages;
            this.metadata = metadata;
            this.wolframClient = _wolframClient;
    }
    // uri: vscode.Uri;
    // fileName: string;
    // viewType: string;
    // isDirty: boolean;
    // isUntitled: boolean;
    // cells: readonly vscode.NotebookCell[];
    // languages: string[];
    // displayOrder?: vscode.GlobPattern[] | undefined;
    // metadata: vscode.NotebookDocumentMetadata;

    public setWolframClient(_wolframClient:LanguageClient) {
        this.wolframClient = _wolframClient
    }

    async execute(document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined) {
        if (cell) {
            const index = document.getCells().indexOf(cell);
            let source = cell.document.getText();
            let r:vscode.Selection = new vscode.Selection(
                0,
                0,
                0,
                0
            );
            
            if (this.wolframClient){       
                await this.wolframClient.sendRequest("runCell", {range:r, textDocument:document.uri.toString(), print:false, source:source}).then((result:any) => {
                    let c = document.cellAt(index);
                    
                    // c.outputs.concat([
                    //     {

                    //         output_type: 'stream',
                    //         data:{
                    //             "text/html": [
                    //                 "<div style=\"min-height:50px; max-height:300px; overflow:scroll\">" + result.output.toString() + "<\div>"
                    //             ],
                    //             "application/json": {result: result.output.toString()},
                    //             "text/plain": [
                    //                 result.result.toString()
                    //             ],
                    //             'image/png':[
                    //                 result.output.toString()
                    //             ]
                    //         }
                    //     }])
                    })  
                }     else {
                    console.log("Wolfram not connected");
                    vscode.window.showErrorMessage("Wolfram not connected.");
                }
        }
    }

    resolve(): vscode.NotebookData {
        let result = new vscode.NotebookData(
            this.cells.map(((raw_cell:any):vscode.NotebookCellData => {
                let outputs:vscode.NotebookCellOutput[] = [];
                let metadata = {editable:true, runnable:true, cellEditable:true, cellRunnable:true};
                return new vscode.NotebookCellData(raw_cell.cellKind, raw_cell.source, 'wolfram', outputs, raw_cell.metadata || undefined)
 
            }))
        )
        return result;
    }

}

async function timeFn(fn: () => Promise<void>): Promise<number> {
    const startTime = Date.now();
    await fn();
    return Date.now() - startTime;
}

export class WolframProvider implements vscode.NotebookContentProvider {
    public _notebooks: Map<string, WolframNotebook> = new Map();
	onDidChange: vscode.Event<void> = new vscode.EventEmitter<void>().event;
	label: string = 'Wolfram';
    isPreferred: boolean = true;
    private wolframClient:LanguageClient;
    
    constructor(viewType: string, private _extensionPath: string, private fillOutputs: boolean, private _wolframClient:LanguageClient) {

        this.wolframClient = _wolframClient;
		const emitter = new vscode.EventEmitter<void>();
		vscode.notebook.registerNotebookContentProvider(viewType, this);

		setTimeout(() => {
			emitter.fire();
		}, 5000);

    }

    public setWolframClient(_wolframClient:LanguageClient) {
        this.wolframClient = _wolframClient;
        this._notebooks.forEach((n:WolframNotebook, k:string) => {
            n.setWolframClient(_wolframClient);
        })
    }
    
    async openNotebook(uri: vscode.Uri, context:vscode.NotebookDocumentOpenContext): Promise<vscode.NotebookData> {
        let actualUri = context.backupId ? vscode.Uri.parse(context.backupId) : uri; 
        let wolframNotebook: WolframNotebook;
        let source = "";

        try {

            this.wolframClient.sendRequest("openNotebook", {path:actualUri}).then(async (result:any) => {
                source = (await vscode.workspace.fs.readFile(result.result.output)).toString();
            });
            
            
            const metadata:vscode.NotebookDocumentMetadata =  new vscode.NotebookDocumentMetadata() 
            metadata.with({ editable: true, cellEditable: true, cellHasExecutionOrder: true, cellRunnable: true, runnable: true });
                        // {
            //     cells: [{
            //         cell_type: 'markdown',
            //         source: [
            //             '# header'
            //         ]
            //     }]
            // }
            let rawcells:any = [];
            
            // = source.replace(/\r/gm,"\n").split(/\n\n\n\n|(?<=::\s+\*\))\n+/).map((s:any) => {
            //         let trimmed = s.trim();
            //         if (trimmed.substr(0, 3) == "(* " && trimmed.substr(trimmed.length - 3) == " *)"){
            //             return {
            //                 type: 'markdown',
            //                 source: s,
            //                 metadata:{editable:true, runnable:true, cellEditable:true, cellRunnable:true, language_info:'markdown'},
            //                 language:'markdown',
            //                 cellKind: vscode.CellKind.Markdown,
            //                 outputs:[]
            //             }
            //         } else {
            //             return {
            //                     type: 'wolfram',
            //                     source: s,
            //                     metadata:{editable:true, runnable:true, cellEditable:true, cellRunnable:true, language_info:'wolfram'},
            //                     language:'wolfram',
            //                     cellKind: vscode.CellKind.Code,
            //                     outputs:[]
            //                 }}
            //     })
            let languages = ['wolfram']       
        
            wolframNotebook = new WolframNotebook(
                uri,
                uri.fsPath.toString(),
                "wolfram.input",
                false,
                false,
                rawcells,
                languages,
                metadata,
                this.wolframClient
            )

            //let wolframNotebook = new WolframNotebook(this._extensionPath, notebookRaw, true, this.wolframClient);
            
            this._notebooks.set(uri.toString(), wolframNotebook);
            
        return wolframNotebook.resolve();
        } catch (error) {
            console.log(error.message)
            throw new Error("Failed to load the document");
            return wolframNotebook.resolve();
        }
    }

    async executeCell(document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined): Promise<void> {
		if (cell) {
			// cell.metadata.statusMessage = 'Running';
			// cell.metadata.runStartTime = Date.now();
            // cell.metadata.runState = vscode.NotebookCellRunState.Running;
            // cell.outputs = [];
		} else {
            for (let index = 0; index < document.cellCount; index++) {
                this.executeCell(document, document.cellAt(index))
                
            }
        }

		const duration = await timeFn(async () => {
			const wolframNotebook = this._notebooks.get(document.uri.toString());
			if (wolframNotebook) {
				return wolframNotebook.execute(document, cell);
			}
		});

		if (cell) {
			// cell.metadata.lastRunDuration = duration;
			// cell.metadata.statusMessage = 'Success'
			// cell.metadata.runState = vscode.NotebookCellRunState.Success;
		}
    }

    async executeAllCells(document:vscode.NotebookDocument):Promise<void>{
		await this.executeCell(document, undefined);
    }

    async cancelAllCellsExecution(document:vscode.NotebookDocument):Promise<void> {

    }

    async cancelCellExecution(document:vscode.NotebookDocument, cell: vscode.NotebookCell | undefined){
        if(cell) {
            // cell.metadata.statusMessage = "Cancelled";
            // cell.metadata.runState = vscode.NotebookCellRunState.Error;
        }
    }

     // The following are dummy implementations not relevant to this example.
    // onDidChangeNotebook = new vscode.EventEmitter<vscode.NotebookDocumentEditEvent>().event;

	// onDidChangeNotebook: vscode.Event<vscode.NotebookDocumentEditEvent> = this._onDidChangeNotebook.event;

    async resolveNotebook(): Promise<void> { 
        return 
     }
    async saveNotebook(document: vscode.NotebookDocument, cancellation: vscode.CancellationToken): Promise<void> { 
         const stringOutput = document.getCells().map((c:any) => {
            return c.document.getText() +"\n\n\n"
         }).reduce((p, c) => {return p + c}).trim();
         await vscode.workspace.fs.writeFile(document.uri, Buffer.from(stringOutput));
     }
    async saveNotebookAs(targetResource: vscode.Uri, document: vscode.NotebookDocument, cancellation: vscode.CancellationToken): Promise<void> { 
        const stringOutput = document.getCells().map((c:any) => {
           return c.source
        }).reduce((p:any, c:any) => {return p + c});
        await vscode.workspace.fs.writeFile(targetResource, Buffer.from(stringOutput));}
    async backupNotebook(): Promise<vscode.NotebookDocumentBackup> { return { id: '', delete: () => { } };}
}

export function deactivate() {}