import { vec2, mat2d } from './gl-matrix.js';
import { Panel } from './Panel.js';
import { LabelPanel, RectPanel, SpeechBalloonPanel, TextFieldPanel, ImagePanel } from './Atoms.js';

export class ContainerPanel extends Panel {
    constructor(position, size, node=Panel.createElement('g')) {
        super(position, size, node);
        this.children = [];
    }

    get root() {
        return this._root;
    }

    set root(root) {
        this._root = root;
        if(this._backgroundPanel)
            this._backgroundPanel.root = this.root;
        for(const child of this.children)
            child.root = root;
    }

    get backgroundPanel() {
        return this._backgroundPanel;
    }

    set backgroundPanel(backgroundPanel) {
        if(this._backgroundPanel)
            this.node.removeChild(this._backgroundPanel.node);
        this._backgroundPanel = backgroundPanel;
        if(this._backgroundPanel) {
            if(this.node.childNodes.length > 0)
                this.node.insertBefore(this._backgroundPanel.node, this.node.childNodes[0]);
            else
                this.node.appendChild(this._backgroundPanel.node);
            this._backgroundPanel.parent = this;
            this._backgroundPanel.root = this.root;
            this._backgroundPanel.size = this.size;
        }
    }

    updateSize() {
        super.updateSize();
        if(this._backgroundPanel)
            this._backgroundPanel.updateSize();
    }

    insertChild(child, newIndex=-1) {
        if(newIndex < 0)
            newIndex += this.children.length+1;
        if(!child || (child.parent && child.parent != this) || newIndex < 0)
            return false;
        if(child.scheduledRemoval) {
            child.animateVisibilityTo(true);
            window.clearTimeout(child.scheduledRemoval);
            delete child.scheduledRemoval;
        }
        let oldIndex;
        if(child.parent == this) {
            oldIndex = this.children.indexOf(child);
            if(oldIndex == -1 || oldIndex == newIndex || newIndex >= this.children.length)
                return false;
            this.children.splice(oldIndex, 1);
        } else {
            if(newIndex > this.children.length)
                return false;
            child.parent = this;
            child.root = this.root;
        }
        if(child.node) {
            if(newIndex == this.children.length)
                this.node.appendChild(child.node);
            else
                this.node.insertBefore(child.node, this.children[(newIndex == oldIndex+1) ? newIndex+1 : newIndex].node);
        }
        this.children.splice(newIndex, 0, child);
        return true;
    }

    removeChild(child) {
        if(child.parent != this)
            return false;
        delete child.parent;
        child.root = undefined;
        this.children.splice(this.children.indexOf(child), 1);
        if(child.node)
            this.node.removeChild(child.node);
        return true;
    }

    insertChildAnimated(child, newIndex=-1) {
        if(!this.insertChild(child, newIndex))
            return false;
        child.animateVisibilityTo(true);
        return true;
    }

    removeChildAnimated(child) {
        if(child.parent != this || child.scheduledRemoval)
            return false;
        child.animateVisibilityTo(false);
        child.scheduledRemoval = window.setTimeout(() => {
            delete child.scheduledRemoval;
            this.removeChild(child);
            this.recalculateLayout();
        }, 250);
        return true;
    }

    getSelectedChildren() {
        const result = new Set();
        for(const child of this.children)
            if(child.selected)
                result.add(child);
        return result;
    }

    setAllChildrenSelected(selected) {
        for(const child of this.children) {
            child.selected = selected;
            if(child.setAllChildrenSelected)
                child.setAllChildrenSelected(selected);
        }
    }

    selectChildrenInside(min, max, toggle) {
        for(const child of this.children)
            child.selectIfInside(min, max, toggle);
    }
}

export class RootPanel extends ContainerPanel {
    constructor(parentNode, size) {
        super(vec2.create(), size, Panel.createElement('svg', parentNode));
        this.root = this;
        this.node.setAttribute('width', '100%');
        this.node.setAttribute('height', '100%');
        this.centeringPanel = new ContainerPanel(vec2.create(), vec2.create());
        this.insertChild(this.centeringPanel);
        this.content = new ContainerPanel(vec2.create(), vec2.create());
        this.centeringPanel.insertChild(this.content);
        this.overlays = new ContainerPanel(vec2.create(), vec2.create());
        this.centeringPanel.insertChild(this.overlays);
        this.modalOverlayBackgroundPanel = new RectPanel(vec2.create(), this.size);
        this.defsNode = Panel.createElement('defs', this.node);
        const blurFilter = Panel.createElement('filter', this.defsNode);
        blurFilter.setAttribute('id', 'blurFilter');
        blurFilter.setAttribute('x', -10);
        blurFilter.setAttribute('y', -10);
        blurFilter.setAttribute('width', 20);
        blurFilter.setAttribute('height', 20);
        const feGaussianBlur = Panel.createElement('feGaussianBlur', blurFilter);
        feGaussianBlur.setAttribute('in', 'SourceGraphic');
        feGaussianBlur.setAttribute('result', 'blur');
        feGaussianBlur.setAttribute('stdDeviation', 3);
        const feComponentTransfer = Panel.createElement('feComponentTransfer', blurFilter);
        feComponentTransfer.setAttribute('in', 'blur');
        feComponentTransfer.setAttribute('result', 'brighter');
        const feFunc = Panel.createElement('feFuncA', feComponentTransfer);
        feFunc.setAttribute('type', 'linear');
        feFunc.setAttribute('slope', 2);
        const feMerge = Panel.createElement('feMerge', blurFilter);
        Panel.createElement('feMergeNode', feMerge).setAttribute('in', 'brighter');
        Panel.createElement('feMergeNode', feMerge).setAttribute('in', 'SourceGraphic');
        this.node.ongesturestart = this.node.ontouchstart = (event) => {
            event.preventDefault();
        };
    }

    recalculateLayout() {
        this.size[0] = this.node.clientWidth;
        this.size[1] = this.node.clientHeight;
        vec2.scale(this.centeringPanel.position, this.size, 0.5);
        this.centeringPanel.updatePosition();
        this.modalOverlayBackgroundPanel.updateSize();
        for(const child of this.content.children)
            child.recalculateLayout();
    }

    updateSize() {
        this.node.setAttribute('width', this.size[0]);
        this.node.setAttribute('height', this.size[1]);
    }

    openModalOverlay(overlay) {
        if(!this.modalOverlayBackgroundPanel.parent) {
            this.centeringPanel.insertChild(this.modalOverlayBackgroundPanel, -2);
            this.modalOverlayBackgroundPanel.registerClickOrDragEvent((event) => {
                this.closeModalOverlay(overlay);
            });
        }
        this.overlays.insertChildAnimated(overlay);
    }

    closeModalOverlay(overlay) {
        let index = Math.max(0, this.overlays.children.indexOf(overlay));
        if(index == 0)
            this.centeringPanel.removeChild(this.modalOverlayBackgroundPanel);
        for(; index < this.overlays.children.length; ++index) {
            const child = this.overlays.children[index];
            if(child.onClose)
                child.onClose();
            this.overlays.removeChildAnimated(child);
        }
    }

    toggleFullscreen() {
        if(document.fullscreenElement || document.webkitFullscreenElement) {
            if(document.webkitCancelFullScreen)
                document.webkitCancelFullScreen();
            else
                document.exitFullscreen();
        } else {
            if(document.documentElement.webkitRequestFullscreen)
                document.documentElement.webkitRequestFullscreen();
            else
                this.node.requestFullscreen();
        }
    }
}

export class AdaptiveSizeContainerPanel extends ContainerPanel {
    constructor(position) {
        super(position, vec2.create());
        this.padding = vec2.create();
    }

    recalculateLayout() {
        const minPosition = vec2.create(),
              maxPosition = vec2.create(),
              center = vec2.create();
        for(let i = 0; i < this.children.length; ++i) {
            const childBounds = this.children[i].getBounds();
            vec2.min(minPosition, minPosition, childBounds[0]);
            vec2.max(maxPosition, maxPosition, childBounds[1]);
        }
        vec2.sub(minPosition, minPosition, this.padding);
        vec2.add(maxPosition, maxPosition, this.padding);
        vec2.sub(this.size, maxPosition, minPosition);
        vec2.add(center, maxPosition, minPosition);
        if(vec2.dot(center, center) > 0.0) {
            vec2.scale(center, center, 0.5);
            for(let i = 0; i < this.children.length; ++i) {
                vec2.sub(this.children[i].position, this.children[i].position, center);
                this.children[i].updatePosition();
            }
        }
        this.updateSize();
    }
}

export class CheckboxPanel extends ContainerPanel {
    constructor(position, onChange) {
        super(position, vec2.fromValues(12, 12));
        this.node.classList.add('checkbox');
        this.rectPanel = new RectPanel(vec2.create(), this.size);
        this.insertChild(this.rectPanel);
        this.rectPanel.cornerRadius = 2;
        this.registerClickOrDragEvent(() => {
            this.checked = !this.checked;
            if(onChange)
                onChange();
        });
        this.imagePanel = new ImagePanel(vec2.create(), vec2.fromValues(9, 9), 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNiIgaGVpZ2h0PSIyNiI+CiAgICA8cGF0aCBmaWxsPSIjRkZGIiBkPSJNMjIuNTY2NDA2IDQuNzMwNDY5TDIwLjc3MzQzOCAzLjUxMTcxOUMyMC4yNzczNDQgMy4xNzU3ODEgMTkuNTk3NjU2IDMuMzA0Njg4IDE5LjI2NTYyNSAzLjc5Njg3NUwxMC40NzY1NjMgMTYuNzU3ODEzTDYuNDM3NSAxMi43MTg3NUM2LjAxNTYyNSAxMi4yOTY4NzUgNS4zMjgxMjUgMTIuMjk2ODc1IDQuOTA2MjUgMTIuNzE4NzVMMy4zNzEwOTQgMTQuMjUzOTA2QzIuOTQ5MjE5IDE0LjY3NTc4MSAyLjk0OTIxOSAxNS4zNjMyODEgMy4zNzEwOTQgMTUuNzg5MDYzTDkuNTgyMDMxIDIyQzkuOTI5Njg4IDIyLjM0NzY1NiAxMC40NzY1NjMgMjIuNjEzMjgxIDEwLjk2ODc1IDIyLjYxMzI4MUMxMS40NjA5MzggMjIuNjEzMjgxIDExLjk1NzAzMSAyMi4zMDQ2ODggMTIuMjc3MzQ0IDIxLjgzOTg0NEwyMi44NTU0NjkgNi4yMzQzNzVDMjMuMTkxNDA2IDUuNzQyMTg4IDIzLjA2MjUgNS4wNjY0MDYgMjIuNTY2NDA2IDQuNzMwNDY5WiIvPgo8L3N2Zz4K');
        this.insertChild(this.imagePanel);
        this.rectPanel.updateSize();
        this.rectPanel.updatePosition();
    }

    get checked() {
        return this.node.classList.contains('active');
    }

    set checked(value) {
        if(value)
            this.node.classList.add('active');
        else
            this.node.classList.remove('active');
    }
}

let clipPathID = 0;
export class ClippingViewPanel extends ContainerPanel {
    constructor(position, size) {
        super(position, size);
        this.node.setAttribute('clip-path', 'url(#clipPath'+clipPathID+')');
        this.clipNode = Panel.createElement('clipPath', this.node);
        this.clipNode.setAttribute('id', 'clipPath'+clipPathID);
        this.useNode = Panel.createElement('use', this.clipNode);
        Panel.setAttribute(this.useNode, 'href', '#clipRect'+clipPathID);
        this.backgroundPanel = new RectPanel(vec2.create(), this.size);
        this.backgroundPanel.node.setAttribute('id', 'clipRect'+clipPathID);
        ++clipPathID;
    }
}

export class PanePanel extends ClippingViewPanel {
    constructor(position, size) {
        super(position, size);
        this.backgroundPanel.node.classList.add('pane');
        this.backgroundPanel.cornerRadius = 5;
    }

    updateSize() {
        super.updateSize();
        for(const child of this.children) {
            vec2.copy(child.size, this.size);
            child.updateSize();
        }
    }
}

export class TilingPanel extends ContainerPanel {
    constructor(position, size) {
        super(position, size);
        this.axis = 0;
        this.sizeAlongAxis = 'shrinkToFit'; // shrinkToFit, centering, number (index of child to be stretched, negative values count from end)
        this.otherAxisSizeStays = false;
        this.otherAxisAlignment = 0.0; // -0.5, 0.0, 0.5, stretch
        this.interChildSpacing = 0;
        this.padding = vec2.create();
    }

    recalculateLayout() {
        let sizeAlongAxis = 0, sizeOtherAxis = 0;
        for(let i = 0; i < this.children.length; ++i) {
            const child = this.children[i];
            sizeAlongAxis += child.size[this.axis];
            sizeOtherAxis = Math.max(sizeOtherAxis, child.size[1-this.axis]);
        }
        if(this.children.length > 0)
            sizeAlongAxis += this.interChildSpacing*(this.children.length-1);
        if(this.otherAxisSizeStays)
            sizeOtherAxis = this.size[1-this.axis]-this.padding[1-this.axis]*2;
        else
            this.size[1-this.axis] = sizeOtherAxis+this.padding[1-this.axis]*2;
        const availableSize = this.size[this.axis]-this.padding[this.axis]*2;
        if(typeof this.sizeAlongAxis == 'number') {
            const child = this.children[(this.sizeAlongAxis < 0) ? this.children.length+this.sizeAlongAxis : this.sizeAlongAxis];
            child.size[this.axis] = Math.max(0, availableSize-sizeAlongAxis+child.size[this.axis]);
            child.updateSize();
            sizeAlongAxis = availableSize;
        }
        if(this.sizeAlongAxis == 'shrinkToFit')
            this.size[this.axis] = sizeAlongAxis+this.padding[this.axis]*2;
        let offset = -0.5*sizeAlongAxis;
        for(const child of this.children) {
            child.position[1-this.axis] = (this.otherAxisAlignment == 'stretch') ? 0 : (sizeOtherAxis-child.size[1-this.axis])*this.otherAxisAlignment;
            child.position[this.axis] = offset+child.size[this.axis]*0.5;
            child.updatePosition();
            if(this.otherAxisAlignment == 'stretch' && child.size[1-this.axis] != sizeOtherAxis) {
                child.size[1-this.axis] = sizeOtherAxis;
                child.updateSize();
            }
            offset += child.size[this.axis]+this.interChildSpacing;
        }
        if(this.sizeAlongAxis == 'shrinkToFit' || !this.otherAxisSizeStays)
            super.updateSize();
    }

    updateSize() {
        super.updateSize();
        if(this.sizeAlongAxis != 'shrinkToFit' || this.otherAxisSizeStays)
            this.recalculateLayout();
    }
}

export class ButtonPanel extends TilingPanel {
    constructor(position, onClick, cssClass='button', backgroundPanel=new RectPanel(vec2.create(), vec2.create())) {
        super(position, vec2.create());
        this.padding = vec2.fromValues(4, 2);
        if(onClick)
            this.registerClickOrDragEvent(onClick);
        this.backgroundPanel = backgroundPanel;
        if(cssClass)
            this.backgroundPanel.node.classList.add(cssClass);
        this.backgroundPanel.cornerRadius = (cssClass == 'toolbarMenuButton') ? 0 : 4;
    }

    insertChild(child, newIndex=-1) {
        if(child instanceof LabelPanel)
            child.node.classList.add('disabled');
        return super.insertChild(child, newIndex);
    }
}

export class OverlayMenuPanel extends ButtonPanel {
    constructor(position, onOpen, overlayPanel=new AdaptiveSizeContainerPanel(vec2.create()), cssClass='overlayMenuButton') {
        super(position, () => {
            if(this.backgroundPanel.node.classList.contains('active'))
                this.root.closeModalOverlay(this.overlayPanel);
            else {
                this.backgroundPanel.node.classList.add('active');
                if(onOpen)
                    onOpen();
                this.updateOverlayPosition();
                this.root.openModalOverlay(this.overlayPanel);
            }
        }, cssClass);
        this.overlayPanel = overlayPanel;
        this.overlayPanel.backgroundPanel = new SpeechBalloonPanel(vec2.create(), vec2.create());
        this.overlayPanel.backgroundPanel.node.classList.add('overlayMenu');
        this.overlayPanel.onClose = () => {
            this.backgroundPanel.node.classList.remove('active');
        };
    }

    updateOverlayPosition() {
        const bounds = this.node.getBoundingClientRect();
        this.overlayPanel.position = this.getRootPosition();
        this.overlayPanel.backgroundPanel.cornerRadiusTopLeft = 4;
        this.overlayPanel.backgroundPanel.cornerRadiusTopRight = 4;
        this.overlayPanel.backgroundPanel.cornerRadiusBottomLeft = 4;
        this.overlayPanel.backgroundPanel.cornerRadiusBottomRight = 4;
        const xAxisAlignment = (this.overlayPanel.position[0] < 0.0) ? 0.5 : -0.5,
              yAxisAlignment = (this.overlayPanel.position[1] < 0.0) ? 0.5 : -0.5;
        switch(this.style) {
            case 'horizontal':
                if(xAxisAlignment < 0.0) {
                    if(yAxisAlignment < 0.0)
                        this.overlayPanel.backgroundPanel.cornerRadiusBottomRight = 0;
                    else
                        this.overlayPanel.backgroundPanel.cornerRadiusTopRight = 0;
                } else {
                    if(yAxisAlignment < 0.0)
                        this.overlayPanel.backgroundPanel.cornerRadiusBottomLeft = 0;
                    else
                        this.overlayPanel.backgroundPanel.cornerRadiusTopLeft = 0;
                }
                this.overlayPanel.position[0] += (bounds.width+this.overlayPanel.size[0])*xAxisAlignment;
                this.overlayPanel.position[1] += (this.overlayPanel.size[1]-bounds.height)*yAxisAlignment;
                break;
            case 'vertical':
                if(yAxisAlignment < 0.0) {
                    if(xAxisAlignment < 0.0)
                        this.overlayPanel.backgroundPanel.cornerRadiusBottomRight = 0;
                    else
                        this.overlayPanel.backgroundPanel.cornerRadiusBottomLeft = 0;
                } else {
                    if(xAxisAlignment < 0.0)
                        this.overlayPanel.backgroundPanel.cornerRadiusTopRight = 0;
                    else
                        this.overlayPanel.backgroundPanel.cornerRadiusTopLeft = 0;
                }
                this.overlayPanel.position[1] += (bounds.height+this.overlayPanel.size[1])*yAxisAlignment;
                this.overlayPanel.position[0] += (this.overlayPanel.size[0]-bounds.width)*xAxisAlignment;
                break;
        }
        this.overlayPanel.backgroundPanel.updateSize();
        this.overlayPanel.updatePosition();
    }
}

export class DropDownMenuPanel extends OverlayMenuPanel {
    constructor(position, childPanels, cssClass) {
        super(position, undefined, new TilingPanel(vec2.create(), vec2.create()), cssClass);
        this.style = (cssClass == 'toolbarMenuButton') ? 'horizontal' : 'vertical';
        this.padding[0] = 10;
        this.overlayPanel.padding = vec2.fromValues(0, 4);
        this.overlayPanel.axis = 1;
        this.overlayPanel.otherAxisAlignment = 'stretch';
        for(const childPanel of childPanels) {
            this.overlayPanel.insertChild(childPanel);
            childPanel.padding[0] = 10;
            childPanel.recalculateLayout();
        }
        this.overlayPanel.recalculateLayout();
    }
}

export class ToolbarPanel extends TilingPanel {
    constructor(position) {
        super(position, vec2.create());
        this.axis = 0;
        this.sizeAlongAxis = -1;
        this.padding[0] = 10;
        this.shortcuts = {};
        document.addEventListener('keydown', this.dispatch.bind(this, 'keydown'));
        this.insertChild(new Panel(vec2.create(), vec2.create()));
    }

    dispatch(handler, event) {
        const node = document.querySelector('svg:hover');
        if(!node)
            return;
        if(!this[handler](node.panel, event))
            return;
        event.stopPropagation();
        event.preventDefault();
    }

    keydown(panel, event) {
        const candidate = this.shortcuts[event.keyCode];
        if(!candidate)
            return false;
        for(const key in candidate.modifiers)
            if(event[key] != candidate.modifiers[key])
                return false;
        if(candidate.action)
            candidate.action();
        return true;
    }

    generateDropDownMenu(contentPanel, childPanels) {
        const dropDownMenuPanel = new DropDownMenuPanel(vec2.create(), childPanels, 'toolbarMenuButton');
        dropDownMenuPanel.insertChild(contentPanel);
        for(const childPanel of childPanels) {
            childPanel.sizeAlongAxis = 1;
            if(childPanel.children.length < 2)
                childPanel.insertChild(new Panel(vec2.create(), vec2.create()));
            childPanel.recalculateLayout();
        }
        return dropDownMenuPanel;
    }

    generateMenuButton(contentPanel, shortCut, action) {
        const actionHandler = () => {
            this.root.closeModalOverlay();
            if(action)
                action();
        };
        const buttonPanel = new ButtonPanel(vec2.create(), actionHandler, 'toolbarMenuButton');
        buttonPanel.axis = 0;
        buttonPanel.insertChild(contentPanel);
        buttonPanel.insertChild(new Panel(vec2.create(), vec2.create()));
        if(shortCut) {
            buttonPanel.insertChild(new Panel(vec2.create(), vec2.fromValues(10, 0)));
            buttonPanel.insertChild(new LabelPanel(vec2.create(), shortCut));
            buttonPanel.shortCut = {'action': actionHandler, 'modifiers': {}};
            const codes = {
                '⇧': 'shiftKey', '⌘': 'metaKey', '⎇': 'altKey', '⌥': 'altKey', '^': 'ctrlKey', '⎈': 'ctrlKey',
                '↵': 13, '⏎': 13, '⌫': 8, '↹': 9, '␣': 32, '←': 37, '↑': 38, '→': 39, '↓': 40,
                // '↖': , '↘': , '⇞': , '⇟':
            };
            for(let i = 0; i < shortCut.length; ++i) {
                const code = codes[shortCut[i]];
                if(!code)
                    buttonPanel.shortCut.keyCode = shortCut.charCodeAt(i);
                else if(typeof code == 'number')
                    buttonPanel.shortCut.keyCode = code;
                else if(typeof code == 'string')
                    buttonPanel.shortCut.modifiers[code] = true;
            }
            this.shortcuts[buttonPanel.shortCut.keyCode] = buttonPanel.shortCut;
        }
        return buttonPanel;
    }

    addEntry(menuEntry, topLevel) {
        let content = menuEntry.content;
        if(typeof content == 'string')
            content = new LabelPanel(vec2.create(), content);
        const buttonPanel = (menuEntry.children)
            ? this.generateDropDownMenu(content, menuEntry.children.map(child => this.addEntry(child)))
            : this.generateMenuButton(content, menuEntry.shortCut, menuEntry.action);
        if(topLevel) {
            this.insertChild(buttonPanel, -2);
            buttonPanel.style = 'vertical';
            buttonPanel.recalculateLayout();
        }
        return buttonPanel;
    }

    addEntries(menuEntries) {
        for(const menuEntry of menuEntries)
            this.addEntry(menuEntry, true);
        this.recalculateLayout();
    }

    unregisterShortcuts(panel) {
        if(panel.shortCut)
            delete this.shortcuts[panel.shortCut.keyCode];
        if(panel.overlayPanel)
            for(const child of panel.overlayPanel.children)
                this.unregisterShortcuts(child);
    }

    removeChild(child) {
        if(!super.removeChild(child))
            return false;
        this.unregisterShortcuts(child);
        return true;
    }
}

export class ConfigurableSplitViewPanel extends TilingPanel {
    constructor(position, size) {
        super(position, size);
        this.sizeAlongAxis = 'shrinkToFit';
        this.otherAxisSizeStays = true;
        this.otherAxisAlignment = 'stretch';
        this.interChildSpacing = 3;
        this.enableSplitAndMerge = true;
        this.splitHandleSize = 20;
        this.mergeSizeThreshold = 10;
        this.backgroundPanel = new RectPanel(vec2.create(), vec2.create());
        this.backgroundPanel.registerPointerEvents((event) => {
            const dragOrigin = event.pointers[0].position,
                  position = dragOrigin[this.axis];
            let index = 0;
            while(index < this.children.length && this.children[index].position[this.axis] < position)
                ++index;
            const sizeOtherAxis = (this.size[1-this.axis]-this.padding[this.axis])*0.5,
                  insertAfter = dragOrigin[1-this.axis] < this.splitHandleSize-sizeOtherAxis,
                  insertBefore = dragOrigin[1-this.axis] > sizeOtherAxis-this.splitHandleSize;
            if(this.enableSplitAndMerge && (insertAfter || insertBefore)) {
                if((insertBefore && index == 0) || (insertAfter && index == this.children.length))
                    return [];
                const childToSplit = this.children[(insertBefore) ? index-1 : index];
                childToSplit.size[this.axis] -= this.interChildSpacing;
                childToSplit.updateSize();
                const childToInsert = new PanePanel(vec2.create(), vec2.create());
                childToInsert.relativeSize = 0.0;
                this.insertChild(childToInsert, index++);
                this.normalizeRelativeSizes();
                this.recalculateLayout();
                if(insertBefore)
                    --index;
            }
            if(index <= 0 || index >= this.children.length)
                return [];
            const prevChild = this.children[index-1],
                  nextChild = this.children[index],
                  prevChildOriginalPosition = prevChild.position[this.axis],
                  nextChildOriginalPosition = nextChild.position[this.axis],
                  prevChildOriginalSize = prevChild.size[this.axis],
                  nextChildOriginalSize = nextChild.size[this.axis],
                  absoluteSizeSum = prevChildOriginalSize+nextChildOriginalSize,
                  relativeSizeSum = prevChild.relativeSize+nextChild.relativeSize;
            return [(event, moved) => {
                const diff = Math.max(-prevChildOriginalSize, Math.min(nextChildOriginalSize, event.pointers[0].position[this.axis]-dragOrigin[this.axis]));
                prevChild.position[this.axis] = prevChildOriginalPosition+diff*0.5;
                prevChild.updatePosition();
                nextChild.position[this.axis] = nextChildOriginalPosition+diff*0.5;
                nextChild.updatePosition();
                prevChild.size[this.axis] = prevChildOriginalSize+diff;
                prevChild.updateSize();
                nextChild.size[this.axis] = nextChildOriginalSize-diff;
                nextChild.updateSize();
                prevChild.relativeSize = relativeSizeSum*prevChild.size[this.axis]/absoluteSizeSum;
                nextChild.relativeSize = relativeSizeSum-prevChild.relativeSize;
            }, (event, moved) => {
                const smallerChild = (prevChild.relativeSize < nextChild.relativeSize) ? prevChild : nextChild;
                if(this.enableSplitAndMerge && moved && smallerChild.size[this.axis] < this.mergeSizeThreshold) {
                    const otherChild = (smallerChild == nextChild) ? prevChild : nextChild;
                    otherChild.size[this.axis] += smallerChild.size[this.axis]+this.interChildSpacing;
                    otherChild.updateSize();
                    otherChild.position[this.axis] += (smallerChild.size[this.axis]+this.interChildSpacing)*(smallerChild == nextChild ? 0.5 : -0.5);
                    otherChild.updatePosition();
                    this.removeChild(smallerChild);
                    if(this.children.length == 1) {
                        const child = this.children[0],
                              parent = this.parent,
                              index = parent.children.indexOf(this);
                        super.removeChild(child);
                        parent.insertChild(child, index);
                        parent.removeChild(this);
                        parent.recalculateLayout();
                    }
                }
            }];
        }, undefined, this.backgroundPanel.node);
    }

    recalculateLayout() {
        if(this.axis == 0) {
            this.backgroundPanel.node.classList.add('horizontalResizingHandle');
            this.backgroundPanel.node.classList.remove('verticalResizingHandle');
        } else {
            this.backgroundPanel.node.classList.add('verticalResizingHandle');
            this.backgroundPanel.node.classList.remove('horizontalResizingHandle');
        }
        const childSizeSum = this.size[this.axis]-(this.children.length-1)*this.interChildSpacing-this.padding[this.axis]*2;
        for(let i = 0; i < this.children.length; ++i) {
            const child = this.children[i],
                  childSize = childSizeSum*this.children[i].relativeSize;
            if(child.size[this.axis] != childSize) {
                child.size[this.axis] = childSize;
                child.updateSize();
            }
        }
        super.recalculateLayout();
    }

    updateSize() {
        this.recalculateLayout();
    }

    normalizeRelativeSizes() {
        let childSizeSum = 0;
        for(const child of this.children)
            childSizeSum += child.size[this.axis];
        for(const child of this.children)
            child.relativeSize = child.size[this.axis]/childSizeSum;
    }

    removeChild(child) {
        if(!super.removeChild(child))
            return false;
        this.normalizeRelativeSizes();
        return true;
    }
}

export class RadioButtonsPanel extends TilingPanel {
    constructor(position, size, onChange) {
        super(position, size);
        this.onChange = onChange;
    }

    insertChild(child, newIndex=-1) {
        if(!child.node.onmousedown && !child.node.ontouchstart)
            child.registerClickOrDragEvent(() => {
                this.activeButton = child;
                if(this.onChange)
                    this.onChange();
            });
        return super.insertChild(child, newIndex);
    }

    removeChild(child) {
        if(child == this._activeButton) {
            this.activeButton = undefined;
            if(this.onChange)
                this.onChange();
        }
        return super.removeChild(child);
    }

    get activeButton() {
        return this._activeButton;
    }

    set activeButton(button) {
        if(this._activeButton)
            this._activeButton.backgroundPanel.node.classList.remove('active');
        this._activeButton = button;
        if(this._activeButton)
            this._activeButton.backgroundPanel.node.classList.add('active');
    }
}

export class TabsViewPanel extends TilingPanel {
    constructor(position, size) {
        super(position, size);
        this.axis = 1;
        this.sizeAlongAxis = -1;
        this.otherAxisSizeStays = true;
        this.otherAxisAlignment = 'stretch';
        this.enableTabDragging = false;
        this.header = new ClippingViewPanel(vec2.create(), vec2.create());
        this.insertChild(this.header);
        this.header.backgroundPanel.registerClickOrDragEvent(() => {
            if(!this.tabsContainer.activeButton)
                return;
            this.tabsContainer.activeButton = undefined;
            if(this.tabsContainer.onChange)
                this.tabsContainer.onChange();
        });
        this.tabsContainer = new RadioButtonsPanel(vec2.create(), vec2.create());
        this.header.insertChild(this.tabsContainer);
        this.tabsContainer.axis = 1-this.axis;
        this.tabsContainer.interChildSpacing = 4;
        this.tabsContainer.onChange = () => {
            if(this.content)
                this.body.removeChild(this.content);
            this.content = (this.tabsContainer.activeButton) ? this.tabsContainer.activeButton.content : undefined;
            if(this.content)
                this.body.insertChild(this.content);
            this.body.updateSize();
        };
        this.onCanDrop = (item) => {
            return this.enableTabDragging && item instanceof ButtonPanel && item.backgroundPanel.node.classList.contains('tabHandle');
        };
        this.onDrop = (tabHandle) => {
            let index = 0;
            const containerPosition = this.tabsContainer.getRootPosition();
            vec2.sub(containerPosition, tabHandle.position, containerPosition);
            while(index < this.tabsContainer.children.length && this.tabsContainer.children[index].position[this.tabsContainer.axis] < containerPosition[this.tabsContainer.axis])
                ++index;
            this.tabsContainer.insertChild(tabHandle, index);
            this.tabsContainer.recalculateLayout();
            this.setActiveTab(tabHandle);
        };
        this.body = new PanePanel(vec2.create(), vec2.create());
        this.insertChild(this.body);
    }

    recalculateLayout() {
        if(this.tabsContainer.axis != 1-this.axis) {
            this.tabsContainer.axis = 1-this.axis;
            this.tabsContainer.recalculateLayout();
            for(const tabHandle of this.tabsContainer.children) {
                this.updateTabHandleCorners(tabHandle);
                tabHandle.backgroundPanel.updateSize();
            }
        }
        this.header.size[this.axis] = Math.min(this.tabsContainer.size[this.axis], this.size[this.axis]);
        this.header.updateSize();
        super.recalculateLayout();
    }

    updateTabHandleCorners(tabHandle) {
        tabHandle.backgroundPanel.cornerRadiusTopLeft = tabHandle.backgroundPanel.cornerRadius;
        if(this.tabsContainer.axis == 0) {
            tabHandle.backgroundPanel.cornerRadiusTopRight = tabHandle.backgroundPanel.cornerRadius;
            tabHandle.backgroundPanel.cornerRadiusBottomLeft = 0;
        } else {
            tabHandle.backgroundPanel.cornerRadiusTopRight = 0;
            tabHandle.backgroundPanel.cornerRadiusBottomLeft = tabHandle.backgroundPanel.cornerRadius;
        }
        tabHandle.backgroundPanel.cornerRadiusBottomRight = 0;
    }

    setActiveTab(tabHandle) {
        this.tabsContainer.activeButton = tabHandle;
        if(this.tabsContainer.onChange)
            this.tabsContainer.onChange();
    }

    addTab() {
        const tabHandle = new ButtonPanel(vec2.create(), undefined, 'tabHandle', new SpeechBalloonPanel(vec2.create(), vec2.create()));
        this.tabsContainer.insertChild(tabHandle);
        this.updateTabHandleCorners(tabHandle);
        tabHandle.padding = vec2.fromValues(11, 3);
        tabHandle.registerClickOrDragEvent(this.setActiveTab.bind(this, tabHandle), () => {
            if(!this.enableTabDragging)
                return;
            this.removeTab(tabHandle);
            return tabHandle;
        });
        return tabHandle;
    }

    removeTab(tabHandle) {
        if(!this.tabsContainer.removeChild(tabHandle))
            return false;
        this.tabsContainer.recalculateLayout();
        return true;
    }
}

export class InfiniteViewPanel extends ClippingViewPanel {
    constructor(position, size) {
        super(position, size);
        this.content = new AdaptiveSizeContainerPanel(vec2.create());
        this.insertChild(this.content);
        this.contentTransform = mat2d.create();
        this.inverseContentTransform = mat2d.create();
        this.velocity = vec2.create();
        this.damping = 0.9;
        this.enableSelectionRect = false;
        this.minScale = 1.0;
        this.maxScale = 1.0;
        this.registerPointerEvents((event) => {
            if(event.modifierKey && this.enableSelectionRect) {
                const dragOrigin = event.pointers[0].position;
                return [(event, moved) => {
                    if(!this.selectionRect) {
                        this.selectionRect = new RectPanel(vec2.create(), vec2.create());
                        this.insertChildAnimated(this.selectionRect);
                        this.selectionRect.node.classList.add('selectionRect');
                    }
                    this.selectionRect.setBounds(dragOrigin, event.pointers[0].position);
                    this.selectionRect.updatePosition();
                    this.selectionRect.updateSize();
                }, (event, moved) => {
                    if(!moved)
                        return;
                    const bounds = this.selectionRect.getBounds();
                    vec2.transformMat2d(bounds[0], bounds[0], this.inverseContentTransform);
                    vec2.transformMat2d(bounds[1], bounds[1], this.inverseContentTransform);
                    this.content.selectChildrenInside(bounds[0], bounds[1], event.modifierKey);
                    this.removeChildAnimated(this.selectionRect);
                    delete this.selectionRect;
                }];
            } else {
                const dragOrigin = event.pointers[0].position,
                      originalTranslation = this.contentTranslation;
                let translation = vec2.clone(originalTranslation),
                    prevTranslation = translation,
                    prevTimestamp = performance.now();
                return [(event, moved) => {
                    if(!moved)
                        this.startedMoving();
                    vec2.sub(translation, event.pointers[0].position, dragOrigin);
                    vec2.add(translation, translation, originalTranslation);
                    this.setContentTransformation(translation, this.contentScale);
                    translation = this.contentTranslation;
                    const timestamp = performance.now();
                    vec2.sub(this.velocity, translation, prevTranslation);
                    vec2.scale(this.velocity, this.velocity, 1.0/(timestamp-prevTimestamp));
                    vec2.copy(prevTranslation, translation);
                    prevTimestamp = timestamp;
                }, (event, moved) => {
                    if(moved)
                        this.stoppedMoving();
                    else
                        this.setAllChildrenSelected(false);
                }];
            }
        }, (factor, position) => {
            let scale = this.contentScale;
            factor = Math.min(Math.max(factor*scale, this.minScale), this.maxScale)/scale;
            if(factor == 1.0)
                return;
            scale *= factor;
            const translation = this.contentTranslation;
            vec2.sub(translation, translation, position);
            vec2.scale(translation, translation, factor);
            vec2.add(translation, translation, position);
            this.setContentTransformation(translation, scale);
        }, this.backgroundPanel.node);
    }

    startedMoving() {}
    stoppedMoving() {}

    get contentTranslation() {
        return vec2.fromValues(this.contentTransform[4], this.contentTransform[5]);
    }

    get contentScale() {
        return this.contentTransform[0];
    }

    setContentTransformation(translation, scale) {
        mat2d.set(this.contentTransform, scale, 0.0, 0.0, scale, translation[0], translation[1]);
        mat2d.invert(this.inverseContentTransform, this.contentTransform);
        this.content.node.setAttribute('transform', 'translate('+translation[0]+', '+translation[1]+') scale('+scale+')');
    }
}

export class ScrollViewPanel extends InfiniteViewPanel {
    constructor(position, size) {
        super(position, size);
        this.scrollBarWidth = 5;
        this.scrollBars = [];
        for(let i = 0; i < 2; ++i) {
            const scrollBar = new RectPanel(vec2.create(), vec2.create());
            this.scrollBars.push(scrollBar);
            scrollBar.showIf = 'overflow'; // always, overflow, moving, never
            scrollBar.node.classList.add('scrollBar');
            scrollBar.registerPointerEvents((event) => {
                const dragOrigin = event.pointers[0].position,
                      originalPosition = scrollBar.position[i],
                      translation = this.contentTranslation;
                return [(event, moved) => {
                    const position = originalPosition+event.pointers[0].position[i]-dragOrigin[i];
                    translation[i] = 0.5*this.scrollBarWidth-position/scrollBar.maxLength*this.content.size[i]*this.contentScale;
                    this.setContentTransformation(translation, this.contentScale);
                }];
            });
        }
    }

    startedMoving() {
        for(let i = 0; i < 2; ++i)
            if(this.scrollBars[i].showIf == 'moving' && this.scrollBars[i].size[i] < this.scrollBars[i].maxLength)
                this.insertChildAnimated(this.scrollBars[i]);
    }

    stoppedMoving() {
        for(let i = 0; i < 2; ++i)
            if(this.scrollBars[i].showIf == 'moving')
                this.removeChildAnimated(this.scrollBars[i]);
    }

    setContentTransformation(translation, scale) {
        for(let i = 0; i < 2; ++i) {
            const contentSize = this.content.size[i]*scale,
                  contentSizeFactor = (contentSize == 0.0) ? 1.0 : 1.0/contentSize,
                  maxTranslation = Math.max(0.0, 0.5*(contentSize-this.size[i]));
            translation[i] = Math.max(-maxTranslation, Math.min(translation[i], maxTranslation));
            this.scrollBars[i].maxLength = this.size[i]-this.scrollBarWidth*2.0;
            this.scrollBars[i].position[i] = -0.5*this.scrollBarWidth-this.scrollBars[i].maxLength*translation[i]*contentSizeFactor;
            this.scrollBars[i].position[1-i] = 0.5*this.size[1-i]-this.scrollBarWidth;
            this.scrollBars[i].updatePosition();
            this.scrollBars[i].cornerRadius = this.scrollBarWidth*0.5;
            this.scrollBars[i].size[i] = this.scrollBars[i].maxLength*Math.min(1.0, this.size[i]*contentSizeFactor);
            this.scrollBars[i].size[1-i] = this.scrollBarWidth;
            this.scrollBars[i].updateSize();
            if(this.scrollBars[i].showIf == 'always' || (this.scrollBars[i].showIf == 'overflow' && this.scrollBars[i].size[i] < this.scrollBars[i].maxLength))
                this.insertChildAnimated(this.scrollBars[i]);
            else if(this.scrollBars[i].showIf != 'moving')
                this.removeChildAnimated(this.scrollBars[i]);
        }
        super.setContentTransformation(translation, scale);
    }

    recalculateLayout() {
        this.setContentTransformation(this.contentTranslation, this.contentScale);
    }

    updateSize() {
        super.updateSize();
        this.recalculateLayout();
    }
}

export class SliderPanel extends ContainerPanel {
    constructor(position, size, onChange) {
        super(position, size);
        this.backgroundPanel = new RectPanel(vec2.create(), size);
        this.barPanel = new RectPanel(vec2.create(), vec2.create());
        this.insertChild(this.barPanel);
        this.barPanel.node.classList.add('sliderBar');
        this.labelPanel = new LabelPanel(vec2.create());
        this.insertChild(this.labelPanel);
        this.textFieldPanel = new TextFieldPanel(vec2.create(), size);
        this.textFieldPanel.embeddedNode.onchange = this.textFieldPanel.embeddedNode.onblur = () => {
            this.value = parseFloat(this.textFieldPanel.text);
            this.removeChild(this.textFieldPanel);
            this.recalculateLayout();
            if(onChange)
                onChange();
        };
        this.minValue = 0.0;
        this.maxValue = 1.0;
        this.value = 0.5;
        this.fixedPointDigits = 2;
        this.node.classList.add('slider');
        this.registerPointerEvents((event) => {
            const dragOrigin = event.pointers[0].position[0],
                  originalValue = this.value;
            return [(event, moved) => {
                this.value = originalValue+(event.pointers[0].position[0]-dragOrigin)*(this.maxValue-this.minValue)/this.size[0];
                this.recalculateLayout();
            }, (event, moved) => {
                if(moved) {
                    if(onChange)
                        onChange();
                    return;
                }
                this.insertChild(this.textFieldPanel);
                this.textFieldPanel.text = this.labelPanel.text;
                this.textFieldPanel.embeddedNode.focus();
            }];
        });
    }

    recalculateLayout() {
        this.value = Math.max(this.minValue, Math.min(this.value, this.maxValue));
        this.barPanel.size[0] = (this.value-this.minValue)/(this.maxValue-this.minValue)*this.size[0];
        this.barPanel.size[1] = this.size[1];
        this.barPanel.updateSize();
        this.barPanel.position[0] = 0.5*(this.barPanel.size[0]-this.size[0]);
        this.barPanel.updatePosition();
        this.labelPanel.text = this.value.toFixed(this.fixedPointDigits);
    }

    updateSize() {
        super.updateSize();
        this.textFieldPanel.updateSize();
        this.recalculateLayout();
    }
}
