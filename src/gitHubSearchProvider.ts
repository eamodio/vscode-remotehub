'use strict';
import {
    CancellationToken,
    FileSearchOptions,
    FileSearchProvider,
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

export class GitHubSearchProvider implements FileSearchProvider, TextSearchProvider {
    constructor(private readonly _github: GitHubApi) {}

    async provideFileSearchResults(
        query: FileSearchQuery,
        options: FileSearchOptions,
        token: CancellationToken
    ): Promise<Uri[]> {
        const matches = await this._github.filesQuery(options.folder);
        if (matches === undefined || token.isCancellationRequested) return [];

        const results = [...Iterables.map(matches, m => joinPath(options.folder, m))];
        return results;
    }

    provideTextSearchResults(
        query: TextSearchQuery,
        options: TextSearchOptions,
        progress: Progress<TextSearchResult>,
        token: CancellationToken
    ): Promise<TextSearchComplete> {
        return Promise.resolve({ limitHit: true });
    }
}
