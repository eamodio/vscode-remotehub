# RemoteHub

RemoteHub is a **proof-of-concept** extension that allows for opening a remote GitHub repository as a workspace. Experimental language services (Go to definition, hovers, references, etc) are provided by [Sourcegraph](https://sourcegraph.com) and will only work on public repositories that are enabled and supported by them.

NOTE: This extension is in the **very** early stages and is likely to have lots of bugs and only work in certain cases, so please keep that in mind. Also _please_ file GitHub issues for any questions, features, or issues. Thanks!

## Features

- Adds a `Open GitHub Repository...` command (`remotehub.openRepository`) which allows you to search for a remote GitHub repository to open, replacing the current workspace &mdash; eventually this will open in a new window, once I figure out a good way to do it
- Adds a `Add GitHub Repository to Workspace...` command (`remotehub.addRepository`) which allows you to search for a remote GitHub repository to open in the current workspace
- Adds support for a `remotehub://` uri scheme, e.g. `remotehub://github.com/eamodio/vscode-remotehub` which can be saved into a workspace

## Requirements

### Generate a GitHub personal access token

RemoteHub requires a personal access token to authenticate to GitHub’s GraphQL API. [Follow the steps](https://help.github.com/articles/creating-an-access-token-for-command-line-use/) in the GitHub guide, enabling the following scopes:

![Generate Token](https://raw.githubusercontent.com/eamodio/vscode-remotehub/master/images/generate-token.png)

Copy the generated access token to your clipboard and paste it into the input box or into your `settings.json` as follows:

```json
    "remotehub.githubToken": "<your-token-here>"
```

## RemoteHub Settings

| Name                    | Description                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `remotehub.githubToken` | Specifies the GitHub personal access token to use for authentication with the GitHub GraphQL API |
| `remotehub.traceLevel`  | Specifies how much (if any) output will be sent to the RemoteHub output channel                  |
