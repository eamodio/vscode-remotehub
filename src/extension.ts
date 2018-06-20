'use strict';
import {
    ExtensionContext,
    workspace,
    WorkspaceFoldersChangeEvent
} from 'vscode';
import { Commands, ContextKeys, setContext } from './commands';
import { fileSystemScheme } from './constants';
import { GitHubApi } from './gitHubApi';
import { GitHubFileSystemProvider } from './gitHubFileSystemProvider';
import { Logger } from './logger';
import { RemoteLanguageProvider } from './remoteLanguageProvider';
import { SourcegraphApi } from './sourcegraphApi';

export async function activate(context: ExtensionContext) {
    Logger.initialize(context);

    const github = new GitHubApi();
    const commands = new Commands(github);

    if (!github.token) {
        await commands.ensureTokens();
    }

    const sourcegraph = new SourcegraphApi(github);
    context.subscriptions.push(
        workspace.onDidChangeWorkspaceFolders(workspaceFoldersChanged),
        github,
        sourcegraph,
        commands,
        new RemoteLanguageProvider(sourcegraph),
        new GitHubFileSystemProvider(github)
    );

    workspaceFoldersChanged({
        added: workspace.workspaceFolders || [],
        removed: []
    });
}

export function deactivate() {}

function workspaceFoldersChanged(e: WorkspaceFoldersChangeEvent) {
    const folders = e.added.map(f => f.uri.scheme === fileSystemScheme);
    setContext(ContextKeys.HasWorkspaceFolder, folders.length !== 0);
}
