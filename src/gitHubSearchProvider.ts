'use strict';
import {
    CancellationToken,
    FileIndexOptions,
    FileIndexProvider,
    Progress,
    TextSearchOptions,
    TextSearchQuery,
    TextSearchResult,
    Uri
} from 'vscode';
import { GitHubApi } from './gitHubApi';
import { Iterables } from './system';
import { joinPath } from './uris';

export class GitHubSearchProvider implements FileIndexProvider {
    constructor(
        private readonly _github: GitHubApi
    ) {}

    async provideFileIndex(options: FileIndexOptions, token: CancellationToken): Promise<Uri[]> {
        const matches = await this._github.filesQuery(options.folder);
        if (matches === undefined || token.isCancellationRequested) return [];

        return [...Iterables.map(matches, m => joinPath(options.folder, m))];
    }

    async provideTextSearchResults(
        query: TextSearchQuery,
        options: TextSearchOptions,
        progress: Progress<TextSearchResult>,
        token: CancellationToken
    ): Promise<void> {}
}
