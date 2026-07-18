const { execSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadProjectConfig } = require('./project-config');
const { getGitRoot } = require('./git-utils');

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

const repoInfoCache = new Map();

function normalizeGitRemote(remoteUrl) {
  const raw = remoteUrl.trim();
  if (!raw) return null;

  let normalized;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === 'file:') {
        normalized = `file:${decodeURIComponent(parsed.pathname)}`;
      } else {
        normalized = `${parsed.hostname.toLowerCase()}${
          parsed.port ? `:${parsed.port}` : ''
        }/${parsed.pathname.replace(/^\/+/, '')}`;
      }
    } catch {
      normalized = raw;
    }
  } else {
    const scpStyle = raw.match(/^(?:[^@/]+@)?([^:]+):(.+)$/);
    normalized = scpStyle
      ? `${scpStyle[1].toLowerCase()}/${scpStyle[2]}`
      : `file:${path.resolve(raw)}`;
  }

  return normalized
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
}

function getGitRepoInfo(cwd) {
  if (repoInfoCache.has(cwd)) {
    return repoInfoCache.get(cwd);
  }
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const normalizedRemote = normalizeGitRemote(remoteUrl);
    const displayRemote = remoteUrl.replace(/\/+$/, '').replace(/\.git$/i, '');
    const separator = Math.max(
      displayRemote.lastIndexOf('/'),
      displayRemote.lastIndexOf(':'),
    );
    const name = displayRemote.slice(separator + 1) || null;
    const result = { name, normalizedRemote };
    repoInfoCache.set(cwd, result);
    return result;
  } catch {
    const result = { name: null, normalizedRemote: null };
    repoInfoCache.set(cwd, result);
    return result;
  }
}

function getGitRepoName(cwd) {
  return getGitRepoInfo(cwd).name;
}

function getProjectBasePath(cwd) {
  return getGitRoot(cwd) || path.resolve(cwd);
}

function getGeneratedContainerTag(cwd) {
  return `user_project_${sha256(getProjectBasePath(cwd))}`;
}

function getContainerTag(cwd) {
  return getRepoContainerTag(cwd);
}

function getLegacyContainerTag(cwd) {
  return `claudecode_project_${sha256(getProjectBasePath(cwd))}`;
}

function getLegacyCodexUserTag(cwd) {
  let identity = null;
  try {
    identity = execSync('git config user.email', {
      cwd: getProjectBasePath(cwd),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {}
  identity =
    identity || process.env.USER || process.env.USERNAME || os.hostname();
  return `codex_user_${sha256(identity)}`;
}

function getLegacyCodexProjectTag(cwd) {
  return `codex_project_${sha256(getProjectBasePath(cwd))}`;
}

function loadLegacyCodexConfig() {
  try {
    const configPath = path.join(os.homedir(), '.codex', 'supermemory.json');
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

function getLegacyCodexUserTags(cwd) {
  const config = loadLegacyCodexConfig();
  const defaultTag = getLegacyCodexUserTag(cwd);
  const suffix = defaultTag.slice('codex_user_'.length);
  return uniqueTags([
    config?.userContainerTag,
    `${config?.containerTagPrefix || 'codex'}_user_${suffix}`,
    defaultTag,
  ]);
}

function getLegacyCodexProjectTags(cwd) {
  const config = loadLegacyCodexConfig();
  const defaultTag = getLegacyCodexProjectTag(cwd);
  const suffix = defaultTag.slice('codex_project_'.length);
  return uniqueTags([
    config?.projectContainerTag,
    `${config?.containerTagPrefix || 'codex'}_project_${suffix}`,
    defaultTag,
  ]);
}

function sanitizeRepoName(name) {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return (sanitized || 'unknown').slice(0, 95).replace(/_+$/g, '') || 'unknown';
}

function getProjectIdentity(cwd) {
  const basePath = getProjectBasePath(cwd);
  const { normalizedRemote } = getGitRepoInfo(basePath);
  const isolateWorktrees = process.env.SUPERMEMORY_ISOLATE_WORKTREES === 'true';
  let localIdentity = basePath;
  try {
    localIdentity = fs.realpathSync.native(basePath);
  } catch {}
  return sha256(
    !isolateWorktrees && normalizedRemote
      ? normalizedRemote
      : `path:${localIdentity}`,
  );
}

function getLegacyGeneratedRepoContainerTag(cwd) {
  const basePath = getProjectBasePath(cwd);
  const gitRepoName = getGitRepoName(basePath);
  const repoName = gitRepoName || path.basename(basePath) || 'unknown';
  return `repo_${sanitizeRepoName(repoName)}`;
}

function getGeneratedRepoContainerTag(cwd) {
  const basePath = getProjectBasePath(cwd);
  const gitRepoName = getGitRepoName(basePath);
  const repoName = gitRepoName || path.basename(basePath) || 'unknown';
  const shortName = sanitizeRepoName(repoName).slice(0, 72).replace(/_+$/g, '');
  return `repo_${shortName || 'unknown'}__${getProjectIdentity(cwd)}`;
}

function getRepoContainerTag(cwd) {
  const projectConfig = loadProjectConfig(cwd);
  return (
    projectConfig?.repoContainerTag ||
    loadLegacyCodexConfig()?.projectContainerTag ||
    getGeneratedRepoContainerTag(cwd)
  );
}

function getProjectName(cwd) {
  const basePath = getProjectBasePath(cwd);
  const gitRepoName = getGitRepoName(basePath);
  return gitRepoName || path.basename(basePath) || 'unknown';
}

function uniqueTags(tags) {
  return [
    ...new Set(tags.filter((tag) => typeof tag === 'string' && tag.trim())),
  ];
}

function getPersonalReadTags(cwd) {
  const projectConfig = loadProjectConfig(cwd);
  const legacyCodexConfig = loadLegacyCodexConfig();
  return uniqueTags([
    getContainerTag(cwd),
    projectConfig?.personalContainerTag,
    legacyCodexConfig?.userContainerTag,
    getGeneratedContainerTag(cwd),
    getLegacyContainerTag(cwd),
    ...getLegacyCodexUserTags(cwd),
  ]);
}

function getProjectReadTags(cwd) {
  return uniqueTags([
    getRepoContainerTag(cwd),
    getGeneratedRepoContainerTag(cwd),
    getLegacyGeneratedRepoContainerTag(cwd),
    ...getLegacyCodexProjectTags(cwd),
  ]);
}

function getAllReadTags(cwd) {
  return uniqueTags([...getPersonalReadTags(cwd), ...getProjectReadTags(cwd)]);
}

module.exports = {
  sha256,
  getGitRoot,
  normalizeGitRemote,
  getGitRepoName,
  getProjectIdentity,
  getContainerTag,
  getGeneratedContainerTag,
  getLegacyContainerTag,
  getLegacyCodexUserTag,
  getLegacyCodexProjectTag,
  getRepoContainerTag,
  getGeneratedRepoContainerTag,
  getLegacyGeneratedRepoContainerTag,
  getProjectName,
  getPersonalReadTags,
  getProjectReadTags,
  getAllReadTags,
  sanitizeRepoName,
};
