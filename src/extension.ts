'use strict';

export const extensionId = 'remotehub';
export const extensionOutputChannelName = 'RemoteHub';
export const qualifiedExtensionId = `eamodio.${extensionId}`;

import { ExtensionContext } from 'vscode';
import { Commands } from './commands';
import { configuration, IConfig } from './configuration';
import { GitHubFileSystemProvider } from './githubFileSystemProvider';
import { GraphQLClient } from 'graphql-request';

export async function activate(context: ExtensionContext) {
    const commands = new Commands();

    const cfg = configuration.get<IConfig>();
    if (!cfg.token) {
        await commands.updateToken();
    }

    const client = new GraphQLClient('https://api.github.com/graphql', {
        headers: {
            Authorization: `Bearer ${cfg.token}`
        }
    });

    context.subscriptions.push(
        commands,
        new GitHubFileSystemProvider(client),
    );
}

export function deactivate() { }
