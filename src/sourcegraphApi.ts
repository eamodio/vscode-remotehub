'use strict';
import { GraphQLClient } from 'graphql-request';
import { CancellationToken, Disposable, Range, Uri } from 'vscode';
import { Logger } from './logger';
import { Iterables } from './system/iterable';
import { fromRemoteHubUri } from './uris';
import { debug } from './system';

export interface SearchQueryMatch {
    path: string;
    ranges: Range[];
    preview: string;
    matches: Range[];
}

export interface SearchQueryResults {
    matches: SearchQueryMatch[];
    limitHit: boolean;
}
export class SourcegraphApi implements Disposable {
    private readonly _disposable: Disposable | undefined;

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    private _client: GraphQLClient | undefined;
    get client(): GraphQLClient {
        if (this._client === undefined) {
            this._client = new GraphQLClient('https://sourcegraph.com/.api/graphql');
        }
        return this._client;
    }

    @debug()
    async filesQuery(uri: Uri) {
        const cc = Logger.getCorrelationContext();

        try {
            const query = `query files($repo: String!) {
                repository(name: $repo) {
                    commit(rev: "HEAD") {
                        tree(path: "", recursive: true) {
                            entries {
                                path
                                isDirectory
                            }
                        }
                    }
                }
            }`;

            const [owner, repo] = fromRemoteHubUri(uri);

            const variables = {
                repo: `${uri.authority}/${owner}/${repo}`
            };
            Logger.debug(cc, `variables: ${JSON.stringify(variables)}`);

            const rsp = await this.client.request<{
                repository: {
                    commit: {
                        tree: {
                            entries: ({
                                path: string;
                                isDirectory: boolean;
                            })[];
                        };
                    };
                };
            }>(query, variables);

            return Iterables.filterMap(rsp.repository.commit.tree.entries, p =>
                p.isDirectory === false ? p.path : undefined
            );
        }
        catch (ex) {
            Logger.error(ex, cc);
            return [];
        }
    }

    @debug({ args: { 3: () => false } })
    async searchQuery(
        query: string,
        uri: Uri,
        options: { maxResults?: number; context?: { before?: number; after?: number } },
        token: CancellationToken
    ): Promise<SearchQueryResults> {
        const cc = Logger.getCorrelationContext();

        try {
            const graphQuery = `query search($query: String!) {
                search(query: $query) {
                    results {
                        resultCount
                        results {
                            ... on FileMatch {
                                resource
                                lineMatches {
                                    lineNumber,
                                    offsetAndLengths
                                    preview
                                }
                            }
                        }
                    }
                }
            }`;

            const [owner, repo] = fromRemoteHubUri(uri);

            const variables = {
                query: `repo:^${uri.authority}/${owner}/${repo}$ ${query}`
            };
            Logger.debug(cc, `variables: ${JSON.stringify(variables)}`);

            const rsp = await this.client.request<{
                search: {
                    results: {
                        resultCount: number;
                        results: {
                            resource: string;
                            lineMatches: {
                                lineNumber: number;
                                offsetAndLengths: [number, number][];
                                preview: string;
                            }[];
                        }[];
                    };
                };
            }>(graphQuery, variables);

            const matches: SearchQueryMatch[] = [];

            let counter = 0;
            let match: SearchQueryMatch;
            for (const m of rsp.search.results.results.filter(m => m.resource)) {
                const path = Uri.parse(m.resource).fragment;

                for (const lm of m.lineMatches) {
                    counter++;
                    if (options.maxResults !== undefined && counter > options.maxResults) {
                        return { matches: matches, limitHit: true };
                    }

                    match = {
                        path: path,
                        ranges: [],
                        preview: lm.preview,
                        matches: []
                    };

                    for (const [offset, length] of lm.offsetAndLengths) {
                        match.ranges.push(new Range(lm.lineNumber, offset, lm.lineNumber, offset + length));
                        match.matches.push(new Range(0, offset, 0, offset + length));
                    }

                    matches.push(match);
                }
            }

            return { matches: matches, limitHit: false };
        }
        catch (ex) {
            Logger.error(ex, cc);
            return { matches: [], limitHit: true };
        }
    }

    @debug()
    async repositoryQuery(owner: string, repo: string): Promise<{ languageId: string; revision: string } | undefined> {
        const cc = Logger.getCorrelationContext();

        try {
            const query = `query getRepo($name: String!) {
    repository(name: $name) {
        language,
        commit(rev: "") {
            oid
        }
    }
}`;

            const variables = { name: `github.com/${owner}/${repo}` };
            Logger.debug(cc, `variables: ${JSON.stringify(variables)}`);

            const rsp = await this.client.request<{
                repository: {
                    language: string;
                    commit: { oid: string };
                };
            }>(query, variables);
            if (rsp.repository == null) return undefined;

            return {
                languageId: rsp.repository.language.toLocaleLowerCase(),
                revision: rsp.repository.commit.oid
            };
        }
        catch (ex) {
            Logger.error(ex, cc);
            return undefined;
        }
    }
}
