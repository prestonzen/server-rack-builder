// Wraps the page fragment in a full HTML document for static hosting (Cloudflare).
import { readFileSync, writeFileSync } from 'node:fs';
const frag = readFileSync(new URL('../src/index.fragment.html', import.meta.url), 'utf8');
const headEnd = frag.indexOf('</style>') + '</style>'.length;
const head = frag.slice(0, headEnd), body = frag.slice(headEnd);
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='4' y='3' width='24' height='26' rx='3' fill='%23d7b586' stroke='%2317202a' stroke-width='2'/%3E%3Cpath d='M9 10h14M9 16h14M9 22h14' stroke='%2317202a' stroke-width='2'/%3E%3C/svg%3E">
${head}
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body.trim()}
</body>
</html>
`;
writeFileSync(new URL('../public/index.html', import.meta.url), html);
console.log('public/index.html written');
