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
    cell_type: string;
}

// export function activate(context: vscode.ExtensionContext) {
//     context.subscriptions.push(
//       vscode.workspace.registerNotebookSerializer('wolfram-notebook', new WolframNotebookSerializer())
//   );
// } todo: add this back in when we have a way to activate the extension

export class WolframNotebookSerializer implements vscode.NotebookSerializer {

  async deserializeNotebook(
    content: Uint8Array,
    _token: vscode.CancellationToken
  ): Promise<vscode.NotebookData> {
    return new Promise((resolve, reject) => {
      try{

        var contents = new TextDecoder().decode(content);
        // deserialize jupyter notebook
        let raw: any;
        try {
          raw = JSON.parse(contents);
        } catch {
          raw = [];
        }
  
        const cells = raw.cells.map(
          (item:any)=> {
            let cell:vscode.NotebookCellData;
            if (item.cell_type === "code") {
              item.kind = vscode.NotebookCellKind.Code;
              cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, item.source.join(""), raw.metadata.kernelspec.language)
            } else {
              item.kind = vscode.NotebookCellKind.Markup;
              cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, item.source.join(""), "markdown")
            }
            // cell.outputs = item.outputs
            cell.metadata = item.metadata
            cell.outputs =  item.outputs.map((o:any)=>{ return new vscode.NotebookCellOutput(
                Object.keys(o["data"]).map((k:any)=>{
                  switch (k) {
                    case "text/plain":
                      return vscode.NotebookCellOutputItem.text(o["data"][k].join(""), 'text/plain')
                    case "image/png":
                      return new vscode.NotebookCellOutputItem(Buffer.from(o["data"][k], 'base64'), 'image/png')
                    case "image/jpeg":
                      return new vscode.NotebookCellOutputItem(Buffer.from(o["data"][k], 'base64'), 'image/jpeg')
                    default:
                      return vscode.NotebookCellOutputItem.text("Output parsing error", 'text/plain')
                  }    
                })
              )
            })
  
            return cell
          }
        );
    
        return resolve(new vscode.NotebookData(cells));
      } catch {
        return resolve(new vscode.NotebookData([]));
      }

    })
  }


  async serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
  ): Promise<Uint8Array> {
    let contents: any[] = [];

    for (const cell of data.cells) {
      let kind:string;
       switch (cell.kind) {
        case 2:
          kind = "code"
          break;
        default:
          kind = "markdown"
      }
      contents.push({
        cell_type: kind,
        language: cell.languageId,
        source: cell.value.split("\\n"),
        execution_count: null,
        "metadata": {},
        outputs: cell.outputs?.map((o:vscode.NotebookCellOutput)=>{ 
          let out:any;
          if (o.items[0].mime === "text/plain") {
            out = [(o.items[0].data as Buffer).toString('utf8')]
          }else {
              out = (o.items[0].data as Buffer).toString('base64')
          };
          return {
            "data":  {
                [o.items[0].mime.toString()]: out
            }
          }
        })
        // ,
        // metadata: Object.values((cell as any).metadata).join(""),
        // outputs: cell.outputs
      });
    }

    let nb:any = {};
    nb.cells = contents;
    nb.metadata = {
      "kernelspec": {
        "display_name": "Wolfram Language",
        "language": "wolfram",
        "name": "wolfram"
      },
      "language_info": {
        "codemirror_mode": {
          "name": "ipython",
          "version": "4.0.0"
        }
      },
      "file_extension": ".wl",
      "mimetype": "text/x-wolfram",
      "name": "Wolfram Language",
      "nbformat": 4,
      "nbconvert_exporter": "python",
      "pygments_lexer": "ipython4",
      "version": "4.0.0"
    }
    nb.nbformat = 4;
    nb.nbformat_minor = 0;
    nb.vscode = {
      "interpreter": {
        "hash": ""
      }
    }


    return new TextEncoder().encode(JSON.stringify(nb));
}


  
}


export function deactivate() {}