const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');
const { unzipSync, zipSync } = require('../vendor/fflate');

const EXPECTED_MANIFEST_NAME = 'Network+ for DevTools';
const EXPECTED_CSP = "script-src 'self'; object-src 'self'";
const EXPECTED_PERMISSIONS = Object.freeze(['storage']);
const ALLOWED_MANIFEST_KEYS = Object.freeze([
  'content_security_policy',
  'description',
  'devtools_page',
  'icons',
  'manifest_version',
  'name',
  'permissions',
  'version',
]);
const PRIVILEGED_MANIFEST_SURFACES = Object.freeze([
  'background',
  'content_scripts',
  'externally_connectable',
  'host_permissions',
  'optional_host_permissions',
  'optional_permissions',
  'sandbox',
  'web_accessible_resources',
]);
const HTML_RESOURCE_ATTRIBUTES = Object.freeze({
  audio: 'src',
  embed: 'src',
  iframe: 'src',
  img: 'src',
  input: 'src',
  link: 'href',
  object: 'data',
  script: 'src',
  source: 'src',
  track: 'src',
  video: 'src',
});
const RUNTIME_FILES = Object.freeze([
  'devtools.html',
  'devtools.js',
  'icons/icon128.png',
  'icons/icon16.png',
  'icons/icon48.png',
  'manifest.json',
  'panel.css',
  'panel.html',
  'panel.js',
  'vendor/fflate.js',
]);
const TEXT_RUNTIME_EXTENSIONS = new Set(['.css', '.html', '.js', '.json']);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ZIP_TIMESTAMP = new Date('1980-01-01T00:00:00.000Z');
const PERMISSION_USAGE = Object.freeze({
  storage: /\bchrome\.storage\./,
});

const normalizeEntries = (entries) => Array.from(entries).sort();

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const validateArchiveAllowlist = (entries) => {
  const errors = [];
  const actual = normalizeEntries(entries);
  const expected = normalizeEntries(RUNTIME_FILES);

  for (const file of expected) {
    if (!actual.includes(file)) errors.push(`archive allowlist is missing ${file}`);
  }
  for (const file of actual) {
    if (!expected.includes(file)) errors.push(`archive allowlist contains unexpected file ${file}`);
  }

  return errors;
};

const isPathInside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const inspectRuntimePath = (root, file) => {
  const errors = [];
  const resolvedRoot = path.resolve(root);
  const filePath = path.resolve(resolvedRoot, file);

  if (!isPathInside(resolvedRoot, filePath)) {
    return { errors: [`runtime path escapes extension root: ${file}`], filePath };
  }

  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    return { errors: [`runtime file is missing: ${file}`], filePath };
  }

  if (stat.isSymbolicLink()) {
    return { errors: [`runtime file must not be a symbolic link: ${file}`], filePath };
  }
  if (!stat.isFile()) {
    return { errors: [`runtime path is not a regular file: ${file}`], filePath };
  }

  let realRoot;
  let realFile;
  try {
    realRoot = fs.realpathSync(resolvedRoot);
    realFile = fs.realpathSync(filePath);
  } catch {
    return { errors: [`runtime file real path cannot be resolved: ${file}`], filePath };
  }
  if (!isPathInside(realRoot, realFile)) errors.push(`runtime file resolves outside extension root: ${file}`);

  return { errors, filePath };
};

const readUtf8 = (filePath) => {
  const bytes = fs.readFileSync(filePath);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

const readAttribute = (attributes, name) => {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? match[2] : null;
};

const isLocalReference = (reference) => {
  if (!reference || reference.startsWith('/') || reference.startsWith('\\') || reference.includes('\\')) return false;
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) return false;
  const normalized = path.posix.normalize(reference);
  return normalized === reference && normalized !== '..' && !normalized.startsWith('../');
};

const inspectHtml = (file, html) => {
  const errors = [];
  const resources = [];
  const scripts = [];
  const stylesheets = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const linkPattern = /<link\b([^>]*)>/gi;
  const tagPattern = /<([a-z][\w:-]*)\b([^>]*)>/gi;
  let match;

  while ((match = scriptPattern.exec(html)) !== null) {
    const src = readAttribute(match[1], 'src');
    if (!src) errors.push(`${file} contains a script without src`);
    else if (!isLocalReference(src)) errors.push(`${file} script must be local: ${src}`);
    else scripts.push(src);
    if (match[2].trim()) errors.push(`${file} contains inline script content`);
  }

  while ((match = linkPattern.exec(html)) !== null) {
    if ((readAttribute(match[1], 'rel') ?? '').toLowerCase() !== 'stylesheet') continue;
    const href = readAttribute(match[1], 'href');
    if (!isLocalReference(href)) errors.push(`${file} stylesheet must be local: ${href ?? '(missing)'}`);
    else stylesheets.push(href);
  }

  while ((match = tagPattern.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const attribute = HTML_RESOURCE_ATTRIBUTES[tag];
    if (!attribute) continue;
    const reference = readAttribute(match[2], attribute);
    if (!reference) continue;
    if (!isLocalReference(reference)) errors.push(`${file} ${tag} ${attribute} must be local: ${reference}`);
    else resources.push(reference);
  }

  if (/\son[a-z]+\s*=/i.test(html)) errors.push(`${file} contains an inline event handler`);

  return { errors, resources, scripts, stylesheets };
};

const inspectCss = (file, css) => {
  const errors = [];
  const resources = [];

  if (/@import\b/i.test(css)) errors.push(`${file} must not use CSS @import`);

  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    const reference = match[2].trim();
    if (!isLocalReference(reference)) errors.push(`${file} url() must be local: ${reference || '(missing)'}`);
    else resources.push(reference);
  }

  return { errors, resources };
};

const validateExactReferences = (errors, label, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${label} must reference exactly: ${expected.join(', ')}`);
  }
};

const validateExtension = (root, archiveFiles = RUNTIME_FILES) => {
  const errors = validateArchiveAllowlist(archiveFiles);
  const runtimeBytes = new Map();
  const runtimeText = new Map();

  for (const file of RUNTIME_FILES) {
    const inspectedPath = inspectRuntimePath(root, file);
    errors.push(...inspectedPath.errors);
    if (inspectedPath.errors.length > 0) continue;

    const bytes = fs.readFileSync(inspectedPath.filePath);
    runtimeBytes.set(file, bytes);
    if (TEXT_RUNTIME_EXTENSIONS.has(path.extname(file))) {
      try {
        runtimeText.set(file, readUtf8(inspectedPath.filePath));
      } catch {
        errors.push(`runtime text file is not valid UTF-8: ${file}`);
      }
    }
    if (path.extname(file) === '.png' && !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      errors.push(`runtime icon is not a valid PNG: ${file}`);
    }
  }

  let manifest;
  try {
    manifest = JSON.parse(runtimeText.get('manifest.json') ?? '');
  } catch {
    errors.push('manifest.json must contain valid UTF-8 JSON');
    return errors;
  }

  const manifestKeys = Object.keys(manifest).sort();
  for (const key of manifestKeys) {
    if (!ALLOWED_MANIFEST_KEYS.includes(key)) errors.push(`manifest contains unapproved top-level key: ${key}`);
  }
  for (const key of ALLOWED_MANIFEST_KEYS) {
    if (!hasOwn(manifest, key)) errors.push(`manifest is missing required top-level key: ${key}`);
  }
  for (const surface of PRIVILEGED_MANIFEST_SURFACES) {
    if (hasOwn(manifest, surface)) errors.push(`manifest privileged surface is not allowed: ${surface}`);
  }

  if (manifest.manifest_version !== 3) errors.push('manifest_version must be exactly 3');
  if (manifest.name !== EXPECTED_MANIFEST_NAME) errors.push(`manifest name must be exactly: ${EXPECTED_MANIFEST_NAME}`);
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('manifest version must be a stable MAJOR.MINOR.PATCH value');
  }
  if (manifest.devtools_page !== 'devtools.html') errors.push('manifest devtools_page must be exactly: devtools.html');
  if (
    typeof manifest.description !== 'string' ||
    manifest.description.length === 0 ||
    manifest.description.length > 132
  ) {
    errors.push('manifest description must contain 1 to 132 characters');
  }

  if (JSON.stringify(manifest.permissions) !== JSON.stringify(EXPECTED_PERMISSIONS)) {
    errors.push(`manifest permissions must be exactly: ${EXPECTED_PERMISSIONS.join(', ')}`);
  }

  const javascript = ['devtools.js', 'panel.js'].map((file) => runtimeText.get(file) ?? '').join('\n');
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  for (const permission of permissions) {
    const usage = PERMISSION_USAGE[permission];
    if (!usage) errors.push(`manifest permission has no audited usage rule: ${permission}`);
    else if (!usage.test(javascript)) errors.push(`manifest permission is unused: ${permission}`);
  }
  if (/\bchrome\.downloads\./.test(javascript))
    errors.push('chrome.downloads API is not allowed; use the local anchor download');

  if (manifest.content_security_policy?.extension_pages !== EXPECTED_CSP) {
    errors.push(`manifest CSP must be exactly: ${EXPECTED_CSP}`);
  }
  if (!isLocalReference(manifest.devtools_page)) errors.push('manifest devtools_page must be a local file');
  else if (!archiveFiles.includes(manifest.devtools_page)) {
    errors.push(`manifest devtools_page is not in the archive allowlist: ${manifest.devtools_page}`);
  }

  const expectedIcons = {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  };
  if (JSON.stringify(manifest.icons) !== JSON.stringify(expectedIcons)) {
    errors.push('manifest icons must reference the audited 16, 48, and 128 PNG files');
  }
  for (const icon of Object.values(manifest.icons ?? {})) {
    if (!isLocalReference(icon)) errors.push(`manifest icon must be local: ${icon}`);
    else if (!archiveFiles.includes(icon)) errors.push(`manifest icon is not in the archive allowlist: ${icon}`);
  }

  const devtoolsHtml = inspectHtml('devtools.html', runtimeText.get('devtools.html') ?? '');
  errors.push(...devtoolsHtml.errors);
  validateExactReferences(errors, 'devtools.html scripts', devtoolsHtml.scripts, ['devtools.js']);
  validateExactReferences(errors, 'devtools.html stylesheets', devtoolsHtml.stylesheets, []);

  const panelHtml = inspectHtml('panel.html', runtimeText.get('panel.html') ?? '');
  errors.push(...panelHtml.errors);
  validateExactReferences(errors, 'panel.html scripts', panelHtml.scripts, ['vendor/fflate.js', 'panel.js']);
  validateExactReferences(errors, 'panel.html stylesheets', panelHtml.stylesheets, ['panel.css']);

  const panelCss = inspectCss('panel.css', runtimeText.get('panel.css') ?? '');
  errors.push(...panelCss.errors);

  const staticResources = new Set([...devtoolsHtml.resources, ...panelHtml.resources, ...panelCss.resources]);
  for (const reference of staticResources) {
    if (!archiveFiles.includes(reference)) {
      errors.push(`static resource is not in the archive allowlist: ${reference}`);
    }
    if (!runtimeBytes.has(reference)) errors.push(`static resource is missing: ${reference}`);
  }

  const panelRegistration = (runtimeText.get('devtools.js') ?? '').match(
    /chrome\.devtools\.panels\.create\(\s*['"][^'"]+['"]\s*,\s*['"][^'"]*['"]\s*,\s*['"]([^'"]+)['"]\s*,/,
  );
  if (!panelRegistration || panelRegistration[1] !== 'panel.html') {
    errors.push('devtools.js must register panel.html as the local DevTools panel');
  } else if (!archiveFiles.includes(panelRegistration[1])) {
    errors.push('registered panel.html is not in the archive allowlist');
  }

  return errors;
};

const assertValidExtension = (root, archiveFiles = RUNTIME_FILES) => {
  const errors = validateExtension(root, archiveFiles);
  if (errors.length > 0) throw new Error(errors.join('\n'));
};

const createArchive = (root, archiveFiles = RUNTIME_FILES) => {
  assertValidExtension(root, archiveFiles);
  const files = {};

  for (const file of normalizeEntries(archiveFiles)) {
    const inspectedPath = inspectRuntimePath(root, file);
    if (inspectedPath.errors.length > 0) throw new Error(inspectedPath.errors.join('\n'));
    files[file] = [new Uint8Array(fs.readFileSync(inspectedPath.filePath)), { mtime: ZIP_TIMESTAMP }];
  }

  const archive = Buffer.from(zipSync(files, { level: 9 }));
  assertValidExtension(root, archiveFiles);
  return archive;
};

const validateArchiveEntries = (entries, root) => {
  const errors = validateArchiveAllowlist(Object.keys(entries));

  for (const file of RUNTIME_FILES) {
    if (!entries[file]) continue;
    const inspectedPath = inspectRuntimePath(root, file);
    errors.push(...inspectedPath.errors);
    if (inspectedPath.errors.length > 0) continue;
    if (!Buffer.from(entries[file]).equals(fs.readFileSync(inspectedPath.filePath))) {
      errors.push(`archived content differs from source: ${file}`);
    }
  }

  return errors;
};

const checkArchive = (archive, root) => {
  let entries;
  try {
    entries = unzipSync(new Uint8Array(archive));
  } catch (error) {
    return [`extension archive is not a valid ZIP: ${error.message}`];
  }
  return validateArchiveEntries(entries, root);
};

const checkExtensionPackage = (root) => {
  const sourceErrors = validateExtension(root);
  if (sourceErrors.length > 0) return { archive: null, errors: sourceErrors };
  const archive = createArchive(root);
  return { archive, errors: checkArchive(archive, root) };
};

const writeExtensionPackage = (root) => {
  const { archive, errors } = checkExtensionPackage(root);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  const version = JSON.parse(readUtf8(path.join(root, 'manifest.json'))).version;
  const outputDirectory = path.join(root, 'dist');
  const outputPath = path.join(outputDirectory, `network-plus-extension-${version}.zip`);
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(outputPath, archive);
  return { outputPath, size: archive.length };
};

const main = () => {
  const root = process.cwd();
  const shouldPackage = process.argv.includes('--package');

  try {
    if (shouldPackage) {
      const { outputPath, size } = writeExtensionPackage(root);
      console.log(`OK: wrote ${path.relative(root, outputPath)} (${size} bytes, ${RUNTIME_FILES.length} files)`);
      return;
    }

    const { archive, errors } = checkExtensionPackage(root);
    if (errors.length > 0) throw new Error(errors.join('\n'));
    console.log(
      `OK: extension package integrity valid (${RUNTIME_FILES.length} files, ${archive.length} bytes, permissions: ${EXPECTED_PERMISSIONS.join(', ')})`,
    );
  } catch (error) {
    for (const message of error.message.split('\n')) console.error(`ERROR: ${message}`);
    process.exitCode = 1;
  }
};

if (require.main === module) main();

module.exports = {
  EXPECTED_PERMISSIONS,
  RUNTIME_FILES,
  checkArchive,
  checkExtensionPackage,
  createArchive,
  inspectHtml,
  validateArchiveAllowlist,
  validateArchiveEntries,
  validateExtension,
  writeExtensionPackage,
};
