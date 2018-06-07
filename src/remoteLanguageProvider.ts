import {
    CancellationToken,
    Definition, DefinitionProvider, Disposable, DocumentSymbolProvider,
    Hover, HoverProvider,
    languages, Location,
    Position, ProviderResult,
    ReferenceContext, ReferenceProvider,
    SymbolInformation,
    TextDocument,
    window, workspace, WorkspaceSymbolProvider
} from 'vscode';
import { GitHubFileSystemProvider } from './githubFileSystemProvider';
import { SourcegraphApi } from './sourcegraphApi';

export class RemoteLanguageProvider implements DefinitionProvider, DocumentSymbolProvider, HoverProvider, ReferenceProvider, WorkspaceSymbolProvider {

    private readonly _disposable: Disposable;

    constructor(
        private _sourcegraph: SourcegraphApi
    ) {
        this._disposable = Disposable.from(
            languages.registerDefinitionProvider({ scheme: GitHubFileSystemProvider.Scheme, language: '*' }, this),
            languages.registerDocumentSymbolProvider({ scheme: GitHubFileSystemProvider.Scheme, language: '*' }, this),
            languages.registerHoverProvider({ scheme: GitHubFileSystemProvider.Scheme, language: '*' }, this),
            languages.registerReferenceProvider({ scheme: GitHubFileSystemProvider.Scheme, language: '*' }, this),
            languages.registerWorkspaceSymbolProvider(this)
            // configuration.onDidChange(this.onConfigurationChanged, this)
        );
        // this.onConfigurationChanged(configuration.initializingChangeEvent);
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    provideDefinition(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Definition> {
        return this._sourcegraph.definition(document, position, token);
    }

    provideDocumentSymbols(document: TextDocument, token: CancellationToken): ProviderResult<SymbolInformation[]> {
        return this._sourcegraph.documentSymbols(document, token);
    }

    provideHover(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Hover> {
        return this._sourcegraph.hover(document, position, token);
    }

    provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken): ProviderResult<Location[]> {
        return this._sourcegraph.references(document, position, context, token);
    }

    provideWorkspaceSymbols(query: string, token: CancellationToken): ProviderResult<SymbolInformation[]> {
        const editor = window.activeTextEditor;
        let uri;
        if (editor === undefined) {
            uri = workspace.workspaceFolders && workspace.workspaceFolders[0].uri;
        }
        else {
            uri = editor.document.uri;
        }
        if (uri === undefined) return undefined;

        return this._sourcegraph.workspaceSymbols(query, uri, token);
    }
}