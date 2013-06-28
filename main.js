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
    function convertImage(pixmap, filename, format, quality, scale) {
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

        var match = fileSpec.match(/^((\d+)% *)?(.+\.([a-z0-9]*[a-z]))(\-?(\d+%?))?$/i);
        if (match) {
            result.file      = match[3];
            result.extension = match[4].toLowerCase();
            if (typeof match[5] !== "undefined") {
                result.quality = match[6];
            }
            if (typeof match[1] !== "undefined") {
                result.scale = parseInt(match[2], 10) / 100;
            }
        }

        return result;
    }
    
    function testParseLayerName() {
        var layer1PNG = { name: "Layer 1.png", file: "Layer 1.png", extension: "png" };
        var layer2JPG = { name: "Layer 2.jpg", file: "Layer 2.jpg", extension: "jpg" };

        /* jshint maxlen: 160 */

        var spec = {
            // No extension specified
            "Layer 1":                    [{ name: "Layer 1" }],

            // Capital letters in the extension
            "Foo.JpG":                    [{ name: "Foo.JpG",      file: "Foo.JpG",  extension: "jpg" }],
            "Foo.JpEg":                   [{ name: "Foo.JpEg",     file: "Foo.JpEg", extension: "jpeg" }],
            "Foo.PnG":                    [{ name: "Foo.PnG",      file: "Foo.PnG",  extension: "png" }],
            
            // Good examples for JPGs with a quality parameter
            "foo.jpg-1":                  [{ name: "foo.jpg-1",    file: "foo.jpg",  extension: "jpg", quality: "1" }],
            "foo.jpg4":                   [{ name: "foo.jpg4",     file: "foo.jpg",  extension: "jpg", quality: "4" }],
            "foo.jpg-10":                 [{ name: "foo.jpg-10",   file: "foo.jpg",  extension: "jpg", quality: "10" }],
            "foo.jpg-1%":                 [{ name: "foo.jpg-1%",   file: "foo.jpg",  extension: "jpg", quality: "1%" }],
            "foo.jpg42%":                 [{ name: "foo.jpg42%",   file: "foo.jpg",  extension: "jpg", quality: "42%" }],
            "foo.jpg-100%":               [{ name: "foo.jpg-100%", file: "foo.jpg",  extension: "jpg", quality: "100%" }],
            
            // Bad examples for JPGs with a quality parameter
            "foo.jpg-0":                  [{ name: "foo.jpg-0",    file: "foo.jpg",  extension: "jpg", quality: "0" }],
            "foo.jpg-11":                 [{ name: "foo.jpg-11",   file: "foo.jpg",  extension: "jpg", quality: "11" }],
            "foo.jpg-0%":                 [{ name: "foo.jpg-0%",   file: "foo.jpg",  extension: "jpg", quality: "0%" }],
            "foo.jpg-101%":               [{ name: "foo.jpg-101%", file: "foo.jpg",  extension: "jpg", quality: "101%" }],
            
            // Good examples for PNGs with a quality parameter
            "foo.png-8":                  [{ name: "foo.png-8",    file: "foo.png",  extension: "png", quality: "8" }],
            "foo.png24":                  [{ name: "foo.png24",    file: "foo.png",  extension: "png", quality: "24" }],
            "foo.png-32":                 [{ name: "foo.png-32",   file: "foo.png",  extension: "png", quality: "32" }],

            // Bad example for a PNG with a quality parameter
            "foo.png-42":                 [{ name: "foo.png-42",   file: "foo.png",  extension: "png", quality: "42" }],

            // Good examples for a scale factor
            "1% foo.png":                 [{ name: "1% foo.png",   file: "foo.png",  extension: "png", scale: 0.01 }],
            "42% foo.png":                [{ name: "42% foo.png",  file: "foo.png",  extension: "png", scale: 0.42 }],
            "100% foo.png":               [{ name: "100% foo.png", file: "foo.png",  extension: "png", scale: 1.00 }],
            "142% foo.png":               [{ name: "142% foo.png", file: "foo.png",  extension: "png", scale: 1.42 }],
            
            // Bad examples for a scale factor
            "0% foo.png":                 [{ name: "0% foo.png",   file: "foo.png",  extension: "png", scale: 0}],
            "05% foo.png":                [{ name: "05% foo.png",  file: "foo.png",  extension: "png", scale: 0.05}],
            "1%foo.png":                  [{ name: "1%foo.png",    file: "foo.png",  extension: "png", scale: 0.01 }],
            
            // Space in file name
            "Layer 1.png":                [layer1PNG],
            
            // Comma as separator
            "Layer 1.png,Layer 2.jpg":    [layer1PNG, layer2JPG],
            "Layer 1.png,   Layer 2.jpg": [layer1PNG, layer2JPG],
            
            // Plus as separator
            "Layer 1.png+Layer 2.jpg":    [layer1PNG, layer2JPG],
            "Layer 1.png  + Layer 2.jpg": [layer1PNG, layer2JPG],

            // Putting it all together
            "100% Delicious, 42%Layer 1.png24  + Layer.jpg-90% , 250% Foo Bar Baz.gif": [
                { name: "100% Delicious" },
                { name: "42%Layer 1.png24",     file: "Layer 1.png",     extension: "png", quality: "24", scale: 0.42 },
                { name: "Layer.jpg-90%",         file: "Layer.jpg",       extension: "jpg", quality: "90%" },
                { name: "250% Foo Bar Baz.gif", file: "Foo Bar Baz.gif", extension: "gif", scale: 2.5 }
            ],
        };

        /* jshint maxlen: 120 */

        Object.keys(spec).forEach(function (layerName) {
            var actual   = JSON.stringify(parseLayerName(layerName)),
                expected = JSON.stringify(spec[layerName]);
            
            if (actual !== expected) {
                console.log("Error when parsing layer name \"" + layerName + "\"");
                console.log("    Expected:", expected);
                console.log("      Actual:", actual);
            }
        });
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
            if (component.extension === "jpeg") {
                component.extension = "jpg";
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
            var text = "[" + new Date() + "]\n" + errors.join("\n") + "\n\n";
            fs.appendFileSync(resolve(documentContext.assetGenerationDir, "errors.txt"), text);
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
            while (layers.length) {
                var layer = layers.shift();
                pendingPromises.push(processLayerChange(document, layer));
                if (layer.layers) {
                    layers.push.apply(layers, layer.layers);
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
                convertImage(pixmap, tmpPath, component.extension, component.quality, component.scale).then(
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
                                fs.rename(tmpPath, path, function (err) {
                                    if (err) {
                                        imageCreatedDeferred.reject(err);
                                    } else {
                                        layerContext.generatedFiles[path] = true;
                                        imageCreatedDeferred.resolve();
                                    }
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

        testParseLayerName();

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

}());