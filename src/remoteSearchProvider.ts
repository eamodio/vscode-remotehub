'use strict';
import * as fs from 'fs';
import * as paths from 'path';
import {
    CancellationToken,
    ConfigurationChangeEvent,
    Disposable,
    extensions,
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
    window,
    workspace
} from 'vscode';
import { configuration, Search } from './configuration';
import { extensionQualifiedId, fileSystemScheme } from './constants';
import { GitHubApi } from './gitHubApi';
import { GitHubSearchProvider } from './gitHubSearchProvider';
import { SourcegraphApi } from './sourcegraphApi';
import { SourceGraphSearchProvider } from './sourcegraphSearchProvider';
import { Logger } from './logger';

export class RemoteSearchProvider implements FileSearchProvider, TextSearchProvider, Disposable {
    private readonly _disposable: Disposable;
    private _provider: GitHubSearchProvider | SourceGraphSearchProvider | undefined;

    constructor(private readonly _github: GitHubApi, private readonly _sourcegraph: SourcegraphApi) {
        const registrations = [];
        if (configuration.get<boolean>(configuration.name('insiders').value)) {
            try {
                registrations.push(
                    workspace.registerFileSearchProvider(fileSystemScheme, this),
                    workspace.registerTextSearchProvider(fileSystemScheme, this)
                );
            }
            catch (ex) {
                Logger.error(ex);

                this.ensureProposedApiAccess();
            }
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

    private ensureProposedApiAccess() {
        const remotehub = extensions.getExtension(extensionQualifiedId)!;
        const enableProposedApi = remotehub.packageJSON.enableProposedApi;

        if (!enableProposedApi) {
            const path = paths.join(remotehub.extensionPath, 'package.json');

            try {
                const packageJSON = fs.readFileSync(path, 'utf8');
                const json = JSON.parse(packageJSON);
                json.enableProposedApi = true;
                fs.writeFileSync(path, `${JSON.stringify(json, undefined, 4)}\n`, 'utf8');
            }
            catch (ex) {
                Logger.error(ex);
            }
        }

        void window.showErrorMessage(
            'RemoteHub requires the use of proposed (read: experimental) APIs to provide both file and text search within VS Code. To enable search, you must restart VS Code with the the following command line switch: --enable-proposed-api eamodio.remotehub'
        );
    }

    private onConfigurationChanged(e: ConfigurationChangeEvent) {
        const section = configuration.name('search').value;
        if (configuration.changed(e, section)) {
            const search = configuration.get<Search>(section);
            this._provider =
                search === Search.GitHub
                    ? new GitHubSearchProvider(this._github)
                    : new SourceGraphSearchProvider(this._sourcegraph);
        }
    }

    provideFileSearchResults(
        query: FileSearchQuery,
        options: FileSearchOptions,
        token: CancellationToken
    ): Promise<Uri[]> {
        if (this._provider === undefined || token.isCancellationRequested) {
            return Promise.resolve([]);
        }

        return this._provider.provideFileSearchResults(query, options, token);
    }

    provideTextSearchResults(
        query: TextSearchQuery,
        options: TextSearchOptions,
        progress: Progress<TextSearchResult>,
        token: CancellationToken
    ): Promise<TextSearchComplete> {
        if (this._provider === undefined || token.isCancellationRequested) {
            return Promise.resolve({ limitHit: true });
        }

        return this._provider.provideTextSearchResults(query, options, progress, token);
    }
}
