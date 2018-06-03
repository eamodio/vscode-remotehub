'use strict';

export const extensionId = 'remotehub';
export const extensionOutputChannelName = 'RemoteHub';
export const qualifiedExtensionId = `eamodio.${extensionId}`;

import { ExtensionContext } from 'vscode';
import { Commands } from './commands';
import { GitHubFileSystemProvider } from './githubFileSystemProvider';

export async function activate(context: ExtensionContext) {
    context.subscriptions.push(
        new Commands(),
        new GitHubFileSystemProvider()
    );
}

export function deactivate() { }
