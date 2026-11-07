// Regenerates assets/svg/reset.svg as the word "Reset" set in Arial Bold,
// converted to filled path outlines and framed in the same chrome ring as
// minus/plus — this is the ORIGINAL intended design (a real button reading
// "Reset", same as minus/plus read as symbols), reconstructed from the
// actual Arial Bold typeface rather than approximated.
//
// Requires:
//   - Windows with Arial Bold installed at C:/Windows/Fonts/arialbd.ttf
//     (adjust ARIAL_BOLD_PATH below if regenerating on a different OS/font
//     location — there is no cross-platform fallback baked in on purpose,
//     so a missing font fails loudly instead of silently substituting one).
//   - npm install --no-save opentype.js
//
// Run: node tools/generate-reset-text.js
const opentype = require('opentype.js');
const fs = require('fs');
const path = require('path');
const { chromeRing, chromeGeometry, svgDoc } = require('./chrome-ring');

const ARIAL_BOLD_PATH = 'C:/Windows/Fonts/arialbd.ttf';
const SVG_DIR = path.join(__dirname, '..', 'assets', 'svg');
const TEXT = 'Reset';

// Twice the width of minus/plus's square chrome — svgicons2svgfont derives
// each glyph's advance width from its own viewBox aspect ratio (normalize:
// true in build-font.js), so this is what makes the compiled font glyph
// (and therefore the actual status-bar button) render twice as wide, not
// just squeeze wider-looking ink into the same-width cell.
const WIDTH_SCALE = 2;
const { inner: CHROME_INNER, viewBoxWidth: VIEWBOX_WIDTH, viewBoxHeight: VIEWBOX_HEIGHT } = chromeGeometry(WIDTH_SCALE);

const buf = fs.readFileSync(ARIAL_BOLD_PATH);
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const arialBold = opentype.parse(arrayBuffer);

function fmt(n) { return Math.round(n * 1000) / 1000; }

// Transform an opentype.js Path's commands by a uniform scale + translate,
// emitting SVG path command strings directly (so it can be concatenated into
// the same evenodd `d` attribute as the chrome ring).
function transformedPathData(otPath, s, tx, ty) {
    const tp = (x, y) => `${fmt(x * s + tx)},${fmt(y * s + ty)}`;
    const parts = [];
    for (const c of otPath.commands) {
        if (c.type === 'M') parts.push(`M${tp(c.x, c.y)}`);
        else if (c.type === 'L') parts.push(`L${tp(c.x, c.y)}`);
        else if (c.type === 'C') parts.push(`C${tp(c.x1, c.y1)} ${tp(c.x2, c.y2)} ${tp(c.x, c.y)}`);
        else if (c.type === 'Q') parts.push(`Q${tp(c.x1, c.y1)} ${tp(c.x, c.y)}`);
        else if (c.type === 'Z') parts.push('Z');
    }
    return parts.join(' ');
}

// Render at a trial size to measure natural proportions, then compute the
// scale/translate that fits it into the chrome ring's interior with padding.
const TRIAL_SIZE = 100;
const trialPath = arialBold.getPath(TEXT, 0, 0, TRIAL_SIZE);
const bbox = trialPath.getBoundingBox();
const bboxW = bbox.x2 - bbox.x1;
const bboxH = bbox.y2 - bbox.y1;

const PAD_X = 0.7, PAD_Y = 1.7; // inside CHROME_INNER, wider vertical pad keeps caps clear of the ring
const targetX1 = CHROME_INNER.x + PAD_X, targetX2 = CHROME_INNER.x + CHROME_INNER.w - PAD_X;
const targetY1 = CHROME_INNER.y + PAD_Y, targetY2 = CHROME_INNER.y + CHROME_INNER.h - PAD_Y;
const targetW = targetX2 - targetX1, targetH = targetY2 - targetY1;

const scale = Math.min(targetW / bboxW, targetH / bboxH);
const scaledW = bboxW * scale, scaledH = bboxH * scale;
const tx = targetX1 + (targetW - scaledW) / 2 - bbox.x1 * scale;
const ty = targetY1 + (targetH - scaledH) / 2 - bbox.y1 * scale;

const textPathData = transformedPathData(trialPath, scale, tx, ty);

fs.writeFileSync(
    path.join(SVG_DIR, 'reset.svg'),
    svgDoc([chromeRing(WIDTH_SCALE), textPathData], VIEWBOX_WIDTH, VIEWBOX_HEIGHT)
);
console.log(`wrote reset.svg ("${TEXT}" in Arial Bold, ${WIDTH_SCALE}x width) to`, SVG_DIR);
