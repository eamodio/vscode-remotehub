import { commands, ConfigurationTarget, Disposable, Uri, window, workspace } from 'vscode';
import { configuration, IConfig } from './configuration';
import { GitHubFileSystemProvider } from './githubFileSystemProvider';
import { Command, createCommandDecorator } from './system';

const commandRegistry: Command[] = [];
const command = createCommandDecorator(commandRegistry);

const urlRegex = /^https:\/\/github.com\/.+?\/.+/;

export class Commands extends Disposable {

    private readonly _disposable: Disposable;

    constructor() {
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
        const cfg = configuration.get<IConfig>();
        if (!cfg.token) {
            if (!(await this.updateToken())) return;
        }

        const result = await window.showInputBox({
            placeHolder: 'e.g. https://github.com/eamodio/vscode-gitlens',
            prompt: 'Enter a GitHub repository url',
            validateInput: (value: string) => urlRegex.test(value) ? undefined : 'Must be a valid GitHub url',
            ignoreFocusOut: true
        });

        if (!result) return;

        const uri = Uri.parse(result.toLocaleLowerCase());
        const [, owner, repo] = uri.path.split('/');

        this.openWorkspace(Uri.parse(`${GitHubFileSystemProvider.Scheme}://${owner}/${repo}`), `github.com/${owner}/${repo}`);
    }

    async updateToken() {
        const token = await window.showInputBox({
            placeHolder: 'Generate a personal access token from github.com',
            prompt: 'Enter a GitHub personal access token',
            validateInput: (value: string) => value ? undefined : 'Must be a valid GitHub personal access token',
            ignoreFocusOut: true
        });

        if (token) {
            await configuration.update(configuration.name('token').value, token, ConfigurationTarget.Global);
            return true;
        }
        return false;
    }

    openWorkspace(uri: Uri, name?: string) {
        if (workspace.workspaceFolders === undefined || workspace.workspaceFolders.length === 0) {
            return workspace.updateWorkspaceFolders(0, 0, { uri, name });
        }
        return workspace.updateWorkspaceFolders(0, workspace.workspaceFolders.length, { uri, name });
    }
}
