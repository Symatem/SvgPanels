import { vec2 } from './gl-matrix.js';
import { Panel } from './Panel.js';

export class LabelPanel extends Panel {
    constructor(position) {
        super(position, vec2.create(), Panel.createElement('text'));
    }

    recalculateLayout() {
        if(!this.parent)
            return;
        const bbox = this.node.getBBox();
        this.size[0] = bbox.width;
        this.size[1] = bbox.height;
        super.recalculateLayout();
    }

    get text() {
        return this.node.textContent;
    }

    set text(text) {
        this.node.textContent = text;
        this.recalculateLayout();
    }
}

export class CirclePanel extends Panel {
    constructor(position, size) {
        super(position, size, Panel.createElement('circle'));
    }

    updateSize() {
        this.node.setAttribute('r', Math.min(this.size[0], this.size[1]));
    }
}

export class RectPanel extends Panel {
    constructor(position, size) {
        super(position, size, Panel.createElement('rect'));
    }

    updateSize() {
        const width = Math.max(0, this.size[0]),
              height = Math.max(0, this.size[1]);
        this.node.setAttribute('x', -0.5*width);
        this.node.setAttribute('y', -0.5*height);
        this.node.setAttribute('width', width);
        this.node.setAttribute('height', height);
        if(!this.cornerRadius) {
            this.node.removeAttribute('rx');
            this.node.removeAttribute('ry');
        } else {
            this.node.setAttribute('rx', this.cornerRadius);
            this.node.setAttribute('ry', this.cornerRadius);
        }
    }
}

export class SpeechBalloonPanel extends Panel {
    constructor(position, size) {
        super(position, size, Panel.createElement('path'));
        this.node.classList.add('speechBalloon');
        this.cornerRadius = 4;
        this.arrowSize = 10;
        this.arrowOrigin = vec2.create();
    }

    updateSize() {
        const arrowSizeAbs = Math.abs(this.arrowSize),
              first = (Math.sqrt(2.0)-1.0)*4.0/3.0,
              second = 1.0-first;
        let data = `M${-0.5*this.size[0]} ${this.cornerRadius-0.5*this.size[1]}`
        if(this.cornerRadius > 0)
            data += `c0 ${-this.cornerRadius*first} ${this.cornerRadius*second} ${-this.cornerRadius} ${this.cornerRadius} ${-this.cornerRadius}`;
        if(this.arrowOrigin[1] == -this.size[1]*0.5) {
            const length = this.size[0]*0.5-this.cornerRadius-arrowSizeAbs;
            data += `h${length+this.arrowOrigin[0]}l${arrowSizeAbs} ${-this.arrowSize}l${arrowSizeAbs} ${this.arrowSize}h${length-this.arrowOrigin[0]}`;
        } else
            data += `h${this.size[0]-2*this.cornerRadius}`;
        if(this.cornerRadius > 0)
            data += `c${this.cornerRadius*first} 0 ${this.cornerRadius} ${this.cornerRadius*second} ${this.cornerRadius} ${this.cornerRadius}`;
        if(this.arrowOrigin[0] == this.size[0]*0.5) {
            const length = this.size[1]*0.5-this.cornerRadius-arrowSizeAbs;
            data += `v${length+this.arrowOrigin[1]}l${this.arrowSize} ${arrowSizeAbs}l${-this.arrowSize} ${arrowSizeAbs}v${length-this.arrowOrigin[1]}`;
        } else
            data += `v${this.size[1]-2*this.cornerRadius}`;
        if(this.cornerRadius > 0)
            data += `c0 ${this.cornerRadius*first} ${-this.cornerRadius*second} ${this.cornerRadius} ${-this.cornerRadius} ${this.cornerRadius}`;
        if(this.arrowOrigin[1] == this.size[1]*0.5) {
            const length = -(this.size[0]*0.5-this.cornerRadius-arrowSizeAbs);
            data += `h${length+this.arrowOrigin[0]}l${-arrowSizeAbs} ${this.arrowSize}l${-arrowSizeAbs} ${-this.arrowSize}h${length-this.arrowOrigin[0]}`;
        } else
            data += `h${2*this.cornerRadius-this.size[0]}`;
        if(this.cornerRadius > 0)
            data += `c${-this.cornerRadius*first} 0 ${-this.cornerRadius} ${-this.cornerRadius*second} ${-this.cornerRadius} ${-this.cornerRadius}`;
        if(this.arrowOrigin[0] == -this.size[0]*0.5) {
            const length = -(this.size[1]*0.5-this.cornerRadius-arrowSizeAbs);
            data += `v${length+this.arrowOrigin[1]}l${-this.arrowSize} ${-arrowSizeAbs}l${this.arrowSize} ${-arrowSizeAbs}z`;
        } else
            data += 'z';
        this.node.setAttribute('d', data);
    }
}

export class TabHandlePanel extends Panel {
    constructor(position, size) {
        super(position, size, Panel.createElement('path'));
        this.node.classList.add('tabHandle');
        this.margin = 2;
    }

    updateSize() {
        const first = (Math.sqrt(2.0)-1.0)*4.0/3.0,
              second = 1.0-first;
        let data = `M${this.margin-0.5*this.size[0]} ${0.5*this.size[1]}`
        data += `v${this.cornerRadius-this.size[1]}`;
        if(this.cornerRadius > 0)
            data += `c0 ${-this.cornerRadius*first} ${this.cornerRadius*second} ${-this.cornerRadius} ${this.cornerRadius} ${-this.cornerRadius}`;
        data += `h${this.size[0]-2*(this.margin+this.cornerRadius)}`;
        if(this.cornerRadius > 0)
            data += `c${this.cornerRadius*first} 0 ${this.cornerRadius} ${this.cornerRadius*second} ${this.cornerRadius} ${this.cornerRadius}`;
        data += `v${this.size[1]-this.cornerRadius}`;
        this.node.setAttribute('d', data);
    }
}

export class XhtmlPanel extends Panel {
    constructor(position, size, tag) {
        super(position, size, Panel.createElement('foreignObject'));
        this.bodyElement = document.createElementNS('http://www.w3.org/1999/xhtml', 'body');
        this.node.appendChild(this.bodyElement);
        this.embeddedNode = document.createElementNS('http://www.w3.org/1999/xhtml', tag);
        this.bodyElement.appendChild(this.embeddedNode);
    }

    updateSize() {
        this.node.setAttribute('x', -0.5*this.size[0]);
        this.node.setAttribute('y', -0.5*this.size[1]);
        this.node.setAttribute('width', this.size[0]);
        this.node.setAttribute('height', this.size[1]);
    }
}

export class TextFieldPanel extends XhtmlPanel {
    constructor(position, size) {
        super(position, size, 'input');
        this.embeddedNode.setAttribute('type', 'text');
    }

    get text() {
        return this.embeddedNode.value;
    }

    set text(text) {
        this.embeddedNode.value = text;
    }
}

export class TextAreaPanel extends XhtmlPanel {
    constructor(position, size) {
        super(position, size, 'textarea');
    }

    get text() {
        return this.embeddedNode.textContent;
    }

    set text(text) {
        this.embeddedNode.textContent = text;
    }
}

export class ImagePanel extends Panel {
    constructor(position, size) {
        super(position, size, Panel.createElement('image'));
    }

    updateSize() {
        this.node.setAttribute('x', -0.5*this.size[0]);
        this.node.setAttribute('y', -0.5*this.size[1]);
        this.node.setAttribute('width', this.size[0]);
        this.node.setAttribute('height', this.size[1]);
    }

    get href() {
        return this.node.getAttribute('href');
    }

    set href(href) {
        Panel.setAttribute(this.node, 'href', href);
    }
}
