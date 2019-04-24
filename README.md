# RemoteHub

RemoteHub is a **proof-of-concept** extension that allows for opening a remote [GitHub](https://github.com) repository as a workspace. Experimental code search and language services (Go to definition, hovers, references, etc) are provided by [Sourcegraph](https://sourcegraph.com) and will only work on public repositories that are enabled and supported by them.

NOTE: This extension is in the **very** early stages and is likely to have lots of bugs and only work in certain cases, so please keep that in mind. Also _please_ file GitHub issues for any questions, features, or issues. Thanks!

## Features

- Adds a `Open GitHub Repository...` command (`remotehub.openRepository`) which allows you to search for a remote GitHub repository to open, replacing the current workspace &mdash; eventually this will open in a new window, once I figure out a good way to do it
- Adds a `Add GitHub Repository to Workspace...` command (`remotehub.addRepository`) which allows you to search for a remote GitHub repository to open in the current workspace
- Adds a `Clone GitHub Repository...` command (`remotehub.cloneRepository`) which allows you to search for a remote GitHub repository to clone
- Adds a `Clone Opened GitHub Repository...` command (`remotehub.cloneOpenedRepository`) which allows you to clone an opened remote GitHub repository
- Adds support for a `remotehub://` uri scheme, e.g. `remotehub://github.com/eamodio/vscode-remotehub` which can be saved into a workspace

## Requirements

### Generate a GitHub personal access token

> If you already have a token saved in the `github.accessToken` setting, you can skip this section as RemoteHub can use that token

RemoteHub requires a personal access token to authenticate to [GitHub](https://github.com)’s GraphQL API. [Follow the steps](https://help.github.com/articles/creating-an-access-token-for-command-line-use/) in the GitHub guide, enabling the following scopes:

![Generate Token](https://raw.githubusercontent.com/eamodio/vscode-remotehub/master/images/generate-token.png)

Copy the generated access token to your clipboard and paste it into the input box or into your `settings.json` as follows:

```json
    "remotehub.githubToken": "<your-token-here>"
```

## RemoteHub Settings

| Name                    | Description                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `remotehub.githubToken` | Specifies the GitHub personal access token to use for authentication with the GitHub GraphQL API                                                               |
| `remotehub.insiders`    | Specifies whether to enable experimental features                                                                                                              |
| `remotehub.search`      | Specifies the remote service to use for repository search<br />`github` - use GitHub search (only filename search)<br />`sourcegraph` - use Sourcegraph search |
| `remotehub.outputLevel` | Specifies how much (if any) output will be sent to the RemoteHub output channel                                                                                |

## Contributors 🙏&#x2764;

A big thanks to the people that have contributed to this project:

- Per Persson ([@md2perpe](https://github.com/md2perpe)) &mdash; [contributions](https://github.com/eamodio/vscode-remotehub/commits?author=md2perpe)

And of course the awesome [vscode](https://github.com/Microsoft/vscode/graphs/contributors) and [sourcegraph](https://github.com/orgs/sourcegraph/people) teams!
