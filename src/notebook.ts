import { rejects, throws } from 'assert';
import { Runnable } from 'mocha';
import { rawListeners } from 'process';
import * as vscode from 'vscode';
import { 
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind } from 'vscode-languageclient';
import { wolframClient } from './clients';



export interface RawNotebookCell {
    indentation?: string;
    metadata?:any;
	  language: string;
	  value: string;
    kind: vscode.NotebookCellKind;
}

// export function activate(context: vscode.ExtensionContext) {
//     context.subscriptions.push(
//       vscode.workspace.registerNotebookSerializer('wolfram-notebook', new WolframNotebookSerializer())
//   );
// }

export class WolframNotebookSerializer implements vscode.NotebookSerializer {

  async deserializeNotebook(
    content: Uint8Array,
    _token: vscode.CancellationToken
  ): Promise<vscode.NotebookData> {
    return new Promise((resolve, reject) => {
      var contents = new TextDecoder().decode(content);


      let x = this.mretry(contents, 1, resolve)
    })
  }

  private raw: vscode.NotebookCellData[] = [];
  private cells: vscode.NotebookCellData[] = [];
  getCells(item:any){
    if(item.constructor.name === "Array"){
      item.map(
        (item:any) => this.getCells(item)
      );
    } else {
      this.raw.push({
        kind: item.kind,
        languageId: item.languageId,
        value: item.value,
        metadata: item.metadata,
        outputs: item.outputs
      })
    }
  } 

  mretry(contents:any, attempts:number, cb:any) {
    setTimeout(() => {
      if (attempts > 20) {
        vscode.window.showErrorMessage("Failed to open notebook.")
        cb(new vscode.NotebookData(this.cells));
        return new vscode.NotebookData(this.cells);
      } 
      if (wolframClient !== undefined) {
        wolframClient.onReady().then(() => {
      
          wolframClient?.sendRequest("deserializeNotebook", {contents: contents}).then((result:any)=>{

            this.raw = [];
            result.map(
              (item:any) => this.getCells(item)
            );
            this.cells = this.raw.map(
              (item:any) => {
              let i = new vscode.NotebookCellData(item.kind, item.value, item.languageId)

              i.metadata = item.metadata;

              let outs = item.outputs.reduce((o:any, c:any) => {
                return {value: o.value?.toString() + "<br>" + c?.value?.toString()}
              }, {value:""}).value

              i.outputs = [
                new vscode.NotebookCellOutput([
                  vscode.NotebookCellOutputItem.text(outs, "text/html")
                ])
              ] 
              
              return i
              }
            );
            cb(new vscode.NotebookData(this.cells));
            return new vscode.NotebookData(this.cells);
          }).then((result:any) => {
            return result
          })
        })
      } else {
        console.log("Waiting for kernel")
        this.mretry(contents, attempts++, cb)
      }
    }, 3000)
  }

  async serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
  ): Promise<Uint8Array> {
    let contents: any[] = [];

    for (const cell of data.cells) {
      contents.push({
        kind: cell.kind,
        language: cell.languageId,
        value: cell.value,
        metadata: Object.values((cell as any).metadata).join(""),
        outputs: cell.outputs
      });
    }

    if (wolframClient) {
      return wolframClient.sendRequest("serializeNotebook", {contents: contents}).then((result:any)=>{
         return Buffer.from(result);
      });
    } else {
      return Buffer.from(JSON.stringify(contents));
    }
  }

  
}

export class WolframScriptSerializer implements vscode.NotebookSerializer {
  private raw: vscode.NotebookCellData[] = [];
  private cells: vscode.NotebookCellData[] = [];

  async deserializeNotebook(
    content: Uint8Array,
    _token: vscode.CancellationToken
  ): Promise<vscode.NotebookData> {
    return new Promise((resolve, reject) => {    
      var contents = new TextDecoder().decode(content);

      let x = this.mretry(contents, 1, resolve) 

    })
  }

  async serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
  ): Promise<Uint8Array> {
    let contents: any[] = [];

    for (const cell of data.cells) {
      contents.push({
        kind: cell.kind,
        language: cell.languageId,
        value: cell.value,
        metadata: Object.values((cell as any).metadata).join(""),
        outputs: "" //cell.outputs
      });
    }

    return new Promise((resolve, reject) => {
      if (wolframClient !== undefined) {
        wolframClient.onReady().then(() => {
        return wolframClient?.sendRequest("serializeScript", {contents: contents}).then((result:any)=>{
          resolve(Buffer.from(result));
        });
      });
    } else {
      let string = "";
      for (const cell of contents) {
        string += cell.value + "\n\n\n";
      }
      resolve(Buffer.from(string));
    }
  })}

  getCells(item:any){
    if(item.constructor.name === "Array"){
      item.map(
        (item:any) => this.getCells(item)
      );
    } else {
      this.raw.push({
        kind: item.kind,
        languageId: item.languageId,
        value: item.value,
        metadata: item.metadata,
        outputs: item.outputs
      })
    }
  }
    
  mretry(contents:any, attempts:number, cb:any) {
    setTimeout(() => {
      if (attempts > 20) {
        vscode.window.showErrorMessage("Failed to open notebook.")
        cb(new vscode.NotebookData(this.cells));
        return new vscode.NotebookData(this.cells);
      } 
      if (wolframClient !== undefined) {
        wolframClient.onReady().then(() => {
      
          wolframClient?.sendRequest("deserializeScript", {contents: contents}).then((result:any)=>{

            this.raw = [];
            result.map(
              (item:any) => this.getCells(item)
            );
            this.cells = this.raw.map(
              (item:any) => {
              try{
                let i = new vscode.NotebookCellData(item.kind, item.value, item.languageId)
  
                i.metadata = item.metadata;
                
                return i
              } catch(e){
                return new vscode.NotebookCellData(1, item ? "" : item.value?.toString() , "markdown")  
              }
              }
            );
            cb(new vscode.NotebookData(this.cells));
            return new vscode.NotebookData(this.cells);
          }).then((result:any) => {
            return result
          })
        })
      } else {
        console.log("Waiting for kernel to deserialize script")
        this.mretry(contents, attempts++, cb)
      }
    }, 3000)
  }

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
        // public metadata: vscode.NotebookDocumentMetadata,
        private _wolframClient:LanguageClient) {

            // this.uri = uri;
            this.fileName = fileName;
            this.viewType = viewType;
            this.isDirty = isDirty;
            this.isUntitled = isUntitled;
            this.cells = cells;
            this.languages = languages;
            // this.metadata = metadata;
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

    // async execute(document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined) {
    //     if (cell) {
    //         const index = document.getCells().indexOf(cell);
    //         let source = cell.document.getText();
    //         let r:vscode.Selection = new vscode.Selection(
    //             0,
    //             0,
    //             0,
    //             0
    //         );
            
    //         if (this.wolframClient){       
    //             await this.wolframClient.sendRequest("runCell", {range:r, textDocument:document.uri.toString(), print:false, source:source}).then((result:any) => {
    //                 let c = document.cellAt(index);
    //                 c.outputs.concat([
    //                     {
    //                             mime: "text/html",
    //                             value: 
    //                                 "<div style=\"min-height:50px; max-height:300px; overflow:scroll\">" + result.output.toString() + "<\div>"
    //                     }]
    //                 )  
    //             }  else {
    //                 console.log("Wolfram not connected");
    //                 vscode.window.showErrorMessage("Wolfram not connected.");
    //             }
    //     }
    // }

    // resolve(): vscode.NotebookData {
    //     let result = {
    //         languages: ['wolfram'],
    //         metadata: {

	// 			editable: this.metadata?.editable === undefined ? true : this.metadata?.editable,
	// 			runnable: this.metadata?.runnable === undefined ? true : this.metadata?.runnable,
	// 			cellEditable: this.metadata?.cellEditable === undefined ? true : this.metadata?.cellEditable,
	// 			cellRunnable: this.metadata?.cellRunnable === undefined ? true : this.metadata?.cellRunnable,
	// 			displayOrder: this.displayOrders
    //         },
    //         cells: this.cells.map(((raw_cell:any):vscode.NotebookCellData => {
    //             let outputs:vscode.NotebookCellOutput[] = [];
    //             let metadata = {editable:true, runnable:true, cellEditable:true, cellRunnable:true};
    //             return {
    //                 kind: raw_cell.cellKind,
    //                 source: raw_cell.source,
    //                 language: raw_cell.language || 'wolfram',
    //                 outputs: outputs,
    //                 // metadata: metadata
    //             }
    //         }))
    //     }

    //     return result;
    // }

}



async function timeFn(fn: () => Promise<void>): Promise<number> {
    const startTime = Date.now();
    await fn();
    return Date.now() - startTime;
}


// export class WolframProvider implements vscode.NotebookContentProvider, vscode.NotebookKernel {
//     private _onDidChangeNotebook = new vscode.EventEmitter<vscode.NotebookDocumentEditEvent>();
// 	public _notebooks: Map<string, WolframNotebook> = new Map();
// 	onDidChange: vscode.Event<void> = new vscode.EventEmitter<void>().event;
// 	label: string = 'Wolfram';
//     isPreferred: boolean = true;
//     private wolframClient:LanguageClient;
    
//     constructor(viewType: string, private _extensionPath: string, private fillOutputs: boolean, private _wolframClient:LanguageClient) {

//         this.wolframClient = _wolframClient;
// 		const emitter = new vscode.EventEmitter<void>();
// 		vscode.notebook.registerNotebookContentProvider({ notebookType: viewType }, {
// 			onDidChangeKernels: undefined,
// 			provideKernels: () => {
// 				return [this];
// 			}
// 		});

// 		setTimeout(() => {
// 			emitter.fire();
// 		}, 5000);

//     }

//     public setWolframClient(_wolframClient:LanguageClient) {
//         this.wolframClient = _wolframClient;
//         this._notebooks.forEach((n:WolframNotebook, k:string) => {
//             n.setWolframClient(_wolframClient);
//         })
//     }
    
//     async openNotebook(uri: vscode.Uri, context:vscode.NotebookDocumentOpenContext): Promise<vscode.NotebookData> {
//         let actualUri = context.backupId ? vscode.Uri.parse(context.backupId) : uri; 

//         try {

//             this.wolframClient.sendRequest("openNotebook", {path:actualUri}).then(async (result:any) => {
//                 let source = (await vscode.workspace.fs.readFile(actualUri)).toString();

            
            
//             // const metadata:vscode.NotebookDocumentMetadata =  { editable: true, cellEditable: true, cellHasExecutionOrder: true, cellRunnable: true, runnable: true };
//                         // {
//             //     cells: [{
//             //         cell_type: 'markdown',
//             //         source: [
//             //             '# header'
//             //         ]
//             //     }]
//             // }
//             let rawcells:any = [];
            
//             // = source.replace(/\r/gm,"\n").split(/\n\n\n\n|(?<=::\s+\*\))\n+/).map((s:any) => {
//             //         let trimmed = s.trim();
//             //         if (trimmed.substr(0, 3) == "(* " && trimmed.substr(trimmed.length - 3) == " *)"){
//             //             return {
//             //                 type: 'markdown',
//             //                 source: s,
//             //                 metadata:{editable:true, runnable:true, cellEditable:true, cellRunnable:true, language_info:'markdown'},
//             //                 language:'markdown',
//             //                 cellKind: vscode.CellKind.Markdown,
//             //                 outputs:[]
//             //             }
//             //         } else {
//             //             return {
//             //                     type: 'wolfram',
//             //                     source: s,
//             //                     metadata:{editable:true, runnable:true, cellEditable:true, cellRunnable:true, language_info:'wolfram'},
//             //                     language:'wolfram',
//             //                     cellKind: vscode.CellKind.Code,
//             //                     outputs:[]
//             //                 }}
//             //     })
//             let languages = ['wolfram']       
        
//             let wolframNotebook = new WolframNotebook(
//                 uri,
//                 uri.fsPath.toString(),
//                 "wolfram.input",
//                 false,
//                 false,
//                 rawcells,
//                 languages,
//                 metadata,
//                 this.wolframClient
//             )

//             //let wolframNotebook = new WolframNotebook(this._extensionPath, notebookRaw, true, this.wolframClient);
            
//             this._notebooks.set(uri.toString(), wolframNotebook);
//             return wolframNotebook.resolve();
//         })
//         } catch (error) {
//             console.log(error.message)
//             throw new Error("Failed to load the document");
//         }
//     }

//     async executeCell(document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined): Promise<void> {
// 		if (cell) {
// 			// cell.metadata.statusMessage = 'Running';
// 			// cell.metadata.runStartTime = Date.now();
//             // cell.metadata.runState = vscode.NotebookCellRunState.Running;
//             // cell.outputs = [];
// 		} else {
//             // document.cells.map((c:any) => {
//             //     this.executeCell(document, c);
//             // })
//         }

// 		const duration = await timeFn(async () => {
// 			const wolframNotebook = this._notebooks.get(document.uri.toString());
// 			if (wolframNotebook) {
// 				return wolframNotebook.execute(document, cell);
// 			}
// 		});

// 		if (cell) {
// 			// cell.metadata.lastRunDuration = duration;
// 			// cell.metadata.statusMessage = 'Success'
// 			// cell.metadata.runState = vscode.NotebookCellRunState.Success;
// 		}
//     }

//     async executeAllCells(document:vscode.NotebookDocument):Promise<void>{
// 		await this.executeCell(document, undefined);
//     }

//     async cancelAllCellsExecution(document:vscode.NotebookDocument):Promise<void> {

//     }

//     async cancelCellExecution(document:vscode.NotebookDocument, cell: vscode.NotebookCell | undefined){
//         if(cell) {
//             // cell.metadata.statusMessage = "Cancelled";
//             // cell.metadata.runState = vscode.NotebookCellRunState.Error;
//         }
//     }

//      // The following are dummy implementations not relevant to this example.
//     // onDidChangeNotebook = new vscode.EventEmitter<vscode.NotebookDocumentEditEvent>().event;

// 	onDidChangeNotebook: vscode.Event<vscode.NotebookDocumentEditEvent> = this._onDidChangeNotebook.event;

//     async resolveNotebook(): Promise<void> { 
//         return 
//      }
//     async saveNotebook(document: vscode.NotebookDocument, cancellation: vscode.CancellationToken): Promise<void> { 
//          const stringOutput = document.cells.map((c:any) => {
//             return c.document.getText() +"\n\n\n"
//          }).reduce((p, c) => {return p + c}).trim();
//          await vscode.workspace.fs.writeFile(document.uri, Buffer.from(stringOutput));
//      }
//     async saveNotebookAs(targetResource: vscode.Uri, document: vscode.NotebookDocument, cancellation: vscode.CancellationToken): Promise<void> { 
//         const stringOutput = document.cells.map((c:any) => {
//            return c.source
//         }).reduce((p, c) => {return p + c});
//         await vscode.workspace.fs.writeFile(targetResource, Buffer.from(stringOutput));}
//     async backupNotebook(): Promise<vscode.NotebookDocumentBackup> { return { id: '', delete: () => { } };}
// }

export function deactivate() {}