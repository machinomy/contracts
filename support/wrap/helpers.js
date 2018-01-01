"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const TYPE_MAPPING = [
    { regex: '^string$', tsType: 'string' },
    { regex: '^address$', tsType: 'string' },
    { regex: '^bool$', tsType: 'boolean' },
    { regex: '^u?int\\d*$', tsType: 'BigNumber' },
    { regex: '^bytes\\d*$', tsType: 'string' },
];
const INPUT_TYPE_MAPPING = [
    { regex: '^u?int(8|16|32)?$', tsType: 'number|BigNumber' }
].concat(TYPE_MAPPING);
const ARRAY_BRACES = /\[\d*\]$/;
function isArray(solidityType) {
    return !!solidityType.match(ARRAY_BRACES);
}
function typeConversion(types, solidityType) {
    if (isArray(solidityType)) {
        const solidityItemType = solidityType.replace(ARRAY_BRACES, '');
        const type = typeConversion(types, solidityItemType);
        return `${type}[]`;
    }
    else {
        let mapping = types.find(mapping => !!solidityType.match(mapping.regex));
        if (mapping) {
            return mapping.tsType;
        }
        else {
            throw new Error(`Unknown Solidity type found: ${solidityType}`);
        }
    }
}
function inputType(solidityType) {
    return typeConversion(INPUT_TYPE_MAPPING, solidityType);
}
exports.inputType = inputType;
function outputType(solidityType) {
    return typeConversion(TYPE_MAPPING, solidityType);
}
exports.outputType = outputType;
