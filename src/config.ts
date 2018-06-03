'use strict';

export enum TraceLevel {
    Silent = 'silent',
    Errors = 'errors',
    Verbose = 'verbose',
    Debug = 'debug'
}

export interface IConfig {
    token: string;
    traceLevel: TraceLevel;
}
