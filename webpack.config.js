'use strict';
const nodeExternals = require('webpack-node-externals');
const CleanPlugin = require('clean-webpack-plugin');
const WebpackDeepScopeAnalysisPlugin = require('webpack-deep-scope-plugin').default;

module.exports = function(env, argv) {
    env = env || {};
    env.production = !!env.production;
    env.optimizeImages = env.production || !!env.optimizeImages;

    const plugins = [new CleanPlugin(['dist'], { verbose: false })];
    if (env.production) {
        plugins.push(new WebpackDeepScopeAnalysisPlugin());
    }

    return {
        entry: './src/extension.ts',
        mode: env.production ? 'production' : 'development',
        target: 'node',
        devtool: !env.production ? 'eval-source-map' : undefined,
        output: {
            libraryTarget: 'commonjs2',
            filename: 'extension.js',
            devtoolModuleFilenameTemplate: 'file:///[absolute-resource-path]'
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js']
        },
        externals: [nodeExternals()],
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    enforce: 'pre',
                    use: 'tslint-loader'
                },
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/
                }
            ]
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
