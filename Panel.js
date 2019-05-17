import { vec2 } from './gl-matrix.js';

export class Panel {
    static createElement(tag, parentNode) {
        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', tag);
        if(parentNode)
            parentNode.appendChild(svgElement);
        return svgElement;
    }

    static setAttribute(node, attribute, value) {
        node.setAttributeNS('http://www.w3.org/1999/xlink', attribute, value);
    }

    constructor(position, size, node) {
        this.position = position;
        this.size = size;
        this.node = node;
        this.minPosition = vec2.create();
        this.maxPosition = vec2.create();
        this._selected = false;
    }

    updateTransformation() {
        vec2.scale(this.minPosition, this.size, 0.5);
        vec2.add(this.maxPosition, this.position, this.minPosition);
        vec2.sub(this.minPosition, this.position, this.minPosition);
        if(this.parent && this.parent.childTransformationsChanged)
            this.parent.childTransformationsChanged();
    }

    setBounds(positionA, positionB) {
        vec2.min(this.minPosition, positionA, positionB);
        vec2.max(this.maxPosition, positionA, positionB);
        vec2.sub(this.size, this.maxPosition, this.minPosition);
        vec2.add(this.position, this.minPosition, this.maxPosition);
        vec2.scale(this.position, this.position, 0.5);
    }

    get selected() {
        return this._selected;
    }

    set selected(value) {
        if(this._selected == value)
            return;
        this._selected = value;
        if(value)
            this.node.classList.add('selected');
        else
            this.node.classList.remove('selected');
    }

    get hidden() {
        return this.node.classList.contains('fadeOut');
    }

    set hidden(value) {
        if(value) {
            this.node.classList.remove('fadeIn');
            this.node.classList.add('fadeOut');
        } else {
            this.node.classList.remove('fadeOut');
            this.node.classList.add('fadeIn');
        }
    }

    selectIfInside(min, max, toggle) {
        if(min[0] > this.minPosition[0] || min[1] > this.minPosition[1] || max[0] < this.maxPosition[0] || max[1] < this.maxPosition[1])
            return;
        if(toggle)
            this.selected = !this.selected;
        else
            this.selected = true;
    }

    registerPointerEvents(pointerStart, referenceNode) {
        let primaryTouchID, zoom;
        function dualPointerDistance(event) {
            return (event.pointers.length == 2) ? vec2.distance(event.pointers[0].position, event.pointers[1].position) : 0;
        }
        function refineEvent(event) {
            if(event.touches) {
                event.modifierKey = (event.touches.length === 2);
                event.pointers = event.touches;
            } else {
                event.modifierKey = event.shiftKey;
                event.pointers = [event];
            }
            if(referenceNode) {
                const bounds = referenceNode.getBoundingClientRect();
                for(const pointer of event.pointers)
                    pointer.position = vec2.fromValues(pointer.clientX-bounds.x-bounds.width*0.5, pointer.clientY-bounds.y-bounds.height*0.5);
            } else for(const pointer of event.pointers)
                pointer.position = vec2.fromValues(pointer.clientX, pointer.clientY)
        }
        if(this.zoom)
            this.node.onwheel = function(event) {
                event.stopPropagation();
                event.preventDefault();
                refineEvent(event);
                this.zoom(Math.pow(2, event.deltaY*0.1), event.pointers[0].position);
            }.bind(this);
        this.node.onmousedown = this.node.ontouchstart = function(event) {
            event.stopPropagation();
            event.preventDefault();
            if(this.root.node.ontouchstart)
                return;
            refineEvent(event);
            if(event.touches) {
                primaryTouchID = event.touches[0].identifier;
                zoom = dualPointerDistance(event);
                zoom = (zoom < 300) ? 0 : zoom;
            }
            const [pointerMoving, pointerEnd] = pointerStart(event);
            if(pointerMoving)
                this.root.node.onmousemove = this.root.node.ontouchmove = function(event) {
                    event.stopPropagation();
                    event.preventDefault();
                    refineEvent(event);
                    if(zoom) {
                        const dist = dualPointerDistance(event);
                        if(dist > 0 && this.zoom) {
                            const center = vec2.create();
                            vec2.add(center, event.pointers[0].position, event.pointers[1].position);
                            vec2.scale(center, center, 0.5);
                            this.zoom(dist/zoom, center);
                            zoom = dist;
                        }
                    } else
                        pointerMoving(event);
                }.bind(this);
            if(pointerEnd)
                this.root.node.onmouseup = this.root.node.ontouchend = this.root.node.onmouseleave = this.root.node.ontouchleave = this.root.node.ontouchcancel = function(event) {
                    event.stopPropagation();
                    event.preventDefault();
                    if(event.touches && event.touches.length > 0 && primaryTouchID != event.changedTouches[0].identifier)
                        return;
                    refineEvent(event);
                    this.root.node.onmousemove = null;
                    this.root.node.ontouchmove = null;
                    this.root.node.onmouseup = null;
                    this.root.node.ontouchend = null;
                    this.root.node.onmouseleave = null;
                    this.root.node.ontouchleave = null;
                    this.root.node.ontouchcancel = null;
                    pointerEnd(event);
                }.bind(this);
            if(event.type === 'touchstart') {
                this.node.onmousedown = null;
                this.root.node.onmousemove = null;
                this.root.node.onmouseup = null;
                this.root.node.onmouseleave = null;
            }
        }.bind(this);
    }
}

export class LabelPanel extends Panel {
    constructor(parent, position) {
        super(position, vec2.create(), Panel.createElement('text'));
        parent.appendChild(this);
    }

    updateTransformation() {
        const bbox = this.node.getBBox();
        this.size[0] = bbox.width;
        this.size[1] = bbox.height;
        this.node.setAttribute('x', this.position[0]-this.size[0]*0.5);
        this.node.setAttribute('y', this.position[1]);
        super.updateTransformation();
    }

    get text() {
        return this.node.textContent;
    }

    set text(text) {
        this.node.textContent = text;
        this.updateTransformation();
    }
}

export class CirclePanel extends Panel {
    constructor(parent, position, size) {
        super(position, size, Panel.createElement('circle'));
        parent.appendChild(this);
    }

    updateTransformation() {
        super.updateTransformation();
        this.node.setAttribute('r', Math.min(this.size[0], this.size[1]));
        this.node.setAttribute('x', this.position[0]);
        this.node.setAttribute('y', this.position[1]);
    }
}

export class RectPanel extends Panel {
    constructor(parent, position, size) {
        super(position, size, Panel.createElement('rect'));
        parent.appendChild(this);
    }

    updateTransformation() {
        super.updateTransformation();
        this.node.setAttribute('width', this.size[0]);
        this.node.setAttribute('height', this.size[1]);
        this.node.setAttribute('x', this.position[0]-this.size[0]*0.5);
        this.node.setAttribute('y', this.position[1]-this.size[1]*0.5);
    }

    get cornerRadius() {
        return parseFloat(this.node.getAttribute('rx'));
    }

    set cornerRadius(cornerRadius) {
        this.node.setAttribute('rx', cornerRadius);
        this.node.setAttribute('ry', cornerRadius);
    }
}

export class ContainerPanel extends Panel {
    constructor(position, size, node=Panel.createElement('g')) {
        super(position, size, node);
        this.contentNode = this.node;
        this.children = [];
        this.padding = vec2.create();
    }

    appendChild(child) {
        const index = this.children.indexOf(child);
        if(index != -1)
            return false;
        this.children.push(child);
        this.contentNode.appendChild(child.node);
        child.parent = this;
        child.root = this.root;
        child.updateTransformation();
        child.hidden = false;
        this.childTransformationsChanged();
        return true;
    }

    removeChild(child) {
        child.hidden = true;
        window.setTimeout(this.removeChildImmediately.bind(this, child), 250);
    }

    removeChildImmediately(child) {
        const index = this.children.indexOf(child);
        if(index == -1)
            return false;
        this.children.splice(index, 1);
        this.contentNode.removeChild(child.node);
        this.childTransformationsChanged();
        return true;
    }

    set selected(value) {}

    getSelectedChildren() {
        const result = new Set([]);
        for(const child of this.children)
            if(child.selected)
                result.add(child);
        return result;
    }

    deselectChildren() {
        for(const child of this.children) {
            child.selected = false;
            if(child.deselectChildren)
                child.deselectChildren();
        }
    }

    selectIfInside(min, max, toggle) {
        super.selectIfInside(min, max, toggle);
        for(const child of this.children)
            child.selectIfInside(min, max, toggle);
    }

    updateTransformation() {
        super.updateTransformation();
        this.node.setAttribute('transform', 'translate('+this.position[0]+', '+this.position[1]+')');
    }

    childTransformationsChanged() {
        vec2.scale(this.minPosition, this.minPosition, 0.0);
        vec2.scale(this.maxPosition, this.maxPosition, 0.0);
        for(const child of this.children) {
            vec2.min(this.minPosition, this.minPosition, child.minPosition);
            vec2.max(this.maxPosition, this.maxPosition, child.maxPosition);
        }
        vec2.sub(this.minPosition, this.minPosition, this.padding);
        vec2.add(this.maxPosition, this.maxPosition, this.padding);
        vec2.sub(this.size, this.maxPosition, this.minPosition);
        this.updateTransformation();
    }
}

export class ScreenPanel extends ContainerPanel {
    constructor(parentNode, size) {
        super(vec2.create(), size, Panel.createElement('svg', parentNode));
        this.root = this;
        this.contentNode = this.node;
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
        this.updateTransformation();
    }

    childTransformationsChanged() {}

    updateTransformation() {
        super.updateTransformation();
        this.node.setAttribute('width', this.size[0]);
        this.node.setAttribute('height', this.size[1]);
    }
}

let clipPathID = 0;
export class ClippingPanel extends ContainerPanel {
    constructor(position, size) {
        super(position, size);
        this.rectPanel = new RectPanel(this, vec2.create(), size);
        this.node.setAttribute('clip-path', 'url(#clipPath'+clipPathID+')');
        this.rectPanel.node.setAttribute('id', 'clipRect'+clipPathID);
        this.clipNode = Panel.createElement('clipPath', this.node);
        this.clipNode.setAttribute('id', 'clipPath'+clipPathID);
        this.useNode = Panel.createElement('use', this.clipNode);
        Panel.setAttribute(this.useNode, 'href', '#clipRect'+clipPathID);
        ++clipPathID;
    }

    updateTransformation() {
        super.updateTransformation();
        this.rectPanel.updateTransformation();
    }
}

export class ViewPanel extends ClippingPanel {
    constructor(parent, position, size) {
        super(position, size);
        this.contentNode = Panel.createElement('g', this.node);
        this.translation = vec2.create();
        this.scale = 1.0;
        this.minScale = 0.125;
        this.maxScale = 1.0;
        this.registerPointerEvents(function(event) {
            if(event.modifierKey) {
                this.dragOrigin = this.mapPositionInView(event.pointers[0].position);
                return [function(event) {
                    if(!this.selectionRect) {
                        this.selectionRect = new RectPanel(this, vec2.create(), vec2.create());
                        this.selectionRect.node.classList.add('disabled');
                    }
                    const cursor = this.mapPositionInView(event.pointers[0].position);
                    this.selectionRect.setBounds(this.dragOrigin, cursor);
                    this.selectionRect.updateTransformation();
                }.bind(this), function(event) {
                    if(!this.selectionRect)
                        return;
                    this.selectIfInside(this.selectionRect.minPosition, this.selectionRect.maxPosition, event.modifierKey);
                    this.selectionRect.selected = false;
                    this.removeChild(this.selectionRect);
                    delete this.selectionRect;
                }.bind(this)];
            } else {
                this.dragOrigin = event.pointers[0].position;
                this.prevTranslation = this.translation;
                this.translation = vec2.clone(this.translation);
                return [function(event) {
                    vec2.sub(this.translation, event.pointers[0].position, this.dragOrigin);
                    vec2.add(this.translation, this.translation, this.prevTranslation);
                    this.updateContentTransformation();
                }.bind(this), function(event) {
                    if(vec2.squaredDistance(this.prevTranslation, this.translation) == 0)
                        this.deselectChildren();
                    delete this.prevTranslation;
                }.bind(this)];
            }
        }.bind(this), this.rectPanel.node);
        parent.appendChild(this);
    }

    zoom(factor, position) {
        factor = Math.min(Math.max(factor*this.scale, this.minScale), this.maxScale)/this.scale;
        this.scale *= factor;
        vec2.sub(this.translation, this.translation, position);
        vec2.scale(this.translation, this.translation, factor);
        vec2.add(this.translation, this.translation, position);
        this.updateContentTransformation();
    }

    mapPositionInView(position) {
        const cursor = vec2.create();
        vec2.sub(cursor, position, this.translation);
        vec2.scale(cursor, cursor, 1.0/this.scale);
        return cursor;
    }

    updateContentTransformation() {
        this.contentNode.setAttribute('transform', 'translate('+this.translation[0]+', '+this.translation[1]+') scale('+this.scale+')');
    }
}

export class PointerDragPanel extends ContainerPanel {
    constructor(parent, position, size) {
        super(position, size);
        this.repulsionForce = 100.0;
        parent.appendChild(this);
    }

    appendChild(child) {
        super.appendChild(child);
        child.registerPointerEvents(function(event) {
            child.node.classList.remove('fadeIn');
            if(event.modifierKey) {
                child.selected = !child.selected;
                return [];
            }
            child.selected = true;
            delete this.animationTime;
            this.dragChildren = new Map();
            for(const child of this.children)
                if(child.selected)
                    this.dragChildren.set(child, vec2.clone(child.position));
            this.dragOrigin = event.pointers[0].position;
            return [function(event) {
                for(const [child, prevPosition] of this.dragChildren) {
                    vec2.sub(child.position, event.pointers[0].position, this.dragOrigin);
                    if(this.parent.scale)
                        vec2.scale(child.position, child.position, 1.0/this.parent.scale);
                    vec2.add(child.position, child.position, prevPosition);
                    child.updateTransformation();
                }
            }.bind(this), function(event) {
                if(!event.modifierKey)
                    this.deselectChildren();
                this.childTransformationsChanged();
            }.bind(this)];
        }.bind(this));
    }

    childTransformationsAnimation(time) {
        if(!this.animationTime)
            return;
        const timeDelta = time-this.animationTime;
        this.animationTime = time;
        for(const child of this.children)
            child.force = vec2.create();
        const min = vec2.create(), max = vec2.create(), diff = vec2.create();
        let done = true;
        for(let i = 0; i < this.children.length; ++i)
            for(let j = i+1; j < this.children.length; ++j) {
                vec2.max(min, this.children[j].minPosition, this.children[i].minPosition);
                vec2.min(max, this.children[j].maxPosition, this.children[i].maxPosition);
                if(min[0] < max[0] && min[1] < max[1]) {
                    done = false;
                    vec2.sub(diff, this.children[j].position, this.children[i].position);
                    vec2.scale(diff, diff, timeDelta*this.repulsionForce/vec2.dot(diff, diff));
                    vec2.sub(this.children[i].force, this.children[i].force, diff);
                    vec2.add(this.children[j].force, this.children[j].force, diff);
                }
            }
        for(const child of this.children) {
            vec2.add(child.position, child.position, child.force);
            delete child.force;
            child.updateTransformation();
        }
        if(done) {
            delete this.animationTime;
            return;
        }
        super.childTransformationsChanged();
        window.requestAnimationFrame(this.childTransformationsAnimation.bind(this));
    }

    childTransformationsChanged() {
        if(!this.repulsionForce || this.animationTime)
            return;
        this.animationTime = performance.now();
        window.requestAnimationFrame(this.childTransformationsAnimation.bind(this));
    }
}

export class TilingPanel extends ContainerPanel {
    constructor(parent, position) {
        super(position, vec2.create());
        this.axis = 0;
        this.alignment = 0;
        this.animationDuration = 0;
        parent.appendChild(this);
    }

    appendChild(child) {
        child.animation = {'size': vec2.clone(child.size)};
        super.appendChild(child);
    }

    childTransformationsAnimation(time) {
        const factor = Math.min(1, (time-this.animationTime)/this.animationDuration),
              diff = vec2.create();
        for(const child of this.children) {
            vec2.sub(diff, child.animation.dstSize, child.animation.srcSize);
            vec2.scale(diff, diff, factor);
            vec2.add(child.size, child.animation.srcSize, diff);
            child.animation.size = vec2.clone(child.size);
            vec2.sub(diff, child.animation.dstPosition, child.animation.srcPosition);
            vec2.scale(diff, diff, factor);
            vec2.add(child.position, child.animation.srcPosition, diff);
            child.updateTransformation();
        }
        super.childTransformationsChanged();
        if(factor == 1)
            delete this.animationTime;
        else
            window.requestAnimationFrame(this.childTransformationsAnimation.bind(this));
    }

    childTransformationsChanged() {
        let max = 0, offset = 0;
        for(const child of this.children) {
            max = Math.max(max, child.size[this.axis]);
            offset += child.size[1-this.axis];
        }
        offset *= -0.5;
        for(const child of this.children) {
            let position = child.position;
            if(this.animationDuration) {
                child.animation.srcSize = vec2.clone(child.animation.size);
                child.animation.dstSize = vec2.clone(child.size);
                child.animation.srcPosition = vec2.clone(child.position);
                child.animation.dstPosition = position = vec2.create();
            }
            position[this.axis] = (max-child.size[this.axis])*this.alignment;
            position[1-this.axis] = offset+child.size[1-this.axis]*0.5;
            offset += child.size[1-this.axis];
        }
        if(!this.animationDuration) {
            super.childTransformationsChanged();
            return;
        }
        if(!this.animationTime)
            window.requestAnimationFrame(this.childTransformationsAnimation.bind(this));
        this.animationTime = performance.now();
    }
}
