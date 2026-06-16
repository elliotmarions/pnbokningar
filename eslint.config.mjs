// eslint-config-next 16 ships a native flat config — import it directly.
// (The old FlatCompat `extends('next/core-web-vitals')` path crashes on ESLint 9
// with "Converting circular structure to JSON" inside @eslint/eslintrc.)
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    // eslint-plugin-react-hooks v7 ships aggressive new "Rules of React" /
    // React Compiler checks. They fire on working, already-shipped code and
    // can't be refactored safely without a local runtime to verify against, so
    // they're kept as warnings (tracked tech-debt) while lint blocks on real
    // errors. Enable incrementally once we can run the app to test each change.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      // Cosmetic — literal quotes in JSX text render fine.
      'react/no-unescaped-entities': 'warn',
    },
  },
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
