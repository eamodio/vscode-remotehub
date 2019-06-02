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
import * as fuzzySort from 'fuzzysort';
import { GitHubApi } from './gitHubApi';
import { Iterables } from './system';
import { joinPath } from './uris';

const replaceBackslashRegex = /(\/|\\)/g;

export class GitHubSearchProvider implements FileSearchProvider, TextSearchProvider {
    private _cache = new Map<string, Fuzzysort.Prepared[]>();

    constructor(private readonly _github: GitHubApi) {}

    async provideFileSearchResults(
        query: FileSearchQuery,
        options: FileSearchOptions,
        token: CancellationToken
    ): Promise<Uri[]> {
        let searchable = this._cache.get(options.folder.toString(true));
        if (searchable === undefined) {
            const matches = await this._github.filesQuery(options.folder);
            if (matches === undefined || token.isCancellationRequested) return [];

            searchable = [...Iterables.map(matches, m => (fuzzySort as any).prepareSlow(m)! as Fuzzysort.Prepared)];
            this._cache.set(options.folder.toString(true), searchable);
        }

        if (options.maxResults == null || options.maxResults === 0 || options.maxResults >= searchable.length) {
            const results = searchable.map(m => joinPath(options.folder, m.target));
            return results;
        }

        const results = fuzzySort
            .go(query.pattern.replace(replaceBackslashRegex, '/'), searchable, {
                allowTypo: true,
                limit: options.maxResults
            })
            .map((m: any) => joinPath(options.folder, m.target));

        (fuzzySort as any).cleanup();

        return results;
    }

    async provideTextSearchResults(
        query: TextSearchQuery,
        options: TextSearchOptions,
        progress: Progress<TextSearchResult>,
        token: CancellationToken
    ): Promise<TextSearchComplete> {
        const results = await this._github.searchQuery(
            query.pattern,
            options.folder,
            { maxResults: options.maxResults, context: { before: options.beforeContext, after: options.afterContext } },
            token
        );
        if (results === undefined) return { limitHit: true };

        let uri;
        for (const m of results.matches) {
            uri = joinPath(options.folder, m.path);

            progress.report({
                uri: uri,
                ranges: m.ranges,
                preview: {
                    text: m.preview,
                    matches: m.matches
                }
            });
        }

        return { limitHit: false };
    }
}
