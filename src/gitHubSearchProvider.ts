'use strict';
import {
    CancellationToken,
    FileSearchOptions,
    FileSearchQuery,
    FileType,
    Progress,
    SearchProvider,
    TextSearchOptions,
    TextSearchQuery,
    TextSearchResult,
    Uri
} from 'vscode';
import { GitHubFileSystemProvider } from './gitHubFileSystemProvider';
import { Strings } from './system';
import { joinPath } from './uris';
import * as path from 'path';

export class GitHubSearchProvider implements SearchProvider {
    constructor(private readonly _githubFS: GitHubFileSystemProvider) {}

    async provideFileSearchResults(
        query: FileSearchQuery,
        options: FileSearchOptions,
        progress: Progress<Uri>,
        token: CancellationToken
    ): Promise<void> {
        void (await this.provideFileSearchResultsCore(options.folder, '', progress, token));
    }

    private async provideFileSearchResultsCore(
        uri: Uri,
        relativePath: string,
        progress: Progress<Uri>,
        token: CancellationToken
    ): Promise<void> {
        if (token.isCancellationRequested) return;

        const items = await this._githubFS.readDirectory(joinPath(uri, relativePath));

        for (const [name, type] of items) {
            if (token.isCancellationRequested) break;

            const relativeResult = Strings.normalizePath(path.join(relativePath, name));

            if (type === FileType.Directory) {
                await this.provideFileSearchResultsCore(uri, relativeResult, progress, token);
            } else if (type === FileType.File) {
                progress.report(joinPath(uri, relativeResult));
            }
        }
    }

    async provideTextSearchResults(
        query: TextSearchQuery,
        options: TextSearchOptions,
        progress: Progress<TextSearchResult>,
        token: CancellationToken
    ): Promise<void> {}
}
