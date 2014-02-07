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

    var fs      = require("fs"),
        resolve = require("path").resolve,
        Q       = require("q"),
        mkdirp  = require("mkdirp");

    var contexts = require("./contexts"),
        menus = require("./menus"),
        layers = require("./layers"),
        utils = require("./utils"),
        analysis = require("./analysis");

    var PLUGIN_ID = require("../package.json").name,
        MAX_DIR_RENAME_ATTEMPTS = 1000;

    // These objects hold booleans keyed on document ID that flag whether we're waiting
    // to receive complete document info. If we get image changed events while
    // we're waiting, then we completely throw out the document info and request
    // it again.
    var _waitingForDocument = {},
        _gotChangeWhileWaiting = {};

    // TODO: Once we get the layer change management/updating right, we should add a
    // big comment at the top of this file explaining how this all works. In particular
    // we should explain what contexts are, and how we manage scheduling updates.
    var _currentDocumentId;

    function resolvedPromise() {
        // JSHint doesn't like Q() because it regards Q as a constructor
        return Q.call();
    }

    function handleImageChanged(document) {
        console.log("Image " + document.id + " was changed:", utils.stringify(document));

        if (_waitingForDocument[document.id]) {
            console.log("Ignoring this change because we're still waiting for the full document");
            _gotChangeWhileWaiting[document.id] = true;
            return;
        }

        // If the document was closed
        if (document.closed) {
            contexts.clearContext(document.id);
            // When two or more files are open, closing the current file first
            // results in an imageChanged event for the file that is going to
            // get focused (document.active === true), and is then followed by an
            // imageChanged event for the closed file (document.closed === true).
            // Therefore, if a document has been closed, _currentDocumentId
            // will have changed before the imageChanged event arrives that
            // informs us about the closed file. Consequently, if the ID is the
            // same, closed file must have been the last open one
            // => set _currentDocumentId to null
            if (document.id === _currentDocumentId) {
                setCurrentDocumentId(null);
            }
            // Stop here
            return;
        }

        function traverseLayers(obj, callback, isLayer) {
            callback(obj, isLayer);
            if (obj.layers) {
                obj.layers.forEach(function (child) {
                    traverseLayers(child, callback, true);
                });
            }
        }

        var documentContext = contexts.getContext(document.id);
        
        // Possible reasons for an undefined context:
        // - User created a new image
        // - User opened an image
        // - User switched to an image that was created/opened before Generator started
        if (!documentContext) {
            console.log("Unknown document, so getting all information");
            requestEntireDocument(document.id);
            return;
        }

        // We have seen this document before: information about the changes are enough
        var unknownChange = false,
            layersMoved = false;
        
        traverseLayers(document, function (obj, isLayer) {
            if (unknownChange) { return; }
            if (obj.changed) {
                unknownChange = true;
                if (isLayer) {
                    console.warn("Photoshop reported an unknown change in layer %j: %j", obj.id, obj);
                } else {
                    console.warn("Photoshop reported an unknown change in the document");
                }
            }
            else if (isLayer) {
                var layerContext = documentContext.layers && documentContext.layers[obj.id],
                    layerType    = obj.type || (layerContext && layerContext.type);
                
                if (!layerType) {
                    console.warn("Unknown layer type, something is wrong with the document");
                    unknownChange = true;
                } else if (layerType === "adjustmentLayer") {
                    console.warn("An adjustment layer changed, treating this as an unknown change: %j", obj);
                    unknownChange = true;
                }

                if (obj.hasOwnProperty("index")) {
                    layersMoved = true;
                }
            }
        });

        if (!unknownChange && layersMoved && documentContext.layers) {
            Object.keys(documentContext.layers).forEach(function (layerId) {
                var layerContext = documentContext.layers[layerId];
                if (!unknownChange && layerContext.type === "adjustmentLayer") {
                    console.warn("A layer was moved in a document that contains adjustment layers," +
                        " treating this as an unknown change");
                    unknownChange = true;
                }
            });
        }

        // Unknown change: reset
        if (unknownChange) {
            console.log("Handling an unknown change by deleting all generated files and resetting the state");
            if (documentContext) {
                Object.keys(documentContext.layers).forEach(function (layerId) {
                    layers.deleteFilesRelatedToLayer(document.id, layerId);
                });
            }
            requestEntireDocument(document.id);
            return;
        }

        // Resize event: regenerate everything
        if (!document.layers && document.bounds) {
            requestEntireDocument(document.id);
        } else {
            processChangesToDocument(document);
        }
    }

    /**
     * @params {?integer} documentId Optional document ID
     */
    function requestEntireDocument(documentId) {
        _waitingForDocument[documentId] = true;
        _gotChangeWhileWaiting[documentId] = false;

        if (!documentId) {
            console.log("Determining the current document ID");
        }
        
        utils.generator.getDocumentInfo(documentId).then(
            function (document) {
                _waitingForDocument[documentId] = false;
                if (_gotChangeWhileWaiting[documentId]) {
                    console.log("A change occured while waiting for document %j" +
                        ", requesting the document again", documentId);
                    process.nextTick(function () {
                        requestEntireDocument(documentId);
                    });
                    return;
                }
                console.log("Received complete document:", utils.stringify(document));

                if (document.id && !document.file) {
                    console.warn("WARNING: file information is missing from document.");
                }
                // No document ID was specified and the current document is unkown,
                // so the returned document must be the current one
                if (!documentId && !_currentDocumentId) {
                    if (!document.id) {
                        console.log("No document is currently open");
                    } else {
                        console.log("Using ID from document info as current document ID", document.id);
                        setCurrentDocumentId(document.id);
                    }
                }
                // Act as if everything has changed
                if (contexts.getContext(documentId)) {
                    contexts.resetDocumentContext(documentId);
                }
                processChangesToDocument(document);
            },
            function (err) {
                console.error("[Assets] Error in getDocumentInfo:", err);
            }
        ).done();
    }

    function processChangesToDocument(document) {
        // Stop if the document isn't an object describing a menu (could be "[ActionDescriptor]")
        // Happens if no document is open, but maybe also at other times
        if (!document.id) {
            return;
        }
        
        var context = contexts.getContext(document.id);
        
        if (!context) {
            context = contexts.resetDocumentContext(document.id);
            
            if (document.generatorSettings) {
                console.log("Document contains generator settings", document.generatorSettings);
                var settings = utils.generator.extractDocumentSettings(document, PLUGIN_ID);
                console.log("Parsed generator for plugin " + PLUGIN_ID + " as", settings);
                context.assetGenerationEnabled = Boolean(settings.enabled);
                menus.updateMenuState();
            }
        }

        // Now that we know this document, we can actually process any related menu clicks
        menus.processMenuEvents();

        // Create an already resolved promise so we can add steps in sequence
        resolvedPromise()
            .then(function () {
                // If there is a file name (e.g., after saving or when switching between files, even unsaved ones)
                if (document.file) {
                    return processPathChange(document);
                }
            })
            .then(function () {
                if (document.resolution) {
                    var ppi = parseFloat(document.resolution);
                    if (isNaN(ppi)) {
                        console.warn("Resolution was not a valid number:", document.resolution);
                        context.ppi = null;
                    } else {
                        context.ppi = ppi;
                    }
                }
                if (!context.ppi) {
                    console.warn("Assuming a resolution of 72 PPI");
                    context.ppi = 72;
                }
                
                var pendingPromises = [];

                // If there are layer changes
                if (document.layers) {
                    var layers = document.layers.concat();

                    // Mark the layers as directly mentioned by the change event
                    // Assume there's layer group P and layer L.
                    // However, moving layer L to the root level (out of P), gives us this:
                    // { id: <L>, index: ... }
                    // Moving layer L into P results in an event like this:
                    // { id: <P>, index: ..., layers: [{ id: <L>, index: ... }]}
                    // This allows us to store P as L's parent.
                    // But when we iterate over the the sublayers, it will look as if L has lost
                    // its parent because by itself this would again look like this:
                    // { id: <L>, index: ... }
                    // By marking the layers mentioned at the root of a change, we get this:
                    // { id: <L>, index: ..., atRootOfChange: true }
                    // when moving L out of P and this:
                    // { id: <L>, index: ... }
                    // when moving L into P, allowing us to track child-parent relationships
                    layers.forEach(function (layer) {
                        layer.atRootOfChange = true;
                    });
                    
                    // Flatten the layer hierarchy mentioned in the change
                    // [{ id: 1, layers: [{ id: 2, layers: [{ id: 3 }] }] }]
                    // will be treated as
                    // [{ id: 1, ... }, { id: 2, ... }, { id: 3 }]
                    var changedLayers = {};
                    while (layers.length) {
                        // Remove the first entry of layers and store it in layers
                        var layer = layers.shift();
                        // Keep track of the layers that were mentioned as changed
                        changedLayers[layer.id] = true;
                        // Process the layer change
                        pendingPromises.push(layers.processLayerChange(document, layer));
                        // Add the children to the layers queue
                        if (layer.layers) {
                            layers.push.apply(layers, layer.layers);
                        }
                    }

                    // Iterate over all the IDs of changed layers
                    var changedLayerIds = Object.keys(changedLayers);
                    // Using while instead of forEach allows adding new IDs
                    while (changedLayerIds.length) {
                        // Remove the first entry of changedLayerIds and store it in layerId
                        var layerId = changedLayerIds.shift();
                        // Check if that layer has a parent layer
                        var parentLayerId = context.layers[layerId].parentLayerId;
                        // If it does, and the parent layer hasn't been mentioned in the change...
                        if (parentLayerId && !changedLayers[parentLayerId]) {
                            // Act as if it had been mentioned
                            changedLayers[parentLayerId] = true;
                            changedLayerIds.push(parentLayerId);
                            // I.e., update this layer, too
                            pendingPromises.push(layers.processLayerChange(document, { id: parentLayerId }));
                        }
                    }
                }

                Q.allSettled(pendingPromises).then(function () {
                    // Delete directory foo-assets/ for foo.psd if it is empty now
                    utils.deleteDirectoryIfEmpty(context.assetGenerationDir);
                });
            })
            .done();
    }

    function processPathChange(document) {
        var context      = contexts.getContext(document.id),
            wasSaved     = context.isSaved,
            previousPath = context.path;

        console.log("Document path changed from %j to %j", previousPath, document.file);

        var previousStorageDir = context.assetGenerationDir;
        contexts.updatePathInfoForDocument(document);
        var newStorageDir = context.assetGenerationDir;

        // If the user saved an unsaved file
        if (!wasSaved && context.isSaved && previousStorageDir) {
            console.log("An unsaved file was saved");

            if (previousStorageDir.toLowerCase() === newStorageDir.toLowerCase()) {
                console.log("The storage directory hasn't changed");
                return resolvedPromise();
            }
            else {
                // Rename the assets folder of another document at this location
                // Try foo-assets-old, then foo-assets-old-2, etc.
                // Give up after MAX_DIR_RENAME_ATTEMPTS many unsuccessful attempts
                if (fs.existsSync(newStorageDir)) {
                    var attempts = 0,
                        renamedNewStorageDir;
                    do {
                        attempts++;
                        renamedNewStorageDir = newStorageDir + "-old";
                        if (attempts > 1) {
                            renamedNewStorageDir += "-" + attempts;
                        }
                    } while (fs.existsSync(renamedNewStorageDir) && attempts < MAX_DIR_RENAME_ATTEMPTS);
                    
                    // If the suggested path exists despite our efforts to find one that doesn't, give up
                    if (fs.existsSync(renamedNewStorageDir)) {
                        throw new Error("At least " + MAX_DIR_RENAME_ATTEMPTS + " other backups of " +
                            newStorageDir + " already exist. Giving up.");
                    }
                    
                    console.log("Renaming existing storage directory %j to %j", newStorageDir, renamedNewStorageDir);
                    fs.renameSync(newStorageDir, renamedNewStorageDir);
                }

                // Move generated assets to the new directory and delete the old one if empty
                console.log("Creating new storage directory %j", newStorageDir);
                mkdirp.sync(newStorageDir);

                var promises = [];

                try {
                    var errorsFile = resolve(previousStorageDir, "errors.txt");
                    if (fs.existsSync(errorsFile)) {
                        fs.unlinkSync(errorsFile);
                    }
                } catch (e) {
                    console.error("Error when deleting errors.txt: %s", e.stack);
                }

                console.log("Moving all generated files to the new storage directory");
                
                Object.keys(context.layers).forEach(function (layerId) {
                    var layer = context.layers[layerId];

                    // Recreate errors.txt if necessary, but only containing errors related to this document
                    // If we moved errors.txt directly, it might contain unrelated errors, too
                    utils.reportErrorsToUser(context, analysis.analyzeLayerName(layer.name).errors);

                    layers.getFilesRelatedToLayer(document.id, layerId).forEach(function (relativePath) {
                        var sourcePath = resolve(previousStorageDir, relativePath),
                            targetPath = resolve(newStorageDir, relativePath);

                        console.log("Moving %s to %s", sourcePath, targetPath);

                        var movedPromise = utils.moveFile(sourcePath, targetPath, true);
                        movedPromise.fail(function (err) {
                            console.error(err);
                        });

                        promises.push(movedPromise);
                    });
                });
                
                return Q.allSettled(promises).then(function () {
                    utils.deleteDirectoryIfEmpty(previousStorageDir);
                });
            }
        }
        
        // Did the user perform "Save as..."?
        if (wasSaved && previousPath !== context.path) {
            console.log("Save as... was used, turning asset generator off");
            // Turn asset generation off
            context.assetGenerationEnabled = false;
            menus.updateMenuState();
            // We do not need to update the document state because generator metadata
            // is cleared on saveas, so our assetGenerationEnabled = false is implicitly
            // in the metadata already.
        }
        
        // Return a resolved promise
        return resolvedPromise();
    }

    function updateDocumentState() {
        var context = contexts.getContext(_currentDocumentId);
        if (!context) {
            return;
        }
        
        var settings = { enabled: Boolean(context.assetGenerationEnabled) };
        utils.generator.setDocumentSettingsForPlugin(settings, PLUGIN_ID).done();
    }

    function setCurrentDocumentId(id) {
        if (_currentDocumentId === id) {
            return;
        }
        console.log("Current document ID:", id);
        _currentDocumentId = id;
        menus.updateMenuState();
    }

    function getCurrentDocumentId() {
        return _currentDocumentId;
    }

    function init() {
        utils.generator.onPhotoshopEvent("currentDocumentChanged", setCurrentDocumentId);

        utils.generator.onPhotoshopEvent("imageChanged", handleImageChanged);

        requestEntireDocument();
    }

    exports.requestEntireDocument = requestEntireDocument;
    exports.getCurrentDocumentId = getCurrentDocumentId;
    exports.updateDocumentState = updateDocumentState;
    exports.init = init;
}());