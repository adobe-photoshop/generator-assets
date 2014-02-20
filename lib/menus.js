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

    var documents = require("./documents"),
        contexts = require("./contexts"),
        utils = require("./utils");

    var MENU_ID = "assets",
        // Note to third-party plugin developers: This string format ("$$$...") is used for
        // localization of strings that are built in to Photoshop. Third-party plugins should
        // use a regular string (or use their own approach to localization) for menu labels.
        // The user's locale can be accessed with the getPhotoshopLocale() API call on the
        // Generator singleton.
        //
        // Note to Photoshop engineers: This zstring must be kept in sync with the zstring in
        // generate.jsx in the Photoshop repo.
        MENU_LABEL = "$$$/JavaScripts/Generator/ImageAssets/Menu=Image Assets";

    var _documentIdsWithMenuClicks = {};

    function handleGeneratorMenuClicked(event) {
        // Ignore changes to other menus
        var menu = event.generatorMenuChanged;
        if (!menu || menu.name !== MENU_ID) {
            return;
        }
        
        var startingMenuState = utils.generator.getMenuState(menu.name),
            currentDocumentId = documents.getCurrentDocumentId();

        console.log("Menu event %s, starting state %s", utils.stringify(event), utils.stringify(startingMenuState));
        _documentIdsWithMenuClicks[currentDocumentId || ""] = startingMenuState;
        
        // Before we know about the current document, we cannot reasonably process the events
        if (!currentDocumentId || !contexts.getContext(currentDocumentId)) {
            console.log("Processing menu event later because the current document is not yet loaded" +
                " (ID: " + currentDocumentId + ")");
            return;
        }

        var nowEnabledDocumentIds = processMenuEvents();
        nowEnabledDocumentIds.forEach(function (documentId) {
            documents.requestEntireDocument(documentId);
        });
    }

    function processMenuEvents() {
        var clickedDocumentIds = Object.keys(_documentIdsWithMenuClicks);
        if (clickedDocumentIds.length === 0) { return; }

        var nowEnabledDocumentIds = [],
            currentDocumentId = documents.getCurrentDocumentId();

        clickedDocumentIds.forEach(function (originalDocumentId) {
            var startingMenuState = _documentIdsWithMenuClicks[originalDocumentId];

            if (!originalDocumentId) {
                console.log("Interpreting menu event for unknown document" +
                    " as being for the current one (" + currentDocumentId + ")");
            }

            // Object keys are always strings, so convert them to integer first
            // If the event was used to start Generator, currentDocumentId was still undefined
            var documentId = parseInt(originalDocumentId, 10) || currentDocumentId;
            
            var context = contexts.getContext(documentId);
            
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
        documents.updateDocumentState();

        return nowEnabledDocumentIds;
    }

    function updateMenuState() {
        var currentDocumentId = documents.getCurrentDocumentId(),
            context = contexts.getContext(currentDocumentId),
            enabled = context ? Boolean(context.assetGenerationEnabled) : false;

        utils.generator.toggleMenu(MENU_ID, true, enabled);
    }

    function init() {
        utils.generator.addMenuItem(MENU_ID, MENU_LABEL, true, false).done();

        utils.generator.onPhotoshopEvent("generatorMenuChanged", handleGeneratorMenuClicked);
    }

    exports.init = init;
    exports.updateMenuState = updateMenuState;
    exports.processMenuEvents = processMenuEvents;

}());