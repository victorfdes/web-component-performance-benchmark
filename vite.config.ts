import { defineConfig } from 'vitest/config';

function githubBase(): string {
  const repository = process.env.GITHUB_REPOSITORY;
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!repository || !owner) return '/';
  const name = repository.split('/')[1] ?? '';
  return name.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? '/'
    : `/${name}/`;
}

export default defineConfig({
  base: process.env.BASE_PATH || githubBase(),
  define: {
    __APP_REVISION__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) || 'local'),
  },
  build: {
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
