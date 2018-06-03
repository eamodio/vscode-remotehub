'use strict';
import { Disposable, Event, EventEmitter, FileChangeEvent, FileStat, FileSystemError, FileSystemProvider, FileType, Uri, workspace } from 'vscode';
import { configuration, IConfig } from './configuration';
import { GraphQLClient } from 'graphql-request';
import * as https from 'https';

export class GitHubFileSystemProvider extends Disposable implements FileSystemProvider {

    private readonly _client: GraphQLClient;
    private readonly _disposable: Disposable;

    constructor() {
        super(() => this.dispose());

        const cfg = configuration.get<IConfig>();
        const token = cfg.token;

        this._client = new GraphQLClient('https://api.github.com/graphql', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        this._disposable = Disposable.from(
            workspace.registerFileSystemProvider('remotehub', this, { isCaseSensitive: true })
        );
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    private _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();
    get onDidChangeFile(): Event<FileChangeEvent[]> {
        return this._onDidChangeFile.event;
    }

    watch(): Disposable {
        return { dispose: () => { } };
    }

    async stat(uri: Uri): Promise<FileStat> {
        if (uri.path === '' || uri.path.lastIndexOf('/') === 0) return { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 };

        const data = await this.query<{ __typename: string, byteSize: number | undefined }>(`__typename
        ...on Blob {
            byteSize
        }`, this.variables(uri));

        return {
            type: this.typeToFileType(data && data.__typename),
            size: (data && data.byteSize) || 0,
            ctime: 0,
            mtime: 0
        };
    }

    async readDirectory(uri: Uri): Promise<[string, FileType][]> {
        const data = await this.query<{ entries: { name: string, type: string }[] }>(`... on Tree {
            entries {
              name
              type
            }
        }`, this.variables(uri));

        return ((data && data.entries) || [])
            .map<[string, FileType]>(e => [e.name, this.typeToFileType(e.type)]);
    }

    createDirectory(): void | Thenable<void> {
        throw FileSystemError.NoPermissions;
    }

    async readFile(uri: Uri): Promise<Uint8Array> {
        const data = await this.query<{ isBinary: boolean, text: string }>(`... on Blob { isBinary, text }`, this.variables(uri));

        let buffer;
        if (data && data.isBinary) {
            const chunks: Buffer[] = [];
            buffer = await new Promise<Buffer>(resolve => {
                const owner = uri.authority;
                const [, repo, ...rest] = uri.path.split('/');
                const path = `/HEAD/${rest.join('/')}`;

                // e.g. https://raw.githubusercontent.com/eamodio/vscode-gitlens/HEAD/images/gitlens-icon.png
                const downloadUri = uri.with({ scheme: 'https', authority: 'raw.githubusercontent.com', path: `/${owner}/${repo}${path}` });

                https.get(downloadUri.toString(), rsp => {
                    rsp.setEncoding('binary');

                    rsp.on('data', chunk => {
                        return chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'binary') : chunk);
                    });

                    rsp.on('end', () => {
                        resolve(Buffer.concat(chunks));
                    });
                });
            });
        }
        else {
            buffer = Buffer.from((data && data.text) || '');
        }

        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Uint8Array.BYTES_PER_ELEMENT);
}

    writeFile(): void | Thenable<void> {
        throw FileSystemError.NoPermissions;
    }

    delete(): void | Thenable<void> {
        throw FileSystemError.NoPermissions;
    }

    rename(): void | Thenable<void> {
        throw FileSystemError.NoPermissions;
    }

    copy?(): void | Thenable<void> {
        throw FileSystemError.NoPermissions;
    }

    private async query<T>(innerQuery: string, variables: QueryVariables): Promise<T | undefined> {
        try {
            const query = `query fs($owner: String!, $repo: String!, $path: String) {
                repository(owner:$owner, name:$repo) {
                    object(expression:$path) {
                        ${innerQuery}
                    }
                }
            }`;

            const rsp = await this._client.request<{ repository: { object: T } }>(query, variables);
            return rsp.repository.object;
        }
        catch (ex) {
            debugger;
            return undefined;
        }
    }

    private variables(uri: Uri): QueryVariables {
        const [, repo, ...rest] = uri.path.split('/');
        const path = `HEAD:${rest.join('/')}`;

        return {
            owner: uri.authority,
            repo: repo,
            path: path
        };
    }

    private typeToFileType(type: string | undefined | null) {
        if (type) {
            type = type.toLocaleLowerCase();
        }

        switch (type) {
            case 'blob': return FileType.File;
            case 'tree': return FileType.Directory;
            default: return FileType.Unknown;
        }
    }
}

interface QueryVariables {
    owner: string;
    repo: string;
    path: string;
}
