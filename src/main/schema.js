'use strict';

const Ajv = require('ajv');

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });

function compileSchema(schema) {
  const validate = ajv.compile(schema);
  return (value) => {
    if (validate(value)) return value;
    const issue = validate.errors?.[0];
    const location = issue?.instancePath ? issue.instancePath.slice(1).replaceAll('/', '.') : 'input';
    throw new TypeError(`${location || 'input'} ${issue?.message || 'is invalid'}.`);
  };
}

function nullable(schema) {
  return { anyOf: [schema, { type: 'null' }] };
}

function strictOpenAiSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  if (Array.isArray(schema.anyOf)) return { ...schema, anyOf: schema.anyOf.map(strictOpenAiSchema) };
  if (schema.type === 'array') return { ...schema, items: strictOpenAiSchema(schema.items) };
  if (schema.type !== 'object' || !schema.properties) return { ...schema };
  const originalRequired = new Set(schema.required || []);
  const properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [
    key,
    originalRequired.has(key) ? strictOpenAiSchema(value) : nullable(strictOpenAiSchema(value))
  ]));
  return {
    ...schema,
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  };
}

module.exports = { compileSchema, strictOpenAiSchema };
