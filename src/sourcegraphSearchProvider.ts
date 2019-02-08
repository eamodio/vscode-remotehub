'use strict';
import {
    CancellationToken,
    FileIndexOptions,
    FileIndexProvider,
    FileSearchOptions,
    FileSearchQuery,
    Progress,
    Range,
    TextSearchComplete,
    TextSearchOptions,
    TextSearchProvider,
    TextSearchQuery,
    TextSearchResult,
    Uri
} from 'vscode';
import { SourcegraphApi } from './sourcegraphApi';
import { Iterables } from './system/iterable';
import { joinPath } from './uris';

export class SourceGraphSearchProvider implements FileIndexProvider, TextSearchProvider {
    constructor(
        private readonly _sourcegraph: SourcegraphApi
    ) {}

    async provideFileIndex(options: FileIndexOptions, token: CancellationToken): Promise<Uri[]> {
        const matches = await this._sourcegraph.filesQuery(options.folder);
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
        let sgQuery;
        if (query.isRegExp) {
            if (query.isWordMatch) {
                sgQuery = `\\b${query.pattern}\\b`;
            }
            else {
                sgQuery = query.pattern;
            }
        }
        else {
            if (query.isWordMatch) {
                sgQuery = `\\b${query.pattern}\\b`;
            }
            else {
                sgQuery = `"${query.pattern}"`;
            }
        }

        if (query.isCaseSensitive) {
            sgQuery = ` case:yes ${sgQuery}`;
        }

        const matches = await this._sourcegraph.searchQuery(sgQuery, options.folder, token);
        if (matches === undefined) return { limitHit: true };

        let counter = 0;
        let docRanges: Range[];
        let matchRanges: Range[];
        let uri;
        for (const m of matches) {
            const relativePath = Uri.parse(m.resource).fragment;
            uri = joinPath(options.folder, relativePath);

            for (const line of m.lineMatches) {
                counter++;
                if (counter > options.maxResults) {
                    return { limitHit: true };
                }

                docRanges = [];
                matchRanges = [];
                for (const [offset, length] of line.offsetAndLengths) {
                    docRanges.push(new Range(line.lineNumber, offset, line.lineNumber, offset + length));
                    matchRanges.push(new Range(0, offset, 0, offset + length));
                }

                progress.report({
                    uri: uri,
                    ranges: docRanges,
                    preview: {
                        text: line.preview,
                        matches: matchRanges
                    }
                });
            }
        }

        return { limitHit: false };
    }
}
