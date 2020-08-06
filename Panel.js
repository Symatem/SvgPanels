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

    addEventListener(eventType, callback) {
        this.eventListeners[eventType] = callback;
    }

    dispatchEvent(event) {
        event.target = event.originalTarget = this;
        while(event.target) {
            if(event.target.eventListeners[event.type]) {
                delete event.propagateTo;
                return event.target.eventListeners[event.type](event);
            }
            switch(event.propagateTo) {
                case 'parent':
                    event.target = event.target.parent;
                    break;
                case 'children': {
                    if(!this.children || (event.bounds && (
                        event.bounds[1][0] <= -0.5*event.target.size[0] || 0.5*event.target.size[0] <= event.bounds[0][0] ||
                        event.bounds[1][1] <= -0.5*event.target.size[1] || 0.5*event.target.size[1] <= event.bounds[0][1]
                    )))
                        return;
                    const childEvent = Object.assign({}, event);
                    for(const child of this.children) {
                        if(event.bounds) {
                            childEvent.bounds = [vec2.create(), vec2.create()];
                            vec2.sub(childEvent.bounds[0], event.bounds[0], child.position);
                            vec2.sub(childEvent.bounds[1], event.bounds[1], child.position);
                        }
                        child.dispatchEvent(childEvent);
                    }
                } default:
                    return;
            }
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

    actionOrSelect(event) {
        event.type = 'toolbarcontext';
        event.propagateTo = 'parent';
        this.dispatchEvent(event);
        if(event.shiftKey) {
            event.type = 'select';
            event.propagateTo = 'parent';
            event.mode = 'inverse';
            this.dispatchEvent(event);
        } else {
            event.type = 'action';
            event.propagateTo = 'parent';
            if(!this.dispatchEvent(event)) {
                this.root.toolBarPanel.contextSelect('none', event);
                event.type = 'select';
                event.mode = 'all';
                this.dispatchEvent(event);
            }
        }
    }

    registerSelectEvent(onSelect) {
        this.addEventListener('select', (event) => {
            if(event.bounds && (
                event.bounds[0][0] > -0.5*event.target.size[0] || 0.5*event.target.size[0] > event.bounds[1][0] ||
                event.bounds[0][1] > -0.5*event.target.size[1] || 0.5*event.target.size[1] > event.bounds[1][1]
            ))
                return;
            if(event.mode == 'inverse')
                this.selected = !this.selected;
            else
                this.selected = (event.mode == 'all');
            if(onSelect)
                onSelect(event);
        });
    }

    registerActionEvent(action) {
        this.addEventListener('pointerstart', (event) => true);
        this.addEventListener('action', (event) => {
            action(event);
            return true;
        });
    }

    registerDragEvent(onDrag) {
        this.addEventListener('pointerstart', (event) => true);
        this.addEventListener('drag', (event) => {
            this.root.drag(onDrag, event);
        });
    }

    registerDropEvent(acceptsDrop, onDrop) {
        this.addEventListener('maydrop', (event) => acceptsDrop(event.item));
        this.addEventListener('drop', (event) => {
            if(!acceptsDrop(event.item))
                return false;
            onDrop(event.item);
            return true;
        });
    }

    registerFocusEvent(focusNode) {
        this.addEventListener('focus', (event) => {
            if(!this.root || this.root.focusedPanel == this)
                return;
            focusNode.classList.add('focused');
            if(this.root.focusedPanel)
                this.root.focusedPanel.dispatchEvent({'type': 'defocus'});
            this.root.focusedPanel = this;
            this.root.focusedPanel.dispatchEvent({'type': 'movefocusinview', 'propagateTo': 'parent', 'source': event.source, 'item': this});
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
            if(event.direction != 'in') {
                const axis = (event.direction == 'left' || event.direction == 'right') ? 0 : 1,
                      indexIncrement = (event.direction == 'left' || event.direction == 'up' ? -1 : 1)*(this.reverse ? -1 : 1);
                if(this.axis != axis)
                    return false;
                child = this.children[index+indexIncrement];
            } else if(this.children.length > 0)
                child = this.children[(this.children.length-1)>>1];
            for(let d = 0; d < depth && child; ++d)
                child = child.children && child.children[0];
            if(child)
                child.dispatchEvent({'type': 'focus'});
            return true;
        });
    }
}
