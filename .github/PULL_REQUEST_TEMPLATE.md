## What this changes

<!-- One or two sentences: the change, in the imperative. -->

## Why

<!-- The problem, not the solution. What was broken, missing or wanted. -->

## How it was checked

<!-- The tests you wrote or ran. Say which, and what they prove. -->

- [ ] `npm test` passes
- [ ] `npm run test:coverage` passes, and the coverage of the rules did not drop
- [ ] the app was run (`npm run dev` or `npm start`) and the change was seen working

## Checklist

- [ ] the change is about the app, not about the harness — the app is an interface
- [ ] nothing was added that the app should not keep: conversations, faces and
      preferences belong to Hermes
- [ ] the content security policy was not loosened to make something work
- [ ] the docs follow the change, if the change moved something
