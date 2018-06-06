import { CancellationTokenSource, commands, ConfigurationTarget, Disposable, QuickPickItem, Uri, window, workspace } from 'vscode';
import { configuration, IConfig } from './configuration';
import { GitHubApi } from './gitHubApi';
import { GitHubFileSystemProvider } from './githubFileSystemProvider';
import { Command, createCommandDecorator } from './system';

const commandRegistry: Command[] = [];
const command = createCommandDecorator(commandRegistry);

const repositoryRegex = /^(?:https:\/\/github.com\/)?(.+?)\/(.+)/i;
const ownerRegex = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

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

    @command('openRepository')
    async openRepository() {
        if (!(await this.ensureTokens())) return;

        const result = await window.showInputBox({
            placeHolder: 'e.g. eamodio/vscode-gitlens or https://github.com/eamodio/vscode-gitlens',
            prompt: 'Enter a GitHub repository to open',
            validateInput: (value: string) => repositoryRegex.test(value) ? undefined : 'Must be a valid GitHub repository',
            ignoreFocusOut: true
        });

        if (!result) return;

        const match = repositoryRegex.exec(result);
        if (match == null) return;

        const [, owner, repo] = match;
        this.openWorkspace(Uri.parse(`${GitHubFileSystemProvider.Scheme}://${owner}/${repo}`), `github.com/${owner}/${repo}`);
    }

    @command('openRepositoryByOwner')
    async openRepositoryByOwner() {
        if (!(await this.ensureTokens())) return;

        let invalidValue: string | undefined;
        while (true) {
            const owner = await window.showInputBox({
                placeHolder: 'e.g. eamodio or Microsoft',
                prompt: 'Enter a GitHub username or organization',
                value: invalidValue,
                validateInput: (value: string) => (invalidValue !== value) && ownerRegex.test(value) ? undefined : 'Must be a valid GitHub username',
                ignoreFocusOut: true
            });

            if (!owner) return;

            const cancellation = new CancellationTokenSource();

            const pick = await window.showQuickPick(
                this.getRepositories(owner, cancellation),
                {
                    placeHolder: `Choose which ${owner} repository to open`
                },
                cancellation.token
            );

            if (pick === undefined) {
                if (cancellation.token.isCancellationRequested) {
                    invalidValue = owner;
                    continue;
                }

                return;
            }

            this.openWorkspace(Uri.parse(`${GitHubFileSystemProvider.Scheme}://${owner}/${pick.label}`), `github.com/${owner}/${pick.label}`);
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

    openWorkspace(uri: Uri, name?: string) {
        if (workspace.workspaceFolders === undefined || workspace.workspaceFolders.length === 0) {
            return workspace.updateWorkspaceFolders(0, 0, { uri, name });
        }
        return workspace.updateWorkspaceFolders(0, workspace.workspaceFolders.length, { uri, name });
    }

    private async getRepositories(owner: string, cancellation: CancellationTokenSource) {
        const repos = await this._github.repositoriesQuery(owner);
        if (repos.length === 0) {
            cancellation.cancel();
            return [];
        }

        return repos.map(r => ({ label: r.name, description: r.url, detail: r.description } as QuickPickItem));
    }
}
