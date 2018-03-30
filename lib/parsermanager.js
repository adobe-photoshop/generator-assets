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

    var parse = require("./parser").parse;

    /**
     * The ParserManager manages parsing, normalization and analysis of layer
     * names into asset specifications. The config parameter can be used to enable
     * svg and webp parsing if the "svg-enabled" and "webp-enabled" parameters are
     * set, resp.
     * 
     * @constructor
     * @param {object} config
     */
    function ParserManager(config) {
        this._config = config || {};

        this._supportedUnits = {
            "in": true,
            "cm": true,
            "px": true,
            "mm": true
        };

        this._supportedExtensions = {
            "jpg": true,
            "png": true,
            "gif": true,
            "svg": this._config.hasOwnProperty("svg-enabled") ? !!this._config["svg-enabled"] : true,
            "webp": !!this._config["webp-enabled"]
        };
    }

    /**
     * Set of supported units of measurement.
     * 
     * @type {{string: boolean}}
     */
    ParserManager.prototype._supportedUnits = null;

    /**
     * Set of supported units of file extensions.
     * 
     * @type {{string: boolean}}
     */
    ParserManager.prototype._supportedExtensions = null;

    /**
     * Parse a layer name into a non-empty array of file specification parts.
     * If a given layer specification part can be parsed into a file specification,
     * then the resulting object has at least "file" and "extension" properties,
     * and possibly also "quality", "width", "height", "widthUnit" and "heightUnit"
     * properties as well. Otherwise, if a given layer name part (or the entire
     * layer name) can't be parsed into a file specification, then the resulting
     * object just has a single "name" property, which is the same as the input
     * string.
     * 
     * @private
     * @param {string} layerName
     * @returns {Array.<{name: string} | {file: string, extension: string}>}
     */
    ParserManager.prototype._parseLayerName = function (layerName) {
        return parse(layerName);
    };

    /**
     * Normalize the properties of the given component. Updates the object in place.
     * 
     * @private
     * @param {Component} component
     */
    ParserManager.prototype._normalizeComponent = function (component) {
        if (component.hasOwnProperty("extension")) {
            var extension = component.extension.toLowerCase();

            if (extension === "jpeg") {
                extension = "jpg";
            }

            component.extension = extension;

            if (component.hasOwnProperty("quality")) {
                var quality = component.quality;
                if (quality[quality.length - 1] === "%") {
                    quality = parseInt(quality.substring(0, quality.length - 1), 10);
                } else if (extension === "png" && quality[quality.length - 1] === "a") {
                    // normalize png24a -> png32
                    quality = parseInt(quality.substring(0, quality.length - 1), 10);
                    quality += 8;
                } else {
                    quality = parseInt(quality, 10);

                    if (extension !== "png") {
                        quality *= 10;
                    }
                }

                component.quality = quality;
            }
        }

        if (component.hasOwnProperty("widthUnit")) {
            component.widthUnit = component.widthUnit.toLowerCase();
        }

        if (component.hasOwnProperty("heightUnit")) {
            component.heightUnit = component.heightUnit.toLowerCase();
        }
    };

    /**
     * Analyze the component, returning a list of errors.
     * 
     * @private
     * @param {Component} component
     * @return {Array.<string>} The possibly empty list of analysis errors. 
     */
    ParserManager.prototype._analyzeComponent = function (component) {
        var errors = [];

        if (component.scale === 0) {
            errors.push("Invalid scale: 0%");
        }

        if (component.width === 0) {
            errors.push("Invalid width: 0");
        }

        if (component.height === 0) {
            errors.push("Invalid height: 0");
        }

        if (component.widthUnit && !this._supportedUnits[component.widthUnit]) {
            errors.push("Invalid width unit: " + component.widthUnit);
        }
        
        if (component.heightUnit && !this._supportedUnits[component.heightUnit]) {
            errors.push("Invalid height unit: " + component.heightUnit);
        }

        if (component.extension && !this._supportedExtensions[component.extension]) {
            errors.push("Unsupported extension: " + component.extension);
        }

        if (component.hasOwnProperty("quality")) {
            var quality = component.quality,
                invalidQuality = false;

            switch (component.extension) {
            case "jpg":
            case "webp":
                if (quality < 1 || quality > 100) {
                    invalidQuality = true;
                }
                break;
            case "png":
                if (!(quality === 8 || quality === 24 || quality === 32)) {
                    invalidQuality = true;
                }
                break;
            default:
                invalidQuality = true;
        }

            if (invalidQuality) {
                errors.push("Invalid quality: " + quality);
            }
        }

        return errors;
    };

    /**
     * Parse a layer name, returning a list of objects that contain a parsed
     * component and a list of errors encountered while analyzing that component.
     * The component denotes a valid asset iff there are no analysis errors and
     * the component contains either a "file" property (if it is a "basic"
     * component that describes a single asset) or a "default" property (if it
     * is default component that is used to derive non-basic components.)
     *
     * @param {string} layerName
     * @return {Array.<{component: Component, errors: Array.<string>}>}
     */
    ParserManager.prototype.analyzeLayerName = function (layerName) {
        var components;

        try {
            components = this._parseLayerName(layerName);
        } catch (parseError) {
            return [{
                component: { name: layerName },
                errors: [parseError.message]
            }];
        }

        return components.map(this.analyzeComponent, this);
    };
    
    /**
     * Returns a list of errors encountered while analyzing that component.
     * The component denotes a valid asset iff there are no analysis errors and
     * the component contains either a "file" property (if it is a "basic"
     * component that describes a single asset) or a "default" property (if it
     * is default component that is used to derive non-basic components.)
     *
     * @param {Component} component
     * @return {component: Component, errors: Array.<string>}
     */
    ParserManager.prototype.analyzeComponent = function (component) {
        this._normalizeComponent(component);

        return {
            component: component,
            errors: this._analyzeComponent(component)
        };
    };

    module.exports = ParserManager;
}());
