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

    var fs = require("fs"),
        resolve = require("path").resolve;

    var Q = require("q"),
        tmpName = Q.denodeify(require("tmp").tmpName),
        mkdirp = require("mkdirp"),
        mkdirpQ = Q.denodeify(mkdirp);

    var contexts = require("./contexts"),
        utils = require("./utils"),
        analysis = require("./analysis");

    var DELAY_TO_WAIT_UNTIL_USER_DONE = 300,
        MAX_SIMULTANEOUS_UPDATES = 50;

    var _changeContextPerLayer = {},
        _pendingUpdates = [],
        _runningUpdates = 0;

    function runPendingUpdates() {
        if (_pendingUpdates.length === 0) {
            return;
        }
        
        var updatesToStart = Math.min(_pendingUpdates.length, MAX_SIMULTANEOUS_UPDATES - _runningUpdates);

        while (updatesToStart--) {
            _runningUpdates++;
            (_pendingUpdates.shift())();
        }
    }

    // Run the update now if none is in progress, or wait until the current one is finished
    function scheduleLayerUpdate(changeContext) {
        // If no update is scheduled or the scheduled update is still being delayed, start from scratch
        if (!changeContext.updateIsScheduled || changeContext.updateDelayTimeout) {
            changeContext.updateIsScheduled = true;
            clearTimeout(changeContext.updateDelayTimeout);

            changeContext.updateDelayTimeout = setTimeout(function () {
                changeContext.updateDelayTimeout = null;
                var finish = function () {
                    _runningUpdates--;
                    try {
                        finishLayerUpdate(changeContext);
                    } catch (e) {
                        console.error(e);
                    }
                    runPendingUpdates();
                };

                _pendingUpdates.push(function () {
                    startLayerUpdate(changeContext).then(finish, finish).done();
                });
                runPendingUpdates();
            }, DELAY_TO_WAIT_UNTIL_USER_DONE);
        }
        // Otherwise, mark the scheduled update as obsolete so we can start over when it's done
        else if (!changeContext.updateIsObsolete) {
            console.log("Deferring update until the current one is done");
            changeContext.updateIsObsolete = true;
        }
    }
    
    // Run a pending update if necessary
    function finishLayerUpdate(changeContext) {
        changeContext.updateIsScheduled = false;
        // If the update is obsolete, schedule another one right after
        // This update will still be delayed to give Photoshop some time to catch its breath
        if (changeContext.updateIsObsolete) {
            console.log("Update was marked as obsolete, starting over with %d pending changes",
                changeContext.documentChanges.length);
            changeContext.updateIsObsolete = false;
            scheduleLayerUpdate(changeContext);
        }
        // This is the final update for now: clean up
        else {
            var deferred = changeContext.updateCompleteDeferred;
            delete _changeContextPerLayer[changeContext.id];
            deferred.resolve();
        }
    }

    // Start a new update
    function startLayerUpdate(changeContext) {
        function deleteLayerImages() {
            if (documentContext.assetGenerationEnabled) {
                deleteFilesRelatedToLayer(document.id, layer.id);
            }
        }

        function updateLayerName() {
            if (layer.name === layerContext.name) {
                return;
            }
            
            // The name changed => delete all generated files 
            // The files will be generated from scratch based on the new name
            // For simple changes, like "foo.jpg" => "bar.jpg", this is an unfortunate overhead
            // as renaming the file would have sufficed. But renaming is not valid for complex changes,
            // like "Layer 1" => "foo.jpg, bar.png" or "foo.jpg" => "foo.png"
            deleteLayerImages();

            layerContext.name = layer.name;
            
            var spec = analysis.analyzeLayerName(layerContext.name);
            layerContext.validFileComponents = spec.validFileComponents;
            
            utils.reportErrorsToUser(documentContext, spec.errors);
        }

        function createLayerImage(data, assetFolder, assetName, settings) {
            var imageCreatedDeferred = Q.defer(),
                relativeAssetPath = assetFolder ? (assetFolder + "/" + assetName) : assetName,
                fullAssetPath = resolve(documentContext.assetGenerationDir, relativeAssetPath),
                tmpPath;

            console.log("Generating", fullAssetPath);

            // Create a temporary file name
            tmpName()
                .then(function (_tmpName) {
                    // Save the image in a temporary file
                    tmpPath = _tmpName;
                    if (settings.format === "svg") {
                        var svgDeferred = Q.defer();
                        fs.writeFile(tmpPath, data, function (err) {
                            if (err) {
                                svgDeferred.reject("Error writing svgFile " + tmpPath);
                            }
                            else {
                                svgDeferred.resolve(tmpPath);
                            }
                        });
                        return svgDeferred.promise;
                    }
                    else {
                        return utils.generator.savePixmap(data, tmpPath, settings);
                    }
                })
                .then(function () {
                    // Create the assets directory along with the layer's subfolders
                    var targetFolder = documentContext.assetGenerationDir;

                    if (assetFolder) {
                        targetFolder = resolve(targetFolder, assetFolder);
                    }

                    return mkdirpQ(targetFolder);
                })
                .then(function () {
                    // Move the temporary file to the desired location
                    // If this fails, delete the temporary file anyway (3rd parameter: true)
                    return utils.moveFile(tmpPath, fullAssetPath, true);
                })
                .then(function () {
                    imageCreatedDeferred.resolve();
                })
                .fail(function (err) {
                    // Forward any errors
                    imageCreatedDeferred.reject(err);
                })
                .done();
            
            return imageCreatedDeferred.promise;
        }

        function createComponentImage(component, exactBounds) {
            // SVGs use a different code path from the pixel-based formats
            if (component.extension === "svg") {
                console.log("Creating SVG for layer " + layer.id + " (" + component.name + ")");
                var svgPromise = utils.generator.getSVG(layer.id, component.scale || 1);
                return svgPromise.then(
                    function (svgJSON) {
                        console.log("Received SVG text:\n" + decodeURI(svgJSON.svgText));
                        return createLayerImage(decodeURI(svgJSON.svgText),
                                                component.folder,
                                                component.file,
                                                {format:  component.extension});
                    },
                    function (err) {
                        console.log("SVG creation bombed: " + err + "\n");
                    }
                );
            }

            // Code path for pixel-based output (SVG output will cause an early return)
            var ppi = documentContext.ppi,
                scaleSettings = {
                    width:  utils.convertToPixels(component.width,  component.widthUnit, ppi),
                    height: utils.convertToPixels(component.height, component.heightUnit, ppi),
                    scaleX: component.scaleX || component.scale,
                    scaleY: component.scaleY || component.scale,
                    // Backwards compatibility
                    scale:  component.scale
                },
                
                // Mask
                maskBounds = layerContext.mask && layerContext.mask.bounds,
                
                // Static: User provided
                staticBounds  = utils.generator.getDeepBounds(layerContext),
                // Visible: User provided + effects
                visibleBounds = exactBounds,
                // Padded: User provided + effects + padding through layer mask
                paddedBounds  = !maskBounds ? exactBounds : {
                    left:   Math.min(exactBounds.left,   maskBounds.left),
                    top:    Math.min(exactBounds.top,    maskBounds.top),
                    right:  Math.max(exactBounds.right,  maskBounds.right),
                    bottom: Math.max(exactBounds.bottom, maskBounds.bottom)
                },

                pixmapSettings = utils.generator.getPixmapParams(scaleSettings, staticBounds,
                    visibleBounds, paddedBounds);

            if (utils.config && utils.config["use-smart-scaling"]) {
                pixmapSettings.useSmartScaling = true;
            }

            if (utils.config && utils.config["include-ancestor-masks"]) {
                pixmapSettings.includeAncestorMasks = true;
            }

            // Get the pixmap
            console.log("Requesting pixmap for layer %d (%s) in document %d with settings %j",
                layer.id, layerContext.name || layer.name,
                document.id, pixmapSettings);
            return utils.generator.getPixmap(document.id, layer.id, pixmapSettings).then(
                function (pixmap) {
                    var padding;
                    if (pixmapSettings.getPadding) {
                        padding = pixmapSettings.getPadding(pixmap.width, pixmap.height);
                    }
                    return createLayerImage(pixmap, component.folder, component.file, {
                        quality: component.quality,
                        format:  component.extension,
                        ppi:     documentContext.ppi,
                        padding: padding
                    });
                },
                function (err) {
                    var layerName = layerContext.name || layer.name;
                    console.error("[Assets] Error when getting the pixmap for layer %d (%s) in document %d: %j",
                        layer.id, layerName, document.id, err);
                    utils.reportErrorsToUser(documentContext, [
                        "Failed to get pixmap of layer " + layer.id +
                        " (" + (layer.name || layerContext.name) + "): " + err
                    ]);

                    layerUpdatedDeferred.reject(err);
                }
            );
        }

        function updateSubLayer(subLayer) {
            var subLayerContext = documentContext.layers[subLayer.id];
            if (subLayerContext.parentLayerId !== layer.id) {
                subLayerContext.parentLayerId = layer.id;
                console.log("Layer %j (%j) is now in layer %j (%j)", subLayer.id,
                    subLayer.name || subLayerContext.name, layer.id, layer.name || layerContext.name);
            }
        }

        function createLayerImages() {
            var components = layerContext.validFileComponents;

            var boundsOnlySettings = {
                boundsOnly: true
            };
            if (utils.config && utils.config["include-ancestor-masks"]) {
                boundsOnlySettings.includeAncestorMasks = true;
            }

            // Get exact bounds
            utils.generator.getPixmap(document.id, layer.id, boundsOnlySettings).then(
                function (pixmapInfo) {
                    var exactBounds = pixmapInfo.bounds;
                    if (exactBounds.right <= exactBounds.left || exactBounds.bottom <= exactBounds.top) {
                        // Prevent an error after deleting a layer's contents, resulting in a 0x0 pixmap
                        deleteLayerImages();
                        layerUpdatedDeferred.resolve();
                        return;
                    }

                    var componentPromises  = components.map(function (component) {
                        return createComponentImage(component, exactBounds);
                    });

                    Q.allSettled(componentPromises).then(function (results) {
                        var errors = [];
                        results.forEach(function (result, i) {
                            if (result.state === "rejected") {
                                var error = result.reason ? (result.reason.stack || result.reason) : "Unknown reason";
                                errors.push(components[i].name + ": " + error);
                            }
                        });

                        if (errors.length) {
                            utils.reportErrorsToUser(documentContext, errors);
                            layerUpdatedDeferred.reject(errors);
                        } else {
                            layerUpdatedDeferred.resolve();
                        }
                    }).done();
                },
                function (err) {
                    console.error("[Assets] Error when receive exact pixels bounds: %j", err);
                    layerUpdatedDeferred.reject(err);
                }
            );
        }

        var layerUpdatedDeferred = Q.defer(),
            document,
            documentContext,
            documentChanges,
            layer,
            layerContext,
            layerChanges,
            assetsUpdateNeeded;

        // Make sure that we only process the changes accumulated until this point
        documentChanges = changeContext.documentChanges;
        layerChanges    = changeContext.layerChanges;
        changeContext.documentChanges = [];
        changeContext.layerChanges    = [];

        while (documentChanges.length) {
            document        = documentChanges.shift();
            layer           = layerChanges.shift();
            documentContext = contexts.getContext(document.id);
            layerContext    = (documentContext && documentContext.layers) ? documentContext.layers[layer.id] : {};
            
            // The image could have been closed in the meantime
            if (!documentContext) { continue; }

            console.log("Updating layer " + layer.id + " (" + utils.stringify(layer.name || layerContext.name) +
                ") of document " + document.id, layer);

            if (layer.type) {
                layerContext.type = layer.type;
            }

            if (layer.removed) {
                // If the layer was removed delete all generated files 
                deleteLayerImages();
            }
            else if (layer.name) {
                // If the layer name was changed, the generated files may get deleted
                updateLayerName();
            }

            // Layer movement occured
            // For more details, see processChangesToDocument
            if (layer.index) {
                // Child layers have been inserted or moved into this layer
                if (layer.layers) {
                    layer.layers.forEach(updateSubLayer);
                }
                // This layer doesn't have a parent (otherwise the event would have been for the parent)
                else if (layer.atRootOfChange) {
                    delete layerContext.parentLayerId;
                }
            }

            if (layer.bounds) {
                layerContext.bounds = layer.bounds;
            }
            if (layer.mask) {
                if (layer.mask.removed) {
                    delete layerContext.mask;
                } else {
                    layerContext.mask = layer.mask;
                }
            }

            if (! (
                // If the layer was removed, we're done since we delete the images above
                layer.removed ||
                // If there are no valid file components anymore, there's nothing to generate
                !layerContext.validFileComponents || layerContext.validFileComponents.length === 0 ||
                !documentContext.assetGenerationEnabled ||
                !documentContext.assetGenerationDir
            )) {
                // Update the layer image
                // The change could be layer.pixels, layer.added, layer.path, layer.name, ...
                // Always update if it has been added because it could
                // have been dragged & dropped or copied & pasted,
                // and therefore might not be empty like new layers
                assetsUpdateNeeded = true;
            }
        }

        if (assetsUpdateNeeded) {
            // This will resolve the deferred
            createLayerImages();
        } else {
            layerUpdatedDeferred.resolve();
        }

        return layerUpdatedDeferred.promise;
    }

    function processLayerChange(document, layer) {
        console.log("Scheduling change to layer %s of %s", layer.id, document.id);
        var documentContext = contexts.getContext(document.id),
            layerContext    = documentContext.layers[layer.id];

        if (!layerContext) {
            console.log("Creating layer context for layer %s", layer.id);
            layerContext = documentContext.layers[layer.id] = {};
        }

        // Layer change context
        var contextID = document.id + "-" + layer.id,
            context = _changeContextPerLayer[contextID];
            
        if (!context) {
            console.log("Creating change context for layer %s", layer.id);
            // Initialize the context object for this layer.
            // It will be deleted again once an update has finished
            // without the image changing during the update.
            context = _changeContextPerLayer[contextID] = {
                // Store the context ID here so the context can be deleted by finishLayerUpdate
                id:                     contextID,
                updateIsScheduled:      false,
                updateIsObsolete:       false,
                updateDelayTimeout:     null,
                documentChanges:        [],
                layerChanges:           [],
                updateCompleteDeferred: Q.defer()
            };
        }

        context.documentChanges.push(document);
        context.layerChanges.push(layer);

        // Regardless of the nature of the change, we want to make sure that
        // all changes to a layer are processed in sequence
        scheduleLayerUpdate(context);

        return context.updateCompleteDeferred.promise;
    }

    function getLayerComponents(documentId, layerId) {
        var documentContext = contexts.getContext(documentId);
        if (!documentContext) {
            return [];
        }

        var layerContext = documentContext.layers && documentContext.layers[layerId];
        if (!layerContext) {
            return [];
        }

        return layerContext.validFileComponents || [];
    }

    function getRelativePathForComponent(component) {
        var relativePath = component.file;

        if (component.folder) {
            relativePath = component.folder + "/" + relativePath;
        }

        return relativePath;
    }

    function deleteFilesRelatedToLayer(documentId, layerId) {
        var documentContext = contexts.getContext(documentId);

        if (!documentContext) {
            return;
        }

        var basePath    = documentContext.assetGenerationDir,
            components  = getLayerComponents(documentId, layerId),
            folders     = {};

        components.forEach(function (component) {
            var relativeAssetPath   = getRelativePathForComponent(component),
                fullAssetPath       = resolve(basePath, relativeAssetPath),
                folder              = component.folder;
            
            if (folder) {
                // Collect all of the components' subfolders and their depth:
                // "foo/bar/baz" -> { "foo" : 1, "foo/bar" : 2, "foo/bar/baz": 3 }
                var parts   = folder.split("/"),
                    length  = parts.length;

                parts.forEach(function (part, index) {
                    var depth           = length - index,
                        relativePath    = parts.slice(0, depth).join("/"),
                        fullPath        = resolve(basePath, relativePath);

                    folders[fullPath] = depth;
                });
            }

            utils.deleteFileSync(fullAssetPath);

            return folders;
        });

        // Sort the folders by decreasing depth and delete those that are empty
        Object.keys(folders)
            .sort(function (path1, path2) {
                var depth1 = folders[path1],
                    depth2 = folders[path2];

                return depth2 - depth1;
            })
            .forEach(function (folderPath) {
                utils.deleteDirectoryIfEmpty(folderPath);
            });
    }

    function getFilesRelatedToLayer(documentId, layerId) {
        var components = getLayerComponents(documentId, layerId);
        
        return components.map(getRelativePathForComponent);
    }

    exports.processLayerChange = processLayerChange;
    exports.deleteFilesRelatedToLayer = deleteFilesRelatedToLayer;
    exports.getFilesRelatedToLayer = getFilesRelatedToLayer;
}());