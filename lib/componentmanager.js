/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

(function () {
    "use strict";

    var path = require("path");

    var analysis = require("./analysis");

    var _componentIdCounter = 0;

    function _getAssetPath(component) {
        if (component.folder) {
            return path.resolve(component.folder, component.file);
        } else {
            return component.file;
        }
    }

    function ComponentManager() {
        this._allComponents = {};
        this._layerForComponent = {};
        this._componentsForLayer = {};
    }

    ComponentManager.prototype._allComponents = null;

    ComponentManager.prototype._componentsForLayer = null;

    ComponentManager.prototype._layerForComponent = null;

    ComponentManager.prototype.addComponent = function (layer, component) {
        var componentId = _componentIdCounter++;

        component.id = componentId;
        component.layer = layer;
        component.assetPath = _getAssetPath(component);

        this._allComponents[componentId] = component;
        this._layerForComponent[componentId] = layer.id;

        if (!this._componentsForLayer.hasOwnProperty(layer.id)) {
            this._componentsForLayer[layer.id] = {};
        }

        this._componentsForLayer[layer.id][componentId] = true;

        return componentId;
    };

    ComponentManager.prototype.removeComponent = function (componentId) {
        var layerId = this._layerForComponent[componentId];

        delete this._layerForComponent[componentId];
        delete this._componentsForLayer[layerId][componentId];

        if (Object.keys(this._componentsForLayer[layerId]).length === 0) {
            delete this._componentsForLayer[layerId];
        }

        delete this._allComponents[componentId];
    };

    ComponentManager.prototype.getComponent = function (componentId) {
        return this._allComponents[componentId];
    };

    ComponentManager.prototype.getComponentsByLayer = function (layerId) {
        if (this._componentsForLayer.hasOwnProperty(layerId)) {
            return Object.keys(this._componentsForLayer[layerId]).reduce(function (components, componentId) {
                var component = this.getComponent(componentId);
                components[componentId] = component;
                return components;
            }.bind(this), {});
        } else {
            return {};
        }
    };

    ComponentManager.findAllComponents = function (layer) {
        var results = analysis.analyzeLayerName(layer.name),
            components = [];

        results.forEach(function (result) {
            var errors = result.errors;
            if (errors.length > 0) {
                components.push({errors: errors});
            } else {
                var component = result.component;
                if (component) {
                    components.push({component: component});
                }
            }
        }, this);

        return components;
    };

    module.exports = ComponentManager;
}());