import * as vscode from 'vscode';
import { parseAstSeq } from './fwlparser/parser';
import { Ast, AstCall, AstMetadata, ParseOptions, ParseOptionsDefault, Span } from './fwlparser/types';

type RangeLike = { start: vscode.Position; end: vscode.Position };

export interface DocumentAnalysis {
    ranges: vscode.Range[];
}

export class ParserService {
    private readonly parseOptions: ParseOptions;
    private readonly documents = new Map<string, DocumentAnalysis>();

    constructor(options: Partial<ParseOptions> = {}) {
        this.parseOptions = { ...ParseOptionsDefault, ...options };
    }

    public async analyzeDocument(document: vscode.TextDocument): Promise<DocumentAnalysis> {
        const text = document.getText();
        const ranges = await this.computeRanges(text);
        const analysis: DocumentAnalysis = { ranges };
        this.documents.set(document.uri.toString(), analysis);
        return analysis;
    }

    public getAnalysis(uri: vscode.Uri): DocumentAnalysis | undefined {
        return this.documents.get(uri.toString());
    }

    private async computeRanges(text: string): Promise<vscode.Range[]> {
        try {
            const result = parseAstSeq(text, this.parseOptions);
            const astList = result.syntax.toArray();
            const spans: Span[] = [];
            for (const ast of astList) {
                this.collectTopLevelSpans(ast, spans);
            }

            const lines = this.splitLines(text);
            const filteredSpans = spans
                .filter((span) => this.hasMeaningfulContent(lines, span))
                .sort((a, b) => {
                    if (a.start.line !== b.start.line) {
                        return a.start.line - b.start.line;
                    }
                    return a.start.column - b.start.column;
                });

            if (filteredSpans.length === 0) {
                return this.createFallbackRanges(text);
            }

            return filteredSpans.map((span) => this.toVsRange(span));
        } catch {
            return this.createFallbackRanges(text);
        }
    }

    private collectTopLevelSpans(node: Ast, spans: Span[]): void {
        if (this.isCompoundExpression(node)) {
            node.args.forEach((arg: Ast) => this.collectTopLevelSpans(arg, spans));
            return;
        }
        this.addSpan(node.metadata, spans);
    }

    private isCompoundExpression(node: Ast): node is AstCall {
        if (node.type !== 'call') {
            return false;
        }
        const head = node.head;
        return head.type === 'leaf' && head.text === 'CompoundExpression';
    }

    private addSpan(metadata: AstMetadata, spans: Span[]): void {
        if (metadata.source?.kind === 'span') {
            spans.push(metadata.source.span);
        }
    }

    private toVsRange(span: Span): vscode.Range {
        const startLine = Math.max(Math.floor(span.start.line) - 1, 0);
        const startCharacter = Math.max(Math.floor(span.start.column) - 1, 0);
        const endLine = Math.max(Math.floor(span.end.line) - 1, 0);
        const endCharacter = Math.max(Math.floor(span.end.column) - 1, 0);
        return new vscode.Range(
            new vscode.Position(startLine, startCharacter),
            new vscode.Position(endLine, endCharacter),
        );
    }

    private createFallbackRanges(text: string): vscode.Range[] {
        const lines = text.split(/\r?\n/);
        if (lines.length === 0) {
            return [];
        }
        const start = new vscode.Position(0, 0);
        const end = new vscode.Position(Math.max(lines.length - 1, 0), lines[lines.length - 1].length);
        return [new vscode.Range(start, end)];
    }

    private splitLines(text: string): string[] {
        return text.split(/\r?\n/);
    }

    private hasMeaningfulContent(lines: string[], span: Span): boolean {
        const snippet = this.extractSpanText(lines, span);
        return snippet.trim().length > 0;
    }

    private extractSpanText(lines: string[], span: Span): string {
        if (lines.length === 0) {
            return '';
        }

        const startLineIdx = Math.min(Math.max(span.start.line - 1, 0), lines.length - 1);
        const endLineIdx = Math.min(Math.max(span.end.line - 1, 0), lines.length - 1);

        const startLine = lines[startLineIdx] ?? '';
        const endLine = lines[endLineIdx] ?? '';
        const startCol = Math.min(Math.max(span.start.column - 1, 0), startLine.length);
        const endCol = Math.min(Math.max(span.end.column - 1, 0), endLine.length);

        if (startLineIdx === endLineIdx) {
            return startLine.substring(startCol, Math.min(endCol, startLine.length));
        }

        const segments: string[] = [];
        segments.push(startLine.substring(startCol));

        for (let line = startLineIdx + 1; line < endLineIdx; line++) {
            segments.push(lines[line] ?? '');
        }

        segments.push(endLine.substring(0, Math.min(endCol, endLine.length)));
        return segments.join('\n');
    }
}
