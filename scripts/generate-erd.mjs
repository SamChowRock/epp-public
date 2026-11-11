import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import helper from '@prisma/generator-helper';

const dbName = (item) => item.dbName ?? item.name;
const scalar = (model, name) => model.fields.find((field) => field.name === name);

function diagram(models) {
  const lines = ['# EPP 数据模型', '', '```mermaid', 'erDiagram'];
  const edges = [];
  for (const model of models) {
    const relations = model.fields.filter((field) => field.kind === 'object');
    const primary =
      model.primaryKey?.fields ?? model.fields.filter((f) => f.isId).map((f) => f.name);
    const uniqueKeys = [
      primary,
      ...model.uniqueFields,
      ...model.fields.filter((f) => f.isUnique).map((f) => [f.name]),
    ];
    const foreign = new Set(relations.flatMap((field) => field.relationFromFields ?? []));
    lines.push('  ' + dbName(model) + ' {');
    for (const field of model.fields.filter((f) => f.kind !== 'object')) {
      const keys = [];
      if (primary.includes(field.name)) keys.push('PK');
      if (foreign.has(field.name)) keys.push('FK');
      if (field.isUnique) keys.push('UK');
      lines.push(
        ['    ' + field.type, dbName(field), keys.join(','), field.isRequired ? '' : '"nullable"']
          .filter(Boolean)
          .join(' '),
      );
    }
    lines.push('  }');
    for (const relation of relations) {
      const target = models.find((m) => m.name === relation.type);
      const from = relation.relationFromFields ?? [];
      if (!from.length) {
        const inverse = target.fields.find(
          (f) =>
            f.kind === 'object' &&
            f.type === model.name &&
            f.relationName === relation.relationName &&
            f.relationFromFields?.length,
        );
        if (!inverse)
          throw Error('Expected an explicit foreign key for ' + model.name + '.' + relation.name);
        continue;
      }
      const columns = from.map((name) => scalar(model, name));
      const targets = relation.relationToFields.map((name) => dbName(scalar(target, name)));
      const oneChild = uniqueKeys.some(
        (key) => key.length && key.every((name) => from.includes(name)),
      );
      const connector = from.every((name) => primary.includes(name)) ? '--' : '..';
      const oneParent = columns.every((field) => field.isRequired);
      const label = columns.map(dbName).join(', ') + ' to ' + targets.join(', ');
      const left = oneChild ? '|o' : '}o';
      const right = oneParent ? '||' : 'o|';
      edges.push(`  ${dbName(model)} ${left}${connector}${right} ${dbName(target)} : "${label}"`);
    }
  }
  return [...lines, ...edges, '```', ''].join('\n');
}

helper.generatorHandler({
  onManifest: () => ({ prettyName: 'EPP ERD', defaultOutput: '../dist/ERD.md' }),
  async onGenerate({ dmmf, generator }) {
    const output = generator.output.value;
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, diagram(dmmf.datamodel.models));
  },
});
