'use strict';

export const extensionId = 'remotehub';
export const extensionOutputChannelName = 'RemoteHub';
export const qualifiedExtensionId = `eamodio.${extensionId}`;

import { ExtensionContext } from 'vscode';
import { GitHubApi } from './api';
import { Commands } from './commands';
import { configuration, IConfig } from './configuration';
import { GitHubFileSystemProvider } from './githubFileSystemProvider';

export async function activate(context: ExtensionContext) {
    const api = new GitHubApi();
    const commands = new Commands(api);

    const cfg = configuration.get<IConfig>();
    if (!cfg.token) {
        await commands.updateToken();
    }

    context.subscriptions.push(
        commands,
        new GitHubFileSystemProvider(api)
    );
}

export function deactivate() { }
