'use strict';
import { ConfigurationChangeEvent, Disposable, Uri, workspace, WorkspaceFolder } from 'vscode';
import { configuration, IConfig } from './configuration';
import { GraphQLClient } from 'graphql-request';
import { Logger } from './logger';
import { Variables } from 'graphql-request/dist/src/types';
import { GitHubFileSystemProvider } from './githubFileSystemProvider';

export class GitHubApi {

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

        if (!initializing && configuration.changed(e, configuration.name('githubToken').value)) {
            this._client = undefined;
        }
    }

    private _client: GraphQLClient | undefined;
    private get client(): GraphQLClient {
        if (this._client === undefined) {
            const cfg = configuration.get<IConfig>();
            if (!cfg.githubToken) throw new Error('No GitHub personal access token could be found');

            this._client = new GraphQLClient('https://api.github.com/graphql', {
                headers: {
                    Authorization: `Bearer ${cfg.githubToken}`
                }
            });
        }
        return this._client;
    }

    getLatestShaForUri(uri: Uri) {
        return this._latestCommitForUriMap.get(uri.toString());
    }

    getLatestShaCommitForUri(uri: Uri) {
        const folder = workspace.getWorkspaceFolder(uri);
        return this._latestCommitMap.get(folder!);
    }

    getSourcegraphShaForUri(uri: Uri) {
        return this.getLatestShaCommitForUri(uri);
    }

    async trackRepoForUri(uri: Uri, fileSha: string) {
        this._latestCommitForUriMap.set(uri.toString(), fileSha);

        const folder = workspace.getWorkspaceFolder(uri);
        if (!folder || this._latestCommitMap.has(folder)) return;

        const [owner, repo] = GitHubFileSystemProvider.extractRepoInfo(uri);

        // Get latest repo sha
        const sha = await this.repositoryShaQuery(owner, repo);
        if (sha) {
            this._latestCommitMap.set(folder, sha);
        }
    }

    async fsQuery<T>(uri: Uri, innerQuery: string): Promise<T | undefined> {
        try {
            const query = `query fs($owner: String!, $repo: String!, $path: String) {
                repository(owner:$owner, name:$repo) {
                    object(expression:$path) {
                        ${innerQuery}
                    }
                }
            }`;

            const variables = GitHubApi.extractFSQueryVariables(uri);
            Logger.log(query, JSON.stringify(variables));

            const rsp = await this.client.request<{ repository: { object: T } }>(query, variables);
            return rsp.repository.object;
        }
        catch (ex) {
            Logger.error(ex);
            return undefined;
        }
    }

    async repositoryShaQuery(owner: string, repo: string): Promise<string | undefined> {
        try {
            const query = `query repo($owner: String!, $repo: String!) {
                repository(owner:$owner, name:$repo) {
                    defaultBranchRef {
                        target {
                            oid
                        }
                    }
                }
            }`;

            const variables = { owner: owner, repo: repo };
            Logger.log(query, JSON.stringify(variables));

            const rsp = await this.client.request<{ repository: { defaultBranchRef: { target: { oid: string } } } }>(query, variables);
            if (rsp.repository == null) return undefined;

            return rsp.repository.defaultBranchRef.target.oid;
        }
        catch (ex) {
            Logger.error(ex);
            return undefined;
        }
    }

    async repositoriesQuery(owner: string): Promise<Repository[]> {
        try {
            const query = `query repos($owner: String!) {
                repositoryOwner(login:$owner) {
                    repositories(first: 20, orderBy: { field: STARGAZERS, direction: DESC }) {
                        edges {
                            node {
                                name,
                                description,
                                url
                            }
                        }
                    }
                }
            }`;

            const variables = { owner: owner };
            Logger.log(query, JSON.stringify(variables));

            const rsp = await this.client.request<{ repositoryOwner: { repositories: { edges: { node: Repository }[] } } }>(query, variables);
            if (rsp.repositoryOwner == null) return [];

            return rsp.repositoryOwner.repositories.edges.map(e => e.node);
        }
        catch (ex) {
            Logger.error(ex);
            return [];
        }
    }

    private static extractFSQueryVariables(uri: Uri): Variables {
        const [owner, repo, path] = GitHubFileSystemProvider.extractRepoInfo(uri);

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
}
