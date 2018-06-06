# RemoteHub

RemoteHub is a **proof-of-concept** extension that allows for opening a remote GitHub repository as a workspace. Experimental language services (Go to definition, hovers, references, etc) are provided by [Sourcegraph](https://sourcegraph.com) and will only work on public repositories that are enabled and supported by them.

NOTE: As this extension is in the **very** early stages and is likely to have lots of bugs and only work in certain cases, please avoid negative reviews and file GitHub issues instead.

## Features

- Adds a `Open GitHub Repository...` command (`remotehub.openRepository`) to open, in a new workspace, a remote GitHub repository by its url
- Adds a `Open GitHub Repository By Owner...` command (`remotehub.openRepositoryByOwner`) to open, in a new workspace, a remote GitHub repository by picking from a list (20 max) of the most popular repositories for the specified user or organization

## Requirements

### Generate a GitHub personal access token

RemoteHub requires a personal access token to authenticate to GitHub’s GraphQL API. [Follow the steps](https://help.github.com/articles/creating-an-access-token-for-command-line-use/) in the GitHub guide, enabling the following scopes:

![Generate Token](https://raw.githubusercontent.com/eamodio/vscode-remotehub/master/images/generate-token.png)

Copy the generated access token to your clipboard and paste it into the input box or into your `settings.json` as follows:
```json
    "remotehub.token": "<your-token-here>"
```

## RemoteHub Settings

|Name | Description
|-----|------------
|`remotehub.githubToken`|Specifies the GitHub personal access token to use for authentication with the GitHub GraphQL API
|`remotehub.traceLevel`|Specifies how much (if any) output will be sent to the RemoteHub output channel