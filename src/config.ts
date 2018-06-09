'use strict';

export enum Search {
    GitHub = 'github',
    Sourcegraph = 'sourcegraph'
}

export enum TraceLevel {
    Silent = 'silent',
    Errors = 'errors',
    Verbose = 'verbose',
    Debug = 'debug'
}

export interface Config {
    githubToken: string;
    search: Search;
    traceLevel: TraceLevel;
}
