// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // 這些是 React Compiler 的規則。茄記沿用網頁版「直接改同一份 state 物件、改完呼叫 store.change()」的寫法，
    // 沒有開 React Compiler（app.json 沒有 experiments.reactCompiler），所以這幾條不適用。
    // 之後若要開 Compiler，要先把 store 改成不可變資料，再把這幾條打開。
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/globals': 'off',
    },
  },
]);
