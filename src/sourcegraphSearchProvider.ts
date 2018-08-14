'use strict';
import {
    CancellationToken,
    FileIndexOptions,
    FileIndexProvider,
    Progress,
    Range,
    TextSearchOptions,
    TextSearchQuery,
    TextSearchResult,
    Uri
} from 'vscode';
import { SourcegraphApi } from './sourcegraphApi';
import { Iterables } from './system/iterable';
import { joinPath } from './uris';

export class SourceGraphSearchProvider implements FileIndexProvider {
    constructor(
        private readonly _sourcegraph: SourcegraphApi
    ) {}

    async provideFileIndex(options: FileIndexOptions, token: CancellationToken): Promise<Uri[]> {
        const matches = await this._sourcegraph.filesQuery(options.folder);
        if (matches === undefined || token.isCancellationRequested) return [];

        return [...Iterables.map(matches, m => joinPath(options.folder, m))];
    }

    async provideTextSearchResults(
        query: TextSearchQuery,
        options: TextSearchOptions,
        progress: Progress<TextSearchResult>,
        token: CancellationToken
    ): Promise<void> {
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
        if (matches === undefined) return;

        for (const m of matches) {
            const relativePath = Uri.parse(m.resource).fragment;
            for (const line of m.lineMatches) {
                for (const offset of line.offsetAndLengths) {
                    const range = new Range(line.lineNumber, offset[0], line.lineNumber, offset[0] + offset[1]);

                    progress.report({
                        uri: joinPath(options.folder, relativePath),
                        range: range,
                        preview: {
                            text: line.preview,
                            match: range
                        }
                    });
                }
            }
        }
    }
}
