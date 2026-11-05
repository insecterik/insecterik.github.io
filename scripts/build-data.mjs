#!/usr/bin/env node
/**
 * Genera data.json a partir de los archivos Markdown de content/.
 *
 * Uso:
 *   node scripts/build-data.mjs
 *
 * El resultado se publica junto con el sitio para que las páginas no
 * dependan de la API de GitHub (límite de 60 peticiones/hora por IP).
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'content');
const OUTPUT = join(ROOT, 'data.json');

const FOLDERS = [
  'reinos',
  'grupos',
  'subgrupos',
  'categorias',
  'subcategorias',
  'especies',
  'colecciones'
];

function cleanValue(value) {
  let out = String(value == null ? '' : value).trim();
  if (out.length >= 2) {
    const first = out.charAt(0);
    const last = out.charAt(out.length - 1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      out = out.slice(1, -1);
    }
  }
  return out;
}

/**
 * Parser suficiente para el front matter que produce Decap CMS:
 * escalares, listas de texto y objetos de un nivel (taxonomia).
 */
function parseFrontMatter(raw) {
  raw = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = /^---\s*\n([\s\S]*?)\n---/.exec(raw);
  if (!match) return {};

  const lines = match[1].split('\n');
  const data = {};
  let currentKey = null;
  let container = null; // 'array' | 'object' | 'unknown'
  let pendingObject = null;

  function flushObjectItem() {
    if (pendingObject && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(pendingObject);
    }
    pendingObject = null;
  }

  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    if (indent === 0) {
      flushObjectItem();
      const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(trimmed);
      if (!kv) continue;

      currentKey = kv[1];
      const value = cleanValue(kv[2]);
      if (value === '') {
        data[currentKey] = null;
        container = 'unknown';
      } else if (value === '[]') {
        data[currentKey] = [];
        container = null;
      } else {
        data[currentKey] = value;
        container = null;
      }
      continue;
    }

    if (!currentKey) continue;

    const listItem = /^-\s+(.*)$/.exec(trimmed);
    if (listItem) {
      if (container !== 'array') {
        data[currentKey] = [];
        container = 'array';
      }
      const item = listItem[1].trim();
      const itemKv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(item);
      if (itemKv) {
        pendingObject = {};
        pendingObject[itemKv[1]] = cleanValue(itemKv[2]);
      } else {
        flushObjectItem();
        data[currentKey].push(cleanValue(item));
      }
      continue;
    }

    const nestedKv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(trimmed);
    if (nestedKv) {
      if (pendingObject) {
        pendingObject[nestedKv[1]] = cleanValue(nestedKv[2]);
        continue;
      }
      if (container !== 'object') {
        data[currentKey] = {};
        container = 'object';
      }
      data[currentKey][nestedKv[1]] = cleanValue(nestedKv[2]);
    }
  }

  flushObjectItem();

  for (const key of Object.keys(data)) {
    if (data[key] === null) data[key] = [];
  }

  return data;
}

async function readFolder(folder) {
  const dir = join(CONTENT, folder);
  let files;
  try {
    files = await readdir(dir);
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }

  files = files.filter((name) => name.toLowerCase().endsWith('.md')).sort();

  return Promise.all(files.map(async (name) => {
    const path = `content/${folder}/${name}`;
    const text = await readFile(join(dir, name), 'utf8');
    const fm = parseFrontMatter(text);
    fm.__path = path;
    fm.__file = basename(name);
    return fm;
  }));
}

async function main() {
  const levels = {};
  for (const folder of FOLDERS) {
    levels[folder] = await readFolder(folder);
  }

  const data = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'content/*.md',
    levels
  };

  await writeFile(OUTPUT, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  const speciesCount = levels.especies.length;
  const collectionCount = levels.colecciones.length;
  console.log(`data.json generado: ${speciesCount} especies, ${collectionCount} colecciones.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
