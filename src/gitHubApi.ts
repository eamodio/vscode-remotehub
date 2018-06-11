'use strict';
import {
    ConfigurationChangeEvent,
    Disposable,
    Uri,
    workspace,
    WorkspaceFolder
} from 'vscode';
import { Config, configuration } from './configuration';
import { GraphQLClient } from 'graphql-request';
import { Logger } from './logger';
import { Variables } from 'graphql-request/dist/src/types';

const repositoryRegex = /^(?:https:\/\/github.com\/)?(.+?)\/(.+?)(?:\/|$)/i;

export class GitHubApi implements Disposable {
    private readonly _disposable: Disposable;
    private readonly _latestCommitMap = new Map<WorkspaceFolder, string>();
    private readonly _latestCommitForUriMap = new Map<string, string>();

    constructor() {
        this._disposable = Disposable.from(
            configuration.onDidChange(this.onConfigurationChanged, this)
        );
        this.onConfigurationChanged(configuration.initializingChangeEvent);
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    private async onConfigurationChanged(e: ConfigurationChangeEvent) {
        const initializing = configuration.initializing(e);

        if (
            !initializing &&
            configuration.changed(e, configuration.name('githubToken').value)
        ) {
            this._client = undefined;
        }
    }

    private _client: GraphQLClient | undefined;
    private get client(): GraphQLClient {
        if (this._client === undefined) {
            const cfg = configuration.get<Config>();
            if (!cfg.githubToken) {
                throw new Error(
                    'No GitHub personal access token could be found'
                );
            }

            this._client = new GraphQLClient('https://api.github.com/graphql', {
                headers: {
                    Authorization: `Bearer ${cfg.githubToken}`
                }
            });
        }
        return this._client;
    }

    getLatestRevisionForUri(uri: Uri) {
        return this._latestCommitForUriMap.get(uri.toString());
    }

    getLatestRevisionCommitForUri(uri: Uri) {
        const folder = workspace.getWorkspaceFolder(uri);
        return this._latestCommitMap.get(folder!);
    }

    async getSourcegraphRevisionForUri(uri: Uri) {
        const rev = this.getLatestRevisionCommitForUri(uri);
        if (rev !== undefined) return rev;

        return this.trackRepoForUri(uri);
    }

    async trackRepoForUri(uri: Uri, fileRevision?: string) {
        if (fileRevision) {
            this._latestCommitForUriMap.set(uri.toString(), fileRevision);
        }

        const folder = workspace.getWorkspaceFolder(uri);
        if (!folder || this._latestCommitMap.has(folder)) return;

        const [owner, repo] = GitHubApi.extractRepoInfo(uri);

        // Get latest repo revision
        const rev = await this.repositoryRevisionQuery(owner, repo);
        if (rev) {
            this._latestCommitMap.set(folder, rev);
        }

        return rev;
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
            Logger.log(
                `GitHub.fsQuery\n\t${query}\n\t${JSON.stringify(variables)}`
            );

            const rsp = await this.client.request<{
                repository: { object: T };
            }>(query, variables);
            return rsp.repository.object;
        } catch (ex) {
            Logger.error(ex, 'GitHub.fsQuery');
            return undefined;
        }
    }

    async repositoryRevisionQuery(
        owner: string,
        repo: string
    ): Promise<string | undefined> {
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
            Logger.log(
                `GitHub.repositoryRevisionQuery\n\t${query}\n\t${JSON.stringify(
                    variables
                )}`
            );

            const rsp = await this.client.request<{
                repository: { defaultBranchRef: { target: { oid: string } } };
            }>(query, variables);
            if (rsp.repository == null) return undefined;

            return rsp.repository.defaultBranchRef.target.oid;
        } catch (ex) {
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
        } else {
            const [ownerOrRepo, repo] = rawQuery.split('/');
            if (ownerOrRepo && repo) {
                searchQuery = `${repo} in:name user:${ownerOrRepo} sort:stars-desc`;
            } else if (ownerOrRepo && repo !== undefined) {
                searchQuery = `user:${ownerOrRepo} sort:stars-desc`;
            } else {
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
            Logger.log(
                `GitHub.repositoriesQuery\n\t${query}\n\t${JSON.stringify(
                    variables
                )}`
            );

            const rsp = await this.client.request<{
                search: { edges: { node: Repository }[] };
            }>(query, variables);
            if (rsp.search == null) return [];

            return rsp.search.edges.map(e => e.node);
        } catch (ex) {
            Logger.error(ex, 'GitHub.repositoriesQuery');
            return [];
        }
    }

    static extractRepoInfo(uri: Uri): [string, string, string | undefined] {
        const [, owner, repo, ...rest] = uri.path.split('/');

        return [owner, repo, rest.join('/')];
    }

    private static extractFSQueryVariables(uri: Uri): Variables {
        const [owner, repo, path] = GitHubApi.extractRepoInfo(uri);

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
