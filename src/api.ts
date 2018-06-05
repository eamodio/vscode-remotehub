'use strict';
import { configuration, IConfig } from './configuration';
import { GraphQLClient } from 'graphql-request';
import { Logger } from './logger';
import { Uri } from 'vscode';
import { Variables } from 'graphql-request/dist/src/types';

export class GitHubApi {

    private _client: GraphQLClient | undefined;
    private get client(): GraphQLClient {
        if (this._client === undefined) {
            const cfg = configuration.get<IConfig>();
            if (!cfg.token) throw new Error('No personal access token found');

            this._client = new GraphQLClient('https://api.github.com/graphql', {
                headers: {
                    Authorization: `Bearer ${cfg.token}`
                }
            });
        }
        return this._client;
    }

    refreshToken() {
        this._client = undefined;
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

            const rsp = await this.client.request<{ repository: { object: T } }>(query, GitHubApi.extractFSQueryVariables(uri));
            return rsp.repository.object;
        }
        catch (ex) {
            Logger.error(ex);
            return undefined;
        }
    }

    async repositoriesQuery(owner: string): Promise<Repository[]> {
        try {
            const query = `query repositories($owner: String!) {
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

            const rsp = await this.client.request<{ repositoryOwner: { repositories: { edges: { node: Repository }[] } } }>(query, { owner: owner });
            if (rsp.repositoryOwner == null) return [];

            return rsp.repositoryOwner.repositories.edges.map(e => e.node);
        }
        catch (ex) {
            Logger.error(ex);
            return [];
        }
    }

    private static extractFSQueryVariables(uri: Uri): Variables {
        const [, repo, ...rest] = uri.path.split('/');
        const path = `HEAD:${rest.join('/')}`;

        return {
            owner: uri.authority,
            repo: repo,
            path: path
        };
    }

}

export interface Repository {
    name: string;
    description: string;
    url: string;
}
