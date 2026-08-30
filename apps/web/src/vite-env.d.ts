/// <reference types="vite/client" />

// The automatic JSX runtime (tsconfig: jsx "react-jsx", jsxImportSource "preact")
// resolves to "preact/jsx-runtime", which ships its own type declarations.
// NO shorthand `declare module` here — that would shadow the real types and
// remove the JSX.IntrinsicElements interface.
