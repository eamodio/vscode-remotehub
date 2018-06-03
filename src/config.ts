'use strict';

export enum TraceLevel {
    Silent = 'silent',
    Errors = 'errors',
    Verbose = 'verbose',
    Debug = 'debug'
}

export interface IConfig {
    debug: boolean;
    token: string;
    traceLevel: TraceLevel;
}
