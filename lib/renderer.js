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

    var fs = require("fs"),
        util = require("util");

    var tmp = require("tmp"),
        Q = require("q");

    function _convertToPixels(value, unit, ppi) {
        if (!value || !unit || unit === "px") {
            return value;
        }
        
        if (unit === "in") {
            return value * ppi;
        } else if (unit === "mm") {
            return (value / 25.4) * ppi;
        } else if (unit === "cm") {
            return (value / 2.54) * ppi;
        } else {
            console.error("An invalid length unit was specified: " + unit);
        }
    }

    function _getTempPath() {
        return Q.ninvoke(tmp, "tmpName");
    }

    function BaseRenderer(generator, config, document) {
        this._generator = generator;
        this._document = document;

        if (config.hasOwnProperty("use-smart-scaling")) {
            this._useSmartScaling = !!config["use-smart-scaling"];
        }

        if (config.hasOwnProperty("include-ancestor-masks")) {
            this._includeAncestorMasks = !!config["include-ancestor-masks"];
        }
    }

    BaseRenderer.prototype.render = function () { /* layer, component, ...*/
        var dataPromise = this._getData.apply(this, arguments),
            pathPromise = _getTempPath();

        return Q.all([dataPromise, pathPromise])
            .spread(this._writeData.bind(this))
            .thenResolve(pathPromise);
    };

    function SVGRenderer(generator, config, document) {
        BaseRenderer.call(this, generator, config, document);
    }

    util.inherits(SVGRenderer, BaseRenderer);

    SVGRenderer.prototype._getData = function (layer, component) {
        var scale = component.scale || 1;

        return this._generator.getSVG(layer.id, scale)
            .then(function (jsonObj) {
                return decodeURIComponent(jsonObj.svgText);
            });
    };

    SVGRenderer.prototype._writeData = function (data, path) {
        return Q.nfcall(fs.writeFile, fs, data, path);
    };

    function createSVGRenderer(generator, config, document) {
        return new SVGRenderer(generator, config, document);
    }

    function PixmapRenderer(generator, config, document) {
        BaseRenderer.call(this, generator, config, document);
    }

    util.inherits(PixmapRenderer, BaseRenderer);

    PixmapRenderer.prototype._getData = function (layer, component) {
        var ppi = this._document.resolution;

        var getSettingsWithExactBounds = function () {
            return layer.getExactBounds().then(function (exactBounds) {
                if (exactBounds.right <= exactBounds.left || exactBounds.bottom <= exactBounds.top) {
                    throw new Error("Refusing to render pixmap with zero bounds.");
                }

                var scaleSettings = {
                        width:  _convertToPixels(component.width,  component.widthUnit, ppi),
                        height: _convertToPixels(component.height, component.heightUnit, ppi),
                        scaleX: component.scaleX || component.scale,
                        scaleY: component.scaleY || component.scale,
                        // Backwards compatibility
                        scale:  component.scale
                    },
                    // Mask
                    maskBounds = layer.mask && layer.mask.bounds,
                    // Static: User provided
                    staticBounds  = this._generator.getDeepBounds(layer),
                    // Visible: User provided + effects
                    visibleBounds = exactBounds,
                    // Padded: User provided + effects + padding through layer mask
                    paddedBounds  = !maskBounds ? exactBounds : {
                        left:   Math.min(exactBounds.left,   maskBounds.left),
                        top:    Math.min(exactBounds.top,    maskBounds.top),
                        right:  Math.max(exactBounds.right,  maskBounds.right),
                        bottom: Math.max(exactBounds.bottom, maskBounds.bottom)
                    },
                    pixmapSettings = this._generator.getPixmapParams(scaleSettings, staticBounds,
                        visibleBounds, paddedBounds);

                pixmapSettings.useSmartScaling = this._useSmartScaling;
                pixmapSettings.includeAncestorMasks = this._includeAncestorMasks;

                return pixmapSettings;
            }.bind(this));
        }.bind(this);

        function getSettingsWithApproximateBounds() {
            return new Q({
                inputRect: layer.bounds,
                outputRect: layer.bounds
            });
        }

        var settingsPromise;
        if (!(layer.mask && layer.mask.enabled) &&
            !(layer.layerEffects && layer.layerEffects.isEnabled()) &&
            (component.scale === 1 ||
                (!component.hasOwnProperty("width") &&
                !component.hasOwnProperty("height")))) {
            settingsPromise = getSettingsWithApproximateBounds();
        } else {
            settingsPromise = getSettingsWithExactBounds();
        }

        return settingsPromise.then(function (pixmapSettings) {
            return this._generator.getPixmap(this._document.id, layer.id, pixmapSettings).then(function (pixmap) {
                var padding = pixmapSettings.hasOwnProperty("getPadding") ?
                        pixmapSettings.getPadding(pixmap.width, pixmap.height) : undefined,
                    quality = component.quality,
                    format = component.extension,
                    settings = {
                        quality: quality,
                        format: format,
                        ppi: ppi,
                        padding: padding
                    };

                return {
                    pixmap: pixmap,
                    settings: settings
                };
            });
        }.bind(this));
    };

    PixmapRenderer.prototype._writeData = function (data, path) {
        return this._generator.savePixmap(data.pixmap, path, data.settings);
    };

    function createPixmapRenderer(generator, config, document) {
        return new PixmapRenderer(generator, config, document);
    }

    exports.createPixmapRenderer = createPixmapRenderer;
    exports.createSVGRenderer = createSVGRenderer;
}());