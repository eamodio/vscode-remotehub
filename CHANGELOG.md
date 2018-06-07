# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]
### Added
- Adds a `Add GitHub Repository to Workspace...` command (`remotehub.addRepository`) which allows you to search for a remote GitHub repository to open in the current workspace
- Adds a *go back* item to the repository search quick pick menu

### Changed
- Changes the `Open GitHub Repository...` command (`remotehub.openRepository`) which allows you to search for a remote GitHub repository to open, replacing the current workspace &mdash; eventually this will open in a new window, once I figure out a good way to do it

### Removed
- Removes the `Open GitHub Repository By Owner...` command (`remotehub.openRepositoryByOwner`) as it is functionality has been included in the `Open GitHub Repository...` command

## [0.1.1] - 2018-06-06
### Fixed
- Fixes incorrect setting name in README

## [0.1.0] - 2018-06-06
### Added
- Adds experimental language services (Go to definition, hovers, references, etc) provided by [Sourcegraph](https://sourcegraph.com)
  - NOTE: This will only work on public repositories that are enabled and supported by them
- Adds a `Open GitHub Repository By Owner...` command (`remotehub.openRepositoryByOwner`) to open, in a new workspace, a remote GitHub repository by picking from a list (20 max) of the most popular repositories for the specified user or organization

## [0.0.1] - 2018-06-03
- Initial release