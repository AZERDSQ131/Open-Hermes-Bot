# Working together

More than one agent on this repository at the same time is normal, and it is
where most of the lost time goes: two agents in one checkout, one of them
writing to `src/styles.css` while the other is reading it, a conflict at the
end, and a branch nobody can tell apart from another.

This page says how to work here so that does not happen. It is short on
purpose.

## The one rule

**One agent, one worktree.**

A worktree is a second checkout of the same repository: the same history,
the same files, a separate copy of them on the disk. Two agents in two
worktrees cannot touch the same file — not "should not", *cannot*. The
conflict does not happen because it has nowhere to happen.

The alternative — several agents in one checkout, each on their own branch —
is the thing this page is here to stop.

## The setup

### With T3

A thread that does its own work gets its own worktree. The agent starts
there, and the branch is bound to the thread:

```js
await t3_thread_launch({
  title: "The page of the schedules",
  workspaceStrategy: {
    type: "worktree",
    baseRef: "main",
    branch: "feat/schedules-page",
    startFromOrigin: false,
  },
  message: "…what the thread is to do…",
});
```

A delegated child task takes one too:

```js
await delegate_task({
  task: "…what the child is to do…",
  isolation: "worktree",
  target: { providerInstanceId, model },
});
```

A thread that was started in the main checkout can be moved into its own
worktree later, with `t3_worktree_handoff({ branch: "feat/…" })`. Moving it
is better than starting over: the thread keeps its history.

### Without T3

Plain git does the same thing:

```bash
git worktree add ../grok-bot-schedules -b feat/schedules-page main
cd ../grok-bot-schedules
```

The worktree lives next to the checkout, on its own branch, from `main`.

### The rule for the main checkout

**The main checkout is for reading, and for the merges.** One agent at a
time, and only when it is the one merging. If the main checkout has
uncommitted changes, it is not a worktree that anything else should be
using — and it is a sign that something is already going wrong.

## What to do when two agents want the same file

Some files are touched by every feature. In this repository they are:

| File | Why |
|---|---|
| `src/styles.css` | every page has a style, and they are all in one file |
| `src/App.tsx` | the window: the sidebar, the composer, the settings |
| `electron/main.js` | the shell, and every call to Hermes is in it |
| `src/onboarding.tsx` | the setup, and it grows with every step |

Two ways out, and both are fine:

- **Split by layer.** One agent on `electron/`, one on `src/`, one on
  `docs/`, and a third that ties them together at the end.
- **Split in time.** The agent that owns the file goes first; the other one
  starts from the branch the first one produced.

What does not work is two agents editing `src/styles.css` at the same time
and discovering it at the merge. That is what the worktree is for.

## The branch, the pull request, the merge

```
main  ←  feat/something  ←  the work of one agent
```

- **One pull request, one subject.** Not "the connectors and the update
  button and the setup". A pull request that does three things is three pull
  requests, and it can only be reviewed as one thing.
- **The subject line is the change.** A reader skimming `git log` should
  be able to tell what the branch does.
- **Squash, and the branch dies with it.** The merge button on GitHub
  deletes the branch, and the history of `main` stays one line per pull
  request.
- **Never push to `main`.** It is protected: a pull request is needed, and
  the checks have to pass.

## The version

A version is a tag on `main`, and the tag is what publishes it.

```bash
npm version 1.2.0 --no-git-tag-version   # the number, and the changelog
git add package.json package-lock.json CHANGELOG.md
git commit -m "Prepare 1.2.0"
git tag -a v1.2.0 -m "Hermes Bot 1.2.0"
git push origin main --follow-tags
```

The tag starts the release workflow: the Mac builds the app, the tests run,
and the files are attached to the release the tag made. **The release is
created as a draft** — open it, write the notes, and publish it:

```bash
gh release edit v1.2.0 --draft=false --title "Hermes Bot 1.2.0" --notes "…"
```

If the tag is on the wrong commit, delete it and tag again before anything
was published.

## When something goes wrong

**The working tree has changes nobody can explain.** Somebody is working in
this checkout. Ask before touching it — or, better, move everybody into
worktrees and let the changes be committed by whoever owns them.

**A conflict at the merge.** Look at it as a question, not a fight: both
sides changed the same lines for their own reason. The right answer is
usually to take one side, say why, and move on.

**The history looks like a puzzle.** `git log --oneline --graph --all` shows
the shape of it. A branch whose commits are all on `main` already is a
branch that was merged and not deleted.
