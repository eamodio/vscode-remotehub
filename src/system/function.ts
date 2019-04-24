'use strict';

interface PropOfValue {
    (): any;
    value: string | undefined;
}

export namespace Functions {
    const comma = ',';
    const emptyStr = '';
    const equals = '=';
    const openBrace = '{';
    const openParen = '(';
    const closeParen = ')';

    const fnBodyRegex = /\(([\s\S]*)\)/;
    const fnBodyStripCommentsRegex = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/gm;
    const fnBodyStripParamDefaultValueRegex = /\s?=.*$/;

    export function getParameters(fn: Function): string[] {
        if (typeof fn !== 'function') throw new Error('Not supported');

        if (fn.length === 0) return [];

        let fnBody: string = Function.prototype.toString.call(fn);
        fnBody = fnBody.replace(fnBodyStripCommentsRegex, emptyStr) || fnBody;
        fnBody = fnBody.slice(0, fnBody.indexOf(openBrace));

        let open = fnBody.indexOf(openParen);
        let close = fnBody.indexOf(closeParen);

        open = open >= 0 ? open + 1 : 0;
        close = close > 0 ? close : fnBody.indexOf(equals);

        fnBody = fnBody.slice(open, close);
        fnBody = `(${fnBody})`;

        const match = fnBody.match(fnBodyRegex);
        return match != null
            ? match[1].split(comma).map(param => param.trim().replace(fnBodyStripParamDefaultValueRegex, emptyStr))
            : [];
    }

    export function isPromise<T>(obj: T | Promise<T>): obj is Promise<T> {
        return obj && typeof (obj as Promise<T>).then === 'function';
    }

    export function propOf<T, K extends Extract<keyof T, string>>(o: T, key: K) {
        const propOfCore = <T, K extends Extract<keyof T, string>>(o: T, key: K) => {
            const value: string =
                (propOfCore as PropOfValue).value === undefined ? key : `${(propOfCore as PropOfValue).value}.${key}`;
            (propOfCore as PropOfValue).value = value;
            const fn = <Y extends Extract<keyof T[K], string>>(k: Y) => propOfCore(o[key], k);
            return Object.assign(fn, { value: value });
        };
        return propOfCore(o, key);
    }
}
