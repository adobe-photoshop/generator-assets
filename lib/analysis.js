/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
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

    var utils = require("./utils"),
        parse = require("./parser").parse;

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
     * @param {string} layerName
     * @returns {Array.<{name: string} | {file: string, extension: string}>}
     */
    function parseLayerName(layerName) {
        return parse(layerName);
    }

    var supportedUnits = {
        "in": true,
        "cm": true,
        "px": true,
        "mm": true
    };

    var supportedExtensions = {
        "jpg": true,
        "png": true,
        "gif": true,
        "svg": true,
        "webp": true // TODO: Set svg and webp extension support from config
    };

    function normalizeComponent(component) {
        if (component.hasOwnProperty("extension")) {
            var extension = component.extension.toLowerCase();

            if (extension === "jpeg") {
                extension = "jpg";
            }

            component.extension = extension;

            if (component.hasOwnProperty("quality")) {
                var quality = component.quality
                if (quality[quality.length - 1] === "%") {
                    quality = parseInt(quality.substr(quality.length - 1));
                } else {
                    quality = parseInt(quality);

                    if (extension !== "png") {
                        quality *= 10;
                    }
                }
            }
        }

        if (component.hasOwnProperty("widthUnit")) {
            component.widthUnit = component.widthUnit.toLowerCase();
        }

        if (component.hasOwnProperty("heightUnit")) {
            component.heightUnit = component.heightUnit.toLowerCase();
        }
    }

    function analyzeComponent(component) {
        var errors = []

        if (component.scale === 0) {
            errors.push("Invalid scale: 0%");
        }

        if (component.width === 0) {
            errors.push("Invalid width: 0");
        }

        if (component.height === 0) {
            errors.push("Invalid height: 0");
        }

        if (component.widthUnit && !supportedUnits[component.widthUnit]) {
            errors.push("Invalid width unit: " + component.widthUnit);
        }
        
        if (component.heightUnit && !supportedUnits[component.heightUnit]) {
            errors.push("Invalid height unit: " + component.heightUnit);
        }

        if (component.extension && !supportedExtensions[component.extension]) {
            errors.push("Unsupported extension: " component.extension);
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
    }

    function analyzeLayerName(layerName) {
        var components;

        try {
            components = parseLayerName(layerName);
        } catch (parseError) {
            return [{
                component: { name: layerName },
                errors: [parseError.message];
            }];
        }

        return components.map(function (component) {
            normalizeComponent(component);

            return {
                component: component,
                errors: analyzeComponent(component)
            };
        });
    }

    exports.analyzeLayerName = analyzeLayerName;

    // Unit test function exports
    exports._validateFileName = validateFileName;
    exports._parseLayerName   = parseLayerName;
    exports._analyzeComponent = analyzeComponent;
}());
    