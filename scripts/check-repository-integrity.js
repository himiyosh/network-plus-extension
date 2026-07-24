const fs = require('fs');
const path = require('path');

const LOCKFILE_VERSION = 3;
const REGISTRY_HOST = 'registry.npmjs.org';
const SHA512_INTEGRITY = /^sha512-[A-Za-z0-9+/]+={0,2}$/;

const getExpectedResolvedUrl = (packagePath, metadata) => {
  const marker = 'node_modules/';
  const installedName = packagePath.slice(packagePath.lastIndexOf(marker) + marker.length);
  const packageName = metadata.name ?? installedName;
  const tarballName = packageName.includes('/') ? packageName.slice(packageName.lastIndexOf('/') + 1) : packageName;

  return `https://${REGISTRY_HOST}/${packageName}/-/${tarballName}-${metadata.version}.tgz`;
};

const validatePackageLock = (lockfile, packageJson) => {
  const errors = [];

  if (lockfile.lockfileVersion !== LOCKFILE_VERSION) {
    errors.push(`package-lock.json must use lockfileVersion ${LOCKFILE_VERSION}`);
  }

  if (!lockfile.packages || typeof lockfile.packages !== 'object') {
    errors.push('package-lock.json must contain a packages object');
    return errors;
  }

  const rootPackage = lockfile.packages[''];
  if (!rootPackage) {
    errors.push('package-lock.json must contain root package metadata');
  } else {
    if (rootPackage.version !== packageJson.version || lockfile.version !== packageJson.version) {
      errors.push('package-lock.json version metadata must match package.json');
    }

    if (JSON.stringify(rootPackage.devDependencies ?? {}) !== JSON.stringify(packageJson.devDependencies ?? {})) {
      errors.push('package-lock.json development dependencies must match package.json');
    }
  }

  for (const [packagePath, metadata] of Object.entries(lockfile.packages)) {
    if (packagePath === '' || metadata.link) {
      continue;
    }

    if (!metadata.resolved) {
      errors.push(`${packagePath} is missing a resolved URL`);
    } else {
      try {
        const resolved = new URL(metadata.resolved);
        if (resolved.protocol !== 'https:' || resolved.hostname !== REGISTRY_HOST) {
          errors.push(`${packagePath} must resolve from https://${REGISTRY_HOST}`);
        } else if (metadata.resolved !== getExpectedResolvedUrl(packagePath, metadata)) {
          errors.push(`${packagePath} resolved URL must match its package identity`);
        }
      } catch {
        errors.push(`${packagePath} has an invalid resolved URL`);
      }
    }

    if (!SHA512_INTEGRITY.test(metadata.integrity ?? '')) {
      errors.push(`${packagePath} must use sha512 integrity`);
    }
  }

  return errors;
};

const main = () => {
  const root = process.cwd();
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const errors = validatePackageLock(lockfile, packageJson);

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('OK: package-lock.json provenance is valid');
};

if (require.main === module) {
  main();
}

module.exports = { validatePackageLock };
