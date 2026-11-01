'use strict';

// The rules of a release, checked one by one.
//
// Every failure here ends in the same place: a draft someone publishes, or a
// green run that shipped a release missing one of its own files. So each branch
// is walked deliberately - the two drafts of `v1.2.0` are a case in this file,
// not a story in a PR description.

const {
  NOT_ASSETS,
  REQUIRED_EXTENSIONS,
  expectedArtifacts,
  problemsInArtifacts,
  releasesForTag,
  compareAssets,
  checkAll,
} = require('./release-rules');

const BUILD = [
  { name: 'Hermes-Bot-1.2.0-arm64.dmg', isFile: true },
  { name: 'Hermes-Bot-1.2.0-arm64.dmg.blockmap', isFile: true },
  { name: 'Hermes-Bot-1.2.0-arm64.zip', isFile: true },
  { name: 'Hermes-Bot-1.2.0-arm64.zip.blockmap', isFile: true },
  { name: 'Hermes-Bot-1.2.0-x64.dmg', isFile: true },
  { name: 'Hermes-Bot-1.2.0-x64.dmg.blockmap', isFile: true },
  { name: 'Hermes-Bot-1.2.0-x64.zip', isFile: true },
  { name: 'Hermes-Bot-1.2.0-x64.zip.blockmap', isFile: true },
  { name: 'latest-mac.yml', isFile: true },
  { name: 'builder-debug.yml', isFile: true },
  { name: 'mac-arm64', isFile: false },
  { name: '.DS_Store', isFile: true },
];

const ARTIFACTS = [
  'Hermes-Bot-1.2.0-arm64.dmg',
  'Hermes-Bot-1.2.0-arm64.dmg.blockmap',
  'Hermes-Bot-1.2.0-arm64.zip',
  'Hermes-Bot-1.2.0-arm64.zip.blockmap',
  'Hermes-Bot-1.2.0-x64.dmg',
  'Hermes-Bot-1.2.0-x64.dmg.blockmap',
  'Hermes-Bot-1.2.0-x64.zip',
  'Hermes-Bot-1.2.0-x64.zip.blockmap',
  'latest-mac.yml',
];

const SIZES = {
  'Hermes-Bot-1.2.0-arm64.dmg': 1000,
  'Hermes-Bot-1.2.0-arm64.dmg.blockmap': 10,
  'Hermes-Bot-1.2.0-arm64.zip': 900,
  'Hermes-Bot-1.2.0-arm64.zip.blockmap': 9,
  'Hermes-Bot-1.2.0-x64.dmg': 1100,
  'Hermes-Bot-1.2.0-x64.dmg.blockmap': 11,
  'Hermes-Bot-1.2.0-x64.zip': 950,
  'Hermes-Bot-1.2.0-x64.zip.blockmap': 9,
  'latest-mac.yml': 400,
};

const assetsFor = (names) => names.map((name) => ({ name, size: SIZES[name] }));

describe('expectedArtifacts', () => {
  it('lists the files of a real build, and none of its own logs', () => {
    expect(expectedArtifacts(BUILD)).toEqual(ARTIFACTS);
  });

  it('leaves out directories, dotfiles and the builder log', () => {
    const names = expectedArtifacts(BUILD);

    expect(names).not.toContain('mac-arm64');
    expect(names).not.toContain('.DS_Store');
    expect(NOT_ASSETS.has('builder-debug.yml')).toBe(true);
    expect(names).not.toContain('builder-debug.yml');
  });

  it('is sorted, so two runs describe the same release the same way', () => {
    const shuffled = [...BUILD].reverse();

    expect(expectedArtifacts(shuffled)).toEqual(ARTIFACTS);
  });

  it('says nothing at all for an empty directory', () => {
    expect(expectedArtifacts([])).toEqual([]);
  });
});

describe('problemsInArtifacts', () => {
  it('accepts a build holding a disk image, a zip and the feed', () => {
    expect(problemsInArtifacts(ARTIFACTS)).toEqual([]);
  });

  it('names what an empty build left out', () => {
    expect(problemsInArtifacts([])).toEqual([
      'the build left no files to publish',
      'the build left no *.dmg',
      'the build left no *.zip',
      'the build left no latest-mac.yml',
    ]);
  });

  it('names the one file a half-built directory is missing', () => {
    const withoutFeed = ARTIFACTS.filter((name) => name !== 'latest-mac.yml');

    expect(problemsInArtifacts(withoutFeed)).toEqual(['the build left no latest-mac.yml']);
  });

  it('knows the three shapes it looks for', () => {
    expect(REQUIRED_EXTENSIONS).toEqual(['.dmg', '.zip', 'latest-mac.yml']);
  });
});

describe('releasesForTag', () => {
  it('counts the two drafts of v1.2.0 as two', () => {
    const releases = [
      { tag_name: 'v1.2.0', id: 429036484 },
      { tag_name: 'v1.2.0', id: 429036481 },
      { tag_name: 'v1.1.0', id: 420633819 },
    ];

    expect(releasesForTag(releases, 'v1.2.0')).toBe(2);
    expect(releasesForTag(releases, 'v1.1.0')).toBe(1);
  });

  it('counts nothing for a tag nobody released', () => {
    expect(releasesForTag([{ tag_name: 'v1.1.0' }], 'v1.3.0')).toBe(0);
  });

  it('reads the spelling the GraphQL answer uses too', () => {
    expect(releasesForTag([{ tagName: 'v1.3.0' }], 'v1.3.0')).toBe(1);
  });
});

describe('compareAssets', () => {
  it('accepts a release holding every file the build made, at the same size', () => {
    expect(compareAssets(ARTIFACTS, assetsFor(ARTIFACTS), SIZES)).toEqual([]);
  });

  it('reports the arm64 zip that ended up in the other draft', () => {
    const onRelease = ARTIFACTS.filter((name) => name !== 'Hermes-Bot-1.2.0-arm64.zip');

    expect(compareAssets(ARTIFACTS, assetsFor(onRelease), SIZES)).toEqual([
      'Hermes-Bot-1.2.0-arm64.zip is in the build but not in the release',
    ]);
  });

  it('reports a file the release holds that this build did not make', () => {
    const assets = assetsFor([...ARTIFACTS, 'Hermes-Bot-1.1.0-x64.zip']);

    expect(compareAssets(ARTIFACTS, assets, SIZES)).toEqual([
      'Hermes-Bot-1.1.0-x64.zip is in the release but was not made by this build',
    ]);
  });

  it('reports an upload that stopped halfway, because the size is the evidence', () => {
    const assets = assetsFor(ARTIFACTS);
    assets[0] = { name: assets[0].name, size: 12 };

    expect(compareAssets(ARTIFACTS, assets, SIZES)).toEqual([
      'Hermes-Bot-1.2.0-arm64.dmg is 12 bytes on the release and 1000 on disk',
    ]);
  });

  it('compares names only when it is not given the sizes', () => {
    expect(compareAssets(ARTIFACTS, assetsFor(ARTIFACTS), null)).toEqual([]);
  });

  it('skips the size of a file it was given no size for', () => {
    const assets = assetsFor(ARTIFACTS);
    assets[0] = { name: assets[0].name, size: 12 };

    expect(compareAssets(ARTIFACTS, assets, {})).toEqual([]);
  });
});

describe('checkAll', () => {
  const base = { tag: 'v1.3.0', artifacts: ARTIFACTS, sizes: SIZES };

  it('lets a complete build through when the tag carries nothing yet', () => {
    expect(checkAll({ ...base, mode: 'before', releases: [], assets: [] })).toEqual([]);
  });

  it('refuses to publish over a draft left by an earlier run', () => {
    const releases = [{ tag_name: 'v1.3.0' }];

    expect(checkAll({ ...base, mode: 'before', releases, assets: [] })).toEqual([
      'v1.3.0 already carries a release; delete the draft and run the tag again',
    ]);
  });

  it('refuses a tag that already carries two releases, and says how many', () => {
    const releases = [{ tag_name: 'v1.3.0' }, { tag_name: 'v1.3.0' }];

    expect(checkAll({ ...base, mode: 'before', releases, assets: [] })).toEqual([
      'v1.3.0 already carries 2 releases; delete them before releasing',
    ]);
  });

  it('reports the missing files and the existing release together', () => {
    const releases = [{ tag_name: 'v1.3.0' }];

    expect(checkAll({ ...base, mode: 'before', artifacts: [], releases, assets: [] })).toEqual([
      'the build left no files to publish',
      'the build left no *.dmg',
      'the build left no *.zip',
      'the build left no latest-mac.yml',
      'v1.3.0 already carries a release; delete the draft and run the tag again',
    ]);
  });

  it('accepts the release it just created, holding everything', () => {
    const releases = [{ tag_name: 'v1.3.0' }];

    expect(
      checkAll({ ...base, mode: 'after', releases, assets: assetsFor(ARTIFACTS) }),
    ).toEqual([]);
  });

  it('reports a tag that ended up with two releases after the fact', () => {
    const releases = [{ tag_name: 'v1.3.0' }, { tag_name: 'v1.3.0' }];

    expect(checkAll({ ...base, mode: 'after', releases, assets: assetsFor(ARTIFACTS) })).toEqual([
      'v1.3.0 carries 2 releases; a tag carries exactly one',
    ]);
  });

  it('reports a tag carrying no release at all, and the files that went with it', () => {
    expect(checkAll({ ...base, mode: 'after', releases: [], assets: [] })).toEqual([
      'v1.3.0 carries 0 releases; a tag carries exactly one',
      ...ARTIFACTS.map((name) => `${name} is in the build but not in the release`),
    ]);
  });

  it('checks the files even when the release answer carries no assets', () => {
    expect(
      checkAll({ ...base, mode: 'after', releases: [{ tag_name: 'v1.3.0' }], assets: null }),
    ).toEqual(ARTIFACTS.map((name) => `${name} is in the build but not in the release`));
  });

  it('refuses a mode it does not know rather than guessing', () => {
    expect(() => checkAll({ ...base, mode: 'during', releases: [], assets: [] })).toThrow(
      'unknown mode: during',
    );
  });
});
