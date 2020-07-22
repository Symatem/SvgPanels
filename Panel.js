import { vec2, mat2d } from './gl-matrix/src/index.js';
export { vec2, mat2d };

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
        this.eventListeners = {};
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

    animateVisibilityTo(visible) {
        this.visibilityAnimation = this.node.animate({'opacity': [0, 1]}, {
            'direction': visible ? 'normal' : 'reverse',
            'duration': 250,
            'iterations': 1,
            'easing': 'ease-in-out'
        });
        const parent = this.parent;
        this.visibilityAnimation.onfinish = () => {
            delete this.visibilityAnimation;
            if(!visible) {
                parent.removeChild(this);
                parent.recalculateLayout();
            }
        };
    }

    resetVisibilityAnimation() {
        if(this.visibilityAnimation) {
            this.visibilityAnimation.cancel();
            delete this.visibilityAnimation;
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

    addEventListener(eventType, callback) {
        this.eventListeners[eventType] = callback;
    }

    dispatchEvent(event) {
        event.target = event.originalTarget = this;
        while(event.target) {
            if(event.target.eventListeners[event.type])
                return event.target.eventListeners[event.type](event);
            if(!event.bubbles)
                return;
            event.target = event.target.parent;
        }
    }

    static dispatchEvent(event) {
        const element = document.elementFromPoint(event.position[0], event.position[1]);
        return (element && element.panel) ? element.panel.dispatchEvent(event) : undefined;
    }

    relativePosition(position) {
        const bounds = this.node.getBoundingClientRect();
        return vec2.fromValues(position[0]-bounds.x-bounds.width*0.5, position[1]-bounds.y-bounds.height*0.5);
    }

    registerDragEvent(onDragStart) {
        this.addEventListener('pointerstart', (event) => {});
        this.addEventListener('pointermove', (event) => {
            if(!event.moved) {
                const root = this.root,
                      rootPosition = this.getRootPosition();
                event.item = onDragStart();
                event.item.node.classList.add('disabled');
                root.overlays.insertChild(event.item);
                event.offset = vec2.create();
                if(Object.getPrototypeOf(this) == Object.getPrototypeOf(event.item))
                    vec2.sub(event.offset, rootPosition, event.position);
                else
                    vec2.scaleAndAdd(event.offset, event.offset, root.size, -0.5);
            }
            if(event.item) {
                vec2.add(event.item.position, event.offset, event.position);
                event.item.updatePosition();
                document.body.style.cursor = this.constructor.dispatchEvent({'type': 'mayDrop', 'bubbles': true, 'position': event.position, 'item': event.item}) ? 'alias' : 'no-drop';
            }
        });
        this.addEventListener('pointerend', (event) => {
            if(event.moved && event.item) {
                document.body.style.cursor = '';
                event.item.node.classList.remove('disabled');
                this.root.overlays.removeChild(event.item);
                this.constructor.dispatchEvent({'type': 'drop', 'bubbles': true, 'position': event.position, 'item': event.item});
            }
        });
    }

    registerDropEvent(acceptsDrop, onDrop) {
        this.addEventListener('mayDrop', (event) => acceptsDrop(event.item));
        this.addEventListener('drop', (event) => {
            if(!acceptsDrop(event.item))
                return false;
            onDrop(event.item);
            return true;
        });
    }

    registerActionEvent(action) {
        this.addEventListener('pointerstart', (event) => {});
        this.addEventListener('action', action);
    }

    registerFocusEvent(focusNode) {
        this.addEventListener('focus', (event) => {
            if(!this.root || this.root.focusedPanel == this)
                return;
            focusNode.classList.add('focused');
            if(this.root.focusedPanel)
                this.root.focusedPanel.dispatchEvent({'type': 'defocus'});
            this.root.focusedPanel = this;
        });
        this.addEventListener('defocus', (event) => {
            focusNode.classList.remove('focused');
            if(this.root)
                delete this.root.focusedPanel;
        });
    }

    registerFocusNavigationEvent(depth=0) {
        this.addEventListener('focusnavigation', (event) => {
            let child = this.root.focusedPanel;
            for(let d = 0; d < depth && child; ++d)
                child = child.parent;
            let index = this.children.indexOf(child);
            child = undefined;
            switch(event.direction) {
                case 'in':
                    if(this.children.length > 0)
                        child = this.children[(this.children.length-1)>>1];
                    break;
                case 'left':
                    if(this.axis == 0)
                        child = this.children[index-1];
                    break;
                case 'right':
                    if(this.axis == 0)
                        child = this.children[index+1];
                    break;
                case 'up':
                    if(this.axis == 1)
                        child = this.children[index-1];
                    break;
                case 'down':
                    if(this.axis == 1)
                        child = this.children[index+1];
                    break;
            }
            for(let d = 0; d < depth && child; ++d)
                child = child.children && child.children[0];
            if(child)
                child.dispatchEvent({'type': 'focus'});
            return true;
        });
    }
}
