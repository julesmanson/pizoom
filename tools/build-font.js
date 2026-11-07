// Compiles assets/svg/{minus,reset,plus,centerdot}.svg into
// assets/fonts/vscode.woff + vscode.ttf, assigning each icon the exact
// codepoint its package.json contributes.icons entry expects
// (pizoom-minus/reset/plus = \E900/\E901/\E902; centerdot = \E903, reserved
// but not currently wired to any command icon).
//
// Requires (not committed as project deps — install ad hoc before running):
//   npm install --no-save svgicons2svgfont svg2ttf ttf2woff
//
// Run: node tools/build-font.js
const { SVGIcons2SVGFontStream } = require('svgicons2svgfont');
const svg2ttf = require('svg2ttf');
const ttf2woff = require('ttf2woff');
const fs = require('fs');
const path = require('path');

const SVG_DIR = path.join(__dirname, '..', 'assets', 'svg');
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');

const GLYPHS = [
    { name: 'minus', codepoint: 0xe900 },
    { name: 'reset', codepoint: 0xe901 },
    { name: 'plus', codepoint: 0xe902 },
    { name: 'centerdot', codepoint: 0xe903 }
];

const fontStream = new SVGIcons2SVGFontStream({
    fontName: 'vscode',
    normalize: true,
    fontHeight: 1024,
    log: () => {}
});

const svgOut = path.join(FONT_DIR, 'vscode.svg');
const writeStream = fs.createWriteStream(svgOut);
fontStream.pipe(writeStream).on('finish', () => {
    const svgFontStr = fs.readFileSync(svgOut, 'utf8');
    const ttf = svg2ttf(svgFontStr, {});
    const ttfBuf = Buffer.from(ttf.buffer);
    fs.writeFileSync(path.join(FONT_DIR, 'vscode.ttf'), ttfBuf);

    const woff = ttf2woff(ttfBuf);
    fs.writeFileSync(path.join(FONT_DIR, 'vscode.woff'), Buffer.from(woff.buffer));

    fs.unlinkSync(svgOut); // intermediate only, not a shipped asset

    console.log('built assets/fonts/vscode.ttf + vscode.woff');
}).on('error', (err) => {
    console.error('font stream error', err);
    process.exit(1);
});

for (const g of GLYPHS) {
    const glyphStream = fs.createReadStream(path.join(SVG_DIR, `${g.name}.svg`));
    glyphStream.metadata = { unicode: [String.fromCodePoint(g.codepoint)], name: g.name };
    fontStream.write(glyphStream);
}
fontStream.end();
