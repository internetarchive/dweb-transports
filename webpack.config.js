const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
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

    resolve: {
        alias: {
            zlib: 'browserify-zlib-next'
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