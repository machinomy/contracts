"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs");
const Handlebars = require("handlebars");
const helpers = require("./helpers");
const ABI_TYPE_FUNCTION = 'function';
const ABI_TYPE_EVENT = 'event';
function isAbiFunction(abi) {
    return abi.type === ABI_TYPE_FUNCTION;
}
function isAbiEvent(abi) {
    return abi.type === ABI_TYPE_EVENT;
}
class ContractTemplate {
    constructor(templatesDir, outputDir) {
        this.handlebars = Handlebars.create();
        this.templatesDir = templatesDir;
        this.outputDir = outputDir;
        this.registerPartials();
        this.registerHelpers();
    }
    get template() {
        if (this._template) {
            return this._template;
        }
        else {
            let contents = this.readTemplate('contract.mustache');
            this._template = this.handlebars.compile(contents);
            return this._template;
        }
    }
    readTemplate(name) {
        let file = path.resolve(this.templatesDir, name);
        return fs.readFileSync(file).toString();
    }
    registerPartials() {
        fs.readdirSync(this.templatesDir).forEach(file => {
            let match = file.match(/^_(\w+)\.(handlebars|mustache)/);
            if (match) {
                this.handlebars.registerPartial(match[1], this.readTemplate(file));
            }
        });
    }
    registerHelpers() {
        this.handlebars.registerHelper('inputType', helpers.inputType);
        this.handlebars.registerHelper('outputType', helpers.outputType);
    }
    render(abiFilePath) {
        let artifact = JSON.parse(fs.readFileSync(abiFilePath).toString());
        let abi = artifact.abi;
        if (abi) {
            let methods = abi.filter(isAbiFunction).map((abi) => {
                if (abi.outputs.length === 1) {
                    abi.singleReturnValue = true;
                }
                abi.inputs = abi.inputs.map(input => {
                    input.name = input.name ? input.name : 'index';
                    return input;
                });
                return abi;
            });
            let getters = methods.filter((abi) => abi.constant);
            let functions = methods.filter((abi) => !abi.constant);
            let events = abi.filter(isAbiEvent);
            let contractName = path.parse(abiFilePath).name;
            const basename = path.basename(abiFilePath, path.extname(abiFilePath));
            const filePath = `${this.outputDir}/${basename}.ts`;
            const relativeArtifactPath = path.relative(this.outputDir, abiFilePath);
            let context = {
                artifact: JSON.stringify(artifact, null, 2),
                contractName: contractName,
                relativeArtifactPath: relativeArtifactPath,
                getters: getters,
                functions: functions,
                events: events
            };
            let code = this.template(context);
            fs.writeFileSync(filePath, code);
        }
        else {
            throw new Error(`No ABI found in ${abiFilePath}.`);
        }
    }
}
exports.default = ContractTemplate;
