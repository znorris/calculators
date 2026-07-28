# Calculators

A collection of useful calculators, hosted at [znorris.github.io/calculators](https://znorris.github.io/calculators/).

## Available Calculators

- **Compensation Comparison** - Compare several job offers over a multi-year horizon: take-home pay from real federal brackets and per-state tax, equity vesting, commission curves, benefits, and what you keep if you leave early.
- **Mortgage Strategy Comparison** - Compare paying extra on your mortgage vs. investing the difference.
- **Home Purchase Comparison** - Compare the true cost of moving: monthly payment, lifetime interest, and how rate changes affect buying power.

## Development

```bash
npm install
npm run dev
npm test
```

Each calculator is a Vite entry point; add new ones to `vite.config.js`.

## SEO

`sitemap.xml` lives in `public/` so the build copies it to the deployed root.

`robots.txt` is **not** here. Crawlers read it only at a domain root, and this
repository publishes under `/calculators/`, so it lives in the
[znorris.github.io](https://github.com/znorris/znorris.github.io) repository and
governs crawling for the whole domain.

## Tax data

`compensation-comparison/calc/data/states.js` is generated. To rebuild it after
updating the collected figures in `generate/sources/`:

```bash
node compensation-comparison/calc/data/generate/generate.mjs
```

Validation is fatal, so a malformed bracket table aborts the write rather than
shipping. Each state record carries a confidence marker and its source.
