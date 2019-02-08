'use strict';
const path = require('path');
const CleanPlugin = require('clean-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = function(env, argv) {
    env = env || {};
    env.production = Boolean(env.production);

    const plugins = [new CleanPlugin(['dist'], { verbose: false })];

    return {
        name: 'extension',
        entry: './src/extension.ts',
        mode: env.production ? 'production' : 'development',
        target: 'node',
        node: {
            __dirname: false
        },
        devtool: 'source-map',
        output: {
            libraryTarget: 'commonjs2',
            filename: 'extension.js'
        },
        optimization: {
            minimizer: [
                new TerserPlugin({
                    cache: true,
                    parallel: true,
                    sourceMap: true,
                    terserOptions: {
                        ecma: 8,
                        // Keep the class names otherwise @log won't provide a useful name
                        keep_classnames: true,
                        module: true
                    }
                })
            ]
        },
        externals: {
            vscode: 'commonjs vscode',
            bufferutil: 'bufferutil',
            encoding: 'encoding',
            'utf-8-validate': 'utf-8-validate'
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    enforce: 'pre',
                    use: 'tslint-loader',
                    exclude: /node_modules/
                },
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules|\.d\.ts$/
                }
            ],
            // Removes `Critical dependency: the request of a dependency is an expression` from `./node_modules/vsls/vscode.js`
            exprContextRegExp: /^$/,
            exprContextCritical: false
        },
        resolve: {
            extensions: ['.ts', '.tsx', '.js', '.jsx']
            // alias: {
            //     // Required because of https://github.com/bitinn/node-fetch/issues/493#issuecomment-414111024
            //     'node-fetch': path.resolve(__dirname, 'node_modules/node-fetch/lib/index.js')
            // }
        },
        plugins: plugins,
        stats: {
            all: false,
            assets: true,
            builtAt: true,
            env: true,
            errors: true,
            timings: true,
            warnings: true
        }
    };
};
