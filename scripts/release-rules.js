'use strict';

// The rules of a release: what it must contain, and what the tag must not already
// carry. Pure on purpose - every way these can be wrong is a way a release ships
// broken, so the tests walk all of them, and the file that talks to the disk and
// to GitHub stays a thin harness around this one.
//
// The incident behind it: on `v1.2.0` the workflow went green and
// electron-builder made **two drafts for one tag**, the arm64 `.zip` alone in one
// and every other file in the other. `latest-mac.yml` names both zips, so
// publishing the complete-looking draft would have pointed arm64 at a file in no
// release at all.

// Files electron-builder leaves in the output directory that are not release
// assets. `builder-debug.yml` is the builder's own log; the rest are directories
// holding the unpacked `.app`.
const NOT_ASSETS = new Set(['builder-debug.yml']);

// The three shapes a release needs before it can be a release: one disk image,
// one zip, and the feed the installed app reads to find them.
const REQUIRED_EXTENSIONS = ['.dmg', '.zip', 'latest-mac.yml'];

/** The files in `entries` that belong on a release, sorted.
 *
 * `entries` is a directory listing (`{ name, isFile }`), not a glob: the point is
 * to describe what the build actually left, so a file nobody expected still
 * counts and a file that vanished is visibly absent. */
function expectedArtifacts(entries) {
  return entries
    .filter((entry) => entry.isFile && !NOT_ASSETS.has(entry.name))
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

/** What the local directory is missing before anything is created.
 *
 * Returns human-readable problems, empty when the build can be published. */
function problemsInArtifacts(artifacts) {
  const problems = [];

  if (artifacts.length === 0) {
    problems.push('the build left no files to publish');
  }
  for (const required of REQUIRED_EXTENSIONS) {
    const found = artifacts.some((name) => name.endsWith(required));
    if (!found) {
      const wanted = required === 'latest-mac.yml' ? required : `*${required}`;
      problems.push(`the build left no ${wanted}`);
    }
  }

  return problems;
}

/** How many releases carry this tag.
 *
 * GitHub allows more than one release with the same `tag_name` - two drafts named
 * `v1.2.0` is precisely what happened - so the count matters, not the presence.
 * Handles the two spellings the REST and GraphQL answers use. */
function releasesForTag(releases, tag) {
  return releases.filter((release) => release.tag_name === tag || release.tagName === tag).length;
}

/** Compare what the build made with what the release holds.
 *
 * `assets` is the release's asset list (`{ name, size }`). Sizes are compared
 * because an upload that stops halfway leaves a file that is present and wrong,
 * and the updater reads the sha512 of the bytes, not the name of the file. */
function compareAssets(artifacts, assets, sizes) {
  const problems = [];
  const onRelease = new Set(assets.map((asset) => asset.name));

  for (const name of artifacts) {
    if (!onRelease.has(name)) {
      problems.push(`${name} is in the build but not in the release`);
      continue;
    }
    if (sizes && sizes[name] !== undefined) {
      const asset = assets.find((candidate) => candidate.name === name);
      if (asset.size !== sizes[name]) {
        problems.push(`${name} is ${asset.size} bytes on the release and ${sizes[name]} on disk`);
      }
    }
  }

  for (const asset of assets) {
    if (!artifacts.includes(asset.name)) {
      problems.push(`${asset.name} is in the release but was not made by this build`);
    }
  }

  return problems;
}

/** Everything both modes check, given the facts already gathered.
 *
 * `before` runs ahead of creating anything, `after` on the release it created. */
function checkAll({ mode, tag, artifacts, sizes, releases, assets }) {
  const problems = [];

  if (mode === 'before') {
    problems.push(...problemsInArtifacts(artifacts));

    const existing = releasesForTag(releases, tag);
    if (existing > 1) {
      problems.push(`${tag} already carries ${existing} releases; delete them before releasing`);
    } else if (existing === 1) {
      problems.push(`${tag} already carries a release; delete the draft and run the tag again`);
    }

    return problems;
  }

  if (mode === 'after') {
    const existing = releasesForTag(releases, tag);
    if (existing !== 1) {
      problems.push(`${tag} carries ${existing} releases; a tag carries exactly one`);
    }

    problems.push(...compareAssets(artifacts, assets || [], sizes));

    return problems;
  }

  throw new Error(`unknown mode: ${mode}`);
}

module.exports = {
  NOT_ASSETS,
  REQUIRED_EXTENSIONS,
  expectedArtifacts,
  problemsInArtifacts,
  releasesForTag,
  compareAssets,
  checkAll,
};
