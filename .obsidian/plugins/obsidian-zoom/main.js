'use strict';

var obsidian = require('obsidian');
var language = require('@codemirror/language');
var state = require('@codemirror/state');
var view = require('@codemirror/view');

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function getDocumentTitle(state) {
    return state.field(obsidian.editorViewField).getDisplayText();
}

function getEditorViewFromEditorState(state) {
    return state.field(obsidian.editorEditorField);
}

function cleanTitle(title) {
    return title
        .trim()
        .replace(/^#+(\s)/, "$1")
        .replace(/^([-+*]|\d+\.)(\s)/, "$2")
        .trim();
}

class CollectBreadcrumbs {
    constructor(getDocumentTitle) {
        this.getDocumentTitle = getDocumentTitle;
    }
    collectBreadcrumbs(state, pos) {
        const breadcrumbs = [
            { title: this.getDocumentTitle.getDocumentTitle(state), pos: null },
        ];
        const posLine = state.doc.lineAt(pos);
        for (let i = 1; i < posLine.number; i++) {
            const line = state.doc.line(i);
            const f = language.foldable(state, line.from, line.to);
            if (f && f.to > posLine.from) {
                breadcrumbs.push({ title: cleanTitle(line.text), pos: line.from });
            }
        }
        breadcrumbs.push({
            title: cleanTitle(posLine.text),
            pos: posLine.from,
        });
        return breadcrumbs;
    }
}

function calculateVisibleContentBoundariesViolation(tr, hiddenRanges) {
    let touchedBefore = false;
    let touchedAfter = false;
    let touchedInside = false;
    const t = (f, t) => Boolean(tr.changes.touchesRange(f, t));
    if (hiddenRanges.length === 2) {
        const [a, b] = hiddenRanges;
        touchedBefore = t(a.from, a.to);
        touchedInside = t(a.to + 1, b.from - 1);
        touchedAfter = t(b.from, b.to);
    }
    if (hiddenRanges.length === 1) {
        const [a] = hiddenRanges;
        if (a.from === 0) {
            touchedBefore = t(a.from, a.to);
            touchedInside = t(a.to + 1, tr.newDoc.length);
        }
        else {
            touchedInside = t(0, a.from - 1);
            touchedAfter = t(a.from, a.to);
        }
    }
    const touchedOutside = touchedBefore || touchedAfter;
    const res = {
        touchedOutside,
        touchedBefore,
        touchedAfter,
        touchedInside,
    };
    return res;
}

class DetectRangeBeforeVisibleRangeChanged {
    constructor(calculateHiddenContentRanges, rangeBeforeVisibleRangeChanged) {
        this.calculateHiddenContentRanges = calculateHiddenContentRanges;
        this.rangeBeforeVisibleRangeChanged = rangeBeforeVisibleRangeChanged;
        this.detectVisibleContentBoundariesViolation = (tr) => {
            const hiddenRanges = this.calculateHiddenContentRanges.calculateHiddenContentRanges(tr.startState);
            const { touchedBefore, touchedInside } = calculateVisibleContentBoundariesViolation(tr, hiddenRanges);
            if (touchedBefore && !touchedInside) {
                setImmediate(() => {
                    this.rangeBeforeVisibleRangeChanged.rangeBeforeVisibleRangeChanged(tr.state);
                });
            }
            return null;
        };
    }
    getExtension() {
        return state.EditorState.transactionExtender.of(this.detectVisibleContentBoundariesViolation);
    }
}

const panelConfig = /*@__PURE__*/state.Facet.define({
    combine(configs) {
        let topContainer, bottomContainer;
        for (let c of configs) {
            topContainer = topContainer || c.topContainer;
            bottomContainer = bottomContainer || c.bottomContainer;
        }
        return { topContainer, bottomContainer };
    }
});
const panelPlugin = /*@__PURE__*/view.ViewPlugin.fromClass(class {
    constructor(view) {
        this.input = view.state.facet(showPanel);
        this.specs = this.input.filter(s => s);
        this.panels = this.specs.map(spec => spec(view));
        let conf = view.state.facet(panelConfig);
        this.top = new PanelGroup(view, true, conf.topContainer);
        this.bottom = new PanelGroup(view, false, conf.bottomContainer);
        this.top.sync(this.panels.filter(p => p.top));
        this.bottom.sync(this.panels.filter(p => !p.top));
        for (let p of this.panels) {
            p.dom.classList.add("cm-panel");
            if (p.mount)
                p.mount();
        }
    }
    update(update) {
        let conf = update.state.facet(panelConfig);
        if (this.top.container != conf.topContainer) {
            this.top.sync([]);
            this.top = new PanelGroup(update.view, true, conf.topContainer);
        }
        if (this.bottom.container != conf.bottomContainer) {
            this.bottom.sync([]);
            this.bottom = new PanelGroup(update.view, false, conf.bottomContainer);
        }
        this.top.syncClasses();
        this.bottom.syncClasses();
        let input = update.state.facet(showPanel);
        if (input != this.input) {
            let specs = input.filter(x => x);
            let panels = [], top = [], bottom = [], mount = [];
            for (let spec of specs) {
                let known = this.specs.indexOf(spec), panel;
                if (known < 0) {
                    panel = spec(update.view);
                    mount.push(panel);
                }
                else {
                    panel = this.panels[known];
                    if (panel.update)
                        panel.update(update);
                }
                panels.push(panel);
                (panel.top ? top : bottom).push(panel);
            }
            this.specs = specs;
            this.panels = panels;
            this.top.sync(top);
            this.bottom.sync(bottom);
            for (let p of mount) {
                p.dom.classList.add("cm-panel");
                if (p.mount)
                    p.mount();
            }
        }
        else {
            for (let p of this.panels)
                if (p.update)
                    p.update(update);
        }
    }
    destroy() {
        this.top.sync([]);
        this.bottom.sync([]);
    }
}, {
    provide: /*@__PURE__*/view.PluginField.scrollMargins.from(value => ({ top: value.top.scrollMargin(), bottom: value.bottom.scrollMargin() }))
});
class PanelGroup {
    constructor(view, top, container) {
        this.view = view;
        this.top = top;
        this.container = container;
        this.dom = undefined;
        this.classes = "";
        this.panels = [];
        this.syncClasses();
    }
    sync(panels) {
        for (let p of this.panels)
            if (p.destroy && panels.indexOf(p) < 0)
                p.destroy();
        this.panels = panels;
        this.syncDOM();
    }
    syncDOM() {
        if (this.panels.length == 0) {
            if (this.dom) {
                this.dom.remove();
                this.dom = undefined;
            }
            return;
        }
        if (!this.dom) {
            this.dom = document.createElement("div");
            this.dom.className = this.top ? "cm-panels cm-panels-top" : "cm-panels cm-panels-bottom";
            this.dom.style[this.top ? "top" : "bottom"] = "0";
            let parent = this.container || this.view.dom;
            parent.insertBefore(this.dom, this.top ? parent.firstChild : null);
        }
        let curDOM = this.dom.firstChild;
        for (let panel of this.panels) {
            if (panel.dom.parentNode == this.dom) {
                while (curDOM != panel.dom)
                    curDOM = rm(curDOM);
                curDOM = curDOM.nextSibling;
            }
            else {
                this.dom.insertBefore(panel.dom, curDOM);
            }
        }
        while (curDOM)
            curDOM = rm(curDOM);
    }
    scrollMargin() {
        return !this.dom || this.container ? 0
            : Math.max(0, this.top ?
                this.dom.getBoundingClientRect().bottom - Math.max(0, this.view.scrollDOM.getBoundingClientRect().top) :
                Math.min(innerHeight, this.view.scrollDOM.getBoundingClientRect().bottom) - this.dom.getBoundingClientRect().top);
    }
    syncClasses() {
        if (!this.container || this.classes == this.view.themeClasses)
            return;
        for (let cls of this.classes.split(" "))
            if (cls)
                this.container.classList.remove(cls);
        for (let cls of (this.classes = this.view.themeClasses).split(" "))
            if (cls)
                this.container.classList.add(cls);
    }
}
function rm(node) {
    let next = node.nextSibling;
    node.remove();
    return next;
}
const baseTheme = /*@__PURE__*/view.EditorView.baseTheme({
    ".cm-panels": {
        boxSizing: "border-box",
        position: "sticky",
        left: 0,
        right: 0
    },
    "&light .cm-panels": {
        backgroundColor: "#f5f5f5",
        color: "black"
    },
    "&light .cm-panels-top": {
        borderBottom: "1px solid #ddd"
    },
    "&light .cm-panels-bottom": {
        borderTop: "1px solid #ddd"
    },
    "&dark .cm-panels": {
        backgroundColor: "#333338",
        color: "white"
    }
});
/**
Opening a panel is done by providing a constructor function for
the panel through this facet. (The panel is closed again when its
constructor is no longer provided.) Values of `null` are ignored.
*/
const showPanel = /*@__PURE__*/state.Facet.define({
    enables: [panelPlugin, baseTheme]
});

function renderHeader(doc, ctx) {
    const { breadcrumbs, onClick } = ctx;
    const h = doc.createElement("div");
    h.classList.add("zoom-plugin-header");
    for (let i = 0; i < breadcrumbs.length; i++) {
        if (i > 0) {
            const d = doc.createElement("span");
            d.classList.add("zoom-plugin-delimiter");
            d.innerText = ">";
            h.append(d);
        }
        const breadcrumb = breadcrumbs[i];
        const b = doc.createElement("a");
        b.classList.add("zoom-plugin-title");
        b.dataset.pos = String(breadcrumb.pos);
        b.appendChild(doc.createTextNode(breadcrumb.title));
        b.addEventListener("click", (e) => {
            e.preventDefault();
            const t = e.target;
            const pos = t.dataset.pos;
            onClick(pos === "null" ? null : Number(pos));
        });
        h.appendChild(b);
    }
    return h;
}

const showHeaderEffect = state.StateEffect.define();
const hideHeaderEffect = state.StateEffect.define();
const headerState = state.StateField.define({
    create: () => null,
    update: (value, tr) => {
        for (const e of tr.effects) {
            if (e.is(showHeaderEffect)) {
                value = e.value;
            }
            if (e.is(hideHeaderEffect)) {
                value = null;
            }
        }
        return value;
    },
    provide: (f) => showPanel.from(f, (state) => {
        if (!state) {
            return null;
        }
        return (view) => ({
            top: true,
            dom: renderHeader(view.dom.ownerDocument, {
                breadcrumbs: state.breadcrumbs,
                onClick: (pos) => state.onClick(view, pos),
            }),
        });
    }),
});
class RenderNavigationHeader {
    constructor(logger, zoomIn, zoomOut) {
        this.logger = logger;
        this.zoomIn = zoomIn;
        this.zoomOut = zoomOut;
        this.onClick = (view, pos) => {
            if (pos === null) {
                this.zoomOut.zoomOut(view);
            }
            else {
                this.zoomIn.zoomIn(view, pos);
            }
        };
    }
    getExtension() {
        return headerState;
    }
    showHeader(view, breadcrumbs) {
        const l = this.logger.bind("ToggleNavigationHeaderLogic:showHeader");
        l("show header");
        view.dispatch({
            effects: [
                showHeaderEffect.of({
                    breadcrumbs,
                    onClick: this.onClick,
                }),
            ],
        });
    }
    hideHeader(view) {
        const l = this.logger.bind("ToggleNavigationHeaderLogic:hideHeader");
        l("hide header");
        view.dispatch({
            effects: [hideHeaderEffect.of()],
        });
    }
}

class ShowHeaderAfterZoomIn {
    constructor(notifyAfterZoomIn, collectBreadcrumbs, renderNavigationHeader) {
        this.notifyAfterZoomIn = notifyAfterZoomIn;
        this.collectBreadcrumbs = collectBreadcrumbs;
        this.renderNavigationHeader = renderNavigationHeader;
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.notifyAfterZoomIn.notifyAfterZoomIn((view, pos) => {
                const breadcrumbs = this.collectBreadcrumbs.collectBreadcrumbs(view.state, pos);
                this.renderNavigationHeader.showHeader(view, breadcrumbs);
            });
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}
class HideHeaderAfterZoomOut {
    constructor(notifyAfterZoomOut, renderNavigationHeader) {
        this.notifyAfterZoomOut = notifyAfterZoomOut;
        this.renderNavigationHeader = renderNavigationHeader;
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.notifyAfterZoomOut.notifyAfterZoomOut((view) => {
                this.renderNavigationHeader.hideHeader(view);
            });
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}
class UpdateHeaderAfterRangeBeforeVisibleRangeChanged {
    constructor(plugin, calculateHiddenContentRanges, calculateVisibleContentRange, collectBreadcrumbs, renderNavigationHeader) {
        this.plugin = plugin;
        this.calculateHiddenContentRanges = calculateHiddenContentRanges;
        this.calculateVisibleContentRange = calculateVisibleContentRange;
        this.collectBreadcrumbs = collectBreadcrumbs;
        this.renderNavigationHeader = renderNavigationHeader;
        this.detectRangeBeforeVisibleRangeChanged = new DetectRangeBeforeVisibleRangeChanged(this.calculateHiddenContentRanges, {
            rangeBeforeVisibleRangeChanged: (state) => this.rangeBeforeVisibleRangeChanged(state),
        });
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(this.detectRangeBeforeVisibleRangeChanged.getExtension());
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    rangeBeforeVisibleRangeChanged(state) {
        const view = getEditorViewFromEditorState(state);
        const pos = this.calculateVisibleContentRange.calculateVisibleContentRange(state).from;
        const breadcrumbs = this.collectBreadcrumbs.collectBreadcrumbs(state, pos);
        this.renderNavigationHeader.showHeader(view, breadcrumbs);
    }
}
class HeaderNavigationFeature {
    constructor(plugin, logger, calculateHiddenContentRanges, calculateVisibleContentRange, zoomIn, zoomOut, notifyAfterZoomIn, notifyAfterZoomOut) {
        this.plugin = plugin;
        this.logger = logger;
        this.calculateHiddenContentRanges = calculateHiddenContentRanges;
        this.calculateVisibleContentRange = calculateVisibleContentRange;
        this.zoomIn = zoomIn;
        this.zoomOut = zoomOut;
        this.notifyAfterZoomIn = notifyAfterZoomIn;
        this.notifyAfterZoomOut = notifyAfterZoomOut;
        this.collectBreadcrumbs = new CollectBreadcrumbs({
            getDocumentTitle: getDocumentTitle,
        });
        this.renderNavigationHeader = new RenderNavigationHeader(this.logger, this.zoomIn, this.zoomOut);
        this.showHeaderAfterZoomIn = new ShowHeaderAfterZoomIn(this.notifyAfterZoomIn, this.collectBreadcrumbs, this.renderNavigationHeader);
        this.hideHeaderAfterZoomOut = new HideHeaderAfterZoomOut(this.notifyAfterZoomOut, this.renderNavigationHeader);
        this.updateHeaderAfterRangeBeforeVisibleRangeChanged = new UpdateHeaderAfterRangeBeforeVisibleRangeChanged(this.plugin, this.calculateHiddenContentRanges, this.calculateVisibleContentRange, this.collectBreadcrumbs, this.renderNavigationHeader);
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(this.renderNavigationHeader.getExtension());
            this.showHeaderAfterZoomIn.load();
            this.hideHeaderAfterZoomOut.load();
            this.updateHeaderAfterRangeBeforeVisibleRangeChanged.load();
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.showHeaderAfterZoomIn.unload();
            this.hideHeaderAfterZoomOut.unload();
            this.updateHeaderAfterRangeBeforeVisibleRangeChanged.unload();
        });
    }
}

function calculateLimitedSelection(selection, from, to) {
    const mainSelection = selection.main;
    const newSelection = state.EditorSelection.range(Math.min(Math.max(mainSelection.anchor, from), to), Math.min(Math.max(mainSelection.head, from), to), mainSelection.goalColumn);
    const shouldUpdate = selection.ranges.length > 1 ||
        newSelection.anchor !== mainSelection.anchor ||
        newSelection.head !== mainSelection.head;
    return shouldUpdate ? newSelection : null;
}

const zoomInEffect = state.StateEffect.define();
const zoomOutEffect = state.StateEffect.define();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isZoomInEffect(e) {
    return e.is(zoomInEffect);
}

class LimitSelectionOnZoomingIn {
    constructor(logger) {
        this.logger = logger;
        this.limitSelectionOnZoomingIn = (tr) => {
            const e = tr.effects.find(isZoomInEffect);
            if (!e) {
                return tr;
            }
            const newSelection = calculateLimitedSelection(tr.newSelection, e.value.from, e.value.to);
            if (!newSelection) {
                return tr;
            }
            this.logger.log("LimitSelectionOnZoomingIn:limitSelectionOnZoomingIn", "limiting selection", newSelection.toJSON());
            return [tr, { selection: newSelection }];
        };
    }
    getExtension() {
        return state.EditorState.transactionFilter.of(this.limitSelectionOnZoomingIn);
    }
}

class LimitSelectionWhenZoomedIn {
    constructor(logger, calculateVisibleContentRange) {
        this.logger = logger;
        this.calculateVisibleContentRange = calculateVisibleContentRange;
        this.limitSelectionWhenZoomedIn = (tr) => {
            if (!tr.selection || !tr.isUserEvent("select")) {
                return tr;
            }
            const range = this.calculateVisibleContentRange.calculateVisibleContentRange(tr.state);
            if (!range) {
                return tr;
            }
            const newSelection = calculateLimitedSelection(tr.newSelection, range.from, range.to);
            if (!newSelection) {
                return tr;
            }
            this.logger.log("LimitSelectionWhenZoomedIn:limitSelectionWhenZoomedIn", "limiting selection", newSelection.toJSON());
            return [tr, { selection: newSelection }];
        };
    }
    getExtension() {
        return state.EditorState.transactionFilter.of(this.limitSelectionWhenZoomedIn);
    }
}

class LimitSelectionFeature {
    constructor(plugin, logger, calculateVisibleContentRange) {
        this.plugin = plugin;
        this.logger = logger;
        this.calculateVisibleContentRange = calculateVisibleContentRange;
        this.limitSelectionOnZoomingIn = new LimitSelectionOnZoomingIn(this.logger);
        this.limitSelectionWhenZoomedIn = new LimitSelectionWhenZoomedIn(this.logger, this.calculateVisibleContentRange);
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(this.limitSelectionOnZoomingIn.getExtension());
            this.plugin.registerEditorExtension(this.limitSelectionWhenZoomedIn.getExtension());
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class ListsStylesFeature {
    constructor(settings) {
        this.settings = settings;
        this.onZoomOnClickSettingChange = (zoomOnClick) => {
            if (zoomOnClick) {
                this.addZoomStyles();
            }
            else {
                this.removeZoomStyles();
            }
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.settings.zoomOnClick) {
                this.addZoomStyles();
            }
            this.settings.onChange("zoomOnClick", this.onZoomOnClickSettingChange);
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings.removeCallback("zoomOnClick", this.onZoomOnClickSettingChange);
            this.removeZoomStyles();
        });
    }
    addZoomStyles() {
        document.body.classList.add("zoom-plugin-bls-zoom");
    }
    removeZoomStyles() {
        document.body.classList.remove("zoom-plugin-bls-zoom");
    }
}

class DetectVisibleContentBoundariesViolation {
    constructor(calculateHiddenContentRanges, visibleContentBoundariesViolated) {
        this.calculateHiddenContentRanges = calculateHiddenContentRanges;
        this.visibleContentBoundariesViolated = visibleContentBoundariesViolated;
        this.detectVisibleContentBoundariesViolation = (tr) => {
            const hiddenRanges = this.calculateHiddenContentRanges.calculateHiddenContentRanges(tr.startState);
            const { touchedOutside, touchedInside } = calculateVisibleContentBoundariesViolation(tr, hiddenRanges);
            if (touchedOutside && touchedInside) {
                setImmediate(() => {
                    this.visibleContentBoundariesViolated.visibleContentBoundariesViolated(tr.state);
                });
            }
            return null;
        };
    }
    getExtension() {
        return state.EditorState.transactionExtender.of(this.detectVisibleContentBoundariesViolation);
    }
}

class ResetZoomWhenVisibleContentBoundariesViolatedFeature {
    constructor(plugin, logger, calculateHiddenContentRanges, zoomOut) {
        this.plugin = plugin;
        this.logger = logger;
        this.calculateHiddenContentRanges = calculateHiddenContentRanges;
        this.zoomOut = zoomOut;
        this.detectVisibleContentBoundariesViolation = new DetectVisibleContentBoundariesViolation(this.calculateHiddenContentRanges, {
            visibleContentBoundariesViolated: (state) => this.visibleContentBoundariesViolated(state),
        });
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(this.detectVisibleContentBoundariesViolation.getExtension());
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    visibleContentBoundariesViolated(state) {
        const l = this.logger.bind("ResetZoomWhenVisibleContentBoundariesViolatedFeature:visibleContentBoundariesViolated");
        l("visible content boundaries violated, zooming out");
        this.zoomOut.zoomOut(getEditorViewFromEditorState(state));
    }
}

class ObsidianZoomPluginSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin, settings) {
        super(app, plugin);
        this.settings = settings;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new obsidian.Setting(containerEl)
            .setName("Zooming in when clicking on the bullet")
            .addToggle((toggle) => {
            toggle.setValue(this.settings.zoomOnClick).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.zoomOnClick = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Debug mode")
            .setDesc("Open DevTools (Command+Option+I or Control+Shift+I) to copy the debug logs.")
            .addToggle((toggle) => {
            toggle.setValue(this.settings.debug).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.debug = value;
                yield this.settings.save();
            }));
        });
    }
}
class SettingsTabFeature {
    constructor(plugin, settings) {
        this.plugin = plugin;
        this.settings = settings;
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.addSettingTab(new ObsidianZoomPluginSettingTab(this.plugin.app, this.plugin, this.settings));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

function isFoldingEnabled(app) {
    const config = Object.assign({ foldHeading: false, foldIndent: false }, app.vault.config);
    return config.foldHeading && config.foldIndent;
}

class CalculateRangeForZooming {
    calculateRangeForZooming(state, pos) {
        const line = state.doc.lineAt(pos);
        const foldRange = language.foldable(state, line.from, line.to);
        if (!foldRange && /^\s*([-*+]|\d+\.)\s+/.test(line.text)) {
            return { from: line.from, to: line.to };
        }
        if (!foldRange) {
            return null;
        }
        return { from: line.from, to: foldRange.to };
    }
}

function rangeSetToArray(rs) {
    const res = [];
    const i = rs.iter();
    while (i.value !== null) {
        res.push({ from: i.from, to: i.to });
        i.next();
    }
    return res;
}

const zoomMarkHidden = view.Decoration.replace({ block: true });
const zoomStateField = state.StateField.define({
    create: () => {
        return view.Decoration.none;
    },
    update: (value, tr) => {
        value = value.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(zoomInEffect)) {
                value = value.update({ filter: () => false });
                if (e.value.from > 0) {
                    value = value.update({
                        add: [zoomMarkHidden.range(0, e.value.from - 1)],
                    });
                }
                if (e.value.to < tr.newDoc.length) {
                    value = value.update({
                        add: [zoomMarkHidden.range(e.value.to + 1, tr.newDoc.length)],
                    });
                }
            }
            if (e.is(zoomOutEffect)) {
                value = value.update({ filter: () => false });
            }
        }
        return value;
    },
    provide: (zoomStateField) => view.EditorView.decorations.from(zoomStateField),
});
class KeepOnlyZoomedContentVisible {
    constructor(logger) {
        this.logger = logger;
    }
    getExtension() {
        return zoomStateField;
    }
    calculateHiddenContentRanges(state) {
        return rangeSetToArray(state.field(zoomStateField));
    }
    calculateVisibleContentRange(state) {
        const hidden = this.calculateHiddenContentRanges(state);
        if (hidden.length === 1) {
            const [a] = hidden;
            if (a.from === 0) {
                return { from: a.to + 1, to: state.doc.length };
            }
            else {
                return { from: 0, to: a.from - 1 };
            }
        }
        if (hidden.length === 2) {
            const [a, b] = hidden;
            return { from: a.to + 1, to: b.from - 1 };
        }
        return null;
    }
    keepOnlyZoomedContentVisible(view$1, from, to) {
        const effect = zoomInEffect.of({ from, to });
        this.logger.log("KeepOnlyZoomedContent:keepOnlyZoomedContentVisible", "keep only zoomed content visible", effect.value.from, effect.value.to);
        view$1.dispatch({
            effects: [effect],
        });
        view$1.dispatch({
            effects: [
                view.EditorView.scrollIntoView(view$1.state.selection.main, {
                    y: "start",
                }),
            ],
        });
    }
    showAllContent(view$1) {
        this.logger.log("KeepOnlyZoomedContent:showAllContent", "show all content");
        view$1.dispatch({ effects: [zoomOutEffect.of()] });
        view$1.dispatch({
            effects: [
                view.EditorView.scrollIntoView(view$1.state.selection.main, {
                    y: "center",
                }),
            ],
        });
    }
}

class ZoomFeature {
    constructor(plugin, logger) {
        this.plugin = plugin;
        this.logger = logger;
        this.zoomInCallbacks = [];
        this.zoomOutCallbacks = [];
        this.keepOnlyZoomedContentVisible = new KeepOnlyZoomedContentVisible(this.logger);
        this.calculateRangeForZooming = new CalculateRangeForZooming();
    }
    calculateVisibleContentRange(state) {
        return this.keepOnlyZoomedContentVisible.calculateVisibleContentRange(state);
    }
    calculateHiddenContentRanges(state) {
        return this.keepOnlyZoomedContentVisible.calculateHiddenContentRanges(state);
    }
    notifyAfterZoomIn(cb) {
        this.zoomInCallbacks.push(cb);
    }
    notifyAfterZoomOut(cb) {
        this.zoomOutCallbacks.push(cb);
    }
    zoomIn(view, pos) {
        const l = this.logger.bind("ZoomFeature:zoomIn");
        l("zooming in");
        if (!isFoldingEnabled(this.plugin.app)) {
            new obsidian.Notice(`In order to zoom, you must first enable "Fold heading" and "Fold indent" under Settings -> Editor`);
            return;
        }
        const range = this.calculateRangeForZooming.calculateRangeForZooming(view.state, pos);
        if (!range) {
            l("unable to calculate range for zooming");
            return;
        }
        this.keepOnlyZoomedContentVisible.keepOnlyZoomedContentVisible(view, range.from, range.to);
        for (const cb of this.zoomInCallbacks) {
            cb(view, pos);
        }
    }
    zoomOut(view) {
        const l = this.logger.bind("ZoomFeature:zoomIn");
        l("zooming out");
        this.keepOnlyZoomedContentVisible.showAllContent(view);
        for (const cb of this.zoomOutCallbacks) {
            cb(view);
        }
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(this.keepOnlyZoomedContentVisible.getExtension());
            this.plugin.addCommand({
                id: "zoom-in",
                name: "Zoom in",
                icon: "obsidian-zoom-zoom-in",
                editorCallback: (editor) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const view = editor.cm;
                    this.zoomIn(view, view.state.selection.main.head);
                },
                hotkeys: [
                    {
                        modifiers: ["Mod"],
                        key: ".",
                    },
                ],
            });
            this.plugin.addCommand({
                id: "zoom-out",
                name: "Zoom out the entire document",
                icon: "obsidian-zoom-zoom-out",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                editorCallback: (editor) => this.zoomOut(editor.cm),
                hotkeys: [
                    {
                        modifiers: ["Mod", "Shift"],
                        key: ".",
                    },
                ],
            });
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

function isBulletPoint(e) {
    return (e instanceof HTMLSpanElement &&
        (e.classList.contains("list-bullet") ||
            e.classList.contains("cm-formatting-list")));
}

class DetectClickOnBullet {
    constructor(settings, clickOnBullet) {
        this.settings = settings;
        this.clickOnBullet = clickOnBullet;
        this.detectClickOnBullet = (e, view) => {
            if (!this.settings.zoomOnClick ||
                !(e.target instanceof HTMLElement) ||
                !isBulletPoint(e.target)) {
                return;
            }
            const pos = view.posAtDOM(e.target);
            this.clickOnBullet.clickOnBullet(view, pos);
        };
    }
    getExtension() {
        return view.EditorView.domEventHandlers({
            click: this.detectClickOnBullet,
        });
    }
    moveCursorToLineEnd(view, pos) {
        const line = view.state.doc.lineAt(pos);
        view.dispatch({
            selection: state.EditorSelection.cursor(line.to),
        });
    }
}

class ZoomOnClickFeature {
    constructor(plugin, settings, zoomIn) {
        this.plugin = plugin;
        this.settings = settings;
        this.zoomIn = zoomIn;
        this.detectClickOnBullet = new DetectClickOnBullet(this.settings, {
            clickOnBullet: (view, pos) => this.clickOnBullet(view, pos),
        });
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(this.detectClickOnBullet.getExtension());
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    clickOnBullet(view, pos) {
        this.detectClickOnBullet.moveCursorToLineEnd(view, pos);
        this.zoomIn.zoomIn(view, pos);
    }
}

class LoggerService {
    constructor(settings) {
        this.settings = settings;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log(method, ...args) {
        if (!this.settings.debug) {
            return;
        }
        console.info(method, ...args);
    }
    bind(method) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (...args) => this.log(method, ...args);
    }
}

const DEFAULT_SETTINGS = {
    debug: false,
    zoomOnClick: true,
};
class SettingsService {
    constructor(storage) {
        this.storage = storage;
        this.handlers = new Map();
    }
    get debug() {
        return this.values.debug;
    }
    set debug(value) {
        this.set("debug", value);
    }
    get zoomOnClick() {
        return this.values.zoomOnClick;
    }
    set zoomOnClick(value) {
        this.set("zoomOnClick", value);
    }
    onChange(key, cb) {
        if (!this.handlers.has(key)) {
            this.handlers.set(key, new Set());
        }
        this.handlers.get(key).add(cb);
    }
    removeCallback(key, cb) {
        const handlers = this.handlers.get(key);
        if (handlers) {
            handlers.delete(cb);
        }
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.values = Object.assign({}, DEFAULT_SETTINGS, yield this.storage.loadData());
        });
    }
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.storage.saveData(this.values);
        });
    }
    set(key, value) {
        this.values[key] = value;
        const callbacks = this.handlers.get(key);
        if (!callbacks) {
            return;
        }
        for (const cb of callbacks.values()) {
            cb(value);
        }
    }
}

obsidian.addIcon("obsidian-zoom-zoom-in", `<path fill="currentColor" stroke="currentColor" stroke-width="2" d="M42,6C23.2,6,8,21.2,8,40s15.2,34,34,34c7.4,0,14.3-2.4,19.9-6.4l26.3,26.3l5.6-5.6l-26-26.1c5.1-6,8.2-13.7,8.2-22.1 C76,21.2,60.8,6,42,6z M42,10c16.6,0,30,13.4,30,30S58.6,70,42,70S12,56.6,12,40S25.4,10,42,10z"></path><line x1="24" y1="40" x2="60" y2="40" stroke="currentColor" stroke-width="10"></line><line x1="42" y1="20" x2="42" y2="60" stroke="currentColor" stroke-width="10"></line>`);
obsidian.addIcon("obsidian-zoom-zoom-out", `<path fill="currentColor" stroke="currentColor" stroke-width="2" d="M42,6C23.2,6,8,21.2,8,40s15.2,34,34,34c7.4,0,14.3-2.4,19.9-6.4l26.3,26.3l5.6-5.6l-26-26.1c5.1-6,8.2-13.7,8.2-22.1 C76,21.2,60.8,6,42,6z M42,10c16.6,0,30,13.4,30,30S58.6,70,42,70S12,56.6,12,40S25.4,10,42,10z"></path><line x1="24" y1="40" x2="60" y2="40" stroke="currentColor" stroke-width="10"></line>`);
class ObsidianZoomPlugin extends obsidian.Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Loading obsidian-zoom`);
            if (this.isLegacyEditorEnabled()) {
                new obsidian.Notice(`Zoom plugin does not support legacy editor mode starting from version 0.2. Please disable the "Use legacy editor" option or manually install version 0.1 of Zoom plugin.`, 30000);
                return;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            window.ObsidianZoomPlugin = this;
            const settings = new SettingsService(this);
            yield settings.load();
            const logger = new LoggerService(settings);
            const settingsTabFeature = new SettingsTabFeature(this, settings);
            const zoomFeature = new ZoomFeature(this, logger);
            const limitSelectionFeature = new LimitSelectionFeature(this, logger, zoomFeature);
            const resetZoomWhenVisibleContentBoundariesViolatedFeature = new ResetZoomWhenVisibleContentBoundariesViolatedFeature(this, logger, zoomFeature, zoomFeature);
            const headerNavigationFeature = new HeaderNavigationFeature(this, logger, zoomFeature, zoomFeature, zoomFeature, zoomFeature, zoomFeature, zoomFeature);
            const zoomOnClickFeature = new ZoomOnClickFeature(this, settings, zoomFeature);
            const listsStylesFeature = new ListsStylesFeature(settings);
            this.features = [
                settingsTabFeature,
                zoomFeature,
                limitSelectionFeature,
                resetZoomWhenVisibleContentBoundariesViolatedFeature,
                headerNavigationFeature,
                zoomOnClickFeature,
                listsStylesFeature,
            ];
            for (const feature of this.features) {
                yield feature.load();
            }
        });
    }
    onunload() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Unloading obsidian-zoom`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete window.ObsidianZoomPlugin;
            for (const feature of this.features) {
                yield feature.unload();
            }
        });
    }
    isLegacyEditorEnabled() {
        const config = Object.assign({ legacyEditor: true }, this.app.vault.config);
        return config.legacyEditor;
    }
}

module.exports = ObsidianZoomPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsibm9kZV9tb2R1bGVzL3RzbGliL3RzbGliLmVzNi5qcyIsInNyYy9mZWF0dXJlcy91dGlscy9nZXREb2N1bWVudFRpdGxlLnRzIiwic3JjL2ZlYXR1cmVzL3V0aWxzL2dldEVkaXRvclZpZXdGcm9tRWRpdG9yU3RhdGUudHMiLCJzcmMvbG9naWMvdXRpbHMvY2xlYW5UaXRsZS50cyIsInNyYy9sb2dpYy9Db2xsZWN0QnJlYWRjcnVtYnMudHMiLCJzcmMvbG9naWMvdXRpbHMvY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uLnRzIiwic3JjL2xvZ2ljL0RldGVjdFJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZC50cyIsIm5vZGVfbW9kdWxlcy9AY29kZW1pcnJvci9wYW5lbC9kaXN0L2luZGV4LmpzIiwic3JjL2xvZ2ljL3V0aWxzL3JlbmRlckhlYWRlci50cyIsInNyYy9sb2dpYy9SZW5kZXJOYXZpZ2F0aW9uSGVhZGVyLnRzIiwic3JjL2ZlYXR1cmVzL0hlYWRlck5hdmlnYXRpb25GZWF0dXJlLnRzIiwic3JjL2xvZ2ljL3V0aWxzL2NhbGN1bGF0ZUxpbWl0ZWRTZWxlY3Rpb24udHMiLCJzcmMvbG9naWMvdXRpbHMvZWZmZWN0cy50cyIsInNyYy9sb2dpYy9MaW1pdFNlbGVjdGlvbk9uWm9vbWluZ0luLnRzIiwic3JjL2xvZ2ljL0xpbWl0U2VsZWN0aW9uV2hlblpvb21lZEluLnRzIiwic3JjL2ZlYXR1cmVzL0xpbWl0U2VsZWN0aW9uRmVhdHVyZS50cyIsInNyYy9mZWF0dXJlcy9MaXN0c1N0eWxlc0ZlYXR1cmUudHMiLCJzcmMvbG9naWMvRGV0ZWN0VmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uLnRzIiwic3JjL2ZlYXR1cmVzL1Jlc2V0Wm9vbVdoZW5WaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRlZEZlYXR1cmUudHMiLCJzcmMvZmVhdHVyZXMvU2V0dGluZ3NUYWJGZWF0dXJlLnRzIiwic3JjL2ZlYXR1cmVzL3V0aWxzL2lzRm9sZGluZ0VuYWJsZWQudHMiLCJzcmMvbG9naWMvQ2FsY3VsYXRlUmFuZ2VGb3Jab29taW5nLnRzIiwic3JjL2xvZ2ljL3V0aWxzL3JhbmdlU2V0VG9BcnJheS50cyIsInNyYy9sb2dpYy9LZWVwT25seVpvb21lZENvbnRlbnRWaXNpYmxlLnRzIiwic3JjL2ZlYXR1cmVzL1pvb21GZWF0dXJlLnRzIiwic3JjL2xvZ2ljL3V0aWxzL2lzQnVsbGV0UG9pbnQudHMiLCJzcmMvbG9naWMvRGV0ZWN0Q2xpY2tPbkJ1bGxldC50cyIsInNyYy9mZWF0dXJlcy9ab29tT25DbGlja0ZlYXR1cmUudHMiLCJzcmMvc2VydmljZXMvTG9nZ2VyU2VydmljZS50cyIsInNyYy9zZXJ2aWNlcy9TZXR0aW5nc1NlcnZpY2UudHMiLCJzcmMvT2JzaWRpYW5ab29tUGx1Z2luLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qISAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG5Db3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi5cclxuXHJcblBlcm1pc3Npb24gdG8gdXNlLCBjb3B5LCBtb2RpZnksIGFuZC9vciBkaXN0cmlidXRlIHRoaXMgc29mdHdhcmUgZm9yIGFueVxyXG5wdXJwb3NlIHdpdGggb3Igd2l0aG91dCBmZWUgaXMgaGVyZWJ5IGdyYW50ZWQuXHJcblxyXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiIEFORCBUSEUgQVVUSE9SIERJU0NMQUlNUyBBTEwgV0FSUkFOVElFUyBXSVRIXHJcblJFR0FSRCBUTyBUSElTIFNPRlRXQVJFIElOQ0xVRElORyBBTEwgSU1QTElFRCBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWVxyXG5BTkQgRklUTkVTUy4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUiBCRSBMSUFCTEUgRk9SIEFOWSBTUEVDSUFMLCBESVJFQ1QsXHJcbklORElSRUNULCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVMgT1IgQU5ZIERBTUFHRVMgV0hBVFNPRVZFUiBSRVNVTFRJTkcgRlJPTVxyXG5MT1NTIE9GIFVTRSwgREFUQSBPUiBQUk9GSVRTLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgTkVHTElHRU5DRSBPUlxyXG5PVEhFUiBUT1JUSU9VUyBBQ1RJT04sIEFSSVNJTkcgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgVVNFIE9SXHJcblBFUkZPUk1BTkNFIE9GIFRISVMgU09GVFdBUkUuXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqICovXHJcbi8qIGdsb2JhbCBSZWZsZWN0LCBQcm9taXNlICovXHJcblxyXG52YXIgZXh0ZW5kU3RhdGljcyA9IGZ1bmN0aW9uKGQsIGIpIHtcclxuICAgIGV4dGVuZFN0YXRpY3MgPSBPYmplY3Quc2V0UHJvdG90eXBlT2YgfHxcclxuICAgICAgICAoeyBfX3Byb3RvX186IFtdIH0gaW5zdGFuY2VvZiBBcnJheSAmJiBmdW5jdGlvbiAoZCwgYikgeyBkLl9fcHJvdG9fXyA9IGI7IH0pIHx8XHJcbiAgICAgICAgZnVuY3Rpb24gKGQsIGIpIHsgZm9yICh2YXIgcCBpbiBiKSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGIsIHApKSBkW3BdID0gYltwXTsgfTtcclxuICAgIHJldHVybiBleHRlbmRTdGF0aWNzKGQsIGIpO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZXh0ZW5kcyhkLCBiKSB7XHJcbiAgICBpZiAodHlwZW9mIGIgIT09IFwiZnVuY3Rpb25cIiAmJiBiICE9PSBudWxsKVxyXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDbGFzcyBleHRlbmRzIHZhbHVlIFwiICsgU3RyaW5nKGIpICsgXCIgaXMgbm90IGEgY29uc3RydWN0b3Igb3IgbnVsbFwiKTtcclxuICAgIGV4dGVuZFN0YXRpY3MoZCwgYik7XHJcbiAgICBmdW5jdGlvbiBfXygpIHsgdGhpcy5jb25zdHJ1Y3RvciA9IGQ7IH1cclxuICAgIGQucHJvdG90eXBlID0gYiA9PT0gbnVsbCA/IE9iamVjdC5jcmVhdGUoYikgOiAoX18ucHJvdG90eXBlID0gYi5wcm90b3R5cGUsIG5ldyBfXygpKTtcclxufVxyXG5cclxuZXhwb3J0IHZhciBfX2Fzc2lnbiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgX19hc3NpZ24gPSBPYmplY3QuYXNzaWduIHx8IGZ1bmN0aW9uIF9fYXNzaWduKHQpIHtcclxuICAgICAgICBmb3IgKHZhciBzLCBpID0gMSwgbiA9IGFyZ3VtZW50cy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcclxuICAgICAgICAgICAgcyA9IGFyZ3VtZW50c1tpXTtcclxuICAgICAgICAgICAgZm9yICh2YXIgcCBpbiBzKSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHMsIHApKSB0W3BdID0gc1twXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHQ7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gX19hc3NpZ24uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcmVzdChzLCBlKSB7XHJcbiAgICB2YXIgdCA9IHt9O1xyXG4gICAgZm9yICh2YXIgcCBpbiBzKSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHMsIHApICYmIGUuaW5kZXhPZihwKSA8IDApXHJcbiAgICAgICAgdFtwXSA9IHNbcF07XHJcbiAgICBpZiAocyAhPSBudWxsICYmIHR5cGVvZiBPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzID09PSBcImZ1bmN0aW9uXCIpXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIHAgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKHMpOyBpIDwgcC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoZS5pbmRleE9mKHBbaV0pIDwgMCAmJiBPYmplY3QucHJvdG90eXBlLnByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwocywgcFtpXSkpXHJcbiAgICAgICAgICAgICAgICB0W3BbaV1dID0gc1twW2ldXTtcclxuICAgICAgICB9XHJcbiAgICByZXR1cm4gdDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZGVjb3JhdGUoZGVjb3JhdG9ycywgdGFyZ2V0LCBrZXksIGRlc2MpIHtcclxuICAgIHZhciBjID0gYXJndW1lbnRzLmxlbmd0aCwgciA9IGMgPCAzID8gdGFyZ2V0IDogZGVzYyA9PT0gbnVsbCA/IGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHRhcmdldCwga2V5KSA6IGRlc2MsIGQ7XHJcbiAgICBpZiAodHlwZW9mIFJlZmxlY3QgPT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIFJlZmxlY3QuZGVjb3JhdGUgPT09IFwiZnVuY3Rpb25cIikgciA9IFJlZmxlY3QuZGVjb3JhdGUoZGVjb3JhdG9ycywgdGFyZ2V0LCBrZXksIGRlc2MpO1xyXG4gICAgZWxzZSBmb3IgKHZhciBpID0gZGVjb3JhdG9ycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkgaWYgKGQgPSBkZWNvcmF0b3JzW2ldKSByID0gKGMgPCAzID8gZChyKSA6IGMgPiAzID8gZCh0YXJnZXQsIGtleSwgcikgOiBkKHRhcmdldCwga2V5KSkgfHwgcjtcclxuICAgIHJldHVybiBjID4gMyAmJiByICYmIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIGtleSwgciksIHI7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3BhcmFtKHBhcmFtSW5kZXgsIGRlY29yYXRvcikge1xyXG4gICAgcmV0dXJuIGZ1bmN0aW9uICh0YXJnZXQsIGtleSkgeyBkZWNvcmF0b3IodGFyZ2V0LCBrZXksIHBhcmFtSW5kZXgpOyB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX21ldGFkYXRhKG1ldGFkYXRhS2V5LCBtZXRhZGF0YVZhbHVlKSB7XHJcbiAgICBpZiAodHlwZW9mIFJlZmxlY3QgPT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIFJlZmxlY3QubWV0YWRhdGEgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIFJlZmxlY3QubWV0YWRhdGEobWV0YWRhdGFLZXksIG1ldGFkYXRhVmFsdWUpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hd2FpdGVyKHRoaXNBcmcsIF9hcmd1bWVudHMsIFAsIGdlbmVyYXRvcikge1xyXG4gICAgZnVuY3Rpb24gYWRvcHQodmFsdWUpIHsgcmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgUCA/IHZhbHVlIDogbmV3IFAoZnVuY3Rpb24gKHJlc29sdmUpIHsgcmVzb2x2ZSh2YWx1ZSk7IH0pOyB9XHJcbiAgICByZXR1cm4gbmV3IChQIHx8IChQID0gUHJvbWlzZSkpKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICBmdW5jdGlvbiBmdWxmaWxsZWQodmFsdWUpIHsgdHJ5IHsgc3RlcChnZW5lcmF0b3IubmV4dCh2YWx1ZSkpOyB9IGNhdGNoIChlKSB7IHJlamVjdChlKTsgfSB9XHJcbiAgICAgICAgZnVuY3Rpb24gcmVqZWN0ZWQodmFsdWUpIHsgdHJ5IHsgc3RlcChnZW5lcmF0b3JbXCJ0aHJvd1wiXSh2YWx1ZSkpOyB9IGNhdGNoIChlKSB7IHJlamVjdChlKTsgfSB9XHJcbiAgICAgICAgZnVuY3Rpb24gc3RlcChyZXN1bHQpIHsgcmVzdWx0LmRvbmUgPyByZXNvbHZlKHJlc3VsdC52YWx1ZSkgOiBhZG9wdChyZXN1bHQudmFsdWUpLnRoZW4oZnVsZmlsbGVkLCByZWplY3RlZCk7IH1cclxuICAgICAgICBzdGVwKChnZW5lcmF0b3IgPSBnZW5lcmF0b3IuYXBwbHkodGhpc0FyZywgX2FyZ3VtZW50cyB8fCBbXSkpLm5leHQoKSk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZ2VuZXJhdG9yKHRoaXNBcmcsIGJvZHkpIHtcclxuICAgIHZhciBfID0geyBsYWJlbDogMCwgc2VudDogZnVuY3Rpb24oKSB7IGlmICh0WzBdICYgMSkgdGhyb3cgdFsxXTsgcmV0dXJuIHRbMV07IH0sIHRyeXM6IFtdLCBvcHM6IFtdIH0sIGYsIHksIHQsIGc7XHJcbiAgICByZXR1cm4gZyA9IHsgbmV4dDogdmVyYigwKSwgXCJ0aHJvd1wiOiB2ZXJiKDEpLCBcInJldHVyblwiOiB2ZXJiKDIpIH0sIHR5cGVvZiBTeW1ib2wgPT09IFwiZnVuY3Rpb25cIiAmJiAoZ1tTeW1ib2wuaXRlcmF0b3JdID0gZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzOyB9KSwgZztcclxuICAgIGZ1bmN0aW9uIHZlcmIobikgeyByZXR1cm4gZnVuY3Rpb24gKHYpIHsgcmV0dXJuIHN0ZXAoW24sIHZdKTsgfTsgfVxyXG4gICAgZnVuY3Rpb24gc3RlcChvcCkge1xyXG4gICAgICAgIGlmIChmKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiR2VuZXJhdG9yIGlzIGFscmVhZHkgZXhlY3V0aW5nLlwiKTtcclxuICAgICAgICB3aGlsZSAoXykgdHJ5IHtcclxuICAgICAgICAgICAgaWYgKGYgPSAxLCB5ICYmICh0ID0gb3BbMF0gJiAyID8geVtcInJldHVyblwiXSA6IG9wWzBdID8geVtcInRocm93XCJdIHx8ICgodCA9IHlbXCJyZXR1cm5cIl0pICYmIHQuY2FsbCh5KSwgMCkgOiB5Lm5leHQpICYmICEodCA9IHQuY2FsbCh5LCBvcFsxXSkpLmRvbmUpIHJldHVybiB0O1xyXG4gICAgICAgICAgICBpZiAoeSA9IDAsIHQpIG9wID0gW29wWzBdICYgMiwgdC52YWx1ZV07XHJcbiAgICAgICAgICAgIHN3aXRjaCAob3BbMF0pIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgMDogY2FzZSAxOiB0ID0gb3A7IGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSA0OiBfLmxhYmVsKys7IHJldHVybiB7IHZhbHVlOiBvcFsxXSwgZG9uZTogZmFsc2UgfTtcclxuICAgICAgICAgICAgICAgIGNhc2UgNTogXy5sYWJlbCsrOyB5ID0gb3BbMV07IG9wID0gWzBdOyBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIGNhc2UgNzogb3AgPSBfLm9wcy5wb3AoKTsgXy50cnlzLnBvcCgpOyBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCEodCA9IF8udHJ5cywgdCA9IHQubGVuZ3RoID4gMCAmJiB0W3QubGVuZ3RoIC0gMV0pICYmIChvcFswXSA9PT0gNiB8fCBvcFswXSA9PT0gMikpIHsgXyA9IDA7IGNvbnRpbnVlOyB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wWzBdID09PSAzICYmICghdCB8fCAob3BbMV0gPiB0WzBdICYmIG9wWzFdIDwgdFszXSkpKSB7IF8ubGFiZWwgPSBvcFsxXTsgYnJlYWs7IH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAob3BbMF0gPT09IDYgJiYgXy5sYWJlbCA8IHRbMV0pIHsgXy5sYWJlbCA9IHRbMV07IHQgPSBvcDsgYnJlYWs7IH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAodCAmJiBfLmxhYmVsIDwgdFsyXSkgeyBfLmxhYmVsID0gdFsyXTsgXy5vcHMucHVzaChvcCk7IGJyZWFrOyB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRbMl0pIF8ub3BzLnBvcCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIF8udHJ5cy5wb3AoKTsgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgb3AgPSBib2R5LmNhbGwodGhpc0FyZywgXyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkgeyBvcCA9IFs2LCBlXTsgeSA9IDA7IH0gZmluYWxseSB7IGYgPSB0ID0gMDsgfVxyXG4gICAgICAgIGlmIChvcFswXSAmIDUpIHRocm93IG9wWzFdOyByZXR1cm4geyB2YWx1ZTogb3BbMF0gPyBvcFsxXSA6IHZvaWQgMCwgZG9uZTogdHJ1ZSB9O1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgdmFyIF9fY3JlYXRlQmluZGluZyA9IE9iamVjdC5jcmVhdGUgPyAoZnVuY3Rpb24obywgbSwgaywgazIpIHtcclxuICAgIGlmIChrMiA9PT0gdW5kZWZpbmVkKSBrMiA9IGs7XHJcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkobywgazIsIHsgZW51bWVyYWJsZTogdHJ1ZSwgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIG1ba107IH0gfSk7XHJcbn0pIDogKGZ1bmN0aW9uKG8sIG0sIGssIGsyKSB7XHJcbiAgICBpZiAoazIgPT09IHVuZGVmaW5lZCkgazIgPSBrO1xyXG4gICAgb1trMl0gPSBtW2tdO1xyXG59KTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2V4cG9ydFN0YXIobSwgbykge1xyXG4gICAgZm9yICh2YXIgcCBpbiBtKSBpZiAocCAhPT0gXCJkZWZhdWx0XCIgJiYgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvLCBwKSkgX19jcmVhdGVCaW5kaW5nKG8sIG0sIHApO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX192YWx1ZXMobykge1xyXG4gICAgdmFyIHMgPSB0eXBlb2YgU3ltYm9sID09PSBcImZ1bmN0aW9uXCIgJiYgU3ltYm9sLml0ZXJhdG9yLCBtID0gcyAmJiBvW3NdLCBpID0gMDtcclxuICAgIGlmIChtKSByZXR1cm4gbS5jYWxsKG8pO1xyXG4gICAgaWYgKG8gJiYgdHlwZW9mIG8ubGVuZ3RoID09PSBcIm51bWJlclwiKSByZXR1cm4ge1xyXG4gICAgICAgIG5leHQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgaWYgKG8gJiYgaSA+PSBvLmxlbmd0aCkgbyA9IHZvaWQgMDtcclxuICAgICAgICAgICAgcmV0dXJuIHsgdmFsdWU6IG8gJiYgb1tpKytdLCBkb25lOiAhbyB9O1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKHMgPyBcIk9iamVjdCBpcyBub3QgaXRlcmFibGUuXCIgOiBcIlN5bWJvbC5pdGVyYXRvciBpcyBub3QgZGVmaW5lZC5cIik7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3JlYWQobywgbikge1xyXG4gICAgdmFyIG0gPSB0eXBlb2YgU3ltYm9sID09PSBcImZ1bmN0aW9uXCIgJiYgb1tTeW1ib2wuaXRlcmF0b3JdO1xyXG4gICAgaWYgKCFtKSByZXR1cm4gbztcclxuICAgIHZhciBpID0gbS5jYWxsKG8pLCByLCBhciA9IFtdLCBlO1xyXG4gICAgdHJ5IHtcclxuICAgICAgICB3aGlsZSAoKG4gPT09IHZvaWQgMCB8fCBuLS0gPiAwKSAmJiAhKHIgPSBpLm5leHQoKSkuZG9uZSkgYXIucHVzaChyLnZhbHVlKTtcclxuICAgIH1cclxuICAgIGNhdGNoIChlcnJvcikgeyBlID0geyBlcnJvcjogZXJyb3IgfTsgfVxyXG4gICAgZmluYWxseSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgaWYgKHIgJiYgIXIuZG9uZSAmJiAobSA9IGlbXCJyZXR1cm5cIl0pKSBtLmNhbGwoaSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZpbmFsbHkgeyBpZiAoZSkgdGhyb3cgZS5lcnJvcjsgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGFyO1xyXG59XHJcblxyXG4vKiogQGRlcHJlY2F0ZWQgKi9cclxuZXhwb3J0IGZ1bmN0aW9uIF9fc3ByZWFkKCkge1xyXG4gICAgZm9yICh2YXIgYXIgPSBbXSwgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgYXIgPSBhci5jb25jYXQoX19yZWFkKGFyZ3VtZW50c1tpXSkpO1xyXG4gICAgcmV0dXJuIGFyO1xyXG59XHJcblxyXG4vKiogQGRlcHJlY2F0ZWQgKi9cclxuZXhwb3J0IGZ1bmN0aW9uIF9fc3ByZWFkQXJyYXlzKCkge1xyXG4gICAgZm9yICh2YXIgcyA9IDAsIGkgPSAwLCBpbCA9IGFyZ3VtZW50cy5sZW5ndGg7IGkgPCBpbDsgaSsrKSBzICs9IGFyZ3VtZW50c1tpXS5sZW5ndGg7XHJcbiAgICBmb3IgKHZhciByID0gQXJyYXkocyksIGsgPSAwLCBpID0gMDsgaSA8IGlsOyBpKyspXHJcbiAgICAgICAgZm9yICh2YXIgYSA9IGFyZ3VtZW50c1tpXSwgaiA9IDAsIGpsID0gYS5sZW5ndGg7IGogPCBqbDsgaisrLCBrKyspXHJcbiAgICAgICAgICAgIHJba10gPSBhW2pdO1xyXG4gICAgcmV0dXJuIHI7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3NwcmVhZEFycmF5KHRvLCBmcm9tLCBwYWNrKSB7XHJcbiAgICBpZiAocGFjayB8fCBhcmd1bWVudHMubGVuZ3RoID09PSAyKSBmb3IgKHZhciBpID0gMCwgbCA9IGZyb20ubGVuZ3RoLCBhcjsgaSA8IGw7IGkrKykge1xyXG4gICAgICAgIGlmIChhciB8fCAhKGkgaW4gZnJvbSkpIHtcclxuICAgICAgICAgICAgaWYgKCFhcikgYXIgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChmcm9tLCAwLCBpKTtcclxuICAgICAgICAgICAgYXJbaV0gPSBmcm9tW2ldO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiB0by5jb25jYXQoYXIgfHwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoZnJvbSkpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hd2FpdCh2KSB7XHJcbiAgICByZXR1cm4gdGhpcyBpbnN0YW5jZW9mIF9fYXdhaXQgPyAodGhpcy52ID0gdiwgdGhpcykgOiBuZXcgX19hd2FpdCh2KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fYXN5bmNHZW5lcmF0b3IodGhpc0FyZywgX2FyZ3VtZW50cywgZ2VuZXJhdG9yKSB7XHJcbiAgICBpZiAoIVN5bWJvbC5hc3luY0l0ZXJhdG9yKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiU3ltYm9sLmFzeW5jSXRlcmF0b3IgaXMgbm90IGRlZmluZWQuXCIpO1xyXG4gICAgdmFyIGcgPSBnZW5lcmF0b3IuYXBwbHkodGhpc0FyZywgX2FyZ3VtZW50cyB8fCBbXSksIGksIHEgPSBbXTtcclxuICAgIHJldHVybiBpID0ge30sIHZlcmIoXCJuZXh0XCIpLCB2ZXJiKFwidGhyb3dcIiksIHZlcmIoXCJyZXR1cm5cIiksIGlbU3ltYm9sLmFzeW5jSXRlcmF0b3JdID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpczsgfSwgaTtcclxuICAgIGZ1bmN0aW9uIHZlcmIobikgeyBpZiAoZ1tuXSkgaVtuXSA9IGZ1bmN0aW9uICh2KSB7IHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAoYSwgYikgeyBxLnB1c2goW24sIHYsIGEsIGJdKSA+IDEgfHwgcmVzdW1lKG4sIHYpOyB9KTsgfTsgfVxyXG4gICAgZnVuY3Rpb24gcmVzdW1lKG4sIHYpIHsgdHJ5IHsgc3RlcChnW25dKHYpKTsgfSBjYXRjaCAoZSkgeyBzZXR0bGUocVswXVszXSwgZSk7IH0gfVxyXG4gICAgZnVuY3Rpb24gc3RlcChyKSB7IHIudmFsdWUgaW5zdGFuY2VvZiBfX2F3YWl0ID8gUHJvbWlzZS5yZXNvbHZlKHIudmFsdWUudikudGhlbihmdWxmaWxsLCByZWplY3QpIDogc2V0dGxlKHFbMF1bMl0sIHIpOyB9XHJcbiAgICBmdW5jdGlvbiBmdWxmaWxsKHZhbHVlKSB7IHJlc3VtZShcIm5leHRcIiwgdmFsdWUpOyB9XHJcbiAgICBmdW5jdGlvbiByZWplY3QodmFsdWUpIHsgcmVzdW1lKFwidGhyb3dcIiwgdmFsdWUpOyB9XHJcbiAgICBmdW5jdGlvbiBzZXR0bGUoZiwgdikgeyBpZiAoZih2KSwgcS5zaGlmdCgpLCBxLmxlbmd0aCkgcmVzdW1lKHFbMF1bMF0sIHFbMF1bMV0pOyB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2FzeW5jRGVsZWdhdG9yKG8pIHtcclxuICAgIHZhciBpLCBwO1xyXG4gICAgcmV0dXJuIGkgPSB7fSwgdmVyYihcIm5leHRcIiksIHZlcmIoXCJ0aHJvd1wiLCBmdW5jdGlvbiAoZSkgeyB0aHJvdyBlOyB9KSwgdmVyYihcInJldHVyblwiKSwgaVtTeW1ib2wuaXRlcmF0b3JdID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpczsgfSwgaTtcclxuICAgIGZ1bmN0aW9uIHZlcmIobiwgZikgeyBpW25dID0gb1tuXSA/IGZ1bmN0aW9uICh2KSB7IHJldHVybiAocCA9ICFwKSA/IHsgdmFsdWU6IF9fYXdhaXQob1tuXSh2KSksIGRvbmU6IG4gPT09IFwicmV0dXJuXCIgfSA6IGYgPyBmKHYpIDogdjsgfSA6IGY7IH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fYXN5bmNWYWx1ZXMobykge1xyXG4gICAgaWYgKCFTeW1ib2wuYXN5bmNJdGVyYXRvcikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlN5bWJvbC5hc3luY0l0ZXJhdG9yIGlzIG5vdCBkZWZpbmVkLlwiKTtcclxuICAgIHZhciBtID0gb1tTeW1ib2wuYXN5bmNJdGVyYXRvcl0sIGk7XHJcbiAgICByZXR1cm4gbSA/IG0uY2FsbChvKSA6IChvID0gdHlwZW9mIF9fdmFsdWVzID09PSBcImZ1bmN0aW9uXCIgPyBfX3ZhbHVlcyhvKSA6IG9bU3ltYm9sLml0ZXJhdG9yXSgpLCBpID0ge30sIHZlcmIoXCJuZXh0XCIpLCB2ZXJiKFwidGhyb3dcIiksIHZlcmIoXCJyZXR1cm5cIiksIGlbU3ltYm9sLmFzeW5jSXRlcmF0b3JdID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpczsgfSwgaSk7XHJcbiAgICBmdW5jdGlvbiB2ZXJiKG4pIHsgaVtuXSA9IG9bbl0gJiYgZnVuY3Rpb24gKHYpIHsgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHsgdiA9IG9bbl0odiksIHNldHRsZShyZXNvbHZlLCByZWplY3QsIHYuZG9uZSwgdi52YWx1ZSk7IH0pOyB9OyB9XHJcbiAgICBmdW5jdGlvbiBzZXR0bGUocmVzb2x2ZSwgcmVqZWN0LCBkLCB2KSB7IFByb21pc2UucmVzb2x2ZSh2KS50aGVuKGZ1bmN0aW9uKHYpIHsgcmVzb2x2ZSh7IHZhbHVlOiB2LCBkb25lOiBkIH0pOyB9LCByZWplY3QpOyB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX21ha2VUZW1wbGF0ZU9iamVjdChjb29rZWQsIHJhdykge1xyXG4gICAgaWYgKE9iamVjdC5kZWZpbmVQcm9wZXJ0eSkgeyBPYmplY3QuZGVmaW5lUHJvcGVydHkoY29va2VkLCBcInJhd1wiLCB7IHZhbHVlOiByYXcgfSk7IH0gZWxzZSB7IGNvb2tlZC5yYXcgPSByYXc7IH1cclxuICAgIHJldHVybiBjb29rZWQ7XHJcbn07XHJcblxyXG52YXIgX19zZXRNb2R1bGVEZWZhdWx0ID0gT2JqZWN0LmNyZWF0ZSA/IChmdW5jdGlvbihvLCB2KSB7XHJcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkobywgXCJkZWZhdWx0XCIsIHsgZW51bWVyYWJsZTogdHJ1ZSwgdmFsdWU6IHYgfSk7XHJcbn0pIDogZnVuY3Rpb24obywgdikge1xyXG4gICAgb1tcImRlZmF1bHRcIl0gPSB2O1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9faW1wb3J0U3Rhcihtb2QpIHtcclxuICAgIGlmIChtb2QgJiYgbW9kLl9fZXNNb2R1bGUpIHJldHVybiBtb2Q7XHJcbiAgICB2YXIgcmVzdWx0ID0ge307XHJcbiAgICBpZiAobW9kICE9IG51bGwpIGZvciAodmFyIGsgaW4gbW9kKSBpZiAoayAhPT0gXCJkZWZhdWx0XCIgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG1vZCwgaykpIF9fY3JlYXRlQmluZGluZyhyZXN1bHQsIG1vZCwgayk7XHJcbiAgICBfX3NldE1vZHVsZURlZmF1bHQocmVzdWx0LCBtb2QpO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9faW1wb3J0RGVmYXVsdChtb2QpIHtcclxuICAgIHJldHVybiAobW9kICYmIG1vZC5fX2VzTW9kdWxlKSA/IG1vZCA6IHsgZGVmYXVsdDogbW9kIH07XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2NsYXNzUHJpdmF0ZUZpZWxkR2V0KHJlY2VpdmVyLCBzdGF0ZSwga2luZCwgZikge1xyXG4gICAgaWYgKGtpbmQgPT09IFwiYVwiICYmICFmKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUHJpdmF0ZSBhY2Nlc3NvciB3YXMgZGVmaW5lZCB3aXRob3V0IGEgZ2V0dGVyXCIpO1xyXG4gICAgaWYgKHR5cGVvZiBzdGF0ZSA9PT0gXCJmdW5jdGlvblwiID8gcmVjZWl2ZXIgIT09IHN0YXRlIHx8ICFmIDogIXN0YXRlLmhhcyhyZWNlaXZlcikpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3QgcmVhZCBwcml2YXRlIG1lbWJlciBmcm9tIGFuIG9iamVjdCB3aG9zZSBjbGFzcyBkaWQgbm90IGRlY2xhcmUgaXRcIik7XHJcbiAgICByZXR1cm4ga2luZCA9PT0gXCJtXCIgPyBmIDoga2luZCA9PT0gXCJhXCIgPyBmLmNhbGwocmVjZWl2ZXIpIDogZiA/IGYudmFsdWUgOiBzdGF0ZS5nZXQocmVjZWl2ZXIpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19jbGFzc1ByaXZhdGVGaWVsZFNldChyZWNlaXZlciwgc3RhdGUsIHZhbHVlLCBraW5kLCBmKSB7XHJcbiAgICBpZiAoa2luZCA9PT0gXCJtXCIpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQcml2YXRlIG1ldGhvZCBpcyBub3Qgd3JpdGFibGVcIik7XHJcbiAgICBpZiAoa2luZCA9PT0gXCJhXCIgJiYgIWYpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQcml2YXRlIGFjY2Vzc29yIHdhcyBkZWZpbmVkIHdpdGhvdXQgYSBzZXR0ZXJcIik7XHJcbiAgICBpZiAodHlwZW9mIHN0YXRlID09PSBcImZ1bmN0aW9uXCIgPyByZWNlaXZlciAhPT0gc3RhdGUgfHwgIWYgOiAhc3RhdGUuaGFzKHJlY2VpdmVyKSkgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkNhbm5vdCB3cml0ZSBwcml2YXRlIG1lbWJlciB0byBhbiBvYmplY3Qgd2hvc2UgY2xhc3MgZGlkIG5vdCBkZWNsYXJlIGl0XCIpO1xyXG4gICAgcmV0dXJuIChraW5kID09PSBcImFcIiA/IGYuY2FsbChyZWNlaXZlciwgdmFsdWUpIDogZiA/IGYudmFsdWUgPSB2YWx1ZSA6IHN0YXRlLnNldChyZWNlaXZlciwgdmFsdWUpKSwgdmFsdWU7XHJcbn1cclxuIiwiaW1wb3J0IHsgZWRpdG9yVmlld0ZpZWxkIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IEVkaXRvclN0YXRlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREb2N1bWVudFRpdGxlKHN0YXRlOiBFZGl0b3JTdGF0ZSkge1xuICByZXR1cm4gc3RhdGUuZmllbGQoZWRpdG9yVmlld0ZpZWxkKS5nZXREaXNwbGF5VGV4dCgpO1xufVxuIiwiaW1wb3J0IHsgZWRpdG9yRWRpdG9yRmllbGQgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgRWRpdG9yU3RhdGUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWRpdG9yVmlld0Zyb21FZGl0b3JTdGF0ZShzdGF0ZTogRWRpdG9yU3RhdGUpOiBFZGl0b3JWaWV3IHtcbiAgcmV0dXJuIHN0YXRlLmZpZWxkKGVkaXRvckVkaXRvckZpZWxkKTtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiBjbGVhblRpdGxlKHRpdGxlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHRpdGxlXG4gICAgLnRyaW0oKVxuICAgIC5yZXBsYWNlKC9eIysoXFxzKS8sIFwiJDFcIilcbiAgICAucmVwbGFjZSgvXihbLSsqXXxcXGQrXFwuKShcXHMpLywgXCIkMlwiKVxuICAgIC50cmltKCk7XG59XG4iLCJpbXBvcnQgeyBmb2xkYWJsZSB9IGZyb20gXCJAY29kZW1pcnJvci9sYW5ndWFnZVwiO1xuaW1wb3J0IHsgRWRpdG9yU3RhdGUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcblxuaW1wb3J0IHsgY2xlYW5UaXRsZSB9IGZyb20gXCIuL3V0aWxzL2NsZWFuVGl0bGVcIjtcblxuZXhwb3J0IGludGVyZmFjZSBCcmVhZGNydW1iIHtcbiAgdGl0bGU6IHN0cmluZztcbiAgcG9zOiBudW1iZXIgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdldERvY3VtZW50VGl0bGUge1xuICBnZXREb2N1bWVudFRpdGxlKHN0YXRlOiBFZGl0b3JTdGF0ZSk6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIENvbGxlY3RCcmVhZGNydW1icyB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgZ2V0RG9jdW1lbnRUaXRsZTogR2V0RG9jdW1lbnRUaXRsZSkge31cblxuICBwdWJsaWMgY29sbGVjdEJyZWFkY3J1bWJzKHN0YXRlOiBFZGl0b3JTdGF0ZSwgcG9zOiBudW1iZXIpIHtcbiAgICBjb25zdCBicmVhZGNydW1iczogQnJlYWRjcnVtYltdID0gW1xuICAgICAgeyB0aXRsZTogdGhpcy5nZXREb2N1bWVudFRpdGxlLmdldERvY3VtZW50VGl0bGUoc3RhdGUpLCBwb3M6IG51bGwgfSxcbiAgICBdO1xuXG4gICAgY29uc3QgcG9zTGluZSA9IHN0YXRlLmRvYy5saW5lQXQocG9zKTtcblxuICAgIGZvciAobGV0IGkgPSAxOyBpIDwgcG9zTGluZS5udW1iZXI7IGkrKykge1xuICAgICAgY29uc3QgbGluZSA9IHN0YXRlLmRvYy5saW5lKGkpO1xuICAgICAgY29uc3QgZiA9IGZvbGRhYmxlKHN0YXRlLCBsaW5lLmZyb20sIGxpbmUudG8pO1xuICAgICAgaWYgKGYgJiYgZi50byA+IHBvc0xpbmUuZnJvbSkge1xuICAgICAgICBicmVhZGNydW1icy5wdXNoKHsgdGl0bGU6IGNsZWFuVGl0bGUobGluZS50ZXh0KSwgcG9zOiBsaW5lLmZyb20gfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgYnJlYWRjcnVtYnMucHVzaCh7XG4gICAgICB0aXRsZTogY2xlYW5UaXRsZShwb3NMaW5lLnRleHQpLFxuICAgICAgcG9zOiBwb3NMaW5lLmZyb20sXG4gICAgfSk7XG5cbiAgICByZXR1cm4gYnJlYWRjcnVtYnM7XG4gIH1cbn1cbiIsImltcG9ydCB7IFRyYW5zYWN0aW9uIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjYWxjdWxhdGVWaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRpb24oXG4gIHRyOiBUcmFuc2FjdGlvbixcbiAgaGlkZGVuUmFuZ2VzOiBBcnJheTx7IGZyb206IG51bWJlcjsgdG86IG51bWJlciB9PlxuKSB7XG4gIGxldCB0b3VjaGVkQmVmb3JlID0gZmFsc2U7XG4gIGxldCB0b3VjaGVkQWZ0ZXIgPSBmYWxzZTtcbiAgbGV0IHRvdWNoZWRJbnNpZGUgPSBmYWxzZTtcblxuICBjb25zdCB0ID0gKGY6IG51bWJlciwgdDogbnVtYmVyKSA9PiBCb29sZWFuKHRyLmNoYW5nZXMudG91Y2hlc1JhbmdlKGYsIHQpKTtcblxuICBpZiAoaGlkZGVuUmFuZ2VzLmxlbmd0aCA9PT0gMikge1xuICAgIGNvbnN0IFthLCBiXSA9IGhpZGRlblJhbmdlcztcblxuICAgIHRvdWNoZWRCZWZvcmUgPSB0KGEuZnJvbSwgYS50byk7XG4gICAgdG91Y2hlZEluc2lkZSA9IHQoYS50byArIDEsIGIuZnJvbSAtIDEpO1xuICAgIHRvdWNoZWRBZnRlciA9IHQoYi5mcm9tLCBiLnRvKTtcbiAgfVxuXG4gIGlmIChoaWRkZW5SYW5nZXMubGVuZ3RoID09PSAxKSB7XG4gICAgY29uc3QgW2FdID0gaGlkZGVuUmFuZ2VzO1xuXG4gICAgaWYgKGEuZnJvbSA9PT0gMCkge1xuICAgICAgdG91Y2hlZEJlZm9yZSA9IHQoYS5mcm9tLCBhLnRvKTtcbiAgICAgIHRvdWNoZWRJbnNpZGUgPSB0KGEudG8gKyAxLCB0ci5uZXdEb2MubGVuZ3RoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdG91Y2hlZEluc2lkZSA9IHQoMCwgYS5mcm9tIC0gMSk7XG4gICAgICB0b3VjaGVkQWZ0ZXIgPSB0KGEuZnJvbSwgYS50byk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgdG91Y2hlZE91dHNpZGUgPSB0b3VjaGVkQmVmb3JlIHx8IHRvdWNoZWRBZnRlcjtcblxuICBjb25zdCByZXMgPSB7XG4gICAgdG91Y2hlZE91dHNpZGUsXG4gICAgdG91Y2hlZEJlZm9yZSxcbiAgICB0b3VjaGVkQWZ0ZXIsXG4gICAgdG91Y2hlZEluc2lkZSxcbiAgfTtcblxuICByZXR1cm4gcmVzO1xufVxuIiwiaW1wb3J0IHsgRWRpdG9yU3RhdGUsIFRyYW5zYWN0aW9uIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5cbmltcG9ydCB7IGNhbGN1bGF0ZVZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvbiB9IGZyb20gXCIuL3V0aWxzL2NhbGN1bGF0ZVZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvblwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZCB7XG4gIHJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZChzdGF0ZTogRWRpdG9yU3RhdGUpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMge1xuICBjYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzKFxuICAgIHN0YXRlOiBFZGl0b3JTdGF0ZVxuICApOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlciB9W10gfCBudWxsO1xufVxuXG5leHBvcnQgY2xhc3MgRGV0ZWN0UmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBjYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzOiBDYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzLFxuICAgIHByaXZhdGUgcmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkOiBSYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWRcbiAgKSB7fVxuXG4gIGdldEV4dGVuc2lvbigpIHtcbiAgICByZXR1cm4gRWRpdG9yU3RhdGUudHJhbnNhY3Rpb25FeHRlbmRlci5vZihcbiAgICAgIHRoaXMuZGV0ZWN0VmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgZGV0ZWN0VmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uID0gKHRyOiBUcmFuc2FjdGlvbik6IG51bGwgPT4ge1xuICAgIGNvbnN0IGhpZGRlblJhbmdlcyA9XG4gICAgICB0aGlzLmNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMuY2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyhcbiAgICAgICAgdHIuc3RhcnRTdGF0ZVxuICAgICAgKTtcblxuICAgIGNvbnN0IHsgdG91Y2hlZEJlZm9yZSwgdG91Y2hlZEluc2lkZSB9ID1cbiAgICAgIGNhbGN1bGF0ZVZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvbih0ciwgaGlkZGVuUmFuZ2VzKTtcblxuICAgIGlmICh0b3VjaGVkQmVmb3JlICYmICF0b3VjaGVkSW5zaWRlKSB7XG4gICAgICBzZXRJbW1lZGlhdGUoKCkgPT4ge1xuICAgICAgICB0aGlzLnJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZC5yYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQoXG4gICAgICAgICAgdHIuc3RhdGVcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgVmlld1BsdWdpbiwgUGx1Z2luRmllbGQsIEVkaXRvclZpZXcgfSBmcm9tICdAY29kZW1pcnJvci92aWV3JztcbmltcG9ydCB7IEZhY2V0IH0gZnJvbSAnQGNvZGVtaXJyb3Ivc3RhdGUnO1xuXG5jb25zdCBwYW5lbENvbmZpZyA9IC8qQF9fUFVSRV9fKi9GYWNldC5kZWZpbmUoe1xuICAgIGNvbWJpbmUoY29uZmlncykge1xuICAgICAgICBsZXQgdG9wQ29udGFpbmVyLCBib3R0b21Db250YWluZXI7XG4gICAgICAgIGZvciAobGV0IGMgb2YgY29uZmlncykge1xuICAgICAgICAgICAgdG9wQ29udGFpbmVyID0gdG9wQ29udGFpbmVyIHx8IGMudG9wQ29udGFpbmVyO1xuICAgICAgICAgICAgYm90dG9tQ29udGFpbmVyID0gYm90dG9tQ29udGFpbmVyIHx8IGMuYm90dG9tQ29udGFpbmVyO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHRvcENvbnRhaW5lciwgYm90dG9tQ29udGFpbmVyIH07XG4gICAgfVxufSk7XG4vKipcbkNvbmZpZ3VyZXMgdGhlIHBhbmVsLW1hbmFnaW5nIGV4dGVuc2lvbi5cbiovXG5mdW5jdGlvbiBwYW5lbHMoY29uZmlnKSB7XG4gICAgcmV0dXJuIGNvbmZpZyA/IFtwYW5lbENvbmZpZy5vZihjb25maWcpXSA6IFtdO1xufVxuLyoqXG5HZXQgdGhlIGFjdGl2ZSBwYW5lbCBjcmVhdGVkIGJ5IHRoZSBnaXZlbiBjb25zdHJ1Y3RvciwgaWYgYW55LlxuVGhpcyBjYW4gYmUgdXNlZnVsIHdoZW4geW91IG5lZWQgYWNjZXNzIHRvIHlvdXIgcGFuZWxzJyBET01cbnN0cnVjdHVyZS5cbiovXG5mdW5jdGlvbiBnZXRQYW5lbCh2aWV3LCBwYW5lbCkge1xuICAgIGxldCBwbHVnaW4gPSB2aWV3LnBsdWdpbihwYW5lbFBsdWdpbik7XG4gICAgbGV0IGluZGV4ID0gcGx1Z2luID8gcGx1Z2luLnNwZWNzLmluZGV4T2YocGFuZWwpIDogLTE7XG4gICAgcmV0dXJuIGluZGV4ID4gLTEgPyBwbHVnaW4ucGFuZWxzW2luZGV4XSA6IG51bGw7XG59XG5jb25zdCBwYW5lbFBsdWdpbiA9IC8qQF9fUFVSRV9fKi9WaWV3UGx1Z2luLmZyb21DbGFzcyhjbGFzcyB7XG4gICAgY29uc3RydWN0b3Iodmlldykge1xuICAgICAgICB0aGlzLmlucHV0ID0gdmlldy5zdGF0ZS5mYWNldChzaG93UGFuZWwpO1xuICAgICAgICB0aGlzLnNwZWNzID0gdGhpcy5pbnB1dC5maWx0ZXIocyA9PiBzKTtcbiAgICAgICAgdGhpcy5wYW5lbHMgPSB0aGlzLnNwZWNzLm1hcChzcGVjID0+IHNwZWModmlldykpO1xuICAgICAgICBsZXQgY29uZiA9IHZpZXcuc3RhdGUuZmFjZXQocGFuZWxDb25maWcpO1xuICAgICAgICB0aGlzLnRvcCA9IG5ldyBQYW5lbEdyb3VwKHZpZXcsIHRydWUsIGNvbmYudG9wQ29udGFpbmVyKTtcbiAgICAgICAgdGhpcy5ib3R0b20gPSBuZXcgUGFuZWxHcm91cCh2aWV3LCBmYWxzZSwgY29uZi5ib3R0b21Db250YWluZXIpO1xuICAgICAgICB0aGlzLnRvcC5zeW5jKHRoaXMucGFuZWxzLmZpbHRlcihwID0+IHAudG9wKSk7XG4gICAgICAgIHRoaXMuYm90dG9tLnN5bmModGhpcy5wYW5lbHMuZmlsdGVyKHAgPT4gIXAudG9wKSk7XG4gICAgICAgIGZvciAobGV0IHAgb2YgdGhpcy5wYW5lbHMpIHtcbiAgICAgICAgICAgIHAuZG9tLmNsYXNzTGlzdC5hZGQoXCJjbS1wYW5lbFwiKTtcbiAgICAgICAgICAgIGlmIChwLm1vdW50KVxuICAgICAgICAgICAgICAgIHAubW91bnQoKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB1cGRhdGUodXBkYXRlKSB7XG4gICAgICAgIGxldCBjb25mID0gdXBkYXRlLnN0YXRlLmZhY2V0KHBhbmVsQ29uZmlnKTtcbiAgICAgICAgaWYgKHRoaXMudG9wLmNvbnRhaW5lciAhPSBjb25mLnRvcENvbnRhaW5lcikge1xuICAgICAgICAgICAgdGhpcy50b3Auc3luYyhbXSk7XG4gICAgICAgICAgICB0aGlzLnRvcCA9IG5ldyBQYW5lbEdyb3VwKHVwZGF0ZS52aWV3LCB0cnVlLCBjb25mLnRvcENvbnRhaW5lcik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuYm90dG9tLmNvbnRhaW5lciAhPSBjb25mLmJvdHRvbUNvbnRhaW5lcikge1xuICAgICAgICAgICAgdGhpcy5ib3R0b20uc3luYyhbXSk7XG4gICAgICAgICAgICB0aGlzLmJvdHRvbSA9IG5ldyBQYW5lbEdyb3VwKHVwZGF0ZS52aWV3LCBmYWxzZSwgY29uZi5ib3R0b21Db250YWluZXIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG9wLnN5bmNDbGFzc2VzKCk7XG4gICAgICAgIHRoaXMuYm90dG9tLnN5bmNDbGFzc2VzKCk7XG4gICAgICAgIGxldCBpbnB1dCA9IHVwZGF0ZS5zdGF0ZS5mYWNldChzaG93UGFuZWwpO1xuICAgICAgICBpZiAoaW5wdXQgIT0gdGhpcy5pbnB1dCkge1xuICAgICAgICAgICAgbGV0IHNwZWNzID0gaW5wdXQuZmlsdGVyKHggPT4geCk7XG4gICAgICAgICAgICBsZXQgcGFuZWxzID0gW10sIHRvcCA9IFtdLCBib3R0b20gPSBbXSwgbW91bnQgPSBbXTtcbiAgICAgICAgICAgIGZvciAobGV0IHNwZWMgb2Ygc3BlY3MpIHtcbiAgICAgICAgICAgICAgICBsZXQga25vd24gPSB0aGlzLnNwZWNzLmluZGV4T2Yoc3BlYyksIHBhbmVsO1xuICAgICAgICAgICAgICAgIGlmIChrbm93biA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcGFuZWwgPSBzcGVjKHVwZGF0ZS52aWV3KTtcbiAgICAgICAgICAgICAgICAgICAgbW91bnQucHVzaChwYW5lbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwYW5lbCA9IHRoaXMucGFuZWxzW2tub3duXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBhbmVsLnVwZGF0ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhbmVsLnVwZGF0ZSh1cGRhdGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBwYW5lbHMucHVzaChwYW5lbCk7XG4gICAgICAgICAgICAgICAgKHBhbmVsLnRvcCA/IHRvcCA6IGJvdHRvbSkucHVzaChwYW5lbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNwZWNzID0gc3BlY3M7XG4gICAgICAgICAgICB0aGlzLnBhbmVscyA9IHBhbmVscztcbiAgICAgICAgICAgIHRoaXMudG9wLnN5bmModG9wKTtcbiAgICAgICAgICAgIHRoaXMuYm90dG9tLnN5bmMoYm90dG9tKTtcbiAgICAgICAgICAgIGZvciAobGV0IHAgb2YgbW91bnQpIHtcbiAgICAgICAgICAgICAgICBwLmRvbS5jbGFzc0xpc3QuYWRkKFwiY20tcGFuZWxcIik7XG4gICAgICAgICAgICAgICAgaWYgKHAubW91bnQpXG4gICAgICAgICAgICAgICAgICAgIHAubW91bnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGZvciAobGV0IHAgb2YgdGhpcy5wYW5lbHMpXG4gICAgICAgICAgICAgICAgaWYgKHAudXBkYXRlKVxuICAgICAgICAgICAgICAgICAgICBwLnVwZGF0ZSh1cGRhdGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGRlc3Ryb3koKSB7XG4gICAgICAgIHRoaXMudG9wLnN5bmMoW10pO1xuICAgICAgICB0aGlzLmJvdHRvbS5zeW5jKFtdKTtcbiAgICB9XG59LCB7XG4gICAgcHJvdmlkZTogLypAX19QVVJFX18qL1BsdWdpbkZpZWxkLnNjcm9sbE1hcmdpbnMuZnJvbSh2YWx1ZSA9PiAoeyB0b3A6IHZhbHVlLnRvcC5zY3JvbGxNYXJnaW4oKSwgYm90dG9tOiB2YWx1ZS5ib3R0b20uc2Nyb2xsTWFyZ2luKCkgfSkpXG59KTtcbmNsYXNzIFBhbmVsR3JvdXAge1xuICAgIGNvbnN0cnVjdG9yKHZpZXcsIHRvcCwgY29udGFpbmVyKSB7XG4gICAgICAgIHRoaXMudmlldyA9IHZpZXc7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcbiAgICAgICAgdGhpcy5kb20gPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuY2xhc3NlcyA9IFwiXCI7XG4gICAgICAgIHRoaXMucGFuZWxzID0gW107XG4gICAgICAgIHRoaXMuc3luY0NsYXNzZXMoKTtcbiAgICB9XG4gICAgc3luYyhwYW5lbHMpIHtcbiAgICAgICAgZm9yIChsZXQgcCBvZiB0aGlzLnBhbmVscylcbiAgICAgICAgICAgIGlmIChwLmRlc3Ryb3kgJiYgcGFuZWxzLmluZGV4T2YocCkgPCAwKVxuICAgICAgICAgICAgICAgIHAuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLnBhbmVscyA9IHBhbmVscztcbiAgICAgICAgdGhpcy5zeW5jRE9NKCk7XG4gICAgfVxuICAgIHN5bmNET00oKSB7XG4gICAgICAgIGlmICh0aGlzLnBhbmVscy5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuZG9tKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kb20ucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5kb20gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLmRvbSkge1xuICAgICAgICAgICAgdGhpcy5kb20gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdGhpcy5kb20uY2xhc3NOYW1lID0gdGhpcy50b3AgPyBcImNtLXBhbmVscyBjbS1wYW5lbHMtdG9wXCIgOiBcImNtLXBhbmVscyBjbS1wYW5lbHMtYm90dG9tXCI7XG4gICAgICAgICAgICB0aGlzLmRvbS5zdHlsZVt0aGlzLnRvcCA/IFwidG9wXCIgOiBcImJvdHRvbVwiXSA9IFwiMFwiO1xuICAgICAgICAgICAgbGV0IHBhcmVudCA9IHRoaXMuY29udGFpbmVyIHx8IHRoaXMudmlldy5kb207XG4gICAgICAgICAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKHRoaXMuZG9tLCB0aGlzLnRvcCA/IHBhcmVudC5maXJzdENoaWxkIDogbnVsbCk7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGN1ckRPTSA9IHRoaXMuZG9tLmZpcnN0Q2hpbGQ7XG4gICAgICAgIGZvciAobGV0IHBhbmVsIG9mIHRoaXMucGFuZWxzKSB7XG4gICAgICAgICAgICBpZiAocGFuZWwuZG9tLnBhcmVudE5vZGUgPT0gdGhpcy5kb20pIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoY3VyRE9NICE9IHBhbmVsLmRvbSlcbiAgICAgICAgICAgICAgICAgICAgY3VyRE9NID0gcm0oY3VyRE9NKTtcbiAgICAgICAgICAgICAgICBjdXJET00gPSBjdXJET00ubmV4dFNpYmxpbmc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5pbnNlcnRCZWZvcmUocGFuZWwuZG9tLCBjdXJET00pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHdoaWxlIChjdXJET00pXG4gICAgICAgICAgICBjdXJET00gPSBybShjdXJET00pO1xuICAgIH1cbiAgICBzY3JvbGxNYXJnaW4oKSB7XG4gICAgICAgIHJldHVybiAhdGhpcy5kb20gfHwgdGhpcy5jb250YWluZXIgPyAwXG4gICAgICAgICAgICA6IE1hdGgubWF4KDAsIHRoaXMudG9wID9cbiAgICAgICAgICAgICAgICB0aGlzLmRvbS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5ib3R0b20gLSBNYXRoLm1heCgwLCB0aGlzLnZpZXcuc2Nyb2xsRE9NLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcCkgOlxuICAgICAgICAgICAgICAgIE1hdGgubWluKGlubmVySGVpZ2h0LCB0aGlzLnZpZXcuc2Nyb2xsRE9NLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmJvdHRvbSkgLSB0aGlzLmRvbS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS50b3ApO1xuICAgIH1cbiAgICBzeW5jQ2xhc3NlcygpIHtcbiAgICAgICAgaWYgKCF0aGlzLmNvbnRhaW5lciB8fCB0aGlzLmNsYXNzZXMgPT0gdGhpcy52aWV3LnRoZW1lQ2xhc3NlcylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgZm9yIChsZXQgY2xzIG9mIHRoaXMuY2xhc3Nlcy5zcGxpdChcIiBcIikpXG4gICAgICAgICAgICBpZiAoY2xzKVxuICAgICAgICAgICAgICAgIHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoY2xzKTtcbiAgICAgICAgZm9yIChsZXQgY2xzIG9mICh0aGlzLmNsYXNzZXMgPSB0aGlzLnZpZXcudGhlbWVDbGFzc2VzKS5zcGxpdChcIiBcIikpXG4gICAgICAgICAgICBpZiAoY2xzKVxuICAgICAgICAgICAgICAgIHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoY2xzKTtcbiAgICB9XG59XG5mdW5jdGlvbiBybShub2RlKSB7XG4gICAgbGV0IG5leHQgPSBub2RlLm5leHRTaWJsaW5nO1xuICAgIG5vZGUucmVtb3ZlKCk7XG4gICAgcmV0dXJuIG5leHQ7XG59XG5jb25zdCBiYXNlVGhlbWUgPSAvKkBfX1BVUkVfXyovRWRpdG9yVmlldy5iYXNlVGhlbWUoe1xuICAgIFwiLmNtLXBhbmVsc1wiOiB7XG4gICAgICAgIGJveFNpemluZzogXCJib3JkZXItYm94XCIsXG4gICAgICAgIHBvc2l0aW9uOiBcInN0aWNreVwiLFxuICAgICAgICBsZWZ0OiAwLFxuICAgICAgICByaWdodDogMFxuICAgIH0sXG4gICAgXCImbGlnaHQgLmNtLXBhbmVsc1wiOiB7XG4gICAgICAgIGJhY2tncm91bmRDb2xvcjogXCIjZjVmNWY1XCIsXG4gICAgICAgIGNvbG9yOiBcImJsYWNrXCJcbiAgICB9LFxuICAgIFwiJmxpZ2h0IC5jbS1wYW5lbHMtdG9wXCI6IHtcbiAgICAgICAgYm9yZGVyQm90dG9tOiBcIjFweCBzb2xpZCAjZGRkXCJcbiAgICB9LFxuICAgIFwiJmxpZ2h0IC5jbS1wYW5lbHMtYm90dG9tXCI6IHtcbiAgICAgICAgYm9yZGVyVG9wOiBcIjFweCBzb2xpZCAjZGRkXCJcbiAgICB9LFxuICAgIFwiJmRhcmsgLmNtLXBhbmVsc1wiOiB7XG4gICAgICAgIGJhY2tncm91bmRDb2xvcjogXCIjMzMzMzM4XCIsXG4gICAgICAgIGNvbG9yOiBcIndoaXRlXCJcbiAgICB9XG59KTtcbi8qKlxuT3BlbmluZyBhIHBhbmVsIGlzIGRvbmUgYnkgcHJvdmlkaW5nIGEgY29uc3RydWN0b3IgZnVuY3Rpb24gZm9yXG50aGUgcGFuZWwgdGhyb3VnaCB0aGlzIGZhY2V0LiAoVGhlIHBhbmVsIGlzIGNsb3NlZCBhZ2FpbiB3aGVuIGl0c1xuY29uc3RydWN0b3IgaXMgbm8gbG9uZ2VyIHByb3ZpZGVkLikgVmFsdWVzIG9mIGBudWxsYCBhcmUgaWdub3JlZC5cbiovXG5jb25zdCBzaG93UGFuZWwgPSAvKkBfX1BVUkVfXyovRmFjZXQuZGVmaW5lKHtcbiAgICBlbmFibGVzOiBbcGFuZWxQbHVnaW4sIGJhc2VUaGVtZV1cbn0pO1xuXG5leHBvcnQgeyBnZXRQYW5lbCwgcGFuZWxzLCBzaG93UGFuZWwgfTtcbiIsImV4cG9ydCBmdW5jdGlvbiByZW5kZXJIZWFkZXIoXG4gIGRvYzogRG9jdW1lbnQsXG4gIGN0eDoge1xuICAgIGJyZWFkY3J1bWJzOiBBcnJheTx7IHRpdGxlOiBzdHJpbmc7IHBvczogbnVtYmVyIHwgbnVsbCB9PjtcbiAgICBvbkNsaWNrOiAocG9zOiBudW1iZXIgfCBudWxsKSA9PiB2b2lkO1xuICB9XG4pIHtcbiAgY29uc3QgeyBicmVhZGNydW1icywgb25DbGljayB9ID0gY3R4O1xuXG4gIGNvbnN0IGggPSBkb2MuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaC5jbGFzc0xpc3QuYWRkKFwiem9vbS1wbHVnaW4taGVhZGVyXCIpO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYnJlYWRjcnVtYnMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaSA+IDApIHtcbiAgICAgIGNvbnN0IGQgPSBkb2MuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgICBkLmNsYXNzTGlzdC5hZGQoXCJ6b29tLXBsdWdpbi1kZWxpbWl0ZXJcIik7XG4gICAgICBkLmlubmVyVGV4dCA9IFwiPlwiO1xuICAgICAgaC5hcHBlbmQoZCk7XG4gICAgfVxuXG4gICAgY29uc3QgYnJlYWRjcnVtYiA9IGJyZWFkY3J1bWJzW2ldO1xuICAgIGNvbnN0IGIgPSBkb2MuY3JlYXRlRWxlbWVudChcImFcIik7XG4gICAgYi5jbGFzc0xpc3QuYWRkKFwiem9vbS1wbHVnaW4tdGl0bGVcIik7XG4gICAgYi5kYXRhc2V0LnBvcyA9IFN0cmluZyhicmVhZGNydW1iLnBvcyk7XG4gICAgYi5hcHBlbmRDaGlsZChkb2MuY3JlYXRlVGV4dE5vZGUoYnJlYWRjcnVtYi50aXRsZSkpO1xuICAgIGIuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCB0ID0gZS50YXJnZXQgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG4gICAgICBjb25zdCBwb3MgPSB0LmRhdGFzZXQucG9zO1xuICAgICAgb25DbGljayhwb3MgPT09IFwibnVsbFwiID8gbnVsbCA6IE51bWJlcihwb3MpKTtcbiAgICB9KTtcbiAgICBoLmFwcGVuZENoaWxkKGIpO1xuICB9XG5cbiAgcmV0dXJuIGg7XG59XG4iLCJpbXBvcnQgeyBzaG93UGFuZWwgfSBmcm9tIFwiQGNvZGVtaXJyb3IvcGFuZWxcIjtcbmltcG9ydCB7IFN0YXRlRWZmZWN0LCBTdGF0ZUZpZWxkIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuaW1wb3J0IHsgcmVuZGVySGVhZGVyIH0gZnJvbSBcIi4vdXRpbHMvcmVuZGVySGVhZGVyXCI7XG5cbmltcG9ydCB7IExvZ2dlclNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvTG9nZ2VyU2VydmljZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJyZWFkY3J1bWIge1xuICB0aXRsZTogc3RyaW5nO1xuICBwb3M6IG51bWJlciB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgWm9vbUluIHtcbiAgem9vbUluKHZpZXc6IEVkaXRvclZpZXcsIHBvczogbnVtYmVyKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBab29tT3V0IHtcbiAgem9vbU91dCh2aWV3OiBFZGl0b3JWaWV3KTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIEhlYWRlclN0YXRlIHtcbiAgYnJlYWRjcnVtYnM6IEJyZWFkY3J1bWJbXTtcbiAgb25DbGljazogKHZpZXc6IEVkaXRvclZpZXcsIHBvczogbnVtYmVyIHwgbnVsbCkgPT4gdm9pZDtcbn1cblxuY29uc3Qgc2hvd0hlYWRlckVmZmVjdCA9IFN0YXRlRWZmZWN0LmRlZmluZTxIZWFkZXJTdGF0ZT4oKTtcbmNvbnN0IGhpZGVIZWFkZXJFZmZlY3QgPSBTdGF0ZUVmZmVjdC5kZWZpbmU8dm9pZD4oKTtcblxuY29uc3QgaGVhZGVyU3RhdGUgPSBTdGF0ZUZpZWxkLmRlZmluZTxIZWFkZXJTdGF0ZSB8IG51bGw+KHtcbiAgY3JlYXRlOiAoKSA9PiBudWxsLFxuICB1cGRhdGU6ICh2YWx1ZSwgdHIpID0+IHtcbiAgICBmb3IgKGNvbnN0IGUgb2YgdHIuZWZmZWN0cykge1xuICAgICAgaWYgKGUuaXMoc2hvd0hlYWRlckVmZmVjdCkpIHtcbiAgICAgICAgdmFsdWUgPSBlLnZhbHVlO1xuICAgICAgfVxuICAgICAgaWYgKGUuaXMoaGlkZUhlYWRlckVmZmVjdCkpIHtcbiAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG4gIH0sXG4gIHByb3ZpZGU6IChmKSA9PlxuICAgIHNob3dQYW5lbC5mcm9tKGYsIChzdGF0ZSkgPT4ge1xuICAgICAgaWYgKCFzdGF0ZSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuICh2aWV3KSA9PiAoe1xuICAgICAgICB0b3A6IHRydWUsXG4gICAgICAgIGRvbTogcmVuZGVySGVhZGVyKHZpZXcuZG9tLm93bmVyRG9jdW1lbnQsIHtcbiAgICAgICAgICBicmVhZGNydW1iczogc3RhdGUuYnJlYWRjcnVtYnMsXG4gICAgICAgICAgb25DbGljazogKHBvcykgPT4gc3RhdGUub25DbGljayh2aWV3LCBwb3MpLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBSZW5kZXJOYXZpZ2F0aW9uSGVhZGVyIHtcbiAgZ2V0RXh0ZW5zaW9uKCkge1xuICAgIHJldHVybiBoZWFkZXJTdGF0ZTtcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgbG9nZ2VyOiBMb2dnZXJTZXJ2aWNlLFxuICAgIHByaXZhdGUgem9vbUluOiBab29tSW4sXG4gICAgcHJpdmF0ZSB6b29tT3V0OiBab29tT3V0XG4gICkge31cblxuICBwdWJsaWMgc2hvd0hlYWRlcih2aWV3OiBFZGl0b3JWaWV3LCBicmVhZGNydW1iczogQnJlYWRjcnVtYltdKSB7XG4gICAgY29uc3QgbCA9IHRoaXMubG9nZ2VyLmJpbmQoXCJUb2dnbGVOYXZpZ2F0aW9uSGVhZGVyTG9naWM6c2hvd0hlYWRlclwiKTtcbiAgICBsKFwic2hvdyBoZWFkZXJcIik7XG5cbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgIGVmZmVjdHM6IFtcbiAgICAgICAgc2hvd0hlYWRlckVmZmVjdC5vZih7XG4gICAgICAgICAgYnJlYWRjcnVtYnMsXG4gICAgICAgICAgb25DbGljazogdGhpcy5vbkNsaWNrLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgaGlkZUhlYWRlcih2aWV3OiBFZGl0b3JWaWV3KSB7XG4gICAgY29uc3QgbCA9IHRoaXMubG9nZ2VyLmJpbmQoXCJUb2dnbGVOYXZpZ2F0aW9uSGVhZGVyTG9naWM6aGlkZUhlYWRlclwiKTtcbiAgICBsKFwiaGlkZSBoZWFkZXJcIik7XG5cbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgIGVmZmVjdHM6IFtoaWRlSGVhZGVyRWZmZWN0Lm9mKCldLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBvbkNsaWNrID0gKHZpZXc6IEVkaXRvclZpZXcsIHBvczogbnVtYmVyIHwgbnVsbCkgPT4ge1xuICAgIGlmIChwb3MgPT09IG51bGwpIHtcbiAgICAgIHRoaXMuem9vbU91dC56b29tT3V0KHZpZXcpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnpvb21Jbi56b29tSW4odmlldywgcG9zKTtcbiAgICB9XG4gIH07XG59XG4iLCJpbXBvcnQgeyBQbHVnaW5fMiB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsgRWRpdG9yVmlldyB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5pbXBvcnQgeyBnZXREb2N1bWVudFRpdGxlIH0gZnJvbSBcIi4vdXRpbHMvZ2V0RG9jdW1lbnRUaXRsZVwiO1xuaW1wb3J0IHsgZ2V0RWRpdG9yVmlld0Zyb21FZGl0b3JTdGF0ZSB9IGZyb20gXCIuL3V0aWxzL2dldEVkaXRvclZpZXdGcm9tRWRpdG9yU3RhdGVcIjtcblxuaW1wb3J0IHsgQ29sbGVjdEJyZWFkY3J1bWJzIH0gZnJvbSBcIi4uL2xvZ2ljL0NvbGxlY3RCcmVhZGNydW1ic1wiO1xuaW1wb3J0IHsgRGV0ZWN0UmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkIH0gZnJvbSBcIi4uL2xvZ2ljL0RldGVjdFJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZFwiO1xuaW1wb3J0IHsgUmVuZGVyTmF2aWdhdGlvbkhlYWRlciB9IGZyb20gXCIuLi9sb2dpYy9SZW5kZXJOYXZpZ2F0aW9uSGVhZGVyXCI7XG5pbXBvcnQgeyBMb2dnZXJTZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL0xvZ2dlclNlcnZpY2VcIjtcblxuZXhwb3J0IGludGVyZmFjZSBab29tSW4ge1xuICB6b29tSW4odmlldzogRWRpdG9yVmlldywgcG9zOiBudW1iZXIpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFpvb21PdXQge1xuICB6b29tT3V0KHZpZXc6IEVkaXRvclZpZXcpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGlmeUFmdGVyWm9vbUluIHtcbiAgbm90aWZ5QWZ0ZXJab29tSW4oY2I6ICh2aWV3OiBFZGl0b3JWaWV3LCBwb3M6IG51bWJlcikgPT4gdm9pZCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90aWZ5QWZ0ZXJab29tT3V0IHtcbiAgbm90aWZ5QWZ0ZXJab29tT3V0KGNiOiAodmlldzogRWRpdG9yVmlldykgPT4gdm9pZCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyB7XG4gIGNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMoXG4gICAgc3RhdGU6IEVkaXRvclN0YXRlXG4gICk6IHsgZnJvbTogbnVtYmVyOyB0bzogbnVtYmVyIH1bXSB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZSB7XG4gIGNhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2UoXG4gICAgc3RhdGU6IEVkaXRvclN0YXRlXG4gICk6IHsgZnJvbTogbnVtYmVyOyB0bzogbnVtYmVyIH0gfCBudWxsO1xufVxuXG5jbGFzcyBTaG93SGVhZGVyQWZ0ZXJab29tSW4gaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBub3RpZnlBZnRlclpvb21JbjogTm90aWZ5QWZ0ZXJab29tSW4sXG4gICAgcHJpdmF0ZSBjb2xsZWN0QnJlYWRjcnVtYnM6IENvbGxlY3RCcmVhZGNydW1icyxcbiAgICBwcml2YXRlIHJlbmRlck5hdmlnYXRpb25IZWFkZXI6IFJlbmRlck5hdmlnYXRpb25IZWFkZXJcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5ub3RpZnlBZnRlclpvb21Jbi5ub3RpZnlBZnRlclpvb21JbigodmlldywgcG9zKSA9PiB7XG4gICAgICBjb25zdCBicmVhZGNydW1icyA9IHRoaXMuY29sbGVjdEJyZWFkY3J1bWJzLmNvbGxlY3RCcmVhZGNydW1icyhcbiAgICAgICAgdmlldy5zdGF0ZSxcbiAgICAgICAgcG9zXG4gICAgICApO1xuICAgICAgdGhpcy5yZW5kZXJOYXZpZ2F0aW9uSGVhZGVyLnNob3dIZWFkZXIodmlldywgYnJlYWRjcnVtYnMpO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge31cbn1cblxuY2xhc3MgSGlkZUhlYWRlckFmdGVyWm9vbU91dCBpbXBsZW1lbnRzIEZlYXR1cmUge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIG5vdGlmeUFmdGVyWm9vbU91dDogTm90aWZ5QWZ0ZXJab29tT3V0LFxuICAgIHByaXZhdGUgcmVuZGVyTmF2aWdhdGlvbkhlYWRlcjogUmVuZGVyTmF2aWdhdGlvbkhlYWRlclxuICApIHt9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICB0aGlzLm5vdGlmeUFmdGVyWm9vbU91dC5ub3RpZnlBZnRlclpvb21PdXQoKHZpZXcpID0+IHtcbiAgICAgIHRoaXMucmVuZGVyTmF2aWdhdGlvbkhlYWRlci5oaWRlSGVhZGVyKHZpZXcpO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge31cbn1cblxuY2xhc3MgVXBkYXRlSGVhZGVyQWZ0ZXJSYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgcHJpdmF0ZSBkZXRlY3RSYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQgPVxuICAgIG5ldyBEZXRlY3RSYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQoXG4gICAgICB0aGlzLmNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMsXG4gICAgICB7XG4gICAgICAgIHJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZDogKHN0YXRlKSA9PlxuICAgICAgICAgIHRoaXMucmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkKHN0YXRlKSxcbiAgICAgIH1cbiAgICApO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW5fMixcbiAgICBwcml2YXRlIGNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXM6IENhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMsXG4gICAgcHJpdmF0ZSBjYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlOiBDYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlLFxuICAgIHByaXZhdGUgY29sbGVjdEJyZWFkY3J1bWJzOiBDb2xsZWN0QnJlYWRjcnVtYnMsXG4gICAgcHJpdmF0ZSByZW5kZXJOYXZpZ2F0aW9uSGVhZGVyOiBSZW5kZXJOYXZpZ2F0aW9uSGVhZGVyXG4gICkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFxuICAgICAgdGhpcy5kZXRlY3RSYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQuZ2V0RXh0ZW5zaW9uKClcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge31cblxuICBwcml2YXRlIHJhbmdlQmVmb3JlVmlzaWJsZVJhbmdlQ2hhbmdlZChzdGF0ZTogRWRpdG9yU3RhdGUpIHtcbiAgICBjb25zdCB2aWV3ID0gZ2V0RWRpdG9yVmlld0Zyb21FZGl0b3JTdGF0ZShzdGF0ZSk7XG5cbiAgICBjb25zdCBwb3MgPVxuICAgICAgdGhpcy5jYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlLmNhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2UoXG4gICAgICAgIHN0YXRlXG4gICAgICApLmZyb207XG5cbiAgICBjb25zdCBicmVhZGNydW1icyA9IHRoaXMuY29sbGVjdEJyZWFkY3J1bWJzLmNvbGxlY3RCcmVhZGNydW1icyhzdGF0ZSwgcG9zKTtcblxuICAgIHRoaXMucmVuZGVyTmF2aWdhdGlvbkhlYWRlci5zaG93SGVhZGVyKHZpZXcsIGJyZWFkY3J1bWJzKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgSGVhZGVyTmF2aWdhdGlvbkZlYXR1cmUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgcHJpdmF0ZSBjb2xsZWN0QnJlYWRjcnVtYnMgPSBuZXcgQ29sbGVjdEJyZWFkY3J1bWJzKHtcbiAgICBnZXREb2N1bWVudFRpdGxlOiBnZXREb2N1bWVudFRpdGxlLFxuICB9KTtcblxuICBwcml2YXRlIHJlbmRlck5hdmlnYXRpb25IZWFkZXIgPSBuZXcgUmVuZGVyTmF2aWdhdGlvbkhlYWRlcihcbiAgICB0aGlzLmxvZ2dlcixcbiAgICB0aGlzLnpvb21JbixcbiAgICB0aGlzLnpvb21PdXRcbiAgKTtcblxuICBwcml2YXRlIHNob3dIZWFkZXJBZnRlclpvb21JbiA9IG5ldyBTaG93SGVhZGVyQWZ0ZXJab29tSW4oXG4gICAgdGhpcy5ub3RpZnlBZnRlclpvb21JbixcbiAgICB0aGlzLmNvbGxlY3RCcmVhZGNydW1icyxcbiAgICB0aGlzLnJlbmRlck5hdmlnYXRpb25IZWFkZXJcbiAgKTtcblxuICBwcml2YXRlIGhpZGVIZWFkZXJBZnRlclpvb21PdXQgPSBuZXcgSGlkZUhlYWRlckFmdGVyWm9vbU91dChcbiAgICB0aGlzLm5vdGlmeUFmdGVyWm9vbU91dCxcbiAgICB0aGlzLnJlbmRlck5hdmlnYXRpb25IZWFkZXJcbiAgKTtcblxuICBwcml2YXRlIHVwZGF0ZUhlYWRlckFmdGVyUmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkID1cbiAgICBuZXcgVXBkYXRlSGVhZGVyQWZ0ZXJSYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQoXG4gICAgICB0aGlzLnBsdWdpbixcbiAgICAgIHRoaXMuY2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyxcbiAgICAgIHRoaXMuY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZSxcbiAgICAgIHRoaXMuY29sbGVjdEJyZWFkY3J1bWJzLFxuICAgICAgdGhpcy5yZW5kZXJOYXZpZ2F0aW9uSGVhZGVyXG4gICAgKTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHBsdWdpbjogUGx1Z2luXzIsXG4gICAgcHJpdmF0ZSBsb2dnZXI6IExvZ2dlclNlcnZpY2UsXG4gICAgcHJpdmF0ZSBjYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzOiBDYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzLFxuICAgIHByaXZhdGUgY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZTogQ2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZSxcbiAgICBwcml2YXRlIHpvb21JbjogWm9vbUluLFxuICAgIHByaXZhdGUgem9vbU91dDogWm9vbU91dCxcbiAgICBwcml2YXRlIG5vdGlmeUFmdGVyWm9vbUluOiBOb3RpZnlBZnRlclpvb21JbixcbiAgICBwcml2YXRlIG5vdGlmeUFmdGVyWm9vbU91dDogTm90aWZ5QWZ0ZXJab29tT3V0XG4gICkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFxuICAgICAgdGhpcy5yZW5kZXJOYXZpZ2F0aW9uSGVhZGVyLmdldEV4dGVuc2lvbigpXG4gICAgKTtcblxuICAgIHRoaXMuc2hvd0hlYWRlckFmdGVyWm9vbUluLmxvYWQoKTtcbiAgICB0aGlzLmhpZGVIZWFkZXJBZnRlclpvb21PdXQubG9hZCgpO1xuICAgIHRoaXMudXBkYXRlSGVhZGVyQWZ0ZXJSYW5nZUJlZm9yZVZpc2libGVSYW5nZUNoYW5nZWQubG9hZCgpO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge1xuICAgIHRoaXMuc2hvd0hlYWRlckFmdGVyWm9vbUluLnVubG9hZCgpO1xuICAgIHRoaXMuaGlkZUhlYWRlckFmdGVyWm9vbU91dC51bmxvYWQoKTtcbiAgICB0aGlzLnVwZGF0ZUhlYWRlckFmdGVyUmFuZ2VCZWZvcmVWaXNpYmxlUmFuZ2VDaGFuZ2VkLnVubG9hZCgpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBFZGl0b3JTZWxlY3Rpb24gfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNhbGN1bGF0ZUxpbWl0ZWRTZWxlY3Rpb24oXG4gIHNlbGVjdGlvbjogRWRpdG9yU2VsZWN0aW9uLFxuICBmcm9tOiBudW1iZXIsXG4gIHRvOiBudW1iZXJcbikge1xuICBjb25zdCBtYWluU2VsZWN0aW9uID0gc2VsZWN0aW9uLm1haW47XG5cbiAgY29uc3QgbmV3U2VsZWN0aW9uID0gRWRpdG9yU2VsZWN0aW9uLnJhbmdlKFxuICAgIE1hdGgubWluKE1hdGgubWF4KG1haW5TZWxlY3Rpb24uYW5jaG9yLCBmcm9tKSwgdG8pLFxuICAgIE1hdGgubWluKE1hdGgubWF4KG1haW5TZWxlY3Rpb24uaGVhZCwgZnJvbSksIHRvKSxcbiAgICBtYWluU2VsZWN0aW9uLmdvYWxDb2x1bW5cbiAgKTtcblxuICBjb25zdCBzaG91bGRVcGRhdGUgPVxuICAgIHNlbGVjdGlvbi5yYW5nZXMubGVuZ3RoID4gMSB8fFxuICAgIG5ld1NlbGVjdGlvbi5hbmNob3IgIT09IG1haW5TZWxlY3Rpb24uYW5jaG9yIHx8XG4gICAgbmV3U2VsZWN0aW9uLmhlYWQgIT09IG1haW5TZWxlY3Rpb24uaGVhZDtcblxuICByZXR1cm4gc2hvdWxkVXBkYXRlID8gbmV3U2VsZWN0aW9uIDogbnVsbDtcbn1cbiIsImltcG9ydCB7IFN0YXRlRWZmZWN0IH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgWm9vbUluUmFuZ2Uge1xuICBmcm9tOiBudW1iZXI7XG4gIHRvOiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIFpvb21JblN0YXRlRWZmZWN0ID0gU3RhdGVFZmZlY3Q8Wm9vbUluUmFuZ2U+O1xuXG5leHBvcnQgY29uc3Qgem9vbUluRWZmZWN0ID0gU3RhdGVFZmZlY3QuZGVmaW5lPFpvb21JblJhbmdlPigpO1xuXG5leHBvcnQgY29uc3Qgem9vbU91dEVmZmVjdCA9IFN0YXRlRWZmZWN0LmRlZmluZTx2b2lkPigpO1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuZXhwb3J0IGZ1bmN0aW9uIGlzWm9vbUluRWZmZWN0KGU6IFN0YXRlRWZmZWN0PGFueT4pOiBlIGlzIFpvb21JblN0YXRlRWZmZWN0IHtcbiAgcmV0dXJuIGUuaXMoem9vbUluRWZmZWN0KTtcbn1cbiIsImltcG9ydCB7IEVkaXRvclN0YXRlLCBUcmFuc2FjdGlvbiB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuXG5pbXBvcnQgeyBMb2dnZXJTZXJ2aWNlIH0gZnJvbSBcInNyYy9zZXJ2aWNlcy9Mb2dnZXJTZXJ2aWNlXCI7XG5cbmltcG9ydCB7IGNhbGN1bGF0ZUxpbWl0ZWRTZWxlY3Rpb24gfSBmcm9tIFwiLi91dGlscy9jYWxjdWxhdGVMaW1pdGVkU2VsZWN0aW9uXCI7XG5pbXBvcnQgeyBab29tSW5TdGF0ZUVmZmVjdCwgaXNab29tSW5FZmZlY3QgfSBmcm9tIFwiLi91dGlscy9lZmZlY3RzXCI7XG5cbmV4cG9ydCBjbGFzcyBMaW1pdFNlbGVjdGlvbk9uWm9vbWluZ0luIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBsb2dnZXI6IExvZ2dlclNlcnZpY2UpIHt9XG5cbiAgZ2V0RXh0ZW5zaW9uKCkge1xuICAgIHJldHVybiBFZGl0b3JTdGF0ZS50cmFuc2FjdGlvbkZpbHRlci5vZih0aGlzLmxpbWl0U2VsZWN0aW9uT25ab29taW5nSW4pO1xuICB9XG5cbiAgcHJpdmF0ZSBsaW1pdFNlbGVjdGlvbk9uWm9vbWluZ0luID0gKHRyOiBUcmFuc2FjdGlvbikgPT4ge1xuICAgIGNvbnN0IGUgPSB0ci5lZmZlY3RzLmZpbmQ8Wm9vbUluU3RhdGVFZmZlY3Q+KGlzWm9vbUluRWZmZWN0KTtcblxuICAgIGlmICghZSkge1xuICAgICAgcmV0dXJuIHRyO1xuICAgIH1cblxuICAgIGNvbnN0IG5ld1NlbGVjdGlvbiA9IGNhbGN1bGF0ZUxpbWl0ZWRTZWxlY3Rpb24oXG4gICAgICB0ci5uZXdTZWxlY3Rpb24sXG4gICAgICBlLnZhbHVlLmZyb20sXG4gICAgICBlLnZhbHVlLnRvXG4gICAgKTtcblxuICAgIGlmICghbmV3U2VsZWN0aW9uKSB7XG4gICAgICByZXR1cm4gdHI7XG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIubG9nKFxuICAgICAgXCJMaW1pdFNlbGVjdGlvbk9uWm9vbWluZ0luOmxpbWl0U2VsZWN0aW9uT25ab29taW5nSW5cIixcbiAgICAgIFwibGltaXRpbmcgc2VsZWN0aW9uXCIsXG4gICAgICBuZXdTZWxlY3Rpb24udG9KU09OKClcbiAgICApO1xuXG4gICAgcmV0dXJuIFt0ciwgeyBzZWxlY3Rpb246IG5ld1NlbGVjdGlvbiB9XTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IEVkaXRvclN0YXRlLCBUcmFuc2FjdGlvbiB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuXG5pbXBvcnQgeyBMb2dnZXJTZXJ2aWNlIH0gZnJvbSBcInNyYy9zZXJ2aWNlcy9Mb2dnZXJTZXJ2aWNlXCI7XG5cbmltcG9ydCB7IGNhbGN1bGF0ZUxpbWl0ZWRTZWxlY3Rpb24gfSBmcm9tIFwiLi91dGlscy9jYWxjdWxhdGVMaW1pdGVkU2VsZWN0aW9uXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZSB7XG4gIGNhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2UoXG4gICAgc3RhdGU6IEVkaXRvclN0YXRlXG4gICk6IHsgZnJvbTogbnVtYmVyOyB0bzogbnVtYmVyIH0gfCBudWxsO1xufVxuXG5leHBvcnQgY2xhc3MgTGltaXRTZWxlY3Rpb25XaGVuWm9vbWVkSW4ge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGxvZ2dlcjogTG9nZ2VyU2VydmljZSxcbiAgICBwcml2YXRlIGNhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2U6IENhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2VcbiAgKSB7fVxuXG4gIHB1YmxpYyBnZXRFeHRlbnNpb24oKSB7XG4gICAgcmV0dXJuIEVkaXRvclN0YXRlLnRyYW5zYWN0aW9uRmlsdGVyLm9mKHRoaXMubGltaXRTZWxlY3Rpb25XaGVuWm9vbWVkSW4pO1xuICB9XG5cbiAgcHJpdmF0ZSBsaW1pdFNlbGVjdGlvbldoZW5ab29tZWRJbiA9ICh0cjogVHJhbnNhY3Rpb24pID0+IHtcbiAgICBpZiAoIXRyLnNlbGVjdGlvbiB8fCAhdHIuaXNVc2VyRXZlbnQoXCJzZWxlY3RcIikpIHtcbiAgICAgIHJldHVybiB0cjtcbiAgICB9XG5cbiAgICBjb25zdCByYW5nZSA9XG4gICAgICB0aGlzLmNhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2UuY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZSh0ci5zdGF0ZSk7XG5cbiAgICBpZiAoIXJhbmdlKSB7XG4gICAgICByZXR1cm4gdHI7XG4gICAgfVxuXG4gICAgY29uc3QgbmV3U2VsZWN0aW9uID0gY2FsY3VsYXRlTGltaXRlZFNlbGVjdGlvbihcbiAgICAgIHRyLm5ld1NlbGVjdGlvbixcbiAgICAgIHJhbmdlLmZyb20sXG4gICAgICByYW5nZS50b1xuICAgICk7XG5cbiAgICBpZiAoIW5ld1NlbGVjdGlvbikge1xuICAgICAgcmV0dXJuIHRyO1xuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmxvZyhcbiAgICAgIFwiTGltaXRTZWxlY3Rpb25XaGVuWm9vbWVkSW46bGltaXRTZWxlY3Rpb25XaGVuWm9vbWVkSW5cIixcbiAgICAgIFwibGltaXRpbmcgc2VsZWN0aW9uXCIsXG4gICAgICBuZXdTZWxlY3Rpb24udG9KU09OKClcbiAgICApO1xuXG4gICAgcmV0dXJuIFt0ciwgeyBzZWxlY3Rpb246IG5ld1NlbGVjdGlvbiB9XTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IFBsdWdpbl8yIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IEVkaXRvclN0YXRlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5cbmltcG9ydCB7IExvZ2dlclNlcnZpY2UgfSBmcm9tIFwic3JjL3NlcnZpY2VzL0xvZ2dlclNlcnZpY2VcIjtcblxuaW1wb3J0IHsgRmVhdHVyZSB9IGZyb20gXCIuL0ZlYXR1cmVcIjtcblxuaW1wb3J0IHsgTGltaXRTZWxlY3Rpb25Pblpvb21pbmdJbiB9IGZyb20gXCIuLi9sb2dpYy9MaW1pdFNlbGVjdGlvbk9uWm9vbWluZ0luXCI7XG5pbXBvcnQgeyBMaW1pdFNlbGVjdGlvbldoZW5ab29tZWRJbiB9IGZyb20gXCIuLi9sb2dpYy9MaW1pdFNlbGVjdGlvbldoZW5ab29tZWRJblwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2Uge1xuICBjYWxjdWxhdGVWaXNpYmxlQ29udGVudFJhbmdlKFxuICAgIHN0YXRlOiBFZGl0b3JTdGF0ZVxuICApOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlciB9IHwgbnVsbDtcbn1cblxuZXhwb3J0IGNsYXNzIExpbWl0U2VsZWN0aW9uRmVhdHVyZSBpbXBsZW1lbnRzIEZlYXR1cmUge1xuICBwcml2YXRlIGxpbWl0U2VsZWN0aW9uT25ab29taW5nSW4gPSBuZXcgTGltaXRTZWxlY3Rpb25Pblpvb21pbmdJbihcbiAgICB0aGlzLmxvZ2dlclxuICApO1xuICBwcml2YXRlIGxpbWl0U2VsZWN0aW9uV2hlblpvb21lZEluID0gbmV3IExpbWl0U2VsZWN0aW9uV2hlblpvb21lZEluKFxuICAgIHRoaXMubG9nZ2VyLFxuICAgIHRoaXMuY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZVxuICApO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW5fMixcbiAgICBwcml2YXRlIGxvZ2dlcjogTG9nZ2VyU2VydmljZSxcbiAgICBwcml2YXRlIGNhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2U6IENhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2VcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICB0aGlzLmxpbWl0U2VsZWN0aW9uT25ab29taW5nSW4uZ2V0RXh0ZW5zaW9uKClcbiAgICApO1xuXG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICB0aGlzLmxpbWl0U2VsZWN0aW9uV2hlblpvb21lZEluLmdldEV4dGVuc2lvbigpXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG59XG4iLCJpbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIi4vRmVhdHVyZVwiO1xuXG5pbXBvcnQgeyBTZXR0aW5nc1NlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NTZXJ2aWNlXCI7XG5cbmV4cG9ydCBjbGFzcyBMaXN0c1N0eWxlc0ZlYXR1cmUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBzZXR0aW5nczogU2V0dGluZ3NTZXJ2aWNlKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3Muem9vbU9uQ2xpY2spIHtcbiAgICAgIHRoaXMuYWRkWm9vbVN0eWxlcygpO1xuICAgIH1cblxuICAgIHRoaXMuc2V0dGluZ3Mub25DaGFuZ2UoXCJ6b29tT25DbGlja1wiLCB0aGlzLm9uWm9vbU9uQ2xpY2tTZXR0aW5nQ2hhbmdlKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHtcbiAgICB0aGlzLnNldHRpbmdzLnJlbW92ZUNhbGxiYWNrKFxuICAgICAgXCJ6b29tT25DbGlja1wiLFxuICAgICAgdGhpcy5vblpvb21PbkNsaWNrU2V0dGluZ0NoYW5nZVxuICAgICk7XG5cbiAgICB0aGlzLnJlbW92ZVpvb21TdHlsZXMoKTtcbiAgfVxuXG4gIHByaXZhdGUgb25ab29tT25DbGlja1NldHRpbmdDaGFuZ2UgPSAoem9vbU9uQ2xpY2s6IGJvb2xlYW4pID0+IHtcbiAgICBpZiAoem9vbU9uQ2xpY2spIHtcbiAgICAgIHRoaXMuYWRkWm9vbVN0eWxlcygpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnJlbW92ZVpvb21TdHlsZXMoKTtcbiAgICB9XG4gIH07XG5cbiAgcHJpdmF0ZSBhZGRab29tU3R5bGVzKCkge1xuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZChcInpvb20tcGx1Z2luLWJscy16b29tXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSByZW1vdmVab29tU3R5bGVzKCkge1xuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZShcInpvb20tcGx1Z2luLWJscy16b29tXCIpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBFZGl0b3JTdGF0ZSwgVHJhbnNhY3Rpb24gfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcblxuaW1wb3J0IHsgY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uIH0gZnJvbSBcIi4vdXRpbHMvY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWQge1xuICB2aXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRlZChzdGF0ZTogRWRpdG9yU3RhdGUpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMge1xuICBjYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzKFxuICAgIHN0YXRlOiBFZGl0b3JTdGF0ZVxuICApOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlciB9W10gfCBudWxsO1xufVxuXG5leHBvcnQgY2xhc3MgRGV0ZWN0VmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBjYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzOiBDYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzLFxuICAgIHByaXZhdGUgdmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWQ6IFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGVkXG4gICkge31cblxuICBnZXRFeHRlbnNpb24oKSB7XG4gICAgcmV0dXJuIEVkaXRvclN0YXRlLnRyYW5zYWN0aW9uRXh0ZW5kZXIub2YoXG4gICAgICB0aGlzLmRldGVjdFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvblxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGRldGVjdFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvbiA9ICh0cjogVHJhbnNhY3Rpb24pOiBudWxsID0+IHtcbiAgICBjb25zdCBoaWRkZW5SYW5nZXMgPVxuICAgICAgdGhpcy5jYWxjdWxhdGVIaWRkZW5Db250ZW50UmFuZ2VzLmNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMoXG4gICAgICAgIHRyLnN0YXJ0U3RhdGVcbiAgICAgICk7XG5cbiAgICBjb25zdCB7IHRvdWNoZWRPdXRzaWRlLCB0b3VjaGVkSW5zaWRlIH0gPVxuICAgICAgY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uKHRyLCBoaWRkZW5SYW5nZXMpO1xuXG4gICAgaWYgKHRvdWNoZWRPdXRzaWRlICYmIHRvdWNoZWRJbnNpZGUpIHtcbiAgICAgIHNldEltbWVkaWF0ZSgoKSA9PiB7XG4gICAgICAgIHRoaXMudmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWQudmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWQoXG4gICAgICAgICAgdHIuc3RhdGVcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgUGx1Z2luXzIgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgRWRpdG9yU3RhdGUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5pbXBvcnQgeyBMb2dnZXJTZXJ2aWNlIH0gZnJvbSBcInNyYy9zZXJ2aWNlcy9Mb2dnZXJTZXJ2aWNlXCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5pbXBvcnQgeyBnZXRFZGl0b3JWaWV3RnJvbUVkaXRvclN0YXRlIH0gZnJvbSBcIi4vdXRpbHMvZ2V0RWRpdG9yVmlld0Zyb21FZGl0b3JTdGF0ZVwiO1xuXG5pbXBvcnQgeyBEZXRlY3RWaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRpb24gfSBmcm9tIFwiLi4vbG9naWMvRGV0ZWN0VmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0aW9uXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyB7XG4gIGNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMoXG4gICAgc3RhdGU6IEVkaXRvclN0YXRlXG4gICk6IHsgZnJvbTogbnVtYmVyOyB0bzogbnVtYmVyIH1bXSB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgWm9vbU91dCB7XG4gIHpvb21PdXQodmlldzogRWRpdG9yVmlldyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNldFpvb21XaGVuVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWRGZWF0dXJlXG4gIGltcGxlbWVudHMgRmVhdHVyZVxue1xuICBwcml2YXRlIGRldGVjdFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvbiA9XG4gICAgbmV3IERldGVjdFZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGlvbihcbiAgICAgIHRoaXMuY2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyxcbiAgICAgIHtcbiAgICAgICAgdmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWQ6IChzdGF0ZSkgPT5cbiAgICAgICAgICB0aGlzLnZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGVkKHN0YXRlKSxcbiAgICAgIH1cbiAgICApO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW5fMixcbiAgICBwcml2YXRlIGxvZ2dlcjogTG9nZ2VyU2VydmljZSxcbiAgICBwcml2YXRlIGNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXM6IENhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMsXG4gICAgcHJpdmF0ZSB6b29tT3V0OiBab29tT3V0XG4gICkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFxuICAgICAgdGhpcy5kZXRlY3RWaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRpb24uZ2V0RXh0ZW5zaW9uKClcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge31cblxuICBwcml2YXRlIHZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGVkKHN0YXRlOiBFZGl0b3JTdGF0ZSkge1xuICAgIGNvbnN0IGwgPSB0aGlzLmxvZ2dlci5iaW5kKFxuICAgICAgXCJSZXNldFpvb21XaGVuVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWRGZWF0dXJlOnZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGVkXCJcbiAgICApO1xuICAgIGwoXCJ2aXNpYmxlIGNvbnRlbnQgYm91bmRhcmllcyB2aW9sYXRlZCwgem9vbWluZyBvdXRcIik7XG4gICAgdGhpcy56b29tT3V0Lnpvb21PdXQoZ2V0RWRpdG9yVmlld0Zyb21FZGl0b3JTdGF0ZShzdGF0ZSkpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBBcHAsIFBsdWdpblNldHRpbmdUYWIsIFBsdWdpbl8yLCBTZXR0aW5nIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IFNldHRpbmdzU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9TZXR0aW5nc1NlcnZpY2VcIjtcblxuY2xhc3MgT2JzaWRpYW5ab29tUGx1Z2luU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBQbHVnaW5fMiwgcHJpdmF0ZSBzZXR0aW5nczogU2V0dGluZ3NTZXJ2aWNlKSB7XG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xuICB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuXG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJab29taW5nIGluIHdoZW4gY2xpY2tpbmcgb24gdGhlIGJ1bGxldFwiKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PiB7XG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnNldHRpbmdzLnpvb21PbkNsaWNrKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnNldHRpbmdzLnpvb21PbkNsaWNrID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5zZXR0aW5ncy5zYXZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiRGVidWcgbW9kZVwiKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIFwiT3BlbiBEZXZUb29scyAoQ29tbWFuZCtPcHRpb24rSSBvciBDb250cm9sK1NoaWZ0K0kpIHRvIGNvcHkgdGhlIGRlYnVnIGxvZ3MuXCJcbiAgICAgIClcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT4ge1xuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5zZXR0aW5ncy5kZWJ1Zykub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5zZXR0aW5ncy5kZWJ1ZyA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMuc2V0dGluZ3Muc2F2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc1RhYkZlYXR1cmUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBwbHVnaW46IFBsdWdpbl8yLCBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5nc1NlcnZpY2UpIHt9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICB0aGlzLnBsdWdpbi5hZGRTZXR0aW5nVGFiKFxuICAgICAgbmV3IE9ic2lkaWFuWm9vbVBsdWdpblNldHRpbmdUYWIoXG4gICAgICAgIHRoaXMucGx1Z2luLmFwcCxcbiAgICAgICAgdGhpcy5wbHVnaW4sXG4gICAgICAgIHRoaXMuc2V0dGluZ3NcbiAgICAgIClcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge31cbn1cbiIsImltcG9ydCB7IEFwcCB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNGb2xkaW5nRW5hYmxlZChhcHA6IEFwcCkge1xuICBjb25zdCBjb25maWc6IHtcbiAgICBmb2xkSGVhZGluZzogYm9vbGVhbjtcbiAgICBmb2xkSW5kZW50OiBib29sZWFuO1xuICB9ID0ge1xuICAgIGZvbGRIZWFkaW5nOiBmYWxzZSxcbiAgICBmb2xkSW5kZW50OiBmYWxzZSxcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgIC4uLihhcHAudmF1bHQgYXMgYW55KS5jb25maWcsXG4gIH07XG5cbiAgcmV0dXJuIGNvbmZpZy5mb2xkSGVhZGluZyAmJiBjb25maWcuZm9sZEluZGVudDtcbn1cbiIsImltcG9ydCB7IGZvbGRhYmxlIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuXG5leHBvcnQgY2xhc3MgQ2FsY3VsYXRlUmFuZ2VGb3Jab29taW5nIHtcbiAgcHVibGljIGNhbGN1bGF0ZVJhbmdlRm9yWm9vbWluZyhzdGF0ZTogRWRpdG9yU3RhdGUsIHBvczogbnVtYmVyKSB7XG4gICAgY29uc3QgbGluZSA9IHN0YXRlLmRvYy5saW5lQXQocG9zKTtcbiAgICBjb25zdCBmb2xkUmFuZ2UgPSBmb2xkYWJsZShzdGF0ZSwgbGluZS5mcm9tLCBsaW5lLnRvKTtcblxuICAgIGlmICghZm9sZFJhbmdlICYmIC9eXFxzKihbLSorXXxcXGQrXFwuKVxccysvLnRlc3QobGluZS50ZXh0KSkge1xuICAgICAgcmV0dXJuIHsgZnJvbTogbGluZS5mcm9tLCB0bzogbGluZS50byB9O1xuICAgIH1cblxuICAgIGlmICghZm9sZFJhbmdlKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4geyBmcm9tOiBsaW5lLmZyb20sIHRvOiBmb2xkUmFuZ2UudG8gfTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUmFuZ2VTZXQsIFJhbmdlVmFsdWUgfSBmcm9tIFwiQGNvZGVtaXJyb3IvcmFuZ2VzZXRcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJhbmdlU2V0VG9BcnJheTxUIGV4dGVuZHMgUmFuZ2VWYWx1ZT4oXG4gIHJzOiBSYW5nZVNldDxUPlxuKTogQXJyYXk8eyBmcm9tOiBudW1iZXI7IHRvOiBudW1iZXIgfT4ge1xuICBjb25zdCByZXMgPSBbXTtcbiAgY29uc3QgaSA9IHJzLml0ZXIoKTtcbiAgd2hpbGUgKGkudmFsdWUgIT09IG51bGwpIHtcbiAgICByZXMucHVzaCh7IGZyb206IGkuZnJvbSwgdG86IGkudG8gfSk7XG4gICAgaS5uZXh0KCk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cbiIsImltcG9ydCB7IEVkaXRvclN0YXRlLCBFeHRlbnNpb24sIFN0YXRlRmllbGQgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IERlY29yYXRpb24sIERlY29yYXRpb25TZXQsIEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5pbXBvcnQgeyB6b29tSW5FZmZlY3QsIHpvb21PdXRFZmZlY3QgfSBmcm9tIFwiLi91dGlscy9lZmZlY3RzXCI7XG5pbXBvcnQgeyByYW5nZVNldFRvQXJyYXkgfSBmcm9tIFwiLi91dGlscy9yYW5nZVNldFRvQXJyYXlcIjtcblxuaW1wb3J0IHsgTG9nZ2VyU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9Mb2dnZXJTZXJ2aWNlXCI7XG5cbmNvbnN0IHpvb21NYXJrSGlkZGVuID0gRGVjb3JhdGlvbi5yZXBsYWNlKHsgYmxvY2s6IHRydWUgfSk7XG5cbmNvbnN0IHpvb21TdGF0ZUZpZWxkID0gU3RhdGVGaWVsZC5kZWZpbmU8RGVjb3JhdGlvblNldD4oe1xuICBjcmVhdGU6ICgpID0+IHtcbiAgICByZXR1cm4gRGVjb3JhdGlvbi5ub25lO1xuICB9LFxuXG4gIHVwZGF0ZTogKHZhbHVlLCB0cikgPT4ge1xuICAgIHZhbHVlID0gdmFsdWUubWFwKHRyLmNoYW5nZXMpO1xuXG4gICAgZm9yIChjb25zdCBlIG9mIHRyLmVmZmVjdHMpIHtcbiAgICAgIGlmIChlLmlzKHpvb21JbkVmZmVjdCkpIHtcbiAgICAgICAgdmFsdWUgPSB2YWx1ZS51cGRhdGUoeyBmaWx0ZXI6ICgpID0+IGZhbHNlIH0pO1xuXG4gICAgICAgIGlmIChlLnZhbHVlLmZyb20gPiAwKSB7XG4gICAgICAgICAgdmFsdWUgPSB2YWx1ZS51cGRhdGUoe1xuICAgICAgICAgICAgYWRkOiBbem9vbU1hcmtIaWRkZW4ucmFuZ2UoMCwgZS52YWx1ZS5mcm9tIC0gMSldLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGUudmFsdWUudG8gPCB0ci5uZXdEb2MubGVuZ3RoKSB7XG4gICAgICAgICAgdmFsdWUgPSB2YWx1ZS51cGRhdGUoe1xuICAgICAgICAgICAgYWRkOiBbem9vbU1hcmtIaWRkZW4ucmFuZ2UoZS52YWx1ZS50byArIDEsIHRyLm5ld0RvYy5sZW5ndGgpXSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZS5pcyh6b29tT3V0RWZmZWN0KSkge1xuICAgICAgICB2YWx1ZSA9IHZhbHVlLnVwZGF0ZSh7IGZpbHRlcjogKCkgPT4gZmFsc2UgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhbHVlO1xuICB9LFxuXG4gIHByb3ZpZGU6ICh6b29tU3RhdGVGaWVsZCkgPT4gRWRpdG9yVmlldy5kZWNvcmF0aW9ucy5mcm9tKHpvb21TdGF0ZUZpZWxkKSxcbn0pO1xuXG5leHBvcnQgY2xhc3MgS2VlcE9ubHlab29tZWRDb250ZW50VmlzaWJsZSB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgbG9nZ2VyOiBMb2dnZXJTZXJ2aWNlKSB7fVxuXG4gIHB1YmxpYyBnZXRFeHRlbnNpb24oKTogRXh0ZW5zaW9uIHtcbiAgICByZXR1cm4gem9vbVN0YXRlRmllbGQ7XG4gIH1cblxuICBwdWJsaWMgY2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyhzdGF0ZTogRWRpdG9yU3RhdGUpIHtcbiAgICByZXR1cm4gcmFuZ2VTZXRUb0FycmF5KHN0YXRlLmZpZWxkKHpvb21TdGF0ZUZpZWxkKSk7XG4gIH1cblxuICBwdWJsaWMgY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZShzdGF0ZTogRWRpdG9yU3RhdGUpIHtcbiAgICBjb25zdCBoaWRkZW4gPSB0aGlzLmNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMoc3RhdGUpO1xuXG4gICAgaWYgKGhpZGRlbi5sZW5ndGggPT09IDEpIHtcbiAgICAgIGNvbnN0IFthXSA9IGhpZGRlbjtcblxuICAgICAgaWYgKGEuZnJvbSA9PT0gMCkge1xuICAgICAgICByZXR1cm4geyBmcm9tOiBhLnRvICsgMSwgdG86IHN0YXRlLmRvYy5sZW5ndGggfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IGZyb206IDAsIHRvOiBhLmZyb20gLSAxIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGhpZGRlbi5sZW5ndGggPT09IDIpIHtcbiAgICAgIGNvbnN0IFthLCBiXSA9IGhpZGRlbjtcblxuICAgICAgcmV0dXJuIHsgZnJvbTogYS50byArIDEsIHRvOiBiLmZyb20gLSAxIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwdWJsaWMga2VlcE9ubHlab29tZWRDb250ZW50VmlzaWJsZShcbiAgICB2aWV3OiBFZGl0b3JWaWV3LFxuICAgIGZyb206IG51bWJlcixcbiAgICB0bzogbnVtYmVyXG4gICkge1xuICAgIGNvbnN0IGVmZmVjdCA9IHpvb21JbkVmZmVjdC5vZih7IGZyb20sIHRvIH0pO1xuXG4gICAgdGhpcy5sb2dnZXIubG9nKFxuICAgICAgXCJLZWVwT25seVpvb21lZENvbnRlbnQ6a2VlcE9ubHlab29tZWRDb250ZW50VmlzaWJsZVwiLFxuICAgICAgXCJrZWVwIG9ubHkgem9vbWVkIGNvbnRlbnQgdmlzaWJsZVwiLFxuICAgICAgZWZmZWN0LnZhbHVlLmZyb20sXG4gICAgICBlZmZlY3QudmFsdWUudG9cbiAgICApO1xuXG4gICAgdmlldy5kaXNwYXRjaCh7XG4gICAgICBlZmZlY3RzOiBbZWZmZWN0XSxcbiAgICB9KTtcbiAgICB2aWV3LmRpc3BhdGNoKHtcbiAgICAgIGVmZmVjdHM6IFtcbiAgICAgICAgRWRpdG9yVmlldy5zY3JvbGxJbnRvVmlldyh2aWV3LnN0YXRlLnNlbGVjdGlvbi5tYWluLCB7XG4gICAgICAgICAgeTogXCJzdGFydFwiLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgc2hvd0FsbENvbnRlbnQodmlldzogRWRpdG9yVmlldykge1xuICAgIHRoaXMubG9nZ2VyLmxvZyhcIktlZXBPbmx5Wm9vbWVkQ29udGVudDpzaG93QWxsQ29udGVudFwiLCBcInNob3cgYWxsIGNvbnRlbnRcIik7XG5cbiAgICB2aWV3LmRpc3BhdGNoKHsgZWZmZWN0czogW3pvb21PdXRFZmZlY3Qub2YoKV0gfSk7XG4gICAgdmlldy5kaXNwYXRjaCh7XG4gICAgICBlZmZlY3RzOiBbXG4gICAgICAgIEVkaXRvclZpZXcuc2Nyb2xsSW50b1ZpZXcodmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbiwge1xuICAgICAgICAgIHk6IFwiY2VudGVyXCIsXG4gICAgICAgIH0pLFxuICAgICAgXSxcbiAgICB9KTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgTm90aWNlLCBQbHVnaW5fMiB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsgRWRpdG9yVmlldyB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5pbXBvcnQgeyBpc0ZvbGRpbmdFbmFibGVkIH0gZnJvbSBcIi4vdXRpbHMvaXNGb2xkaW5nRW5hYmxlZFwiO1xuXG5pbXBvcnQgeyBDYWxjdWxhdGVSYW5nZUZvclpvb21pbmcgfSBmcm9tIFwiLi4vbG9naWMvQ2FsY3VsYXRlUmFuZ2VGb3Jab29taW5nXCI7XG5pbXBvcnQgeyBLZWVwT25seVpvb21lZENvbnRlbnRWaXNpYmxlIH0gZnJvbSBcIi4uL2xvZ2ljL0tlZXBPbmx5Wm9vbWVkQ29udGVudFZpc2libGVcIjtcbmltcG9ydCB7IExvZ2dlclNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvTG9nZ2VyU2VydmljZVwiO1xuXG5leHBvcnQgdHlwZSBab29tSW5DYWxsYmFjayA9ICh2aWV3OiBFZGl0b3JWaWV3LCBwb3M6IG51bWJlcikgPT4gdm9pZDtcbmV4cG9ydCB0eXBlIFpvb21PdXRDYWxsYmFjayA9ICh2aWV3OiBFZGl0b3JWaWV3KSA9PiB2b2lkO1xuXG5leHBvcnQgY2xhc3MgWm9vbUZlYXR1cmUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgcHJpdmF0ZSB6b29tSW5DYWxsYmFja3M6IFpvb21JbkNhbGxiYWNrW10gPSBbXTtcbiAgcHJpdmF0ZSB6b29tT3V0Q2FsbGJhY2tzOiBab29tT3V0Q2FsbGJhY2tbXSA9IFtdO1xuXG4gIHByaXZhdGUga2VlcE9ubHlab29tZWRDb250ZW50VmlzaWJsZSA9IG5ldyBLZWVwT25seVpvb21lZENvbnRlbnRWaXNpYmxlKFxuICAgIHRoaXMubG9nZ2VyXG4gICk7XG5cbiAgcHJpdmF0ZSBjYWxjdWxhdGVSYW5nZUZvclpvb21pbmcgPSBuZXcgQ2FsY3VsYXRlUmFuZ2VGb3Jab29taW5nKCk7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBwbHVnaW46IFBsdWdpbl8yLCBwcml2YXRlIGxvZ2dlcjogTG9nZ2VyU2VydmljZSkge31cblxuICBwdWJsaWMgY2FsY3VsYXRlVmlzaWJsZUNvbnRlbnRSYW5nZShzdGF0ZTogRWRpdG9yU3RhdGUpIHtcbiAgICByZXR1cm4gdGhpcy5rZWVwT25seVpvb21lZENvbnRlbnRWaXNpYmxlLmNhbGN1bGF0ZVZpc2libGVDb250ZW50UmFuZ2UoXG4gICAgICBzdGF0ZVxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgY2FsY3VsYXRlSGlkZGVuQ29udGVudFJhbmdlcyhzdGF0ZTogRWRpdG9yU3RhdGUpIHtcbiAgICByZXR1cm4gdGhpcy5rZWVwT25seVpvb21lZENvbnRlbnRWaXNpYmxlLmNhbGN1bGF0ZUhpZGRlbkNvbnRlbnRSYW5nZXMoXG4gICAgICBzdGF0ZVxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgbm90aWZ5QWZ0ZXJab29tSW4oY2I6IFpvb21JbkNhbGxiYWNrKSB7XG4gICAgdGhpcy56b29tSW5DYWxsYmFja3MucHVzaChjYik7XG4gIH1cblxuICBwdWJsaWMgbm90aWZ5QWZ0ZXJab29tT3V0KGNiOiBab29tT3V0Q2FsbGJhY2spIHtcbiAgICB0aGlzLnpvb21PdXRDYWxsYmFja3MucHVzaChjYik7XG4gIH1cblxuICBwdWJsaWMgem9vbUluKHZpZXc6IEVkaXRvclZpZXcsIHBvczogbnVtYmVyKSB7XG4gICAgY29uc3QgbCA9IHRoaXMubG9nZ2VyLmJpbmQoXCJab29tRmVhdHVyZTp6b29tSW5cIik7XG4gICAgbChcInpvb21pbmcgaW5cIik7XG5cbiAgICBpZiAoIWlzRm9sZGluZ0VuYWJsZWQodGhpcy5wbHVnaW4uYXBwKSkge1xuICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgYEluIG9yZGVyIHRvIHpvb20sIHlvdSBtdXN0IGZpcnN0IGVuYWJsZSBcIkZvbGQgaGVhZGluZ1wiIGFuZCBcIkZvbGQgaW5kZW50XCIgdW5kZXIgU2V0dGluZ3MgLT4gRWRpdG9yYFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCByYW5nZSA9IHRoaXMuY2FsY3VsYXRlUmFuZ2VGb3Jab29taW5nLmNhbGN1bGF0ZVJhbmdlRm9yWm9vbWluZyhcbiAgICAgIHZpZXcuc3RhdGUsXG4gICAgICBwb3NcbiAgICApO1xuXG4gICAgaWYgKCFyYW5nZSkge1xuICAgICAgbChcInVuYWJsZSB0byBjYWxjdWxhdGUgcmFuZ2UgZm9yIHpvb21pbmdcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5rZWVwT25seVpvb21lZENvbnRlbnRWaXNpYmxlLmtlZXBPbmx5Wm9vbWVkQ29udGVudFZpc2libGUoXG4gICAgICB2aWV3LFxuICAgICAgcmFuZ2UuZnJvbSxcbiAgICAgIHJhbmdlLnRvXG4gICAgKTtcblxuICAgIGZvciAoY29uc3QgY2Igb2YgdGhpcy56b29tSW5DYWxsYmFja3MpIHtcbiAgICAgIGNiKHZpZXcsIHBvcyk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIHpvb21PdXQodmlldzogRWRpdG9yVmlldykge1xuICAgIGNvbnN0IGwgPSB0aGlzLmxvZ2dlci5iaW5kKFwiWm9vbUZlYXR1cmU6em9vbUluXCIpO1xuICAgIGwoXCJ6b29taW5nIG91dFwiKTtcblxuICAgIHRoaXMua2VlcE9ubHlab29tZWRDb250ZW50VmlzaWJsZS5zaG93QWxsQ29udGVudCh2aWV3KTtcblxuICAgIGZvciAoY29uc3QgY2Igb2YgdGhpcy56b29tT3V0Q2FsbGJhY2tzKSB7XG4gICAgICBjYih2aWV3KTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFxuICAgICAgdGhpcy5rZWVwT25seVpvb21lZENvbnRlbnRWaXNpYmxlLmdldEV4dGVuc2lvbigpXG4gICAgKTtcblxuICAgIHRoaXMucGx1Z2luLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiem9vbS1pblwiLFxuICAgICAgbmFtZTogXCJab29tIGluXCIsXG4gICAgICBpY29uOiBcIm9ic2lkaWFuLXpvb20tem9vbS1pblwiLFxuICAgICAgZWRpdG9yQ2FsbGJhY2s6IChlZGl0b3IpID0+IHtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgY29uc3QgdmlldzogRWRpdG9yVmlldyA9IChlZGl0b3IgYXMgYW55KS5jbTtcbiAgICAgICAgdGhpcy56b29tSW4odmlldywgdmlldy5zdGF0ZS5zZWxlY3Rpb24ubWFpbi5oZWFkKTtcbiAgICAgIH0sXG4gICAgICBob3RrZXlzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBtb2RpZmllcnM6IFtcIk1vZFwiXSxcbiAgICAgICAgICBrZXk6IFwiLlwiLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIHRoaXMucGx1Z2luLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiem9vbS1vdXRcIixcbiAgICAgIG5hbWU6IFwiWm9vbSBvdXQgdGhlIGVudGlyZSBkb2N1bWVudFwiLFxuICAgICAgaWNvbjogXCJvYnNpZGlhbi16b29tLXpvb20tb3V0XCIsXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgZWRpdG9yQ2FsbGJhY2s6IChlZGl0b3IpID0+IHRoaXMuem9vbU91dCgoZWRpdG9yIGFzIGFueSkuY20pLFxuICAgICAgaG90a2V5czogW1xuICAgICAgICB7XG4gICAgICAgICAgbW9kaWZpZXJzOiBbXCJNb2RcIiwgXCJTaGlmdFwiXSxcbiAgICAgICAgICBrZXk6IFwiLlwiLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG59XG4iLCJleHBvcnQgZnVuY3Rpb24gaXNCdWxsZXRQb2ludChlOiBIVE1MRWxlbWVudCkge1xuICByZXR1cm4gKFxuICAgIGUgaW5zdGFuY2VvZiBIVE1MU3BhbkVsZW1lbnQgJiZcbiAgICAoZS5jbGFzc0xpc3QuY29udGFpbnMoXCJsaXN0LWJ1bGxldFwiKSB8fFxuICAgICAgZS5jbGFzc0xpc3QuY29udGFpbnMoXCJjbS1mb3JtYXR0aW5nLWxpc3RcIikpXG4gICk7XG59XG4iLCJpbXBvcnQgeyBFZGl0b3JTZWxlY3Rpb24gfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5pbXBvcnQgeyBpc0J1bGxldFBvaW50IH0gZnJvbSBcIi4vdXRpbHMvaXNCdWxsZXRQb2ludFwiO1xuXG5pbXBvcnQgeyBTZXR0aW5nc1NlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NTZXJ2aWNlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2xpY2tPbkJ1bGxldCB7XG4gIGNsaWNrT25CdWxsZXQodmlldzogRWRpdG9yVmlldywgcG9zOiBudW1iZXIpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgRGV0ZWN0Q2xpY2tPbkJ1bGxldCB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzU2VydmljZSxcbiAgICBwcml2YXRlIGNsaWNrT25CdWxsZXQ6IENsaWNrT25CdWxsZXRcbiAgKSB7fVxuXG4gIGdldEV4dGVuc2lvbigpIHtcbiAgICByZXR1cm4gRWRpdG9yVmlldy5kb21FdmVudEhhbmRsZXJzKHtcbiAgICAgIGNsaWNrOiB0aGlzLmRldGVjdENsaWNrT25CdWxsZXQsXG4gICAgfSk7XG4gIH1cblxuICBwdWJsaWMgbW92ZUN1cnNvclRvTGluZUVuZCh2aWV3OiBFZGl0b3JWaWV3LCBwb3M6IG51bWJlcikge1xuICAgIGNvbnN0IGxpbmUgPSB2aWV3LnN0YXRlLmRvYy5saW5lQXQocG9zKTtcblxuICAgIHZpZXcuZGlzcGF0Y2goe1xuICAgICAgc2VsZWN0aW9uOiBFZGl0b3JTZWxlY3Rpb24uY3Vyc29yKGxpbmUudG8pLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBkZXRlY3RDbGlja09uQnVsbGV0ID0gKGU6IE1vdXNlRXZlbnQsIHZpZXc6IEVkaXRvclZpZXcpID0+IHtcbiAgICBpZiAoXG4gICAgICAhdGhpcy5zZXR0aW5ncy56b29tT25DbGljayB8fFxuICAgICAgIShlLnRhcmdldCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB8fFxuICAgICAgIWlzQnVsbGV0UG9pbnQoZS50YXJnZXQpXG4gICAgKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcG9zID0gdmlldy5wb3NBdERPTShlLnRhcmdldCk7XG4gICAgdGhpcy5jbGlja09uQnVsbGV0LmNsaWNrT25CdWxsZXQodmlldywgcG9zKTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IFBsdWdpbl8yIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5pbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIi4vRmVhdHVyZVwiO1xuXG5pbXBvcnQgeyBEZXRlY3RDbGlja09uQnVsbGV0IH0gZnJvbSBcIi4uL2xvZ2ljL0RldGVjdENsaWNrT25CdWxsZXRcIjtcbmltcG9ydCB7IFNldHRpbmdzU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9TZXR0aW5nc1NlcnZpY2VcIjtcblxuZXhwb3J0IGludGVyZmFjZSBab29tSW4ge1xuICB6b29tSW4odmlldzogRWRpdG9yVmlldywgcG9zOiBudW1iZXIpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgWm9vbU9uQ2xpY2tGZWF0dXJlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIHByaXZhdGUgZGV0ZWN0Q2xpY2tPbkJ1bGxldCA9IG5ldyBEZXRlY3RDbGlja09uQnVsbGV0KHRoaXMuc2V0dGluZ3MsIHtcbiAgICBjbGlja09uQnVsbGV0OiAodmlldywgcG9zKSA9PiB0aGlzLmNsaWNrT25CdWxsZXQodmlldywgcG9zKSxcbiAgfSk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbl8yLFxuICAgIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzU2VydmljZSxcbiAgICBwcml2YXRlIHpvb21JbjogWm9vbUluXG4gICkge31cblxuICBhc3luYyBsb2FkKCkge1xuICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKFxuICAgICAgdGhpcy5kZXRlY3RDbGlja09uQnVsbGV0LmdldEV4dGVuc2lvbigpXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG5cbiAgcHJpdmF0ZSBjbGlja09uQnVsbGV0KHZpZXc6IEVkaXRvclZpZXcsIHBvczogbnVtYmVyKSB7XG4gICAgdGhpcy5kZXRlY3RDbGlja09uQnVsbGV0Lm1vdmVDdXJzb3JUb0xpbmVFbmQodmlldywgcG9zKTtcbiAgICB0aGlzLnpvb21Jbi56b29tSW4odmlldywgcG9zKTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSBcIi4vU2V0dGluZ3NTZXJ2aWNlXCI7XG5cbmV4cG9ydCBjbGFzcyBMb2dnZXJTZXJ2aWNlIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBzZXR0aW5nczogU2V0dGluZ3NTZXJ2aWNlKSB7fVxuXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gIGxvZyhtZXRob2Q6IHN0cmluZywgLi4uYXJnczogYW55W10pIHtcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuZGVidWcpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zb2xlLmluZm8obWV0aG9kLCAuLi5hcmdzKTtcbiAgfVxuXG4gIGJpbmQobWV0aG9kOiBzdHJpbmcpIHtcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgIHJldHVybiAoLi4uYXJnczogYW55W10pID0+IHRoaXMubG9nKG1ldGhvZCwgLi4uYXJncyk7XG4gIH1cbn1cbiIsImV4cG9ydCBpbnRlcmZhY2UgT2JzaWRpYW5ab29tUGx1Z2luU2V0dGluZ3Mge1xuICBkZWJ1ZzogYm9vbGVhbjtcbiAgem9vbU9uQ2xpY2s6IGJvb2xlYW47XG59XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IE9ic2lkaWFuWm9vbVBsdWdpblNldHRpbmdzID0ge1xuICBkZWJ1ZzogZmFsc2UsXG4gIHpvb21PbkNsaWNrOiB0cnVlLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBTdG9yYWdlIHtcbiAgbG9hZERhdGEoKTogUHJvbWlzZTxPYnNpZGlhblpvb21QbHVnaW5TZXR0aW5ncz47XG4gIHNhdmVEYXRhKHNldHRpZ25zOiBPYnNpZGlhblpvb21QbHVnaW5TZXR0aW5ncyk6IFByb21pc2U8dm9pZD47XG59XG5cbnR5cGUgSyA9IGtleW9mIE9ic2lkaWFuWm9vbVBsdWdpblNldHRpbmdzO1xudHlwZSBWPFQgZXh0ZW5kcyBLPiA9IE9ic2lkaWFuWm9vbVBsdWdpblNldHRpbmdzW1RdO1xudHlwZSBDYWxsYmFjazxUIGV4dGVuZHMgSz4gPSAoY2I6IFY8VD4pID0+IHZvaWQ7XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc1NlcnZpY2UgaW1wbGVtZW50cyBPYnNpZGlhblpvb21QbHVnaW5TZXR0aW5ncyB7XG4gIHByaXZhdGUgc3RvcmFnZTogU3RvcmFnZTtcbiAgcHJpdmF0ZSB2YWx1ZXM6IE9ic2lkaWFuWm9vbVBsdWdpblNldHRpbmdzO1xuICBwcml2YXRlIGhhbmRsZXJzOiBNYXA8SywgU2V0PENhbGxiYWNrPEs+Pj47XG5cbiAgY29uc3RydWN0b3Ioc3RvcmFnZTogU3RvcmFnZSkge1xuICAgIHRoaXMuc3RvcmFnZSA9IHN0b3JhZ2U7XG4gICAgdGhpcy5oYW5kbGVycyA9IG5ldyBNYXAoKTtcbiAgfVxuXG4gIGdldCBkZWJ1ZygpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZXMuZGVidWc7XG4gIH1cbiAgc2V0IGRlYnVnKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5zZXQoXCJkZWJ1Z1wiLCB2YWx1ZSk7XG4gIH1cblxuICBnZXQgem9vbU9uQ2xpY2soKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzLnpvb21PbkNsaWNrO1xuICB9XG4gIHNldCB6b29tT25DbGljayh2YWx1ZTogYm9vbGVhbikge1xuICAgIHRoaXMuc2V0KFwiem9vbU9uQ2xpY2tcIiwgdmFsdWUpO1xuICB9XG5cbiAgb25DaGFuZ2U8VCBleHRlbmRzIEs+KGtleTogVCwgY2I6IENhbGxiYWNrPFQ+KSB7XG4gICAgaWYgKCF0aGlzLmhhbmRsZXJzLmhhcyhrZXkpKSB7XG4gICAgICB0aGlzLmhhbmRsZXJzLnNldChrZXksIG5ldyBTZXQoKSk7XG4gICAgfVxuXG4gICAgdGhpcy5oYW5kbGVycy5nZXQoa2V5KS5hZGQoY2IpO1xuICB9XG5cbiAgcmVtb3ZlQ2FsbGJhY2s8VCBleHRlbmRzIEs+KGtleTogVCwgY2I6IENhbGxiYWNrPFQ+KTogdm9pZCB7XG4gICAgY29uc3QgaGFuZGxlcnMgPSB0aGlzLmhhbmRsZXJzLmdldChrZXkpO1xuXG4gICAgaWYgKGhhbmRsZXJzKSB7XG4gICAgICBoYW5kbGVycy5kZWxldGUoY2IpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy52YWx1ZXMgPSBPYmplY3QuYXNzaWduKFxuICAgICAge30sXG4gICAgICBERUZBVUxUX1NFVFRJTkdTLFxuICAgICAgYXdhaXQgdGhpcy5zdG9yYWdlLmxvYWREYXRhKClcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2F2ZSgpIHtcbiAgICBhd2FpdCB0aGlzLnN0b3JhZ2Uuc2F2ZURhdGEodGhpcy52YWx1ZXMpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXQ8VCBleHRlbmRzIEs+KGtleTogVCwgdmFsdWU6IFY8Sz4pOiB2b2lkIHtcbiAgICB0aGlzLnZhbHVlc1trZXldID0gdmFsdWU7XG4gICAgY29uc3QgY2FsbGJhY2tzID0gdGhpcy5oYW5kbGVycy5nZXQoa2V5KTtcblxuICAgIGlmICghY2FsbGJhY2tzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBjYiBvZiBjYWxsYmFja3MudmFsdWVzKCkpIHtcbiAgICAgIGNiKHZhbHVlKTtcbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB7IE5vdGljZSwgUGx1Z2luLCBhZGRJY29uIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9GZWF0dXJlXCI7XG5pbXBvcnQgeyBIZWFkZXJOYXZpZ2F0aW9uRmVhdHVyZSB9IGZyb20gXCIuL2ZlYXR1cmVzL0hlYWRlck5hdmlnYXRpb25GZWF0dXJlXCI7XG5pbXBvcnQgeyBMaW1pdFNlbGVjdGlvbkZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9MaW1pdFNlbGVjdGlvbkZlYXR1cmVcIjtcbmltcG9ydCB7IExpc3RzU3R5bGVzRmVhdHVyZSB9IGZyb20gXCIuL2ZlYXR1cmVzL0xpc3RzU3R5bGVzRmVhdHVyZVwiO1xuaW1wb3J0IHsgUmVzZXRab29tV2hlblZpc2libGVDb250ZW50Qm91bmRhcmllc1Zpb2xhdGVkRmVhdHVyZSB9IGZyb20gXCIuL2ZlYXR1cmVzL1Jlc2V0Wm9vbVdoZW5WaXNpYmxlQ29udGVudEJvdW5kYXJpZXNWaW9sYXRlZEZlYXR1cmVcIjtcbmltcG9ydCB7IFNldHRpbmdzVGFiRmVhdHVyZSB9IGZyb20gXCIuL2ZlYXR1cmVzL1NldHRpbmdzVGFiRmVhdHVyZVwiO1xuaW1wb3J0IHsgWm9vbUZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9ab29tRmVhdHVyZVwiO1xuaW1wb3J0IHsgWm9vbU9uQ2xpY2tGZWF0dXJlIH0gZnJvbSBcIi4vZmVhdHVyZXMvWm9vbU9uQ2xpY2tGZWF0dXJlXCI7XG5pbXBvcnQgeyBMb2dnZXJTZXJ2aWNlIH0gZnJvbSBcIi4vc2VydmljZXMvTG9nZ2VyU2VydmljZVwiO1xuaW1wb3J0IHsgU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSBcIi4vc2VydmljZXMvU2V0dGluZ3NTZXJ2aWNlXCI7XG5cbmFkZEljb24oXG4gIFwib2JzaWRpYW4tem9vbS16b29tLWluXCIsXG4gIGA8cGF0aCBmaWxsPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIGQ9XCJNNDIsNkMyMy4yLDYsOCwyMS4yLDgsNDBzMTUuMiwzNCwzNCwzNGM3LjQsMCwxNC4zLTIuNCwxOS45LTYuNGwyNi4zLDI2LjNsNS42LTUuNmwtMjYtMjYuMWM1LjEtNiw4LjItMTMuNyw4LjItMjIuMSBDNzYsMjEuMiw2MC44LDYsNDIsNnogTTQyLDEwYzE2LjYsMCwzMCwxMy40LDMwLDMwUzU4LjYsNzAsNDIsNzBTMTIsNTYuNiwxMiw0MFMyNS40LDEwLDQyLDEwelwiPjwvcGF0aD48bGluZSB4MT1cIjI0XCIgeTE9XCI0MFwiIHgyPVwiNjBcIiB5Mj1cIjQwXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMTBcIj48L2xpbmU+PGxpbmUgeDE9XCI0MlwiIHkxPVwiMjBcIiB4Mj1cIjQyXCIgeTI9XCI2MFwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEwXCI+PC9saW5lPmBcbik7XG5hZGRJY29uKFxuICBcIm9ic2lkaWFuLXpvb20tem9vbS1vdXRcIixcbiAgYDxwYXRoIGZpbGw9XCJjdXJyZW50Q29sb3JcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgZD1cIk00Miw2QzIzLjIsNiw4LDIxLjIsOCw0MHMxNS4yLDM0LDM0LDM0YzcuNCwwLDE0LjMtMi40LDE5LjktNi40bDI2LjMsMjYuM2w1LjYtNS42bC0yNi0yNi4xYzUuMS02LDguMi0xMy43LDguMi0yMi4xIEM3NiwyMS4yLDYwLjgsNiw0Miw2eiBNNDIsMTBjMTYuNiwwLDMwLDEzLjQsMzAsMzBTNTguNiw3MCw0Miw3MFMxMiw1Ni42LDEyLDQwUzI1LjQsMTAsNDIsMTB6XCI+PC9wYXRoPjxsaW5lIHgxPVwiMjRcIiB5MT1cIjQwXCIgeDI9XCI2MFwiIHkyPVwiNDBcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxMFwiPjwvbGluZT5gXG4pO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBPYnNpZGlhblpvb21QbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBwcm90ZWN0ZWQgZmVhdHVyZXM6IEZlYXR1cmVbXTtcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgY29uc29sZS5sb2coYExvYWRpbmcgb2JzaWRpYW4tem9vbWApO1xuXG4gICAgaWYgKHRoaXMuaXNMZWdhY3lFZGl0b3JFbmFibGVkKCkpIHtcbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIGBab29tIHBsdWdpbiBkb2VzIG5vdCBzdXBwb3J0IGxlZ2FjeSBlZGl0b3IgbW9kZSBzdGFydGluZyBmcm9tIHZlcnNpb24gMC4yLiBQbGVhc2UgZGlzYWJsZSB0aGUgXCJVc2UgbGVnYWN5IGVkaXRvclwiIG9wdGlvbiBvciBtYW51YWxseSBpbnN0YWxsIHZlcnNpb24gMC4xIG9mIFpvb20gcGx1Z2luLmAsXG4gICAgICAgIDMwMDAwXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgKHdpbmRvdyBhcyBhbnkpLk9ic2lkaWFuWm9vbVBsdWdpbiA9IHRoaXM7XG5cbiAgICBjb25zdCBzZXR0aW5ncyA9IG5ldyBTZXR0aW5nc1NlcnZpY2UodGhpcyk7XG4gICAgYXdhaXQgc2V0dGluZ3MubG9hZCgpO1xuXG4gICAgY29uc3QgbG9nZ2VyID0gbmV3IExvZ2dlclNlcnZpY2Uoc2V0dGluZ3MpO1xuXG4gICAgY29uc3Qgc2V0dGluZ3NUYWJGZWF0dXJlID0gbmV3IFNldHRpbmdzVGFiRmVhdHVyZSh0aGlzLCBzZXR0aW5ncyk7XG4gICAgY29uc3Qgem9vbUZlYXR1cmUgPSBuZXcgWm9vbUZlYXR1cmUodGhpcywgbG9nZ2VyKTtcbiAgICBjb25zdCBsaW1pdFNlbGVjdGlvbkZlYXR1cmUgPSBuZXcgTGltaXRTZWxlY3Rpb25GZWF0dXJlKFxuICAgICAgdGhpcyxcbiAgICAgIGxvZ2dlcixcbiAgICAgIHpvb21GZWF0dXJlXG4gICAgKTtcbiAgICBjb25zdCByZXNldFpvb21XaGVuVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWRGZWF0dXJlID1cbiAgICAgIG5ldyBSZXNldFpvb21XaGVuVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWRGZWF0dXJlKFxuICAgICAgICB0aGlzLFxuICAgICAgICBsb2dnZXIsXG4gICAgICAgIHpvb21GZWF0dXJlLFxuICAgICAgICB6b29tRmVhdHVyZVxuICAgICAgKTtcbiAgICBjb25zdCBoZWFkZXJOYXZpZ2F0aW9uRmVhdHVyZSA9IG5ldyBIZWFkZXJOYXZpZ2F0aW9uRmVhdHVyZShcbiAgICAgIHRoaXMsXG4gICAgICBsb2dnZXIsXG4gICAgICB6b29tRmVhdHVyZSxcbiAgICAgIHpvb21GZWF0dXJlLFxuICAgICAgem9vbUZlYXR1cmUsXG4gICAgICB6b29tRmVhdHVyZSxcbiAgICAgIHpvb21GZWF0dXJlLFxuICAgICAgem9vbUZlYXR1cmVcbiAgICApO1xuICAgIGNvbnN0IHpvb21PbkNsaWNrRmVhdHVyZSA9IG5ldyBab29tT25DbGlja0ZlYXR1cmUoXG4gICAgICB0aGlzLFxuICAgICAgc2V0dGluZ3MsXG4gICAgICB6b29tRmVhdHVyZVxuICAgICk7XG4gICAgY29uc3QgbGlzdHNTdHlsZXNGZWF0dXJlID0gbmV3IExpc3RzU3R5bGVzRmVhdHVyZShzZXR0aW5ncyk7XG5cbiAgICB0aGlzLmZlYXR1cmVzID0gW1xuICAgICAgc2V0dGluZ3NUYWJGZWF0dXJlLFxuICAgICAgem9vbUZlYXR1cmUsXG4gICAgICBsaW1pdFNlbGVjdGlvbkZlYXR1cmUsXG4gICAgICByZXNldFpvb21XaGVuVmlzaWJsZUNvbnRlbnRCb3VuZGFyaWVzVmlvbGF0ZWRGZWF0dXJlLFxuICAgICAgaGVhZGVyTmF2aWdhdGlvbkZlYXR1cmUsXG4gICAgICB6b29tT25DbGlja0ZlYXR1cmUsXG4gICAgICBsaXN0c1N0eWxlc0ZlYXR1cmUsXG4gICAgXTtcblxuICAgIGZvciAoY29uc3QgZmVhdHVyZSBvZiB0aGlzLmZlYXR1cmVzKSB7XG4gICAgICBhd2FpdCBmZWF0dXJlLmxvYWQoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBvbnVubG9hZCgpIHtcbiAgICBjb25zb2xlLmxvZyhgVW5sb2FkaW5nIG9ic2lkaWFuLXpvb21gKTtcblxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgZGVsZXRlICh3aW5kb3cgYXMgYW55KS5PYnNpZGlhblpvb21QbHVnaW47XG5cbiAgICBmb3IgKGNvbnN0IGZlYXR1cmUgb2YgdGhpcy5mZWF0dXJlcykge1xuICAgICAgYXdhaXQgZmVhdHVyZS51bmxvYWQoKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGlzTGVnYWN5RWRpdG9yRW5hYmxlZCgpIHtcbiAgICBjb25zdCBjb25maWc6IHsgbGVnYWN5RWRpdG9yOiBib29sZWFuIH0gPSB7XG4gICAgICBsZWdhY3lFZGl0b3I6IHRydWUsXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgLi4uKHRoaXMuYXBwLnZhdWx0IGFzIGFueSkuY29uZmlnLFxuICAgIH07XG5cbiAgICByZXR1cm4gY29uZmlnLmxlZ2FjeUVkaXRvcjtcbiAgfVxufVxuIl0sIm5hbWVzIjpbImVkaXRvclZpZXdGaWVsZCIsImVkaXRvckVkaXRvckZpZWxkIiwiZm9sZGFibGUiLCJFZGl0b3JTdGF0ZSIsIkZhY2V0IiwiVmlld1BsdWdpbiIsIlBsdWdpbkZpZWxkIiwiRWRpdG9yVmlldyIsIlN0YXRlRWZmZWN0IiwiU3RhdGVGaWVsZCIsIkVkaXRvclNlbGVjdGlvbiIsIlBsdWdpblNldHRpbmdUYWIiLCJTZXR0aW5nIiwiRGVjb3JhdGlvbiIsInZpZXciLCJOb3RpY2UiLCJhZGRJY29uIiwiUGx1Z2luIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQXVEQTtBQUNPLFNBQVMsU0FBUyxDQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRTtBQUM3RCxJQUFJLFNBQVMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLE9BQU8sS0FBSyxZQUFZLENBQUMsR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDLENB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
