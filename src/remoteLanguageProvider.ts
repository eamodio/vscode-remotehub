'use strict';
import {
    CancellationToken,
    Definition,
    DefinitionLink,
    DefinitionProvider,
    Disposable,
    DocumentSymbol,
    DocumentSymbolProvider,
    Hover,
    HoverProvider,
    ImplementationProvider,
    languages,
    Location,
    Position,
    ProviderResult,
    ReferenceContext,
    ReferenceProvider,
    SymbolInformation,
    TextDocument,
    window,
    workspace,
    WorkspaceSymbolProvider
} from 'vscode';
import { fileSystemScheme } from './constants';
import { SourcegraphLsp } from './sourcegraphLsp';

export class RemoteLanguageProvider
    implements
        DefinitionProvider,
        Disposable,
        DocumentSymbolProvider,
        HoverProvider,
        ImplementationProvider,
        ReferenceProvider,
        WorkspaceSymbolProvider {
    private readonly _disposable: Disposable;

    constructor(private readonly _sourcegraph: SourcegraphLsp) {
        this._disposable = Disposable.from(
            languages.registerDefinitionProvider({ scheme: fileSystemScheme, language: '*' }, this),
            // languages.registerDocumentSymbolProvider({ scheme: fileSystemScheme, language: '*' }, this),
            languages.registerHoverProvider({ scheme: fileSystemScheme, language: '*' }, this),
            languages.registerReferenceProvider({ scheme: fileSystemScheme, language: '*' }, this),
            languages.registerImplementationProvider({ scheme: fileSystemScheme, language: '*' }, this)
            // languages.registerWorkspaceSymbolProvider(this)
        );
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    provideDefinition(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): ProviderResult<Definition | DefinitionLink[]> {
        return this._sourcegraph.definition(document, position, token);
    }

    provideDocumentSymbols(
        document: TextDocument,
        token: CancellationToken
    ): ProviderResult<SymbolInformation[] | DocumentSymbol[]> {
        return this._sourcegraph.documentSymbols(document, token);
    }

    provideHover(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Hover> {
        return this._sourcegraph.hover(document, position, token);
    }

    provideImplementation(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): ProviderResult<Definition | DefinitionLink[]> {
        return this._sourcegraph.implementation(document, position, token);
    }

    provideReferences(
        document: TextDocument,
        position: Position,
        context: ReferenceContext,
        token: CancellationToken
    ): ProviderResult<Location[]> {
        return this._sourcegraph.references(document, position, context, token);
    }

    provideWorkspaceSymbols(query: string, token: CancellationToken): ProviderResult<SymbolInformation[]> {
        const editor = window.activeTextEditor;

        let languageId;
        let uri;
        if (editor === undefined || editor.document.uri.scheme !== fileSystemScheme) {
            uri = workspace.workspaceFolders && workspace.workspaceFolders[0].uri;
        }
        else {
            uri = editor.document.uri;
            languageId = editor.document.languageId;
        }
        if (uri === undefined || uri.scheme !== fileSystemScheme) {
            return undefined;
        }

        return this._sourcegraph.workspaceSymbols(query, uri, languageId, token);
    }
}
