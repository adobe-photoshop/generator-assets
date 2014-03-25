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
            var folder = component.folder.concat([component.file]);
            return folder.join(path.sep);
        } else {
            return component.file;
        }
    }

    /**
     * ComponentManagers manage a set of Component objects.
     * 
     * @constructor
     */
    function ComponentManager() {
        this._allComponents = {};
        this._componentsForLayer = {};
        this._filenames = {};
        this._defaultLayerId = null;
    }

    /**
     * The a set of components, keyed by component ID.
     * 
     * @type {Object.<number: Component>}
     */
    ComponentManager.prototype._allComponents = null;

    /**
     * Map from layer IDs to a set of component IDs. Used to retrieve all components
     * for a given layer ID.
     * 
     * @type {Object.<number: Object.<number: boolean>>}
     */
    ComponentManager.prototype._componentsForLayer = null;

    /**
     * The set of component filenames. Used to check for conflicting names
     * 
     * @type {Object.<string: true>}
     */
    ComponentManager.prototype._filenames = null;

    /**
     * The layer ID that contains a default component specification, if any.
     * 
     * @param {?number}
    ComponentManager.prototype._defaultLayerId = null;

    /**
     * Add the provided component, which is contained by the given layer.
     * 
     * @param {Layer} layer The layer object that contains the component
     * @param {Component} component The componet object to add
     * @throws {Error} Thrown errors indicate user-reportable problems,
     *      like duplicate asset file names or duplicate defaults layers.
     */
    ComponentManager.prototype.addComponent = function (layer, component) {

        if (component.file) {
            if (this._filenames.hasOwnProperty(component.file)) {
                throw new Error("Duplicate file name: " + component.file);
            }
        } else if (component.default) {
            var specName;
            if (component.folder) {
                var folder = component.folder.concat([component.suffix]);
                specName = folder.join(path.sep);
            } else {
                specName = component.suffix;
            }
            if (this._filenames.hasOwnProperty(specName)) {
                throw new Error("Duplicate default specification: " + specName);
            }
        }

        if (component.default) {
            if (this._defaultLayerId !== null && this._defaultLayerId !== layer.id) {
                throw new Error("Duplicate default layer: " + layer.name);
            }
            this._defaultLayerId = layer.id;
        }

        var componentId = _componentIdCounter++;

        component.id = componentId;
        component.layer = layer;
        component.assetPath = _getAssetPath(component);

        this._allComponents[componentId] = component;
        this._filenames[component.file] = true;

        if (!this._componentsForLayer.hasOwnProperty(layer.id)) {
            this._componentsForLayer[layer.id] = {};
        }

        this._componentsForLayer[layer.id][componentId] = true;

        return componentId;
    };

    /**
     * Remove the component referred to by the given component ID.
     *
     * @param {number} componentId The ID of the component to remove
     */
    ComponentManager.prototype.removeComponent = function (componentId) {
        var component = this._allComponents[componentId],
            layer = component.layer,
            layerId = layer.id;

        delete this._componentsForLayer[layerId][componentId];

        if (Object.keys(this._componentsForLayer[layerId]).length === 0) {
            delete this._componentsForLayer[layerId];

            if (this._defaultLayerId === layerId) {
                this._defaultLayerId = null;
            }
        }

        delete this._allComponents[componentId];
        delete this._filenames[component.file];
    };

    /**
     * Get the Component object for the given component ID.
     * 
     * @param {number} componentId The ID of the component object to retrieve
     * @return {Component} The component object with the given ID
     */
    ComponentManager.prototype.getComponent = function (componentId) {
        return this._allComponents[componentId];
    };

    /**
     * Get the set of component objects contained by the layer referred to by the given layer ID.
     * 
     * @param {number} layerId The ID of a layer object.
     * @return {Object.<number: Component>} The set of components contained by
     *      the layer with the given ID.
     */
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

    ComponentManager.prototype.getBasicComponentsByLayer = function (layerId) {
        if (layerId === this._defaultLayerId) {
            return [];
        }

        return Object.keys(this._componentsForLayer[layerId]).map(function (componentId) {
            return this.getComponent(componentId);
        }, this);
    };

    function _shallowCopy(obj) {
        var clone = {},
            property;

        for (property in obj) {
            if (obj.hasOwnProperty(property)) {
                clone[property] = obj[property];
            }
        }

        return clone;
    }

    function _deriveComponent(def, basic) {
        var derived = _shallowCopy(basic);

        if (def.hasOwnProperty("folder")) {
            if (derived.hasOwnProperty("folder")) {
                var folder = def.folder.concat(basic.folder);
                derived.folder = folder;
            } else {
                derived.folder = def.folder;
            }
        }

        if (def.hasOwnProperty("suffix")) {
            var index = basic.file.lastIndexOf("."),
                filename = basic.file.substring(0, index),
                extension = basic.file.substring(index);

            derived.file = filename + def.suffix + extension;
        }

        if (def.hasOwnProperty("scale") ||
            def.hasOwnProperty("width") ||
            def.hasOwnProperty("height")) {
            if (!derived.hasOwnProperty("scale") &&
                !derived.hasOwnProperty("width") &&
                !derived.hasOwnProperty("height")) {

                if (def.hasOwnProperty("scale")) {
                    derived.scale = def.scale;
                }

                if (def.hasOwnProperty("width")) {
                    derived.width = def.width;
                }

                if (def.hasOwnProperty("height")) {
                    derived.height = def.height;
                }
            }
        }

        if (def.hasOwnProperty("quality")) {
            if (!derived.hasOwnProperty("quality")) {
                derived.quality = def.quality;
            }
        }

        derived.id = def.id + ":" + basic.id;
        derived.assetPath = _getAssetPath(derived);
        derived.default = def;

        return derived;
    }

    ComponentManager.prototype.getDerivedComponents = function (componentId) {
        var component = this.getComponent(componentId);

        if (this._defaultLayerId === null) {
            return [component];
        }

        if (component.default) {
            return [];
        }

        var defaultComponentMap = this._componentsForLayer[this._defaultLayerId],
            defaultComponents = Object.keys(defaultComponentMap).map(function (componentId) {
            return this.getComponent(componentId);
        }, this);

        if (defaultComponents.length === 0) {
            return [component];
        }

        return defaultComponents.map(function (def) {
            return _deriveComponent(def, component);
        });
    };

    /**
     * Static method to extract all component-like objects from a given layer.
     * Returns a list of items, each of which is either a component-like object
     * or a list of analysis errors that should be reported back to the user.
     * The component-like objects are only fully initialized after being added
     * to a given component manager.
     * 
     * @see ComponentManager.prototype.addComponent
     * @param {Layer} layer The layer from which to extract components
     * @return {Array.<Object.<errors: Array.<string>> | Object.<component: Component>>}
     */
    ComponentManager.findAllComponents = function (layer) {
        var results = analysis.analyzeLayerName(layer.name),
            components = [];

        results.forEach(function (result) {
            var errors = result.errors;
            if (errors.length > 0) {
                components.push({errors: errors});
            } else {
                var component = result.component;
                if (component.file || component.default) {
                    components.push({component: component});
                }
            }
        }, this);

        return components;
    };

    module.exports = ComponentManager;
}());