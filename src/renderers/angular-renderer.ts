import angular from 'angular';
import { buildPayload } from '../data/payload';
import { resetModel, updateFieldValue } from '../data/pipeline';
import { nextFrame } from '../metrics';
import type { CompiledField, CompiledFormModel } from '../types';
import type { RendererHandle, RendererMount } from './types';

const template = `
  <div class="angular-boundary" ng-controller="ClaimFormController as vm">
    <div class="renderer-identity"><span>AngularJS scope tree</span><b>{{::vm.model.fields.length | number}} eager controls</b></div>
    <section class="claim-overview" aria-label="Claim summary">
      <div><span>Total reserve</span><strong>{{vm.model.summaries.totalReserve | currency}}</strong></div>
      <div><span>Risk score</span><strong>{{vm.model.summaries.riskScore | number:1}}</strong></div>
      <div><span>Completion</span><strong>{{vm.model.summaries.completion | number:1}}%</strong></div>
      <div><span>Validation</span><strong>{{vm.model.summaries.errorCount | number}} issues</strong></div>
    </section>
    <nav class="section-nav" aria-label="Form sections">
      <a ng-repeat="section in ::vm.model.sections track by section.id" href="#section-{{::section.id}}">{{::section.title}}</a>
    </nav>
    <form class="claim-form" name="claimForm" novalidate ng-submit="$event.preventDefault()">
      <section class="form-section" ng-repeat="section in ::vm.model.sections track by section.id" id="section-{{::section.id}}">
        <header><div><span>0{{$index + 1}}</span><h2>{{::section.title}}</h2></div><p>{{::section.description}}</p><b>{{::section.fields.length}} fields</b></header>
        <div class="field-grid">
          <div class="field" ng-repeat="field in ::section.fields track by field.id" ng-if="field.visible" data-field-id="{{::field.id}}" ng-class="{'field-wide': field.type === 'textarea' || field.type === 'multiselect', 'field-check': field.type === 'checkbox' || field.type === 'toggle'}">
            <label ng-if="field.type !== 'checkbox' && field.type !== 'toggle'" for="ng-{{::field.id}}">{{::field.label}} <i ng-if="::field.required">Required</i></label>
            <div ng-switch="::field.type" class="control-wrap">
              <textarea ng-switch-when="textarea" id="ng-{{::field.id}}" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)" placeholder="{{::field.placeholder}}" rows="3"></textarea>
              <select ng-switch-when="select" id="ng-{{::field.id}}" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)" ng-options="option.value as option.label for option in ::field.options"></select>
              <select ng-switch-when="multiselect" id="ng-{{::field.id}}" multiple size="4" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)" ng-options="option.value as option.label for option in ::field.options"></select>
              <div ng-switch-when="radio" class="radio-group">
                <label ng-repeat="option in ::field.options track by option.value"><input type="radio" name="ng-{{::field.id}}" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)" ng-value="option.value"> <span>{{::option.label}}</span></label>
              </div>
              <label ng-switch-when="checkbox" class="check-control"><input id="ng-{{::field.id}}" type="checkbox" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)"><span></span><b>{{::field.label}}</b></label>
              <label ng-switch-when="toggle" class="check-control toggle-control"><input id="ng-{{::field.id}}" type="checkbox" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)"><span></span><b>{{::field.label}}</b></label>
              <div ng-switch-when="range" class="range-control"><input id="ng-{{::field.id}}" type="range" min="{{::field.min}}" max="{{::field.max}}" step="{{::field.step}}" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)"><output>{{vm.model.values[field.id]}}</output></div>
              <div ng-switch-when="currency" class="affix-control"><span>$</span><input id="ng-{{::field.id}}" type="number" min="{{::field.min}}" max="{{::field.max}}" step="{{::field.step}}" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)"></div>
              <div ng-switch-when="percentage" class="affix-control suffix"><input id="ng-{{::field.id}}" type="number" min="{{::field.min}}" max="{{::field.max}}" step="{{::field.step}}" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)"><span>%</span></div>
              <input ng-switch-when="number" id="ng-{{::field.id}}" type="number" min="{{::field.min}}" max="{{::field.max}}" step="{{::field.step}}" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)">
              <input ng-switch-when="date" id="ng-{{::field.id}}" type="date" legacy-value="{{::field.id}}">
              <input ng-switch-when="datetime" id="ng-{{::field.id}}" type="datetime-local" legacy-value="{{::field.id}}">
              <input ng-switch-when="time" id="ng-{{::field.id}}" type="time" legacy-value="{{::field.id}}">
              <input ng-switch-when="email" id="ng-{{::field.id}}" type="email" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)">
              <input ng-switch-when="tel" id="ng-{{::field.id}}" type="tel" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)">
              <input ng-switch-default id="ng-{{::field.id}}" type="text" ng-model="vm.model.values[field.id]" ng-change="vm.change(field)" placeholder="{{::field.placeholder}}">
            </div>
            <small ng-if="::field.help" class="field-help">{{::field.help}}</small>
            <ul class="field-errors" ng-if="field.errors.length"><li ng-repeat="error in field.errors track by $index">{{error}}</li></ul>
          </div>
        </div>
      </section>
    </form>
  </div>`;

export const mountAngularRenderer: RendererMount = async (host, model, onChange) => {
  const moduleName = `claimLabAngular_${Math.random().toString(36).slice(2)}`;
  let controller: { model: CompiledFormModel; change: (field: CompiledField) => void } | null = null;
  const module = angular.module(moduleName, []);
  module.directive('legacyValue', [function legacyValue() {
    return {
      restrict: 'A',
      link(scope: angular.IScope, elementRef: angular.IAugmentedJQuery, attributes: angular.IAttributes) {
        const input = elementRef[0] as HTMLInputElement;
        let fieldId = '';
        const stopObserving = attributes.$observe('legacyValue', (value) => {
          fieldId = String(value ?? '');
          input.value = String(model.values[fieldId] ?? '');
        });
        const listener = () => scope.$apply(() => {
          if (!fieldId) return;
          updateFieldValue(model, fieldId, input.value);
          onChange?.();
        });
        input.addEventListener('input', listener);
        scope.$on('$destroy', () => {
          stopObserving();
          input.removeEventListener('input', listener);
        });
      },
    };
  }]);
  module.controller('ClaimFormController', [function ClaimFormController(this: { model: CompiledFormModel; change: (field: CompiledField) => void }) {
    controller = this;
    const vm = this;
    vm.model = model;
    vm.change = (field) => {
      updateFieldValue(model, field.id, model.values[field.id] ?? null);
      onChange?.();
    };
  }]);

  host.innerHTML = template;
  const injector = angular.bootstrap(host, [moduleName], { strictDi: true });
  await nextFrame();
  if (!controller) throw new Error('AngularJS renderer did not initialize.');

  const rootScope = injector.get<angular.IRootScopeService>('$rootScope');
  const handle: RendererHandle = {
    model,
    async probeInteraction() {
      const input = host.querySelector<HTMLInputElement>('.field input[type="text"]');
      if (!input) throw new Error('AngularJS interaction probe could not find a text field.');
      input.value = `${input.value} •`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await nextFrame();
      const fieldId = input.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId;
      if (!fieldId || model.values[fieldId] !== input.value) throw new Error('AngularJS interaction probe was not committed.');
    },
    buildPayload: () => buildPayload(model),
    reset() {
      resetModel(model);
      rootScope.$evalAsync();
    },
    destroy() {
      rootScope.$destroy();
      host.replaceChildren();
    },
  };
  return handle;
};
