    import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {treeDataProvider, wolframClient, wolframKernelClient} from './clients'
import { syncBuiltinESMExports } from 'module';
import { CancellationToken } from 'vscode-jsonrpc';



class TreeItem extends vscode.TreeItem {
    children: TreeItem[]|undefined;
    location: string;
    lazyload: string;

    constructor(label:string, children?:TreeItem[]) {
        super(label, children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
        this.children = children;
        this.location = "";
        this.lazyload = "";
    }
}

let workspace_items:any = {};
let builtins: TreeItem ;
let workspace: TreeItem;
export class workspaceSymbolProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    data: TreeItem[] = [new TreeItem("Symbols", [])];
    cancelChildrenToken: vscode.CancellationToken | undefined = undefined;

    constructor() {
        builtins = new TreeItem("Builtins", []);
        workspace = new TreeItem("Workspace", []);
        // this.getBuiltins();
        // this.getSymbols([]);
        // this.builtins new TreeItem("Builtins", []);
        // this.cancelChildrenToken = undefined;
	}

    

    async getBuiltins() {
        wolframClient?.sendRequest("builtInList").then((file:any) => {
        
            fs.readFile(file, 'utf8', (err:any, data:string) => {
                let result  = JSON.parse(data.toString());
                let files:string[] = [];
    
                // get all the letters in the alphabet
                let letters:string[] = [];
                for (let i = 65; i < 91; i++) {
                    letters.push(String.fromCharCode(i));
                }
    
                let builtinsymbols = result.builtins.map((symbol:any) => 
                {
                    let item = new vscode.TreeItem(symbol.name);
                    item.tooltip = symbol.definition;
                    let e = vscode.window.activeTextEditor;
                    item.command = {command: 'wolfram.stringHelp', arguments: [
                        symbol.name], title: 'Open'};
                    
                    //item.command = {command: 'editor.action.addCommentLine', arguments: [], title: 'Add Comment'};
    
                    return item
                })
            
                if (builtins.children?.length === 0){
                    builtins = new TreeItem("Builtins",
                        letters.map((letter:string) => {
                            return new TreeItem(letter, builtinsymbols.filter((item:TreeItem) => item.label?.toString().startsWith(letter)));})
                        );
                    }
                this.data = [builtins, workspace];
                this._onDidChangeTreeData.fire();
                });
            })
    }

    async getSymbols(symbols:TreeItem[]|undefined) {
        if (workspace.children?.length===0) {

            function getFolderFiles(folder:string) {
                let files = fs.readdirSync(folder, {withFileTypes: true});
                files.forEach((file:fs.Dirent) => {
                    if(path.extname(file.name) == ".wl") { 
                        let item = new TreeItem(path.basename(file.name), []);
                        item.tooltip = file.name
                        item.children = [];
                        item.lazyload = "getFileSymbols[\"" + folder + "/" + file.name + "\", \"" + vscode.Uri.parse(file.name) + "\"]";
                        item.location = file.name;
                        item.resourceUri = vscode.Uri.parse(file.name);
                        item.iconPath = new vscode.ThemeIcon("file-code"); 
                        item.command = {command: 'vscode.open', arguments: [vscode.Uri.parse(file.name)], title: 'Open'}
        
                        workspace.children?.push(item) 
                    }

                    if ( file.isDirectory() ) {
                        getFolderFiles(folder + "/" + file.name);
                    }
                })
            }

            let folders = vscode.workspace.workspaceFolders;
            folders?.forEach((folder:vscode.WorkspaceFolder) => {
                getFolderFiles(folder.uri.fsPath);
            })

            workspace.collapsibleState =  vscode.TreeItemCollapsibleState.Expanded;
            // Object.keys(this.workspace_items).forEach((key:string) => { 
            //     newItems.children?.push(this.workspace_items[key]);
            // })
            this.data = [builtins, workspace]
            this._onDidChangeTreeData.fire();
        } 
    }

    refresh(): void {
        // this.getSymbols([]);
        this._onDidChangeTreeData.fire(undefined);
	}

    readSymbolsFile(file:string):TreeItem[] {
        let out:TreeItem[] = []
        fs.readFile(file, 'utf8', (err:any, data:string) => {
            function symbolToTreeItem(symbol:any):TreeItem|undefined {
                let item = new TreeItem(symbol.label?.slice(0, 8192), []);
                item.tooltip = symbol.definition?.slice(0, 8192);
                item.children = symbol.children;
                item.lazyload = symbol.lazyload;
                item.location = symbol.location;
                item.resourceUri = vscode.Uri.parse(symbol.location["uri"]);
                item.iconPath = new vscode.ThemeIcon(symbol.icon); 
                item.command = {command: 'vscode.open', arguments: [vscode.Uri.parse(symbol.location["uri"])], title: 'Open'}
                return item
                // if (symbol.children && symbol.children.length > 0) {
                //     item.children = symbol.children.map((child:any) => {
                //         return symbolToTreeItem(child);
                //     })
                //     return item 
                // } else {
                //     item.collapsibleState = vscode.TreeItemCollapsibleState.None;
                //     return item
                // }
            }

            let result  = JSON.parse(data.toString());
            workspace_items = {};

            let newSymbols:TreeItem[] = result.map((symbol:any) => {
                let item:TreeItem|undefined = symbolToTreeItem(symbol)
                return item
            })
           out = newSymbols;
        })
        return out
    }

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

    async getChildren(element?: TreeItem): Promise<TreeItem[] | undefined> {
        // treeDataProvider.refresh();
        if (element === undefined) {
            return this.data;
        }
        
        if (element.lazyload === "") {
            return element.children
        } else {
            return new Promise((resolve, reject) => {
                let tokenSource = new vscode.CancellationTokenSource();
                this.cancelChildrenToken = tokenSource.token;
                setTimeout(() => {
                    if (!this.cancelChildrenToken?.isCancellationRequested) {
                        tokenSource.cancel();
                        resolve([])
                        return;
                    }
                }, 5000)

                wolframKernelClient?.sendRequest("getChildren", element.lazyload).then((file:any) => {
                    if (this.cancelChildrenToken?.isCancellationRequested) {
                        return [];
                    } else {
                        let children:TreeItem[] = [];
                        let result  = JSON.parse(fs.readFileSync(file, 'ascii'));
                        if (result.length > 0) {
                            children = result.map( (item:any) => {
                                let newItem = new TreeItem(item.label, []);
                                newItem.tooltip = item.definition;
                                newItem.lazyload = item.lazyload;
                                newItem.iconPath = new vscode.ThemeIcon(item.icon);
                                newItem.location = item.location;
                                newItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                                if (Object.keys(item).includes("location") && Object.keys(item.location).includes("uri")) {
    
    
                                    newItem.resourceUri = vscode.Uri.parse(item.location["uri"])
                                    newItem.command = {command: 'vscode.open', arguments: [vscode.Uri.parse(item.location["uri"]),{
                                        preview: false,
                                        preserveFocus: false,
                                        selection: item.location.range
                                    }], title: 'Open'};
                                    
                                    vscode.window.showTextDocument(vscode.Uri.parse(item.location["uri"]), {preview: true});
                                }
                                return newItem
                            });
                            element.children = children
                            tokenSource.dispose();
                            // return [new TreeItem("Testing", [])]; 
                            resolve(children);
                            return
                        }
                        
                        if (typeof(result) === "object") {
                            let newItem = new TreeItem(result.label, []);
                            newItem.tooltip = result.definition;
                            newItem.lazyload = result.lazyload;
                            newItem.iconPath = new vscode.ThemeIcon(result.icon);
                            newItem.location = result.location;
                            newItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

                            if (Object.keys(result).includes("location") && Object.keys(result.location).includes("uri")) {
    
    
                                newItem.resourceUri = vscode.Uri.parse(result.location["uri"])
                                newItem.command = {command: 'vscode.open', arguments: [vscode.Uri.parse(result.location["uri"]),{
                                    preview: false,
                                    preserveFocus: false,
                                    selection: result.location.range
                                }], title: 'Open'};
                                
                                vscode.window.showTextDocument(vscode.Uri.parse(result.location["uri"]), {preview: true});
                            }
                            children = [newItem]
                            element.children = children
                        }else {
                            children = [];
                            element.collapsibleState = vscode.TreeItemCollapsibleState.None;
                        }
                        tokenSource.dispose();
                        // return [new TreeItem("Testing", [])]; 
                        resolve(children);
                        // return children
                    }
                })
            })
        }
    }    
}