'use strict';
import { GraphQLClient } from 'graphql-request';
import { Variables } from 'graphql-request/dist/src/types';
import { ConfigurationChangeEvent, Disposable, Uri, workspace } from 'vscode';
import { configuration } from './configuration';
import { Logger } from './logger';
import { fromRemoteHubUri } from './uris';

const repositoryRegex = /^(?:https:\/\/github.com\/)?(.+?)\/(.+?)(?:\/|$)/i;

export class GitHubApi implements Disposable {
    private readonly _disposable: Disposable;
    private readonly _revisionForUriMap = new Map<string, string>();

    constructor() {
        this._disposable = Disposable.from(configuration.onDidChange(this.onConfigurationChanged, this));
        this.onConfigurationChanged(configuration.initializingChangeEvent);
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    private async onConfigurationChanged(e: ConfigurationChangeEvent) {
        const initializing = configuration.initializing(e);

        if (!initializing && configuration.changed(e, configuration.name('githubToken').value)) {
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

    getRevisionForUri(uri: Uri) {
        return this._revisionForUriMap.get(uri.toString());
    }

    setRevisionForUri(uri: Uri, fileRevision: string) {
        this._revisionForUriMap.set(uri.toString(), fileRevision);
    }

    async fsQuery<T>(uri: Uri, innerQuery: string): Promise<T | undefined> {
        try {
            const query = `query fs($owner: String!, $repo: String!, $path: String) {
    repository(owner: $owner, name: $repo) {
        object(expression: $path) {
            ${innerQuery}
        }
    }
}`;

            const variables = GitHubApi.extractFSQueryVariables(uri);
            Logger.log(`GitHub.fsQuery\n\t${query}\n\t${JSON.stringify(variables)}`);

            const rsp = await this.client.request<{
                repository: { object: T };
            }>(query, variables);
            return rsp.repository.object;
        }
        catch (ex) {
            Logger.error(ex, 'GitHub.fsQuery');
            return undefined;
        }
    }

    async repositoryRevisionQuery(owner: string, repo: string): Promise<string | undefined> {
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
            Logger.log(`GitHub.repositoryRevisionQuery\n\t${query}\n\t${JSON.stringify(variables)}`);

            const rsp = await this.client.request<{
                repository: { defaultBranchRef: { target: { oid: string } } };
            }>(query, variables);
            if (rsp.repository == null) return undefined;

            return rsp.repository.defaultBranchRef.target.oid;
        }
        catch (ex) {
            Logger.error(ex, 'GitHub.repositoryRevisionQuery');
            return undefined;
        }
    }

    async repositoriesQuery(rawQuery: string): Promise<Repository[]> {
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
            Logger.log(`GitHub.repositoriesQuery\n\t${query}\n\t${JSON.stringify(variables)}`);

            const rsp = await this.client.request<{
                search: { edges: { node: Repository }[] };
            }>(query, variables);
            if (rsp.search == null) return [];

            return rsp.search.edges.map(e => e.node);
        }
        catch (ex) {
            Logger.error(ex, 'GitHub.repositoriesQuery');
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
