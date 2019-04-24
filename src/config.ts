'use strict';
import { TraceLevel } from './logger';

export enum Search {
    GitHub = 'github',
    Sourcegraph = 'sourcegraph'
}

export interface Config {
    githubToken: string;
    insiders: boolean;
    search: Search;
    outputLevel: TraceLevel;
}
