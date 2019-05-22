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

    updatePosition() {
        this.node.setAttribute('transform', `translate(${this.position[0]}, ${this.position[1]})`);
    }

    updateSize() {}

    recalculateLayout() {
        vec2.scale(this.minPosition, this.size, 0.5);
        vec2.add(this.maxPosition, this.position, this.minPosition);
        vec2.sub(this.minPosition, this.position, this.minPosition);
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
            this.node.onwheel = (event) => {
                event.stopPropagation();
                event.preventDefault();
                refineEvent(event);
                this.zoom(Math.pow(2, event.deltaY*0.1), event.pointers[0].position);
            };
        this.node.onmousedown = this.node.ontouchstart = (event) => {
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
            this.root.node.onmousemove = this.root.node.ontouchmove = (event) => {
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
                } else if(pointerMoving)
                    pointerMoving(event);
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
                if(pointerEnd)
                    pointerEnd(event);
            };
            if(event.type === 'touchstart') {
                this.node.onmousedown = null;
                this.root.node.onmousemove = null;
                this.root.node.onmouseup = null;
                this.root.node.onmouseleave = null;
            }
        };
    }
}
