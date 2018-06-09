'use strict';
import { CancellationTokenSource, commands, ConfigurationTarget, Disposable, QuickPickItem, Uri, window, workspace } from 'vscode';
import { configuration, IConfig } from './configuration';
import { fileSystemScheme } from './constants';
import { GitHubApi, Repository } from './gitHubApi';
import { Command, createCommandDecorator } from './system';

const commandRegistry: Command[] = [];
const command = createCommandDecorator(commandRegistry);

export class Commands extends Disposable {

    private readonly _disposable: Disposable;

    constructor(
        private readonly _github: GitHubApi
    ) {
        super(() => this.dispose);

        this._disposable = Disposable.from(
            ...commandRegistry.map(({ name, key, method }) => commands.registerCommand(name, (...args: any[]) => method.apply(this, args)))
        );
    }

    dispose() {
        this._disposable && this._disposable.dispose();
    }

    @command('addRepository')
    async addRepository() {
        return this.openRepository({ replace: false });
    }

    @command('openRepository')
    async openRepository(options: { replace: boolean } = { replace: true}) {
        if (!(await this.ensureTokens())) return;

        let initialValue: string | undefined;
        while (true) {
            const query = await window.showInputBox({
                placeHolder: 'e.g. vscode-gitlens, eamodio/, eamodio/vscode-gitlens, or https://github.com/eamodio/vscode-gitlens',
                prompt: 'Enter a value or url to use to search for repositories',
                value: initialValue,
                ignoreFocusOut: true
            });

            if (!query) return;

            const cancellation = new CancellationTokenSource();

            const pick = await window.showQuickPick<RepositoryQuickPickItem>(
                this.searchForRepositories(query, cancellation),
                {
                    placeHolder: `Select a repository to open`
                },
                cancellation.token
            );

            if (pick === undefined) {
                if (cancellation.token.isCancellationRequested) {
                    initialValue = query;
                    continue;
                }

                return;
            }

            if (pick.repo === undefined) {
                initialValue = query;
                continue;
            }

            this.openWorkspace(Uri.parse(`${fileSystemScheme}://github.com/${pick.repo.nameWithOwner}`), `github.com/${pick.repo.nameWithOwner}`, options.replace);
            break;
        }
    }

    async ensureTokens() {
        const cfg = configuration.get<IConfig>();
        if (!cfg.githubToken) {
            const token = await window.showInputBox({
                placeHolder: 'Generate a personal access token from github.com',
                prompt: 'Enter a GitHub personal access token',
                validateInput: (value: string) => value ? undefined : 'Must be a valid GitHub personal access token',
                ignoreFocusOut: true
            });
            if (!token) return false;

            await configuration.update(configuration.name('githubToken').value, token, ConfigurationTarget.Global);
        }

        return true;
    }

    openWorkspace(uri: Uri, name: string, replace: boolean) {
        const count = (workspace.workspaceFolders && workspace.workspaceFolders.length) || 0;
        return workspace.updateWorkspaceFolders(
            replace ? 0 : count,
            replace ? count : 0,
            { uri, name }
        );
    }

    private async searchForRepositories(query: string, cancellation: CancellationTokenSource) {
        const repos = await this._github.repositoriesQuery(query);
        if (repos.length === 0) {
            cancellation.cancel();
            return [];
        }

        const items = repos.map(r => ({ label: r.name, description: r.url, detail: r.description, repo: r } as RepositoryQuickPickItem));

        items.splice(0, 0, {
            label: `go back \u21a9`,
            description: `\u00a0\u00a0\u2014\u00a0\u00a0\u00a0 to search again`
        } as RepositoryQuickPickItem);

        return items;
    }
}

interface RepositoryQuickPickItem extends QuickPickItem {
    repo?: Repository;
}
