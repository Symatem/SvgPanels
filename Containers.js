import { vec2, mat2d } from './gl-matrix.js';
import { Panel } from './Panel.js';
import { LabelPanel, RectPanel, SpeechBalloonPanel, TabHandlePanel, TextFieldPanel } from './Atoms.js';

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

    appendChild(child) {
        if(child.parent)
            return false;
        this.node.appendChild(child.node);
        child.parent = this;
        child.root = this.root;
        this.children.push(child);
        return true;
    }

    removeChild(child) {
        if(child.parent != this)
            return false;
        delete child.parent;
        child.root = undefined;
        this.children.splice(this.children.indexOf(child), 1);
        this.node.removeChild(child.node);
        this.recalculateLayout();
        return true;
    }

    appendChildAnimated(child) {
        if(!this.appendChild(child))
            return false;
        child.animateVisibilityTo(true);
        return true;
    }

    removeChildAnimated(child) {
        if(child.parent != this)
            return false;
        child.animateVisibilityTo(false);
        window.setTimeout(this.removeChild.bind(this, child), 250);
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
        this.content = new ContainerPanel(vec2.create(), vec2.create());
        this.appendChild(this.content);
        this.overlays = new ContainerPanel(vec2.create(), vec2.create());
        this.appendChild(this.overlays);
        this.overlayPane = Panel.createElement('rect', this.overlays.node);
        this.overlayPane.setAttribute('width', '100%');
        this.overlayPane.setAttribute('height', '100%');
        this.overlayPane.style.visibility = 'hidden';
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
        this.updateSize();
    }

    recalculateLayout() {}

    updateSize() {
        this.node.setAttribute('width', this.size[0]);
        this.node.setAttribute('height', this.size[1]);
    }

    openOverlay(overlay, onClose) {
        this.root.overlayPane.style.visibility = '';
        this.root.overlayPane.onclick = (event) => {
            event.stopPropagation();
            event.preventDefault();
            this.closeAllOverlays();
            if(onClose)
                onClose();
        };
        this.root.overlays.appendChild(overlay);
    }

    closeAllOverlays() {
        this.root.overlayPane.style.visibility = 'hidden';
        for(const child of this.root.overlays.children)
            this.root.overlays.removeChild(child);
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

export class ButtonPanel extends AdaptiveSizeContainerPanel {
    constructor(position, onClick, cssClass='button', backgroundPanel=new RectPanel(vec2.create(), vec2.create())) {
        super(position);
        this.padding = vec2.fromValues(4, 2);
        if(onClick)
            this.registerClickEvent(onClick);
        this.backgroundPanel = backgroundPanel;
        if(cssClass)
            this.backgroundPanel.node.classList.add(cssClass);
        this.backgroundPanel.cornerRadius = 4;
    }
}

export class CheckboxPanel extends ContainerPanel {
    constructor(position, onChange) {
        super(position, vec2.fromValues(12, 12));
        this.node.classList.add('checkbox');
        this.rectPanel = new RectPanel(vec2.create(), this.size);
        this.appendChild(this.rectPanel);
        this.rectPanel.cornerRadius = 2;
        this.registerClickEvent(() => {
            this.checked = !this.checked;
            if(onChange)
                onChange();
        });
        this.labelPanel = new LabelPanel(vec2.create());
        this.labelPanel.text = '✔';
        this.appendChild(this.labelPanel);
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
}

export class TilingPanel extends ContainerPanel {
    constructor(position, size) {
        super(position, size);
        this.axis = 0;
        this.sizeAlongAxis = 'adaptive'; // adaptive, strechFirstChild, strechLastChild, alignFront, alignCenter, alignBack
        this.sizeOtherAxis = 'adaptive'; // adaptive, strechChildren, fixed
        this.alignOtherAxis = 0;
        this.padding = vec2.create();
    }

    recalculateLayout() {
        let offset, max = 0, totalSize = 0;
        for(let i = 0; i < this.children.length; ++i) {
            const child = this.children[i];
            totalSize += child.size[this.axis];
            max = Math.max(max, child.size[1-this.axis]);
        }
        if(this.sizeOtherAxis != 'adaptive')
            max = this.size[1-this.axis];
        if(this.sizeAlongAxis == 'strechFirstChild' || this.sizeAlongAxis == 'strechLastChild') {
            const child = this.children[(this.sizeAlongAxis == 'strechFirstChild') ? 0 : this.children.length-1];
            child.size[this.axis] = Math.max(0, this.size[this.axis]-totalSize+child.size[this.axis]);
            child.updateSize();
            totalSize = this.size[this.axis];
        }
        if(this.sizeAlongAxis == 'alignFront')
            offset = -this.size[this.axis]*0.5;
        else if(this.sizeAlongAxis == 'alignBack')
            offset = this.size[this.axis]*0.5-totalSize;
        else
            offset = -0.5*totalSize;
        for(const child of this.children) {
            child.position[1-this.axis] = (max-child.size[1-this.axis])*this.alignOtherAxis;
            child.position[this.axis] = offset+child.size[this.axis]*0.5;
            child.updatePosition();
            if(this.sizeOtherAxis == 'strechChildren' && child.size[1-this.axis] != max) {
                child.size[1-this.axis] = max;
                child.updateSize();
            }
            offset += child.size[this.axis];
        }
        if(this.sizeAlongAxis == 'adaptive')
            this.size[this.axis] = totalSize;
        if(this.sizeOtherAxis == 'adaptive')
            this.size[1-this.axis] = max;
        if(this.sizeAlongAxis == 'adaptive' || this.sizeOtherAxis == 'adaptive') {
            vec2.scaleAndAdd(this.size, this.size, this.padding, 2.0);
            super.updateSize();
        }
    }

    updateSize() {
        super.updateSize();
        this.recalculateLayout();
    }
}

export class ConfigurableSplitViewPanel extends TilingPanel {
    constructor(position, size) {
        super(position, size);
        this.sizeAlongAxis = 'adaptive';
        this.sizeOtherAxis = 'strechChildren';
        this.separatorSize = 3;
        this.relativeSizesOfChildren = [];
    }

    sizeWithoutSeparators() {
        return this.size[this.axis]-(this.relativeSizesOfChildren.length-1)*this.separatorSize;
    }

    recalculateLayout() {
        const childSizeSum = this.sizeWithoutSeparators();
        for(let i = 0; i < this.relativeSizesOfChildren.length; ++i) {
            const childSize = childSizeSum*this.relativeSizesOfChildren[i],
                  child = this.children[i*2],
                  separator = this.children[i*2+1];
            if(child.size[this.axis] != childSize) {
                child.size[this.axis] = childSize;
                child.updateSize();
            }
            if(separator) {
                if(separator.size[this.axis] != this.separatorSize) {
                    separator.size[this.axis] = this.separatorSize;
                    separator.updateSize();
                }
                if(this.axis == 0) {
                    separator.node.classList.add('horizontalResizingHandle');
                    separator.node.classList.remove('verticalResizingHandle');
                } else {
                    separator.node.classList.add('verticalResizingHandle');
                    separator.node.classList.remove('horizontalResizingHandle');
                }
            }
        }
        super.recalculateLayout();
    }

    updateSize() {
        this.recalculateLayout();
    }

    appendChild(child, relativeSize) {
        if(child.parent)
            return false;
        for(let i = 0; i < this.relativeSizesOfChildren.length; ++i)
            this.relativeSizesOfChildren[i] *= 1-relativeSize;
        this.relativeSizesOfChildren.push(relativeSize);
        if(this.children.length > 0) {
            const separator = new RectPanel(vec2.create(), vec2.create());
            separator.size[this.axis] = this.separatorSize;
            super.appendChild(separator);
            separator.registerPointerEvents((event) => {
                const dragOrigin = event.pointers[0].position,
                      index = this.children.indexOf(separator),
                      prevChild = this.children[index-1],
                      nextChild = this.children[index+1],
                      separatorOriginalPosition = separator.position[this.axis],
                      prevChildOriginalPosition = prevChild.position[this.axis],
                      nextChildOriginalPosition = nextChild.position[this.axis],
                      prevChildOriginalSize = prevChild.size[this.axis],
                      nextChildOriginalSize = nextChild.size[this.axis],
                      absoluteSizeSum = prevChildOriginalSize+nextChildOriginalSize,
                      relativeSizeSum = this.relativeSizesOfChildren[(index-1)/2]+this.relativeSizesOfChildren[(index+1)/2];
                return [(event, moved) => {
                    const diff = Math.max(-prevChildOriginalSize, Math.min(nextChildOriginalSize, event.pointers[0].position[this.axis]-dragOrigin[this.axis]));
                    separator.position[this.axis] = separatorOriginalPosition+diff;
                    separator.updatePosition();
                    prevChild.position[this.axis] = prevChildOriginalPosition+diff*0.5;
                    prevChild.updatePosition();
                    nextChild.position[this.axis] = nextChildOriginalPosition+diff*0.5;
                    nextChild.updatePosition();
                    prevChild.size[this.axis] = prevChildOriginalSize+diff;
                    prevChild.updateSize();
                    nextChild.size[this.axis] = nextChildOriginalSize-diff;
                    nextChild.updateSize();
                    this.relativeSizesOfChildren[(index-1)/2] = relativeSizeSum*prevChild.size[this.axis]/absoluteSizeSum;
                    this.relativeSizesOfChildren[(index+1)/2] = relativeSizeSum-this.relativeSizesOfChildren[(index-1)/2];
                }];
            });
        }
        super.appendChild(child);
        return true;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if(!super.removeChild(child))
            return false;
        this.relativeSizesOfChildren.splice(index/2, 1);
        if(index < this.children.length)
            super.removeChild(this.children[index]);
        return true;
    }
}

export class RadioButtonsPanel extends TilingPanel {
    constructor(position, size, onChange) {
        super(position, size);
        this.onChange = onChange;
    }

    appendChild(child) {
        child.registerClickEvent(() => {
            this.activeButton = child;
            if(this.onChange)
                this.onChange();
        });
        return super.appendChild(child);
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
    constructor(position, size, body=new PanePanel(vec2.create(), vec2.create())) {
        super(position, size);
        this.axis = 1;
        this.sizeAlongAxis = 'strechLastChild';
        this.sizeOtherAxis = 'strechChildren';
        this.header = new ClippingViewPanel(vec2.create(), vec2.create());
        super.appendChild(this.header);
        this.header.backgroundPanel.registerClickEvent(() => {
            if(!this.tabsContainer.activeButton)
                return;
            this.tabsContainer.activeButton = undefined;
            if(this.tabsContainer.onChange)
                this.tabsContainer.onChange();
        });
        this.tabsContainer = new RadioButtonsPanel(vec2.create(), vec2.create());
        this.header.appendChild(this.tabsContainer);
        this.tabsContainer.axis = 0;
        this.body = body;
        super.appendChild(this.body);
    }

    recalculateLayout() {
        this.header.size[1] = Math.min(this.tabsContainer.size[1], this.size[1]);
        super.recalculateLayout();
    }

    addTab() {
        const tabHandle = new ButtonPanel(vec2.create(), undefined, undefined, new TabHandlePanel(vec2.create(), vec2.create()));
        tabHandle.padding = vec2.fromValues(11, 3);
        this.tabsContainer.appendChild(tabHandle);
        return tabHandle;
    }

    removeTab(tabHandle) {
        if(!this.tabsContainer.removeChild(tabHandle))
            return false;
        this.tabsContainer.recalculateLayout();
        return true;
    }
}
