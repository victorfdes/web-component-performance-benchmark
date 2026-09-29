import angular from 'angular';
import { buildPayload } from '../data/payload';
import { resetModel, updateFieldValue } from '../data/pipeline';
import { nextFrame } from '../metrics';
import type { CompiledField, CompiledFormModel, FieldValue, PayloadBuildResult } from '../types';
import type { RendererHandle, RendererMount } from './types';

const componentStyles = `
  :host { display:block; color:var(--ink); font-family:Manrope,Inter,system-ui,sans-serif; }
  * { box-sizing:border-box; }
  button,input,select,textarea { font:inherit; }
  .renderer-identity{display:flex;justify-content:space-between;gap:16px;margin:0 0 12px;color:#7f91a8;font:500 10px ui-monospace,SFMono-Regular,monospace;text-transform:uppercase;letter-spacing:.09em}.renderer-identity b{color:var(--cyan)}
  .claim-overview{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);background:#0c1725;margin-bottom:18px}.claim-overview div{padding:18px 20px;border-right:1px solid var(--line)}.claim-overview div:last-child{border:0}.claim-overview span{display:block;color:var(--muted);font:500 9px ui-monospace,SFMono-Regular,monospace;text-transform:uppercase;letter-spacing:.1em}.claim-overview strong{display:block;margin-top:6px;font-size:18px}
  .section-nav{position:sticky;top:0;z-index:3;display:flex;gap:4px;padding:8px;border:1px solid var(--line);background:rgba(7,16,29,.96);overflow:auto}.section-nav button{border:0;background:transparent;color:var(--muted);padding:9px 12px;white-space:nowrap;font-size:11px;cursor:pointer}.section-nav button:hover,.section-nav button:focus-visible{background:#17263a;color:var(--ink);outline:none}
  .form-section{margin-top:16px;border:1px solid var(--line);background:#0c1725;scroll-margin-top:60px}.form-section>header{display:grid;grid-template-columns:minmax(210px,1fr) 1.5fr auto;gap:24px;align-items:center;padding:20px 22px;border-bottom:1px solid var(--line)}.form-section>header>div{display:flex;align-items:center;gap:12px}.form-section>header span{color:var(--cyan);font:500 10px ui-monospace,SFMono-Regular,monospace}.form-section h2{font-size:16px;margin:0}.form-section header p{margin:0;color:var(--muted);font-size:12px}.form-section header>b{color:#64778d;font:500 9px ui-monospace,SFMono-Regular,monospace;text-transform:uppercase}
  .field-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line)}.field{min-width:0;padding:18px;background:#101b2a}.field-wide{grid-column:span 2}.field-check{display:flex;flex-direction:column;justify-content:center}.field>label{display:flex;justify-content:space-between;gap:8px;margin:0 0 8px;color:#c9d4e2;font-size:11px;font-weight:700}.field>label i{color:var(--amber);font:500 8px ui-monospace,SFMono-Regular,monospace;text-transform:uppercase;font-style:normal}.control-wrap>input,.control-wrap>select,.control-wrap>textarea,.affix-control{width:100%;border:1px solid #30445d;background:#091320;color:var(--ink);border-radius:3px;outline:0}.control-wrap>input,.control-wrap>select,.control-wrap>textarea{padding:10px 11px;min-height:39px}.control-wrap>textarea{resize:vertical}.control-wrap>input:focus,.control-wrap>select:focus,.control-wrap>textarea:focus,.affix-control:focus-within{border-color:var(--cyan);box-shadow:0 0 0 2px rgba(66,214,199,.12)}.control-wrap select[multiple]{min-height:92px}.control-wrap option{background:#101b2a}.affix-control{display:flex;align-items:center}.affix-control span{color:var(--muted);padding:0 10px}.affix-control input{min-width:0;width:100%;padding:10px 11px;border:0;background:transparent;color:inherit;outline:0}.suffix input{order:0}.suffix span{order:1}.radio-group{display:flex;gap:7px;flex-wrap:wrap}.radio-group label{padding:8px 10px;border:1px solid #30445d;background:#091320;font-size:10px}.check-control{display:flex!important;justify-content:flex-start!important;align-items:center;gap:10px!important;margin:0!important;cursor:pointer}.check-control input{position:absolute;opacity:0}.check-control>span{width:20px;height:20px;border:1px solid #40556e;background:#091320}.check-control input:checked+span{background:var(--cyan);box-shadow:inset 0 0 0 4px #091320}.check-control b{font-size:11px}.toggle-control>span{width:34px;border-radius:12px}.range-control{display:flex;gap:12px;align-items:center}.range-control input{width:100%;accent-color:var(--cyan)}.range-control output{min-width:35px;color:var(--cyan);font:500 11px ui-monospace,SFMono-Regular,monospace}.field-help{display:block;margin-top:7px;color:#72849a;font-size:9px}.field-errors{padding:0;margin:7px 0 0;list-style:none;color:#ff8f83;font-size:9px}
  @media(max-width:850px){.claim-overview{grid-template-columns:repeat(2,1fr)}.claim-overview div:nth-child(2){border-right:0}.field-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.form-section>header{grid-template-columns:1fr}.form-section header p{display:none}}
  @media(max-width:560px){.field-grid{grid-template-columns:1fr}.field-wide{grid-column:auto}.claim-overview{grid-template-columns:1fr}.claim-overview div{border-right:0;border-bottom:1px solid var(--line)}}
`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function assignControlAttributes(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, field: CompiledField): void {
  control.id = `wc-${field.id}`;
  control.dataset.field = field.id;
  control.setAttribute('aria-label', field.label);
  if (field.required) control.required = true;
  if (control instanceof HTMLInputElement) {
    if (field.min != null) control.min = String(field.min);
    if (field.max != null) control.max = String(field.max);
    if (field.step != null) control.step = String(field.step);
    if (field.pattern) control.pattern = field.pattern;
  }
}

export class ClaimFormElement extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private model: CompiledFormModel | null = null;

  constructor() {
    super();
    this.root.addEventListener('input', this.onInput);
    this.root.addEventListener('change', this.onInput);
    this.root.addEventListener('click', this.onClick);
  }

  load(model: CompiledFormModel): void {
    this.model = model;
    this.render();
    this.dispatchEvent(new CustomEvent('form-ready', { bubbles: true, composed: true }));
  }

  async buildPayload(): Promise<PayloadBuildResult> {
    if (!this.model) throw new Error('The form has not been loaded.');
    const result = await buildPayload(this.model);
    this.dispatchEvent(new CustomEvent('payload-built', { detail: result, bubbles: true, composed: true }));
    return result;
  }

  reset(): void {
    if (!this.model) return;
    resetModel(this.model);
    this.render();
  }

  async probeInteraction(): Promise<void> {
    if (!this.model) throw new Error('The form has not been loaded.');
    const input = this.root.querySelector<HTMLInputElement>('.field input[type="text"]');
    if (!input) throw new Error('Web Component interaction probe could not find a text field.');
    input.value = `${input.value} •`;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await nextFrame();
    const fieldId = input.dataset.field;
    if (!fieldId || this.model.values[fieldId] !== input.value) throw new Error('Web Component interaction probe was not committed.');
  }

  private readonly onInput = (event: Event): void => {
    if (!this.model) return;
    const control = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const fieldId = control.dataset.field;
    if (!fieldId) return;
    if (control instanceof HTMLInputElement && control.type === 'radio' && !control.checked) return;
    let value: FieldValue = control.value;
    if (control instanceof HTMLInputElement && (control.type === 'checkbox')) value = control.checked;
    else if (control instanceof HTMLInputElement && ['number', 'range'].includes(control.type)) value = Number(control.value);
    else if (control instanceof HTMLSelectElement && control.multiple) value = Array.from(control.selectedOptions, (option) => option.value);
    updateFieldValue(this.model, fieldId, value);
    this.refreshState();
    this.dispatchEvent(new CustomEvent('field-change', { detail: { fieldId, value }, bubbles: true, composed: true }));
  };

  private readonly onClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-section]');
    if (!button) return;
    this.root.querySelector(`#wc-section-${button.dataset.section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  private refreshState(): void {
    if (!this.model) return;
    for (const [key, value] of Object.entries(this.model.summaries)) {
      const output = this.root.querySelector<HTMLElement>(`[data-summary="${key}"]`);
      if (output) output.textContent = key === 'totalReserve'
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))
        : key === 'completion' ? `${value}%` : String(value);
    }
    for (const field of this.model.fields) {
      const wrapper = this.root.querySelector<HTMLElement>(`[data-field-id="${CSS.escape(field.id)}"]`);
      if (!wrapper) continue;
      wrapper.hidden = !field.visible;
      const errors = wrapper.querySelector<HTMLElement>('.field-errors');
      if (errors) {
        errors.replaceChildren(...field.errors.map((message) => {
          const item = element('li');
          item.textContent = message;
          return item;
        }));
      }
      const output = wrapper.querySelector<HTMLOutputElement>('output');
      if (output) output.value = String(this.model.values[field.id] ?? '');
    }
  }

  private render(): void {
    if (!this.model) return;
    const fragment = document.createDocumentFragment();
    const style = element('style');
    style.textContent = componentStyles;
    fragment.append(style);

    const identity = element('div', 'renderer-identity');
    identity.innerHTML = `<span>Web Component form · mounted by AngularJS · Shadow DOM</span><b>${this.model.fields.length.toLocaleString()} eager controls</b>`;
    fragment.append(identity, this.renderSummary(), this.renderNavigation());

    const form = element('form', 'claim-form');
    form.noValidate = true;
    form.addEventListener('submit', (event) => event.preventDefault());
    for (const section of this.model.sections) {
      const sectionNode = element('section', 'form-section');
      sectionNode.id = `wc-section-${section.id}`;
      const header = element('header');
      const titleWrap = element('div');
      const number = element('span');
      number.textContent = String(section.order + 1).padStart(2, '0');
      const heading = element('h2');
      heading.textContent = section.title;
      titleWrap.append(number, heading);
      const description = element('p');
      description.textContent = section.description;
      const count = element('b');
      count.textContent = `${section.fields.length} fields`;
      header.append(titleWrap, description, count);
      const grid = element('div', 'field-grid');
      for (const field of section.fields) grid.append(this.renderField(field));
      sectionNode.append(header, grid);
      form.append(sectionNode);
    }
    fragment.append(form);
    this.root.replaceChildren(fragment);
  }

  private renderSummary(): HTMLElement {
    const summary = element('section', 'claim-overview');
    summary.setAttribute('aria-label', 'Claim summary');
    const items: [keyof CompiledFormModel['summaries'], string][] = [
      ['totalReserve', 'Total reserve'], ['riskScore', 'Risk score'], ['completion', 'Completion'], ['errorCount', 'Validation'],
    ];
    for (const [key, label] of items) {
      const item = element('div');
      const caption = element('span');
      caption.textContent = label;
      const value = element('strong');
      value.dataset.summary = key;
      const raw = this.model!.summaries[key];
      value.textContent = key === 'totalReserve'
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(raw)
        : key === 'completion' ? `${raw}%` : key === 'errorCount' ? `${raw} issues` : raw.toFixed(1);
      item.append(caption, value);
      summary.append(item);
    }
    return summary;
  }

  private renderNavigation(): HTMLElement {
    const nav = element('nav', 'section-nav');
    nav.setAttribute('aria-label', 'Form sections');
    for (const section of this.model!.sections) {
      const button = element('button');
      button.type = 'button';
      button.dataset.section = section.id;
      button.textContent = section.title;
      nav.append(button);
    }
    return nav;
  }

  private renderField(field: CompiledField): HTMLElement {
    const wrapper = element('div', `field${['textarea', 'multiselect'].includes(field.type) ? ' field-wide' : ''}${['checkbox', 'toggle'].includes(field.type) ? ' field-check' : ''}`);
    wrapper.dataset.fieldId = field.id;
    wrapper.hidden = !field.visible;
    if (!['checkbox', 'toggle'].includes(field.type)) {
      const label = element('label');
      label.htmlFor = `wc-${field.id}`;
      label.append(document.createTextNode(field.label));
      if (field.required) {
        const required = element('i');
        required.textContent = 'Required';
        label.append(required);
      }
      wrapper.append(label);
    }
    const controlWrap = element('div', 'control-wrap');
    controlWrap.append(this.renderControl(field));
    wrapper.append(controlWrap);
    if (field.help) {
      const help = element('small', 'field-help');
      help.textContent = field.help;
      wrapper.append(help);
    }
    wrapper.append(element('ul', 'field-errors'));
    return wrapper;
  }

  private renderControl(field: CompiledField): HTMLElement {
    const value = this.model!.values[field.id];
    if (field.type === 'textarea') {
      const control = element('textarea');
      control.rows = 3;
      control.value = String(value ?? '');
      control.placeholder = field.placeholder ?? '';
      assignControlAttributes(control, field);
      return control;
    }
    if (field.type === 'select' || field.type === 'multiselect') {
      const control = element('select');
      control.multiple = field.type === 'multiselect';
      if (control.multiple) control.size = 4;
      for (const option of field.options) {
        const node = element('option');
        node.value = option.value;
        node.textContent = option.label;
        node.selected = Array.isArray(value) ? value.includes(option.value) : value === option.value;
        control.append(node);
      }
      assignControlAttributes(control, field);
      return control;
    }
    if (field.type === 'radio') {
      const group = element('div', 'radio-group');
      for (const option of field.options) {
        const label = element('label');
        const control = element('input');
        control.type = 'radio';
        control.name = `wc-${field.id}`;
        control.value = option.value;
        control.checked = value === option.value;
        assignControlAttributes(control, field);
        const caption = element('span');
        caption.textContent = option.label;
        label.append(control, caption);
        group.append(label);
      }
      return group;
    }
    if (field.type === 'checkbox' || field.type === 'toggle') {
      const label = element('label', `check-control${field.type === 'toggle' ? ' toggle-control' : ''}`);
      const control = element('input');
      control.type = 'checkbox';
      control.checked = Boolean(value);
      assignControlAttributes(control, field);
      const visual = element('span');
      const caption = element('b');
      caption.textContent = field.label;
      label.append(control, visual, caption);
      return label;
    }
    if (field.type === 'range') {
      const range = element('div', 'range-control');
      const control = element('input');
      control.type = 'range';
      control.value = String(value ?? 0);
      assignControlAttributes(control, field);
      const output = element('output');
      output.value = control.value;
      range.append(control, output);
      return range;
    }
    const control = element('input');
    const types: Record<string, string> = { currency: 'number', percentage: 'number', datetime: 'datetime-local' };
    control.type = types[field.type] ?? field.type;
    control.value = String(value ?? '');
    control.placeholder = field.placeholder ?? '';
    assignControlAttributes(control, field);
    if (field.type === 'currency' || field.type === 'percentage') {
      const affix = element('div', `affix-control${field.type === 'percentage' ? ' suffix' : ''}`);
      const symbol = element('span');
      symbol.textContent = field.type === 'currency' ? '$' : '%';
      affix.append(symbol, control);
      return affix;
    }
    return control;
  }
}

if (!customElements.get('claim-form')) customElements.define('claim-form', ClaimFormElement);

export const mountWebComponentRenderer: RendererMount = async (host, model, onChange) => {
  const moduleName = `claimLabWeb_${Math.random().toString(36).slice(2)}`;
  let component: ClaimFormElement | null = null;
  const ready = new Promise<void>((resolve) => {
    angular.module(moduleName, [])
      .directive('claimFormHost', [function claimFormHost() {
        return {
          restrict: 'E',
          link(_scope: angular.IScope, elementRef: angular.IAugmentedJQuery) {
            component = document.createElement('claim-form') as ClaimFormElement;
            component.addEventListener('field-change', () => onChange?.());
            elementRef[0]?.append(component);
            component.load(model);
            resolve();
          },
        };
      }]);
  });
  host.innerHTML = '<div class="web-component-boundary"><claim-form-host></claim-form-host></div>';
  const injector = angular.bootstrap(host, [moduleName], { strictDi: true });
  await ready;
  await nextFrame();
  if (!component) throw new Error('Web Component renderer did not initialize.');
  const mountedComponent = component as ClaimFormElement;
  const rootScope = injector.get<angular.IRootScopeService>('$rootScope');
  return {
    model,
    probeInteraction: () => mountedComponent.probeInteraction(),
    buildPayload: () => mountedComponent.buildPayload(),
    reset: () => mountedComponent.reset(),
    destroy() {
      rootScope.$destroy();
      host.replaceChildren();
    },
  };
};
