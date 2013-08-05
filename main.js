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
        resolve = require("path").resolve,
        tmp = require("tmp"),
        Q = require("q"),
        mkdirp = Q.denodeify(require("mkdirp")),
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
        MENU_LABEL = "$$$/JavaScripts/Generator/WebAssets/Menu=Web Assets",
        DELAY_TO_WAIT_UNTIL_USER_DONE = 300,
        MAX_SIMULTANEOUS_UPDATES = 50;

    // TODO: Once we get the layer change management/updating right, we should add a
    // big comment at the top of this file explaining how this all works. In particular
    // we should explain what contexts are, and how we manage scheduling updates.
    
    var _generator = null,
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

    function getUserHomeDirectory() {
        return process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"];
    }

    function deleteDirectoryRecursively(directory) {
        // Directory doesn't exist? We're done.
        if (!fs.existsSync(directory)) {
            return;
        }
        
        // Delete all entries in the directory
        var files = fs.readdirSync(directory);
        files.forEach(function (file) {
            var path = resolve(directory, file);
            if (fs.statSync(path).isDirectory()) {
                deleteDirectoryRecursively(path);
            } else {
                fs.unlinkSync(path);
            }
        });

        // Delete the now empty directory
        fs.rmdirSync(directory);
    }

    function deleteDirectoryIfEmpty(directory) {
        if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
            fs.rmdirSync(directory);
        }
    }

    function parseLayerName(layerName) {
        var parts = layerName.split(/ *[,\+] */);
        return parts.map(parseFileSpec);
    }

    function parseFileSpec(fileSpec) {
        var result = {
            name: fileSpec
        };
        
        /* jshint maxlen: 160 */
        var exp = /^((((\d+)(?:([a-z]{2}) )?|\?) *x *((\d+)(?:([a-z]{2}) *)?|\?) +)|((\d+)% *))?(.+\.([a-z0-9]*[a-z]))(\-?(\d+%?))?$/i;
        
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
                    result.width = parseInt(match[4], 10);
                    if (typeof match[5] !== "undefined") {
                        result.widthUnit = match[5];
                    }
                }
                if (match[6] !== "?") {
                    result.height = parseInt(match[7], 10);
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
        var supportedExtensions = ["jpg", "jpeg", "png", "gif", "svg", "webp"];

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
        if (component.extension && supportedExtensions.indexOf(component.extension) === -1) {
            reportError("Unsupported file extension " + stringify(component.extension));
        }

        var quality;
        if ((typeof component.quality) !== "undefined") {
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
        var components = parseLayerName(layerName),
            errors = [];

        var validFileComponents = components.filter(function (component) {
            if (!component.file) {
                return false;
            }

            var hadErrors = false;
            function reportError(message) {
                hadErrors = true;
                errors.push(component.name + ": " + message);
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
            mkdirp(directory).then(function () {
                fs.appendFileSync(resolve(directory, "errors.txt"), text);
            }).done();
        }
    }

    function handleImageChanged(document) {
        console.log("Image " + document.id + " was changed:", stringify(document));

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

        // Possible reasons for an undefined context:
        // - User created a new image
        // - User opened an image
        // - User switched to an image that was created/opened before Generator started
        if (!_contextPerDocument[document.id]) {
            console.log("Unknown document, so getting all information");
            requestEntireDocument(document.id);
            return;
        }
            
        // We have seen this document before: information about the changes are enough
        
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
        
        console.log("Menu event", stringify(event));
        _documentIdsWithMenuClicks[_currentDocumentId || ""] = true;
        
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
            context.assetGenerationEnabled = !context.assetGenerationEnabled;
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
        if (!documentId) {
            console.log("Determining the current document ID");
        }
        
        _generator.getDocumentInfo(documentId).then(
            function (document) {
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
                _generator.publish("assets.error.getDocumentInfo", err);
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
        console.log("Resetting state for document" + documentId);
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

        // If there is a file name (e.g., after saving or when switching between files, even unsaved ones)
        if (document.file) {
            processPathChange(document);
        }

        if (document.resolution) {
            context.resolution = document.resolution;
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
            // Delete ~/Desktop/generator if it is empty now
            // Could fail if the user adjusts the thumbnail size in Finder on Mac OS X
            // The size is stored as .DS_Store, making the directory seem not empty
            deleteDirectoryIfEmpty(_fallbackBaseDirectory);
        });
    }

    function processPathChange(document) {
        var context            = _contextPerDocument[document.id],
            wasSaved           = context.isSaved,
            previousPath       = context.path,
            previousStorageDir = context.assetGenerationDir;

        updatePathInfoForDocument(document);

        // Did the user perform "Save as..."?
        if (wasSaved && previousPath !== context.path) {
            // Turn asset generation off
            context.assetGenerationEnabled = false;
            updateMenuState();
            updateDocumentState();
        }

        if (!wasSaved && context.isSaved && previousStorageDir) {
            // Delete the assets of a previous file
            // Photoshop will have asked the user to confirm overwriting the PSD file at this point,
            // so "overwriting" its assets is fine, too
            if (fs.existsSync(context.assetGenerationDir)) {
                deleteDirectoryRecursively(context.assetGenerationDir);
            }

            // Move the directory with the assets to the new location
            // TODO: check whether this works when moving from one drive letter to another on Windows
            fs.rename(previousStorageDir, context.assetGenerationDir, function (err) {
                if (err) {
                    _generator.publish("assets.error.rename", err);
                }
            });
        }
    }

    function processLayerChange(document, layer) {
        var documentContext = _contextPerDocument[document.id],
            layerContext    = documentContext.layers[layer.id];

        if (!layerContext) {
            layerContext = documentContext.layers[layer.id] = {
                generatedFiles: {}
            };
        }

        // Layer change context
        var contextID = document.id + "-" + layer.id,
            context = _changeContextPerLayer[contextID];
        if (!context) {
            // Initialize the context object for this layer.
            // It will be deleted again once an update has finished
            // without the image changing during the update.
            context = _changeContextPerLayer[contextID] = {
                // Store the context ID here so the context can be deleted by finishLayerUpdate
                id:                     contextID,
                document:               document,
                documentContext:        documentContext,
                layer:                  layer,
                layerContext:           layerContext,
                updateIsScheduled:      false,
                updateIsObsolete:       false,
                updateDelayTimeout:     null,
                updateCompleteDeferred: Q.defer()
            };
        }

        // Regardless of the nature of the change, we want to make sure that
        // all changes to a layer are processed in sequence
        scheduleLayerUpdate(context);

        return context.updateCompleteDeferred.promise;
    }

    function updatePathInfoForDocument(document) {
        var extname = require("path").extname,
            basename = require("path").basename,
            dirname = require("path").dirname;

        var context = _contextPerDocument[document.id],
            // The path to the document's file, or just its name (e.g., "Untitled-1" or "/foo/bar/hero-image.psd")
            path = document.file,
            // Determine whether the file is saved (i.e., it contains slashes or backslashes)...
            isSaved = path.match(/[\/\\]/),
            // The file extension, including the dot (e.g., ".psd")
            extension = extname(path),
            // The file name, possibly with an extension (e.g., "Untitled-1" or "hero-image.psd")
            fileName = basename(path),
            // The file name without its extension (e.g., "Untitled-1" or "hero-image")
            documentName = extension.length ? fileName.slice(0, -extension.length) : fileName,
            // For saved files, the directory the file was saved to. Otherwise, ~/Desktop/generator
            baseDirectory = isSaved ? dirname(path) : _fallbackBaseDirectory;

        // Store the document's path
        context.path = path;
        // Determine whether the file is saved (i.e., the path is absolute, thus containing slashes or backslashes)...
        context.isSaved = isSaved;
        // Store the directory to store generated assets in
        context.assetGenerationDir = baseDirectory ? resolve(baseDirectory, documentName + "-assets") : null;
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
        var layerUpdatedDeferred = Q.defer();

        console.log("Updating layer " + changeContext.layer.id +
            " (" + stringify(changeContext.layer.name || changeContext.layerContext.name) +
                ") of document " + changeContext.document.id
        );

        var documentContext = changeContext.documentContext,
            layerContext    = changeContext.layerContext,
            layer           = changeContext.layer;

        function deleteLayerImages() {
            Object.keys(layerContext.generatedFiles).forEach(function (path) {
                if (fs.existsSync(path)) {
                    fs.unlinkSync(path);
                }
            });
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
            
            var resolution = changeContext.documentContext.resolution;
            if (unit === "in") {
                return value * resolution;
            } else if (unit === "mm") {
                return (value / 25.4) * resolution;
            } else if (unit === "cm") {
                return (value / 2.54) * resolution;
            } else {
                console.error("An invalid length unit was specified: " + unit);
            }
        }

        // TODO: Make sure this function is refactored so that it doesn't have so much
        // callback nesting. This function will change substantially when we move image
        // creation to core, so avoiding the refactor right now.
        function createLayerImage(pixmap, fileName, settings) {
            var imageCreatedDeferred = Q.defer(),
                path = resolve(documentContext.assetGenerationDir, fileName);
            
            console.log("Generating", path);

            // Create a temporary file name
            tmp.tmpName(function (err, tmpPath) {
                if (err) {
                    imageCreatedDeferred.reject(err);
                    return;
                }

                // Save the image in a temporary file
                _generator.savePixmap(pixmap, tmpPath, settings).then(
                    // When ImageMagick is done
                    function () {
                        var directory = changeContext.documentContext.assetGenerationDir;
                        mkdirp(directory)
                            .fail(function () {
                                _generator.publish(
                                    "assets.error.init",
                                    "Could not create directory '" + directory + "'"
                                );
                                imageCreatedDeferred.reject();
                            })
                            .done(function () {
                                // ...move the temporary file to the desired location
                                // TODO: check whether this works when moving from one
                                // drive letter to another on Windows

                                function onMoveCompleted() {
                                    layerContext.generatedFiles[path] = true;
                                    imageCreatedDeferred.resolve();
                                }

                                fs.rename(tmpPath, path, function (err) {
                                    // Renaming the file worked: we're done
                                    if (!err) {
                                        return onMoveCompleted();
                                    }

                                    // There was an error when renaming, so let's try copy + delete instead
                                    try {
                                        // The notion of copying a file is too high level for Node.js,
                                        // so we pipe a read stream into a write stream

                                        // Setup error handling
                                        var readStream = fs.createReadStream(tmpPath);
                                        readStream.on("error", function (err) {
                                            console.error("Error while reading " + tmpPath + ": " + err);
                                            imageCreatedDeferred.reject(err);
                                        });

                                        var writeStream = fs.createWriteStream(path);
                                        writeStream.on("error", function (err) {
                                            console.error("Error while writing " + path + ": " + err);
                                            imageCreatedDeferred.reject(err);
                                        });

                                        // Pipe the contents of tmpPath to path
                                        readStream.pipe(writeStream);
                                    } catch (e) {
                                        // If copying doesn't work, we're out of options
                                        imageCreatedDeferred.reject(e);
                                        return;
                                    }
                                    // Copy was successful, now delete the temporary file
                                    fs.unlink(tmpPath, function (err) {
                                        // If we fail to delete the temporary file, report the error and continue
                                        if (err) {
                                            console.error("Could not delete the temporary file", tmpPath);
                                        }
                                        onMoveCompleted();
                                    });
                                });
                            });
                    },
                    function (err) {
                        imageCreatedDeferred.reject(err);
                    }
                );
            });
            
            return imageCreatedDeferred.promise;
        }

        function createLayerImages() {
            var components = layerContext.validFileComponents,
                emptyPixmapReceived = false;

            var componentPromises = components.map(function (component) {
                // SVGs use a different code path from the pixel-based formats
                if (component.extension === "svg") {
                    var fileSavedDeferred = Q.defer();

                    var svgActionString = _generator.svgEnable() ? "Creating" : "Skipping (disabled)";
                    console.log(svgActionString + " SVG for layer " +
                                changeContext.layer.id + " (" + component.name + ")");
                    _generator.saveLayerToSVGFile(changeContext.layer.id, component.scale || 1, component.file);

                    // TODO: We should verify results here.
                    var generatedPath = resolve(documentContext.assetGenerationDir, component.file);
                    layerContext.generatedFiles[generatedPath] = true;
                    
                    // TODO: Make sure this is called when the file operation is actually done...
                    fileSavedDeferred.resolve();
                    
                    return fileSavedDeferred.promise;
                }

                // Copy component into settings
                var settings = {
                        quality: component.quality,
                        format:  component.extension,
                        ppi:     documentContext.resolution
                    },
                    scaleX = component.scale || 1,
                    scaleY = component.scale || 1,
                    width  = convertToPixels(component.width,  component.widthUnit),
                    height = convertToPixels(component.height, component.heightUnit);

                if ((width && width !== layerContext.width) || (height && height !== layerContext.height)) {
                    if (width) {
                        width  = Math.max(1, Math.round(width));
                        scaleX = width / layerContext.width;
                        if (!height) {
                            scaleY = scaleX;
                        }
                    }
                    if (height) {
                        height = Math.max(1, Math.round(height));
                        scaleY = height / layerContext.height;
                        if (!width) {
                            scaleX = scaleY;
                        }
                    }
                }

                // Get the pixmap
                return _generator.getPixmap(changeContext.document.id, changeContext.layer.id, scaleX, scaleY).then(
                    function (pixmap) {
                        var expectedWidth = layerContext.width * scaleX;
                        var expectedHeight = layerContext.height * scaleY;

                        if (pixmap.width !== expectedWidth || pixmap.height !== expectedHeight) {
                            console.warn("Image size is " + layerContext.width + "x" + layerContext.height +
                                ", scaling by " + scaleX + " / " + scaleY +
                                ", expected to get " + expectedWidth + "x" + expectedHeight +
                                ", got " + pixmap.width + "x" + pixmap.height);
                        }

                        // Prevent an error after deleting a layer's contents, resulting in a 0x0 pixmap
                        if (!emptyPixmapReceived && (pixmap.width === 0 || pixmap.height === 0)) {
                            emptyPixmapReceived = true;
                            deleteLayerImages();
                        }
                        if (emptyPixmapReceived) {
                            layerUpdatedDeferred.resolve();
                            return;
                        }

                        return createLayerImage(pixmap, component.file, settings);
                    },
                    function (err) {
                        console.error(err);
                        reportErrorsToUser(documentContext, [
                            "Failed to get pixmap of layer " + changeContext.layer.id +
                            " (" + (changeContext.layer.name || changeContext.layerContext.name) + "): " + err
                        ]);
                        _generator.publish("assets.error.getPixmap", "Error: " + err);
                        layerUpdatedDeferred.reject(err);
                    }
                );
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
                layer.layers.forEach(function (subLayer) {
                    var subLayerContext = documentContext.layers[subLayer.id];
                    subLayerContext.parentLayerId = layer.id;
                });
            }
            // This layer doesn't have a parent (otherwise the event would have been for the parent)
            else if (layer.atRootOfChange) {
                delete layerContext.parentLayerId;
            }
        }

        if (layer.bounds) {
            layerContext.width  = layer.bounds.right  - layer.bounds.left;
            layerContext.height = layer.bounds.bottom - layer.bounds.top;
        }

        if (layer.removed || !layerContext.validFileComponents || layerContext.validFileComponents.length === 0) {
            // If the layer was removed, we're done since we delete the images above
            // If there are no valid file components anymore, there's nothing to generate
            layerUpdatedDeferred.resolve();
        }
        else if (!documentContext.assetGenerationEnabled) {
            layerUpdatedDeferred.resolve();
        }
        else if (!documentContext.assetGenerationDir) {
            layerUpdatedDeferred.resolve();
        }
        else {
            // Update the layer image
            // The change could be layer.pixels, layer.added, layer.path, layer.name, ...
            // Always update if it has been added because it could
            // have been dragged & dropped or copied & pasted,
            // and therefore might not be empty like new layers
            createLayerImages();
        }

        return layerUpdatedDeferred.promise;
    }

    // Run a pending update if necessary
    function finishLayerUpdate(changeContext) {
        changeContext.updateIsScheduled = false;
        // If the update is obsolete, schedule another one right after
        // This update will still be delayed to give Photoshop some time to catch its breath
        if (changeContext.updateIsObsolete) {
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
                _generator.publish(
                    "assets.error.init",
                    "Could not get photoshop path: " + err
                );
            }
        );
    }

    function initFallbackBaseDirectory() {
        // First, check whether we can retrieve the user's home directory
        var homeDirectory = getUserHomeDirectory();
        if (homeDirectory) {
            _fallbackBaseDirectory = resolve(homeDirectory, "Desktop", "generator");
        } else {
            _generator.publish(
                "assets.error.init",
                "Could not locate home directory in env vars, no assets will be dumped for unsaved files"
            );
        }
    }

    function init(generator) {
        _generator = generator;

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
                _generator.publish("assets.info.menuCreated", MENU_ID);
            }, function () {
                _generator.publish("assets.error.menuCreationFailed", MENU_ID);
            }
        );
        _generator.subscribe("photoshop.event.generatorMenuChanged", handleGeneratorMenuClicked);
        _generator.subscribe("photoshop.event.currentDocumentChanged", handleCurrentDocumentChanged);

        initFallbackBaseDirectory();
        initPhotoshopPath().then(function () {
            _generator.subscribe("photoshop.event.imageChanged", handleImageChanged);

            requestEntireDocument();
        }).done();
    }

    exports.init = init;

    // Unit test function exports
    exports._parseLayerName   = parseLayerName;
    exports._analyzeComponent = analyzeComponent;

}());
