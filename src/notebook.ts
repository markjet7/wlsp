import * as vscode from 'vscode';
import { Buffer } from 'buffer';

const WOLFRAM_LANGUAGE_ID = 'wolfram';
const MARKDOWN_LANGUAGE_ID = 'markdown';
const CELL_DELIMITER = /\n{3,}/;

const normalizeLineEndings = (text: string): string => text.replace(/\r\n/g, '\n');

const splitIntoSegments = (text: string): string[] => {
    const normalized = normalizeLineEndings(text);
    if (!normalized.trim()) {
        return [];
    }

    return normalized
        .split(CELL_DELIMITER)
        .map((segment) => segment.replace(/^\n+/, ''))
        .filter((segment) => segment.length > 0);
};

const emptyCodeCell = (): vscode.NotebookCellData => {
    const cell = new vscode.NotebookCellData(
        vscode.NotebookCellKind.Code,
        '',
        WOLFRAM_LANGUAGE_ID,
    );
    cell.metadata = { kind: 'code' };
    return cell;
};

const isMarkdownComment = (segment: string): boolean => {
    const trimmed = segment.trim();
    return trimmed.startsWith('(*') && trimmed.endsWith('*)');
};

const unwrapMarkdownComment = (segment: string): string => {
    const trimmed = segment.trim();
    if (trimmed.length <= 4) {
        return '';
    }
    return trimmed.slice(2, trimmed.length - 2).trim();
};

const wrapMarkdownComment = (text: string): string => {
    const normalized = normalizeLineEndings(text).trim();
    if (!normalized) {
        return '(* *)';
    }

    if (normalized.includes('\n')) {
        return `(*\n${normalized}\n*)`;
    }

    return `(* ${normalized} *)`;
};

const toNotebookCell = (segment: string): vscode.NotebookCellData => {
    const normalized = normalizeLineEndings(segment);

    if (isMarkdownComment(normalized)) {
        const markdown = unwrapMarkdownComment(normalized);
        const cell = new vscode.NotebookCellData(
            vscode.NotebookCellKind.Markup,
            markdown,
            MARKDOWN_LANGUAGE_ID,
        );
        cell.metadata = { kind: 'markdown' };
        return cell;
    }

    const code = normalized.replace(/^\n+/, '');
    const cell = new vscode.NotebookCellData(
        vscode.NotebookCellKind.Code,
        code,
        WOLFRAM_LANGUAGE_ID,
    );
    cell.metadata = { kind: 'code' };
    return cell;
};

const stringifyCells = (cells: readonly vscode.NotebookCellData[]): string =>
    cells
        .map((cell) => {
            const content = normalizeLineEndings(cell.value);
            if (cell.kind === vscode.NotebookCellKind.Markup) {
                return wrapMarkdownComment(content);
            }
            return content;
        })
        .join('\n\n\n');

class TextNotebookSerializer implements vscode.NotebookSerializer {
    async deserializeNotebook(content: Uint8Array): Promise<vscode.NotebookData> {
        const text = Buffer.from(content).toString('utf8');
        const segments = splitIntoSegments(text);
        const cells = segments.length > 0 ? segments.map(toNotebookCell) : [emptyCodeCell()];
        return new vscode.NotebookData(cells);
    }

    async serializeNotebook(data: vscode.NotebookData): Promise<Uint8Array> {
        const text = stringifyCells(data.cells);
        return Buffer.from(text, 'utf8');
    }
}

export class WolframScriptSerializer extends TextNotebookSerializer {}

export class WolframNotebookSerializer extends TextNotebookSerializer {}

export function deactivate() {}
