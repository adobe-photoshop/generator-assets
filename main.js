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

/*jshint unused: false */

(function () {
    "use strict";

    var fs      = require("fs"),
        resolve = require("path").resolve,
        Q       = require("q"),
        tmpName = Q.denodeify(require("tmp").tmpName),
        mkdirp  = require("mkdirp"),
        mkdirpQ = Q.denodeify(mkdirp);

    // These objects hold booleans keyed on document ID that flag whether we're waiting
    // to receive complete document info. If we get image changed events while
    // we're waiting, then we completely throw out the document info and request
    // it again.
    var _waitingForDocument = {},
        _gotChangeWhileWaiting = {};

    var utils = require("./lib/utils"),
        validation = require("./lib/validation");

    var PLUGIN_ID = require("./package.json").name,
        MENU_ID = "assets",
        // Note to third-party plugin developers: This string format ("$$$...") is used for
        // localization of strings that are built in to Photoshop. Third-party plugins should
        // use a regular string (or use their own approach to localization) for menu labels.
        // The user's locale can be accessed with the getPhotoshopLocale() API call on the
        // Generator singleton.
        //
        // Note to Photoshop engineers: This zstring must be kept in sync with the zstring in
        // generate.jsx in the Photoshop repo.
        MENU_LABEL = "$$$/JavaScripts/Generator/ImageAssets/Menu=Image Assets",
        // Files that are ignored when trying to determine whether a directory is empty
        FILES_TO_IGNORE = [".ds_store", "desktop.ini"],
        DELAY_TO_WAIT_UNTIL_USER_DONE = 300,
        MAX_SIMULTANEOUS_UPDATES = 50,
        MAX_DIR_RENAME_ATTEMPTS = 1000;

    // TODO: Once we get the layer change management/updating right, we should add a
    // big comment at the top of this file explaining how this all works. In particular
    // we should explain what contexts are, and how we manage scheduling updates.
    
    var _generator = null,
        _config = null,
        // For unsaved files
        _fallbackBaseDirectory = null,
        _contextPerDocument = {},
        _changeContextPerLayer = {},
        _photoshopPath = null,
        _currentDocumentId,
        _documentIdsWithMenuClicks = {},
        _pendingUpdates = [],
        _runningUpdates = 0;

    function stringify(object) {
        try {
            return JSON.stringify(object, null, "    ");
        } catch (e) {
            console.error(e);
        }
        return String(object);
    }

    function resolvedPromise() {
        // JSHint doesn't like Q() because it regards Q as a constructor
        return Q.call();
    }

    function getUserHomeDirectory() {
        return process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"];
    }

    function deleteDirectoryIfEmpty(directory) {
        try {
            if (!fs.existsSync(directory)) {
                console.log("Not deleting directory %j: it doesn't exist", directory);
                return;
            }
            
            var files = fs.readdirSync(directory),
                filesToKeep = files.filter(function (fileName) {
                    return FILES_TO_IGNORE.indexOf(fileName.toLowerCase()) === -1;
                });
            
            if (filesToKeep.length === 0) {
                if (files.length) {
                    console.log("Deleting unimportant files in %j: %j", directory, files);
                    files.forEach(function (fileName) {
                        fs.unlinkSync(resolve(directory, fileName));
                    });
                }
                console.log("Deleting empty directory %j", directory);
                fs.rmdirSync(directory);
            } else {
                console.log("Not deleting directory %j, it still contains items to keep: %j", directory, filesToKeep);
            }

            return true;
        } catch (e) {
            console.error("Error while trying to delete directory %j (if empty): %s", directory, e.stack);
            return false;
        }
    }

    function deleteFilesRelatedToLayer(documentId, layerId) {
        var documentContext = _contextPerDocument[documentId];
        if (!documentContext) { return; }

        var layerContext = documentContext.layers && documentContext.layers[layerId];
        if (!layerContext) { return; }
        
        getFilesRelatedToLayer(documentId, layerId).forEach(function (relativePath) {
            var path = resolve(documentContext.assetGenerationDir, relativePath);
            try {
                if (fs.existsSync(path)) {
                    console.log("Deleting %j", path);
                    fs.unlinkSync(path);
                } else {
                    console.log("Not deleting file %j - it does not exist", path);
                }
            } catch (e) {
                console.error("Error while deleting %j: %s", path, e.stack);
            }
        });
    }

    function getFilesRelatedToLayer(documentId, layerId) {
        var documentContext = _contextPerDocument[documentId];
        if (!documentContext) { return; }

        var layerContext = documentContext.layers && documentContext.layers[layerId];
        if (!layerContext) { return; }

        var components = layerContext.validFileComponents || [];
        return components.map(function (component) {
            return component.file;
        });
    }

    function parseLayerName(layerName) {
        var parts = layerName.split(/[,\+]/).map(function (layerName) {
            return layerName.trim();
        });
        return parts.map(parseFileSpec);
    }

    function parseFileSpec(fileSpec) {
        var result = {
            name: fileSpec
        };
        
        /* jshint maxlen: 160 */
        var exp = /^((((\d+|\d*\.\d+)(?:([a-z]{2}) )?|\?) *x *((\d+|\d*\.\d+)(?:([a-z]{2}) *)?|\?) +)|((\d+)% *))?(.+\.([a-z0-9]*[a-z]))(\-?(\d+%?))?$/i;
        
        /* jshint maxlen: 120 */
        
        var match = fileSpec.match(exp);
        // match items
        // 0 - matching string
        // 1 - matching part of the scaling (if both abs and rel, second one)
        // 2 - absolute scaling match string
        // 3 - absolute scaling width string (may be ?)
        // 4 - absolute scaling width number (undefined for ?)
        // 5 - absolute scaling width unit (if undefined - pixels)
        // 6 - absolute scaling height string (may be ?)
        // 7 - absolute scaling height number (undefined for ?)
        // 8 - absolute scaling height unit (if undefined - pixels)
        // 9 - relative scaling match string
        // 10 - relative scaling match number
        // 11 - file name
        // 12 - file extension
        // 13 - quality match string
        // 14 - quality number

        if (match) {
            result.file      = match[11];
            result.extension = match[12].toLowerCase();
            if (typeof match[13] !== "undefined") {
                result.quality = match[14];
            }
            if (typeof match[9] !== "undefined") {
                result.scale = parseInt(match[10], 10) / 100;
            }
            if (typeof match[2] !== "undefined") {
                if (match[3] !== "?") {
                    result.width = parseFloat(match[4]);
                    if (typeof match[5] !== "undefined") {
                        result.widthUnit = match[5];
                    }
                }
                if (match[6] !== "?") {
                    result.height = parseFloat(match[7]);
                    if (typeof match[8] !== "undefined") {
                        result.heightUnit = match[8];
                    }
                }
            }
        }

        return result;
    }
    
    function analyzeComponent(component, reportError) {
        var supportedUnits      = ["in", "cm", "px", "mm"];
        var supportedExtensions = ["jpg", "jpeg", "png", "gif"];

        if (_config && _config["svg-enabled"]) {
            supportedExtensions.push("svg");
        }

        if (_config && _config["webp-enabled"]) {
            supportedExtensions.push("webp");
        }

        // File name checks
        if (component.file) {
            validation.validateFileName(component.file, reportError);
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
            reportError("Unsupported image width unit " + stringify(component.widthUnit));
        }
        if (component.heightUnit && supportedUnits.indexOf(component.heightUnit) === -1) {
            reportError("Unsupported image height unit " + stringify(component.heightUnit));
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
                            "Quality must be between 1% and 100% (is " + stringify(component.quality) + ")"
                        );
                    } else {
                        component.quality = quality;
                    }
                }
                else {
                    quality = parseInt(component.quality, 10);
                    if (component.quality < 1 || component.quality > 10) {
                        reportError(
                            "Quality must be between 1 and 10 (is " + stringify(component.quality) + ")"
                        );
                    } else {
                        component.quality = quality * 10;
                    }
                }
            }
            else if (component.extension === "png") {
                if (["8", "24", "32"].indexOf(component.quality) === -1) {
                    reportError("PNG quality must be 8, 24 or 32 (is " + stringify(component.quality) + ")");
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

    function reportErrorsToUser(documentContext, errors) {
        if (!errors.length) {
            return;
        }
        if (documentContext.assetGenerationEnabled && documentContext.assetGenerationDir) {
            var text = "[" + new Date() + "]\n" + errors.join("\n") + "\n\n",
                directory = documentContext.assetGenerationDir;
            mkdirp.sync(directory);
            var errorsFile = resolve(directory, "errors.txt");
            try {
                fs.appendFileSync(errorsFile, text);
            } catch (e) {
                console.error("Failed to write to file %j: %s", errorsFile, e.stack);
                console.log("Errors were: %s", text);
            }
        }
    }

    function handleImageChanged(document) {
        console.log("Image " + document.id + " was changed:", stringify(document));

        if (_waitingForDocument[document.id]) {
            console.log("Ignoring this change because we're still waiting for the full document");
            _gotChangeWhileWaiting[document.id] = true;
            return;
        }

        // If the document was closed
        if (document.closed) {
            delete _contextPerDocument[document.id];
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

        var documentContext = _contextPerDocument[document.id];
        
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
                    deleteFilesRelatedToLayer(document.id, layerId);
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

    function handleCurrentDocumentChanged(id) {
        setCurrentDocumentId(id);
    }

    function setCurrentDocumentId(id) {
        if (_currentDocumentId === id) {
            return;
        }
        console.log("Current document ID:", id);
        _currentDocumentId = id;
        updateMenuState();
    }

    function handleGeneratorMenuClicked(event) {
        // Ignore changes to other menus
        var menu = event.generatorMenuChanged;
        if (!menu || menu.name !== MENU_ID) {
            return;
        }
        
        var startingMenuState = _generator.getMenuState(menu.name);
        console.log("Menu event %s, starting state %s", stringify(event), stringify(startingMenuState));
        _documentIdsWithMenuClicks[_currentDocumentId || ""] = startingMenuState;
        
        // Before we know about the current document, we cannot reasonably process the events
        if (!_currentDocumentId || !_contextPerDocument[_currentDocumentId]) {
            console.log("Processing menu event later because the current document is not yet loaded" +
                " (ID: " + _currentDocumentId + ")");
            return;
        }

        var nowEnabledDocumentIds = processMenuEvents();
        nowEnabledDocumentIds.forEach(requestEntireDocument);
    }

    function processMenuEvents() {
        var clickedDocumentIds = Object.keys(_documentIdsWithMenuClicks);
        if (clickedDocumentIds.length === 0) { return; }

        var nowEnabledDocumentIds = [];

        clickedDocumentIds.forEach(function (originalDocumentId) {
            var startingMenuState = _documentIdsWithMenuClicks[originalDocumentId];

            if (!originalDocumentId) {
                console.log("Interpreting menu event for unknown document" +
                    " as being for the current one (" + _currentDocumentId + ")");
            }

            // Object keys are always strings, so convert them to integer first
            // If the event was used to start Generator, _currentDocumentId was still undefined
            var documentId = parseInt(originalDocumentId, 10) || _currentDocumentId;
            
            var context = _contextPerDocument[documentId];
            
            // Without knowing the document that was active at the time of the event,
            // we cannot actually process any menu events.
            if (!context) {
                console.warn("Trying to process menu events for an unknown document with ID:", documentId);
                return false;
            }

            // Forget about the menu clicks for this document, we are processing them now
            delete _documentIdsWithMenuClicks[originalDocumentId];

            // Toggle the state
            context.assetGenerationEnabled = !(startingMenuState && startingMenuState.checked);
            if (context.assetGenerationEnabled) {
                nowEnabledDocumentIds.push(documentId);
            }

            console.log("Asset generation is now " +
                (context.assetGenerationEnabled ? "enabled" : "disabled") + " for document ID " + documentId);
        });

        updateMenuState();
        updateDocumentState();

        return nowEnabledDocumentIds;
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
        
        _generator.getDocumentInfo(documentId).then(
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
                console.log("Received complete document:", stringify(document));

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
                if (_contextPerDocument[documentId]) {
                    resetDocumentContext(documentId);
                }
                processChangesToDocument(document);
            },
            function (err) {
                console.error("[Assets] Error in getDocumentInfo:", err);
            }
        ).done();
    }

    function updateMenuState() {
        var context = _contextPerDocument[_currentDocumentId],
            enabled = context ? Boolean(context.assetGenerationEnabled) : false;

        console.log("Setting menu state to", enabled);
        _generator.toggleMenu(MENU_ID, true, enabled);
    }

    function updateDocumentState() {
        var context = _contextPerDocument[_currentDocumentId];
        if (!context) {
            return;
        }
        
        var settings = { enabled: Boolean(context.assetGenerationEnabled) };
        _generator.setDocumentSettingsForPlugin(settings, PLUGIN_ID).done();
    }

    function resetDocumentContext(documentId) {
        console.log("Resetting state for document", documentId);
        var context = _contextPerDocument[documentId];
        if (!context) {
            context = _contextPerDocument[documentId] = {
                assetGenerationEnabled: false
            };
        }
        context.document = { id: documentId };
        context.layers   = {};
    }

    function processChangesToDocument(document) {
        // Stop if the document isn't an object describing a menu (could be "[ActionDescriptor]")
        // Happens if no document is open, but maybe also at other times
        if (!document.id) {
            return;
        }
        
        var context = _contextPerDocument[document.id];
        
        if (!context) {
            resetDocumentContext(document.id);
            context = _contextPerDocument[document.id];
            
            if (document.generatorSettings) {
                console.log("Document contains generator settings", document.generatorSettings);
                var settings = _generator.extractDocumentSettings(document, PLUGIN_ID);
                console.log("Parsed generator for plugin " + PLUGIN_ID + " as", settings);
                context.assetGenerationEnabled = Boolean(settings.enabled);
                updateMenuState();
            }
        }

        // Now that we know this document, we can actually process any related menu clicks
        processMenuEvents();

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
                        pendingPromises.push(processLayerChange(document, layer));
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
                            pendingPromises.push(processLayerChange(document, { id: parentLayerId }));
                        }
                    }
                }

                Q.allSettled(pendingPromises).then(function () {
                    // Delete directory foo-assets/ for foo.psd if it is empty now
                    deleteDirectoryIfEmpty(context.assetGenerationDir);
                });
            })
            .done();
    }

    function processPathChange(document) {
        var context      = _contextPerDocument[document.id],
            wasSaved     = context.isSaved,
            previousPath = context.path;

        console.log("Document path changed from %j to %j", previousPath, document.file);

        var previousStorageDir = context.assetGenerationDir;
        updatePathInfoForDocument(document);
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
                    reportErrorsToUser(context, analyzeLayerName(layer.name).errors);

                    getFilesRelatedToLayer(document.id, layerId).forEach(function (relativePath) {
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
                    deleteDirectoryIfEmpty(previousStorageDir);
                });
            }
        }
        
        // Did the user perform "Save as..."?
        if (wasSaved && previousPath !== context.path) {
            console.log("Save as... was used, turning asset generator off");
            // Turn asset generation off
            context.assetGenerationEnabled = false;
            updateMenuState();
            // We do not need to update the document state because generator metadata
            // is cleared on saveas, so our assetGenerationEnabled = false is implicitly
            // in the metadata already.
        }
        
        // Return a resolved promise
        return resolvedPromise();
    }

    function processLayerChange(document, layer) {
        console.log("Scheduling change to layer %s of %s", layer.id, document.id);
        var documentContext = _contextPerDocument[document.id],
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

    function updatePathInfoForDocument(document) {
        var pathLib  = require("path"),
            extname  = pathLib.extname,
            basename = pathLib.basename,
            dirname  = pathLib.dirname;

        var context = _contextPerDocument[document.id],
            // The path to the document's file, or just its name (e.g., "Untitled-1" or "/foo/bar/hero-image.psd")
            path = document.file,
            // Determine whether the file is saved (i.e., it contains slashes or backslashes and is not in the trash)
            // Note that on Windows, a deleted file is reported without an absolute path
            isSaved = path.match(/[\/\\]/) && path.indexOf("/.Trashes/") === -1,
            // The file extension, including the dot (e.g., ".psd")
            extension = extname(path),
            // The file name, possibly with an extension (e.g., "Untitled-1" or "hero-image.psd")
            fileName = basename(path),
            // The file name without its extension (e.g., "Untitled-1" or "hero-image")
            documentName = extension.length ? fileName.slice(0, -extension.length) : fileName,
            // For saved files, the directory the file was saved to. Otherwise, ~/Desktop
            baseDirectory = isSaved ? dirname(path) : _fallbackBaseDirectory,
            // The directory to store generated assets in
            assetGenerationDir = baseDirectory ? resolve(baseDirectory, documentName + "-assets") : null;

        context.path               = path;
        context.isSaved            = isSaved;
        context.assetGenerationDir = assetGenerationDir;
    }

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
            
            var analysis = analyzeLayerName(layerContext.name);
            layerContext.validFileComponents = analysis.validFileComponents;
            
            reportErrorsToUser(documentContext, analysis.errors);
        }

        function convertToPixels(value, unit) {
            if (!value || !unit || unit === "px") {
                return value;
            }
            
            var ppi = documentContext.ppi;

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

        function createLayerImage(data, fileName, settings) {
            var imageCreatedDeferred = Q.defer(),
                path = resolve(documentContext.assetGenerationDir, fileName),
                tmpPath;
            
            console.log("Generating", path);

            // Create a temporary file name
            tmpName()
                .then(function (path) {
                    // Save the image in a temporary file
                    tmpPath = path;
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
                        return _generator.savePixmap(data, tmpPath, settings);
                    }
                })
                .then(function () {
                    // Create the target directory
                    return mkdirpQ(documentContext.assetGenerationDir);
                })
                .then(function () {
                    // Move the temporary file to the desired location
                    // If this fails, delete the temporary file anyway (3rd parameter: true)
                    return utils.moveFile(tmpPath, path, true);
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
                var svgPromise = _generator.getSVG(layer.id, component.scale || 1);
                return svgPromise.then(
                    function (svgJSON) {
                        console.log("Received SVG text:\n" + decodeURI(svgJSON.svgText));
                        return createLayerImage(decodeURI(svgJSON.svgText),
                                                component.file,
                                                {format:  component.extension});
                    },
                    function (err) {
                        console.log("SVG creation bombed: " + err + "\n");
                    }
                );
            }

            // Code path for pixel-based output (SVG output will cause an early return)
            var scaleSettings = {
                    width:  convertToPixels(component.width,  component.widthUnit),
                    height: convertToPixels(component.height, component.heightUnit),
                    scaleX: component.scaleX || component.scale,
                    scaleY: component.scaleY || component.scale,
                    // Backwards compatibility
                    scale:  component.scale
                },
                
                // Mask
                maskBounds = layerContext.mask && layerContext.mask.bounds,
                
                // Static: User provided
                staticBounds  = _generator.getDeepBounds(layerContext),
                // Visible: User provided + effects
                visibleBounds = exactBounds,
                // Padded: User provided + effects + padding through layer mask
                paddedBounds  = !maskBounds ? exactBounds : {
                    left:   Math.min(exactBounds.left,   maskBounds.left),
                    top:    Math.min(exactBounds.top,    maskBounds.top),
                    right:  Math.max(exactBounds.right,  maskBounds.right),
                    bottom: Math.max(exactBounds.bottom, maskBounds.bottom)
                },

                pixmapSettings = _generator.getPixmapParams(scaleSettings, staticBounds, visibleBounds, paddedBounds);

            if (_config && _config["use-smart-scaling"]) {
                pixmapSettings.useSmartScaling = true;
            }

            if (_config && _config["include-ancestor-masks"]) {
                pixmapSettings.includeAncestorMasks = true;
            }

            // Get the pixmap
            console.log("Requesting pixmap for layer %d (%s) in document %d with settings %j",
                layer.id, layerContext.name || layer.name,
                document.id, pixmapSettings);
            return _generator.getPixmap(document.id, layer.id, pixmapSettings).then(
                function (pixmap) {
                    var padding;
                    if (pixmapSettings.getPadding) {
                        padding = pixmapSettings.getPadding(pixmap.width, pixmap.height);
                    }
                    return createLayerImage(pixmap, component.file, {
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
                    reportErrorsToUser(documentContext, [
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
            documentContext = _contextPerDocument[document.id];
            layerContext    = (documentContext && documentContext.layers) ? documentContext.layers[layer.id] : {};
            
            // The image could have been closed in the meantime
            if (!documentContext) { continue; }

            console.log("Updating layer " + layer.id + " (" + stringify(layer.name || layerContext.name) +
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

        function createLayerImages() {
            var components = layerContext.validFileComponents;

            var boundsOnlySettings = {
                boundsOnly: true
            };
            if (_config && _config["include-ancestor-masks"]) {
                boundsOnlySettings.includeAncestorMasks = true;
            }

            // Get exact bounds
            _generator.getPixmap(document.id, layer.id, boundsOnlySettings).then(
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
                            reportErrorsToUser(documentContext, errors);
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

        if (assetsUpdateNeeded) {
            // This will resolve the deferred
            createLayerImages();
        } else {
            layerUpdatedDeferred.resolve();
        }

        return layerUpdatedDeferred.promise;
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

    function initPhotoshopPath() {
        return _generator.getPhotoshopPath().then(
            function (path) {
                _photoshopPath = path;
            },
            function (err) {
                console.error("[Assets] Error in init: Could not get photoshop path:", err);
            }
        );
    }

    function initFallbackBaseDirectory() {
        // First, check whether we can retrieve the user's home directory
        var homeDirectory = getUserHomeDirectory();
        if (homeDirectory) {
            _fallbackBaseDirectory = resolve(homeDirectory, "Desktop");
        } else {
            console.error("[Assets] Error in init: " +
                "Could not locate home directory in env vars, no assets will be dumped for unsaved files"
            );
        }
    }

    function init(generator, config) {
        _generator = generator;
        _config = config;

        console.log("initializing generator-assets plugin with config %j", _config);

        // TODO: Much of this initialization is currently temporary. Once
        // we have storage of assets in the correct location implemented, we
        // should rewrite this to be more structured. The steps of init should
        // be something like:
        //
        // 0. Add menu item
        // 1. Get PS path
        // 2. Register for PS events we care about
        // 3. Get document info on current document, set menu state
        // 4. Initiate asset generation on current document if enabled
        //

        _generator.addMenuItem(MENU_ID, MENU_LABEL, true, false).then(
            function () {
                console.log("Menu created", MENU_ID);
            }, function () {
                console.error("Menu creation failed", MENU_ID);
            }
        );
        _generator.onPhotoshopEvent("generatorMenuChanged", handleGeneratorMenuClicked);

        // Plugins should do as little as possible synchronously in init(). That way, all plugins get a
        // chance to put "fast" operations (e.g. menu registration) into the photoshop communication
        // pipe before slower startup stuff gets put in the pipe. Photoshop processes requests one at
        // a time in FIFO order.
        function initLater() {
            _generator.onPhotoshopEvent("currentDocumentChanged", handleCurrentDocumentChanged);

            initFallbackBaseDirectory();
            initPhotoshopPath().then(function () {
                _generator.onPhotoshopEvent("imageChanged", handleImageChanged);

                requestEntireDocument();
            }).done();
        }
        
        process.nextTick(initLater);

    }

    exports.init = init;

    // Unit test function exports
    exports._parseLayerName   = parseLayerName;
    exports._analyzeComponent = analyzeComponent;
    exports._setConfig = function (config) { _config = config; };

}());
