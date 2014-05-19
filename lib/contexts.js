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
        pathLib  = require("path"),
        resolve  = pathLib.resolve,
        extname  = pathLib.extname,
        basename = pathLib.basename,
        dirname  = pathLib.dirname;

    // TODO: Once we get the layer change management/updating right, we should add a
    // big comment at the top of this file explaining how this all works. In particular
    // we should explain what contexts are, and how we manage scheduling updates.
    var _contextPerDocument = {};

    // For unsaved files
    var _fallbackBaseDirectory = null;

    function updatePathInfoForDocument(document) {
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
            // The relative path of the directory to store generated assets in
            relativeAssetGenerationDir;

        if(utils.config && utils.config.hasOwnProperty("asset-generation-dir")) {
            relativeAssetGenerationDir = utils.config["asset-generation-dir"];
        } else {
            relativeAssetGenerationDir = documentName + "-assets";
        }

        // The full path of the directory to store generated assets in
        var assetGenerationDir = baseDirectory ? resolve(baseDirectory, relativeAssetGenerationDir) : null;

        context.path               = path;
        context.isSaved            = isSaved;
        context.assetGenerationDir = assetGenerationDir;
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

        return context;
    }

    function getContext(documentId) {
        return _contextPerDocument[documentId];
    }

    function setContext(documentId, context) {
        _contextPerDocument[documentId] = context;
    }

    function clearContext(documentId) {
        delete _contextPerDocument[documentId];
    }

    function initFallbackBaseDirectory() {
        // First, check whether we can retrieve the user's home directory
        var homeDirectory = process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"];

        if (homeDirectory) {
            _fallbackBaseDirectory = resolve(homeDirectory, "Desktop");
        } else {
            console.error("[Assets] Error in init: " +
                "Could not locate home directory in env vars, no assets will be dumped for unsaved files"
            );
        }
    }

    initFallbackBaseDirectory();

    exports.getContext = getContext;
    exports.setContext = setContext;
    exports.clearContext = clearContext;
    exports.resetDocumentContext = resetDocumentContext;
    exports.updatePathInfoForDocument = updatePathInfoForDocument;
}());