import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ESLint 9 only reads a flat config. This repo carried `eslint` and
// `eslint-config-next` in devDependencies but no config file at all, so
// `npm run lint` exited 2 before linting a single file. This is the flat config
// eslint-config-next 16 ships (the create-next-app template).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next 16 turns on eslint-plugin-react-hooks v7's React
    // Compiler rules as errors. This app does not use the React Compiler, and
    // `set-state-in-effect` in particular flags the data-fetching pattern this
    // repo MANDATES — useEffect + useState + a req* service call (AGENTS.md,
    // "How code is written here"). When this config was added they accounted
    // for 52 of 54 errors, across ~30 files that predate it.
    //
    // They stay as warnings so the signal remains visible without blocking.
    // Promote them back to errors if the app ever adopts the compiler, and
    // refactor the flagged effects in that same change.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
