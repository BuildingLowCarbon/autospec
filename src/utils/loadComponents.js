import {
  mergeById,
} from './customComponentsStore';
import { normalizeSupportStructure } from './supportStructure';
import { normalizeComponentTaxonomy } from './componentTaxonomy';
import { normalizeComponentStructureType } from './componentStructureType';
import publicBase from './publicBase';
let cachedComponents = null;
let cachedDbSources = null;
let cachedUserContent = null;

const normalizeComponent = (component) =>
  normalizeComponentStructureType(normalizeComponentTaxonomy(normalizeSupportStructure(component)));

const fetchJson = async (path) => {
  try {
    const res = await fetch(path);
    if (!res.ok) {
      console.warn(`Impossible de charger ${path} (status ${res.status})`);
      return [];
    }
    const payload = await res.json();
    return Array.isArray(payload) ? payload : [];
  } catch (error) {
    console.error(`Erreur de chargement pour ${path}:`, error);
    return [];
  }
};

const fetchUserContent = async () => {
  if (cachedUserContent) return cachedUserContent;
  try {
    const read = async (url) => {
      const response = await fetch(url, { cache: 'no-store' });
      return response.ok ? response.json() : { items: [], sources: [] };
    };
    const [publicPayload, authenticatedPayload] = await Promise.all([
      read('/api/public/content/components'),
      read('/api/content/components'),
    ]);
    const itemMap = new Map();
    [...(publicPayload.items || []), ...(authenticatedPayload.items || [])]
      .forEach((item) => itemMap.set(String(item.__contentId || item.id), item));
    const sourceMap = new Map();
    [...(publicPayload.sources || []), ...(authenticatedPayload.sources || [])]
      .forEach((source) => sourceMap.set(source.file, source));
    cachedUserContent = {
      items: Array.from(itemMap.values()),
      sources: Array.from(sourceMap.values()),
    };
    return cachedUserContent;
  } catch (error) {
    console.error('Erreur de chargement des composants MongoDB:', error);
    return { items: [], sources: [] };
  }
};

export const fetchDbSources = async (base = publicBase) => {
  if (cachedDbSources) return cachedDbSources;
  const manifestUrl = `${base}/db/db_files.json`;
  const entries = await fetchJson(manifestUrl);
  if (Array.isArray(entries) && entries.length) {
    const seen = new Set();
    const normalized = [];
    entries.forEach((entry) => {
      if (typeof entry === 'string') {
        const file = entry.trim();
        if (!file || !file.toLowerCase().endsWith('.json') || seen.has(file)) return;
        seen.add(file);
        normalized.push({
          file,
          label: file.replace('.json', '').replace(/_/g, ' '),
        });
        return;
      }
      if (!entry || typeof entry !== 'object') return;
      const file = typeof entry.file === 'string' ? entry.file.trim() : '';
      if (!file || !file.toLowerCase().endsWith('.json') || seen.has(file)) return;
      seen.add(file);
      const label = typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : file.replace('.json', '').replace(/_/g, ' ');
      normalized.push({ file, label });
    });
    const userContent = await fetchUserContent();
    cachedDbSources = [...normalized, ...userContent.sources.filter((source) => !seen.has(source.file))];
    return cachedDbSources;
  }
  console.warn('Manifest db_files.json introuvable ou vide.');
  const userContent = await fetchUserContent();
  cachedDbSources = userContent.sources;
  return cachedDbSources;
};

export const fetchDbFilesList = async (base = publicBase) => {
  const sources = await fetchDbSources(base);
  if (Array.isArray(sources) && sources.length) {
    return sources.map((source) => source.file);
  }
  return [];
};

export const loadComponents = async ({ forceRefresh = false } = {}) => {
  if (forceRefresh) {
    cachedComponents = null;
    cachedDbSources = null;
    cachedUserContent = null;
  }
  if (cachedComponents) return cachedComponents;

  const base = publicBase;
  const dbFiles = await fetchDbFilesList(base);
  if (!dbFiles.length) {
    cachedComponents = [];
    return cachedComponents;
  }
  const systemFiles = dbFiles.filter((file) => !file.startsWith('user:') && !file.startsWith('organization:') && !file.startsWith('community:'));
  const [results, userContent] = await Promise.all([
    Promise.all(systemFiles.map((file) =>
      fetchJson(`${base}/db/${file}`).then((items) => items.map((item) =>
        normalizeComponent({ ...item, __sourceFile: file })
      ))
    )),
    fetchUserContent(),
  ]);

  cachedComponents = mergeById([...results.flat(), ...userContent.items.map(normalizeComponent)]);

  return cachedComponents;
};

export const invalidateComponentsCache = () => {
  cachedComponents = null;
  cachedDbSources = null;
  cachedUserContent = null;
};

export default loadComponents;
