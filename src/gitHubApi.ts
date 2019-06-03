'use strict';
import * as Github from '@octokit/rest';
import { GraphQLClient } from 'graphql-request';
import { Variables } from 'graphql-request/dist/src/types';
import { CancellationToken, ConfigurationChangeEvent, Disposable, Range, Uri, workspace } from 'vscode';
import { configuration } from './configuration';
import { Logger } from './logger';
import { debug, Iterables } from './system';
import { fromRemoteHubUri } from './uris';

const repositoryRegex = /^(?:https:\/\/github.com\/)?(.+?)\/(.+?)(?:\/|$)/i;

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

export class GitHubApi implements Disposable {
    private readonly _disposable: Disposable;
    private readonly _revisionForUriMap = new Map<string, string>();

    constructor() {
        this._disposable = Disposable.from(configuration.onDidChange(this.onConfigurationChanged, this));
        void this.onConfigurationChanged(configuration.initializingChangeEvent);
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    private onConfigurationChanged(e: ConfigurationChangeEvent) {
        if (configuration.changed(e, configuration.name('githubToken').value)) {
            this._client = undefined;
        }
    }

    private _token: string | undefined;
    get token() {
        if (this._token === undefined) {
            this._token =
                workspace.getConfiguration('github').get<string>('accessToken') ||
                configuration.get<string>(configuration.name('githubToken').value);
        }
        return this._token;
    }

    private _client: GraphQLClient | undefined;
    private get client(): GraphQLClient {
        if (this._client === undefined) {
            if (!this.token) {
                throw new Error('No GitHub personal access token could be found');
            }

            this._client = new GraphQLClient('https://api.github.com/graphql', {
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            });
        }
        return this._client;
    }

    @debug()
    async filesQuery(uri: Uri) {
        const cc = Logger.getCorrelationContext();

        const [owner, repo] = fromRemoteHubUri(uri);
        try {
            const resp = await new Github({
                auth: `token ${this.token}`
            }).git.getTree({
                owner: owner,
                repo: repo,
                recursive: 1,
                // eslint-disable-next-line @typescript-eslint/camelcase
                tree_sha: 'HEAD'
            });
            return Iterables.filterMap(resp.data.tree as { type: 'blob' | 'tree'; path: string }[], p =>
                p.type === 'blob' ? p.path : undefined
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

        const [owner, repo] = fromRemoteHubUri(uri);
        try {
            const resp = (await new Github({
                auth: `token ${this.token}`,
                headers: {
                    accept: 'application/vnd.github.v3.text-match+json'
                }
            }).search.code({
                q: `${query} repo:${owner}/${repo}`
            })) as Github.Response<GitHubSearchResponse>;

            // Since GitHub doesn't return ANY line numbers just fake it at the top of the file 😢
            const range = new Range(0, 0, 0, 0);

            const matches: SearchQueryMatch[] = [];

            let counter = 0;
            let match: SearchQueryMatch;
            for (const item of resp.data.items) {
                for (const m of item.text_matches) {
                    counter++;
                    if (options.maxResults !== undefined && counter > options.maxResults) {
                        return { matches: matches, limitHit: true };
                    }

                    match = {
                        path: item.path,
                        ranges: [],
                        preview: m.fragment,
                        matches: []
                    };

                    for (const lm of m.matches) {
                        let line = 0;
                        let shartChar = 0;
                        let endChar = 0;
                        for (let i = 0; i < lm.indices[1]; i++) {
                            if (i === lm.indices[0]) {
                                shartChar = endChar;
                            }

                            if (m.fragment[i] === '\n') {
                                line++;
                                endChar = 0;
                            }
                            else {
                                endChar++;
                            }
                        }

                        match.ranges.push(range);
                        match.matches.push(new Range(line, shartChar, line, endChar));
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

    getRevisionForUri(uri: Uri) {
        return this._revisionForUriMap.get(uri.toString());
    }

    setRevisionForUri(uri: Uri, fileRevision: string) {
        this._revisionForUriMap.set(uri.toString(), fileRevision);
    }

    @debug({ args: { 1: () => false } })
    async fsQuery<T>(uri: Uri, innerQuery: string): Promise<T | undefined> {
        const cc = Logger.getCorrelationContext();

        try {
            const query = `query fs($owner: String!, $repo: String!, $path: String) {
    repository(owner: $owner, name: $repo) {
        object(expression: $path) {
            ${innerQuery}
        }
    }
}`;

            const variables = GitHubApi.extractFSQueryVariables(uri);
            Logger.debug(cc, `variables: ${JSON.stringify(variables)}`);

            const rsp = await this.client.request<{
                repository: { object: T };
            }>(query, variables);
            return rsp.repository.object;
        }
        catch (ex) {
            Logger.error(ex, cc);
            return undefined;
        }
    }

    @debug()
    async repositoryRevisionQuery(owner: string, repo: string): Promise<string | undefined> {
        const cc = Logger.getCorrelationContext();

        try {
            const query = `query repo($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
        defaultBranchRef {
            target {
                oid
            }
        }
    }
}`;

            const variables = { owner: owner, repo: repo };
            Logger.debug(cc, `variables: ${JSON.stringify(variables)}`);

            const rsp = await this.client.request<{
                repository: { defaultBranchRef: { target: { oid: string } } };
            }>(query, variables);
            if (rsp.repository == null) return undefined;

            return rsp.repository.defaultBranchRef.target.oid;
        }
        catch (ex) {
            Logger.error(ex, cc);
            return undefined;
        }
    }

    @debug()
    async repositoriesQuery(rawQuery: string): Promise<Repository[]> {
        const cc = Logger.getCorrelationContext();

        let searchQuery;

        const match = repositoryRegex.exec(rawQuery);
        if (match != null) {
            const [, owner, repo] = match;
            searchQuery = `${repo} in:name user:${owner} sort:stars-desc`;
        }
        else {
            const [ownerOrRepo, repo] = rawQuery.split('/');
            if (ownerOrRepo && repo) {
                searchQuery = `${repo} in:name user:${ownerOrRepo} sort:stars-desc`;
            }
            else if (ownerOrRepo && repo !== undefined) {
                searchQuery = `user:${ownerOrRepo} sort:stars-desc`;
            }
            else {
                searchQuery = `${ownerOrRepo} in:name sort:stars-desc`;
            }
        }

        try {
            const query = `query repos($query: String!) {
    search(type: REPOSITORY, query: $query, first: 25 ) {
        edges {
            node {
                ... on Repository {
                    name
                    description
                    url
                    nameWithOwner
                }
            }
        }
    }
}`;

            const variables = { query: searchQuery };
            Logger.debug(cc, `variables: ${JSON.stringify(variables)}`);

            const rsp = await this.client.request<{
                search: { edges: { node: Repository }[] };
            }>(query, variables);
            if (rsp.search == null) return [];

            return rsp.search.edges.map(e => e.node);
        }
        catch (ex) {
            Logger.error(ex, cc);
            return [];
        }
    }

    private static extractFSQueryVariables(uri: Uri): Variables {
        const [owner, repo, path] = fromRemoteHubUri(uri);

        return {
            owner: owner,
            repo: repo,
            path: `HEAD:${path}`
        };
    }
}

export interface Repository {
    name: string;
    description: string;
    url: string;
    nameWithOwner: string;
}

export interface GitHubSearchResponse {
    total_count: number;
    incomplete_results: boolean;
    items: GitHubSearchItem[];
}

export interface GitHubSearchItem {
    name: string;
    path: string;
    sha: string;
    url: string;
    git_url: string;
    html_url: string;
    score: number;
    text_matches: GitHubSearchTextMatch[];
}

export interface GitHubSearchTextMatch {
    object_url: string;
    object_type: string;
    property: string;
    fragment: string;
    matches: GitHubSearchMatch[];
}

export interface GitHubSearchMatch {
    text: string;
    indices: number[];
}
