export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['repo', 'wasm', 'worker', 'domain', 'producer', 'dashboard', 'settings', 'ui', 'ci', 'deps'],
    ],
  },
};
