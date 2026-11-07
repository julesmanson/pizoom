// Regenerates assets/svg/minus.svg and plus.svg as pure FILL-based path data
// (no stroke attributes) — required by the icon-font build (build-font.js),
// which only reads fill geometry. reset.svg is generated separately by
// generate-reset-text.js (it's real "Reset" text, not a drawn symbol).
// centerdot.svg is untouched (already fill-based, already correct).
//
// Run: node tools/generate-icons.js
const fs = require('fs');
const path = require('path');
const { chromeRing, chromeGeometry, bar, svgDoc } = require('./chrome-ring');

const SVG_DIR = path.join(__dirname, '..', 'assets', 'svg');

const { viewBoxWidth, viewBoxHeight } = chromeGeometry(1);
const cx = viewBoxWidth / 2;
const cy = viewBoxHeight / 2;
const BAR_LEN = 10, BAR_THICK = 2.25, BAR_R = 1.125;

// --- minus: chrome ring + one horizontal bar, centered on the pill ---
const hBar = bar(cx - BAR_LEN / 2, cy - BAR_THICK / 2, BAR_LEN, BAR_THICK, BAR_R);
fs.writeFileSync(path.join(SVG_DIR, 'minus.svg'), svgDoc([chromeRing(), hBar], viewBoxWidth, viewBoxHeight));

// --- plus: chrome ring + horizontal bar + vertical bar, centered on the pill ---
const vBar = bar(cx - BAR_THICK / 2, cy - BAR_LEN / 2, BAR_THICK, BAR_LEN, BAR_R);
fs.writeFileSync(path.join(SVG_DIR, 'plus.svg'), svgDoc([chromeRing(), hBar, vBar], viewBoxWidth, viewBoxHeight));

console.log('wrote minus.svg, plus.svg to', SVG_DIR);
