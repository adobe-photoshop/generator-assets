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

    var path = require("path"),
        ParserManager = require("./parsermanager"),
        META_PLUGIN_ID = "crema",
        _componentIdCounter = 0;

    // FIXME: The relationship between basic components, default components and
    // derived components should be made explicit. It's kind of a mess now
    // and hard to understand at a glance.

    /**
     * Compute the relative asset path of the given component.
     * 
     * @private
     * @param {Component} component
     * @return {string} The relative asset path
     */
    function _getAssetPath(component) {
        if (component.folder) {
            var folder = component.folder.concat([component.file]);
            return folder.join(path.sep);
        }
        return component.file;
    }

    /**
     * Create a shallow copy of a component.
     * 
     * @param {Component} component
     * @return {Component}
     */
    function _shallowCopy(component) {
        var clone = {},
            property;

        for (property in component) {
            if (component.hasOwnProperty(property)) {
                clone[property] = component[property];
            }
        }

        return clone;
    }

    /**
     * Create a single derived component from a given default component and basic
     * component. 
     * 
     * @private
     * @param {Component} def A default component
     * @param {Component} basic A basic component
     * @return {Component} The derived component
     */
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
        
        if (def.hasOwnProperty("canvasWidth") ||
                def.hasOwnProperty("canvasHeight") ||
                def.hasOwnProperty("canvasOffsetX") ||
                def.hasOwnProperty("canvasOffsetY")) {
            if (!derived.hasOwnProperty("canvasWidth") &&
                    !derived.hasOwnProperty("canvasHeight") &&
                    !derived.hasOwnProperty("canvasOffsetX") &&
                    !derived.hasOwnProperty("canvasOffsetY")) {

                if (def.hasOwnProperty("canvasWidth")) {
                    derived.canvasWidth = def.canvasWidth;
                }

                if (def.hasOwnProperty("canvasHeight")) {
                    derived.canvasHeight = def.canvasHeight;
                }

                if (def.hasOwnProperty("canvasOffsetX")) {
                    derived.canvasOffsetX = def.canvasOffsetX;
                }

                if (def.hasOwnProperty("canvasOffsetY")) {
                    derived.canvasOffsetY = def.canvasOffsetY;
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

    /**
     * ComponentManagers manage a set of Component objects.
     * 
     * @constructor
     */
    function ComponentManager(generator, config) {
        this._parserManager = new ParserManager(config);
        this._config = config || {};
        this._allComponents = {};
        this._componentsForLayer = {};
        this._componentsForComp = {};
        this._componentsForDocument = {};
        this._paths = {};
        this._defaultLayerId = null;
        this._metaDefaultComponents = [];
        this._metaDataRoot = config["meta-data-root"] || META_PLUGIN_ID;
    }

    /**
     * @type {ParserManager}
     */
    ComponentManager.prototype._parserManager = null;

    /**
     * Generator config preferences
     * @type {Object}
     */
    ComponentManager.prototype._config = null;

    /**
     * The default components as set by meta-data
     */
    ComponentManager.prototype._metaDefaultComponents = null;

    /**
     * The a set of components, keyed by component ID.
     * 
     * @type {{number: Component}}
     */
    ComponentManager.prototype._allComponents = null;

    /**
     * Map from layer IDs to a set of component IDs. Used to retrieve all components
     * for a given layer ID.
     * 
     * @type {{number: {number: boolean}}}
     */
    ComponentManager.prototype._componentsForLayer = null;
    
    /**
     * Map from comp IDs to a set of component IDs. Used to retrieve all components
     * for a given comp ID.
     * 
     * @type {{number: {number: boolean}}}
     */
    ComponentManager.prototype._componentsForComp = null;

    /**
     * The set of component paths. Used to check for conflicting paths.
     * 
     * @type {{string: boolean}}
     */
    ComponentManager.prototype._paths = null;

    /**
     * The layer ID that contains a default component specification, if any.
     * 
     * @type {?number}
     */
    ComponentManager.prototype._defaultLayerId = null;

    ComponentManager.prototype.getComponentId = function () {
        return _componentIdCounter++;
    };
    
    /**
     * Add the provided component, which is contained by the given layer.
     * 
     * @param {Layer} layer The layer object that contains the component
     * @param {Component} component The componet object to add
     * @throws {Error} Thrown errors indicate user-reportable problems,
     *      like duplicate asset file names or duplicate defaults layers.
     */
    ComponentManager.prototype.addComponent = function (layer, component) {
        var assetPath = _getAssetPath(component);

        if (component.file) {
            if (this._paths.hasOwnProperty(assetPath)) {
                throw new Error("Duplicate path: " + assetPath);
            }
        } else if (component.default) {
            var specName;
            if (component.folder) {
                var folder = component.folder.concat([component.suffix]);
                specName = folder.join(path.sep);
            } else {
                specName = component.suffix;
            }

            // FIXME: this is not quite right because we don't yet detect
            // when derived components will have conflicting filenames.
            if (specName && this._paths.hasOwnProperty(specName)) {
                throw new Error("Duplicate default specification: " + specName);
            }
        }

        if (component.default) {
            if (this._defaultLayerId !== null && this._defaultLayerId !== layer.id) {
                throw new Error("Duplicate default layer: " + layer.name);
            }
            this._defaultLayerId = layer.id;
        }

        var componentId = this.getComponentId();

        component.id = componentId;
        component.layer = layer;
        component.assetPath = assetPath;

        this._allComponents[componentId] = component;
        this._paths[assetPath] = true;

        if (!this._componentsForLayer.hasOwnProperty(layer.id)) {
            this._componentsForLayer[layer.id] = {};
        }

        this._componentsForLayer[layer.id][componentId] = true;

        return componentId;
    };
    
    /**
     * resets the default component IDs
     */
    ComponentManager.prototype.resetDefaultMetaComponents = function () {
        this._metaDefaultComponents.forEach(function (component) {
            delete this._allComponents[component.id];
        }.bind(this));
        this._metaDefaultComponents = [];
    };

    /**
     * Add a defailt meta component object. These come from document level
     * meta-data instead of a special "default" layer
     */
    ComponentManager.prototype.addDefaultMetaComponent = function (component) {
        var componentId = this.getComponentId();
        component.id = componentId;

        this._metaDefaultComponents.push(component);
        this._allComponents[componentId] = component;
    };

    ComponentManager.prototype.addDocumentComponent = function (component) {
        var componentId = this.getComponentId();
        component.id = componentId;
        component.assetPath = _getAssetPath(component);

        this._componentsForDocument[componentId] = component;
        this._allComponents[componentId] = component;
    };
    
    /**
     * Track the provided component, which is contained by the given layer comp.
     * 
     * @param {Object} component The layer comp object that contains the component
     * @throws {Error} Thrown errors indicate user-reportable problems,
     *      like duplicate asset file names or duplicate defaults layers.
     */
    ComponentManager.prototype.addLayerCompComponent = function (component) {
        var componentId = this.getComponentId(),
            assetPath = _getAssetPath(component);
        
        if (component.file) {
            if (this._paths.hasOwnProperty(assetPath)) {
                throw new Error("Duplicate path: " + assetPath);
            }
        }
        component.id = componentId;
        component.assetPath = assetPath;
        
        this._allComponents[componentId] = component;
        this._paths[assetPath] = true;
        
        if (!this._componentsForComp.hasOwnProperty(component.comp.id)) {
            this._componentsForComp[component.comp.id] = {};
        }
        this._componentsForComp[component.comp.id][componentId] = true;
    };

    /**
     * Remove the component referred to by the given component ID.
     *
     * @param {number} componentId The ID of the component to remove
     */
    ComponentManager.prototype.removeComponent = function (componentId) {
        var component = this._allComponents[componentId];

        if (!component) {
            throw new Error("Can't remove component: " + componentId);
        }

        var layer,
            comp,
            document,
            layerId,
            compId;

        if (component.layer) {
            layer = component.layer;
            layerId = layer.id;
        } else if (component.comp) {
            comp = component.comp;
            compId = comp.id;
        } else if (component.document) {
            document = component.document;
        }
        
        if (layer) {
            delete this._componentsForLayer[layerId][componentId];

            if (Object.keys(this._componentsForLayer[layerId]).length === 0) {
                delete this._componentsForLayer[layerId];

                if (this._defaultLayerId === layerId) {
                    this._defaultLayerId = null;
                }
            }
        } else if (comp) {
            if (this._componentsForComp[compId]) {
                delete this._componentsForComp[compId][componentId];
            
                if (Object.keys(this._componentsForComp[compId]).length === 0) {
                    delete this._componentsForComp[compId];
                }
            }
        } else if (document) {
            delete this._componentsForDocument[componentId];
        }

        delete this._allComponents[componentId];
        delete this._paths[_getAssetPath(component)];
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
     * @return {{number: Component}} The set of components contained by
     *      the layer with the given ID.
     */
    ComponentManager.prototype.getComponentsByLayer = function (layerId) {
        if (this._componentsForLayer.hasOwnProperty(layerId)) {
            return Object.keys(this._componentsForLayer[layerId]).reduce(function (components, componentId) {
                var component = this.getComponent(componentId);
                components[componentId] = component;
                return components;
            }.bind(this), {});
        }
        return {};
    };
    
    /**
     * Get the set of component objects contained by the comp referred to by the given comp ID.
     * 
     * @param {number} compId The ID of a comp object.
     * @return {{number: Component}} The set of components contained by
     *      the comp with the given ID.
     */
    ComponentManager.prototype.getComponentsByComp = function (compId) {
        if (this._componentsForComp.hasOwnProperty(compId)) {
            return Object.keys(this._componentsForComp[compId]).reduce(function (components, componentId) {
                var component = this.getComponent(componentId);
                components[componentId] = component;
                return components;
            }.bind(this), {});
        }
        return {};
    };

    /**
     * Get the set of component objects for the document.
     *
     * @return {{number: Component}} The set of components for the document.
     */
    ComponentManager.prototype.getComponentsForDocument = function () {
        return Object.keys(this._componentsForDocument).reduce(function (components, componentId) {
            var component = this.getComponent(componentId);
            components[componentId] = component;
            return components;
        }.bind(this), {});
    };

    /**
     * Get only the basic (i.e., not default or derived) components for a given layer ID.
     * 
     * @param {number} layerId
     * @return {Array.<Component>}
     */
    ComponentManager.prototype.getBasicComponentsByLayer = function (layerId) {
        if (layerId === this._defaultLayerId) {
            return [];
        }

        return Object.keys(this._componentsForLayer[layerId]).map(function (componentId) {
            return this.getComponent(componentId);
        }, this);
    };

    /**
     * Return all derived components originating from the Component referred to
     * by the given componentId and all registered default components.
     * 
     * @param {number} componentId
     * @return {Array.<Component>}
     */
    ComponentManager.prototype.getDerivedComponents = function (componentId) {
        var component = this.getComponent(componentId),
            defaultComponents;

        if (!this._config["meta-data-driven"]) {
            if (this._defaultLayerId === null) {
                return [component];
            }

            if (component.default) {
                return [];
            }

            var defaultComponentMap = this._componentsForLayer[this._defaultLayerId];
            defaultComponents = Object.keys(defaultComponentMap)
                .map(function (componentId) {
                    return this.getComponent(componentId);
                }, this);
        } else {
            defaultComponents = this._metaDefaultComponents;
        }

        if (defaultComponents.length === 0) {
            return [component];
        }

        return defaultComponents.map(function (def) {
            return _deriveComponent(def, component);
        });
    };

    ComponentManager.prototype._findAllComponentsUsingLayerNames = function (layer) {
        var components = [],
            results;
        if (layer.name) {
            results = this._parserManager.analyzeLayerName(layer.name);
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
        }
        return components;
    };
    
    ComponentManager.prototype._findAllComponentsUsingMetaData = function (layer) {
        var components = [],
            layerMeta = layer._generatorSettings && layer._generatorSettings[this._metaDataRoot];
        
        if (layerMeta && layerMeta.json) {
            layerMeta = JSON.parse(layerMeta.json);
        }
        
        if (layerMeta && layerMeta.assetSettings) {
            layerMeta.assetSettings.forEach(function (setting) {
                
                if (setting.file && setting.extension) {
                    var result = this._parserManager.analyzeComponent(setting);
                    if (result.errors.length > 0) {
                        components.push({errors: result.errors});
                    } else {
                        components.push({component: result.component});
                    }
                }
            }, this);
        }
        return components;
    };
    
    /**
     * Extract all component-like objects from a given layer. Returns a list of
     * items, each of which is either a component-like object or a list of analysis
     * errors that should be reported back to the user. The component-like objects
     * are only fully initialized after being added to a given component manager.
     * 
     * @see ComponentManager.prototype.addComponent
     * @param {Layer} layer The layer from which to extract components
     * @return {Array.<{errors: Array.<string>} | {component: Component}>}
     */
    ComponentManager.prototype.findAllComponents = function (layer) {
        if (!this._config["meta-data-driven"]) {
            return this._findAllComponentsUsingLayerNames(layer);
        }
        return this._findAllComponentsUsingMetaData(layer);
    };

    module.exports = ComponentManager;
}());
