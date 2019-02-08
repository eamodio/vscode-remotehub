'use strict';
import { MessageItem, window } from 'vscode';
import { TraceLevel } from '../../configuration';
import { extensionId } from '../../constants';
import { Logger } from '../../logger';

export function createCommandDecorator(registry: Command[]): (command: string, options?: CommandOptions) => Function {
    return (command: string, options?: CommandOptions) => _command(registry, command, options);
}

export interface CommandOptions {
    customErrorHandling?: boolean;
    showErrorMessage?: string;
}

export interface Command {
    name: string;
    key: string;
    method: Function;
    options: CommandOptions;
}

function _command(registry: Command[], command: string, options: CommandOptions = {}): Function {
    return (target: any, key: string, descriptor: any) => {
        if (!(typeof descriptor.value === 'function')) throw new Error('not supported');

        let method;
        if (!options.customErrorHandling) {
            method = async function(this: any, ...args: any[]) {
                try {
                    return await descriptor.value.apply(this, args);
                }
                catch (ex) {
                    Logger.error(ex);

                    if (options.showErrorMessage) {
                        if (Logger.level !== TraceLevel.Silent) {
                            const actions: MessageItem[] = [{ title: 'Open Output Channel' }];

                            const result = await window.showErrorMessage(
                                `${options.showErrorMessage} \u00a0\u2014\u00a0 ${ex.toString()}`,
                                ...actions
                            );
                            if (result === actions[0]) {
                                Logger.showOutputChannel();
                            }
                        }
                        else {
                            window.showErrorMessage(`${options.showErrorMessage} \u00a0\u2014\u00a0 ${ex.toString()}`);
                        }
                    }
                }
            };
        }
        else {
            method = descriptor.value;
        }

        registry.push({
            name: `${extensionId}.${command}`,
            key: key,
            method: method,
            options: options
        });
    };
}
