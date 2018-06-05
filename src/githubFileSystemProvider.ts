'use strict';
import { Disposable, Event, EventEmitter, FileChangeEvent, FileStat, FileSystemError, FileSystemProvider, FileType, Uri, workspace } from 'vscode';
import { GitHubApi } from './api';
import * as https from 'https';

export class GitHubFileSystemProvider extends Disposable implements FileSystemProvider {

    public static readonly Scheme = 'remotehub';

    private readonly _disposable: Disposable;

    constructor(private readonly _api: GitHubApi) {
        super(() => this.dispose());

        this._disposable = Disposable.from(
            workspace.registerFileSystemProvider(GitHubFileSystemProvider.Scheme, this, { isCaseSensitive: true })
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

        const data = await this._api.fsQuery<{ __typename: string, byteSize: number | undefined }>(
            uri,
            `__typename
            ...on Blob {
                byteSize
            }`
        );

        return {
            type: GitHubFileSystemProvider.typeToFileType(data && data.__typename),
            size: (data && data.byteSize) || 0,
            ctime: 0,
            mtime: 0
        };
    }

    async readDirectory(uri: Uri): Promise<[string, FileType][]> {
        const data = await this._api.fsQuery<{ entries: { name: string, type: string }[] }>(
            uri,
            `... on Tree {
                entries {
                name
                type
                }
            }`
        );

        return ((data && data.entries) || [])
            .map<[string, FileType]>(e => [e.name, GitHubFileSystemProvider.typeToFileType(e.type)]);
    }

    createDirectory(): void | Thenable<void> {
        throw FileSystemError.NoPermissions;
    }

    async readFile(uri: Uri): Promise<Uint8Array> {
        const data = await this._api.fsQuery<{ isBinary: boolean, text: string }>(
            uri,
            `... on Blob {
                isBinary,
                text
            }`
        );

        let buffer;
        if (data && data.isBinary) {
            const owner = uri.authority;
            const [, repo, ...rest] = uri.path.split('/');
            const path = `/HEAD/${rest.join('/')}`;

            // e.g. https://raw.githubusercontent.com/eamodio/vscode-gitlens/HEAD/images/gitlens-icon.png
            const downloadUri = uri.with({ scheme: 'https', authority: 'raw.githubusercontent.com', path: `/${owner}/${repo}${path}` });

            buffer = await GitHubFileSystemProvider.downloadBinary(downloadUri);
        }
        else {
            buffer = Buffer.from((data && data.text) || '');
        }

        return GitHubFileSystemProvider.bufferToUint8Array(buffer);
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

    private static bufferToUint8Array(buffer: Buffer): Uint8Array {
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Uint8Array.BYTES_PER_ELEMENT);
    }

    private static async downloadBinary(uri: Uri) {
        return new Promise<Buffer>(resolve => {
            const chunks: Buffer[] = [];

            https.get(uri.toString(), rsp => {
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

    private static typeToFileType(type: string | undefined | null) {
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
