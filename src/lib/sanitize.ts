import 'server-only';
import sanitizeHtml from 'sanitize-html';

// Campaign content is written by whoever runs that campaign, and shown to their players.
// Everything is passed through here on the server before it is sent, so a DM cannot put
// script, event handlers, forms that post elsewhere, or outside images in front of their
// players, whatever they saved (through the editor or straight to the database).

const SAFE_VALUE = /^(?!.*url\s*\()(?!.*expression)(?!.*@import)[\w\s.,%#()+\-/'"!]*$/i;
const STYLE_PROPS = ['color', 'background-color', 'font-size', 'font-style', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'white-space',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'max-width', 'min-width', 'width', 'display', 'opacity', 'border-color', 'vertical-align'];
const allowedStyles = { '*': Object.fromEntries(STYLE_PROPS.map((p) => [p, [SAFE_VALUE]])) };

const GLOBAL = ['class', 'style', 'id', 'title', 'hidden', 'role', 'lang', 'aria-label', 'aria-hidden', 'aria-pressed', 'aria-selected',
  'data-go', 'data-race', 'data-race-detail', 'data-row', 'data-i'];
const SVG_ATTRS = ['viewBox', 'viewbox', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'transform',
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'text-anchor', 'xmlns'];

const base: sanitizeHtml.IOptions = {
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  allowedStyles,
  parser: { lowerCaseAttributeNames: false },
  disallowedTagsMode: 'discard',
};

const CONTENT: sanitizeHtml.IOptions = {
  ...base,
  allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'b', 'strong', 'i', 'em', 'u', 's', 'br', 'hr', 'span', 'div', 'a', 'small', 'sub', 'sup',
    'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'header', 'section', 'details', 'summary', 'label', 'input',
    'svg', 'g', 'path', 'circle', 'ellipse', 'line', 'rect', 'polygon', 'polyline', 'text'],
  allowedAttributes: {
    '*': GLOBAL,
    a: ['href', 'target', 'rel'],
    th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'],
    input: [{ name: 'type', values: ['checkbox'] }, 'checked', 'disabled'],
    svg: SVG_ATTRS, g: SVG_ATTRS, path: SVG_ATTRS, circle: SVG_ATTRS, ellipse: SVG_ATTRS, line: SVG_ATTRS, rect: SVG_ATTRS, polygon: SVG_ATTRS, polyline: SVG_ATTRS, text: SVG_ATTRS,
  },
  transformTags: {
    a: (tagName, attribs) => ({ tagName, attribs: attribs.target ? { ...attribs, rel: 'noopener noreferrer' } : attribs }),
    // the only input a content page has is a checklist tick box
    input: (tagName, attribs) => ({ tagName, attribs: { ...attribs, type: 'checkbox' } }),
  },
};

// The My character form: plain fields the sheet script fills in. No forms, links, or scripts.
const FORM: sanitizeHtml.IOptions = {
  ...base,
  allowedTags: ['section', 'div', 'h2', 'h3', 'h4', 'p', 'span', 'b', 'i', 'em', 'strong', 'small', 'br', 'label', 'input', 'select', 'option', 'textarea', 'button', 'ul', 'li'],
  allowedAttributes: {
    '*': ['class', 'style', 'id', 'hidden', 'aria-label', 'data-k', 'title'],
    input: [{ name: 'type', values: ['text', 'number', 'checkbox'] }, 'min', 'max', 'value', 'placeholder', 'autocomplete', 'inputmode', 'readonly', 'checked'],
    textarea: ['rows', 'placeholder', 'autocomplete', 'spellcheck', 'readonly'],
    select: [], option: ['value', 'selected'],
    button: [{ name: 'type', values: ['button'] }],
  },
  transformTags: {
    button: (tagName, attribs) => ({ tagName, attribs: { ...attribs, type: 'button' } }),
  },
};

export const cleanContent = (html: string) => sanitizeHtml(html, CONTENT);
export const cleanForm = (html: string) => sanitizeHtml(html, FORM);

// One value of a campaign theme (a colour or a font list) as it may appear in a style attribute.
export const safeCssValue = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s && s.length <= 200 && SAFE_VALUE.test(s) ? s : null;
};
