// Shared pill-button "chrome" outline used by all three status-bar icon
// glyphs (minus/plus/reset) so they render as a consistent set. Emits pure
// FILL path data (no stroke) — required by the icon-font build, which only
// reads fill geometry.
//
// widthScale widens the pill (and viewBox) horizontally while keeping height
// fixed at 24 — the icon-font build (svgicons2svgfont, normalize:true)
// derives each glyph's advance width from its own viewBox aspect ratio, so a
// wider viewBox is what makes VS Code actually render a wider status-bar
// button, not just wider ink inside the same cell. minus/plus use the
// default scale (square, matching each other); reset uses a wider one since
// it has to fit a whole word.
function roundedRect(x, y, w, h, r) {
    return [
        `M${x + r},${y}`, `H${x + w - r}`, `A${r},${r} 0 0 1 ${x + w},${y + r}`,
        `V${y + h - r}`, `A${r},${r} 0 0 1 ${x + w - r},${y + h}`, `H${x + r}`,
        `A${r},${r} 0 0 1 ${x},${y + h - r}`, `V${y + r}`, `A${r},${r} 0 0 1 ${x + r},${y}`, 'Z'
    ].join(' ');
}

// Reverse winding of roundedRect — paired under fill-rule evenodd, punches a
// hole so the pair renders as a 1px ring instead of a solid block.
function roundedRectHole(x, y, w, h, r) {
    return [
        `M${x + r},${y}`, `A${r},${r} 0 0 0 ${x},${y + r}`, `V${y + h - r}`,
        `A${r},${r} 0 0 0 ${x + r},${y + h}`, `H${x + w - r}`, `A${r},${r} 0 0 0 ${x + w},${y + h - r}`,
        `V${y + r}`, `A${r},${r} 0 0 0 ${x + w - r},${y}`, `H${x + r}`, 'Z'
    ].join(' ');
}

const VIEWBOX_HEIGHT = 24;
const BASE_OUTER_W = 21; // matches minus/plus's original square 24x24 icon (21 + MARGIN_X margin each side)
const MARGIN_X = 0.75;  // left/right padding outside the pill, within each button's own advance-width box — halved from the original 1.5

function chromeGeometry(widthScale = 1) {
    const outerW = BASE_OUTER_W * widthScale;
    const outer = { x: MARGIN_X, y: 4.5, w: outerW, h: 15, r: 4 };
    const inner = { x: MARGIN_X + 1, y: 5.5, w: outerW - 2, h: 13, r: 3 };
    return { outer, inner, viewBoxWidth: outerW + MARGIN_X * 2, viewBoxHeight: VIEWBOX_HEIGHT };
}

function chromeRing(widthScale = 1) {
    const { outer: o, inner: i } = chromeGeometry(widthScale);
    return roundedRect(o.x, o.y, o.w, o.h, o.r) + ' ' + roundedRectHole(i.x, i.y, i.w, i.h, i.r);
}

function bar(x, y, w, h, r) {
    return roundedRect(x, y, w, h, r);
}

function svgDoc(bodyPaths, viewBoxWidth = 24, viewBoxHeight = 24) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}">\n  <path fill="#FFFFFF" fill-rule="evenodd" d="${bodyPaths.join(' ')}"/>\n</svg>\n`;
}

module.exports = { chromeRing, chromeGeometry, bar, svgDoc };
