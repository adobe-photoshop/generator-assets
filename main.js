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
        convert = require("./lib/convert");

    var DELAY_TO_WAIT_UNTIL_USER_DONE = 300,
        MENU_ID = "assets";

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
        _setupDone = false,
        _menuClicked = false;

    function getUserHomeDirectory() {
        return process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"];
    }

    // TODO: PNG-8 right now basically means GIF-like PNGs (binary transparency)
    //       Ultimately, we want it to mean a palette of RGBA colors (arbitrary transparency)
    function convertImage(pixmap, filename, format, quality, scale, width, height) {
        var fileCompleteDeferred = Q.defer();

        _generator.publish("assets.debug.dump", "dumping " + filename);

        var backgroundColor = "#fff";

        if (format === "png" && quality) {
            format = "png" + quality;
        }

        var args = [
            // In order to know the pixel boundaries, ImageMagick needs to know the resolution and pixel depth
            "-size", pixmap.width + "x" + pixmap.height,
            "-depth", 8,
            // pixmap.pixels contains the pixels in ARGB format, but ImageMagick only understands RGBA
            // The color-matrix parameter allows us to compensate for that
            "-color-matrix", "0 1 0 0, 0 0 1 0, 0 0 0 1, 1 0 0 0",
            // Read the pixels in RGBA form from STDIN
            "rgba:-"
        ];

        if (width || height) {
            if (width && height) {
                args.push("-resize", width + "x" + height + "!"); // ! ignores ratio
            } else if (width) {
                args.push("-resize", width);
            } else {
                args.push("-resize", "x" + height);
            }
        }

        
        if (format === "jpg" || format === "gif" || format === "png8" || format === "png24") {
            args.push("-background", backgroundColor, "-flatten");
        }
        if (format === "gif" || format === "png8") {
            args.push("-transparent", backgroundColor);
        }
        if (scale) {
            args.push("-resize", (scale * 100) + "%");
        }
        if (format === "jpg" && quality) {
            args.push("-quality", quality);
        }

        // "png8" as a format produces different colors
        if (format === "png8") {
            format = "png";
        }

        // Write an image of format <format> to STDOUT
        args.push(format + ":-");

        var proc = convert(args, _photoshopPath);
        var fileStream = fs.createWriteStream(filename);
        var stderr = "";

        proc.stderr.on("data", function (chunk) {
            stderr += chunk;
        });

        proc.stdout.pipe(fileStream);
        proc.stdin.end(pixmap.pixels);

        proc.stdout.on("close", function () {
            if (stderr) {
                var error = "error from ImageMagick: " + stderr;
                _generator.publish("assets.error.convert", error);
                fileCompleteDeferred.reject(stderr);
            } else {
                fileCompleteDeferred.resolve(filename);
            }
        });
        
        return fileCompleteDeferred.promise;
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

        var exp = /^((((\d+)|\?)x((\d+)|\?) *)|((\d+)% *))?(.+\.([a-z0-9]*[a-z]))(\-?(\d+%?))?$/i;
        var match = fileSpec.match(exp);
        // match items
        // 0 - matching string
        // 1 - matching part of the scaling (if both abs and rel, second one)
        // 2 - absolute scaling match string
        // 3 - absolute scaling width string (may be ?)
        // 4 - absolute scaling width number (undefined for ?)
        // 5 - absolute scaling height string (may be ?)
        // 6 - absolute scaling height number (undefined for ?)
        // 7 - relative scaling match string
        // 8 - relative scaling match number
        // 9 - file name
        // 10 - file extension
        // 11 - quality match string
        // 12 - quality number

        if (match) {
            result.file      = match[9];
            result.extension = match[10].toLowerCase();
            if (typeof match[11] !== "undefined") {
                result.quality = match[12];
            }
            if (typeof match[7] !== "undefined") {
                result.scale = parseInt(match[8], 10) / 100;
            }
            if (typeof match[2] !== "undefined") {
                if (match[3] !== "?") {
                    result.width = parseInt(match[4], 10);
                }
                if (match[5] !== "?") {
                    result.height = parseInt(match[6], 10);
                }
            }
        }

        return result;
    }
    
    function analyzeLayerName(layerName) {
        var components = parseLayerName(layerName),
            errors = [],
            quality;
        
        var validFileComponents = components.filter(function (component) {
            if (!component.file) {
                return false;
            }

            var hadErrors = false;
            function reportError(message) {
                hadErrors = true;
                errors.push(component.name + ": " + message);
            }
            
            if (component.scale === 0) {
                reportError("Cannot scale an image to 0%");
            }

            if (component.width === 0) {
                reportError("Cannot set an image width to 0");
            }

            if (component.height === 0) {
                reportError("Cannot set an image height to 0");
            }

            if (component.extension === "jpeg") {
                component.extension = "jpg";
            }

            if (["jpg", "png", "gif", "svg"].indexOf(component.extension) === -1) {
                reportError("Unsupported file extension " + JSON.stringify(component.extension));
            }
            
            if ((typeof component.quality) !== "undefined") {
                if (component.extension === "jpg") {
                    if (component.quality.slice(-1) === "%") {
                        quality = parseInt(component.quality.slice(0, -1), 10);
                        if (quality < 1 || quality > 100) {
                            reportError(
                                "JPEG quality must be between 1% and 100% (is " +
                                JSON.stringify(component.quality) +
                                ")"
                            );
                        } else {
                            component.quality = quality;
                        }
                    }
                    else {
                        quality = parseInt(component.quality, 10);
                        if (component.quality < 1 || component.quality > 10) {
                            reportError(
                                "JPEG quality must be between 1 and 10 (is " +
                                JSON.stringify(component.quality) +
                                ")"
                            );
                        } else {
                            component.quality = quality * 10;
                        }
                    }
                }
                else if (component.extension === "png") {
                    if (["8", "24", "32"].indexOf(component.quality) === -1) {
                        reportError("PNG quality must be 8, 24 or 32 (is " + JSON.stringify(component.quality) + ")");
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
        console.log("Image was changed:", document);

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
                processDocumentId(null);
            }
            // Stop here
            return;
        }

        processDocumentId(document.id);

        // Possible reasons for an undefined context:
        // - User created a new image
        // - User opened an image
        // - User switched to an image that was created/opened before Generator started
        if (!_contextPerDocument[document.id]) {
            // Make sure we have all information
            processEntireDocument();
            return;
        }
            
        // We have seen this document before: information about the changes are enough
        
        // Resize event: regenerate everything
        if (!document.layers && document.bounds) {
            processEntireDocument();
        } else {
            processChangesToDocument(document);
        }
    }

    function handleCurrentDocumentChanged(id) {
        processDocumentId(id);
    }

    function handleGeneratorMenuClicked(event) {
        // Ignore changes to other menus
        var menu = event.generatorMenuChanged;
        if (!menu || menu.name !== MENU_ID) {
            return;
        }
        
        console.log(event);

        // Before we know about the current document, we cannot reasonably process the events
        _menuClicked = true;
        if (!_setupDone) {
            return;
        }
        
        processMenuEvents();
        
        var context = _contextPerDocument[_currentDocumentId];
        if (context && context.assetGenerationEnabled) {
            processEntireDocument();
        }
    }

    function processMenuEvents() {
        if (!_menuClicked) {
            return;
        }

        // Without a current document, we cannot actually process any menu events
        // But there also shouldn't be such an event then
        var context = _contextPerDocument[_currentDocumentId];
        if (!context) {
            console.warn("Trying to process menu events for an unknown document with ID:", _currentDocumentId);
            return;
        }

        // Reset
        _menuClicked = false;

        // Toggle the state
        context.assetGenerationEnabled = !context.assetGenerationEnabled;
        updateMenuState();
        console.log("Asset generation is now " + (context.assetGenerationEnabled ? "enabled" : "disabled"));
    }

    function processEntireDocument() {
        _generator.getDocumentInfo().then(
            function (document) {
                if (document.id && !document.file) {
                    console.warn("WARNING: file information is missing from document.");
                }
                // Act as if everything has changed
                processChangesToDocument(document);
            },
            function (err) {
                _generator.publish("assets.error.getDocumentInfo", err);
            }
        ).done();
    }

    function processDocumentId(id) {
        if (_currentDocumentId === id) {
            return;
        }
        _currentDocumentId = id;
        updateMenuState();
    }

    function updateMenuState() {
        var context = _contextPerDocument[_currentDocumentId],
            enabled = context ? Boolean(context.assetGenerationEnabled) : false;

        console.log("Setting menu state to " + enabled);
        _generator.toggleMenu(MENU_ID, true, enabled);
    }

    function processChangesToDocument(document) {
        // Stop if the document isn't an object describing a menu (could be "[ActionDescriptor]")
        // Happens if no document is open, but maybe also at other times
        if (!document.id) {
            return;
        }
        
        var context = _contextPerDocument[document.id];
        
        if (!context) {
            context = _contextPerDocument[document.id] = {
                document: { id: document.id },
                layers: {},
                assetGenerationEnabled: false
            };
        }

        processDocumentId(document.id);

        // Now that we know the current document, we can actually process any menu clicks
        if (! _setupDone) {
            _setupDone = true;
            processMenuEvents();
        }

        // If there is a file name (e.g., after saving or when switching between files, even unsaved ones)
        if (document.file) {
            processPathChange(document);
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

    // Run the update now if none is in progress, or wait until the current one is finished
    function scheduleLayerUpdate(changeContext) {
        // If no update is scheduled or the scheduled update is still being delayed, start from scratch
        if (!changeContext.updateIsScheduled || changeContext.updateDelayTimeout) {
            changeContext.updateIsScheduled = true;
            clearTimeout(changeContext.updateDelayTimeout);

            changeContext.updateDelayTimeout = setTimeout(function () {
                changeContext.updateDelayTimeout = null;
                var finish = function () {
                    finishLayerUpdate(changeContext);
                };
                startLayerUpdate(changeContext).then(finish, finish).done();
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
            " (" + JSON.stringify(changeContext.layer.name || changeContext.layerContext.name) + ")"
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

        // TODO: Make sure this function is refactored so that it doesn't have so much
        // callback nesting. This function will change substantially when we move image
        // creation to core, so avoiding the refactor right now.
        function createLayerImage(pixmap, component) {
            var imageCreatedDeferred = Q.defer(),
                path = resolve(documentContext.assetGenerationDir, component.file);
            
            console.log("Generating " + path);

            // Create a temporary file name
            tmp.tmpName(function (err, tmpPath) {
                if (err) {
                    imageCreatedDeferred.reject(err);
                    return;
                }
                // Save the image in a temporary file
                convertImage(pixmap, tmpPath, component.extension, component.quality,
                            component.scale, component.width, component.height).then(
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
                                        // Yes, the notion of copying a file is too high level for Node.js
                                        fs.createReadStream(tmpPath).pipe(fs.createWriteStream(path));
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
            // Get the pixmap - but only once
            _generator.getPixmap(changeContext.layer.id, 100).then(
                function (pixmap) {
                    // Prevent an error after deleting a layer's contents, resulting in a 0x0 pixmap
                    if (pixmap.width === 0 || pixmap.height === 0) {
                        deleteLayerImages();
                        layerUpdatedDeferred.resolve();
                        return;
                    }
                    
                    var components = layerContext.validFileComponents;
                    var componentPromises = components.map(function (component) {
                        return createLayerImage(pixmap, component);
                    });

                    Q.allSettled(componentPromises).then(function (results) {
                        var errors = [];
                        results.forEach(function (result, i) {
                            if (result.state === "rejected") {
                                errors.push(components[i].name + ": " + result.reason);
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
                    reportErrorsToUser(["Failed to get pixmap: " + err]);
                    _generator.publish("assets.error.getPixmap", "Error: " + err);
                    layerUpdatedDeferred.reject(err);
                }
            );
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
                    //var name = subLayer.name || subLayerContext.name;
                    subLayerContext.parentLayerId = layer.id;
                });
            }
            // This layer doesn't have a parent (otherwise the event would have been for the parent)
            else if (layer.atRootOfChange) {
                delete layerContext.parentLayerId;
            }
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
            
            // Note .svg uses a different code path from the pixel-based formats
            if (layerContext.validFileComponents[0].extension === "svg") {
                console.log("Create SVG for layer[" + changeContext.layer.id + "]: " +
                            layerContext.validFileComponents[0].name);
                var params = { layerID: changeContext.layer.id };
                _generator.evaluateJSXFile("./jsx/layerSVG.jsx", params);
                // TODO: We should verify results here.
                layerUpdatedDeferred.resolve();
            }
            else {
                createLayerImages();
            }
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

        _generator.addMenuItem(MENU_ID, "Web Assets", true, false).then(
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

            processEntireDocument();
        }).done();
    }

    exports.init = init;

    // Unit test function exports
    exports.parseLayerName = parseLayerName;

}());