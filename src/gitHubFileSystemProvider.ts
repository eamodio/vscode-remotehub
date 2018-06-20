'use strict';
import {
    Disposable,
    Event,
    EventEmitter,
    FileChangeEvent,
    FileStat,
    FileSystemError,
    FileSystemProvider,
    FileType,
    // TextDocument,
    Uri,
    workspace
} from 'vscode';
import { GitHubApi } from './gitHubApi';
import { fileSystemScheme } from './constants';
import { Strings } from './system';
import fetch from 'node-fetch';
import { fromRemoteHubUri } from './uris';

export class GitHubFileSystemProvider
    implements FileSystemProvider, Disposable {
    private readonly _disposable: Disposable;
    private _fsCache = new Map<string, any>();

    constructor(private readonly _github: GitHubApi) {
        this._disposable = Disposable.from(
            workspace.registerFileSystemProvider(fileSystemScheme, this, {
                isCaseSensitive: true
            })
            // workspace.onDidCloseTextDocument(this.onClosedTextDocument, this)
        );
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    private _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();
    get onDidChangeFile(): Event<FileChangeEvent[]> {
        return this._onDidChangeFile.event;
    }

    // private onClosedTextDocument(e: TextDocument) {
    //     if (e.uri.scheme !== fileSystemScheme) return;

    //     console.log(`onClosedTextDocument`, e.uri.toString());
    // }

    watch(): Disposable {
        return { dispose: () => {} };
    }

    async stat(uri: Uri): Promise<FileStat> {
        if (uri.path === '' || uri.path.lastIndexOf('/') === 0) {
            return { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 };
        }

        const data = await this.fsQuery<{
            __typename: string;
            byteSize: number | undefined;
        }>(
            uri,
            `__typename
            ...on Blob {
                byteSize
            }`,
            this._fsCache
        );

        return {
            type: GitHubFileSystemProvider.typeToFileType(
                data && data.__typename
            ),
            size: (data && data.byteSize) || 0,
            ctime: 0,
            mtime: 0
        };
    }

    async readDirectory(uri: Uri): Promise<[string, FileType][]> {
        const data = await this.fsQuery<{
            entries: { name: string; type: string }[];
        }>(
            uri,
            `... on Tree {
                entries {
                    name
                    type
                }
            }`,
            this._fsCache
        );

        return ((data && data.entries) || []).map<[string, FileType]>(e => [
            e.name,
            GitHubFileSystemProvider.typeToFileType(e.type)
        ]);
    }

    createDirectory(): void | Thenable<void> {
        throw FileSystemError.NoPermissions;
    }

    async readFile(uri: Uri): Promise<Uint8Array> {
        const data = await this.fsQuery<{
            oid: string;
            isBinary: boolean;
            text: string;
        }>(
            uri,
            `... on Blob {
                oid,
                isBinary,
                text
            }`
        );

        if (data) {
            this._github.setRevisionForUri(uri, data.oid);
        }

        let buffer;
        if (data && data.isBinary) {
            const [owner, repo, path] = fromRemoteHubUri(uri);
            // e.g. https://raw.githubusercontent.com/eamodio/vscode-gitlens/HEAD/images/gitlens-icon.png
            const downloadUri = uri.with({
                scheme: 'https',
                authority: 'raw.githubusercontent.com',
                path: `/${owner}/${repo}/HEAD/${path}`
            });

            buffer = await GitHubFileSystemProvider.downloadBinary(downloadUri);
        } else {
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

    private async fsQuery<T>(
        uri: Uri,
        query: string,
        cache?: Map<string, any>
    ): Promise<T | undefined> {
        if (cache === undefined) {
            return await this._github.fsQuery<T>(uri, query);
        }

        const key = `${uri.toString()}:${Strings.sha1(query)}`;

        let data = cache.get(key);
        if (data !== undefined) return data as T;

        data = await this._github.fsQuery<T>(uri, query);
        cache.set(key, data);
        return data;
    }

    private static bufferToUint8Array(buffer: Buffer): Uint8Array {
        return new Uint8Array(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength / Uint8Array.BYTES_PER_ELEMENT
        );
    }

    private static async downloadBinary(uri: Uri) {
        const resp = await fetch(uri.toString());
        return resp.buffer();
    }

    private static typeToFileType(type: string | undefined | null) {
        if (type) {
            type = type.toLocaleLowerCase();
        }

        switch (type) {
            case 'blob':
                return FileType.File;
            case 'tree':
                return FileType.Directory;
            default:
                return FileType.Unknown;
        }
    }
}
