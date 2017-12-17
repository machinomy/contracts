#!/usr/bin/env node

import * as yargs from 'yargs'
import ContractTemplate from './ContractTemplate'
import * as path from 'path'
import * as glob from 'glob'

let args = yargs
  .option('output', {
    describe: 'Folder for generated files',
    alias: 'o'
  })
  .argv

let pattern = args._[0]
let fileNames = glob.sync(pattern)
if (fileNames.length) {
  fileNames.forEach(fileName => {
    let templatesDir = path.resolve(__dirname, 'templates')
    let outputDir = path.resolve(__dirname, '..', 'build', 'wrappers')
    let transformer = new ContractTemplate(templatesDir, outputDir)
    transformer.render(fileName)
  })
} else {
  console.error(`No Truffle Contract artifact found at ${pattern}`)
  process.exit(1)
}
