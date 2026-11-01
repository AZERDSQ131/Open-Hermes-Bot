'use strict';

// The harness around the release rules: read what the build left, ask GitHub what
// the tag already carries, and say whether it is publishable. All the decisions
// live in `release-rules.js`, which the tests walk in full.
//
//   node scripts/release-check.js --before   ahead of creating the draft
//   node scripts/release-check.js --after    on the draft that was created
//
// Runs inside the release workflow, where `GITHUB_REF_NAME` is the tag,
// `GITHUB_REPOSITORY` is `owner/name`, and `gh` is authenticated.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { expectedArtifacts, checkAll } = require('./release-rules');

function listing(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .map((entry) => ({ name: entry.name, isFile: entry.isFile() }));
}

function sizesOf(directory, names) {
  const sizes = {};
  for (const name of names) {
    sizes[name] = fs.statSync(path.join(directory, name)).size;
  }
  return sizes;
}

function gh(args) {
  const output = execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(output);
}

function main(argv) {
  const mode = argv.includes('--after') ? 'after' : 'before';
  const tag = process.env.GITHUB_REF_NAME;
  const repo = process.env.GITHUB_REPOSITORY;
  const directory = path.join(process.cwd(), 'release');

  if (!tag || !repo) {
    console.error('GITHUB_REF_NAME and GITHUB_REPOSITORY must be set; this runs in the release workflow');
    return 1;
  }

  const artifacts = expectedArtifacts(listing(directory));
  const releases = gh(['api', `repos/${repo}/releases`, '--paginate']);
  const assets = mode === 'after' ? gh(['api', `repos/${repo}/releases/tags/${tag}`]).assets : [];

  const problems = checkAll({
    mode,
    tag,
    artifacts,
    sizes: mode === 'after' ? sizesOf(directory, artifacts) : null,
    releases,
    assets,
  });

  if (problems.length > 0) {
    console.error(`the release for ${tag} is not publishable:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }

  console.log(
    mode === 'before'
      ? `${tag}: ${artifacts.length} files ready, no release for this tag yet`
      : `${tag}: one release, holding all ${artifacts.length} files the build made`,
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
