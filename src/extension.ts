'use strict';
import { ExtensionContext } from 'vscode';
import { Commands } from './commands';
import { GitHubApi } from './gitHubApi';
import { GitHubFileSystemProvider } from './gitHubFileSystemProvider';
import { Logger } from './logger';
import { RemoteLanguageProvider } from './remoteLanguageProvider';
import { SourcegraphApi } from './sourcegraphApi';

export async function activate(context: ExtensionContext) {
    Logger.configure(context);

    const github = new GitHubApi();
    const commands = new Commands(github);

    if (!github.token) {
        await commands.ensureTokens();
    }

    const sourcegraph = new SourcegraphApi(github);
    context.subscriptions.push(
        github,
        sourcegraph,
        commands,
        new RemoteLanguageProvider(sourcegraph),
        new GitHubFileSystemProvider(github)
    );
}

export function deactivate() {}
