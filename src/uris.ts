'use strict';
import * as path from 'path';
import { Uri } from 'vscode';
import { fileSystemScheme } from './constants';
import { Strings } from './system';

const sgUrlPathRegex = /^\/(.+?)\/(.+?)@([0-9a-f]{40})\/-\/raw(.*)$/;

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

export function fromSourcegraphUri(uri: Uri): Uri {
    const match = sgUrlPathRegex.exec(uri.path);
    if (match == null) throw new Error('Invalid Uri');

    const [, authority, repo, , path] = match;

    // e.g. remotehub://github.com/eamodio/vscode-gitlens/src/extension.ts
    return uri.with({
        scheme: fileSystemScheme,
        authority: authority,
        path: `/${repo}${path}`
    });
}

export function toSourcegraphUri(uri: Uri, rev?: string, root: boolean = false): Uri {
    const [owner, repo, path] = fromRemoteHubUri(uri);

    // e.g. https://sourcegraph.com/github.com/eamodio/vscode-gitlens@<rev>/-/raw/src/extension.ts
    return uri.with({
        scheme: 'https',
        authority: 'sourcegraph.com',
        path: `${uri.authority}/${owner}/${repo}@${rev}/-/raw/${root ? '' : path}`,
        query: '',
        fragment: ''
    });
}
