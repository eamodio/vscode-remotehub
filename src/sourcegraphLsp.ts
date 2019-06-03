'use strict';
import { LSPConnection, webSocketTransport } from '@sourcegraph/lsp-client';
import {
    CancellationToken,
    Definition,
    DefinitionLink,
    Disposable,
    DocumentSymbol,
    Hover,
    Location,
    LocationLink,
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
import {
    ClientCapabilities,
    DefinitionRequest,
    DocumentSymbolRequest,
    HoverRequest,
    ImplementationRequest,
    InitializeRequest,
    DocumentSymbol as LspDocumentSymbol,
    Location as LspLocation,
    LocationLink as LspLocationLink,
    MarkupContent as LspMarkupContent,
    Range as LspRange,
    SymbolInformation as LspSymbolInformation,
    MarkupKind,
    ReferencesRequest,
    RequestType,
    ServerCapabilities,
    WorkspaceSymbolRequest
} from 'vscode-languageserver-protocol';
import { Logger } from './logger';
import { SourcegraphApi } from './sourcegraphApi';
import { fromRemoteHubUri, fromSourcegraphUri, toSourcegraphUri } from './uris';
import { debug } from './system';

type RequestParamsOf<RT> = RT extends RequestType<infer R, any, any, any> ? R : never;
type RequestResponseOf<RT> = RT extends RequestType<any, infer R, any, any> ? R : never;

export class SourcegraphLsp implements Disposable {
    private readonly _disposable: Disposable | undefined;
    private readonly _connections = new Map<string, WorkspaceLspConnection>();

    constructor(private readonly _sourcegraph: SourcegraphApi) {}

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    @debug({
        args: {
            0: document => Logger.toLoggable(document.uri),
            2: () => false
        }
    })
    async definition(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): Promise<Definition | DefinitionLink[] | undefined> {
        const response = await this.lsp(
            DefinitionRequest.type,
            {
                position: {
                    character: position.character,
                    line: position.line
                },
                textDocument: { uri: '' }
            },
            document.uri,
            document.languageId
        );
        if (!response) return undefined;

        if (!Array.isArray(response)) {
            return new Location(fromSourcegraphUri(Uri.parse(response.uri)), toRange(response.range));
        }

        const definition = (response as (LspLocation | LspLocationLink)[]).map(d => {
            if (LspLocationLink.is(d)) {
                const link: LocationLink = {
                    targetUri: fromSourcegraphUri(Uri.parse(d.targetUri)),
                    targetRange: toRange(d.targetRange),
                    targetSelectionRange: d.targetSelectionRange && toRange(d.targetSelectionRange),
                    originSelectionRange: d.originSelectionRange && toRange(d.originSelectionRange)
                };
                return link;
            }
            return new Location(fromSourcegraphUri(Uri.parse(d.uri)), toRange(d.range));
        });
        return definition as Definition | DefinitionLink[];
    }

    @debug({
        args: {
            0: document => Logger.toLoggable(document.uri),
            1: () => false
        }
    })
    async documentSymbols(
        document: TextDocument,
        token: CancellationToken
    ): Promise<SymbolInformation[] | DocumentSymbol[] | undefined> {
        const response = await this.lsp(
            DocumentSymbolRequest.type,
            {
                textDocument: { uri: '' }
            },
            document.uri,
            document.languageId,
            token
        );
        if (!response) return undefined;

        const symbols = (response as (LspSymbolInformation | LspDocumentSymbol)[]).map(s => {
            if (LspDocumentSymbol.is(s)) {
                return new DocumentSymbol(s.name, s.detail!, s.kind, toRange(s.range), toRange(s.selectionRange));
            }
            return new SymbolInformation(
                s.name,
                s.kind,
                s.containerName!,
                new Location(fromSourcegraphUri(Uri.parse(s.location.uri)), toRange(s.location.range))
            );
        });

        return symbols as SymbolInformation[] | DocumentSymbol[];
    }

    @debug({
        args: {
            0: document => Logger.toLoggable(document.uri),
            2: () => false
        }
    })
    async hover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover | undefined> {
        const response = await this.lsp(
            HoverRequest.type,
            {
                position: {
                    character: position.character,
                    line: position.line
                },
                textDocument: { uri: '' }
            },
            document.uri,
            document.languageId,
            token
        );
        if (!response) return undefined;

        const s = new MarkdownString();

        const contents = Array.isArray(response.contents) ? response.contents : [response.contents];
        for (const c of contents) {
            if (LspMarkupContent.is(c)) {
                if (c.kind === MarkupKind.Markdown) {
                    s.appendMarkdown(c.value);
                }
                else {
                    s.appendText(c.value);
                }
            }
            else if (typeof c === 'string') {
                s.appendText(c);
            }
            else {
                s.appendCodeblock(c.value, c.language);
            }
        }

        const hover = new Hover(s, response.range && toRange(response.range));
        return hover;
    }

    @debug({
        args: {
            0: document => Logger.toLoggable(document.uri),
            2: () => false
        }
    })
    async implementation(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): Promise<Definition | DefinitionLink[] | undefined> {
        const response = await this.lsp(
            ImplementationRequest.type,
            {
                position: {
                    character: position.character,
                    line: position.line
                },
                textDocument: { uri: '' }
            },
            document.uri,
            document.languageId
        );
        if (!response) return undefined;

        if (!Array.isArray(response)) {
            return new Location(fromSourcegraphUri(Uri.parse(response.uri)), toRange(response.range));
        }

        const definition = (response as (LspLocation | LspLocationLink)[]).map(d => {
            if (LspLocationLink.is(d)) {
                const link: LocationLink = {
                    targetUri: fromSourcegraphUri(Uri.parse(d.targetUri)),
                    targetRange: toRange(d.targetRange),
                    targetSelectionRange: d.targetSelectionRange && toRange(d.targetSelectionRange),
                    originSelectionRange: d.originSelectionRange && toRange(d.originSelectionRange)
                };
                return link;
            }
            return new Location(fromSourcegraphUri(Uri.parse(d.uri)), toRange(d.range));
        });
        return definition as Definition | DefinitionLink[];
    }

    @debug({
        args: {
            0: document => Logger.toLoggable(document.uri),
            2: () => false
        }
    })
    async references(
        document: TextDocument,
        position: Position,
        context: ReferenceContext,
        token: CancellationToken
    ): Promise<Location[] | undefined> {
        const response = await this.lsp(
            ReferencesRequest.type,
            {
                position: {
                    character: position.character,
                    line: position.line
                },
                context: {
                    ...context
                },
                textDocument: { uri: '' }
            },
            document.uri,
            document.languageId
        );
        if (!response) return undefined;

        const locations = response.map(d => new Location(fromSourcegraphUri(Uri.parse(d.uri)), toRange(d.range)));
        return locations;
    }

    @debug({ args: { 2: () => false } })
    async workspaceSymbols(
        query: string,
        uri: Uri,
        languageId: string | undefined,
        token: CancellationToken
    ): Promise<SymbolInformation[] | undefined> {
        const response = await this.lsp(
            WorkspaceSymbolRequest.type,
            {
                query: query
            },
            uri,
            languageId,
            token
        );
        if (!response) return undefined;

        const symbols = response.map(s => {
            return new SymbolInformation(
                s.name,
                s.kind,
                s.containerName!,
                new Location(fromSourcegraphUri(Uri.parse(s.location.uri)), toRange(s.location.range))
            );
        });

        return symbols;
    }

    @debug({
        args: {
            0: type => type.method,
            4: () => false
        }
    })
    private async lsp<RT extends RequestType<any, any, any, any>>(
        type: RT,
        params: RequestParamsOf<RT>,
        uri: Uri,
        languageId: string | undefined,
        token?: CancellationToken
    ): Promise<RequestResponseOf<RT> | undefined> {
        const cc = Logger.getCorrelationContext();

        const folder = workspace.getWorkspaceFolder(uri);
        if (folder === undefined) return undefined;

        const key = `${folder.uri.toString(true)}${languageId ? `|${languageId}` : ''}`;

        let connection = this._connections.get(key);
        if (connection === undefined) {
            const [owner, name] = fromRemoteHubUri(uri);
            const repo = await this._sourcegraph.repositoryQuery(owner, name);
            if (repo === undefined) return undefined;

            connection = new WorkspaceLspConnection(folder, repo.languageId || languageId!, repo.revision);
            await connection.connect();

            this._connections.set(key, connection);
        }

        try {
            const sgUri = toSourcegraphUri(uri, connection.revision);
            if (params.textDocument) {
                params.textDocument.uri = sgUri.toString(true);
            }

            const response = await connection.sendRequest(type, params, token);
            return response;
        }
        catch (ex) {
            Logger.error(ex, cc);
            return undefined;
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-object-literal-type-assertion
const clientCapabilities: ClientCapabilities = {
    experimental: {
        progress: 'True'
    }
};

class WorkspaceLspConnection implements Disposable {
    public readonly rootUri: Uri;

    private _capabilities: ServerCapabilities | undefined;
    private _connection: LSPConnection | undefined;

    constructor(
        folder: WorkspaceFolder,
        public readonly languageId: string | undefined,
        public readonly revision: string | undefined
    ) {
        this.rootUri = toSourcegraphUri(folder.uri, revision, true);
    }

    dispose() {
        this.disconnect();
    }

    @debug()
    async connect() {
        const cc = Logger.getCorrelationContext();

        try {
            this._connection = await webSocketTransport({
                serverUrl: `https://${this.languageId}.sourcegraph.com/`,
                logger: new NoopLogger()
            })();

            // TODO: Reconnect?
            // this._connection.closeEvent.subscribe();

            const response = await this._connection.sendRequest(InitializeRequest.type, {
                processId: 0,
                rootUri: this.rootUri.toString(true),
                capabilities: clientCapabilities,
                workspaceFolders: [
                    {
                        name: '',
                        uri: this.rootUri.toString(true)
                    }
                ],
                initializationOptions: {
                    configuration: {
                        [`${this.languageId}.sourcegraphUrl`]: 'https://sourcegraph.com/',
                        [`${this.languageId}.serverUrl`]: `wss://${this.languageId}.sourcegraph.com`,
                        [`${this.languageId}.progress`]: false
                    }
                }
            });

            this._capabilities = response.capabilities;
        }
        catch (ex) {
            Logger.error(ex, cc);
        }
    }

    @debug()
    disconnect() {
        if (this._connection === undefined) return;

        try {
            this._connection.unsubscribe();
            this._connection = undefined;
        }
        catch {}
    }

    ensureCapability<RT extends RequestType<any, any, any, any>>(type: RT) {
        if (this._capabilities === undefined) return false;

        switch (type.method) {
            case DefinitionRequest.type.method:
                if (this._capabilities.definitionProvider) return true;
                break;
            case DocumentSymbolRequest.type.method:
                if (this._capabilities.documentSymbolProvider) return true;
                break;
            case HoverRequest.type.method:
                if (this._capabilities.hoverProvider) return true;
                break;
            case ImplementationRequest.type.method:
                if (this._capabilities.implementationProvider) return true;
                break;
            case ReferencesRequest.type.method:
                if (this._capabilities.referencesProvider) return true;
                break;
            case WorkspaceSymbolRequest.type.method:
                if (this._capabilities.workspaceSymbolProvider) return true;
                break;
        }

        return false;
    }

    @debug({
        args: {
            0: type => type.method,
            2: () => false
        }
    })
    async sendRequest<RT extends RequestType<any, any, any, any>>(
        type: RT,
        params: RequestParamsOf<RT>,
        token?: CancellationToken
    ): Promise<RequestResponseOf<RT>> {
        const cc = Logger.getCorrelationContext();

        if (this._connection === undefined) throw new Error('Must call connect before trying to send a request');
        if (!this.ensureCapability(type)) throw new Error(`${type.method} isn't supported by the LSP server`);

        let retries = 0;

        while (true) {
            if (this._connection.closed) {
                this.disconnect();
                await this.connect();
            }

            try {
                const response = await this._connection.sendRequest(type, params);
                return response;
            }
            catch (ex) {
                Logger.error(ex, cc);

                if (/connection/.test(ex.message) || this._connection.closed) {
                    this.disconnect();

                    retries++;
                    if (retries < 3) {
                        Logger.debug(cc, `Retrying... #${retries}`);

                        continue;
                    }
                }

                throw ex;
            }
        }
    }
}

export class NoopLogger {
    // eslint-disable-next-line no-empty-function
    log(...values: any[]) {}
    // eslint-disable-next-line no-empty-function
    info(...values: any[]) {}
    // eslint-disable-next-line no-empty-function
    warn(...values: any[]) {}
    // eslint-disable-next-line no-empty-function
    error(...values: any[]) {}
}

function toRange(range: LspRange): Range {
    return new Range(range.start.line, range.start.character, range.end.line, range.end.character);
}
