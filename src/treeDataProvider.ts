    import * as vscode from 'vscode';
import * as fs from 'fs';
import {wolframClient, wolframKernelClient} from './clients'
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

export class workspaceSymbolProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;
    private builtins: TreeItem;
    public workspace_items:any = {};

    data: TreeItem[] = [new TreeItem("Symbols", [])];
    cancelChildrenToken: vscode.CancellationToken | undefined = undefined;

    constructor() {
        this.getBuiltins();
        this.builtins = new TreeItem("Builtins", []);
        this.cancelChildrenToken = undefined;
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
            
                if (this.builtins.children?.length === 0){
                    this.builtins = new TreeItem("Builtins",
                        letters.map((letter:string) => {
                            return new TreeItem(letter, builtinsymbols.filter((item:TreeItem) => item.label?.toString().startsWith(letter)));})
                        );
                    }
                this.data = [this.builtins];
                this._onDidChangeTreeData.fire();
                });
            })
    }

    async getSymbols(file:string) {
        fs.readFile(file, 'utf8', (err:any, data:string) => {
            function symbolToTreeItem(symbol:any):TreeItem|undefined {
                let item = new TreeItem(symbol.name?.slice(0, 8192), []);
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
            this.workspace_items = {};

            result.forEach((symbol:any) => {
                let item:TreeItem|undefined = symbolToTreeItem(symbol)

                this.workspace_items[symbol.name] = item;
            })
            
            let newItems:TreeItem = new TreeItem("Symbols", []);
            newItems.collapsibleState =  vscode.TreeItemCollapsibleState.Expanded;
            Object.keys(this.workspace_items).forEach((key:string) => { 
                newItems.children?.push(this.workspace_items[key]);
            })
            this.data = [this.builtins, newItems]
            this._onDidChangeTreeData.fire();
        })
    }

    refresh(): void {
        
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

    async getChildren(element?: TreeItem): Promise<TreeItem[] | undefined> {
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
                }, 10000)

                wolframKernelClient?.sendRequest("getChildren", element.lazyload).then((file:any) => {
                    if (this.cancelChildrenToken?.isCancellationRequested) {
                        return [];
                    } else {
                        let children:TreeItem[] = [];
                            let result  = JSON.parse(fs.readFileSync(file, 'utf8'));
                            children = result.map( (item:any) => {
                                let newItem = new TreeItem(item.name, []);
                                newItem.tooltip = item.definition;
                                newItem.lazyload = item.lazyload;
                                newItem.iconPath = new vscode.ThemeIcon(item.icon);
                                newItem.collapsibleState = item.collapsibleState;
                                newItem.resourceUri = vscode.Uri.parse(item.location["uri'"])
                                newItem.command = {command: 'vscode.open', arguments: [vscode.Uri.parse(item.location["uri"]),{
                                    preview: false,
                                    preserveFocus: false,
                                    selection: item.location.range
                                }], title: 'Open'};
                                
                                vscode.window.showTextDocument(vscode.Uri.parse(item.location["uri"]), {preview: true});

                                return newItem
                            });
                            tokenSource.dispose();
                            element.children = children
                            // return [new TreeItem("Testing", [])]; 
                            resolve(children);
                        // return children
                    }
                })
            })
        }
    }    
}