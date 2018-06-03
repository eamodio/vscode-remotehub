# RemoteHub

RemoteHub is a proof-of-concept extension that allows for remotely browsing a GitHub repository.

## Features

- Adds a `Open GitHub Repository` command (`remotehub.openRepository`) to open a remote GitHub repository for browsing

## Requirements

### Generate a GitHub personal access token

RemoteHub requires a personal access token to authenticate to GitHub’s GraphQL API. [Follow the steps](https://help.github.com/articles/creating-an-access-token-for-command-line-use/) in the GitHub guide, enabling the following scopes:

![Generate Token](images\generate-token.png)

Copy the generated access token to your clipboard and paste it into the input box or into your `settings.json` as follows:
```json
    "remotehub.token": "<your-token-here>"
```

## RemoteHub Settings

|Name | Description
|-----|------------
|`remotehub.token`|Specifies GitHub personal access token to use for authentication with the GitHub GraphQL API
|`remotehub.traceLevel`|Specifies how much (if any) output will be sent to the RemoteHub output channel