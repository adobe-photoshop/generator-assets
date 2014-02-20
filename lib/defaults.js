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

    var layersLib = require("./layers"),
        analysis = require("./analysis"),
        utils = require("./utils");

    function findDefaultAssetSpecifications(document) {
        var defaultSpecs = {
            current: [],
            removed: []
        };

        utils.traverseLayers(document, function (obj, isLayer) {
            if (isLayer) {
                var result = analysis.analyzeLayerName(obj.name),
                    defaults = result.validDefaultComponents;

                if (defaults.length > 0) {
                    if (obj.removed) {
                        defaultSpecs.removed.push(defaults);
                    } else {
                        defaultSpecs.current.push(defaults);
                    }
                }
            }
        });

        return defaultSpecs;
    }

    function equalDefaults(defaults1, defaults2) {
        if (defaults1.length !== defaults2.length) {
            return false;
        }

        return defaults1.some(function (def1, index) {
            var def2 = defaults2[index];

            return def1 !== def2;
        });
    }

    function cleanUpAssets(document, context) {
        Object.keys(context.layers).forEach(function (layerId) {
            layersLib.deleteFilesRelatedToLayer(document.id, layerId);
        });

        document.layers.forEach(function (layer) {
            layersLib.deleteFilesRelatedToLayer(document.id, layer.id);
        });
    }

    /**
     * Find and set the default asset specifications for the given documents.
     * 
     * @return {boolean} Indicates whether the document defaults have changed
     */
    function updateDefaultAssetSpecifications(document, context) {
        var defaultsUpdates = findDefaultAssetSpecifications(document),
            currentDefaults = defaultsUpdates.current,
            removedDefaults = defaultsUpdates.removed,
            oldDefaults = context.defaults;

        if (currentDefaults.length > 1) {
            utils.reportErrorsToUser("At most one defaults layer is allowed per document.");

            cleanUpAssets(document, context);
            delete context.defaults;

            return true;
        }

        if (currentDefaults.length === 1) {
            currentDefaults = currentDefaults[0];

            if (oldDefaults) {
                if (equalDefaults(oldDefaults, currentDefaults)) {
                    // there were old defaults, but they haven't changed
                    return false;
                }
            }

            // new defaults were added
            cleanUpAssets(document, context);
            context.defaults = currentDefaults;
            
            return true;
        }

        if (removedDefaults.length > 0) {
            // defaults layers were removed
            cleanUpAssets(document, context);
            delete context.defaults;

            return true;
        }

        // No added or removed defaults
        return false;
    }

    exports.updateDefaultAssetSpecifications = updateDefaultAssetSpecifications;
}());