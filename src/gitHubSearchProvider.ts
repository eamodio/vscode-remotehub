'use strict';
import {
    CancellationToken,
    FileIndexOptions,
    FileIndexProvider,
    FileSearchOptions,
    FileSearchQuery,
    Progress,
    TextSearchComplete,
    TextSearchOptions,
    TextSearchProvider,
    TextSearchQuery,
    TextSearchResult,
    Uri
} from 'vscode';
import { GitHubApi } from './gitHubApi';
import { Iterables } from './system';
import { joinPath } from './uris';

export class GitHubSearchProvider implements FileIndexProvider, TextSearchProvider {
    constructor(
        private readonly _github: GitHubApi
    ) {}

    async provideFileIndex(options: FileIndexOptions, token: CancellationToken): Promise<Uri[]> {
        const matches = await this._github.filesQuery(options.folder);
        if (matches === undefined || token.isCancellationRequested) return [];

        return [...Iterables.map(matches, m => joinPath(options.folder, m))];
    }

    async provideFileSearchResults(
        query: FileSearchQuery,
        options: FileSearchOptions,
        token: CancellationToken
    ): Promise<Uri[]> {
        if (query.pattern == null || query.pattern.length === 0) return this.provideFileIndex(options, token);

        // TODO:
        return [];
    }

    async provideTextSearchResults(
        query: TextSearchQuery,
        options: TextSearchOptions,
        progress: Progress<TextSearchResult>,
        token: CancellationToken
    ): Promise<TextSearchComplete> {
        return { limitHit: true };
    }
}
