'use strict';
import { ExtensionContext, workspace, WorkspaceFoldersChangeEvent } from 'vscode';
import { Commands, ContextKeys, setContext } from './commands';
import { Configuration } from './configuration';
import { fileSystemScheme } from './constants';
import { GitHubApi } from './gitHubApi';
import { GitHubFileSystemProvider } from './gitHubFileSystemProvider';
import { Logger } from './logger';
import { RemoteLanguageProvider } from './remoteLanguageProvider';
import { RemoteSearchProvider } from './remoteSearchProvider';
import { SourcegraphApi } from './sourcegraphApi';

export async function activate(context: ExtensionContext) {
    Logger.initialize(context);
    Configuration.configure(context);

    const github = new GitHubApi();
    const commands = new Commands(github);

    if (!github.token) {
        await commands.ensureTokens();
    }

    const sourcegraph = new SourcegraphApi();
    context.subscriptions.push(
        workspace.onDidChangeWorkspaceFolders(workspaceFoldersChanged),
        github,
        sourcegraph,
        commands,
        new GitHubFileSystemProvider(github),
        new RemoteLanguageProvider(sourcegraph),
        new RemoteSearchProvider(github, sourcegraph)
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
