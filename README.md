# AiTnt

[Chinese Version](./README_zh.md)

AiTnt is the desktop workspace I built to keep image generation, video generation, reusable assets, node-based workflows, and quick-use scene tools inside one app.

Instead of splitting creative work across scattered folders and disconnected tools, I wanted a single local environment where prompts, outputs, workflows, and model settings stay connected.

## What it does

- image workspace for text-to-image, image-to-image, and local output management
- video workspace for generation tasks, queue-based runs, and export flow
- resource library for prompts, templates, and reusable creative assets
- node canvas for importing, exporting, and organizing workflow logic
- quick apps for repeated production tasks such as product visuals and style variants
- settings center for providers, models, folders, language, and workspace preferences

## Stack

- Electron
- React
- TypeScript
- Vite
- Zustand
- XYFlow
- dnd-kit

## Development

Install dependencies:

```bash
npm install
```

Start the app in development mode:

```bash
npm run dev
```

Build the desktop application:

```bash
npm run build
```

## Project direction

AiTnt is shaped around a few principles:

- keep generation and organization in the same workspace
- make repeatable workflows easier to reuse
- keep local creative production fast to open and easy to continue
- give visual work, prompt assets, and node logic the same importance

## Repository structure

- `src/` application source
- `scripts/` build helpers and preparation scripts
- `build/` application assets and packaging resources
- `public/` static resources used by the app

## Notes

This repository is still evolving with the way I actually work. Some workflows start as fast experiments, and the useful ones get folded back into the app as stable tools or scene-specific modules.
