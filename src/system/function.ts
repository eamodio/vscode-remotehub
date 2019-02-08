'use strict';

interface IPropOfValue {
    (): any;
    value: string | undefined;
}

export namespace Functions {
    const comma = ',';
    const empty = '';
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
        fnBody = fnBody.replace(fnBodyStripCommentsRegex, empty) || fnBody;
        fnBody = fnBody.slice(0, fnBody.indexOf(openBrace));

        let open = fnBody.indexOf(openParen);
        let close = fnBody.indexOf(closeParen);

        open = open >= 0 ? open + 1 : 0;
        close = close > 0 ? close : fnBody.indexOf(equals);

        fnBody = fnBody.slice(open, close);
        fnBody = `(${fnBody})`;

        const match = fnBody.match(fnBodyRegex);
        return match != null
            ? match[1].split(comma).map(param => param.trim().replace(fnBodyStripParamDefaultValueRegex, empty))
            : [];
    }

    export function isPromise(o: any): o is Promise<any> {
        return (typeof o === 'object' || typeof o === 'function') && typeof o.then === 'function';
    }

    export function propOf<T, K extends Extract<keyof T, string>>(o: T, key: K) {
        const propOfCore = <T, K extends Extract<keyof T, string>>(o: T, key: K) => {
            const value: string =
                (propOfCore as IPropOfValue).value === undefined ? key : `${(propOfCore as IPropOfValue).value}.${key}`;
            (propOfCore as IPropOfValue).value = value;
            const fn = <Y extends Extract<keyof T[K], string>>(k: Y) => propOfCore(o[key], k);
            return Object.assign(fn, { value: value });
        };
        return propOfCore(o, key);
    }
}
