const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const webpack = require('webpack'); //to access built-in plugins

module.exports = {
    entry: {
        'dweb-transports': './index.js',
    },
    output: {
        filename: '[name]-bundle.js',
        path: __dirname + '/dist'
    },
    node: {
        fs: 'empty',
        net: 'empty',
        tls: 'empty',
        crypto: 'empty',
        process: true,
        module: false,
        clearImmediate: false,
        Buffer: true,
        setImmediate: false,
        console: false
    },

    plugins: [
      new webpack.EnvironmentPlugin({
        WOLK_ENV: 'idb',
      })
    ],

    resolve: {
        alias: {
            zlib: 'browserify-zlib-next',
            zlib: 'zlib'
        }
    },
    optimization: {
        minimizer: [
            new UglifyJsPlugin({
                uglifyOptions: {
                    compress: {
                        unused: false,
                        collapse_vars: false // debug has a problem in production without this.
                    }

                    //compress: false
                }
            })
        ]
    }
}
