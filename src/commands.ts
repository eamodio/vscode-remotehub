'use strict';
import {
    CancellationTokenSource,
    commands,
    ConfigurationTarget,
    Disposable,
    QuickPickItem,
    Uri,
    window,
    workspace
} from 'vscode';
import { configuration } from './configuration';
import { fileSystemScheme } from './constants';
import { GitHubApi, Repository } from './gitHubApi';
import { Command, createCommandDecorator } from './system';
import { fromRemoteHubUri } from './uris';

const commandRegistry: Command[] = [];
const command = createCommandDecorator(commandRegistry);

export enum ContextKeys {
    HasWorkspaceFolder = 'remotehub:hasWorkspaceFolder'
}

export function setContext(key: ContextKeys | string, value: any) {
    return commands.executeCommand('setContext', key, value);
}

export class Commands implements Disposable {
    private readonly _disposable: Disposable;

    constructor(private readonly _github: GitHubApi) {
        this._disposable = Disposable.from(
            ...commandRegistry.map(({ name, key, method }) =>
                commands.registerCommand(name, (...args: any[]) => method.apply(this, args))
            )
        );
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    @command('addRepository')
    addRepository() {
        return this.openRepository({ replace: false });
    }

    @command('cloneRepository')
    async cloneRepository() {
        if (!(await this.ensureTokens())) return;

        const pick = await this.showRepositoryPick({
            placeholder: 'Select a repository to open'
        });
        if (!pick) return;

        const url = `${pick.repo.url}.git`;
        commands.executeCommand('git.clone', url);
    }

    @command('cloneOpenedRepository')
    async cloneOpenedRepository() {
        if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
            return;
        }

        const folders = workspace.workspaceFolders.filter(f => f.uri.scheme === fileSystemScheme);
        if (folders.length === 0) return;

        let folder;
        if (folders.length > 1) {
            const editor = window.activeTextEditor;
            if (editor && editor.document) {
                folder = workspace.getWorkspaceFolder(editor.document.uri);
            }
            else {
                while (true) {
                    folder = await window.showWorkspaceFolderPick({
                        placeHolder: 'Choose which workspace to clone'
                    });

                    if (!folder || folder.uri.scheme === fileSystemScheme) {
                        break;
                    }
                }
            }
        }
        else {
            folder = folders[0];
        }

        if (!folder) return;

        const [owner, repo] = fromRemoteHubUri(folder.uri);
        const url = `https://${folder.uri.authority}/${owner}/${repo}.git`;
        commands.executeCommand('git.clone', url);
    }

    @command('openRepository')
    async openRepository(options: { replace: boolean } = { replace: true }) {
        if (!(await this.ensureTokens())) return;

        const pick = await this.showRepositoryPick({
            placeholder: 'Select a repository to open'
        });
        if (!pick) return;

        this.openWorkspace(
            Uri.parse(`${fileSystemScheme}://github.com/${pick.repo.nameWithOwner}`),
            `github.com/${pick.repo.nameWithOwner}`,
            options.replace
        );
    }

    async ensureTokens() {
        if (!this._github.token) {
            const token = await window.showInputBox({
                placeHolder: 'Generate a personal access token from github.com (required)',
                prompt: 'Enter a GitHub personal access token',
                validateInput: (value: string) => (value ? undefined : 'Must be a valid GitHub personal access token'),
                ignoreFocusOut: true
            });
            if (!token) return false;

            await configuration.update(configuration.name('githubToken').value, token, ConfigurationTarget.Global);
        }

        return true;
    }

    openWorkspace(uri: Uri, name: string, replace: boolean) {
        const count = (workspace.workspaceFolders && workspace.workspaceFolders.length) || 0;
        return workspace.updateWorkspaceFolders(replace ? 0 : count, replace ? count : 0, { uri: uri, name: name });
    }

    private async searchForRepositories(query: string, cancellation: CancellationTokenSource) {
        const repos = await this._github.repositoriesQuery(query);
        if (repos.length === 0) {
            cancellation.cancel();
            return [];
        }

        const items = repos.map<RepositoryQuickPickItem>(r => ({
            label: r.name,
            description: r.url,
            detail: r.description,
            repo: r
        }));

        const goBack: RepositoryQuickPickItem = {
            label: 'go back \u21a9',
            description: '\u00a0\u00a0\u2014\u00a0\u00a0\u00a0 to search again'
        };
        items.splice(0, 0, goBack);

        return items;
    }

    async showRepositoryPick(options: { placeholder: string }): Promise<Required<RepositoryQuickPickItem> | undefined> {
        let initialValue: string | undefined;
        while (true) {
            let query = await window.showInputBox({
                placeHolder:
                    'e.g. vscode-gitlens, eamodio/, eamodio/vscode-gitlens, or https://github.com/eamodio/vscode-gitlens',
                prompt: 'Enter a value or url to use to search for repositories',
                value: initialValue,
                ignoreFocusOut: true
            });

            if (!query) return undefined;

            if (query.endsWith('.git')) {
                query = query.substr(0, query.length - 4);
            }

            const cancellation = new CancellationTokenSource();

            const pick = await window.showQuickPick<RepositoryQuickPickItem>(
                this.searchForRepositories(query, cancellation),
                {
                    placeHolder: options.placeholder
                },
                cancellation.token
            );

            if (pick === undefined) {
                if (cancellation.token.isCancellationRequested) {
                    initialValue = query;
                    continue;
                }

                return undefined;
            }

            if (pick.repo === undefined) {
                initialValue = query;
                continue;
            }

            return pick as Required<RepositoryQuickPickItem>;
        }
    }
}

interface RepositoryQuickPickItem extends QuickPickItem {
    repo?: Repository;
}
