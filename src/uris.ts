'use strict';
import { Uri } from 'vscode';
import { fileSystemScheme } from './constants';
import { Strings } from './system';
import * as path from 'path';

type RepoInfo = [string, string, string | undefined];
export function fromRemoteHubUri(uri: Uri): RepoInfo {
    const [, owner, repo, ...rest] = uri.path.split('/');

    return [owner, repo, rest.join('/')];
}

export function joinPath(uri: Uri, pathFragment: string): Uri {
    return uri.with({
        path: Strings.normalizePath(path.join(uri.path || '/', pathFragment))
    });
}

export function toRemoteHubUri(uri: Uri): Uri {
    const [, owner, repo] = uri.path.split('/');

    // e.g. remotehub://github.com/eamodio/vscode-gitlens/src/extension.ts
    return uri.with({
        scheme: fileSystemScheme,
        path: `/${owner}/${repo}/${uri.fragment}`
    });
}

export function toSourcegraphUri(uri: Uri, rev: string): Uri {
    const [owner, repo, path] = fromRemoteHubUri(uri);

    // e.g. git://github.com/eamodio/vscode-gitlens?<rev>#src/extension.ts
    return uri.with({
        scheme: 'git',
        path: `/${owner}/${repo}`,
        query: rev,
        fragment: path
    });
}
