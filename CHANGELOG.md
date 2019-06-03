# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).

## [0.5.0] - 2019-06-03

### Added

- Adds full searching support for remote repositories via Sourcegraph (default) or GitHub &mdash; controlled by the `remotehub.search` setting
  - Supports fuzzy file searching via the quick open menu
  - Supports text search across the remote repository &mdash; Note: GitHub's code search is quite limited
  - Requires `"remotehub.insiders": true` to be set in your settings and you must run VS Code with the `--enable-proposed-api eamodio.remotehub` command line flag
- Adds _Go to Implementation_ code intelligence support
- Adds an _Open GitHub Repository in New Window..._ command (`remotehub.openRepositoryInNewWindow`) which allows you to search for a remote GitHub repository to open in a new window
- Adds an _Open Current Remote Repository on GitHub..._ command (`remotehub.openCurrentRepositoryOnGitHub`) which allows you to open the current repository on GitHub

### Changed

- Renames _Clone Opened GitHub Repository..._ command (`remotehub.cloneOpenedRepository`) to _Clone Current Remote Repository..._ (`remotehub.cloneCurrentRepository`)

### Fixed

- Fixes Sourcegraph code intelligence (go to definition, hovers, find references, etc)

## [0.2.0] - 2018-06-20

### Added

- Adds ability to use an existing `github.accessToken` setting in place of `remotehub.githubToken`
- Adds a _Clone GitHub Repository..._ command (`remotehub.cloneRepository`) which allows you to search for a remote GitHub repository to clone
- Adds a _Clone Opened GitHub Repository..._ command (`remotehub.cloneOpenedRepository`) which allows you to clone an opened remote GitHub repository

### Fixes

- Fixes issues with symbol search and intermittent failures with hovers and other language features

## [0.1.3] - 2018-06-11

### Added

- Adds simple (naive) caching for file system entries (not file contents at this point)

## [0.1.2] - 2018-06-07

### Added

- Adds an _Add GitHub Repository to Workspace..._ command (`remotehub.addRepository`) which allows you to search for a remote GitHub repository to open in the current workspace
- Adds a _go back_ item to the repository search quick pick menu

### Changed

- Changes the _Open GitHub Repository..._ command (`remotehub.openRepository`) which allows you to search for a remote GitHub repository to open, replacing the current workspace &mdash; eventually this will open in a new window, once I figure out a good way to do it

### Removed

- Removes the _Open GitHub Repository By Owner..._ command (`remotehub.openRepositoryByOwner`) as it is functionality has been included in the _Open GitHub Repository..._ command

## [0.1.1] - 2018-06-06

### Fixed

- Fixes incorrect setting name in README

## [0.1.0] - 2018-06-06

### Added

- Adds experimental language services (Go to definition, hovers, references, etc) provided by [Sourcegraph](https://sourcegraph.com)
  - NOTE: This will only work on public repositories that are enabled and supported by them
- Adds a _Open GitHub Repository By Owner..._ command (`remotehub.openRepositoryByOwner`) to open, in a new workspace, a remote GitHub repository by picking from a list (20 max) of the most popular repositories for the specified user or organization

## [0.0.1] - 2018-06-03

- Initial release
