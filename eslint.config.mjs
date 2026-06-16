// eslint-config-next 16 ships a native flat config — import it directly.
// (The old FlatCompat `extends('next/core-web-vitals')` path crashes on ESLint 9
// with "Converting circular structure to JSON" inside @eslint/eslintrc.)
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'scripts/**',
      'public/sw.js',
      'next-env.d.ts',
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
    ],
  },
]

export default eslintConfig
