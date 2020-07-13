import { vec2 } from './gl-matrix.js';
import { Panel } from './Panel.js';

const phantomRoot = Panel.createElement('svg');
document.body.appendChild(phantomRoot);
phantomRoot.setAttribute('width', 0);
phantomRoot.setAttribute('height', 0);

export class LabelPanel extends Panel {
    constructor(position, text) {
        super(position, vec2.create(), Panel.createElement('text'));
        this.text = text;
    }

    recalculateLayout() {
        if(!this.root)
            phantomRoot.appendChild(this.node);
        const bbox = this.node.getBBox();
        if(!this.root && this.parent)
            this.parent.node.appendChild(this.node);
        this.size[0] = bbox.width;
        this.size[1] = bbox.height;
        this.updateSize();
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
        super.updateSize();
        this.node.setAttribute('r', Math.min(this.size[0], this.size[1])*0.5);
    }
}

export class RectPanel extends Panel {
    constructor(position, size) {
        super(position, size, Panel.createElement('rect'));
    }

    updateSize() {
        super.updateSize();
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
        this.cornerRadiusTopLeft = 4;
        this.cornerRadiusTopRight = 4;
        this.cornerRadiusBottomLeft = 4;
        this.cornerRadiusBottomRight = 4;
        this.arrowSize = 10;
        this.arrowOrigin = vec2.create();
    }

    updateSize() {
        super.updateSize();
        const arrowSizeAbs = Math.abs(this.arrowSize),
              first = (Math.sqrt(2.0)-1.0)*4.0/3.0,
              second = 1.0-first;
        let data = `M${-0.5*this.size[0]} ${this.cornerRadiusTopLeft-0.5*this.size[1]}`
        if(this.cornerRadiusTopLeft > 0)
            data += `c0 ${-this.cornerRadiusTopLeft*first} ${this.cornerRadiusTopLeft*second} ${-this.cornerRadiusTopLeft} ${this.cornerRadiusTopLeft} ${-this.cornerRadiusTopLeft}`;
        if(this.arrowOrigin[1] == -this.size[1]*0.5) {
            const length = 0.5*this.size[0]-arrowSizeAbs;
            data += `h${length+this.arrowOrigin[0]-this.cornerRadiusTopLeft}l${arrowSizeAbs} ${-this.arrowSize}l${arrowSizeAbs} ${this.arrowSize}h${length-this.arrowOrigin[0]-this.cornerRadiusTopRight}`;
        } else
            data += `h${this.size[0]-this.cornerRadiusTopLeft-this.cornerRadiusTopRight}`;
        if(this.cornerRadiusTopRight > 0)
            data += `c${this.cornerRadiusTopRight*first} 0 ${this.cornerRadiusTopRight} ${this.cornerRadiusTopRight*second} ${this.cornerRadiusTopRight} ${this.cornerRadiusTopRight}`;
        if(this.arrowOrigin[0] == this.size[0]*0.5) {
            const length = 0.5*this.size[1]-arrowSizeAbs;
            data += `v${length+this.arrowOrigin[1]-this.cornerRadiusTopRight}l${this.arrowSize} ${arrowSizeAbs}l${-this.arrowSize} ${arrowSizeAbs}v${length-this.arrowOrigin[1]-this.cornerRadiusBottomRight}`;
        } else
            data += `v${this.size[1]-this.cornerRadiusTopRight-this.cornerRadiusBottomRight}`;
        if(this.cornerRadiusBottomRight > 0)
            data += `c0 ${this.cornerRadiusBottomRight*first} ${-this.cornerRadiusBottomRight*second} ${this.cornerRadiusBottomRight} ${-this.cornerRadiusBottomRight} ${this.cornerRadiusBottomRight}`;
        if(this.arrowOrigin[1] == this.size[1]*0.5) {
            const length = arrowSizeAbs-0.5*this.size[0];
            data += `h${length+this.arrowOrigin[0]+this.cornerRadiusBottomRight}l${-arrowSizeAbs} ${this.arrowSize}l${-arrowSizeAbs} ${-this.arrowSize}h${length-this.arrowOrigin[0]+this.cornerRadiusBottomLeft}`;
        } else
            data += `h${this.cornerRadiusBottomLeft+this.cornerRadiusBottomRight-this.size[0]}`;
        if(this.cornerRadiusBottomLeft > 0)
            data += `c${-this.cornerRadiusBottomLeft*first} 0 ${-this.cornerRadiusBottomLeft} ${-this.cornerRadiusBottomLeft*second} ${-this.cornerRadiusBottomLeft} ${-this.cornerRadiusBottomLeft}`;
        if(this.arrowOrigin[0] == -this.size[0]*0.5) {
            const length = arrowSizeAbs-0.5*this.size[1];
            data += `v${length+this.arrowOrigin[1]+this.cornerRadiusBottomLeft}l${-this.arrowSize} ${-arrowSizeAbs}l${this.arrowSize} ${-arrowSizeAbs}z`;
        } else
            data += 'z'; // `v${this.cornerRadiusBottomLeft+this.cornerRadiusTopLeft-this.size[1]}`;
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
        this.bodyElement.panel = this.embeddedNode.panel = this;
    }

    updateSize() {
        super.updateSize();
        this.node.setAttribute('x', -0.5*this.size[0]);
        this.node.setAttribute('y', -0.5*this.size[1]);
        this.node.setAttribute('width', this.size[0]);
        this.node.setAttribute('height', this.size[1]);
    }
}

class TextPanel extends XhtmlPanel {
    constructor(position, size, tag) {
        super(position, size, tag);
        this.embeddedNode.addEventListener('keydown', (event) => {
            if(!event.metaKey && !event.ctrlKey)
                event.stopPropagation();
            if(event.key == 'Tab') {
                event.preventDefault();
                if(event.shiftKey)
                    this.embeddedNode.blur();
                else {
                    const index = this.embeddedNode.selectionStart+1;
                    this.text = this.text.slice(0, this.embeddedNode.selectionStart)+'\t'+this.text.slice(this.embeddedNode.selectionEnd);
                    this.embeddedNode.setSelectionRange(index, index);
                }
                return;
            }
            this.dispatchEvent({'type': 'input', 'source': 'keyboard'});
        });
        this.embeddedNode.onblur = this.embeddedNode.onchange = (event) => {
            this.dispatchEvent({'type': 'change', 'source': 'keyboard'});
        };
        this.registerActionEvent((event) => {
            this.embeddedNode.focus();
        });
        this.registerFocusEvent(this.embeddedNode);
    }

    get text() {
        return this.embeddedNode.value;
    }

    set text(text) {
        this.embeddedNode.value = text;
    }
}

export class TextFieldPanel extends TextPanel {
    constructor(position, size) {
        super(position, size, 'input');
        this.embeddedNode.setAttribute('type', 'text');
    }
}

export class TextAreaPanel extends TextPanel {
    constructor(position, size) {
        super(position, size, 'textarea');
    }
}

export class ImagePanel extends Panel {
    constructor(position, size, href) {
        super(position, size, Panel.createElement('image'));
        this.href = href;
        this.updateSize();
    }

    updateSize() {
        super.updateSize();
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
