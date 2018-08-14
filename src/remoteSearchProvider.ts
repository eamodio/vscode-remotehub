'use strict';
import {
    CancellationToken,
    ConfigurationChangeEvent,
    Disposable,
    FileIndexOptions,
    FileIndexProvider,
    Progress,
    TextSearchOptions,
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

export class RemoteSearchProvider implements FileIndexProvider, Disposable {
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
                workspace.registerTextSearchProvider(fileSystemScheme, this)
            );
        }

        this._disposable = Disposable.from(
            configuration.onDidChange(this.onConfigurationChanged, this),
            ...registrations
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
