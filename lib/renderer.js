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
        util = require("util"),
        tmp = require("tmp"),
        Q = require("q");

    var Bounds = require("./dom/bounds");
    
    var MAX_STATIC_DIMENSION = 10000,
        ADDITONAL_POSSIBLE_DIMENSION = 1000;


    /**
     * Asynchronously get a unique temporary path name.
     *
     * @private
     * @return {Promise.<string>}
     */
    function _getTempPath() {
        return Q.ninvoke(tmp, "tmpName");
    }

    /**
     * Abstract renderer class for a given document. Converts components to assets on disk.
     * 
     * @constructor
     * @param {Generator} generator
     * @param {object} config
     * @param {Logger} logger
     * @param {Document} document
     */
    function BaseRenderer(generator, config, logger, document) {
        this._generator = generator;
        this._document = document;
        this._logger = logger;

        if (config.hasOwnProperty("use-jpg-encoding")) {
            this._useJPGEncoding = config["use-jpg-encoding"];
        }

        if (config.hasOwnProperty("use-smart-scaling")) {
            this._useSmartScaling = !!config["use-smart-scaling"];
        }

        if (config.hasOwnProperty("include-ancestor-masks")) {
            this._includeAncestorMasks = !!config["include-ancestor-masks"];
        }

        if (config.hasOwnProperty("convert-color-space")) {
            this._convertColorSpace = !!config["convert-color-space"];
        }
        
        if (config.hasOwnProperty("icc-profile")) {
            this._useICCProfile = config["icc-profile"];
        }
        
        if (config.hasOwnProperty("embed-icc-profile")) {
            this._embedICCProfile = config["embed-icc-profile"];
        }

        if (config.hasOwnProperty("allow-dither")) {
            this._allowDither = !!config["allow-dither"];
        }

        if (config.hasOwnProperty("use-psd-smart-object-pixel-scaling")) {
            this._forceSmartPSDPixelScaling = !!config["use-psd-smart-object-pixel-scaling"];
        }

        if (config.hasOwnProperty("use-pngquant")) {
            this._usePngquant = !!config["use-pngquant"];
        }
        
        if (config.hasOwnProperty("use-flite")) {
            this._useFlite = !!config["use-flite"];
        }

        if (config.hasOwnProperty("webp-lossless")) {
            this._webpLossless = !!config["webp-lossless"];
        }

        if (config.hasOwnProperty("clip-all-images-to-document-bounds")) {
            this._clipAllImagesToDocumentBounds = !!config["clip-all-images-to-document-bounds"];
        }

        if (config.hasOwnProperty("clip-all-images-to-artboard-bounds")) {
            this._clipAllImagesToArtboardBounds = !!config["clip-all-images-to-artboard-bounds"];
        }

        if (config.hasOwnProperty("mask-adds-padding")) {
            this._masksAddPadding = !!config["mask-adds-padding"];
        }
        
        if (config.hasOwnProperty("expand-max-dimensions")) {
            this._expandMaxDimensions = !!config["expand-max-dimensions"];
        }
    }

    /**
     * @type {String=}
     * String witht he jpeg encoding string to use 
     */
    BaseRenderer.prototype._useJPGEncoding = undefined;

    /**
     * @type {boolean=}
     */
    BaseRenderer.prototype._useSmartScaling = undefined;

    /**
     * @type {boolean=}
     */
    BaseRenderer.prototype._includeAncestorMasks = undefined;

    /**
     * @type {boolean=}
     * If true, PS will convert color data to the document's color space before sending to
     * Generator. By default (when this is falsy), the "raw" RGB data is sent, which is 
     * usually what is desired.
     */
    BaseRenderer.prototype._convertColorSpace = undefined;
    
    /**
     * @type {String=}
     * String with the ICC color profile to use. If set this overrides
     * the _convertColorSpace flag. A common value is "sRGB IEC61966-2.1"
     */
    BaseRenderer.prototype._useICCProfile = undefined;
    
    /**
     * @type {boolean=}
     * Whether to embed the ICC profile into the file image or not
     */
    BaseRenderer.prototype._embedICCProfile = undefined;

    /**
     * @type {boolean=}
     */
    BaseRenderer.prototype._allowDither = undefined;

    /**
     * @type {boolean=}
     */
    BaseRenderer.prototype._forceSmartPSDPixelScaling = undefined;

    /**
     * @type {boolean=}
     */
    BaseRenderer.prototype._usePngquant = true;

    /**
     * @type {boolean=}
     */
    BaseRenderer.prototype._useFlite = true;
    
    /**
     * @type {boolean=}
     * Indicates whether webp assets should be compressed losslessly. By default,
     * they are not.
     */
    BaseRenderer.prototype._webpLossless = undefined;
    
    /**
     * @type {boolean=}
     * Indicates whether exported assets should get clipped to the document bounds or not,
     * defaults to true to clip the assets so it's more WYSIWYG
     */
    BaseRenderer.prototype._clipAllImagesToDocumentBounds = true;
    
    /**
     * @type {boolean=}
     * Indicates whether exported assets should get clipped to the artboard bounds or not,
     * (for layers that are inside an artboard)
     * defaults to true to clip the assets so it's more WYSIWYG
     */
    BaseRenderer.prototype._clipAllImagesToArtboardBounds = true;

    /**
     * @type {boolean=}
     * Indicates whether layer and vector masks that are larget than the layer size should
     * add padding to the exported image
     */
    BaseRenderer.prototype._masksAddPadding = true;
    
    /**
     * @type {boolean=}
     * Indicates whether images should be have a fixed max dimensions or
     * show the entire image
     */
    BaseRenderer.prototype._expandMaxDimensions = false;

    /**
     * Return maximum pixels allosed
     * 
     * Node.js has a default memory limit of 512MB on 32-bit machines and 1024MB on 64-bit machines.
     * It was empirically determined that a 10k x 10k (100M pixel image) uses ~580MB of memory in an IPC-connected
     * generator. We'll use that value for 64-bit machines and 5k x 5k (25M pixel image) for 32-bit machines, to be
     * conservative.
     *
     * NOTE: Do not use this from CEP. process.arch returns whether CEP is 32-bit or not instead of whether the
     * machine is 32-bit or not.
     *
     * TODO: When we change generator to a streaming implementation, we shouldn't be limited by memory anymore.
     * 
     * @return {number}
     */
    BaseRenderer.prototype._getMaxPixels = function () {
        return (process.arch === "x64" ? 100 : 25) * 1000 * 1000;
    };

    /**
     * Return safe scales for X & Y maintaining aspect ratio
     *
     * @param {Bounds} bounds Image size
     * @param {number} scaleX Horizontal scale
     * @param {number} scaleY Vertical scale
     * @return {Object} { scaleX:{number}, scaleY:{number} }
     */
    BaseRenderer.prototype._validateMaxScales = function (bounds, scaleX, scaleY) {
        var maxPixels = this._getMaxPixels(),
            scaleFactor = maxPixels / (Math.ceil(bounds.width() * scaleX) * Math.ceil(bounds.height() * scaleY));

        if (scaleFactor < 1) {
            // Need to scale down
            scaleFactor = Math.sqrt(scaleFactor);
            return {
                scaleX: this._roundDown(scaleFactor * scaleX, 10000),
                scaleY: this._roundDown(scaleFactor * scaleY, 10000)
            };
        }

        // Scales are safe
        return {
            scaleX: scaleX,
            scaleY: scaleY
        };
    };

    /**
     * Round number down to specified decimal places
     *
     * @param {number} value Value
     * @param {number} placeInTens 10, 100, 1000, etc.
     * @return {number} Rounded number
     */
    BaseRenderer.prototype._roundDown = function (value, placeInTens) {
        return Math.floor(value * placeInTens) / placeInTens;
    };

    /**
     * Given a bounds, determines the max dimensions to return the pixmap as.
     * Either expand to allow all dimensions or have a fixed limit base on a config flag
     *
     * @param {Bounds} bounds
     * @param {number} scaleX
     * @param {number} scaleY
     * @return {number}
     */
    BaseRenderer.prototype._getPixmapMaxDimensions = function (bounds, scaleX, scaleY) {
        if (this._expandMaxDimensions) {
            scaleX = scaleX || 1;
            scaleY = scaleY || scaleX;
            var safeScale = this._validateMaxScales(bounds, scaleX, scaleY);
            var largestDimension = Math.round(Math.max(bounds.width() * safeScale.scaleX,
                                                       bounds.height() * safeScale.scaleY));
            return Math.max(MAX_STATIC_DIMENSION, largestDimension + ADDITONAL_POSSIBLE_DIMENSION);
        }
        return MAX_STATIC_DIMENSION;
    };
    
    /**
     * Convert a value in a given unit, at particular resolution, to a value in pixels per inch.
     *
     * @param {number} value
     * @param {string} unit
     * @param {number} ppi 
     * @return {number}
     */
    BaseRenderer.prototype._convertToPixels = function (value, unit, ppi) {
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
            this._logger.error("An invalid length unit was specified: " + unit);
        }
    };

    /**
     * Walk up a layer's parent groups, if any, as far as we can.
     * @param {object} layer
     * @return {object} the topLevelGroup
     **/
    BaseRenderer.prototype._findTopLevelGroup = function (layer) {
        var topLevelGroup;
        if (layer) {
            if (layer.type === "layerSection") {
                topLevelGroup = layer;
            } else if (layer.group) {
                topLevelGroup = layer.group;
            }
        }
        // note that even layers on the top level have a group, but it isn't a layergroup
        while (topLevelGroup && topLevelGroup.group && topLevelGroup.group.group) {
            topLevelGroup = topLevelGroup.group;
        }

        return topLevelGroup;
    };

    /**
     * Convert rect object (x, y, width, height) to a bounds object (left, right, top, bottom)
     * @param {object} rect
     * @return {object} bounds
     */
    BaseRenderer.prototype._rectToBounds = function (rect) {
        var bounds = {
            left: rect.x || 0,
            top: rect.y || 0
        };
        bounds.right = bounds.left + rect.width;
        bounds.bottom = bounds.top + rect.height;
        return bounds;
    };

    BaseRenderer.prototype._clipToArtboardBounds = function (topLevelGroup, clippingBounds) {
        if (topLevelGroup && topLevelGroup.artboard) {
            // if it is, clip to it
            if (clippingBounds) {
                clippingBounds = clippingBounds.intersect(topLevelGroup.artboard);
            } else {
                clippingBounds = topLevelGroup.artboard;
            }
        }
        return clippingBounds;
    };
    
    /*jshint unused: false*/
    /**
     * Render a given component to an asset
     * 
     * @param {!Component} component If neither component.layer or component.comp is specified, this method renders the
     *      whole document.
     * @param {Layer=} component.layer Layer to render. Exclusive of component.comp.
     * @param {Object=} component.comp Layer comp to render. Exclusive of component.layer.
     * @return {Promise.<string>} Resolves with the temporary path of the new asset once rendering is complete.
     */
    BaseRenderer.prototype.render = function (component) {
        return _getTempPath().then(function (path) {
            var fileStream = fs.createWriteStream(path);

            // Stream the pixmap into the file and resolve with path when successful.
            return this.renderToStream(component, fileStream)
                .then(function (result) {
                    var finalResult = result || {};
                    finalResult.path = path;
                    return finalResult;
                }).catch(function (err) {
                    // If an error occurred, clean up the file.
                    try {
                        fileStream.close();
                    } catch (e) {
                        console.error("Error when closing file stream", e);
                    }
                    try {
                        if (fs.existsSync(path)) {
                            fs.unlinkSync(path);
                        }
                    } catch (e) {
                        console.error("Error when deleting file", path, e);
                    }

                    // Propagate the error.
                    throw err;
                });
        }.bind(this));
    };
    /*jshint unused: true*/
    
    /**
     * Render a given component to the given writeable stream
     * 
     * @param {!Component} component If neither component.layer or component.comp is specified, this method renders the
     *      whole document.
     * @param {Layer=} component.layer Layer to render. Exclusive of component.comp.
     * @param {Object=} component.comp Layer comp to render. Exclusive of component.layer.
     * @param {!WriteableStream=} outputStream stream to recieve the final component data
     * @return {Promise} Promise that resolves (with an empty value) after outputStream is closed.
     */
    BaseRenderer.prototype.renderToStream = function (component, outputStream) {
        return this._getData(component).then(function (data) {
            return this._streamData(data, outputStream);
        }.bind(this));
    };

    /**
     * SVG asset renderer.
     * 
     * @constructor
     * @extends BaseRenderer
     */
    function SVGRenderer(generator, config, logger, document) {
        BaseRenderer.call(this, generator, config, logger, document);
        
        if (config.hasOwnProperty("svgomg-enabled")) {
            this._useSVGOMG = !!config["svgomg-enabled"];
        }
    }

    util.inherits(SVGRenderer, BaseRenderer);

    
    /**
     * Get SVG for a layerSpec using svgObjectModelGenerator. Returns a promise that resolves to an SVG string.
     * The SVG can optionally be scaled proportionately using the "scale" parameter of the "settings" object
     * 
     * WARNING, Breaking changes to this method will only result in bumping the "patch" number of 
     * generator-assets, not the "major" version.
     *
     * @param {!number} documentId Document ID (required)
     * @param {!number|{firstLayerIndex: number, lastLayerIndex: number, hidden: Array.<number>=}} layerSpec
     *     Either the layer ID of the desired layer as a number, or an object of the form {firstLayerIndex: number,
     *     lastLayerIndex: number, ?hidden: Array.<number>} specifying the desired index range, inclusive, and
     *     (optionally) an array of indices to hide. Note that the number form takes a layer ID, *not* a layer index.
     * @param {=Object} settings An object with params to request the pixmap
     * @param {?float} settings.scale  The factor by which to scale the SVG (1.0 for 100%)
     * @param {?float} settings.width  Desired width in pixels (optional)
     * @param {?float} settings.height  Desired height in pixels (optional)
     */
    SVGRenderer.prototype._getSVGOMG = function (documentId, layerSpec, settings) {
        
        var svgOMG = require("svgobjectmodelgenerator"),
            scale = settings && settings.hasOwnProperty("scale") ? settings.scale : 1,
            width = settings ? settings.width : undefined,
            height = settings ? settings.height : undefined,
            constrainToDocBounds = settings ? settings.constrainToDocBounds : undefined,
            cropRect = settings ? settings.cropRect : undefined,
            artboardBounds = settings.artboardBounds,
            clipToArtboardBounds = settings.clipToArtboardBounds,
            isArtboard = settings.isArtboard,
            params,
            compId;

        documentId = parseInt(documentId, 10);
        if (!isFinite(documentId)) {
            return Q.reject("documentId must be a number in call to _getSVGOMG");
        }
        
        if (isFinite(parseInt(settings.compId, 10))) {
            compId = settings.compId;
        }
        
        params = {
            layerSpec: layerSpec,
            layerScale: scale,
            targetWidth: width,
            targetHeight: height,
            documentId: documentId,
            compId: compId,
            constrainToDocBounds: constrainToDocBounds,
            cropRect: cropRect,
            artboardBounds: artboardBounds,
            clipToArtboardBounds: clipToArtboardBounds,
            isArtboard: isArtboard
        };
        
        return svgOMG.getGeneratorSVG(this._generator, params, this._logger).then(
            function (result) {
                return {
                    data: result.svgText,
                    errors: result.errors
                };
            });
    };

    
    /**
     * @type {boolean=}
     * Whether to use svgOMG library or built in JSX implementation for rendering SVGs
     * Configurable through the "svg-enabled" config flag, which defaults to true.
    **/
    SVGRenderer.prototype._useSVGOMG = true;
    
    /**
     * Get SVG data for the given component.
     * 
     * @private
     * @param {!Component} component If neither component.layer or component.comp is specified, this method gets the SVG
     *      data for the whole document.
     * @param {Layer=} component.layer Layer to get the SVG data for. Exclusive of component.comp.
     * @param {Object=} component.comp Layer comp to get the SVG data for. Exclusive of component.layer.
     * @return {Promise.<string>} Resolves with the SVG data.
     */
    SVGRenderer.prototype._getData = function (component) {
        var scale = component.scale || 1,
            settings = {
                scale: scale,
                width: component.width,
                height: component.height
            },
            layer = component.layer,
            layerComp = component.comp,
            document = component.document,
            sourceObject = layer || layerComp || document;

        if (this._useSVGOMG) {
            if (!sourceObject) {
                return Q.reject(new Error("No source object specified in component."));
            }

            if (component.canvasWidth || component.canvasHeight) {
                settings.cropRect = {
                    width: component.canvasWidth || sourceObject.bounds.width() * scale,
                    height: component.canvasHeight || sourceObject.bounds.height() * scale
                };
            }

            if (layer) {
                if (this._clipAllImagesToDocumentBounds) {
                    var clippedBounds = layer.bounds.expandToIntegers().intersect(this._document.bounds);
                    if (clippedBounds.right <= clippedBounds.left || clippedBounds.bottom <= clippedBounds.top) {
                        var err = new Error("Refusing to render SVG with bounds completely clipped.");
                        err.outsideDocumentBoundsError = true;
                        return Q.reject(err);
                    }
                    settings.constrainToDocBounds = true;
                }

                if (this._clipAllImagesToArtboardBounds) {
                    var topLevelGroup = this._findTopLevelGroup(layer),
                        artboardBounds = layer.artboard || this._clipToArtboardBounds(topLevelGroup);
                    if (artboardBounds) {
                        settings.clipToArtboardBounds = true;
                        settings.artboardBounds = artboardBounds;
                        settings.isArtboard = !!layer.artboard;
                    }
                }
                return this._getSVGOMG(layer.document.id, layer.id, settings);
            } else /* if layerComp or document */ {
                settings.constrainToDocBounds = this._clipAllImagesToDocumentBounds;
                settings.clipToArtboardBounds = this._clipAllImagesToArtboardBounds;
                if (layerComp) {
                    settings.compId = layerComp.id;
                }
                return this._getSVGOMG(this._document.id, "all", settings);
            }
        } else {
            if (layer) {
                return this._generator.getSVG(layer.document.id, layer.id, settings).then(function (result) {
                    return {
                        data: result
                    };
                });
            } else {
                return Q.reject(
                    new Error("SVG is not supported for the document or layer comps with the current configuration.")
                );
            }
        }
    };

    /**
     * Write the render data to disk at the given path.
     * 
     * @private
     * @param {object} renderResult
     * @param {string} path Temporary path at which to write data
     * @return {Promise} Resolves when data has been written
     */
    SVGRenderer.prototype._writeData = function (renderResult, path) {
        return Q.nfcall(fs.writeFile,
                        path,
                        renderResult.data,
                        { encoding: "utf8" }).thenResolve({path: path, errors: renderResult.errors});
    };
    
    /**
     * Write the render data to the given stream. Note this is private and likely to change as the plan is to 
     * eventually stream the pixmap data all the way through instead of doing a get then stream.
     * 
     * @private
     * @param {object} renderResult
     * @param {!WriteableStream=} outputStream stream to recieve the data
     * @return {Promise} Resolves when data has been written
     */
    SVGRenderer.prototype._streamData = function (renderResult, outputStream) {
        return Q.Promise(function (resolve) {
            outputStream.write(renderResult.data);
            outputStream.end(null, null, function () {
                resolve({errors: renderResult.errors});
            });
        });
    };


    /**
     * Return a new SVGRenderer object.
     */
    function createSVGRenderer(generator, config, logger, document) {
        return new SVGRenderer(generator, config, logger, document);
    }

    /**
     * Pixmap asset renderer.
     * 
     * @constructor
     * @extends BaseRenderer
     */
    function PixmapRenderer(generator, config, logger, document) {
        BaseRenderer.call(this, generator, config, logger, document);

        if (config.hasOwnProperty("interpolation-type")) {
            this._interpolationType = config["interpolation-type"];
        }
    }

    util.inherits(PixmapRenderer, BaseRenderer);

    /**
     * Interpolation method to use when scaling pixmaps. If defined, this should
     * take the value of one of the Generator.prototype.INTERPOLATION constants.
     * Otherwise, Photoshop's default interpolation method is used.
     * 
     * @private
     * @see Generator.prototype.getPixmap
     * @type {boolean=}
     */
    PixmapRenderer.prototype._interpolationType = undefined;
    
    /**
     * Given two bounds that may be undefined or empty, returns a union of the bounds or
     * undefined if both of them or not good
     *
     * @private
     * @param {Bounds} leftBounds
     * @param {Bounds} rightBounds
     * @return {Bounds || undefined}
     */
    
    PixmapRenderer.prototype._safeUnionBounds = function (leftBounds, rightBounds) {
        var leftSafe = leftBounds && !leftBounds.isEmpty(),
            rightSafe = rightBounds && !rightBounds.isEmpty();

        if (leftSafe && rightSafe) {
            return leftBounds.union(rightBounds);
        } else if (leftSafe) {
            return leftBounds;
        } else if (rightSafe) {
            return rightBounds;
        }
    };

    /**
     * Get the exact bounds for the contents of the document's top level layers,
     * or of another layerGroup.
     *
     * TODO: Once the DOM is moved to core, unify this with
     * Generator.prototype.getDeepBounds.
     *
     * @private
     * @param {Layer} layer
     * @param {bool} ignoreArtboardBounds - if true, don't look at the bounds of an artboard.
     * @param {Bounds} fillLayerBounds - bounds to use if a fill layer is hit.
     * @return {Bounds}
     */
    PixmapRenderer.prototype._getContentBounds = function (layer, ignoreArtboardBounds, fillLayerBounds) {
        
        // Do not include the top-level layer group
        var isRoot = (layer.document.layers === layer),
            ignorableArtboard = ignoreArtboardBounds && layer.artboard,
            maskBounds = isRoot ? null : layer.getTotalMaskBounds(),
            bounds = isRoot || ignorableArtboard ? null : layer.bounds;
        
        //explicitly checked for visible === false. If the user can toggle the visibilty than
        //the value is always true or false. If they can't then the visible value is null or 
        //undefined. Added test for checking the stroke style, if both fill and stroke is set
        //to false then essentially layer has no content.
        if (layer.visible === false ||
            layer.clipped ||
            (layer.strokeStyle &&
            layer.strokeStyle.fillEnabled === false &&
            layer.strokeStyle.strokeEnabled === false)) {
            return new Bounds({top: 0, left: 0, bottom: 0, right: 0});
        }
        
        if (layer.type === "adjustmentLayer") {
            if (layer.fill && fillLayerBounds) {
                return fillLayerBounds;
            }
            return new Bounds({top: 0, left: 0, bottom: 0, right: 0});
        }
        
        var unionChildBounds = function (currentBounds, childLayer) {
            var childLayerBounds = this._getContentBounds(childLayer, ignoreArtboardBounds, fillLayerBounds);
            return this._safeUnionBounds(currentBounds, childLayerBounds);
        }.bind(this);
        
        if (layer.layers) {
            //if this is a layer group calculate the bounds from all the children instead of using
            //the potentially incorrect bounds set on the group
            bounds = layer.layers.reduce(unionChildBounds, null);
        }

        if (bounds && maskBounds) {
            bounds = bounds.intersect(maskBounds);
        }
        return bounds && new Bounds(bounds) || new Bounds({top: 0, left: 0, bottom: 0, right: 0});
    };
    
    /**
     * Asynchronously get exact bounds for the given component. These bounds
     * should be used if layer pixmap is sized explicitly or is scaled by a
     * non-integral multiple or if there is a mask or there are enabled layer
     * effects.
     *
     * @private
     * @param {Component} component
     * @return {Promise.<{inputRect: Bounds=, outputRect: Bounds=, 
     *                    getPadding: function (number, number): number }>}
     */
    PixmapRenderer.prototype._getSettingsWithExactBounds = function (component) {
        var ppi = this._document.resolution,
            layer = component.layer,
            layerComp = component.comp,
            layerCompId = layerComp && layerComp.id,
            maxAcquireDimension,
            cache = false,
            doc = component.document,
            resultDeferred = Q.defer(),
            boundsAcquiredPromise,
            pixmapParams,
            maskBounds,
            staticBounds,
            canvasBounds;
        
        if (layer) {
            if (layer.artboard) {
                canvasBounds = layer.artboard;
                //pixmap from PS is automatically clipped to artboard. Apply that here so we
                //know what the expected results are
                staticBounds = this._getContentBounds(layer, true, canvasBounds).intersect(layer.artboard);
            } else {
                maskBounds = layer.getTotalMaskBounds();
                staticBounds  = new Bounds(this._generator.getDeepBounds(layer));
            }
        } else /* if layer comp or full documentation */ {
            canvasBounds = component.document.bounds;
            staticBounds = this._getContentBounds(component.document.layers, false, canvasBounds);
        }
        
        //Get the max unscaled bounds because this request is for the current dimensions from which the 
        //final scaled dimensions are calculated from
        maxAcquireDimension = this._getPixmapMaxDimensions(staticBounds);
        
        if (layer) {
            boundsAcquiredPromise = layer.getExactBounds(cache, maxAcquireDimension).then(function (exactBounds) {
                return { exactBounds: exactBounds };
            });
        } else {
            boundsAcquiredPromise = doc.getExactBounds(layerCompId, maxAcquireDimension).then(function (exactBounds) {
                return { exactBounds: exactBounds };
            });
        }
        
        boundsAcquiredPromise.then(function (bndsIn) {

            var exactBounds = bndsIn.exactBounds,
                scaleSettings,
                visibleBounds,
                paddedBounds,
                clipToBounds;
            
            if (exactBounds.right <= exactBounds.left || exactBounds.bottom <= exactBounds.top) {
                var error = new Error("Refusing to render pixmap with zero bounds.");
                error.zeroBoundsError = true;
                throw error;
            }
            
            if (this._clipAllImagesToDocumentBounds) {
                clipToBounds = this._document.bounds;
            }
            
            if (this._clipAllImagesToArtboardBounds) {
                var topLevelGroup = this._findTopLevelGroup(layer);
                clipToBounds = this._clipToArtboardBounds(topLevelGroup, clipToBounds);
            }
            
            if (clipToBounds) {
                var clippedBounds = exactBounds.intersect(clipToBounds);
                if (clippedBounds.right <= clippedBounds.left || clippedBounds.bottom <= clippedBounds.top) {
                    var err = new Error("Refusing to render pixmap with bounds completely clipped.");
                    err.outsideDocumentBoundsError = true;
                    throw err;
                }
            }
            
            scaleSettings = {
                width:  this._convertToPixels(component.width,  component.widthUnit, ppi),
                height: this._convertToPixels(component.height, component.heightUnit, ppi),
                scaleX: component.scaleX || component.scale,
                scaleY: component.scaleY || component.scale,
                // Backwards compatibility
                scale:  component.scale
            };
            // Visible: User provided + effects
            visibleBounds = exactBounds;
            // Padded: User provided + effects + padding through layer mask
            paddedBounds  = (maskBounds && this._masksAddPadding) ?
                                maskBounds : exactBounds;
            
            // expand padding to include the canvas if this is a document or artboard export
            paddedBounds = this._safeUnionBounds(paddedBounds, canvasBounds);
            
            if (paddedBounds && clipToBounds) {
                //clip the additional padding added by the mask outline, not the visible
                //area PS will return
                paddedBounds = paddedBounds.intersect(clipToBounds.union(visibleBounds));
            }
            
            pixmapParams = this._generator.getPixmapParams(scaleSettings, staticBounds,
                    visibleBounds, paddedBounds, clipToBounds);
            pixmapParams.maxDimension = this._getPixmapMaxDimensions(visibleBounds,
                                                                     scaleSettings.scaleX,
                                                                     scaleSettings.scaleY);
            
            resultDeferred.resolve(pixmapParams);
        }.bind(this)).fail(resultDeferred.reject);
        
        return resultDeferred.promise;
    };

    /**
     * Synchronously get approximate bounds for the given component. These bounds
     * should only be used if pixmap is scaled by an integral multiple and if
     * there is no mask and there are no enabled layer effects.
     *
     * @private
     * @param {Component} component
     * @return {{inputRect: Bounds, outputRect: Bounds, 
     *     getPadding: function (number, number): number }}
     */
    PixmapRenderer.prototype._getSettingsWithApproximateBounds = function (component) {
        var scalar = component.scale || 1;

        var inputRect,
            paddedBounds,
            clipToBounds,
            layer = component.layer;
        
        if (layer) {
            if (layer.artboard) {
                //pixmap from PS is automatically clipped to artboard. Apply that here so we
                //know what the expected results are
                inputRect = this._getContentBounds(layer, true, layer.artboard).intersect(layer.artboard);
                paddedBounds = this._safeUnionBounds(inputRect, layer.artboard);
            } else {
                inputRect = layer.bounds;
                paddedBounds = inputRect;
            }
        } else { // layer comp
            inputRect = this._getContentBounds(component.document.layers, false, component.document.bounds);
            paddedBounds = component.document.bounds.union(inputRect);
        }

        var outputRect = inputRect.scale(scalar);
        if (outputRect.right <= outputRect.left || outputRect.bottom <= outputRect.top) {
            var error = new Error("Refusing to render pixmap with zero bounds.");
            error.zeroBoundsError = true;
            throw error;
        }
        
        if (this._clipAllImagesToDocumentBounds) {
            clipToBounds = this._document.bounds;
        }
        
        if (this._clipAllImagesToArtboardBounds) {
            var topLevelGroup = this._findTopLevelGroup(layer);
            clipToBounds = this._clipToArtboardBounds(topLevelGroup, clipToBounds);
        }
        
        if (clipToBounds) {
            var clippedBounds = inputRect.expandToIntegers().intersect(clipToBounds);
            if (clippedBounds.right <= clippedBounds.left || clippedBounds.bottom <= clippedBounds.top) {
                var err = new Error("Refusing to render pixmap with bounds completely clipped.");
                err.outsideDocumentBoundsError = true;
                throw err;
            }
        }

        var settings = {
            scaleX: scalar,
            scaleY: scalar
        };
        var pixmapParams = this._generator.getPixmapParams(settings, inputRect, inputRect, paddedBounds, clipToBounds);
        pixmapParams.maxDimension = this._getPixmapMaxDimensions(inputRect, scalar, scalar);
            
        return pixmapParams;
    };

    /**
     * Adjusts the extract or padding parameters to achieve the desired canvas width. Note the extract settings 
     * are exactly the image bounds we want to use from the pixmap. The pixmap may contain extra image
     * outside of the extra bounds. This is most likely from getting clipped by the document bounds. There fore
     * andy changes the extract settings numbers should shrink it's bounds and expose any part of the pixmamp that
     * is defined to get clipped out.
     * If canvasOffsetX and canvasOffsetY are provided, use those as the offset of the top-left corner of the
     * canvas relative to the top-left corner of the child contents.
     * If they're undefined, center the contents in the canvas.
     * 
     * @private
     * @param {Number} canvasWidth
     * @param {Number} canvasHeight
     * @param {Number} canvasOffsetX
     * @param {Number} canvasOffsetY
     * @param {Number} pixmapWidth
     * @param {Bounds} pixmapHeight
     * @param {Object: padding, Object: extract} convertSettings
     * @param {Number} canvasScale what to scale the canvas width and height by
     */
    PixmapRenderer.prototype._updateSettingsForCanvasSize = function (canvasWidth, canvasHeight,
                                                                       canvasOffsetX, canvasOffsetY,
                                                                       pixmapWidth, pixmapHeight,
                                                                       convertSettings, canvasScale) {
        var canvasScaledWidth = canvasWidth ? canvasWidth * canvasScale : 0,
            canvasScaledHeight = canvasHeight ? canvasHeight * canvasScale : 0,
            padding = convertSettings.padding || {top: 0, left: 0, right: 0, bottom: 0},
            extract = convertSettings.extract || {x:0, y:0, width: pixmapWidth, height: pixmapHeight},
            targetImageWidth = extract.width + padding.right + padding.left,
            targetImageHeight = extract.height + padding.top + padding.bottom,
            dx = canvasWidth ? canvasScaledWidth - targetImageWidth : 0,
            dy = canvasHeight ? canvasScaledHeight - targetImageHeight : 0;
        
        if (dx > 0) {
            if (canvasOffsetX === undefined) {
                padding.left += Math.floor(dx / 2);
                padding.right += Math.ceil(dx / 2);
            } else {
                padding.left -= canvasOffsetX;
                padding.right += canvasOffsetX;

                padding.right += dx;
                
                if (padding.left < 0) {
                    padding.right -= padding.left;
                    extract.x -= padding.left;
                    padding.left = 0;
                }
                if (padding.right < 0) {
                    padding.left -= padding.right;
                    padding.right = 0;
                }
            }
        } else if (dx < 0) {
            var dLeft = Math.floor(-dx / 2),
                dRight = Math.ceil(-dx / 2),
                newLeftPadding = Math.max(0, padding.left - dLeft),
                newRightPadding = Math.max(0, padding.right - dRight),
                paddingLeftRemoved = padding.left - newLeftPadding,
                extractShiftLeft = dLeft - paddingLeftRemoved,
                extractWidth = canvasScaledWidth - newLeftPadding - newRightPadding;
            
            //this will be negative if this is an artboard or document and this area
            //of the canvas doesn't have a layer under it, so not that common
            if (extractWidth <= 0) {
                extractWidth -= 1; //for the 1px set below 
                newLeftPadding += Math.floor(extractWidth / 2);
                newRightPadding += Math.ceil(extractWidth / 2);
                
                extractWidth = 1;
                if (newLeftPadding < 0) {
                    newRightPadding += newLeftPadding;
                    newLeftPadding = 0;
                }
                if (newRightPadding < 0) {
                    newLeftPadding += newRightPadding;
                    newRightPadding = 0;
                }
            }
                
            extract.x += extractShiftLeft;
            extract.width = extractWidth;
            padding.left = newLeftPadding;
            padding.right = newRightPadding;
        }
        
        if (dy > 0) {
            if (canvasOffsetY === undefined) {
                padding.top += Math.floor(dy / 2);
                padding.bottom += Math.ceil(dy / 2);
            } else {
                padding.top -= canvasOffsetY;
                padding.bottom += canvasOffsetY;

                padding.bottom += dy;

                if (padding.top < 0) {
                    padding.bottom -= padding.top;
                    extract.y -= padding.top;
                    padding.top = 0;
                }
                if (padding.bottom < 0) {
                    padding.top -= padding.bottom;
                    padding.bottom = 0;
                }
            }
        } else if (dy < 0) {
            var dTop = Math.floor(-dy / 2),
                dBottom = Math.ceil(-dy / 2),
                newTopPadding = Math.max(0, padding.top - dTop),
                newBottomPadding = Math.max(0, padding.bottom - dBottom),
                paddingTopRemoved = padding.top - newTopPadding,
                extractShiftTop = dTop - paddingTopRemoved,
                extractHeight = canvasScaledHeight - newTopPadding - newBottomPadding;
            
            //this will be negative if this is an artboard or document and this area
            //of the canvas doesn't have a layer under it, so not that common
            if (extractHeight <= 0) {
                extractHeight -= 1; //for the 1px set below 
                newTopPadding += Math.floor(extractHeight / 2);
                newBottomPadding += Math.ceil(extractHeight / 2);
                
                extractHeight = 1;
                if (newTopPadding < 0) {
                    newBottomPadding += newTopPadding;
                    newTopPadding = 0;
                }
                if (newBottomPadding < 0) {
                    newTopPadding += newBottomPadding;
                    newBottomPadding = 0;
                }
            }
            
            extract.y += extractShiftTop;
            extract.height = extractHeight;
            padding.top = newTopPadding;
            padding.bottom = newBottomPadding;
        }

        if (extract.width !== pixmapWidth || extract.height !== pixmapHeight) {
            convertSettings.extract = extract;
        } else {
            convertSettings.extract = null;
        }
        convertSettings.padding = padding;
    };
    

    /**
     * Ensure that that pixmap will be scaled uniformly by updating the input and 
     * output bounds to force Photoshop to perform a uniform transform. This is
     * necessary to ensure that any effects are correctly scaled.
     * 
     * @private
     * @param {{inputRect: object}, outputRect: object}} pixmapSettings
     */
    PixmapRenderer.prototype._ensureUniformTransform = function (pixmapSettings) {
        if (!pixmapSettings.inputRect || !pixmapSettings.outputRect) {
            return;
        }

        var inputRect = pixmapSettings.inputRect,
            outputRect = pixmapSettings.outputRect,
            inputHeight = inputRect.bottom - inputRect.top,
            inputWidth = inputRect.right - inputRect.left;

        if (inputHeight < inputWidth) {
            var outputWidth = outputRect.right - outputRect.left;

            pixmapSettings.inputRect = {
                top: inputRect.top,
                right: inputRect.right,
                bottom: inputRect.top + inputWidth,
                left: inputRect.left
            };

            pixmapSettings.outputRect = {
                top: outputRect.top,
                right: outputRect.right,
                bottom: outputRect.top + outputWidth,
                left: outputRect.left
            };
        } else {
            var outputHeight = outputRect.bottom - outputRect.top;

            pixmapSettings.inputRect = {
                top: inputRect.top,
                right: inputRect.left + inputHeight,
                bottom: inputRect.bottom,
                left: inputRect.left
            };

            pixmapSettings.outputRect = {
                top: outputRect.top,
                right: outputRect.left + outputHeight,
                bottom: outputRect.bottom,
                left: outputRect.left
            };
        }
    };
    
    /**
     * Checks to see if there is any part of the component that might extend due to layer effects.
     * Limit to a) layer effects that can actually enlarge a layer, and b) layers which, including
     * their effects, touch the edge of the relevant container (document or artboard).
     * (Mostly, we care about layers crossing the edges of the container, but in the case of
     * a layerGroup, its bounds already account for the child layers with effects.)
     * 
     * @private
     * @param {!Component} component 
     * @return {boolean}
     */
    PixmapRenderer.prototype._componentHasLayerEffects = function (component) {
        var componentBounds;

        var layerHasEffects = function (layer) {
            if (!layer || layer.visible === false || layer.group && layer.group.visible === false) {
                return false;
            }
            
            //smart object with fx  (filter mask is used whether or not it’s enabled)
            if (layer.smartObject && layer.smartObject.filterFX) {
                return true;
            }

            var hasEffect = layer.layerEffects && (
                layer.layerEffects.isEnabled("bevelEmboss") ||
                layer.layerEffects.isEnabled("dropShadow") ||
                layer.layerEffects.isEnabled("dropShadowMulti") ||
                layer.layerEffects.isEnabled("outerGlow") ||
                layer.layerEffects.isEnabled("frameFX") ||
                layer.layerEffects.isEnabled("frameFXMulti"));
            
            if (hasEffect) {
                if ((!layer.boundsWithFX) ||
                    (layer.boundsWithFX.left <= componentBounds.left) ||
                    (layer.boundsWithFX.right >= componentBounds.right) ||
                    (layer.boundsWithFX.bottom >= componentBounds.bottom) ||
                    (layer.boundsWithFX.top <= componentBounds.top)) {
                    
                    return true;
                }

            } else {
                return false;
            }
        };
        
        var layer = component.layer;
        if (layer) {
            if (layer.artboard) {
                componentBounds = this._getContentBounds(layer, true, layer.artboard).intersect(layer.artboard);
            } else {
                componentBounds = layer.bounds;
            }
            return layer.visit(layerHasEffects);
        }
        
        //need to get the size of the layers first
        componentBounds = this._getContentBounds(component.document.layers, false, component.document.bounds);
        return component.document.layers.visit(layerHasEffects);
    };

    /**
     * checks to see if there component has any layer with zero bounds.
     * 
     * @private
     * @param {!Component} component 
     * @return {boolean}
     */
    PixmapRenderer.prototype._componentHasZeroBounds = function (component) {
        var hasZeroBounds = function (bounds) {
            return !bounds || (bounds.top === 0 &&
                                bounds.bottom === 0 &&
                                bounds.left === 0 &&
                                bounds.right === 0);
        };
        
        if (component.layer) {
            return hasZeroBounds(component.layer.bounds);
        }
        
        return hasZeroBounds(this._getContentBounds(component.document.layers));
    };

    /**
     * checks to see if there is any complex mask applied to any of the layerGroup. 
     * Complex Mask is defined as : 
     * (1) Bitmap masks with extendWithWhite Property (Photoshop>Layers>Layer Mask>Hide Selection)
     * (2) Vector masks or Bitmap Mask with zero bounds.(Layer Mask>Hide All or Vector Mask>Hide All)
     * @private
     * @param {!Component} component 
     * @return {boolean}
     */
    PixmapRenderer.prototype._componentHasComplexMasks = function (component) {
        var layerGroupHasComplexMasks = function (layer) {
            return layer.layers &&
                    ((layer.mask && layer.mask.enabled && layer.mask.extendWithWhite) ||
                     ((layer.mask || layer.path) && !layer.getTotalMaskBounds()));
        };
        if (component.layer) {
            return component.layer.visit(layerGroupHasComplexMasks);
        }
        
        return component.document.layers.visit(layerGroupHasComplexMasks);
    };
        
    /**
     * Get pixmap data for the given component.
     * 
     * @private
     * @param {!Component} component If neither component.layer nor component.comp is specified, this method gets the
     *      pixmap data for the whole document.
     * @param {Layer=} component.layer Layer to get the pixmap data for. Exclusive of component.comp.
     * @param {Object=} component.comp Layer comp to get the pixmap data for. Exclusive of component.layer.
     * @return {Promise.<{pixmap: Pixmap, settings: object}>} Resolves with the pixmap data and settings.
     */
    PixmapRenderer.prototype._getData = function (component) {
        // The exact bounds computation, which is expensive, is skipped if all of the
        // following conditions hold:
        // 1. The layerComp is either not scaled, or is only scaled by an integral
        //    factor (i.e, 100%, 200%, etc.)
        // 2. The layer is scaled using a scale factor (i.e. 33%, 50%, 200%, etc).
        // 3. The layer does not have an enabled pixel mask
        // 4. The layer is clipped, in which case layer.bounds is the clipped size and not the layer size
        // 5. The "include-ancestor-masks" config option is NOT set
        // 6. The layer does not have any enabled layer effects
        // 7. Component is not resulting in zero bounds.
        // 8. None of the layerGroup has any complexMask.(Ideally, we should try to handle 
        //    complexMask calculations/corrections in getContentBounds.)
        // 9. The layer does not have a complex vector mask (we can handle a path with a single component)
        // 10. The layer does not have non integral bounds.
        // 11. The layer is not hidden.
        var layer = component.layer,
            layerComp = component.comp,
            hasComplexTransform = ((layer || layerComp) &&
                ((component.hasOwnProperty("width") || component.hasOwnProperty("height")))) ||
                (layerComp && ((component.hasOwnProperty("scale") && component.scale % 1 !== 0))),
            canvasDimensionsScale = 1,
            settingsPromise,
            resultPromise,
            isInvisible = layer && !layer.visible,
            hasComplexVectorMask = layer && layer.path &&
                layer.path.pathComponents && Array.isArray(layer.path.pathComponents) &&
                (layer.path.pathComponents.length > 1),
            nonIntegralBounds = layer && layer.bounds &&
                (!Number.isInteger(layer.bounds.top) || !Number.isInteger(layer.bounds.bottom) ||
                !Number.isInteger(layer.bounds.right) || !Number.isInteger(layer.bounds.left)),
            isClipped = layer && layer.clipped,
            hasMask = layer && layer.getTotalMaskBounds(),
            includeAncestorMasks = layer && this._includeAncestorMasks;
        
        if (isInvisible ||
            hasComplexTransform ||
            hasComplexVectorMask ||
            nonIntegralBounds ||
            hasMask ||
            isClipped ||
            includeAncestorMasks ||
            this._componentHasLayerEffects(component) ||
            this._componentHasZeroBounds(component) ||
            this._componentHasComplexMasks(component)) {

            //do the more expensive check
            settingsPromise = this._getSettingsWithExactBounds(component);
        } else {
            //we can get away with the faster check
            try {
                settingsPromise = Q.resolve(this._getSettingsWithApproximateBounds(component));
            } catch (ex) {
                settingsPromise = Q.reject(ex);
            }
        }
        
        resultPromise = settingsPromise.then(function (pixmapSettings) {
            
            //build the getPixmap request with pixmapSettings
            
            var hasUniformTranform = (component.hasOwnProperty("scale") && component.scale !== 1) ||
                (component.hasOwnProperty("width") && !component.hasOwnProperty("height")) ||
                (!component.hasOwnProperty("width") && component.hasOwnProperty("height"));

            // If we know the transform to be uniform before rounding errors, then
            // force the transform to appear uniform to Photoshop so that effects
            // are necessarily scaled.
            if (hasUniformTranform) {
                this._ensureUniformTransform(pixmapSettings);
            }

            if (this._useSmartScaling !== undefined) {
                pixmapSettings.useSmartScaling = this._useSmartScaling;
            }
            
            if (this._includeAncestorMasks !== undefined) {
                pixmapSettings.includeAncestorMasks = this._includeAncestorMasks;
            }

            if (this._convertColorSpace !== undefined) {
                pixmapSettings.convertToWorkingRGBProfile = this._convertColorSpace;
            }
            
            if (component.hasOwnProperty("useICCProfile") && component.useICCProfile) {
                pixmapSettings.useICCProfile = component.useICCProfile;
            } else if (this._useICCProfile !== undefined) {
                pixmapSettings.useICCProfile = this._useICCProfile;
            }
            
            if (component.hasOwnProperty("embedICCProfile")) {
                pixmapSettings.getICCProfileData = component.embedICCProfile;
            } else if (this._embedICCProfile !== undefined) {
                pixmapSettings.getICCProfileData = this._embedICCProfile;
            }

            if (this._allowDither !== undefined) {
                pixmapSettings.allowDither = this._allowDither;
                if (this._allowDither) {
                    // force dithering, even if it is off in the user's color settings,
                    // since they explicitly enabled it in Generator
                    pixmapSettings.useColorSettingsDither = false;
                }
            }

            if (component.hasOwnProperty("interpolationType")) {
                pixmapSettings.interpolationType = component.interpolationType;
            } else if (this._interpolationType !== undefined) {
                pixmapSettings.interpolationType = this._interpolationType;
            }
            
            if (this._forceSmartPSDPixelScaling !== undefined) {
                pixmapSettings.forceSmartPSDPixelScaling = this._forceSmartPSDPixelScaling;
            }
            
            var fnHandlePixmap = function (pixmap) {
                // We look for empty pixmap in _getSettingsWithExactBounds and _getSettingsWithApproximateBounds,
                // but check again here, in case the doc has changed in that small time interval.
                if (pixmap.width === 0 || pixmap.height === 0) {
                    var error = new Error("Got a pixmap with zero bounds.");
                    error.zeroBoundsError = true;
                    throw error;
                }
                
                var padding = pixmapSettings.hasOwnProperty("getPadding") ?
                        pixmapSettings.getPadding(pixmap.width, pixmap.height) : undefined,
                    extract =  pixmapSettings.hasOwnProperty("getExtractParamsForDocBounds") ?
                        pixmapSettings.getExtractParamsForDocBounds(pixmap.width, pixmap.height) : undefined,
                    quality = component.quality,
                    format = component.extension,
                    ppi = this._document.resolution,
                    settings = {
                        quality: quality,
                        format: format,
                        ppi: ppi,
                        padding: padding,
                        extract: extract
                    };
                
                this._updateSettingsForCanvasSize(component.canvasWidth, component.canvasHeight,
                                                  component.canvasOffsetX, component.canvasOffsetY,
                                                  pixmap.width, pixmap.height,
                                                  settings, canvasDimensionsScale);
                
                if (this._usePngquant !== undefined) {
                    settings.usePngquant = this._usePngquant;
                }
                
                if (component.hasOwnProperty("useFlite")) {
                    settings.useFlite = component.useFlite;
                } else if (this._useFlite !== undefined) {
                    settings.useFlite = this._useFlite;
                }

                if (this._useJPGEncoding !== undefined) {
                    settings.useJPGEncoding = this._useJPGEncoding;
                }

                if (this._webpLossless !== undefined) {
                    settings.lossless = this._webpLossless;
                }

                return {
                    pixmap: pixmap,
                    settings: settings
                };
            }.bind(this);
            
            if (layer) {
                return this._generator.getPixmap(this._document.id, layer.id, pixmapSettings).then(fnHandlePixmap);
            } else /* if either a layerComp or the whole document */ {
                if (layerComp) {
                    pixmapSettings.compId = layerComp.id;
                }
                return this._generator.getDocumentPixmap(this._document.id, pixmapSettings).then(fnHandlePixmap);
            }
        }.bind(this));
        
        return resultPromise;
    };

    /**
     * Write the render data to disk at the given path.
     * 
     * @private
     * @param {{pixmap: Pixmap, settings: object}} data
     * @param {string} path Temporary path at which to write data
     * @return {Promise} Resolves when data has been written
     */
    PixmapRenderer.prototype._writeData = function (data, path) {
        return this._generator.savePixmap(data.pixmap,
                                          path,
                                          data.settings).thenResolve({ path: path });
    };
    
    /**
     * Write the render data to the given stream. Note this is private and likely to change as the plan is to 
     * eventually stream the pixmap data all the way through instead of doing a get then stream.
     * 
     * @private
     * @param {object} renderResult
     * @param {!WriteableStream=} outputStream stream to recieve the data
     * @return {Promise} Resolves when data has been written
     */
    PixmapRenderer.prototype._streamData = function (renderResult, outputStream) {
        return this._generator.streamPixmap(renderResult.pixmap,
                                            outputStream,
                                            renderResult.settings);
    };

    /**
     * Return a new PixmapRenderer object.
     */
    function createPixmapRenderer(generator, config, logger, document) {
        return new PixmapRenderer(generator, config, logger, document);
    }

    exports.createPixmapRenderer = createPixmapRenderer;
    exports.createSVGRenderer = createSVGRenderer;
}());
