'use strict';
import { ExtensionContext, workspace, WorkspaceFoldersChangeEvent } from 'vscode';
import { Commands, ContextKeys, setContext } from './commands';
import { Configuration, configuration } from './configuration';
import { fileSystemScheme } from './constants';
import { GitHubApi } from './gitHubApi';
import { GitHubFileSystemProvider } from './gitHubFileSystemProvider';
import { Logger, TraceLevel } from './logger';
import { RemoteLanguageProvider } from './remoteLanguageProvider';
import { RemoteSearchProvider } from './remoteSearchProvider';
import { SourcegraphApi } from './sourcegraphApi';

export async function activate(context: ExtensionContext) {
    Logger.configure(context, configuration.get<TraceLevel>(configuration.name('outputLevel').value));
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

export function deactivate() {
    // nothing to do
}

function workspaceFoldersChanged(e: WorkspaceFoldersChangeEvent) {
    const folders = e.added.map(f => f.uri.scheme === fileSystemScheme);
    setContext(ContextKeys.HasWorkspaceFolder, folders.length !== 0);
}
