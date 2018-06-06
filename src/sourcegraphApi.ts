'use strict';
import {
    CancellationToken,
    Definition, Disposable,
    Hover,
    Location,
    MarkdownString,
    Position,
    Range, ReferenceContext,
    SymbolInformation,
    TextDocument,
    Uri,
    workspace, WorkspaceFolder
} from 'vscode';
import { GitHubApi } from './gitHubApi';
import { GitHubFileSystemProvider } from './githubFileSystemProvider';
import { Logger } from './logger';
import fetch from 'node-fetch';

const hoverTypeRegex = /\*\*(.*)?\*\*(?: \_\((.*)\)\_)?/;

export class SourcegraphApi extends Disposable {

    private readonly _capabilitiesMap = new Map<WorkspaceFolder, LspCapabilities>();

    constructor(
        public readonly _github: GitHubApi
    ) {
        super(() => this.dispose());
    }

    dispose() {
    }

    async definition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition | undefined> {
        const params = {
            position: {
                character: position.character,
                line: position.line
            }
        };

        const result = await this.lsp<{ uri: string, range: Range }[]>('textDocument/definition', params, document.uri, document.languageId, token);
        if (!result) return undefined;

        const definition = result.map(d =>
            new Location(
                SourcegraphApi.toRemoteHubUri(Uri.parse(d.uri)),
                SourcegraphApi.toRange(d.range)
            ));
        return definition;
    }

    async documentSymbols(document: TextDocument, token: CancellationToken): Promise<SymbolInformation[] | undefined> {
        const params = {};

        const result = await this.lsp<any[]>('textDocument/documentSymbol', params, document.uri, document.languageId, token);
        if (!result) return undefined;

        const symbols = result.map(s =>
            ({
                name: s.name,
                containerName: s.containerName,
                kind: s.kind,
                location: new Location(
                    SourcegraphApi.toRemoteHubUri(Uri.parse(s.location.uri)),
                    SourcegraphApi.toRange(s.location.range)
                )
            } as SymbolInformation));
        return symbols;
    }

    async hover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover | undefined> {
        const params = {
            position: {
                character: position.character,
                line: position.line
            }
        };

        const result = await this.lsp<{ contents: [{ value: string, language: string }, string], range: Range }>('textDocument/hover', params, document.uri, document.languageId, token);
        if (!result) return undefined;

        const s = new MarkdownString();
        const [code, fullType] = result.contents;

        const match = hoverTypeRegex.exec(fullType);
        const [, type, modifier] = match!;

        const includeType = type !== 'function';

        s.appendCodeblock(`${includeType ? `(${modifier ? `${modifier} ` : ''}${type}) ` : ''}${code.value}`, code.language);

        const hover = new Hover(s, SourcegraphApi.toRange(result.range));
        return hover;
    }

    async references(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken): Promise<Location[] | undefined> {
        const params = {
            position: {
                character: position.character,
                line: position.line
            },
            context: {
                ...context
            }
        };

        const result = await this.lsp<{ uri: string, range: Range }[]>('textDocument/references', params, document.uri, document.languageId, token);
        if (!result) return undefined;

        const locations = result.map(d =>
            new Location(
                SourcegraphApi.toRemoteHubUri(Uri.parse(d.uri)),
                SourcegraphApi.toRange(d.range)
            ));
        return locations;
    }

    async workspaceSymbols(query: string, uri: Uri, token: CancellationToken): Promise<SymbolInformation[] | undefined> {
        const params = {
            query: query
        };

        const result = await this.lsp<any[]>('workspace/symbol', params, uri, 'typescript', token);
        if (!result) return undefined;

        const symbols = result.map(s =>
            ({
                name: s.name,
                containerName: s.containerName,
                kind: s.kind,
                location: new Location(
                    SourcegraphApi.toRemoteHubUri(Uri.parse(s.location.uri)),
                    SourcegraphApi.toRange(s.location.range)
                )
            } as SymbolInformation));
        return symbols;
    }

    private async lsp<T>(method: string, params: { [key: string]: any }, uri: Uri, languageId: string, token: CancellationToken): Promise<T | undefined> {
        const folder = workspace.getWorkspaceFolder(uri);
        const capabilities = folder && this._capabilitiesMap.get(folder);
        if (capabilities && !SourcegraphApi.ensureCapability(capabilities, method)) return undefined;

        const sgUri = SourcegraphApi.toSourcegraphUri(uri, this._github.getSourcegraphShaForUri(uri)!);
        if (method.startsWith('textDocument/')) {
            params.textDocument = { uri: sgUri.toString(true) };
        }

        const body: LspRequest[] = [
            {
                id: 0,
                method: 'initialize',
                params: {
                    rootUri: sgUri.with({ fragment: '' }).toString(true),
                    mode: languageId
                }
            },
            {
                id: 1,
                method: method,
                params: params
            },
            {
                id: 2,
                method: 'shutdown'
            },
            {
                method: 'exit'
            }
        ];

        try {
            const resp = await fetch(
                `https://sourcegraph.com/.api/xlang/${method}`,
                {
                    method: 'POST',
                    body: JSON.stringify(body)
                }
            );

            const json = await resp.json() as [LspResponse<{ capabilities: LspCapabilities }>, LspResponse<T>];
            const [lspInitResp, lspMethodResp] = json;
            if (lspInitResp.error || lspMethodResp.error) {
                if (lspInitResp.error) {
                    Logger.warn(`lsp:initialize: ${lspInitResp.error.message}`);
                }
                if (lspMethodResp.error) {
                    Logger.warn(`lsp:${method}: ${lspMethodResp.error.message}`);
                }

                return undefined;
            }

            const { result: { capabilities: caps } } = lspInitResp;

            if (caps && folder && !capabilities) {
                this._capabilitiesMap.set(folder, caps);

                if (!SourcegraphApi.ensureCapability(caps, method)) return undefined;
            }

            return lspMethodResp.result;
        }
        catch (ex) {
            Logger.error(ex);
            return undefined;
        }
    }

    private static toRange(range: Range): Range {
        return new Range(range.start.line, range.start.character, range.end.line, range.end.character);
    }

    private static toRemoteHubUri(uri: Uri): Uri {
        const [, owner, repo] = uri.path.split('/');

        // e.g. remotehub://github.com/eamodio/vscode-gitlens/src/extension.ts
        return uri.with({
            scheme: GitHubFileSystemProvider.Scheme,
            path: `/${owner}/${repo}/${uri.fragment}`
        });
    }

    private static toSourcegraphUri(uri: Uri, sha: string): Uri {
        const [owner, repo, path] = GitHubFileSystemProvider.extractRepoInfo(uri);

        // e.g. git://github.com/eamodio/vscode-gitlens?<sha>#src/extension.ts
        return uri.with({
            scheme: 'git',
            path: `/${owner}/${repo}`,
            query: sha,
            fragment: path
        });
    }

    private static ensureCapability(capabilities: LspCapabilities, method: string) {
        switch (method) {
            case 'textDocument/definition':
                if (!capabilities.definitionProvider) return false;
                break;
            case 'textDocument/documentSymbol':
                if (!capabilities.documentSymbolProvider) return false;
                break;
            case 'textDocument/hover':
                if (!capabilities.hoverProvider) return false;
                break;
            case 'textDocument/references':
                if (!capabilities.referencesProvider) return false;
                break;
            case 'workspace/symbol':
                if (!capabilities.workspaceSymbolProvider) return false;
                break;
        }

        return true;
    }
}

interface LspCapabilities {
    definitionProvider: boolean;
    documentSymbolProvider: boolean;
    hoverProvider: boolean;
    referencesProvider: boolean;
    workspaceSymbolProvider: boolean;
    xdefinitionProvider: boolean;
    xworkspaceReferencesProvider: boolean;
}

interface LspRequest {
    id?: number;
    method: string;
    params?: {
        [key: string]: any;
    };
}

interface LspResponse<T> {
    id?: number;
    jsonrpc: string;
    result: T;
    error?: {
        code: number;
        message: string;
    };
}
