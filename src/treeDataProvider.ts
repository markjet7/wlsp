import * as vscode from 'vscode';
import * as fs from 'fs';
import {wolframClient, wolframKernelClient} from './clients'



class TreeItem extends vscode.TreeItem {
    children: TreeItem[]|undefined;
    location: string;

    constructor(label:string, children?:TreeItem[]) {
        super(label, children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
        this.children = children;
        this.location = "";
    }
}

export class workspaceSymbolProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;
    private builtins: TreeItem;

    data: TreeItem[] = [new TreeItem("Symbols", [])];

    constructor() {
        this.getBuiltins();
        this.getSymbols();
        this.builtins = new TreeItem("Builtins", []);
	}

    async getBuiltins() {
        wolframClient.onReady().then(() => {
            wolframClient.sendRequest("builtInList").then((file:any) => {
        
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
        });
    }

    async getSymbols() {
        wolframKernelClient.onReady().then(() => {
            wolframKernelClient.sendRequest("symbolList").then((file:any) => {
        
            fs.readFile(file, 'utf8', (err:any, data:string) => {
                let result  = JSON.parse(data.toString());
                let files:string[] = [];
                let workspace_items:TreeItem[] =  result.workspace.map((symbol:any) => {
                    let item:TreeItem;
                    if (symbol.children && symbol.children.length > 0) {
                        item = new TreeItem(symbol.name, []);
                    }
                    else {
                        item = new TreeItem(symbol.name);
                    }
                    item.tooltip = symbol.definition;
                    if ('range' in symbol.location) {
    
                        item.location= symbol.location.uri.split("/").pop().split("%")[0];
                        if (!files.some(f => f === item.location)) {
                            files.push(item.location);
                        }
                        
                        item.command = {command: 'editor.action.goToLocations', arguments: [
                            vscode.Uri.parse(symbol.location.uri), 
                            new vscode.Position(symbol.location.range.start.line, symbol.location.range.start.character), 
                            [], 
                            "peek", 
                            symbol.name], title: 'Go to'};
                    } 
                    //item.command = {command: 'editor.action.addCommentLine', arguments: [], title: 'Add Comment'};

                    function symbolToTreeItem(symbol:any):TreeItem[]|undefined {
                        if (symbol.children && symbol.children.length > 0) {
                            return symbol.children.map((child:any) => {
                                return new TreeItem(child.name, symbolToTreeItem(child));
                                })
                        } else {
                            return undefined
                        }
                    }
                    
                    item.children = symbolToTreeItem(symbol);

                    // if (symbol.children && symbol.children.length > 0) {
                    //     symbol.children.forEach((child:any) => {
                    //         let leaf:TreeItem = new TreeItem(child.name)
                    //         leaf.tooltip = child.definition;
                    //         leaf.children = symbolToTreeItem(child)
                    //         item.children?.push(leaf);
                    //     })
                    // }

                    return item
                });
    
    
                let workspace = new TreeItem("Workspace", 
                    files.map((file:string) => {
                        return new TreeItem(file, workspace_items.filter((item:TreeItem) => item.location === file));
                    })
                );
                workspace.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;

                if (this.data.length === 1) {
                    this.data.push(workspace);
                } else {
                    this.data.pop()
                    this.data.push(workspace);
                }
                
                this._onDidChangeTreeData.fire();
                });
            })
        });
    }

    refresh(): void {
        this.getSymbols();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

    getChildren(element?: TreeItem): TreeItem[] |undefined {
        if (element === undefined) {
            return this.data;
        }
        return element.children;
        

    }    
}