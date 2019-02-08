'use strict';
import { GraphQLClient } from 'graphql-request';
import fetch from 'node-fetch';
import {
    CancellationToken,
    Definition,
    Disposable,
    Hover,
    Location,
    MarkdownString,
    Position,
    Range,
    ReferenceContext,
    SymbolInformation,
    TextDocument,
    Uri,
    workspace,
    WorkspaceFolder
} from 'vscode';
import { Logger } from './logger';
import { Iterables } from './system/iterable';
import { fromRemoteHubUri, toRemoteHubUri, toSourcegraphUri } from './uris';

const hoverTypeRegex = /\*\*(.*)?\*\*(?: \_\((.*)\)\_)?/;

interface WorkspaceFolderMetadata {
    capabilities: LspCapabilities;
    repo: { languageId: string; revision: string };
}

export class SourcegraphApi implements Disposable {
    private readonly _disposable: Disposable | undefined;
    private readonly _metadataMap = new Map<WorkspaceFolder, WorkspaceFolderMetadata>();

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    private _client: GraphQLClient | undefined;
    get client(): GraphQLClient {
        if (this._client === undefined) {
            this._client = new GraphQLClient('https://sourcegraph.com/.api/graphql');
        }
        return this._client;
    }

    async definition(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): Promise<Definition | undefined> {
        const params = {
            position: {
                character: position.character,
                line: position.line
            }
        };

        const result = await this.lsp<{ uri: string; range: Range }[]>(
            'textDocument/definition',
            params,
            document.uri,
            document.languageId,
            token
        );
        if (!result) return undefined;

        const definition = result.map(
            d => new Location(toRemoteHubUri(Uri.parse(d.uri)), SourcegraphApi.toRange(d.range))
        );
        return definition;
    }

    async documentSymbols(document: TextDocument, token: CancellationToken): Promise<SymbolInformation[] | undefined> {
        const params = {};

        const result = await this.lsp<any[]>(
            'textDocument/documentSymbol',
            params,
            document.uri,
            document.languageId,
            token
        );
        if (!result) return undefined;

        const symbols = result.map(
            s =>
                ({
                    name: s.name,
                    containerName: s.containerName,
                    kind: s.kind,
                    location: new Location(
                        toRemoteHubUri(Uri.parse(s.location.uri)),
                        SourcegraphApi.toRange(s.location.range)
                    )
                } as SymbolInformation)
        );
        return symbols;
    }

    async hover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover | undefined> {
        const params = {
            position: {
                character: position.character,
                line: position.line
            }
        };

        const result = await this.lsp<{
            contents: [{ value: string; language: string }, string];
            range: Range;
        }>('textDocument/hover', params, document.uri, document.languageId, token);
        if (!result) return undefined;

        const s = new MarkdownString();
        const [code, fullType] = result.contents;

        const match = hoverTypeRegex.exec(fullType);
        const [, type, modifier] = match!;

        const includeType = type !== 'function';

        s.appendCodeblock(
            `${includeType ? `(${modifier ? `${modifier} ` : ''}${type}) ` : ''}${code.value}`,
            code.language
        );

        const hover = new Hover(s, SourcegraphApi.toRange(result.range));
        return hover;
    }

    async filesQuery(uri: Uri) {
        try {
            const query = `query files($repo: String!) {
                repository(name: $repo) {
                    commit(rev: "HEAD") {
                        tree(path: "", recursive: true) {
                            entries {
                                path
                                isDirectory
                            }
                        }
                    }
                }
            }`;

            const [owner, repo] = fromRemoteHubUri(uri);

            const variables = {
                repo: `${uri.authority}/${owner}/${repo}`
            };
            Logger.log(query, JSON.stringify(variables));

            const rsp = await this.client.request<{
                repository: {
                    commit: {
                        tree: {
                            entries: ({
                                path: string;
                                isDirectory: boolean;
                            })[];
                        };
                    };
                };
            }>(query, variables);

            return Iterables.filterMap(rsp.repository.commit.tree.entries, p =>
                p.isDirectory === false ? p.path : undefined
            );
        }
        catch (ex) {
            Logger.error(ex);
            return [];
        }
    }

    async references(
        document: TextDocument,
        position: Position,
        context: ReferenceContext,
        token: CancellationToken
    ): Promise<Location[] | undefined> {
        const params = {
            position: {
                character: position.character,
                line: position.line
            },
            context: {
                ...context
            }
        };

        const result = await this.lsp<{ uri: string; range: Range }[]>(
            'textDocument/references',
            params,
            document.uri,
            document.languageId,
            token
        );
        if (!result) return undefined;

        const locations = result.map(
            d => new Location(toRemoteHubUri(Uri.parse(d.uri)), SourcegraphApi.toRange(d.range))
        );
        return locations;
    }

    async searchQuery(query: string, uri: Uri, token: CancellationToken) {
        try {
            const graphQuery = `query search($query: String!) {
                search(query: $query) {
                    results {
                        resultCount
                        results {
                            ... on FileMatch {
                                resource
                                lineMatches {
                                    lineNumber,
                                    offsetAndLengths
                                    preview
                                }
                            }
                        }
                    }
                }
            }`;

            const [owner, repo] = fromRemoteHubUri(uri);

            const variables = {
                query: `repo:^${uri.authority}/${owner}/${repo}$ ${query}`
            };
            Logger.log(query, JSON.stringify(variables));

            const rsp = await this.client.request<{
                search: {
                    results: {
                        resultCount: number;
                        results: {
                            resource: string;
                            lineMatches: {
                                lineNumber: number;
                                offsetAndLengths: [number, number][];
                                preview: string;
                            }[];
                        }[];
                    };
                };
            }>(graphQuery, variables);
            return rsp.search.results.results.filter(m => m.resource);
        }
        catch (ex) {
            Logger.error(ex);
            return undefined;
        }
    }

    async workspaceSymbols(
        query: string,
        uri: Uri,
        languageId: string | undefined,
        token: CancellationToken
    ): Promise<SymbolInformation[] | undefined> {
        const params = {
            query: query
        };

        const result = await this.lsp<any[]>('workspace/symbol', params, uri, languageId, token);
        if (!result) return undefined;

        const symbols = result.map(
            s =>
                ({
                    name: s.name,
                    containerName: s.containerName,
                    kind: s.kind,
                    location: new Location(
                        toRemoteHubUri(Uri.parse(s.location.uri)),
                        SourcegraphApi.toRange(s.location.range)
                    )
                } as SymbolInformation)
        );
        return symbols;
    }

    private async lsp<T>(
        method: string,
        params: { [key: string]: any },
        uri: Uri,
        languageId: string | undefined,
        token: CancellationToken
    ): Promise<T | undefined> {
        const folder = workspace.getWorkspaceFolder(uri);
        const metadata =
            (folder && this._metadataMap.get(folder)) ||
            ({
                repo: {}
            } as WorkspaceFolderMetadata);

        const capabilities = metadata.capabilities;
        if (capabilities && !SourcegraphApi.ensureCapability(capabilities, method)) {
            return undefined;
        }

        if (metadata.repo.languageId === undefined || metadata.repo.revision === undefined) {
            const [owner, name] = fromRemoteHubUri(uri);
            const repo = await this.repositoryQuery(owner, name);
            if (repo) {
                metadata.repo.languageId = repo.languageId;
                metadata.repo.revision = repo.revision;

                if (folder) {
                    this._metadataMap.set(folder, metadata);
                }
            }
        }

        if (languageId === undefined) {
            languageId = metadata.repo.languageId;
        }
        if (languageId === undefined) return undefined;

        const sgUri = toSourcegraphUri(uri, metadata.repo.revision);
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

        const url = `https://sourcegraph.com/.api/xlang/${method}`;
        Logger.log(`Sourcegraph.lsp(${url})\n\t${JSON.stringify(body)}`);

        try {
            const resp = await fetch(url, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const json = (await resp.json()) as [LspResponse<{ capabilities: LspCapabilities }>, LspResponse<T>];

            const [lspInitResp, lspMethodResp] = json;
            if (lspInitResp.error || lspMethodResp.error) {
                if (lspInitResp.error) {
                    Logger.warn(`Sourcegraph.lsp(${url}):initialize: ${lspInitResp.error.message}`);
                }
                if (lspMethodResp.error) {
                    Logger.warn(`Sourcegraph.lsp(${url}):${method}: ${lspMethodResp.error.message}`);
                }

                return undefined;
            }

            const {
                result: { capabilities: caps }
            } = lspInitResp;

            if (caps && folder && !capabilities) {
                metadata.capabilities = caps;
                this._metadataMap.set(folder, metadata);

                if (!SourcegraphApi.ensureCapability(caps, method)) {
                    return undefined;
                }
            }

            return lspMethodResp.result;
        }
        catch (ex) {
            Logger.error(ex, 'Sourcegraph.lsp');
            return undefined;
        }
    }

    async repositoryQuery(owner: string, repo: string): Promise<{ languageId: string; revision: string } | undefined> {
        try {
            const query = `query getRepo($name: String!) {
    repository(name: $name) {
        language,
        lastIndexedRevOrLatest {
            oid
        }
    }
}`;

            const variables = { name: `github.com/${owner}/${repo}` };
            Logger.log(query, JSON.stringify(variables));

            const rsp = await this.client.request<{
                repository: {
                    language: string;
                    lastIndexedRevOrLatest: { oid: string };
                };
            }>(query, variables);
            if (rsp.repository == null) return undefined;

            return {
                languageId: rsp.repository.language.toLocaleLowerCase(),
                revision: rsp.repository.lastIndexedRevOrLatest.oid
            };
        }
        catch (ex) {
            Logger.error(ex);
            return undefined;
        }
    }

    private static toRange(range: Range): Range {
        return new Range(range.start.line, range.start.character, range.end.line, range.end.character);
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
