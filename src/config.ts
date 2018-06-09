'use strict';

export enum TraceLevel {
    Silent = 'silent',
    Errors = 'errors',
    Verbose = 'verbose',
    Debug = 'debug'
}

export interface Config {
    githubToken: string;
    traceLevel: TraceLevel;
}
