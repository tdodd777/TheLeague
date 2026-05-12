import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className="font-display text-4xl sm:text-5xl text-foreground tracking-tight mt-2 mb-6">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="font-display text-2xl sm:text-3xl text-foreground tracking-tight mt-10 mb-3">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="font-display text-xl text-foreground mt-8 mb-2">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className="text-foreground-muted leading-relaxed my-3">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="list-disc pl-6 text-foreground-muted my-3 space-y-1">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal pl-6 text-foreground-muted my-3 space-y-1">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-accent underline-offset-4 hover:underline"
      >
        {children}
      </a>
    ),
    strong: ({ children }) => (
      <strong className="text-foreground font-medium">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="text-foreground italic">{children}</em>
    ),
    code: ({ children }) => (
      <code className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[0.9em] font-mono text-foreground">
        {children}
      </code>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-border pl-4 italic text-foreground-subtle my-4">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-8 border-border" />,
    ...components,
  };
}
