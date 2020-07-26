import { vec2, mat2d, Panel } from './Panel.js';
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
        child.resetVisibilityAnimation();
        if(newIndex < 0)
            newIndex += this.children.length+1;
        if(!child || (child.parent && child.parent != this) || newIndex < 0)
            return false;
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
            child.dispatchEvent({'type': 'parentchange'});
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
        if(child.node) {
            this.node.removeChild(child.node);
            child.dispatchEvent({'type': 'parentchange'});
        }
        child.resetVisibilityAnimation();
        return true;
    }

    insertChildAnimated(child, newIndex=-1) {
        if(!this.insertChild(child, newIndex))
            return false;
        child.animateVisibilityTo(true);
        return true;
    }

    removeChildAnimated(child) {
        if(child.parent != this)
            return false;
        child.resetVisibilityAnimation();
        child.animateVisibilityTo(false);
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

const keyModifiers = ['alt', 'ctrl', 'meta', 'shift'],
      keyCodeByCharacter = {
    '⇧': 'shift', '⌘': 'meta', '⎇': 'alt', '⌥': 'alt', '^': 'ctrl', '⎈': 'ctrl',
    '⌫': 8, '↹': 9, '⌧': 12, '↵': 13, '⏎': 13, '␣': 32, '⇞': 33, '⇟': 34, '↘': 35, '↖': 36, '←': 37, '↑': 38, '→': 39, '↓': 40, '⌦': 46
};

function refineEvent(event) {
    if(keyModifiers.filter((modifier) => event[modifier+'Key']).length > 0)
        event.preventDefault();
    event.stopPropagation();
    if(event.touches) {
        event.modifierKey = (event.touches.length === 2);
        event.pointers = event.changedTouches;
    } else {
        event.modifierKey = event.shiftKey;
        event.pointers = [event];
    }
    for(const pointer of event.pointers)
        pointer.position = vec2.fromValues(pointer.clientX, pointer.clientY);
}

function dualPointerDifference(event) {
    const diff = vec2.create();
    if(event.pointers.length == 2)
        vec2.sub(diff, event.pointers[0].position, event.pointers[1].position);
    return diff;
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
        blurFilter.setAttribute('filterUnits', 'userSpaceOnUse');
        blurFilter.setAttribute('x', '-100%');
        blurFilter.setAttribute('y', '-100%');
        blurFilter.setAttribute('width', '200%');
        blurFilter.setAttribute('height', '200%');
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
        this.node.ongesturestart = (event) => {
            event.preventDefault();
        };
        this.node.onwheel = (event) => {
            event.preventDefault();
            refineEvent(event);
            Panel.dispatchEvent({
                'type': 'pointerzoom',
                'bubbles': true,
                'source': 'wheel',
                'position': event.pointers[0].position,
                'difference': vec2.fromValues(event.deltaX, event.deltaY)
            });
        };
        let pointerEvent;
        const distanceToZoom = 300,
              millisecondsToMove = 100;
        this.node.onmousedown = this.node.ontouchstart = (event) => {
            refineEvent(event);
            pointerEvent = {
                'type': 'pointerstart',
                'bubbles': true,
                'source': 'pointer',
                'modifierKey': event.modifierKey,
                'position': event.pointers[0].position,
                'moved': false,
                'beginTime': performance.now()
            };
            if(event.touches) {
                pointerEvent.primaryTouchID = event.touches[0].identifier;
                pointerEvent.zoomPointerDifference = dualPointerDifference(event);
                if(vec2.length(pointerEvent.zoomPointerDifference) < distanceToZoom)
                    delete pointerEvent.zoomPointerDifference;
            } else
                delete pointerEvent.zoomPointerDifference;
            if(Panel.dispatchEvent(pointerEvent)) {
                pointerEvent.target = pointerEvent.target || pointerEvent.originalTarget;
                pointerEvent.startPosition = pointerEvent.position;
                delete pointerEvent.bubbles;
            } else
                pointerEvent = undefined;
        };
        this.node.onmousemove = this.node.ontouchmove = (event) => {
            refineEvent(event);
            if(!pointerEvent)
                return;
            pointerEvent.currentTime = performance.now();
            if(pointerEvent.currentTime-pointerEvent.beginTime < millisecondsToMove)
                return;
            pointerEvent.modifierKey = event.modifierKey;
            if(pointerEvent.zoomPointerDifference) {
                const dist = dualPointerDifference(event);
                if(vec2.length(dist) > 0 && onZoom) {
                    const center = vec2.create();
                    vec2.add(center, event.pointers[0].position, event.pointers[1].position);
                    vec2.scale(center, center, 0.5);
                    pointerEvent.type = 'pointerzoom';
                    pointerEvent.position = center;
                    pointerEvent.factor = vec2.length(dist)/vec2.length(pointerEvent.zoomPointerDifference);
                    pointerEvent.zoomPointerDifference = dist;
                    pointerEvent.target.dispatchEvent(pointerEvent);
                }
            } else {
                pointerEvent.type = 'pointermove';
                pointerEvent.position = event.pointers[0].position;
                pointerEvent.target.dispatchEvent(pointerEvent);
            }
            pointerEvent.moved = true;
        };
        this.node.onmouseup = this.node.ontouchend = this.node.onmouseleave = this.node.ontouchleave = this.node.ontouchcancel = (event) => {
            refineEvent(event);
            if(!pointerEvent || (event.touches && event.touches.length > 0 && pointerEvent.primaryTouchID != event.changedTouches[0].identifier))
                return;
            pointerEvent.currentTime = performance.now();
            if(pointerEvent.moved) {
                pointerEvent.type = 'pointerend';
                pointerEvent.modifierKey = event.modifierKey;
                pointerEvent.position = event.pointers[0].position;
                pointerEvent.target.dispatchEvent(pointerEvent);
            } else
                pointerEvent.target.dispatchEvent({'type': 'action', 'bubbles': true, 'source': 'pointer', 'position': event.pointers[0].position});
            pointerEvent = undefined;
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

    openModalOverlay(event, overlay) {
        if(!this.modalOverlayBackgroundPanel.parent) {
            this.centeringPanel.insertChild(this.modalOverlayBackgroundPanel, -2);
            this.modalOverlayBackgroundPanel.registerActionEvent(() => {
                this.closeModalOverlay({'type': 'close', 'source': 'pointer'}, overlay);
            });
        }
        this.overlays.insertChildAnimated(overlay);
        if(event.source == 'keyboard')
            overlay.dispatchEvent({'type': 'focusnavigation', 'direction': 'in'});
    }

    closeModalOverlay(event, overlay) {
        event.type = 'close';
        let index = Math.max(0, this.overlays.children.indexOf(overlay));
        if(index == 0)
            this.centeringPanel.removeChild(this.modalOverlayBackgroundPanel);
        for(let i = this.overlays.children.length-1; i >= index; --i) {
            const child = this.overlays.children[i];
            child.dispatchEvent(event);
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
        const minPosition = vec2.fromValues(Infinity, Infinity),
              maxPosition = vec2.fromValues(-Infinity, -Infinity),
              center = vec2.create();
        for(const child of this.children) {
            const childBounds = child.getBounds();
            vec2.min(minPosition, minPosition, childBounds[0]);
            vec2.max(maxPosition, maxPosition, childBounds[1]);
        }
        vec2.sub(minPosition, minPosition, this.padding);
        vec2.add(maxPosition, maxPosition, this.padding);
        vec2.sub(this.size, maxPosition, minPosition);
        vec2.add(center, maxPosition, minPosition);
        if(vec2.dot(center, center) > 0.0) {
            vec2.scale(center, center, 0.5);
            for(const child of this.children) {
                vec2.sub(child.position, child.position, center);
                child.updatePosition();
            }
        }
        this.updateSize();
    }
}

export class CheckboxPanel extends ContainerPanel {
    constructor(position) {
        super(position, vec2.fromValues(12, 12));
        this.node.classList.add('checkbox');
        this.rectPanel = new RectPanel(vec2.create(), this.size);
        this.insertChild(this.rectPanel);
        this.rectPanel.cornerRadius = 2;
        this.registerActionEvent(() => {
            this.checked = !this.checked;
        });
        this.imagePanel = new ImagePanel(vec2.create(), vec2.fromValues(9, 9), 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNiIgaGVpZ2h0PSIyNiI+CiAgICA8cGF0aCBmaWxsPSIjRkZGIiBkPSJNMjIuNTY2NDA2IDQuNzMwNDY5TDIwLjc3MzQzOCAzLjUxMTcxOUMyMC4yNzczNDQgMy4xNzU3ODEgMTkuNTk3NjU2IDMuMzA0Njg4IDE5LjI2NTYyNSAzLjc5Njg3NUwxMC40NzY1NjMgMTYuNzU3ODEzTDYuNDM3NSAxMi43MTg3NUM2LjAxNTYyNSAxMi4yOTY4NzUgNS4zMjgxMjUgMTIuMjk2ODc1IDQuOTA2MjUgMTIuNzE4NzVMMy4zNzEwOTQgMTQuMjUzOTA2QzIuOTQ5MjE5IDE0LjY3NTc4MSAyLjk0OTIxOSAxNS4zNjMyODEgMy4zNzEwOTQgMTUuNzg5MDYzTDkuNTgyMDMxIDIyQzkuOTI5Njg4IDIyLjM0NzY1NiAxMC40NzY1NjMgMjIuNjEzMjgxIDEwLjk2ODc1IDIyLjYxMzI4MUMxMS40NjA5MzggMjIuNjEzMjgxIDExLjk1NzAzMSAyMi4zMDQ2ODggMTIuMjc3MzQ0IDIxLjgzOTg0NEwyMi44NTU0NjkgNi4yMzQzNzVDMjMuMTkxNDA2IDUuNzQyMTg4IDIzLjA2MjUgNS4wNjY0MDYgMjIuNTY2NDA2IDQuNzMwNDY5WiIvPgo8L3N2Zz4K');
        this.insertChild(this.imagePanel);
        this.rectPanel.updateSize();
        this.rectPanel.updatePosition();
        this.registerFocusEvent(this.rectPanel.node);
    }

    get checked() {
        return this.node.classList.contains('active');
    }

    set checked(value) {
        if(this.checked == value)
            return;
        if(value)
            this.node.classList.add('active');
        else
            this.node.classList.remove('active');
        this.dispatchEvent({'type': 'change'});
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
        this.registerFocusEvent(this.backgroundPanel.node);
        this.addEventListener('focusnavigation', (event) => {
            switch(event.direction) {
                case 'in':
                    if(this.children[0])
                        this.children[0].dispatchEvent({'type': 'focus'});
                    break;
            }
            return true;
        });
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
        this.reverse = false;
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
            if(this.reverse)
                child.position[this.axis] *= -1;
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
    constructor(position, cssClass='button', backgroundPanel=new RectPanel(vec2.create(), vec2.create())) {
        super(position, vec2.create());
        this.padding = vec2.fromValues(4, 2);
        this.backgroundPanel = backgroundPanel;
        if(cssClass)
            this.backgroundPanel.node.classList.add(cssClass);
        this.backgroundPanel.cornerRadius = (cssClass == 'toolbarMenuButton') ? 0 : 4;
        this.registerFocusEvent(this.backgroundPanel.node);
    }

    insertChild(child, newIndex=-1) {
        if(child instanceof LabelPanel || child instanceof ImagePanel)
            child.node.classList.add('disabled');
        return super.insertChild(child, newIndex);
    }
}

export class OverlayMenuPanel extends ButtonPanel {
    constructor(position, overlayPanel=new AdaptiveSizeContainerPanel(vec2.create()), cssClass='overlayMenuButton') {
        super(position, cssClass);
        this.registerActionEvent((event) => {
            if(this.backgroundPanel.node.classList.contains('active'))
                this.root.closeModalOverlay(event, this.overlayPanel);
            else {
                this.backgroundPanel.node.classList.add('active');
                this.updateOverlayPosition();
                this.root.openModalOverlay(event, this.overlayPanel);
            }
        });
        this.overlayPanel = overlayPanel;
        this.overlayPanel.backgroundPanel = new SpeechBalloonPanel(vec2.create(), vec2.create());
        this.overlayPanel.backgroundPanel.node.classList.add('overlayMenu');
        this.overlayPanel.addEventListener('close', (event) => {
            this.backgroundPanel.node.classList.remove('active');
            if(event.source == 'keyboard')
                this.dispatchEvent({'type': 'focus'});
        });
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
                if(this.backgroundPanel.cornerRadius == 0) {
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
                }
                this.overlayPanel.position[0] += (bounds.width+this.overlayPanel.size[0])*xAxisAlignment;
                this.overlayPanel.position[1] += (this.overlayPanel.size[1]-bounds.height)*yAxisAlignment;
                break;
            case 'vertical':
                if(this.backgroundPanel.cornerRadius == 0) {
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
    constructor(position, contentPanel, childPanels, cssClass) {
        super(position, new TilingPanel(vec2.create(), vec2.create()), cssClass);
        this.contentPanel = contentPanel;
        this.insertChild(contentPanel);
        this.overlayPanel.padding = vec2.fromValues(0, 4);
        this.overlayPanel.axis = 1;
        this.overlayPanel.otherAxisAlignment = 'stretch';
        for(const childPanel of childPanels) {
            this.overlayPanel.insertChild(childPanel);
            childPanel.padding[0] = 10;
            childPanel.recalculateLayout();
        }
        if(cssClass == 'toolbarMenuButton') {
            this.style = 'horizontal';
            this.padding[0] = 10;
        } else {
            this.style = 'vertical';
            this.padding[0] = 5;
            this.interChildSpacing = 5;
            this.insertChild(new ImagePanel(vec2.create(), vec2.fromValues(10, 10), 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMCAxNSI+PHBhdGggc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6d2hpdGU7c3Ryb2tlLXdpZHRoOjVweDsiIGQ9Ik0zIDVsMTIgMTBsMTIgLTEwIi8+PC9zdmc+'));
        }
        this.overlayPanel.recalculateLayout();
        this.overlayPanel.registerFocusNavigationEvent();
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
        this.backgroundPanel = new RectPanel(vec2.create(), vec2.create());
        this.registerFocusEvent(this.backgroundPanel.node);
        this.registerFocusNavigationEvent();
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
        const combination = keyModifiers.filter((modifier) => event[modifier+'Key']).concat([event.keyCode]),
              action = this.shortcuts[combination.join(',')];
        if(!action)
            return false;
        if(action)
            action({'source': 'keyboard'});
        return true;
    }

    generateDropDownMenu(contentPanel, childPanels) {
        const dropDownMenuPanel = new DropDownMenuPanel(vec2.create(), contentPanel, childPanels, 'toolbarMenuButton');
        for(const childPanel of childPanels) {
            childPanel.sizeAlongAxis = 1;
            childPanel.recalculateLayout();
        }
        return dropDownMenuPanel;
    }

    generateMenuButton(contentPanel, shortCut, action) {
        const buttonPanel = new ButtonPanel(vec2.create(), 'toolbarMenuButton');
        buttonPanel.registerActionEvent((event) => {
            this.root.closeModalOverlay(event);
            if(action)
                action(event);
        });
        buttonPanel.axis = 0;
        buttonPanel.insertChild(contentPanel);
        buttonPanel.insertChild(new Panel(vec2.create(), vec2.create()));
        if(shortCut) {
            buttonPanel.insertChild(new Panel(vec2.create(), vec2.fromValues(10, 0)));
            buttonPanel.insertChild(new LabelPanel(vec2.create(), shortCut));
            buttonPanel.shortCut = {'action': action, 'modifiers': []};
            for(let i = 0; i < shortCut.length; ++i) {
                const code = keyCodeByCharacter[shortCut[i]];
                if(!code)
                    buttonPanel.shortCut.keyCode = shortCut.charCodeAt(i);
                else if(typeof code == 'number')
                    buttonPanel.shortCut.keyCode = code;
                else if(typeof code == 'string')
                    buttonPanel.shortCut.modifiers.push(code);
            }
            buttonPanel.shortCut.modifiers.sort();
            const combination = buttonPanel.shortCut.modifiers.concat([buttonPanel.shortCut.keyCode]).join(',');
            this.shortcuts[combination] = action;
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
        } else if(menuEntry.children) {
            buttonPanel.insertChild(new Panel(vec2.create(), vec2.fromValues(10, 0)));
            buttonPanel.insertChild(new LabelPanel(vec2.create(), '▶'));
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

    navigateFocus(direction, event) {
        switch(direction) {
            case 'defocus':
                if(this.root.focusedPanel)
                    this.root.focusedPanel.dispatchEvent({'type': 'defocus', 'source': event.source});
                break;
            case 'in':
                if(!this.root.focusedPanel)
                    this.dispatchEvent({'type': 'focus', 'source': event.source});
                else if(!this.root.focusedPanel.dispatchEvent({'type': 'focusnavigation', 'source': event.source, 'direction': 'in'}))
                    this.root.focusedPanel.dispatchEvent({'type': 'action', 'source': event.source});
                break;
            case 'out':
                if(this.root.focusedPanel && this.root.focusedPanel.parent) {
                    if(this.root.focusedPanel.parent.parent == this.root.overlays)
                        this.root.closeModalOverlay(event, this.root.focusedPanel.parent);
                    else
                        this.root.focusedPanel.parent.dispatchEvent({'type': 'focus', 'source': event.source, 'bubbles': true});
                }
                break;
            default:
                if(this.root.focusedPanel && this.root.focusedPanel.parent)
                    this.root.focusedPanel.parent.dispatchEvent({'type': 'focusnavigation', 'source': event.source, 'bubbles': true, 'direction': direction});
                break;
        }
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
        this.backgroundPanel.cornerRadius = 5;
        this.addEventListener('pointerstart', (event) => {
            event.position = this.backgroundPanel.relativePosition(event.position);
            const position = event.position[this.axis];
            event.splitIndex = 0;
            while(event.splitIndex < this.children.length && this.children[event.splitIndex].position[this.axis] < position)
                ++event.splitIndex;
            event.mode = 'move';
            if(this.enableSplitAndMerge) {
                const sizeOtherAxis = (this.size[1-this.axis]-this.padding[this.axis])*0.5;
                if(event.position[1-this.axis] > sizeOtherAxis-this.splitHandleSize) {
                    if(event.splitIndex == 0)
                        return false;
                    event.mode = 'insertBefore';
                } else if(event.position[1-this.axis] < this.splitHandleSize-sizeOtherAxis) {
                    if(event.splitIndex == this.children.length)
                        return false;
                    event.mode = 'insertAfter';
                }
                return true;
            } else
                return event.splitIndex > 0 || event.splitIndex < this.children.length;
        });
        this.addEventListener('pointermove', (event) => {
            if(!event.moved) {
                if(event.mode != 'move') {
                    const childToSplit = this.children[event.mode == 'insertBefore' ? event.splitIndex-1 : event.splitIndex];
                    childToSplit.size[this.axis] -= this.interChildSpacing;
                    const childToInsert = new PanePanel(vec2.create(), vec2.create());
                    childToInsert.relativeSize = 0.0;
                    this.insertChild(childToInsert, event.splitIndex);
                    this.normalizeRelativeSizes();
                    this.recalculateLayout();
                    if(event.mode == 'insertAfter')
                        ++event.splitIndex;
                }
                event.prevChild = this.children[event.splitIndex-1];
                event.nextChild = this.children[event.splitIndex];
                event.prevChildOriginalPosition = event.prevChild.position[this.axis];
                event.nextChildOriginalPosition = event.nextChild.position[this.axis];
                event.prevChildOriginalSize = event.prevChild.size[this.axis];
                event.nextChildOriginalSize = event.nextChild.size[this.axis];
                event.absoluteSizeSum = event.prevChildOriginalSize+event.nextChildOriginalSize;
                event.relativeSizeSum = event.prevChild.relativeSize+event.nextChild.relativeSize;
            }
            event.position = this.backgroundPanel.relativePosition(event.position);
            const diff = Math.max(-event.prevChildOriginalSize, Math.min(event.nextChildOriginalSize, event.position[this.axis]-event.startPosition[this.axis]));
            event.prevChild.position[this.axis] = event.prevChildOriginalPosition+diff*0.5;
            event.prevChild.updatePosition();
            event.nextChild.position[this.axis] = event.nextChildOriginalPosition+diff*0.5;
            event.nextChild.updatePosition();
            event.prevChild.size[this.axis] = event.prevChildOriginalSize+diff;
            event.prevChild.updateSize();
            event.nextChild.size[this.axis] = event.nextChildOriginalSize-diff;
            event.nextChild.updateSize();
            event.prevChild.relativeSize = event.relativeSizeSum*event.prevChild.size[this.axis]/event.absoluteSizeSum;
            event.nextChild.relativeSize = event.relativeSizeSum-event.prevChild.relativeSize;
        });
        this.addEventListener('pointerend', (event) => {
            const smallerChild = (event.prevChild.relativeSize < event.nextChild.relativeSize) ? event.prevChild : event.nextChild;
            if(this.enableSplitAndMerge && smallerChild.size[this.axis] < this.mergeSizeThreshold) {
                const otherChild = (smallerChild == event.nextChild) ? event.prevChild : event.nextChild;
                otherChild.size[this.axis] += smallerChild.size[this.axis]+this.interChildSpacing;
                otherChild.updateSize();
                otherChild.position[this.axis] += (smallerChild.size[this.axis]+this.interChildSpacing)*(smallerChild == event.nextChild ? 0.5 : -0.5);
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
        });
        this.registerFocusEvent(this.backgroundPanel.node);
        this.registerFocusNavigationEvent();
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
    constructor(position, size, enableNavigation=true) {
        super(position, size);
        if(enableNavigation)
            this.registerFocusNavigationEvent();
    }

    insertChild(child, newIndex=-1) {
        child.registerActionEvent(() => {
            if(this.activeButton == child)
                return;
            this.activeButton = child;
        });
        return super.insertChild(child, newIndex);
    }

    removeChild(child) {
        if(child == this._activeButton)
            this.activeButton = undefined;
        return super.removeChild(child);
    }

    get activeButton() {
        return this._activeButton;
    }

    set activeButton(button) {
        if(this._activeButton == button)
            return;
        if(this._activeButton)
            this._activeButton.backgroundPanel.node.classList.remove('active');
        this._activeButton = button;
        if(this._activeButton)
            this._activeButton.backgroundPanel.node.classList.add('active');
        this.dispatchEvent({'type': 'change'});
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
        this.header.registerActionEvent(() => {
            this.tabsContainer.activeButton = undefined;
        });
        this.insertChild(this.header);
        this.tabsContainer = new RadioButtonsPanel(vec2.create(), vec2.create(), false);
        this.header.insertChild(this.tabsContainer);
        this.tabsContainer.axis = 1-this.axis;
        this.tabsContainer.interChildSpacing = 4;
        this.tabsContainer.addEventListener('change', () => {
            if(this.content)
                this.removeChild(this.content);
            this.content = (this.tabsContainer.activeButton) ? this.tabsContainer.activeButton.content : this.defaultContent;
            if(this.content)
                this.insertChild(this.content);
            this.recalculateLayout();
        });
        this.registerDropEvent(
            (item) => this.enableTabDragging && item instanceof ButtonPanel && item.backgroundPanel.node.classList.contains('tabHandle'),
            (item) => {
                let index = 0;
                const containerPosition = this.tabsContainer.getRootPosition();
                vec2.sub(containerPosition, item.position, containerPosition);
                while(index < this.tabsContainer.children.length && this.tabsContainer.children[index].position[this.tabsContainer.axis] < containerPosition[this.tabsContainer.axis])
                    ++index;
                this.tabsContainer.insertChild(item, index);
                this.tabsContainer.recalculateLayout();
                this.tabsContainer.activeButton = item;
            }
        );
        this.content = this.defaultContent = new PanePanel(vec2.create(), vec2.create());
        this.insertChild(this.content);
        this.backgroundPanel = new RectPanel(vec2.create(), vec2.create());
        this.backgroundPanel.cornerRadius = 5;
        this.registerFocusEvent(this.backgroundPanel.node);
        this.addEventListener('focusnavigation', (event) => {
            let index = this.tabsContainer.children.indexOf(this.root.focusedPanel);
            if(index == -1)
                index = this.tabsContainer.children.indexOf(this.tabsContainer.activeButton);
            if(index == -1)
                index = this.tabsContainer.children.length>>1;
            switch(event.direction) {
                case 'up':
                    if(this.tabsContainer.children[index])
                        this.tabsContainer.children[index].dispatchEvent({'type': 'focus'});
                    break;
                case 'in':
                case 'down':
                    this.content.dispatchEvent({'type': 'focus'});
                    break;
                case 'left':
                    if(this.axis == 1 && this.tabsContainer.children[index-1])
                        this.tabsContainer.children[--index].dispatchEvent({'type': 'focus'});
                    break;
                case 'right':
                    if(this.axis == 1 && this.tabsContainer.children[index+1])
                        this.tabsContainer.children[++index].dispatchEvent({'type': 'focus'});
                    break;
            }
            return true;
        });
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

    addTab() {
        const tabHandle = new ButtonPanel(vec2.create(), 'tabHandle', new SpeechBalloonPanel(vec2.create(), vec2.create()));
        this.tabsContainer.insertChild(tabHandle);
        this.updateTabHandleCorners(tabHandle);
        tabHandle.padding = vec2.fromValues(11, 3);
        tabHandle.registerActionEvent(() => {
            this.tabsContainer.activeButton = tabHandle;
        });
        tabHandle.registerDragEvent(() => {
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
    constructor(position, size, contentPanel=new AdaptiveSizeContainerPanel(vec2.create())) {
        super(position, size);
        this.contentPanel = contentPanel;
        this.insertChild(this.contentPanel);
        this.contentTransform = mat2d.create();
        this.inverseContentTransform = mat2d.create();
        this.velocity = vec2.create();
        this.damping = 0.9;
        this.enableSelectionRect = false;
        this.scrollSpeed = 0.0;
        this.minScale = 1.0;
        this.maxScale = 1.0;
        this.focusViewFactor = vec2.fromValues(0.8, 0.8);
        this.addEventListener('pointerzoom', (event) => {
            if(this.scrollSpeed != 0.0 && event.difference) {
                vec2.scaleAndAdd(event.difference, this.contentTranslation, event.difference, this.scrollSpeed);
                this.setContentTransformation(event.difference, this.contentScale);
                return;
            }
            let scale = this.contentScale,
                factor = (event.difference) ? Math.pow(2, vec2.length(event.difference)*0.1) : event.factor;
            factor = Math.min(Math.max(factor*scale, this.minScale), this.maxScale)/scale;
            if(factor == 1.0)
                return;
            scale *= factor;
            const translation = this.contentTranslation;
            vec2.sub(translation, translation, event.position);
            vec2.scale(translation, translation, factor);
            vec2.add(translation, translation, event.position);
            this.setContentTransformation(translation, scale);
        });
        this.addEventListener('pointerstart', (event) => {
            event.position = this.backgroundPanel.relativePosition(event.position);
            event.isSelectionRect = event.modifierKey && this.enableSelectionRect;
            if(!event.isSelectionRect) {
                event.originalTranslation = this.contentTranslation;
                event.prevTranslation = event.translation = vec2.clone(event.originalTranslation);
                event.originalTranslation = this.contentTranslation;
                event.prevTimestamp = performance.now();
            }
            return true;
        });
        this.addEventListener('pointermove', (event) => {
            event.position = this.backgroundPanel.relativePosition(event.position);
            if(event.isSelectionRect) {
                if(!this.selectionRect) {
                    this.selectionRect = new RectPanel(vec2.create(), vec2.create());
                    this.insertChildAnimated(this.selectionRect);
                    this.selectionRect.node.classList.add('selectionRect');
                }
                this.selectionRect.setBounds(event.startPosition, event.position);
                this.selectionRect.updatePosition();
                this.selectionRect.updateSize();
            } else {
                if(!event.moved)
                    this.dispatchEvent({'type': 'startedmoving'});
                vec2.sub(event.translation, event.position, event.startPosition);
                vec2.add(event.translation, event.translation, event.originalTranslation);
                this.setContentTransformation(event.translation, this.contentScale);
                event.translation = this.contentTranslation;
                const timestamp = performance.now();
                vec2.sub(this.velocity, event.translation, event.prevTranslation);
                vec2.scale(this.velocity, this.velocity, 1.0/(timestamp-event.prevTimestamp));
                vec2.copy(event.prevTranslation, event.translation);
                event.prevTimestamp = timestamp;
            }
        });
        this.addEventListener('pointerend', (event) => {
            if(event.isSelectionRect) {
                const bounds = this.selectionRect.getBounds();
                vec2.transformMat2d(bounds[0], bounds[0], this.inverseContentTransform);
                vec2.transformMat2d(bounds[1], bounds[1], this.inverseContentTransform);
                this.contentPanel.selectChildrenInside(bounds[0], bounds[1], event.modifierKey);
                this.removeChildAnimated(this.selectionRect);
                delete this.selectionRect;
            } else
                this.dispatchEvent({'type': 'stoppedmoving'});
        });
        this.addEventListener('movefocusinview', (event) => {
            const position = vec2.clone(this.contentTranslation);
            for(let panel = event.item; panel != this; panel = panel.parent)
                vec2.add(position, position, panel.position);
            const translation = vec2.clone(this.contentTranslation);
            for(let i = 0; i < 2; ++i) {
                if(this.size[i]*this.focusViewFactor[i] <= event.item.size[i])
                    translation[i] -= position[i];
                else
                    translation[i] -= Math.max(0.0, Math.abs(position[i])-(this.size[i]*this.focusViewFactor[i]-event.item.size[i])*0.5)*Math.sign(position[i]);
            }
            this.setContentTransformation(translation, this.contentScale);
        });
    }

    get contentTranslation() {
        return vec2.fromValues(this.contentTransform[4], this.contentTransform[5]);
    }

    get contentScale() {
        return this.contentTransform[0];
    }

    setContentTransformation(translation, scale) {
        mat2d.set(this.contentTransform, scale, 0.0, 0.0, scale, translation[0], translation[1]);
        mat2d.invert(this.inverseContentTransform, this.contentTransform);
        this.contentPanel.node.setAttribute('transform', 'translate('+translation[0]+', '+translation[1]+') scale('+scale+')');
        this.dispatchEvent({'type': 'move'});
    }
}

export class ScrollViewPanel extends InfiniteViewPanel {
    constructor(position, size, contentPanel=new AdaptiveSizeContainerPanel(vec2.create())) {
        super(position, size, contentPanel);
        this.scrollSpeed = 10.0;
        this.scrollBarWidth = 5;
        this.scrollBarMinLength = 20;
        this.scrollBars = [];
        for(let i = 0; i < 2; ++i) {
            const scrollBar = new RectPanel(vec2.create(), vec2.create());
            this.scrollBars.push(scrollBar);
            scrollBar.showIf = 'overflow'; // always, overflow, moving, never
            scrollBar.node.classList.add('scrollBar');
            scrollBar.addEventListener('pointerstart', (event) => {
                event.offset = scrollBar.position[i]-event.position[i];
                event.translation = this.contentTranslation;
                return true;
            });
            scrollBar.addEventListener('pointermove', (event) => {
                event.translation[i] = 0.5*this.scrollBarWidth-(event.offset+event.position[i])/scrollBar.maxLength*this.contentPanel.size[i]*this.contentScale;
                this.setContentTransformation(event.translation, this.contentScale);
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
            const contentSize = this.contentPanel.size[i]*scale,
                  contentSizeFactor = (contentSize == 0.0) ? 1.0 : 1.0/contentSize,
                  maxTranslation = Math.max(0.0, 0.5*(contentSize-this.size[i]));
            translation[i] = Math.max(-maxTranslation, Math.min(translation[i], maxTranslation));
            this.scrollBars[i].maxLength = this.size[i]-this.scrollBarWidth*2.0;
            this.scrollBars[i].size[i] = this.scrollBars[i].maxLength*Math.min(1.0, this.size[i]*contentSizeFactor);
            this.scrollBars[i].size[1-i] = this.scrollBarWidth;
            if(this.scrollBars[i].size[i] < this.scrollBarMinLength) {
                this.scrollBars[i].maxLength -= this.scrollBarMinLength-this.scrollBars[i].size[i];
                this.scrollBars[i].size[i] = this.scrollBarMinLength;
            }
            this.scrollBars[i].position[i] = -0.5*this.scrollBarWidth-this.scrollBars[i].maxLength*translation[i]*contentSizeFactor;
            this.scrollBars[i].position[1-i] = 0.5*this.size[1-i]-this.scrollBarWidth;
            this.scrollBars[i].updatePosition();
            this.scrollBars[i].cornerRadius = this.scrollBarWidth*0.5;
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
    constructor(position, size) {
        super(position, size);
        this.backgroundPanel = new RectPanel(vec2.create(), size);
        this.barPanel = new RectPanel(vec2.create(), vec2.create());
        this.insertChild(this.barPanel);
        this.barPanel.node.classList.add('sliderBar');
        this.labelPanel = new LabelPanel(vec2.create());
        this.insertChild(this.labelPanel);
        this.textFieldPanel = new TextFieldPanel(vec2.create(), size);
        this.textFieldPanel.addEventListener('change', (event) => {
            this.value = parseFloat(this.textFieldPanel.text);
            this.removeChild(this.textFieldPanel);
            this.recalculateLayout();
            this.dispatchEvent({'type': 'change', 'source': 'keyboard'});
        });
        this.minValue = 0.0;
        this.maxValue = 1.0;
        this.value = 0.5;
        this.fixedPointDigits = 2;
        this.node.classList.add('slider');
        this.addEventListener('action', (event) => {
            this.insertChild(this.textFieldPanel);
            this.textFieldPanel.text = this.labelPanel.text;
            this.textFieldPanel.embeddedNode.focus();
        });
        this.addEventListener('pointerstart', (event) => {
            event.originalValue = this.value;
            return true;
        });
        this.addEventListener('pointermove', (event) => {
            this.value = event.originalValue+(event.position[0]-event.startPosition[0])*(this.maxValue-this.minValue)/this.size[0];
            this.recalculateLayout();
            this.dispatchEvent({'type': 'input', 'source': 'pointer'});
        });
        this.addEventListener('pointerend', (event) => {
            this.dispatchEvent({'type': 'change', 'source': 'pointer'});
        });
        this.registerFocusEvent(this.backgroundPanel.node);
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

export class CollapsibleViewPanel extends TilingPanel {
    constructor(position, size, headerPanel=new LabelPanel(vec2.create())) {
        super(position, size);
        this.open = true;
        this.padding = vec2.fromValues(5, 5);
        this.axis = 1;
        this.otherAxisAlignment = -0.5;
        this.otherAxisSizeStays = true;
        this.interChildSpacing = 5;
        this.arrowPanel = new ImagePanel(vec2.create(), vec2.fromValues(10, 10), 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMCAzMCI+PHBhdGggc3R5bGU9ImZpbGw6d2hpdGU7IiBkPSJNMCAyLjVoMzBsLTE1IDI1eiIvPjwvc3ZnPg==');
        this.arrowPanel.node.classList.add('rotatable');
        this.headerPanel = headerPanel;
        this.horizontalSplit = new TilingPanel(vec2.create(), vec2.create());
        this.horizontalSplit.axis = 0;
        this.horizontalSplit.interChildSpacing = 5;
        this.horizontalSplit.insertChild(this.arrowPanel);
        this.horizontalSplit.insertChild(this.headerPanel);
        this.horizontalSplit.recalculateLayout();
        this.insertChild(this.horizontalSplit);
        this.clippingViewPanel = new ClippingViewPanel(vec2.create(), vec2.create());
        this.insertChild(this.clippingViewPanel);
        this.contentPanel = new AdaptiveSizeContainerPanel(vec2.create(), vec2.create());
        this.clippingViewPanel.insertChild(this.contentPanel);
        this.registerFocusEvent(this.headerPanel.node);
        this.registerActionEvent(() => {
            this.open = !this.open;
            this.openAnimation = this.arrowPanel.node.animate({
                'transform': [
                    `translate(${this.arrowPanel.position[0]}px, ${this.arrowPanel.position[1]}px) rotate(-90deg)`,
                    `translate(${this.arrowPanel.position[0]}px, ${this.arrowPanel.position[1]}px) rotate(0deg)`,
                ]
            }, {
                'direction': this.open ? 'normal' : 'reverse',
                'duration': 250,
                'iterations': 1,
                'fill': 'both',
                'easing': 'ease-in-out'
            });
            this.openAnimation.onfinish = () => {
                delete this.openAnimation;
                this.recalculateLayout();
            };
            Panel.animate((timeDiff) => {
                if(!this.openAnimation)
                    return false;
                this.recalculateLayout();
                return true;
            });
        });
    }

    recalculateLayout() {
        const factor = (this.openAnimation) ? this.openAnimation.effect.getComputedTiming().progress : this.open ? 1 : 0;
        this.clippingViewPanel.size[0] = this.size[0];
        this.clippingViewPanel.size[1] = this.contentPanel.size[1]*factor;
        this.clippingViewPanel.updateSize();
        super.recalculateLayout();
    }
}

export class IndexedListPanel extends ScrollViewPanel {
    constructor(position, size) {
        super(position, size, new TilingPanel(vec2.create(), vec2.create()));
        this.contentPanel.axis = 1;
        this.contentPanel.otherAxisAlignment = 'stretch';
        this.addEventListener('move', (event) => {
            const axis = this.contentPanel.axis,
                  viewPos = -this.contentTranslation[axis]-0.5*this.size[axis];
            let childAtTop;
            for(const child of this.contentPanel.children)
                if(child.position[axis]-0.5*child.size[axis] <= viewPos && viewPos <= child.position[axis]+0.5*child.size[axis]) {
                    childAtTop = child;
                    break;
                }
            this.setChildAtTop(childAtTop);
            if(childAtTop && childAtTop.children.length > 0) {
                const headerPanel = childAtTop.children[childAtTop.children.length-1],
                      offset = (childAtTop.reverse) ? 0.5*headerPanel.size[axis] : -0.5*headerPanel.size[axis]+this.size[axis];
                headerPanel.position[axis] = Math.min(viewPos-childAtTop.position[axis]+offset, 0.5*(childAtTop.size[axis]-headerPanel.size[axis]));
                headerPanel.updatePosition();
            }
        });
    }

    setChildAtTop(childAtTop) {
        if(this.childAtTop == childAtTop)
            return;
        if(this.childAtTop)
            this.childAtTop.recalculateLayout();
        this.childAtTop = childAtTop;
    }
};
