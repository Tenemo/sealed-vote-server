const fs = require('fs');

const extensions = ['.js', '.ts'];
const { baseUrl } = JSON.parse(
    fs.readFileSync('./tsconfig.json', 'utf8'),
).compilerOptions;

module.exports = {
    presets: [
        [
            '@babel/preset-env',
            {
                targets: "node 16.14",
                useBuiltIns: 'usage',
                corejs: 3,
                modules: 'commonjs',
            },
        ],
        '@babel/preset-typescript',
    ],
    plugins: [
        [
            'module-resolver',
            {
                extensions,
                root: [baseUrl],
            },
        ],
    ],
    ignore: ['node_modules'],
};
