import * as vscode from 'vscode';
import { LanguageClient, RequestType } from 'vscode-languageclient/node';

export interface WorkspaceVariable {
    head: string;
    type: string;
    value: string;
    id: number;
    lazy: boolean;
    haschildren: boolean;
    canshow: boolean;
    icon?: string;
}

const requestTypeGetVariables = new RequestType<{ modules?: boolean }, WorkspaceVariable[], void>(
    'wlsp/workspace/getVariables'
);

const requestTypeGetLazy = new RequestType<{ id: number }, WorkspaceVariable[], void>('wlsp/workspace/getLazy');

export class WorkspaceVariablesProvider implements vscode.TreeDataProvider<WorkspaceVariable> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    constructor(private getKernelClient: () => LanguageClient | undefined) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async getChildren(element?: WorkspaceVariable): Promise<WorkspaceVariable[]> {
        const client = this.getKernelClient();
        if (!client) {
            return [];
        }

        try {
            if (!element) {
                return await client.sendRequest(requestTypeGetVariables, { modules: false });
            }

            if (!element.haschildren || !element.lazy) {
                return [];
            }

            return await client.sendRequest(requestTypeGetLazy, { id: element.id });
        } catch (err) {
            vscode.window.showWarningMessage('Unable to load Wolfram variables.');
            return [];
        }
    }

    getTreeItem(element: WorkspaceVariable): vscode.TreeItem {
        const label = element.head;
        const treeItem = new vscode.TreeItem(
            label,
            element.haschildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        treeItem.description = element.value;
        treeItem.tooltip = `${element.type}`;
        if (element.icon) {
            treeItem.iconPath = new vscode.ThemeIcon(element.icon);
        }

        treeItem.contextValue = 'wolframWorkspaceVariable';
        return treeItem;
    }
}
