'use strict';
import {
    CancellationToken,
    ConfigurationChangeEvent,
    Disposable,
    FileIndexOptions,
    FileIndexProvider,
    FileSearchOptions,
    FileSearchProvider,
    FileSearchQuery,
    Progress,
    TextSearchComplete,
    TextSearchOptions,
    TextSearchProvider,
    TextSearchQuery,
    TextSearchResult,
    Uri,
    workspace
} from 'vscode';
import { configuration, Search } from './configuration';
import { fileSystemScheme } from './constants';
import { GitHubApi } from './gitHubApi';
import { GitHubSearchProvider } from './gitHubSearchProvider';
import { SourcegraphApi } from './sourcegraphApi';
import { SourceGraphSearchProvider } from './sourcegraphSearchProvider';

export class RemoteSearchProvider implements FileIndexProvider, FileSearchProvider, TextSearchProvider, Disposable {
    private readonly _disposable: Disposable;
    private _provider: GitHubSearchProvider | SourceGraphSearchProvider | undefined;

    constructor(
        private readonly _github: GitHubApi,
        private readonly _sourcegraph: SourcegraphApi
    ) {
        const registrations = [];
        if (configuration.get<boolean>(configuration.name('insiders').value)) {
            registrations.push(
                workspace.registerFileIndexProvider(fileSystemScheme, this),
                // workspace.registerFileSearchProvider(fileSystemScheme, this),
                workspace.registerTextSearchProvider(fileSystemScheme, this)
            );
        }

        this._disposable = Disposable.from(
            configuration.onDidChange(this.onConfigurationChanged, this),
            ...registrations
        );
        void this.onConfigurationChanged(configuration.initializingChangeEvent);
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    private async onConfigurationChanged(e: ConfigurationChangeEvent) {
        const section = configuration.name('search').value;
        if (configuration.changed(e, section)) {
            const search = configuration.get<Search>(section);
            this._provider =
                search === Search.GitHub
                    ? new GitHubSearchProvider(this._github)
                    : new SourceGraphSearchProvider(this._sourcegraph);
        }
    }

    async provideFileIndex(options: FileIndexOptions, token: CancellationToken): Promise<Uri[]> {
        if (this._provider === undefined || token.isCancellationRequested) {
            return [];
        }

        return this._provider.provideFileIndex(options, token);
    }

    async provideFileSearchResults(
        query: FileSearchQuery,
        options: FileSearchOptions,
        token: CancellationToken
    ): Promise<Uri[]> {
        if (this._provider === undefined || token.isCancellationRequested) {
            return [];
        }

        return this._provider.provideFileSearchResults(query, options, token);
    }

    async provideTextSearchResults(
        query: TextSearchQuery,
        options: TextSearchOptions,
        progress: Progress<TextSearchResult>,
        token: CancellationToken
    ): Promise<TextSearchComplete> {
        if (this._provider === undefined || token.isCancellationRequested) {
            return { limitHit: true };
        }

        return this._provider.provideTextSearchResults(query, options, progress, token);
    }
}
