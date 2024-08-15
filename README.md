# tiny-workflow

To install dependencies:

```bash
bun install
```

To test:

```bash
bun test
```

Examples:

```bash
bun run examples/guessGame.ts
```

To build node compatible:

```bash
bun run build:npm
```

## TODO

- Support Runtime, Context, Storage

- web component to
  - input flow metadata, flow state log
  - display transition, state, ...

## TO RESEARCH

- TS AST step transition parse

  - check [bun ast discuss](https://github.com/oven-sh/bun/discussions/3763)
  - play at `r_d/test_type_scan.ts`

- How to visual code -> UI workflow

  - check [lang-flow ? ](https://www.langflow.org/)