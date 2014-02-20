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
        layerNameParser = require("./parser");

    /**
     * Call reportError for any problems with the file name.
     * The results are independent of the platform we're running on because
     * the PSD files should be portable across operation systems.
     * @param {!String} fileName The file name to validate
     * @param {function(String)} reportError A function to call to report an error
     */
    function validateFileName(fileName, reportError) {
        var invalidCharacters = /[\=<>\:\"\/\\\|\?\*\0]/,
            match;

        if (Boolean(match = fileName.match(invalidCharacters))) {
            reportError("File name contains invalid character " + JSON.stringify(match[0]));
            return false;
        }

        return true;
    }

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
        try {
            return layerNameParser.parse(layerName);
        } catch (e) {
            return [{
                name: layerName
            }];
        }
    }
    
    function analyzeComponent(component, reportError) {
        var supportedUnits      = ["in", "cm", "px", "mm"];
        var supportedExtensions = ["jpg", "jpeg", "png", "gif", "svg"];

        if (utils.config && utils.config.hasOwnProperty("svg-enabled") && !utils.config["svg-enabled"]) {
            // This is written in a somewhat confusing way because we switched from
            // svg being disabled by default to svg being enabled by default. We want to
            // keep the config option name the same, and we want to optimize for the common
            // case (that the config option is not present at all).
            supportedExtensions.splice(supportedExtensions.indexOf("svg"), 1);
        }

        if (utils.config && utils.config["webp-enabled"]) {
            supportedExtensions.push("webp");
        }

        // File name checks
        if (component.file) {
            validateFileName(component.file, reportError);
        }

        // Scaling checks
        if (component.scale === 0) {
            reportError("Cannot scale an image to 0%");
        }

        if (component.width === 0) {
            reportError("Cannot set an image width to 0");
        }

        if (component.height === 0) {
            reportError("Cannot set an image height to 0");
        }

        if (component.widthUnit && supportedUnits.indexOf(component.widthUnit) === -1) {
            reportError("Unsupported image width unit " + utils.stringify(component.widthUnit));
        }
        if (component.heightUnit && supportedUnits.indexOf(component.heightUnit) === -1) {
            reportError("Unsupported image height unit " + utils.stringify(component.heightUnit));
        }

        if (component.extension === "jpeg") {
            component.extension = "jpg";
        }
        var quality;
        if (component.extension && supportedExtensions.indexOf(component.extension) === -1) {
            reportError();
        }
        else if ((typeof component.quality) !== "undefined") {
            if (["jpg", "jpeg", "webp"].indexOf(component.extension) !== -1) {
                if (component.quality.slice(-1) === "%") {
                    quality = parseInt(component.quality.slice(0, -1), 10);
                    if (quality < 1 || quality > 100) {
                        reportError(
                            "Quality must be between 1% and 100% (is " + utils.stringify(component.quality) + ")"
                        );
                    } else {
                        component.quality = quality;
                    }
                }
                else {
                    quality = parseInt(component.quality, 10);
                    if (component.quality < 1 || component.quality > 10) {
                        reportError(
                            "Quality must be between 1 and 10 (is " + utils.stringify(component.quality) + ")"
                        );
                    } else {
                        component.quality = quality * 10;
                    }
                }
            }
            else if (component.extension === "png") {
                if (["8", "24", "32"].indexOf(component.quality) === -1) {
                    reportError("PNG quality must be 8, 24 or 32 (is " + utils.stringify(component.quality) + ")");
                }
            }
            else {
                reportError(
                    "There should not be a quality setting for files with the extension \"" +
                    component.extension +
                    "\""
                );
            }
        }
    }
    
    function analyzeLayerName(layerName) {
        var components = typeof(layerName) === "string" ? parseLayerName(layerName) : [],
            errors = [];

        var validFileComponents = components.filter(function (component) {
            if (!component.file) {
                return false;
            }

            var hadErrors = false;
            function reportError(message) {
                hadErrors = true;
                if (message) {
                    errors.push(component.name + ": " + message);
                }
            }

            analyzeComponent(component, reportError);

            return !hadErrors;
        });

        return {
            errors: errors,
            validFileComponents: validFileComponents
        };
    }

    exports.analyzeLayerName = analyzeLayerName;

    // Unit test function exports
    exports._validateFileName = validateFileName;
    exports._parseLayerName   = parseLayerName;
    exports._analyzeComponent = analyzeComponent;
}());
    