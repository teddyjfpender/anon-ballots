# Anon-Ballots Creation

This is an example (likely over engineered) of how to use a merkle tree of balances and mint anon ballots in a Protokit `runtimeModule`. Note, the voting weight is not encrypted and while the ballots live at anonymous addresses it is still possible to view which transaction they were created in and therefore the true privacy is not achieved.

![Diagram](public/anonBallots.png)

**Quick start:**

```zsh
npx degit proto-kit/starter-kit#develop my-chain
cd my-chain
npm install
npm run test:watch
```

