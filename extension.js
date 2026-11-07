const vscode = require('vscode');

// ---------------------------------------------------------------------------
// All fallback defaults live here, in one place, per spec.
// ---------------------------------------------------------------------------
const DEFAULTS = {
    enabled:             true,
    increment:           1,
    statusbarSide:       'left',   // 'left' | 'right'
    useButtonsStatusbar: false     // false = plain-text glyphs
};

let currentConfig;
let badEntries = [];       // collected during config resolution this activation
let warningShown = false;  // show the bad-entry summary at most once per session
let statusBarItems = [];
let panelView;              // the resolved PiZoom sidebar WebviewView, once available
let minusItem = null;       // the currently-live minus/plus StatusBarItems, if any — for tooltip updates
let plusItem = null;

// ---------------------------------------------------------------------------
// Config resolution — every reader here is defensive: a present-but-wrong
// value is recorded in badEntries (and the default is used instead); an
// absent key just silently uses the default, since not configuring
// something isn't a mistake.
// ---------------------------------------------------------------------------
function readBoolean(c, key, def) {
    const raw = c.get(key);
    if (raw === undefined) return def;
    if (typeof raw !== 'boolean') {
        badEntries.push({ key: `pizoom.${key}`, problem: `expected true or false, got ${JSON.stringify(raw)} (${typeof raw})` });
        return def;
    }
    return raw;
}

function resolveIncrement(c) {
    const raw = c.get('increment');
    if (raw === undefined) return DEFAULTS.increment;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        badEntries.push({ key: 'pizoom.increment', problem: `expected a number, got ${JSON.stringify(raw)} (${typeof raw}) — using default ${DEFAULTS.increment}` });
        return DEFAULTS.increment;
    }
    return raw;
}

function resolveStatusbarSide(c) {
    const raw = c.get('statusbarSide');
    if (raw === undefined) return DEFAULTS.statusbarSide;
    if (raw === 'left' || raw === 'right') return raw;
    badEntries.push({ key: 'pizoom.statusbarSide', problem: `expected "left" or "right", got ${JSON.stringify(raw)} — falling back to "${DEFAULTS.statusbarSide}"` });
    return DEFAULTS.statusbarSide;
}

function resolveConfig() {
    badEntries = [];
    let c;
    try {
        c = vscode.workspace.getConfiguration('pizoom');
    } catch (e) {
        // Configuration itself failed to read — fall back to hard defaults
        // entirely rather than let anything throw.
        return { ...DEFAULTS };
    }
    return {
        enabled:             readBoolean(c, 'enabled', DEFAULTS.enabled),
        increment:           resolveIncrement(c),
        statusbarSide:       resolveStatusbarSide(c),
        useButtonsStatusbar: readBoolean(c, 'useButtonsStatusbar', DEFAULTS.useButtonsStatusbar)
    };
}

// ---------------------------------------------------------------------------
// Warn (at most once per session) the first time any pizoom button fires,
// listing every bad config entry found at activation.
// ---------------------------------------------------------------------------
function maybeWarnAboutBadEntries() {
    if (warningShown || badEntries.length === 0) return;
    warningShown = true;
    const lines = badEntries.map(e => `• ${e.key} — ${e.problem}`);
    vscode.window.showWarningMessage(
        `PiZoom found ${badEntries.length} invalid setting${badEntries.length === 1 ? '' : 's'} (using defaults instead):\n${lines.join('\n')}`
    );
}

function wrapCommand(fn) {
    return (...args) => {
        maybeWarnAboutBadEntries();
        try {
            return fn(...args);
        } catch (e) {
            // "the spirit of it is to prevent all errors" — never let a
            // handler throw and surface VS Code's own error UI.
            console.error('[PiZoom] command failed:', e);
        }
    };
}

// ---------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------
function getZoomLevel() {
    return vscode.workspace.getConfiguration('window').get('zoomLevel', 0);
}

function setZoomLevel(level) {
    return vscode.workspace.getConfiguration('window')
        .update('zoomLevel', level, vscode.ConfigurationTarget.Global);
}

function zoomOut() { setZoomLevel(getZoomLevel() - currentConfig.increment); }
function zoomIn()  { setZoomLevel(getZoomLevel() + currentConfig.increment); }
function zoomReset() { setZoomLevel(0); }

// VS Code's zoomLevel-to-zoomFactor formula, confirmed directly from
// workbench source (Zme(s=0){return 1.2**s}) — this is Chromium/Electron's
// own zoom convention, not something VS Code invented, so it's safe to rely
// on: factor = 1.2^zoomLevel, and percent = 100 * factor. zoomLevel 0 is
// always exactly 100%.
function formatZoomPercent() {
    return `${Math.round(100 * Math.pow(1.2, getZoomLevel()))}%`;
}

// Minus/plus describe current state on hover — they're relative operations
// (each click moves zoom incrementally from wherever it already is), so
// showing the current value is a useful starting point for the user. Reset
// describes its fixed destination instead — resetting always lands on
// exactly 100%, regardless of current zoom, so showing "current state" on
// reset's tooltip would describe what you're leaving, not what clicking it
// does; a static string is the more accurate description of the action.
function zoomOutTooltipText() { return `Zoom out (currently ${formatZoomPercent()})`; }
function zoomInTooltipText()  { return `Zoom in (currently ${formatZoomPercent()})`; }
const RESET_TOOLTIP = 'Reset zoom to 100%';

// ---------------------------------------------------------------------------
// Status bar rendering — the only surface pizoom has left.
//
// Two label sets: plain-text glyphs (the original default look) or the
// custom pizoom icon-font buttons (opt-in via useButtonsStatusbar), sourced
// from assets/fonts/vscode.woff via the named contributes.icons entries. No
// padding, no separators — just the three controls, as compact as possible.
// ---------------------------------------------------------------------------
const FONT_LABELS   = { minus: '−', reset: '↺', plus: '+' };
const BUTTON_LABELS = { minus: '$(pizoom-minus)', reset: '$(pizoom-reset)', plus: '$(pizoom-plus)' };

function disposeItems(list) {
    for (const item of list) item.dispose();
    list.length = 0;
}

// Priority decades: piserver reserves the 148000s (148000-148009, using
// 148000-148005), pizoom reserves the next decade, 148010s (148010-148019
// right / -148010 to -148019 left). Each pi-extension gets a whole decade
// regardless of how many numbers it actually uses, so new suite members can
// each claim the next one without ever renumbering existing extensions.
// Only 3 of pizoom's 10 are used per side right now (148010-148012 /
// -148010 to -148012); 148013-148019 / -148013 to -148019 stay free for
// future pizoom items.
//
// Minus must render leftmost and plus rightmost, reading "minus reset plus"
// left to right — and "higher priority = further left" holds on BOTH sides
// (verified: it never flips the way inner/outer does), so minus always gets
// the highest of the three numbers, plus always the lowest, regardless of
// which side pizoom is docked on. Whole decade sits higher than piserver's
// on the right (closer to center there) and lower on the left (also closer
// to center there), so pizoom leans toward center relative to piserver on
// either side.
const RIGHT_PRIORITIES = { minus: 148012, reset: 148011, plus: 148010 };
const LEFT_PRIORITIES  = { minus: -148010, reset: -148011, plus: -148012 };

// Forced explicitly white in button mode rather than relying on the default
// foreground theme color, which isn't guaranteed to be white in every theme.
const BUTTON_COLOR = '#FFFFFF';

function buildStatusBar(alignment) {
    const labels = currentConfig.useButtonsStatusbar ? BUTTON_LABELS : FONT_LABELS;
    const priorities = alignment === vscode.StatusBarAlignment.Right ? RIGHT_PRIORITIES : LEFT_PRIORITIES;
    const items = [];
    const makeItem = (priority) => {
        const item = vscode.window.createStatusBarItem(alignment, priority);
        if (currentConfig.useButtonsStatusbar) item.color = BUTTON_COLOR;
        item.show();
        items.push(item);
        return item;
    };

    const minus = makeItem(priorities.minus);
    minus.text = labels.minus;
    minus.tooltip = zoomOutTooltipText();
    minus.command = 'pizoom.zoomOut';
    minusItem = minus;

    const reset = makeItem(priorities.reset);
    reset.text = labels.reset;
    reset.tooltip = RESET_TOOLTIP;
    reset.command = 'pizoom.zoomReset';

    const plus = makeItem(priorities.plus);
    plus.text = labels.plus;
    plus.tooltip = zoomInTooltipText();
    plus.command = 'pizoom.zoomIn';
    plusItem = plus;

    return items;
}

// ---------------------------------------------------------------------------
// Master render — rebuilds every active surface from currentConfig. Called
// at activation and again any time the panel changes state, so everything
// updates live without a window reload.
// ---------------------------------------------------------------------------
function renderAll() {
    disposeItems(statusBarItems);
    minusItem = null;
    plusItem = null;

    if (currentConfig.enabled) {
        const alignment = currentConfig.statusbarSide === 'right'
            ? vscode.StatusBarAlignment.Right
            : vscode.StatusBarAlignment.Left;
        statusBarItems = buildStatusBar(alignment);
    }

    if (panelView) {
        panelView.webview.postMessage({ type: 'state', config: currentConfig });
    }
}

function updateStatusbarSide(value) {
    if (value !== 'left' && value !== 'right') return;
    currentConfig.statusbarSide = value;
    vscode.workspace.getConfiguration('pizoom').update('statusbarSide', value, vscode.ConfigurationTarget.Global);
    renderAll();
}

function updateUseButtonsStatusbar(value) {
    currentConfig.useButtonsStatusbar = !!value;
    vscode.workspace.getConfiguration('pizoom').update('useButtonsStatusbar', !!value, vscode.ConfigurationTarget.Global);
    renderAll();
}

function toggleEnabled() {
    currentConfig.enabled = !currentConfig.enabled;
    vscode.workspace.getConfiguration('pizoom').update('enabled', currentConfig.enabled, vscode.ConfigurationTarget.Global);
    renderAll();
}

// ---------------------------------------------------------------------------
// Sidebar panel
// ---------------------------------------------------------------------------
class PizoomViewProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }

    resolveWebviewView(view) {
        panelView = view;
        const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'assets');
        view.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
        const pythonLogoUri = view.webview.asWebviewUri(
            vscode.Uri.joinPath(assetsRoot, 'images', 'python-logo.png')
        );
        view.webview.html = getWebviewHtml(view.webview, pythonLogoUri);
        view.webview.onDidReceiveMessage(msg => {
            try {
                if (msg.type === 'setStatusbarSide') updateStatusbarSide(msg.value);
                else if (msg.type === 'setUseButtonsStatusbar') updateUseButtonsStatusbar(msg.value);
                else if (msg.type === 'toggleEnabled') toggleEnabled();
                else if (msg.type === 'zoomOut') zoomOut();
                else if (msg.type === 'zoomIn') zoomIn();
                else if (msg.type === 'zoomReset') zoomReset();
            } catch (e) {
                console.error('[PiZoom] webview message handling failed:', e);
            }
        });
        view.webview.postMessage({ type: 'state', config: currentConfig });
    }
}

function getWebviewHtml(webview, pythonLogoUri) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src ${webview.cspSource};">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 6px 8px; font-size: 11px; }
  .row { display: flex; align-items: center; justify-content: space-between; margin: 4px 0; gap: 6px; flex-wrap: wrap; }
  .row.center { justify-content: center; }
  .left { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .right { display: flex; align-items: center; gap: 5px; justify-content: flex-end; text-align: right; flex-wrap: wrap; margin-left: auto; }
  .center { display: flex; align-items: center; gap: 5px; justify-content: center; flex-wrap: wrap; }
  .bold { font-weight: 600; }
  label { display: flex; align-items: center; gap: 2px; cursor: pointer; white-space: nowrap; }
  label.disabled { opacity: 0.4; cursor: default; }
  input[type="radio"], input[type="checkbox"] { margin: 0; cursor: pointer; }
  label.disabled input { cursor: default; }
  button { cursor: pointer; font-size: 12px; padding: 2px 8px;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; border-radius: 2px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.zoombtn { padding: 2px 6px; min-width: 22px; }
  hr { border: none; border-top: 1px solid var(--vscode-widget-border, #454545); margin: 8px 0; }
  .about { flex-direction: column; gap: 3px; text-align: center; }
  .about img { width: 28px; height: 28px; }
  .about .name { font-weight: 600; }
</style>
</head>
<body>
  <div class="row">
    <span class="bold">Status Bar Side</span>
    <span class="bold">Style</span>
  </div>
  <div class="row">
    <span class="left">
      <label id="lblLeft">Left <input type="radio" name="side" id="sideLeft" value="left"></label>
      <label id="lblRight">Right <input type="radio" name="side" id="sideRight" value="right"></label>
    </span>
    <span class="right">
      <label id="lblFonts">Fonts <input type="radio" name="renderMode" id="modeFonts" value="fonts"></label>
      <label id="lblButtons">Buttons <input type="radio" name="renderMode" id="modeButtons" value="buttons"></label>
    </span>
  </div>
  <hr>
  <div class="row">
    <span class="left"><button id="toggle"></button></span>
    <span class="right">Zoom Now
      <button class="zoombtn" id="zoomOutNow" title="${zoomOutTooltipText()}">−</button>
      <button class="zoombtn" id="zoomResetNow" title="${RESET_TOOLTIP}">↺</button>
      <button class="zoombtn" id="zoomInNow" title="${zoomInTooltipText()}">+</button>
    </span>
  </div>
  <hr>
  <div class="row center about">
    <img src="${pythonLogoUri}" alt="Python logo">
    <span class="name">Extension: PiZoom</span>
    <span>Compact zoom controls in the status bar, configurable via this panel.</span>
  </div>
<script>
  const vscode = acquireVsCodeApi();

  document.querySelectorAll('input[name="side"]').forEach(el => {
    el.addEventListener('change', () => { if (el.checked) vscode.postMessage({ type: 'setStatusbarSide', value: el.value }); });
  });
  document.querySelectorAll('input[name="renderMode"]').forEach(el => {
    el.addEventListener('change', () => { if (el.checked) vscode.postMessage({ type: 'setUseButtonsStatusbar', value: el.value === 'buttons' }); });
  });
  document.getElementById('toggle').addEventListener('click', () => {
    vscode.postMessage({ type: 'toggleEnabled' });
  });
  document.getElementById('zoomOutNow').addEventListener('click', () => vscode.postMessage({ type: 'zoomOut' }));
  document.getElementById('zoomResetNow').addEventListener('click', () => vscode.postMessage({ type: 'zoomReset' }));
  document.getElementById('zoomInNow').addEventListener('click', () => vscode.postMessage({ type: 'zoomIn' }));

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'zoomTooltips') {
      document.getElementById('zoomOutNow').title = msg.zoomOutTip;
      document.getElementById('zoomInNow').title = msg.zoomInTip;
      return;
    }
    if (msg.type !== 'state') return;
    const cfg = msg.config;

    const subEnabled = !!cfg.enabled;
    const sideLeft = document.getElementById('sideLeft');
    const sideRight = document.getElementById('sideRight');
    sideLeft.checked = cfg.statusbarSide === 'left';
    sideRight.checked = cfg.statusbarSide === 'right';
    sideLeft.disabled = !subEnabled;
    sideRight.disabled = !subEnabled;
    document.getElementById('lblLeft').classList.toggle('disabled', !subEnabled);
    document.getElementById('lblRight').classList.toggle('disabled', !subEnabled);

    const modeFonts = document.getElementById('modeFonts');
    const modeButtons = document.getElementById('modeButtons');
    modeFonts.checked = !cfg.useButtonsStatusbar;
    modeButtons.checked = !!cfg.useButtonsStatusbar;
    modeFonts.disabled = !subEnabled;
    modeButtons.disabled = !subEnabled;
    document.getElementById('lblFonts').classList.toggle('disabled', !subEnabled);
    document.getElementById('lblButtons').classList.toggle('disabled', !subEnabled);

    document.getElementById('toggle').textContent = cfg.enabled ? 'Stop' : 'Start';
  });
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------
function activate(context) {
    try {
        currentConfig = resolveConfig();

        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('pizoomPanel', new PizoomViewProvider(context.extensionUri))
        );

        renderAll();

        context.subscriptions.push(
            vscode.commands.registerCommand('pizoom.zoomOut', wrapCommand(zoomOut)),
            vscode.commands.registerCommand('pizoom.zoomIn', wrapCommand(zoomIn)),
            vscode.commands.registerCommand('pizoom.zoomReset', wrapCommand(zoomReset)),
            vscode.commands.registerCommand('pizoom.toggleEnabled', wrapCommand(toggleEnabled))
        );

        // window.zoomLevel is a real workspace/user setting, so it fires this
        // event regardless of what changed it — pizoom's own buttons, a
        // keyboard shortcut, the View menu, or another extension entirely.
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (!e.affectsConfiguration('window.zoomLevel')) return;
                if (minusItem) minusItem.tooltip = zoomOutTooltipText();
                if (plusItem) plusItem.tooltip = zoomInTooltipText();
                if (panelView) {
                    panelView.webview.postMessage({
                        type: 'zoomTooltips',
                        zoomOutTip: zoomOutTooltipText(),
                        zoomInTip: zoomInTooltipText()
                    });
                }
            })
        );

        context.subscriptions.push({ dispose: () => disposeItems(statusBarItems) });
    } catch (e) {
        // Activation must never throw — that would surface VS Code's own
        // "extension activation failed" notification, which the spec
        // explicitly asks to avoid.
        console.error('[PiZoom] activation failed:', e);
    }
}

function deactivate() {}

module.exports = { activate, deactivate };
