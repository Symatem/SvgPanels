import { vec2, mat2d } from './gl-matrix.js';
import { Panel } from './Panel.js';
import { LabelPanel, RectPanel, SpeechBalloonPanel, TextFieldPanel } from './Atoms.js';

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

    reorderChild(child, newIndex) {
        const index = this.children.indexOf(child);
        if(!child || child.parent != this || index == -1 || index == newIndex || newIndex < 0 || newIndex >= this.children.length)
            return false;
        this.children.splice(index, 1);
        this.children.splice(newIndex, 0, child);
        if(newIndex == this.node.childNodes.length-1)
            this.node.appendChild(child.node);
        else
            this.node.insertBefore(child.node, this.node.childNodes[(newIndex == index+1) ? newIndex+1 : newIndex]);
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
        this.node.setAttribute('width', '100%');
        this.node.setAttribute('height', '100%');
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
    }

    recalculateLayout() {
        this.size[0] = this.node.clientWidth;
        this.size[1] = this.node.clientHeight;
        vec2.scale(this.content.position, this.size, 0.5);
        this.content.updatePosition();
    }

    updateSize() {
        this.node.setAttribute('width', this.size[0]);
        this.node.setAttribute('height', this.size[1]);
    }

    openModalOverlay(overlay, onClose) {
        this.root.overlayPane.style.visibility = '';
        this.root.overlayPane.onclick = (event) => {
            event.stopPropagation();
            event.preventDefault();
            this.closeModalOverlay();
            if(onClose)
                onClose();
        };
        this.root.overlays.appendChild(overlay);
    }

    closeModalOverlay() {
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

export class PopupMenuPanel extends ButtonPanel {
    constructor(position, onOpen, cssClass='popupMenuButton') {
        super(position, () => {
            this.root.openModalOverlay(this.overlayPanel, () => {
                this.backgroundPanel.node.classList.remove('active');
            });
            this.backgroundPanel.node.classList.add('active');
            onOpen();
            this.overlayPanel.recalculateLayout();
            this.updateOverlayPosition();
        }, cssClass);
        this.overlayPanel = new AdaptiveSizeContainerPanel(vec2.create());
        this.overlayPanel.backgroundPanel = new SpeechBalloonPanel(vec2.create(), vec2.create());
        this.overlayPanel.backgroundPanel.node.classList.add('popupOverlay');
        if(cssClass == 'toolbarMenuButton') {
            this.backgroundPanel.cornerRadius = 0;
            this.style = 'vertical';
        }
    }

    updateOverlayPosition() {
        const bounds = this.node.getBoundingClientRect();
        this.overlayPanel.position = this.getRootPosition();
        this.overlayPanel.backgroundPanel.cornerRadiusTopLeft = 4;
        this.overlayPanel.backgroundPanel.cornerRadiusTopRight = 4;
        this.overlayPanel.backgroundPanel.cornerRadiusBottomLeft = 4;
        this.overlayPanel.backgroundPanel.cornerRadiusBottomRight = 4;
        const xAxisAlignment = (this.overlayPanel.position[0] < this.root.size[0]*0.5) ? 0.5 : -0.5,
              yAxisAlignment = (this.overlayPanel.position[1] < this.root.size[1]*0.5) ? 0.5 : -0.5;
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

    updatePosition() {
        super.updatePosition();
        this.updateOverlayPosition();
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
        this.sizeAlongAxis = 'shrinkToFit'; // shrinkToFit, alignFront, alignCenter, alignBack, number (index of child to be stretched, negative values count from end)
        this.otherAxisSizeStays = false;
        this.otherAxisAlignment = 0.0; // -0.5, 0.0, 0.5, stretch
        this.interElementSpacing = 0;
        this.padding = vec2.create();
    }

    recalculateLayout() {
        let offset, max = 0, totalSize = 0;
        for(let i = 0; i < this.children.length; ++i) {
            const child = this.children[i];
            totalSize += child.size[this.axis];
            max = Math.max(max, child.size[1-this.axis]);
        }
        if(this.children.length > 0)
            totalSize += this.interElementSpacing*(this.children.length-1);
        if(this.otherAxisSizeStays)
            max = this.size[1-this.axis];
        if(typeof this.sizeAlongAxis == 'number') {
            const child = this.children[(this.sizeAlongAxis < 0) ? this.children.length+this.sizeAlongAxis : this.sizeAlongAxis];
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
            child.position[1-this.axis] = (this.otherAxisAlignment == 'stretch') ? 0 : (max-child.size[1-this.axis])*this.otherAxisAlignment;
            child.position[this.axis] = offset+child.size[this.axis]*0.5;
            child.updatePosition();
            if(this.otherAxisAlignment == 'stretch' && child.size[1-this.axis] != max) {
                child.size[1-this.axis] = max;
                child.updateSize();
            }
            offset += child.size[this.axis]+this.interElementSpacing;
        }
        if(this.sizeAlongAxis == 'shrinkToFit')
            this.size[this.axis] = totalSize;
        if(!this.otherAxisSizeStays)
            this.size[1-this.axis] = max;
        if(this.sizeAlongAxis == 'shrinkToFit' || !this.otherAxisSizeStays) {
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
        this.sizeAlongAxis = 'shrinkToFit';
        this.otherAxisSizeStays = true;
        this.otherAxisAlignment = 'stretch';
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
        if(!child.node.onmousedown)
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
    constructor(position, size) {
        super(position, size);
        this.axis = 1;
        this.sizeAlongAxis = -1;
        this.otherAxisSizeStays = true;
        this.otherAxisAlignment = 'stretch';
        this.enableTabDragging = false;
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
        this.tabsContainer.axis = 1-this.axis;
        this.tabsContainer.interElementSpacing = 4;
        this.tabsContainer.onChange = () => {
            if(this.content)
                this.body.removeChild(this.content);
            this.content = (this.tabsContainer.activeButton) ? this.tabsContainer.activeButton.content : undefined;
            if(this.content)
                this.body.appendChild(this.content);
            this.body.recalculateLayout();
        };
        this.body = new PanePanel(vec2.create(), vec2.create());
        this.appendChild(this.body);
    }

    recalculateLayout() {
        if(this.tabsContainer.axis != 1-this.axis) {
            this.tabsContainer.axis = 1-this.axis;
            this.tabsContainer.recalculateLayout();
            for(const tabHandle of this.tabsContainer.children) {
                this.updateTabHanldeCorners(tabHandle);
                tabHandle.backgroundPanel.updateSize();
            }
        }
        this.header.size[this.axis] = Math.min(this.tabsContainer.size[this.axis], this.size[this.axis]);
        this.header.updateSize();
        super.recalculateLayout();
    }

    updateTabHanldeCorners(tabHandle) {
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

    addTab() {
        const tabHandle = new ButtonPanel(vec2.create(), undefined, 'tabHandle', new SpeechBalloonPanel(vec2.create(), vec2.create()));
        this.tabsContainer.appendChild(tabHandle);
        this.updateTabHanldeCorners(tabHandle);
        tabHandle.padding = vec2.fromValues(11, 3);
        tabHandle.registerPointerEvents((event) => {
            const position = tabHandle.getRootPosition();
            vec2.sub(position, position, event.pointers[0].position);
            return [(event, moved) => {
                if(!this.enableTabDragging)
                    return;
                if(!moved) {
                    tabHandle.node.classList.add('disabled');
                    this.tabsContainer.removeChild(tabHandle);
                    this.root.overlays.appendChild(tabHandle);
                }
                vec2.add(tabHandle.position, position, event.pointers[0].position);
                tabHandle.updatePosition();
            }, (event, moved) => {
                let tabsViewPanel = this;
                if(this.enableTabDragging && moved) {
                    const node = document.elementFromPoint(event.clientX, event.clientY),
                          position = this.tabsContainer.getRootPosition();
                    vec2.sub(position, tabHandle.position, position);
                    this.root.overlays.removeChild(tabHandle);
                    tabsViewPanel = (node) ? node.panel : undefined;
                    tabsViewPanel = tabsViewPanel.getNthParent(2);
                    tabsViewPanel = (tabsViewPanel.getNthParent(2) instanceof TabsViewPanel) ? tabsViewPanel.getNthParent(2) : tabsViewPanel;
                    if(!(tabsViewPanel instanceof TabsViewPanel) || !tabsViewPanel.enableTabDragging)
                        return;
                    let index = 0;
                    while(index < tabsViewPanel.tabsContainer.children.length && tabsViewPanel.tabsContainer.children[index].position[this.tabsContainer.axis] < position[this.tabsContainer.axis])
                        ++index;
                    tabHandle.node.classList.remove('disabled');
                    tabsViewPanel.tabsContainer.appendChild(tabHandle);
                    tabsViewPanel.tabsContainer.reorderChild(tabHandle, index);
                    tabsViewPanel.tabsContainer.recalculateLayout();
                }
                if(!tabsViewPanel)
                    return;
                tabsViewPanel.tabsContainer.activeButton = tabHandle;
                if(tabsViewPanel.tabsContainer.onChange)
                    tabsViewPanel.tabsContainer.onChange();
            }];
        });
        return tabHandle;
    }

    removeTab(tabHandle) {
        return this.tabsContainer.removeChild(tabHandle);
    }
}

export class InfiniteViewPanel extends ClippingViewPanel {
    constructor(position, size) {
        super(position, size);
        this.content = new AdaptiveSizeContainerPanel(vec2.create());
        this.appendChild(this.content);
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
                        this.appendChildAnimated(this.selectionRect);
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
                this.appendChildAnimated(this.scrollBars[i]);
    }

    stoppedMoving() {
        for(let i = 0; i < 2; ++i)
            if(this.scrollBars[i].showIf == 'moving')
                this.removeChildAnimated(this.scrollBars[i]);
    }

    setContentTransformation(translation, scale) {
        for(let i = 0; i < 2; ++i) {
            const contentSize = this.content.size[i]*scale,
                  maxTranslation = Math.max(0.0, 0.5*(contentSize-this.size[i]));
            translation[i] = Math.max(-maxTranslation, Math.min(translation[i], maxTranslation));
            this.scrollBars[i].maxLength = this.size[i]-this.scrollBarWidth*2.0;
            this.scrollBars[i].position[i] = -0.5*this.scrollBarWidth-this.scrollBars[i].maxLength*translation[i]/contentSize;
            this.scrollBars[i].position[1-i] = 0.5*this.size[1-i]-this.scrollBarWidth;
            this.scrollBars[i].updatePosition();
            this.scrollBars[i].cornerRadius = this.scrollBarWidth*0.5;
            this.scrollBars[i].size[i] = this.scrollBars[i].maxLength*Math.min(1.0, this.size[i]/contentSize);
            this.scrollBars[i].size[1-i] = this.scrollBarWidth;
            this.scrollBars[i].updateSize();
            if(this.scrollBars[i].showIf == 'always' || (this.scrollBars[i].showIf == 'overflow' && this.scrollBars[i].size[i] < this.scrollBars[i].maxLength))
                this.appendChildAnimated(this.scrollBars[i]);
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
        this.appendChild(this.barPanel);
        this.barPanel.node.classList.add('sliderBar');
        this.labelPanel = new LabelPanel(vec2.create());
        this.appendChild(this.labelPanel);
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
                this.appendChild(this.textFieldPanel);
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
