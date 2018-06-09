'use strict';
import {
    CancellationToken,
    ConfigurationChangeEvent,
    Disposable,
    FileSearchOptions,
    FileSearchQuery,
    Progress,
    SearchProvider,
    TextSearchOptions,
    TextSearchQuery,
    TextSearchResult,
    Uri,
    workspace
} from 'vscode';
import { fileSystemScheme } from './constants';
import { configuration, Search } from './configuration';
import { GitHubFileSystemProvider } from './gitHubFileSystemProvider';
import { GitHubSearchProvider } from './gitHubSearchProvider';
import { SourcegraphApi } from './sourcegraphApi';
import { SourceGraphSearchProvider } from './sourcegraphSearchProvider';

export class RemoteSearchProvider extends Disposable implements SearchProvider {
    private readonly _disposable: Disposable;
    private _provider: GitHubSearchProvider | SourceGraphSearchProvider | undefined;

    constructor(private readonly _gitHubFS: GitHubFileSystemProvider, private readonly _sourcegraph: SourcegraphApi) {
        super(() => this.dispose());

        this._disposable = Disposable.from(
            configuration.onDidChange(this.onConfigurationChanged, this),
            workspace.registerSearchProvider(fileSystemScheme, this)
        );
        this.onConfigurationChanged(configuration.initializingChangeEvent);
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    private async onConfigurationChanged(e: ConfigurationChangeEvent) {
        const initializing = configuration.initializing(e);

        const section = configuration.name('search').value;
        if (initializing || configuration.changed(e, section)) {
            const search = configuration.get<Search>(section);
            this._provider =
                search === Search.GitHub
                    ? new GitHubSearchProvider(this._gitHubFS)
                    : new SourceGraphSearchProvider(this._sourcegraph);
        }
    }

    async provideFileSearchResults(
        query: FileSearchQuery,
        options: FileSearchOptions,
        progress: Progress<Uri>,
        token: CancellationToken
    ): Promise<void> {
        if (this._provider === undefined || token.isCancellationRequested) {
            return;
        }

        void (await this._provider.provideFileSearchResults(query, options, progress, token));
    }

    async provideTextSearchResults(
        query: TextSearchQuery,
        options: TextSearchOptions,
        progress: Progress<TextSearchResult>,
        token: CancellationToken
    ): Promise<void> {
        if (this._provider === undefined || token.isCancellationRequested) {
            return;
        }

        void (await this._provider.provideTextSearchResults(query, options, progress, token));
    }
}
