const resolve = require("@rollup/plugin-node-resolve");
const commonjs = require("@rollup/plugin-commonjs");
const json = require("@rollup/plugin-json");

/** @type {import('rollup').RollupOptions[]} */
module.exports = [
  {
    input: "src/index.js",
    output: {
      file: "dist/index.cjs.js",
      format: "cjs",
    },
    plugins: [resolve(), commonjs(), json()],
  },
  {
    input: "src/index.mjs",
    output: [
      { file: "dist/index.esm.js", format: "esm" },
      // .mjs so Node treats it as ESM without "type": "module" in package.json.
      { file: "dist/index.esm.mjs", format: "esm" },
    ],
    plugins: [resolve(), commonjs(), json()],
  },
];
