import { rolldown } from 'rolldown';
import {readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import dotenv from "dotenv";
dotenv.config({});

const bundle = await rolldown({
    input: 'libbase.ts',
    treeshake: false
});


const generated = await bundle.generate({
    file: 'lib.js',
    minify: false,
});

const [code] = generated.output;


const marker = '//#LIB_INSERT_HERE#//'
const template = readFileSync('libtemplate.js', {encoding: 'utf8'});
const output = template
    .replaceAll(marker, code.code) // inject library
    // inject environment variables
    .replaceAll("ENV_VITE_SERVER_TYPE", `"${process.env.VITE_SERVER_TYPE}"`)
    .replaceAll("ENV_VITE_CONNECTION", `"${process.env.VITE_CONNECTION}"`)
;

const path = join(process.env.OUT_DIR ?? '.', 'lib.js');

writeFileSync(path, output, {encoding: 'utf8'});
console.log("lib.js generated !")



