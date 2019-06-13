import { vec2, mat2d } from './gl-matrix.js';

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

    static animate(callback) {
        let prevTimestamp = performance.now();
        const animationFrame = (timestamp) => {
            if(!callback(timestamp-prevTimestamp))
                return;
            prevTimestamp = timestamp;
            window.requestAnimationFrame(animationFrame);
        };
        animationFrame(prevTimestamp);
    }

    constructor(position, size, node) {
        this.position = position;
        this.size = size;
        this.node = node;
        this._selected = false;
        if(node)
            node.panel = this;
    }

    updatePosition() {
        if(this.node)
            this.node.setAttribute('transform', `translate(${this.position[0]}, ${this.position[1]})`);
    }

    updateSize() {}

    recalculateLayout() {}

    getBounds() {
        const minPosition = vec2.create(),
              maxPosition = vec2.create();
        vec2.scale(minPosition, this.size, 0.5);
        vec2.add(maxPosition, this.position, minPosition);
        vec2.sub(minPosition, this.position, minPosition);
        return [minPosition, maxPosition];
    }

    setBounds(positionA, positionB) {
        const minPosition = vec2.create(),
              maxPosition = vec2.create();
        vec2.min(minPosition, positionA, positionB);
        vec2.max(maxPosition, positionA, positionB);
        vec2.sub(this.size, maxPosition, minPosition);
        vec2.add(this.position, minPosition, maxPosition);
        vec2.scale(this.position, this.position, 0.5);
    }

    getRootMatrix() {
        const mat = this.root.centeringPanel.node.getScreenCTM().inverse().multiply(this.node.getScreenCTM());
        return mat2d.fromValues(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f);
    }

    getRootPosition() {
        const rootCTM = this.root.centeringPanel.node.getScreenCTM(), nodeCTM = this.node.getScreenCTM();
        return vec2.fromValues(nodeCTM.e-rootCTM.e, nodeCTM.f-rootCTM.f);
    }

    getNthParent(n) {
        let panel = this;
        while(panel && n > 0) {
            panel = panel.parent;
            --n;
        }
        return panel;
    }

    get root() {
        return this._root;
    }

    set root(root) {
        this._root = root;
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

    get visible() {
        return !this.node.classList.contains('fadeOut');
    }

    animateVisibilityTo(visible) {
        if(visible) {
            this.node.classList.remove('fadeOut');
            this.node.classList.add('fadeIn');
        } else {
            this.node.classList.remove('fadeIn');
            this.node.classList.add('fadeOut');
        }
    }

    selectIfInside(min, max, toggle) {
        const bounds = this.getBounds();
        if(min[0] > bounds[0][0] || min[1] > bounds[0][1] || max[0] < bounds[1][0] || max[1] < bounds[1][1])
            return;
        if(toggle)
            this.selected = !this.selected;
        else
            this.selected = true;
    }

    registerPointerEvents(onPointerStart, onZoom, referenceNode) {
        function dualPointerDistance(event) {
            return (event.pointers.length == 2) ? vec2.distance(event.pointers[0].position, event.pointers[1].position) : 0;
        }
        function refineEvent(event) {
            if(event.touches) {
                event.modifierKey = (event.touches.length === 2);
                event.pointers = event.changedTouches;
            } else {
                event.modifierKey = event.shiftKey;
                event.pointers = [event];
            }
            if(referenceNode) {
                const bounds = referenceNode.getBoundingClientRect();
                for(const pointer of event.pointers)
                    pointer.position = vec2.fromValues(pointer.clientX-bounds.x-bounds.width*0.5, pointer.clientY-bounds.y-bounds.height*0.5);
            } else for(const pointer of event.pointers)
                pointer.position = vec2.fromValues(pointer.clientX, pointer.clientY);
        }
        if(onZoom)
            this.node.onwheel = (event) => {
                event.stopPropagation();
                event.preventDefault();
                refineEvent(event);
                onZoom(Math.pow(2, event.deltaY*0.1), event.pointers[0].position);
            };
        this.node.onmousedown = this.node.ontouchstart = (event) => {
            event.stopPropagation();
            event.preventDefault();
            refineEvent(event);
            let primaryTouchID, zoomPointerDistance, moved = false;
            if(event.touches) {
                primaryTouchID = event.touches[0].identifier;
                zoomPointerDistance = dualPointerDistance(event);
                zoomPointerDistance = (zoomPointerDistance < 300) ? 0 : zoomPointerDistance;
            }
            const [onPointerMoved, onPointerEnd] = onPointerStart(event);
            this.root.node.onmousemove = this.root.node.ontouchmove = (event) => {
                event.stopPropagation();
                event.preventDefault();
                refineEvent(event);
                if(zoomPointerDistance) {
                    const dist = dualPointerDistance(event);
                    if(dist > 0 && onZoom) {
                        const center = vec2.create();
                        vec2.add(center, event.pointers[0].position, event.pointers[1].position);
                        vec2.scale(center, center, 0.5);
                        onZoom(dist/zoomPointerDistance, center);
                        zoomPointerDistance = dist;
                    }
                } else if(onPointerMoved)
                    onPointerMoved(event, moved);
                moved = true;
            };
            this.root.node.onmouseup = this.root.node.ontouchend = this.root.node.onmouseleave = this.root.node.ontouchleave = this.root.node.ontouchcancel = (event) => {
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
                if(onPointerEnd)
                    onPointerEnd(event, moved);
            };
            if(event.type === 'touchstart') {
                this.node.onmousedown = null;
                this.root.node.onmousemove = null;
                this.root.node.onmouseup = null;
                this.root.node.onmouseleave = null;
            }
        };
    }

    registerClickEvent(onClick) {
        this.registerPointerEvents(() => {
            return [undefined, (event, moved) => {
                if(!moved)
                    onClick();
            }];
        });
    }
}
